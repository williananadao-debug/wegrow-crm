// Cliente mínimo pra API de NFe recebidas do Focus NFe — usado tanto pelo webhook
// (nota nova, uma de cada vez) quanto pelo backfill (histórico inteiro, paginado).
// Server-side only: token de produção nunca pode chegar no navegador do cliente.

import type { SupabaseClient } from '@supabase/supabase-js';
import { acharServicoParecido } from '@/lib/matchProduto';

export type FocusNfeAmbiente = 'producao' | 'homologacao';

function baseUrl(ambiente: FocusNfeAmbiente) {
  return ambiente === 'producao' ? 'https://api.focusnfe.com.br' : 'https://homologacao.focusnfe.com.br';
}

// Basic Auth do Focus NFe: usuário = token, senha em branco.
function headerAuth(token: string) {
  return { Authorization: `Basic ${Buffer.from(`${token}:`).toString('base64')}` };
}

export type NfeRecebidaResumo = {
  nome_emitente: string | null;
  documento_emitente: string | null;
  chave_nfe: string;
  valor_total: string | number | null;
  data_emissao: string | null;
  situacao: string | null;
  manifestacao_destinatario: string | null;
  versao: number;
};

// GET /v2/nfes_recebidas — lista TODO o histórico contra o CNPJ, sem filtro de data.
// Pagina por "versao": cada chamada devolve até 100 registros com versao > desde; o
// header X-Max-Version da resposta diz o corte pra pedir a próxima página. Loop até a
// resposta vir vazia (não tem mais nada depois desse ponto).
export async function listarNfesRecebidas(
  token: string, ambiente: FocusNfeAmbiente, cnpj: string
): Promise<NfeRecebidaResumo[]> {
  const todas: NfeRecebidaResumo[] = [];
  let desde = 0;
  for (let pagina = 0; pagina < 200; pagina++) { // trava de segurança — 200*100 = 20 mil notas
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
  return todas;
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

// GET /v2/nfes_recebidas/{chave}.xml — XML completo da nota, com os itens.
export async function baixarXmlNfeRecebida(token: string, ambiente: FocusNfeAmbiente, chave: string): Promise<string | null> {
  const res = await fetch(`${baseUrl(ambiente)}/v2/nfes_recebidas/${chave}.xml`, { headers: headerAuth(token) });
  if (!res.ok) return null; // nota ainda não manifestada, ou XML não disponível — segue sem itens, só o cabeçalho
  return res.text();
}

export type ItemXmlNfe = { descricao: string; ncm: string | null; quantidade: number; valor_unitario: number };

// Extração dos itens (<det>...</det>) via regex — schema da NFe é fixo (padrão SEFAZ),
// não justifica trazer uma lib de XML só pra isso. Cada <det> tem um <prod> com os
// campos que interessam: xProd (descrição), NCM, qCom (quantidade), vUnCom (valor
// unitário). Robusto o bastante pro XML real da SEFAZ (sempre bem formado).
export function extrairItensXmlNfe(xml: string): ItemXmlNfe[] {
  const itens: ItemXmlNfe[] = [];
  const detsMatch = xml.match(/<det\b[^>]*>[\s\S]*?<\/det>/g) || [];
  for (const det of detsMatch) {
    const prodMatch = det.match(/<prod>([\s\S]*?)<\/prod>/);
    if (!prodMatch) continue;
    const prod = prodMatch[1];
    const campo = (tag: string) => prod.match(new RegExp(`<${tag}>([^<]*)<\\/${tag}>`))?.[1] ?? null;
    const descricao = campo('xProd');
    if (!descricao) continue;
    const quantidade = Number(campo('qCom')) || 0;
    const valorUnitario = Number(campo('vUnCom')) || 0;
    if (quantidade <= 0) continue;
    itens.push({ descricao, ncm: campo('NCM'), quantidade, valor_unitario: valorUnitario });
  }
  return itens;
}

// Baixa o XML de uma nota já manifestada, extrai os itens e casa cada um com o catálogo
// de produtos da empresa por nome. Usado tanto pelo webhook (nota a nota, assim que
// chega) quanto pelo backfill (uma chamada por nota do histórico inteiro). Devolve
// quantos itens foram gravados (0 se a nota não tinha XML disponível ainda ou não tinha
// item nenhum — nesses casos fiscal_notas.itens_status continua 'sem_itens').
export async function capturarItensDaNota(
  db: SupabaseClient, notaId: number, empresaId: string,
  token: string, ambiente: FocusNfeAmbiente, chaveAcesso: string
): Promise<number> {
  const xml = await baixarXmlNfeRecebida(token, ambiente, chaveAcesso);
  if (!xml) return 0;
  const itensXml = extrairItensXmlNfe(xml);
  if (itensXml.length === 0) return 0;

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
  return itensXml.length;
}
