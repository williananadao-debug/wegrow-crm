// Apuração do TSE (eleições 2026) para o painel público /eleicao.
//
// O TSE não publica um arquivo único com o voto de cada município: cada cidade tem o seu
// (`<uf><mun>-c<cargo>-e<eleicao>-u.json`). Varrer os 5.570 a cada ciclo seria lento e
// pesado pro TSE, então a atualização é incremental:
//   1. `br-e<eleicao>-ab.json` traz a hora da última totalização de cada UF;
//   2. só nas UFs que mudaram baixa `<uf>-e<eleicao>-ab.json`, com a hora de cada município;
//   3. só os municípios que mudaram têm o arquivo de votos baixado.
// O estado agregado fica em public.eleicao_cache (uma linha por modo), compartilhado por
// todas as instâncias da função e por todas as telas.
import { createClient } from '@supabase/supabase-js';

const BASE = 'https://resultados.tse.jus.br/oficial';

export type Modo = 'real' | 'teste';

// 'teste' usa o 1º turno (já totalizado) pra validar o painel antes do dia 25/10.
const ELEICOES: Record<Modo, { presidente: string; governador: string }> = {
  real: { presidente: '6258', governador: '6260' },
  teste: { presidente: '6257', governador: '6259' },
};

// UFs com 2º turno para governador em 2026 (config do TSE, eleição 6260).
export const UFS_GOVERNADOR = ['ac', 'am', 'df', 'es', 'rn'];

export const NOME_UF: Record<string, string> = {
  ac: 'Acre', al: 'Alagoas', am: 'Amazonas', ap: 'Amapá', ba: 'Bahia', ce: 'Ceará',
  df: 'Distrito Federal', es: 'Espírito Santo', go: 'Goiás', ma: 'Maranhão', mg: 'Minas Gerais',
  ms: 'Mato Grosso do Sul', mt: 'Mato Grosso', pa: 'Pará', pb: 'Paraíba', pe: 'Pernambuco',
  pi: 'Piauí', pr: 'Paraná', rj: 'Rio de Janeiro', rn: 'Rio Grande do Norte', ro: 'Rondônia',
  rr: 'Roraima', rs: 'Rio Grande do Sul', sc: 'Santa Catarina', se: 'Sergipe', sp: 'São Paulo',
  to: 'Tocantins',
};

// Pedido da rádio: Flávio (22) em azul, Lula (13) em vermelho — nessa ordem (A, B).
const FINALISTAS_PRESIDENTE = ['22', '13'];

// O TSE bloqueia o IP (HTTP 429) quando recebe rajada de requisições — no teste, 40 em
// paralelo derrubaram o acesso em segundos. Por isso: poucas conexões simultâneas, teto de
// requisições por ciclo (a varredura inicial termina nos ciclos seguintes) e, se vier 429,
// o mapa pausa (1 min, dobrando a cada 429 seguido, até 5 min) e só o resumo do presidente
// (1 arquivo) segue sendo consultado. O TSE pune o IP por vários minutos depois de uma
// rajada, e insistir durante a punição só a prolonga.
const REQUISICOES_POR_CICLO = 250;
const CONCORRENCIA = 6;
const PAUSA_429_MS = 60_000;
const PAUSA_429_MAX_MS = 5 * 60_000;
// Intervalo mínimo entre atualizações; o lock evita duas instâncias atualizando juntas.
export const INTERVALO_MS = 5000;
const TRAVA_MS = 55_000;

export type Candidato = {
  n: string; nome: string; partido: string; vice: string;
  votos: number; pct: number; situacao: string; foto: string;
};

export type Resumo = {
  pctApurado: number; eleitores: number;
  comparecimento: number; pctComparecimento: number;
  abstencao: number; pctAbstencao: number;
  validos: number; brancos: number; pctBrancos: number; nulos: number; pctNulos: number;
  horaTse: string;
};

// [% seções apuradas, votos do finalista A, votos do finalista B]
export type Parcial = [number, number, number];

export type Disputa = {
  id: string;          // 'presidente' | 'gov-es' ...
  uf: string;          // 'br' ou a UF
  disponivel: boolean; // false = TSE ainda não publicou o arquivo
  candidatos: Candidato[];
  finalistas: string[]; // números [A, B] — A/B definem as cores
  resumo: Resumo | null;
  ufs: Record<string, Parcial>; // só presidente
  mun: Record<string, Parcial>; // chave = código IBGE do município
  // Evolução da apuração (gráfico "os dois ao longo da apuração"): um ponto por mudança.
  historico?: Parcial[];
};

export type EstadoPublico = {
  modo: Modo; versao: number; atualizadoEm: string | null;
  mapaPausadoAte?: string | null; // TSE limitou o acesso: mapa por município atrasado
  presidente: Disputa; governadores: Disputa[];
};

type Interno = {
  pausaAte?: number;   // ms — depois de um 429, só o resumo do presidente até aqui
  pausaNivel?: number; // quantos 429 seguidos (a pausa dobra a cada um)
  htUf: Record<string, Record<string, string>>;  // disputa -> uf -> hora
  htMun: Record<string, Record<string, string>>; // disputa -> mun TSE -> hora
};

type Dados = { pub: EstadoPublico; int: Interno };

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

const num = (s: unknown) => {
  const v = parseFloat(String(s ?? '0').replace(',', '.'));
  return Number.isFinite(v) ? v : 0;
};
const int = (s: unknown) => parseInt(String(s ?? '0'), 10) || 0;
const pad = (s: string, n: number) => s.padStart(n, '0');

const urlVotos = (ele: string, cargo: number, uf: string, mun = '') =>
  `${BASE}/ele2026/${ele}/dados/${uf}/${uf}${mun}-c${pad(String(cargo), 4)}-e${pad(ele, 6)}-u.json`;
const urlAbrangencia = (ele: string, uf: string) =>
  `${BASE}/ele2026/${ele}/dados/${uf}/${uf}-e${pad(ele, 6)}-ab.json`;
const urlMunicipios = (ele: string) => `${BASE}/ele2026/${ele}/config/mun-e${pad(ele, 6)}-cm.json`;
const urlFoto = (ele: string, uf: string, sq: string) => `${BASE}/ele2026/${ele}/fotos/${uf}/${sq}.jpeg`;

class LimiteTse extends Error {}

// null = arquivo ainda não existe (404). 429 vira LimiteTse; outros erros sobem.
async function baixar(url: string): Promise<any | null> {
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
  if (res.status === 429) throw new LimiteTse('TSE 429');
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new Error(`TSE ${res.status} em ${url}`);
  return res.json();
}

async function emParalelo<T>(itens: T[], limite: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, async () => {
    while (i < itens.length) await fn(itens[i++]);
  }));
}

function* candidatosDoArquivo(j: any): Generator<{ c: any; partido: string }> {
  for (const agr of j?.carg?.[0]?.agr || [])
    for (const par of agr.par || [])
      for (const c of par.cand || []) yield { c, partido: par.sg || '' };
}

const nomeBonito = (s: string) =>
  (s || '').toLowerCase().replace(/(^|\s)(\S)/g, (_, a, b) => a + b.toUpperCase())
    .replace(/\b(Da|De|Do|Das|Dos|E)\b/g, m => m.toLowerCase());

// --- Municípios (código TSE -> IBGE/nome), um arquivo de config por eleição -------------

const cacheMunicipios = new Map<string, Promise<Record<string, { cdi: string; nome: string; uf: string }>>>();

export function municipiosDaEleicao(ele: string) {
  if (!cacheMunicipios.has(ele)) {
    const p = baixar(urlMunicipios(ele)).then(j => {
      const mapa: Record<string, { cdi: string; nome: string; uf: string }> = {};
      for (const a of j?.abr || [])
        for (const m of a.mu || []) mapa[m.cd] = { cdi: m.cdi, nome: nomeBonito(m.nm), uf: String(a.cd).toLowerCase() };
      return mapa;
    });
    p.catch(() => cacheMunicipios.delete(ele));
    cacheMunicipios.set(ele, p);
  }
  return cacheMunicipios.get(ele)!;
}

export function eleicaoPresidente(modo: Modo) { return ELEICOES[modo].presidente; }

// --- Estado ------------------------------------------------------------------------------

function disputaVazia(id: string, uf: string): Disputa {
  return { id, uf, disponivel: false, candidatos: [], finalistas: [], resumo: null, ufs: {}, mun: {} };
}

function estadoVazio(modo: Modo): Dados {
  return {
    pub: {
      modo, versao: 0, atualizadoEm: null,
      presidente: disputaVazia('presidente', 'br'),
      governadores: UFS_GOVERNADOR.map(uf => disputaVazia(`gov-${uf}`, uf)),
    },
    int: { htUf: {}, htMun: {} },
  };
}

let memoria: { modo: Modo; lidoEm: number; dados: Dados; atualizadoEm: number } | null = null;

// ELEICAO_MEMORIA=1 (só desenvolvimento local): guarda o estado em memória em vez do
// Supabase, pra ver o painel rodando sem a tabela/chave de produção.
const SEM_BANCO = process.env.ELEICAO_MEMORIA === '1';
const bancoMemoria = new Map<Modo, { dados: Dados; atualizadoEm: number; travaAte: number }>();

async function travar(modo: Modo): Promise<boolean> {
  const agora = Date.now();
  if (SEM_BANCO) {
    const l = bancoMemoria.get(modo);
    if (l && (l.travaAte > agora || agora - l.atualizadoEm < INTERVALO_MS)) return false;
    bancoMemoria.set(modo, { dados: l?.dados || estadoVazio(modo), atualizadoEm: l?.atualizadoEm || 0, travaAte: agora + TRAVA_MS });
    return true;
  }
  const { data } = await db().from('eleicao_cache')
    .update({ trava_ate: new Date(agora + TRAVA_MS).toISOString() })
    .eq('chave', modo)
    .lt('trava_ate', new Date(agora).toISOString())
    .lt('atualizado_em', new Date(agora - INTERVALO_MS).toISOString())
    .select('chave');
  return !!data?.length;
}

async function salvar(modo: Modo, dados: Dados | null) {
  if (SEM_BANCO) {
    const l = bancoMemoria.get(modo);
    if (dados) bancoMemoria.set(modo, { dados, atualizadoEm: Date.now(), travaAte: 0 });
    else if (l) l.travaAte = 0;
    return;
  }
  await db().from('eleicao_cache').update(dados
    ? { dados, atualizado_em: dados.pub.atualizadoEm, trava_ate: new Date(0).toISOString() }
    : { trava_ate: new Date(0).toISOString() }).eq('chave', modo);
}

async function lerLinha(modo: Modo): Promise<{ dados: Dados; atualizadoEm: number } | null> {
  if (SEM_BANCO) {
    const l = bancoMemoria.get(modo);
    return { dados: l?.dados || estadoVazio(modo), atualizadoEm: l?.atualizadoEm || 0 };
  }
  const { data, error } = await db().from('eleicao_cache').select('dados, atualizado_em').eq('chave', modo).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const d = data.dados as Dados;
  return { dados: d?.pub ? d : estadoVazio(modo), atualizadoEm: new Date(data.atualizado_em).getTime() };
}

export async function lerEstado(modo: Modo): Promise<{ pub: EstadoPublico; atualizadoEm: number } | null> {
  if (memoria && memoria.modo === modo && Date.now() - memoria.lidoEm < 1500)
    return { pub: memoria.dados.pub, atualizadoEm: memoria.atualizadoEm };
  const linha = await lerLinha(modo);
  if (!linha) return null;
  memoria = { modo, lidoEm: Date.now(), ...linha };
  return { pub: linha.dados.pub, atualizadoEm: linha.atualizadoEm };
}

// --- Atualização ---------------------------------------------------------------------------

function resumoDoArquivo(j: any): Resumo {
  const s = j.s || {}, e = j.e || {}, v = j.v || {};
  return {
    pctApurado: num(s.pstn ?? s.pst),
    eleitores: int(e.te),
    comparecimento: int(e.c), pctComparecimento: num(e.pcn ?? e.pc),
    abstencao: int(e.a), pctAbstencao: num(e.pan ?? e.pa),
    validos: int(v.vv),
    brancos: int(v.vb), pctBrancos: num(v.pvbn ?? v.pvb),
    nulos: int(v.tvn), pctNulos: num(v.ptvnn ?? v.ptvn),
    horaTse: `${j.dg || ''} ${j.hg || ''}`.trim(),
  };
}

function parcialDoArquivo(j: any, finalistas: string[]): Parcial {
  const votos: Record<string, number> = {};
  for (const { c } of candidatosDoArquivo(j)) votos[c.n] = int(c.vap);
  return [num(j?.s?.pstn ?? j?.s?.pst), votos[finalistas[0]] || 0, votos[finalistas[1]] || 0];
}

type Ciclo = { orcamento: number; bloqueado: boolean; brAb: Map<string, Promise<any | null>> };

// Totais e candidatos da disputa (1 arquivo). Roda sempre, mesmo com o mapa em pausa.
export async function atualizarResumo(d: Disputa, interno: Interno, ele: string, cargo: number) {
  const geral = await baixar(urlVotos(ele, cargo, d.uf));
  if (!geral) { d.disponivel = false; return; }
  d.disponivel = true;
  d.resumo = resumoDoArquivo(geral);
  d.candidatos = [...candidatosDoArquivo(geral)].map(({ c, partido }) => ({
    n: String(c.n), nome: nomeBonito(c.nmu || c.nm), partido,
    vice: nomeBonito(c.vs?.[0]?.nmu || ''),
    votos: int(c.vap), pct: num(c.pvapn ?? c.pvap), situacao: c.st || '',
    foto: urlFoto(ele, d.uf, c.sqcand),
  })).sort((a, b) => b.votos - a.votos);

  // Finalistas: no 2º turno o arquivo só tem os dois; no modo teste (1º turno) são os
  // marcados "2º turno". Ordem fixa por número pra cor de cada um não trocar no meio.
  const nums = d.candidatos.map(c => c.n);
  const marcados = d.candidatos.filter(c => /2º turno/i.test(c.situacao));
  const finalistas = d.uf === 'br' && FINALISTAS_PRESIDENTE.every(n => nums.includes(n))
    ? FINALISTAS_PRESIDENTE
    : (marcados.length === 2 ? marcados : d.candidatos.slice(0, 2)).map(c => c.n).sort((a, b) => +a - +b);
  if (finalistas.join() !== d.finalistas.join()) {
    // Mudou quem é A/B: o que estava salvo por município não vale mais.
    d.mun = {}; d.ufs = {}; d.historico = []; interno.htUf[d.id] = {}; interno.htMun[d.id] = {};
  }
  d.finalistas = finalistas;

  const votosDe = (n: string) => d.candidatos.find(c => c.n === n)?.votos || 0;
  const ponto: Parcial = [d.resumo.pctApurado, votosDe(finalistas[0]), votosDe(finalistas[1])];
  const hist = (d.historico ||= []);
  const ultimo = hist[hist.length - 1];
  if (ponto[1] + ponto[2] > 0 && (!ultimo || ultimo[1] !== ponto[1] || ultimo[2] !== ponto[2])) {
    hist.push(ponto);
    // Teto de tamanho: descarta um ponto sim, um não da parte antiga (mantém o formato da curva).
    if (hist.length > 400) d.historico = [...hist.slice(0, 200).filter((_, i) => i % 2 === 0), ...hist.slice(200)];
  }
}

// Votos por UF/município, só do que mudou desde o último ciclo, dentro do orçamento.
export async function atualizarMapa(d: Disputa, interno: Interno, ele: string, cargo: number, ciclo: Ciclo) {
  if (!d.disponivel || d.finalistas.length < 2 || ciclo.bloqueado) return;
  const escopo = d.uf, finalistas = d.finalistas;
  const htUf = (interno.htUf[d.id] ||= {});
  const htMun = (interno.htMun[d.id] ||= {});

  if (!ciclo.brAb.has(ele)) { ciclo.orcamento--; ciclo.brAb.set(ele, baixar(urlAbrangencia(ele, 'br'))); }
  const brAb = await ciclo.brAb.get(ele);
  const ufsMudaram = (brAb?.abr || [])
    .filter((a: any) => a.tpabr === 'uf' && a.cdabr !== 'zz' && (escopo === 'br' || a.cdabr === escopo))
    .map((a: any) => ({ uf: a.cdabr as string, hora: `${a.dt} ${a.ht}` }))
    .filter((u: { uf: string; hora: string }) => htUf[u.uf] !== u.hora);

  const municipios = await municipiosDaEleicao(ele);

  for (const { uf, hora } of ufsMudaram) {
    if (ciclo.orcamento < 3 || ciclo.bloqueado) break;
    ciclo.orcamento -= escopo === 'br' ? 2 : 1;
    const [ufAb, ufVotos] = await Promise.all([
      baixar(urlAbrangencia(ele, uf)),
      escopo === 'br' ? baixar(urlVotos(ele, cargo, uf)) : Promise.resolve(null),
    ]);
    if (ufVotos) d.ufs[uf] = parcialDoArquivo(ufVotos, finalistas);

    const pendentes = (ufAb?.abr || [])
      .filter((a: any) => a.tpabr === 'mun' && municipios[a.cdabr] && htMun[a.cdabr] !== `${a.dt} ${a.ht}`)
      .map((a: any) => ({ cd: a.cdabr as string, hora: `${a.dt} ${a.ht}` }));
    const lote = pendentes.slice(0, Math.max(0, ciclo.orcamento));
    ciclo.orcamento -= lote.length;
    let falhas = pendentes.length - lote.length;

    await emParalelo(lote, CONCORRENCIA, async ({ cd, hora: h }: { cd: string; hora: string }) => {
      if (ciclo.bloqueado) { falhas++; return; }
      try {
        const j = await baixar(urlVotos(ele, cargo, uf, cd));
        if (!j) { falhas++; return; }
        d.mun[municipios[cd].cdi] = parcialDoArquivo(j, finalistas);
        htMun[cd] = h;
      } catch (e) {
        falhas++;
        if (e instanceof LimiteTse) ciclo.bloqueado = true;
      }
    });
    // Só marca a UF como em dia se todos os municípios dela entraram — senão o que
    // faltou é pego no próximo ciclo.
    if (ufAb && falhas === 0) htUf[uf] = hora;
  }
}

export async function atualizar(modo: Modo): Promise<'ok' | 'recente' | 'ocupado'> {
  if (!(await travar(modo))) return 'ocupado';

  try {
    const linha = await lerLinha(modo);
    const dados = linha?.dados || estadoVazio(modo);
    const eles = ELEICOES[modo];
    const disputas = [
      { d: dados.pub.presidente, ele: eles.presidente, cargo: 1 },
      ...dados.pub.governadores.map(g => ({ d: g, ele: eles.governador, cargo: 3 })),
    ];
    const emPausa = (dados.int.pausaAte || 0) > Date.now();
    const ciclo: Ciclo = { orcamento: REQUISICOES_POR_CICLO, bloqueado: emPausa, brAb: new Map() };

    // 1) Resumos primeiro: são os números grandes da tela e custam 1 requisição cada.
    // Em pausa por 429, só o do presidente.
    await Promise.all((emPausa ? disputas.slice(0, 1) : disputas).map(async ({ d, ele, cargo }) => {
      try { await atualizarResumo(d, dados.int, ele, cargo); }
      catch (e) { if (e instanceof LimiteTse) ciclo.bloqueado = true; else console.error('[eleicao] resumo', d.id, e); }
    }));

    // 2) Mapa: governadores (poucos municípios) e depois presidente com o resto do orçamento.
    for (const { d, ele, cargo } of [...disputas.slice(1), disputas[0]]) {
      try { await atualizarMapa(d, dados.int, ele, cargo, ciclo); }
      catch (e) { if (e instanceof LimiteTse) ciclo.bloqueado = true; else console.error('[eleicao] mapa', d.id, e); }
    }
    if (ciclo.bloqueado && !emPausa) {
      const nivel = dados.int.pausaNivel || 0;
      const pausa = Math.min(PAUSA_429_MS * 2 ** nivel, PAUSA_429_MAX_MS);
      dados.int.pausaAte = Date.now() + pausa;
      dados.int.pausaNivel = nivel + 1;
      console.warn('[eleicao] TSE respondeu 429 — mapa em pausa por', pausa / 1000, 's');
    } else if (!ciclo.bloqueado) {
      dados.int.pausaNivel = 0;
    }
    dados.pub.mapaPausadoAte = (dados.int.pausaAte || 0) > Date.now() ? new Date(dados.int.pausaAte!).toISOString() : null;

    dados.pub.versao += 1;
    dados.pub.atualizadoEm = new Date().toISOString();
    await salvar(modo, dados);
    memoria = { modo, lidoEm: Date.now(), dados, atualizadoEm: Date.now() };
    return 'ok';
  } catch (e) {
    await salvar(modo, null);
    throw e;
  }
}
