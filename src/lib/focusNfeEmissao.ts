// Emissão de NF-e de SAÍDA via Focus NFe — "venda para entrega futura": NF1 (CFOP 5922,
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
};

export type ItemFiscal = { descricao: string; ncm: string; quantidade: number; valorUnitario: number };

function digitos(v: string | null | undefined) { return (v || '').replace(/\D/g, ''); }

function ehPessoaFisica(doc: string) { return digitos(doc).length === 11; }

function itensPayload(itens: ItemFiscal[], cfop: string) {
  return itens.map((item, idx) => ({
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
    valor_bruto: Number((item.quantidade * item.valorUnitario).toFixed(2)),
    icms_origem: 0,
    icms_situacao_tributaria: '400',
    pis_situacao_tributaria: '08',
    cofins_situacao_tributaria: '08',
  }));
}

function baseComum(emitente: EmitenteFiscal, destinatario: DestinatarioFiscal) {
  const pf = ehPessoaFisica(destinatario.cnpjOuCpf);
  return {
    natureza_operacao: '',
    data_emissao: new Date().toISOString(),
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
    municipio_emitente: emitente.municipio,
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
    municipio_destinatario: destinatario.municipio,
    uf_destinatario: destinatario.uf,
    cep_destinatario: destinatario.cep ? digitos(destinatario.cep) : undefined,
    pais_destinatario: 'Brasil',
    codigo_pais_destinatario: '1058',
    telefone_destinatario: destinatario.telefone ? digitos(destinatario.telefone) : undefined,
    email_destinatario: destinatario.email || undefined,
    indicador_inscricao_estadual_destinatario: 9, // 9 = não contribuinte

    modalidade_frete: 9, // 9 = sem frete
  };
}

// NF1 — simples faturamento, valor cheio, CFOP 5922/6922 (mesmo código nos dois estados).
export function montarPayloadNF1(params: {
  emitente: EmitenteFiscal; destinatario: DestinatarioFiscal; itens: ItemFiscal[];
}) {
  const cfop = '5922';
  return {
    ...baseComum(params.emitente, params.destinatario),
    natureza_operacao: 'Lançamento efetuado para entrega futura',
    items: itensPayload(params.itens, cfop),
  };
}

// NF2 — remessa na entrega, CFOP 5116 (mesmo estado) ou 6116 (outro estado), referenciando
// a chave da NF1. Repete o mesmo valor/itens da NF1 (padrão de mercado pra entrega futura).
export function montarPayloadNF2(params: {
  emitente: EmitenteFiscal; destinatario: DestinatarioFiscal; itens: ItemFiscal[]; chaveNf1: string;
}) {
  const cfop = params.emitente.uf === params.destinatario.uf ? '5116' : '6116';
  return {
    ...baseComum(params.emitente, params.destinatario),
    natureza_operacao: 'Remessa de mercadoria em venda para entrega futura',
    notas_referenciadas: [{ chave_nfe: params.chaveNf1 }],
    items: itensPayload(params.itens, cfop),
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
