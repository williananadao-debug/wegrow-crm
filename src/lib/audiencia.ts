// Audiência na venda: lê a pesquisa da emissora (audiencia_pesquisas/faixas) e transforma o plano
// de inserções da proposta em números que o anunciante entende — quantas pessoas são impactadas,
// pontos de audiência (GRP), custo por mil e custo por ponto. Também importa a tabela colada do
// Excel (exportação do Easy Media da Kantar, pesquisa de instituto ou relatório do streaming).

export type DiaTipo = 'seg_sex' | 'sab' | 'dom' | 'seg_dom';
export type Faixa = { dia_tipo: DiaTipo; hora_inicio: string; hora_fim: string; ouvintes_minuto: number | null; audiencia_pct: number | null; share_pct: number | null; alcance: number | null };
export type Pesquisa = { id: number; unidade: string; fonte: string; instituto: string | null; praca: string | null; publico: string; universo: number | null; periodo_inicio: string | null; periodo_fim: string | null };

export const FONTES: Record<string, string> = { kantar_ibope: 'Kantar IBOPE Media', instituto: 'Instituto regional', streaming: 'Streaming', manual: 'Lançamento manual' };
export const DIAS: Record<DiaTipo, string> = { seg_sex: 'Seg a Sex', sab: 'Sábado', dom: 'Domingo', seg_dom: 'Seg a Dom' };

const minutos = (h: string) => { const [a, b] = h.split(':').map(Number); return (a || 0) * 60 + (b || 0); };
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// "1.234,5" / "1234.5" / "12,3%" → número
export function numeroBR(v: string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  let t = String(v).trim().replace(/%|\s/g, '');
  if (!t || t === '-') return null;
  if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.');
  else if (t.includes(',')) t = t.replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ''); // "12.500" = doze mil e quinhentos
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// "06:00 - 07:00", "06h-07h", "6 às 7", "06:00" (faixa de 1 h) → [início, fim]
export function faixaHorario(v: string): [string, string] | null {
  const horas = String(v).match(/(\d{1,2})(?:[:h](\d{2}))?/g);
  if (!horas || !horas.length) return null;
  const conv = (s: string) => { const m = s.match(/(\d{1,2})(?:[:h](\d{2}))?/)!; return Number(m[1]) * 60 + Number(m[2] || 0); };
  const ini = conv(horas[0]);
  const fim = horas[1] ? conv(horas[1]) : ini + 60;
  if (ini > 24 * 60) return null;
  return [hhmm(ini), hhmm(fim === 24 * 60 ? 24 * 60 - 1 : fim)];
}

export function diaTipoDe(v: string | null | undefined): DiaTipo | null {
  const t = String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (!t) return null;
  if (/sab/.test(t)) return 'sab';
  if (/dom/.test(t) && !/seg/.test(t)) return 'dom';
  if (/seg.*(dom)/.test(t) || /todos|semana inteira/.test(t)) return 'seg_dom';
  if (/seg|sex|util/.test(t)) return 'seg_sex';
  return null;
}

// Tabela colada do Excel/CSV → cabeçalho + linhas
export function lerTabela(texto: string): { cabecalho: string[]; linhas: string[][] } {
  const brutas = texto.replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (!brutas.length) return { cabecalho: [], linhas: [] };
  const sep = brutas[0].includes('\t') ? '\t' : (brutas[0].split(';').length > brutas[0].split(',').length ? ';' : ',');
  const partes = brutas.map(l => l.split(sep).map(c => c.trim().replace(/^"|"$/g, '')));
  return { cabecalho: partes[0], linhas: partes.slice(1) };
}

export type Mapa = { hora: number; dia: number; opm: number; aud: number; share: number; alcance: number };

// Adivinha qual coluna é qual pelo nome do cabeçalho (-1 = não tem)
export function adivinharColunas(cab: string[]): Mapa {
  const n = cab.map(c => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());
  const achar = (re: RegExp, evitar?: RegExp) => n.findIndex(c => re.test(c) && !(evitar && evitar.test(c)));
  return {
    hora: achar(/hora|faixa|horario|periodo/),
    dia: achar(/^dia|dias|semana/),
    opm: achar(/opm|ouvintes|ouv\/min|por minuto|media de ouvintes/),
    aud: achar(/aud|ibope|rat/, /share|part/),
    share: achar(/share|part/),
    alcance: achar(/alcance|cobertura|reach|ouvintes unicos/),
  };
}

export function montarFaixas(linhas: string[][], mapa: Mapa, diaPadrao: DiaTipo): Faixa[] {
  const out: Faixa[] = [];
  for (const l of linhas) {
    const fx = mapa.hora >= 0 ? faixaHorario(l[mapa.hora] || '') : null;
    if (!fx) continue;
    const val = (i: number) => (i >= 0 ? numeroBR(l[i]) : null);
    const f: Faixa = {
      dia_tipo: (mapa.dia >= 0 ? diaTipoDe(l[mapa.dia]) : null) || diaPadrao,
      hora_inicio: fx[0], hora_fim: fx[1],
      ouvintes_minuto: val(mapa.opm), audiencia_pct: val(mapa.aud), share_pct: val(mapa.share), alcance: val(mapa.alcance),
    };
    if (f.ouvintes_minuto === null && f.audiencia_pct === null) continue;
    out.push(f);
  }
  return out;
}

// Média ponderada pelo tempo de sobreposição entre a faixa do anúncio e as faixas da pesquisa
function mediaNaJanela(faixas: Faixa[], ini: string, fim: string, campo: 'ouvintes_minuto' | 'audiencia_pct'): number | null {
  const a = minutos(ini), b = Math.max(minutos(fim), a + 1);
  let soma = 0, peso = 0;
  for (const f of faixas) {
    const v = f[campo];
    if (v === null || v === undefined) continue;
    const s = Math.max(a, minutos(f.hora_inicio)), e = Math.min(b, Math.max(minutos(f.hora_fim), minutos(f.hora_inicio) + 1));
    if (e > s) { soma += Number(v) * (e - s); peso += e - s; }
  }
  return peso ? soma / peso : null;
}

function faixasDoDia(faixas: Faixa[], dia: DiaTipo): Faixa[] {
  const do_dia = faixas.filter(f => f.dia_tipo === dia);
  if (do_dia.length) return do_dia;
  const semana = faixas.filter(f => f.dia_tipo === 'seg_dom');
  return semana.length ? semana : faixas;
}

export type ItemPlano = { servico: string; quantidade: number; precoUnitario: number; horario_inicial?: string; horario_final?: string; bonificacao?: boolean; tipoEspecial?: string };
export type LinhaPlano = { servico: string; janela: string; insercoes: number; opm: number | null; impactos: number; grp: number; valor: number; cpm: number | null };

// Impactos = ouvintes por minuto na janela × inserções; GRP = audiência % × inserções;
// custo por mil = valor ÷ impactos × 1000; custo por ponto = valor ÷ GRP.
export function calcularPlano(itens: ItemPlano[], faixas: Faixa[], valorTotal?: number, dia: DiaTipo = 'seg_sex') {
  const base = faixasDoDia(faixas, dia);
  const linhas: LinhaPlano[] = itens.filter(i => Number(i.quantidade) > 0).map(i => {
    const ini = i.horario_inicial || '06:00', fim = i.horario_final || '20:00';
    const opm = mediaNaJanela(base, ini, fim, 'ouvintes_minuto');
    const aud = mediaNaJanela(base, ini, fim, 'audiencia_pct');
    const ins = Number(i.quantidade) || 0;
    const valor = i.bonificacao || i.tipoEspecial ? 0 : ins * (Number(i.precoUnitario) || 0);
    const impactos = (opm || 0) * ins;
    return { servico: i.servico, janela: `${ini}–${fim}`, insercoes: ins, opm, impactos, grp: (aud || 0) * ins, valor, cpm: impactos > 0 && valor > 0 ? valor / impactos * 1000 : null };
  });
  const impactos = linhas.reduce((s, l) => s + l.impactos, 0);
  const grp = linhas.reduce((s, l) => s + l.grp, 0);
  const valor = valorTotal ?? linhas.reduce((s, l) => s + l.valor, 0);
  return {
    linhas, impactos, grp, valor,
    cpm: impactos > 0 && valor > 0 ? valor / impactos * 1000 : null,
    cpp: grp > 0 && valor > 0 ? valor / grp : null,
    insercoes: linhas.reduce((s, l) => s + l.insercoes, 0),
  };
}

// Melhores faixas da emissora por ouvintes por minuto (sugestão de horário na proposta)
export function melhoresFaixas(faixas: Faixa[], dia: DiaTipo = 'seg_sex', qtd = 3): Faixa[] {
  return faixasDoDia(faixas, dia).filter(f => f.ouvintes_minuto !== null)
    .sort((a, b) => Number(b.ouvintes_minuto) - Number(a.ouvintes_minuto)).slice(0, qtd);
}
