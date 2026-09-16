// Cliente mínimo pra API de NFe recebidas do Focus NFe — usado tanto pelo webhook
// (nota nova, uma de cada vez) quanto pelo backfill (histórico inteiro, paginado).
// Server-side only: token de produção nunca pode chegar no navegador do cliente.

import type { SupabaseClient } from '@supabase/supabase-js';
import { acharServicoParecido } from '@/lib/matchProduto';
import { extrairItensXmlNfe } from '@/lib/nfeXmlParser';
export { extrairItensXmlNfe } from '@/lib/nfeXmlParser';

export type FocusNfeAmbiente = 'producao' | 'homologacao';

// Exportado — reaproveitado pelo webhook de nota emitida (server-side) pra montar tanto a
// URL da chamada de consulta (GET /v2/nfe/{ref}) quanto pra completar caminho_danfe/
// caminho_xml_nota_fiscal, que a Focus NFe manda como path relativo, não URL completa.
export function baseUrl(ambiente: FocusNfeAmbiente) {
  return ambiente === 'producao' ? 'https://api.focusnfe.com.br' : 'https://homologacao.focusnfe.com.br';
}

// Basic Auth do Focus NFe: usuário = token, senha em branco.
function headerAuth(token: string) {
  return { Authorization: `Basic ${Buffer.from(`${token}:`).toString('base64')}` };
}

export { headerAuth };

export type NfeRecebidaResumo = {
  nome_emitente: string | null;
  documento_emitente: string | null;
  chave_nfe: string;
  valor_total: string | number | null;
  data_emissao: string | null;
  situacao: string | null;
  nfe_completa?: boolean; // true = XML completo já disponível pra download; false = ainda não, nem tenta baixar
  versao: number;
};

export function aguardar(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// GET /v2/nfes_recebidas — lista TODO o histórico contra o CNPJ, sem filtro de data.
// Pagina por "versao": cada chamada devolve até 100 registros com versao > desde; o
// header X-Max-Version da resposta diz o corte pra pedir a próxima página. Loop até a
// resposta vir vazia (não tem mais nada depois desse ponto).
//
// A API devolve uma LINHA POR EVENTO, não uma linha por nota — a mesma chave aparece
// várias vezes (ex: uma vez com nfe_completa=false, de novo quando o XML completo fica
// pronto). Sem dedupe aqui, cada nota vira várias linhas de fiscal_notas duplicadas.
// Dedupe mantém só a versão mais alta (mais recente) de cada chave.
export async function listarNfesRecebidas(
  token: string, ambiente: FocusNfeAmbiente, cnpj: string
): Promise<NfeRecebidaResumo[]> {
  const todas: NfeRecebidaResumo[] = [];
  let desde = 0;
  for (let pagina = 0; pagina < 200; pagina++) { // trava de segurança — 200*100 = 20 mil eventos
    const url = new URL(`${baseUrl(ambiente)}/v2/nfes_recebidas`);
    url.searchParams.set('cnpj', cnpj.replace(/\D/g, ''));
    if (desde > 0) url.searchParams.set('versao', String(desde));
    const res = await fetch(url.toString(), { headers: headerAuth(token) });
    if (!res.ok) throw new Error(`Focus NFe respondeu ${res.status} ao listar notas recebidas.`);
    const pagina_dados: NfeRecebidaResumo[] = await res.json();
    if (!Array.isArray(pagina_dados) || pagina_dados.length === 0) break;
    todas.push(...pagina_dados);
    const maxVersaoHeader = res.headers.get('X-Max-Version');
    const proximo = maxVersaoHeader ? Number(maxVersaoHeader) : Math.max(...pagina_dados.map(n => n.versao));
    if (!proximo || proximo <= desde) break;
    desde = proximo;
    if (pagina_dados.length < 100) break; // veio menos que o máximo, acabou o histórico
  }

  const maisRecentePorChave = new Map<string, NfeRecebidaResumo>();
  for (const evento of todas) {
    const atual = maisRecentePorChave.get(evento.chave_nfe);
    if (!atual || evento.versao > atual.versao) maisRecentePorChave.set(evento.chave_nfe, evento);
  }
  return Array.from(maisRecentePorChave.values());
}

// POST /v2/nfes_recebidas/{chave}/manifesto — "ciência da operação". A SEFAZ cobra isso
// dentro de um prazo; sem manifestar, o XML completo da nota não fica disponível pra
// download. Idempotente o bastante pra chamar de novo sem problema se já foi manifestada.
export async function manifestarCiencia(token: string, ambiente: FocusNfeAmbiente, chave: string): Promise<void> {
  await fetch(`${baseUrl(ambiente)}/v2/nfes_recebidas/${chave}/manifesto`, {
    method: 'POST',
    headers: { ...headerAuth(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo: 'ciencia' }),
  });
}

// GET /v2/nfes_recebidas/{chave}.xml — XML completo da nota, com os itens. Devolve o
// status HTTP junto — quem chama decide se vale tentar de novo depois (204/404 = XML
// ainda não ficou pronto, tenta no próximo backfill; 429 = estourou rate limit, para de
// insistir na hora e deixa pra próxima leva).
export async function baixarXmlNfeRecebida(
  token: string, ambiente: FocusNfeAmbiente, chave: string
): Promise<{ xml: string | null; status: number }> {
  const res = await fetch(`${baseUrl(ambiente)}/v2/nfes_recebidas/${chave}.xml`, { headers: headerAuth(token) });
  if (!res.ok) return { xml: null, status: res.status };
  return { xml: await res.text(), status: res.status };
}

// Cria o lançamento financeiro (conta a pagar) de uma nota de entrada e liga de volta em
// fiscal_notas.lancamento_id. Compartilhado entre o webhook (nota nova, chegando na hora)
// e o backfill (histórico) — decisão de 2026-09-10: TODA nota de entrada vira conta a
// pagar 'pendente', inclusive histórico; quem cuida do financeiro marca como paga na mão
// as que já foram quitadas. Vencimento não vem no payload/XML da NF-e (isso é duplicata,
// não faz parte do evento em si) — D+30 da emissão é só uma estimativa, ajustável depois.
export async function criarLancamentoNotaEntrada(db: SupabaseClient, params: {
  empresaId: string; notaId: number; valorTotal: number;
  nomeParticipante: string | null; cnpjParticipante: string | null;
  numero: string | null; serie: string | null; chaveAcesso: string | null; dataEmissao: string | null;
}): Promise<void> {
  const dataBase = params.dataEmissao ? new Date(params.dataEmissao) : new Date();
  const vencimento = new Date(dataBase);
  vencimento.setDate(vencimento.getDate() + 30);
  const { data: lancamento } = await db.from('lancamentos').insert([{
    titulo: `Nota Fiscal - ${params.nomeParticipante || 'Fornecedor'}`,
    valor: params.valorTotal, tipo: 'saida', categoria: 'Fornecedor', status: 'pendente',
    data_vencimento: vencimento.toISOString().split('T')[0],
    empresa_id: params.empresaId,
    nf_numero: params.numero, nf_serie: params.serie, nf_chave_acesso: params.chaveAcesso,
    nf_data_emissao: params.dataEmissao, nf_fornecedor_cnpj: params.cnpjParticipante,
  }]).select('id').single();
  if (lancamento) await db.from('fiscal_notas').update({ lancamento_id: lancamento.id }).eq('id', params.notaId);
}

export type ResultadoCapturaItens = { itensGravados: number; rateLimited: boolean };

// Baixa o XML de uma nota já manifestada, extrai os itens e casa cada um com o catálogo
// de produtos da empresa por nome. Usado tanto pelo webhook (nota a nota, assim que
// chega) quanto pelo backfill (uma chamada por nota do histórico inteiro). itensGravados
// fica 0 se a nota não tinha XML disponível ainda ou não tinha item nenhum (nesses casos
// fiscal_notas.itens_status continua 'sem_itens' — o backfill tenta de novo depois).
export async function capturarItensDaNota(
  db: SupabaseClient, notaId: number, empresaId: string,
  token: string, ambiente: FocusNfeAmbiente, chaveAcesso: string
): Promise<ResultadoCapturaItens> {
  const { xml, status } = await baixarXmlNfeRecebida(token, ambiente, chaveAcesso);
  if (status === 429) return { itensGravados: 0, rateLimited: true };
  if (!xml) return { itensGravados: 0, rateLimited: false };
  const itensXml = extrairItensXmlNfe(xml);
  if (itensXml.length === 0) return { itensGravados: 0, rateLimited: false };

  const { data: servicos } = await db.from('servicos').select('id, nome').eq('empresa_id', empresaId);
  const catalogo = servicos || [];

  await db.from('fiscal_notas_itens').insert(
    itensXml.map(item => ({
      nota_id: notaId,
      descricao: item.descricao,
      ncm: item.ncm,
      quantidade: item.quantidade,
      valor_unitario: item.valor_unitario,
      servico_id: acharServicoParecido(item.descricao, catalogo),
      status: 'pendente',
    }))
  );
  await db.from('fiscal_notas').update({ itens_status: 'pendente_revisao' }).eq('id', notaId);
  return { itensGravados: itensXml.length, rateLimited: false };
}
