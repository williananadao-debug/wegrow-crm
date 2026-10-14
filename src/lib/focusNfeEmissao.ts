// Emissão de NF-e de SAÍDA via Focus NFe — "venda para entrega futura": NF1 (CFOP 5922/6922,
// simples faturamento, valor cheio) na hora da venda + NF2 (CFOP 5116/6116, remessa,
// referenciando a chave da NF1) na hora da entrega. Layout de campos verificado contra um
// DANFE real já emitido pela Trailer Travel (nota nº 49, 27/08/2026), não é chute.
//
// CFOP da NF2: 5116 = mesmo estado do emitente (produção própria, dentro de SC); 6116 =
// estado diferente. NUNCA 5117/6117 — esses são pra mercadoria comprada de terceiro pra
// revenda, não pra quem fabrica o próprio produto (confirmado via focusnfe.com.br/blog).
//
// Emissão no Focus NFe é assíncrona: o POST aqui só entra na fila ("processando"); o
// status final (autorizado/erro) chega depois pelo webhook /api/webhooks/focus-nfe/emitida,
// que já existia antes disso — reaproveitado, não duplicado.

import { baseUrl, headerAuth, type FocusNfeAmbiente } from '@/lib/focusNfe';

export type EmitenteFiscal = {
  cnpj: string; nome: string; ie: string; im: string | null;
  endereco: string; numero: string; bairro: string; cep: string;
  municipio: string; codigoMunicipio: string; uf: string;
  telefone: string | null; email: string | null; regimeTributario: string | null;
};

export type DestinatarioFiscal = {
  nome: string; cnpjOuCpf: string; endereco: string; numero: string | null; bairro: string | null;
  cep: string | null; municipio: string; uf: string; telefone: string | null; email: string | null;
  // clientes.inscricao_estadual — número = contribuinte; "ISENTO"/vazio = não contribuinte.
  ie?: string | null;
};

export type ItemFiscal = { descricao: string; ncm: string; quantidade: number; valorUnitario: number };

function digitos(v: string | null | undefined) { return (v || '').replace(/\D/g, ''); }

function ehPessoaFisica(doc: string) { return digitos(doc).length === 11; }

// Contribuinte de ICMS = PJ com inscrição estadual numérica.
export function ehContribuinte(dest: DestinatarioFiscal) {
  return !ehPessoaFisica(dest.cnpjOuCpf) && digitos(dest.ie).length >= 2;
}

// Regras passadas pela contabilidade da Trailer Travel (Simples Nacional, Anexo II, 08/10/2026):
// - Faturamento/venda (5922/6922, 5101/6101): CSOSN 102; se o cliente for contribuinte (PJ com
//   IE), CSOSN 101 com crédito de ICMS na alíquota efetiva do Simples (art. 23 LC 123/06).
// - Remessa da entrega futura (5116/6116): CSOSN 400.
// - PIS/COFINS CST 08; IPI não destaca; sem ICMS-ST; Simples dispensado de DIFAL.
export type Tributacao = { csosn: '101' | '102' | '400'; aliquotaCredito: number | null };

export function tributacaoPorCfop(cfop: string, dest: DestinatarioFiscal, aliquotaSimples: number | null): Tributacao {
  if (cfop.endsWith('116')) return { csosn: '400', aliquotaCredito: null };
  if (ehContribuinte(dest)) {
    if (!aliquotaSimples || aliquotaSimples <= 0) {
      throw new Error('Cliente com inscrição estadual exige CSOSN 101 com a alíquota do Simples — configure a alíquota em Notas Fiscais (botão "Alíquota do Simples").');
    }
    return { csosn: '101', aliquotaCredito: aliquotaSimples };
  }
  return { csosn: '102', aliquotaCredito: null };
}

function itensPayload(itens: ItemFiscal[], cfop: string, trib: Tributacao) {
  return itens.map((item, idx) => {
    const valorBruto = Number((item.quantidade * item.valorUnitario).toFixed(2));
    return {
      numero_item: idx + 1,
      codigo_produto: String(idx + 1).padStart(3, '0'),
      descricao: item.descricao,
      codigo_ncm: item.ncm,
      cfop,
      unidade_comercial: 'UN',
      quantidade_comercial: item.quantidade,
      valor_unitario_comercial: item.valorUnitario,
      unidade_tributavel: 'UN',
      quantidade_tributavel: item.quantidade,
      valor_unitario_tributavel: item.valorUnitario,
      valor_bruto: valorBruto,
      icms_origem: 0,
      icms_situacao_tributaria: trib.csosn,
      ...(trib.csosn === '101' && trib.aliquotaCredito ? creditoSimples(valorBruto, trib.aliquotaCredito) : {}),
      pis_situacao_tributaria: '08',
      cofins_situacao_tributaria: '08',
    };
  });
}

function creditoSimples(valor: number, aliquota: number) {
  return {
    icms_aliquota_credito_simples: aliquota,
    icms_valor_credito_simples: Number((valor * aliquota / 100).toFixed(2)),
  };
}

// Lei 12.741/2012 — valor aproximado dos tributos (percentual da tabela IBPT, definido pela empresa).
function valorTributosAprox(valor: number, percentual: number | null | undefined) {
  return percentual && percentual > 0 ? Number((valor * percentual / 100).toFixed(2)) : null;
}
function textoTributosAprox(valor: number, percentual: number | null | undefined) {
  const v = valorTributosAprox(valor, percentual);
  if (v == null) return null;
  return `Valor aproximado dos tributos: R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${percentual!.toLocaleString('pt-BR')}%). Fonte: IBPT (Lei 12.741/2012).`;
}
function comTributosAprox<T extends { valor_bruto: number }>(itens: T[], percentual: number | null | undefined) {
  return itens.map(i => {
    const v = valorTributosAprox(i.valor_bruto, percentual);
    return v == null ? i : { ...i, valor_total_tributos: v };
  });
}

function textoCredito(valor: number, trib: Tributacao) {
  if (trib.csosn !== '101' || !trib.aliquotaCredito) return null;
  const credito = (valor * trib.aliquotaCredito / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `Permite o aproveitamento do crédito de ICMS no valor de R$ ${credito}, correspondente à alíquota de ${trib.aliquotaCredito.toLocaleString('pt-BR')}%, nos termos do art. 23 da LC 123/2006.`;
}

const UF_POR_NOME: Record<string, string> = {
  ACRE: 'AC', ALAGOAS: 'AL', AMAPA: 'AP', AMAZONAS: 'AM', BAHIA: 'BA', CEARA: 'CE', 'DISTRITO FEDERAL': 'DF',
  'ESPIRITO SANTO': 'ES', GOIAS: 'GO', MARANHAO: 'MA', 'MATO GROSSO': 'MT', 'MATO GROSSO DO SUL': 'MS',
  'MINAS GERAIS': 'MG', PARA: 'PA', PARAIBA: 'PB', PARANA: 'PR', PERNAMBUCO: 'PE', PIAUI: 'PI',
  'RIO DE JANEIRO': 'RJ', 'RIO GRANDE DO NORTE': 'RN', 'RIO GRANDE DO SUL': 'RS', RONDONIA: 'RO', RORAIMA: 'RR',
  'SANTA CATARINA': 'SC', 'SAO PAULO': 'SP', SERGIPE: 'SE', TOCANTINS: 'TO',
};
const UFS = new Set(Object.values(UF_POR_NOME));

// Cadastro de cliente guarda o estado do jeito que digitaram ("sc", "Santa Catarina", "SC - Brasil").
// A SEFAZ só aceita a sigla em maiúsculas — devolve null quando não dá pra reconhecer.
export function normalizarUf(estado: unknown): string | null {
  const t = String(estado ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if (UFS.has(t)) return t;
  if (UF_POR_NOME[t]) return UF_POR_NOME[t];
  const sigla = t.split(' ').find(p => UFS.has(p));
  if (sigla) return sigla;
  const nome = Object.keys(UF_POR_NOME).sort((a, b) => b.length - a.length).find(n => t.includes(n));
  return nome ? UF_POR_NOME[nome] : null;
}

// Horário de Brasília com offset (-03:00) — com "Z" (UTC) a DANFE mostrava a hora 3h adiantada.
function agoraBrasilia() {
  const d = new Date(Date.now() - 3 * 3600 * 1000);
  return d.toISOString().slice(0, 19) + '-03:00';
}

// SEFAZ/DANFE: município em maiúsculas, sem depender de como digitaram no cadastro.
function municipioMaiusculo(m: string | null | undefined) {
  return String(m || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function baseComum(emitente: EmitenteFiscal, destinatario: DestinatarioFiscal) {
  const pf = ehPessoaFisica(destinatario.cnpjOuCpf);
  const ieDest = digitos(destinatario.ie);
  const contribuinte = ehContribuinte(destinatario);
  const isento = !pf && !contribuinte && /isent/i.test(destinatario.ie || '');
  return {
    natureza_operacao: '',
    data_emissao: agoraBrasilia(),
    // Data/hora de saída da mercadoria (campo "Hora da saída" da DANFE).
    data_entrada_saida: agoraBrasilia(),
    tipo_documento: 1, // 1 = saída
    finalidade_emissao: 1, // 1 = normal
    presenca_comprador: 9, // 9 = não se aplica (venda sob encomenda, sem presença física no ato)
    local_destino: emitente.uf === destinatario.uf ? 1 : 2, // 1 = operação interna, 2 = interestadual

    cnpj_emitente: digitos(emitente.cnpj),
    nome_emitente: emitente.nome,
    nome_fantasia_emitente: emitente.nome,
    inscricao_estadual_emitente: emitente.ie,
    inscricao_municipal_emitente: emitente.im || undefined,
    logradouro_emitente: emitente.endereco,
    numero_emitente: emitente.numero,
    bairro_emitente: emitente.bairro,
    municipio_emitente: municipioMaiusculo(emitente.municipio),
    uf_emitente: emitente.uf,
    cep_emitente: digitos(emitente.cep),
    codigo_municipio_emitente: emitente.codigoMunicipio,
    telefone_emitente: emitente.telefone ? digitos(emitente.telefone) : undefined,
    regime_tributario_emitente: Number(emitente.regimeTributario || '1'),

    [pf ? 'cpf_destinatario' : 'cnpj_destinatario']: digitos(destinatario.cnpjOuCpf),
    nome_destinatario: destinatario.nome,
    logradouro_destinatario: destinatario.endereco,
    numero_destinatario: destinatario.numero || 'S/N',
    bairro_destinatario: destinatario.bairro || undefined,
    municipio_destinatario: municipioMaiusculo(destinatario.municipio),
    uf_destinatario: destinatario.uf,
    cep_destinatario: destinatario.cep ? digitos(destinatario.cep) : undefined,
    pais_destinatario: 'Brasil',
    codigo_pais_destinatario: '1058',
    telefone_destinatario: destinatario.telefone ? digitos(destinatario.telefone) : undefined,
    email_destinatario: destinatario.email || undefined,
    // 1 = contribuinte (com IE), 2 = isento de IE, 9 = não contribuinte.
    indicador_inscricao_estadual_destinatario: contribuinte ? 1 : isento ? 2 : 9,
    inscricao_estadual_destinatario: contribuinte ? ieDest : undefined,

    modalidade_frete: 9, // 9 = sem frete
    // Mesmo texto que sai nas notas da Trailer Travel (NF 49) — obrigatório pro Simples.
    informacoes_adicionais_contribuinte: Number(emitente.regimeTributario || '1') === 1 ? SIMPLES_NACIONAL : undefined,
  };
}

const SIMPLES_NACIONAL = 'Empresa optante pelo Simples Nacional LC 123/06.';

function juntarInfo(...partes: (string | null | undefined)[]) {
  return partes.filter(Boolean).join(' ') || undefined;
}

// NF1 — simples faturamento, valor cheio, CFOP 5922 (dentro de SC) / 6922 (outro estado).
export function montarPayloadNF1(params: {
  emitente: EmitenteFiscal; destinatario: DestinatarioFiscal; itens: ItemFiscal[]; aliquotaSimples: number | null;
  tributosAprox?: number | null;
}) {
  const cfop = params.emitente.uf === params.destinatario.uf ? '5922' : '6922';
  const trib = tributacaoPorCfop(cfop, params.destinatario, params.aliquotaSimples);
  const base = baseComum(params.emitente, params.destinatario);
  const total = params.itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);
  return {
    ...base,
    natureza_operacao: 'Lançamento efetuado para entrega futura',
    informacoes_adicionais_contribuinte: juntarInfo(base.informacoes_adicionais_contribuinte, textoCredito(total, trib), textoTributosAprox(total, params.tributosAprox)),
    items: comTributosAprox(itensPayload(params.itens, cfop, trib), params.tributosAprox),
  };
}

// Venda normal (entrega na hora) — uma NF só. Produção própria 5101 / revenda 5102; outro
// estado: 6101/6102 pra contribuinte, 6107/6108 pra não contribuinte (consumidor final).
// Mesma tributação da NF1 (CSOSN 102, ou 101 com crédito se o cliente tem IE).
export function cfopVendaNormal(emitente: EmitenteFiscal, destinatario: DestinatarioFiscal, origem: 'producao' | 'revenda') {
  const revenda = origem === 'revenda';
  if (emitente.uf === destinatario.uf) return revenda ? '5102' : '5101';
  if (ehContribuinte(destinatario)) return revenda ? '6102' : '6101';
  return revenda ? '6108' : '6107';
}

export function montarPayloadVendaNormal(params: {
  emitente: EmitenteFiscal; destinatario: DestinatarioFiscal; itens: ItemFiscal[]; aliquotaSimples: number | null;
  origem: 'producao' | 'revenda'; tributosAprox?: number | null; modalidadeFrete?: ModalidadeFrete;
}) {
  const cfop = cfopVendaNormal(params.emitente, params.destinatario, params.origem);
  const trib = tributacaoPorCfop(cfop, params.destinatario, params.aliquotaSimples);
  const base = baseComum(params.emitente, params.destinatario);
  const total = params.itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);
  return {
    ...base,
    natureza_operacao: naturezaPorCfop(cfop),
    modalidade_frete: params.modalidadeFrete ?? 9,
    informacoes_adicionais_contribuinte: juntarInfo(base.informacoes_adicionais_contribuinte, textoCredito(total, trib), textoTributosAprox(total, params.tributosAprox)),
    items: comTributosAprox(itensPayload(params.itens, cfop, trib), params.tributosAprox),
  };
}

// NF2 — remessa na entrega, CFOP 5116 (mesmo estado) ou 6116 (outro estado), CSOSN 400,
// referenciando a chave da NF1. Repete o mesmo valor/itens da NF1 (padrão de mercado pra entrega futura).
export function montarPayloadNF2(params: {
  emitente: EmitenteFiscal; destinatario: DestinatarioFiscal; itens: ItemFiscal[]; chaveNf1: string;
  chavesComplementares?: string[]; modalidadeFrete?: ModalidadeFrete;
}) {
  const cfop = params.emitente.uf === params.destinatario.uf ? '5116' : '6116';
  return {
    ...baseComum(params.emitente, params.destinatario),
    natureza_operacao: 'Remessa de mercadoria em venda para entrega futura',
    modalidade_frete: params.modalidadeFrete ?? 9,
    // NF complementar de valor da NF1 também é referenciada na remessa.
    notas_referenciadas: [params.chaveNf1, ...(params.chavesComplementares || [])].map(chave_nfe => ({ chave_nfe })),
    items: itensPayload(params.itens, cfop, { csosn: '400', aliquotaCredito: null }),
  };
}

// Natureza da operação da complementar = a da nota original (mesmo CFOP).
export function naturezaPorCfop(cfop: string) {
  if (cfop === '5922' || cfop === '6922') return 'Lançamento efetuado para entrega futura';
  if (cfop === '5116' || cfop === '6116') return 'Remessa de mercadoria em venda para entrega futura';
  if (cfop === '5915' || cfop === '6915') return 'Remessa para conserto';
  if (['5101', '6101', '6107'].includes(cfop)) return 'Venda de produção do estabelecimento';
  if (['5102', '6102', '6108'].includes(cfop)) return 'Venda de mercadoria adquirida de terceiros';
  return 'Complemento de valor';
}

// 0 = por conta do emitente, 1 = do destinatário, 9 = sem frete (entrega/retirada própria).
export type ModalidadeFrete = 0 | 1 | 9;
export function lerModalidadeFrete(v: unknown): ModalidadeFrete {
  const n = Number(v);
  return n === 0 || n === 1 ? n : 9;
}

// NF avulsa de REMESSA PARA CONSERTO (inclusive envio em garantia): CFOP 5915 (dentro do
// estado) / 6915 (outro estado), CSOSN 400 — sem destaque de ICMS na remessa (Simples).
// Quem conserta devolve com a nota de retorno (5916/6916) dele; aqui não sai nada na volta.
// chaveReferenciada = NF de compra da peça (ajuda o fornecedor a localizar a garantia).
export function montarPayloadRemessaConserto(params: {
  emitente: EmitenteFiscal; destinatario: DestinatarioFiscal; itens: ItemFiscal[];
  chaveReferenciada?: string | null; observacao?: string | null; modalidadeFrete: ModalidadeFrete;
}) {
  const cfop = params.emitente.uf === params.destinatario.uf ? '5915' : '6915';
  const base = baseComum(params.emitente, params.destinatario);
  return {
    ...base,
    natureza_operacao: 'Remessa para conserto',
    presenca_comprador: 0, // 0 = não se aplica (não é venda)
    modalidade_frete: params.modalidadeFrete,
    informacoes_adicionais_contribuinte: juntarInfo(base.informacoes_adicionais_contribuinte, params.observacao),
    ...(params.chaveReferenciada ? { notas_referenciadas: [{ chave_nfe: params.chaveReferenciada }] } : {}),
    items: itensPayload(params.itens, cfop, { csosn: '400', aliquotaCredito: null }),
  };
}

// NF-e complementar de VALOR (finalidade 2): referencia a chave da nota original, mesmo CFOP
// dela, e leva só a diferença. Quantidade 0 — complemento de preço não acrescenta unidade
// (a regra 629 da SEFAZ, vProd = qCom × vUnCom, só vale pra finalidade 1).
export function montarPayloadComplementar(params: {
  emitente: EmitenteFiscal; destinatario: DestinatarioFiscal; chaveOrigem: string;
  cfop: string; descricao: string; ncm: string; valor: number; aliquotaSimples: number | null;
}) {
  const trib = tributacaoPorCfop(params.cfop, params.destinatario, params.aliquotaSimples);
  const valor = Number(params.valor.toFixed(2));
  const [item] = itensPayload([{ descricao: params.descricao, ncm: params.ncm, quantidade: 0, valorUnitario: 0 }], params.cfop, trib);
  const base = baseComum(params.emitente, params.destinatario);
  return {
    ...base,
    informacoes_adicionais_contribuinte: juntarInfo(base.informacoes_adicionais_contribuinte, textoCredito(valor, trib), `NF-e complementar de valor referente a NF-e chave ${params.chaveOrigem}.`),
    finalidade_emissao: 2, // 2 = complementar
    natureza_operacao: naturezaPorCfop(params.cfop),
    notas_referenciadas: [{ chave_nfe: params.chaveOrigem }],
    items: [{ ...item, valor_bruto: valor, ...(trib.csosn === '101' && trib.aliquotaCredito ? creditoSimples(valor, trib.aliquotaCredito) : {}) }],
  };
}

export type ResultadoEmissao = { ref: string; status: number; corpo: any };

// POST /v2/nfe?ref=X — entra na fila do Focus NFe. Resposta imediata só confirma que foi
// aceita pra processamento (status inicial "processando_autorizacao"); o resultado final
// (autorizado/erro) chega pelo webhook, não por aqui.
export async function emitirNota(
  token: string, ambiente: FocusNfeAmbiente, ref: string, payload: Record<string, unknown>
): Promise<ResultadoEmissao> {
  const res = await fetch(`${baseUrl(ambiente)}/v2/nfe?ref=${encodeURIComponent(ref)}`, {
    method: 'POST',
    headers: { ...headerAuth(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const corpo = await res.json().catch(() => null);
  return { ref, status: res.status, corpo };
}

// DELETE /v2/nfe/{ref} — cancela uma NF-e autorizada (SEFAZ aceita em até 24h da
// autorização; depois disso a própria SEFAZ recusa e devolve o motivo). Justificativa
// obrigatória, 15 a 255 caracteres. Resposta: { status: "cancelado", mensagem_sefaz, ... }.
export async function cancelarNota(
  token: string, ambiente: FocusNfeAmbiente, ref: string, justificativa: string
): Promise<ResultadoEmissao> {
  const res = await fetch(`${baseUrl(ambiente)}/v2/nfe/${encodeURIComponent(ref)}`, {
    method: 'DELETE',
    headers: { ...headerAuth(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ justificativa }),
  });
  const corpo = await res.json().catch(() => null);
  return { ref, status: res.status, corpo };
}
