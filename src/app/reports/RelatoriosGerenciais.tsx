"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Download, ClipboardCopy, ArrowUpDown, AlertTriangle, TrendingUp, Lightbulb, Sparkles, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { diaReferenciaLead } from '@/lib/dataFechamento';
import { valorVenda, type AjusteVenda } from '@/lib/vendasAjustes';

// Relatórios gerenciais do menu de /reports: cada um devolve um gráfico (em cima) e uma tabela
// (embaixo), sempre no recorte de período/unidade/vendedor da tela. Os que precisam de dado fora
// do período (contratos vigentes, parcelas vencidas, ano anterior) buscam só aquele recorte.

export type Ctx = {
  empresaId?: string; userId?: string; isDirector: boolean; isGerente: boolean; unidadeGerente?: string;
  dataInicio: string; dataFim: string; filtroUnidade: string; filtroVendedor: string;
  nomesMap: Record<string, string>; leads: any[]; leadsAnt: any[]; visitas: any[]; visitasAnt: any[];
  periodoAnterior: { inicio: string; fim: string };
  // Contratos encurtados no período (lib/vendasAjustes): entram no faturamento e na comissão do vendedor
  ajustes?: AjusteVenda[]; ajustesAnt?: AjusteVenda[];
};
type Tipo = 'txt' | 'brl' | 'n' | 'pct' | 'data' | 'var';
type Coluna = { k: string; t: string; tipo?: Tipo };
type Ponto = { rotulo: string; valor: number; valor2?: number };
type Grafico = { tipo: 'barras' | 'colunas' | 'rosca'; dados: Ponto[]; serie?: string; serie2?: string; formato?: 'brl' | 'n' | 'pct' };
type Resultado = { grafico: Grafico | null; colunas: Coluna[]; linhas: Record<string, any>[]; resumo?: string; total?: Record<string, any> };
type Insight = { tipo: 'alerta' | 'oportunidade' | 'positivo'; titulo: string; texto: string; acao?: string };
// comparar: relatórios do período rodam de novo no período anterior; a linha é casada pela chave e
// a variação é da métrica principal. total: a métrica do relatório inteiro (pro resumo).
type Comparar = { chave: (l: any) => string; metrica: string; rotulo: string; formato: 'brl' | 'n'; total?: (r: Resultado) => number };
type Def = { id: string; grupo: string; nome: string; descricao: string; diretoria?: boolean; comparar?: Comparar; insights?: (r: Resultado, ant: Resultado | null, c: Ctx) => Insight[]; gerar: (c: Ctx, op: Record<string, number>) => Promise<Resultado> | Resultado; opcao?: { k: string; rotulo: string; padrao: number; sufixo: string } };

const brl = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
const kbrl = (v: number) => Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : brl(v);
const num = (v: number, d = 0) => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: d });
const dataBR = (d: string | null | undefined) => d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('pt-BR') : '—';
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const somaDias = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const vend = (c: Ctx, l: any) => l.vendedor_nome || c.nomesMap[l.user_id] || 'Sem vendedor';
const ganhos = (ls: any[]) => ls.filter(l => l.status === 'ganho');
const valor = (l: any) => valorVenda(l);
// Soma os ajustes de contrato encurtado do período no faturamento de cada vendedor (não contam como venda)
function comAjustes(c: Ctx, linhas: any[], ini: () => any) {
  for (const a of c.ajustes || []) {
    const k = vend(c, { vendedor_nome: a.vendedor_nome, user_id: a.vendedor_id });
    let l = linhas.find(x => x.chave === k);
    if (!l) { l = { chave: k, ...ini() }; linhas.push(l); }
    l.faturamento += a.valor;
  }
  return linhas;
}
const blocos = <T,>(arr: T[], n = 150) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const somaCol = (r: Resultado | null, k: string) => (r?.linhas || []).reduce((s, l) => s + (Number(l[k]) || 0), 0);
const varPct = (a: number, b: number) => b ? (a - b) / b * 100 : null;
const fmtVar = (v: number | null) => v === null ? 'sem base no período anterior' : `${v >= 0 ? '+' : ''}${num(v, 0)}%`;
const porChave = (r: Resultado | null, chave: string, k: string) => new Map((r?.linhas || []).map(l => [String(l[chave]), Number(l[k]) || 0]));
// Variação total do relatório vs período anterior, como primeiro insight
function insightTotal(r: Resultado, ant: Resultado | null, k: string, nome: string, fmt: (v: number) => string): Insight[] {
  if (!ant) return [];
  const a = somaCol(r, k), b = somaCol(ant, k), v = varPct(a, b);
  if (v === null) return [];
  return [{ tipo: v >= 0 ? 'positivo' : 'alerta', titulo: `${nome} ${v >= 0 ? 'subiu' : 'caiu'} ${num(Math.abs(v), 0)}%`, texto: `${fmt(a)} agora contra ${fmt(b)} no período anterior.` }];
}

// Mesma regra de visibilidade da tela: vendedor vê o que é dele, gerente a unidade; mais os filtros.
function escopo(q: any, c: Ctx) {
  if (c.empresaId) q = q.eq('empresa_id', c.empresaId);
  if (!c.isDirector && !c.isGerente) q = q.eq('user_id', c.userId);
  if (c.isGerente && c.unidadeGerente) q = q.eq('unidade', c.unidadeGerente);
  if (c.filtroUnidade !== 'Todas' && !c.isGerente) q = q.eq('unidade', c.filtroUnidade);
  if (c.filtroVendedor !== 'Todos') q = q.eq('user_id', c.filtroVendedor);
  return q;
}
function agrupar<T>(itens: T[], chave: (x: T) => string, acc: (a: any, x: T) => void, ini: () => any) {
  const m = new Map<string, any>();
  for (const x of itens) { const k = chave(x); if (!m.has(k)) m.set(k, { chave: k, ...ini() }); acc(m.get(k), x); }
  return [...m.values()];
}
function itensDe(l: any): any[] { try { const v = typeof l.itens === 'string' ? JSON.parse(l.itens) : l.itens; return Array.isArray(v) ? v : []; } catch { return []; } }

const CATEGORIAS_PERDA: [string, RegExp][] = [
  ['Preço / orçamento', /pre[cç]o|caro|or[cç]amento|verba|dinheiro|valor|custo|desconto/i],
  ['Concorrente', /concorr|outra r[aá]dio|outra emissora|fechou com|jornal|instagram|facebook|google|tv /i],
  ['Sem retorno', /sem retorno|n[aã]o retorn|n[aã]o respond|sumiu|v[aá]cuo|n[aã]o atende/i],
  ['Momento / adiou', /momento|depois|ano que vem|pr[oó]ximo m[eê]s|adiou|futuro|agora n[aã]o|aguardar/i],
  ['Não viu resultado', /resultado|retorno do an[uú]ncio|n[aã]o funcion|n[aã]o deu certo/i],
  ['Fechou / mudou o negócio', /fechou a empresa|encerr|faliu|vendeu/i],
];
function motivoDe(l: any): string {
  let notas: any[] = [];
  try { notas = typeof l.notas === 'string' ? JSON.parse(l.notas) : (l.notas || []); } catch { notas = []; }
  const n = (Array.isArray(notas) ? notas : []).map((x: any) => String(x?.texto || '')).reverse().find((t: string) => /MOTIVO DA PERDA/i.test(t));
  return n ? n.replace(/.*MOTIVO DA PERDA:\s*/i, '').trim() : '';
}

const DEFS: Def[] = [
  // ───────── Comercial
  { id: 'vendas_vendedor', comparar: { chave: l => l.vendedor, metrica: 'faturamento', rotulo: 'Faturamento', formato: 'brl' },
    insights: (r, ant) => {
      const out = insightTotal(r, ant, 'faturamento', 'O faturamento', kbrl);
      const antMap = porChave(ant, 'vendedor', 'faturamento');
      const quedas = r.linhas.map(l => ({ v: l.vendedor, var: varPct(l.faturamento, antMap.get(l.vendedor) || 0), antes: antMap.get(l.vendedor) || 0 })).filter(x => x.var !== null && x.var <= -25 && x.antes > 0).sort((a, b) => a.var! - b.var!);
      if (quedas[0]) out.push({ tipo: 'alerta', titulo: `${quedas[0].v} vendeu ${num(Math.abs(quedas[0].var!), 0)}% menos`, texto: `Caiu de ${kbrl(quedas[0].antes)} para ${kbrl(quedas[0].antes * (1 + quedas[0].var! / 100))}.`, acao: 'Revisar o pipeline dele na próxima reunião, definir 3 negociações prioritárias e acompanhar duas visitas juntos nesta semana.' });
      const leadsT = somaCol(r, 'leads'), vendasT = somaCol(r, 'vendas'), convMedia = leadsT ? vendasT / leadsT * 100 : 0;
      const baixa = r.linhas.filter(l => l.leads >= 5 && l.conversao < convMedia * 0.6);
      if (baixa.length) out.push({ tipo: 'oportunidade', titulo: `Conversão baixa: ${baixa.map(l => l.vendedor).join(', ')}`, texto: `Converte menos de 60% da média do time (${num(convMedia, 1)}%).`, acao: 'Ouvir 2 apresentações com cliente, revisar a proposta padrão e qualificar melhor antes de enviar proposta.' });
      const tot = somaCol(r, 'faturamento'), top = r.linhas[0];
      if (top && tot && top.faturamento / tot > 0.5 && r.linhas.length > 2) out.push({ tipo: 'alerta', titulo: `${num(top.faturamento / tot * 100, 0)}% do faturamento depende de ${top.vendedor}`, texto: 'Concentração alta num vendedor só: se ele sair ou cair, a empresa sente.', acao: 'Distribuir a carteira nova entre os outros e criar meta individual para quem está abaixo.' });
      return out;
    }, grupo: 'Comercial', nome: 'Vendas por vendedor', descricao: 'Faturamento, quantidade de vendas, ticket médio e conversão de cada vendedor no período.',
    gerar: c => {
      const ini = () => ({ leads: 0, vendas: 0, faturamento: 0, desconto: 0 });
      const linhas = comAjustes(c, agrupar(c.leads, l => vend(c, l), (a, l) => { a.leads++; if (l.status === 'ganho') { a.vendas++; a.faturamento += valor(l); a.desconto += Number(l.desconto) || 0; } }, ini), ini)
        .map(a => ({ vendedor: a.chave, leads: a.leads, vendas: a.vendas, faturamento: a.faturamento, ticket: a.vendas ? a.faturamento / a.vendas : 0, conversao: a.leads ? a.vendas / a.leads * 100 : 0, desc_pct: a.faturamento + a.desconto ? a.desconto / (a.faturamento + a.desconto) * 100 : 0 }))
        .sort((a, b) => b.faturamento - a.faturamento);
      return { grafico: { tipo: 'barras', formato: 'brl', dados: linhas.map(l => ({ rotulo: l.vendedor, valor: l.faturamento })) },
        colunas: [{ k: 'vendedor', t: 'Vendedor' }, { k: 'leads', t: 'Leads', tipo: 'n' }, { k: 'vendas', t: 'Vendas', tipo: 'n' }, { k: 'faturamento', t: 'Faturamento', tipo: 'brl' }, { k: 'ticket', t: 'Ticket médio', tipo: 'brl' }, { k: 'conversao', t: 'Conversão', tipo: 'pct' }, { k: 'desc_pct', t: 'Desconto médio', tipo: 'pct' }], linhas };
    } },
  { id: 'comissao', comparar: { chave: l => l.vendedor, metrica: 'comissao', rotulo: 'Comissão', formato: 'brl' },
    insights: (r, ant) => insightTotal(r, ant, 'comissao', 'A comissão a pagar', kbrl), diretoria: true, grupo: 'Comercial', nome: 'Comissão por vendedor', descricao: 'Comissão sobre as vendas ganhas no período, com o percentual que você definir.', opcao: { k: 'pct', rotulo: 'Comissão', padrao: 5, sufixo: '%' },
    gerar: (c, op) => {
      const pct = op.pct ?? 5;
      const ini = () => ({ vendas: 0, faturamento: 0 });
      const linhas = comAjustes(c, agrupar(ganhos(c.leads), l => vend(c, l), (a, l) => { a.vendas++; a.faturamento += valor(l); }, ini), ini)
        .map(a => ({ vendedor: a.chave, vendas: a.vendas, faturamento: a.faturamento, pct, comissao: a.faturamento * pct / 100 })).sort((a, b) => b.comissao - a.comissao);
      return { grafico: { tipo: 'barras', formato: 'brl', dados: linhas.map(l => ({ rotulo: l.vendedor, valor: l.comissao })) },
        colunas: [{ k: 'vendedor', t: 'Vendedor' }, { k: 'vendas', t: 'Vendas', tipo: 'n' }, { k: 'faturamento', t: 'Faturamento', tipo: 'brl' }, { k: 'pct', t: '% comissão', tipo: 'pct' }, { k: 'comissao', t: 'Comissão', tipo: 'brl' }], linhas,
        total: { vendedor: 'Total', vendas: linhas.reduce((s, l) => s + l.vendas, 0), faturamento: linhas.reduce((s, l) => s + l.faturamento, 0), comissao: linhas.reduce((s, l) => s + l.comissao, 0) } };
    } },
  { id: 'descontos', comparar: { chave: l => l.vendedor, metrica: 'desconto', rotulo: 'Desconto', formato: 'brl' },
    insights: (r, ant) => {
      const out = insightTotal(r, ant, 'desconto', 'O desconto concedido', kbrl).map(i => ({ ...i, tipo: (i.tipo === 'positivo' ? 'alerta' : 'positivo') as Insight['tipo'] }));
      const bruto = somaCol(r, 'bruto'), desc = somaCol(r, 'desconto'), media = bruto ? desc / bruto * 100 : 0;
      const altos = r.linhas.filter(l => l.vendas >= 2 && l.pct > media * 1.5 && l.pct > 5);
      if (altos.length) out.push({ tipo: 'alerta', titulo: `Desconto acima da média: ${altos.map(l => `${l.vendedor} (${num(l.pct, 1)}%)`).join(', ')}`, texto: `A média do time é ${num(media, 1)}%. Desconto alto corrói margem e vira hábito do cliente.`, acao: 'Criar alçada: acima de 10% precisa de aprovação da diretoria; trocar desconto por bonificação de inserções.' });
      return out;
    }, grupo: 'Comercial', nome: 'Descontos concedidos', descricao: 'Quanto cada vendedor deu de desconto: valor bruto, desconto e percentual sobre o bruto.',
    gerar: c => {
      const linhas = agrupar(ganhos(c.leads), l => vend(c, l), (a, l) => { a.vendas++; a.liquido += valor(l); a.desconto += Number(l.desconto) || 0; }, () => ({ vendas: 0, liquido: 0, desconto: 0 }))
        .map(a => ({ vendedor: a.chave, vendas: a.vendas, bruto: a.liquido + a.desconto, desconto: a.desconto, liquido: a.liquido, pct: a.liquido + a.desconto ? a.desconto / (a.liquido + a.desconto) * 100 : 0 })).sort((a, b) => b.pct - a.pct);
      return { grafico: { tipo: 'barras', formato: 'pct', dados: linhas.map(l => ({ rotulo: l.vendedor, valor: l.pct })) },
        colunas: [{ k: 'vendedor', t: 'Vendedor' }, { k: 'vendas', t: 'Vendas', tipo: 'n' }, { k: 'bruto', t: 'Valor bruto', tipo: 'brl' }, { k: 'desconto', t: 'Desconto', tipo: 'brl' }, { k: 'liquido', t: 'Valor líquido', tipo: 'brl' }, { k: 'pct', t: '% de desconto', tipo: 'pct' }], linhas };
    } },
  { id: 'perdas', comparar: { chave: l => l.categoria, metrica: 'valor', rotulo: 'Valor perdido', formato: 'brl', total: r => r.linhas.length },
    insights: (r) => {
      const out: Insight[] = [];
      const cats = new Map<string, { qtd: number; valor: number }>();
      r.linhas.forEach(l => { const c = cats.get(l.categoria) || { qtd: 0, valor: 0 }; c.qtd++; c.valor += l.valor; cats.set(l.categoria, c); });
      const ACOES: Record<string, string> = {
        'Preço / orçamento': 'Montar um pacote de entrada (ex.: 30 inserções/mês) e oferecer parcelamento; vender pelo custo por pessoa impactada, não pelo preço da inserção.',
        'Concorrente': 'Levar o comparativo de audiência e o relatório de veiculação; oferecer período de teste curto para quem saiu para outra mídia.',
        'Sem retorno': 'Cadência de 3 contatos em 10 dias (WhatsApp, ligação, visita) antes de dar como perdido.',
        'Momento / adiou': 'Agendar retorno com data no CRM e voltar com proposta sazonal (datas comemorativas do segmento).',
        'Não viu resultado': 'Entregar comprovante de veiculação mensal e sugerir chamada para ação mensurável (cupom, WhatsApp com código).',
        'Não informado': 'Tornar o motivo de perda detalhado obrigatório: sem motivo não dá para corrigir o processo.',
      };
      const top = [...cats.entries()].sort((a, b) => b[1].qtd - a[1].qtd)[0];
      if (top) out.push({ tipo: 'alerta', titulo: `Principal motivo: ${top[0]} (${num(top[1].qtd / r.linhas.length * 100, 0)}% das perdas)`, texto: `${top[1].qtd} negócios, ${kbrl(top[1].valor)} que não entraram.`, acao: ACOES[top[0]] || 'Ler os motivos registrados com o time e definir uma resposta padrão para essa objeção.' });
      const ni = cats.get('Não informado');
      if (ni && ni.qtd / r.linhas.length > 0.3 && top?.[0] !== 'Não informado') out.push({ tipo: 'oportunidade', titulo: `${num(ni.qtd / r.linhas.length * 100, 0)}% das perdas sem motivo`, texto: 'Sem o motivo, a gestão não enxerga o que corrigir.', acao: ACOES['Não informado'] });
      return out;
    }, grupo: 'Comercial', nome: 'Motivos de perda', descricao: 'Negócios perdidos no período, agrupados pelo motivo registrado na perda.',
    gerar: async c => {
      const perdidos = c.leads.filter(l => l.status === 'perdido');
      const notas: Record<number, any> = {};
      for (const b of blocos(perdidos.map(l => l.id))) {
        const { data } = await supabase.from('leads').select('id, notas').in('id', b);
        (data || []).forEach((x: any) => { notas[x.id] = x.notas; });
      }
      const linhas = perdidos.map(l => {
        const motivo = motivoDe({ notas: notas[l.id] });
        const cat = CATEGORIAS_PERDA.find(([, re]) => re.test(motivo))?.[0] || (motivo ? 'Outros' : 'Não informado');
        return { data: l.fechado_em || l.created_at, cliente: l.empresa, vendedor: vend(c, l), valor: valor(l), categoria: cat, motivo: motivo || '—' };
      }).sort((a, b) => String(b.data).localeCompare(String(a.data)));
      const cats = agrupar(linhas, l => l.categoria, (a, l) => { a.qtd++; a.valor += l.valor; }, () => ({ qtd: 0, valor: 0 })).sort((a, b) => b.qtd - a.qtd);
      return { grafico: { tipo: 'rosca', formato: 'n', dados: cats.map(x => ({ rotulo: x.chave, valor: x.qtd })) }, resumo: `${linhas.length} negócios perdidos · ${kbrl(linhas.reduce((s, l) => s + l.valor, 0))} que deixaram de entrar`,
        colunas: [{ k: 'data', t: 'Data', tipo: 'data' }, { k: 'cliente', t: 'Cliente' }, { k: 'vendedor', t: 'Vendedor' }, { k: 'valor', t: 'Valor', tipo: 'brl' }, { k: 'categoria', t: 'Categoria' }, { k: 'motivo', t: 'Motivo registrado' }], linhas };
    } },
  { id: 'novos_recorrentes', comparar: { chave: l => l.tipo, metrica: 'valor', rotulo: 'Faturamento', formato: 'brl' },
    insights: (r) => {
      const tot = somaCol(r, 'valor'), novo = r.linhas.filter(l => l.tipo === 'Novo').reduce((s, l) => s + l.valor, 0), pct = tot ? novo / tot * 100 : 0;
      if (!tot) return [];
      if (pct < 20) return [{ tipo: 'alerta', titulo: `Só ${num(pct, 0)}% veio de cliente novo`, texto: 'A empresa está vivendo da carteira; sem cliente novo, o faturamento estaciona quando alguém cancela.', acao: 'Meta de prospecção por vendedor (ex.: 2 clientes novos/mês) usando o "Ao redor" com filtro de potencial alto.' }];
      if (pct > 70) return [{ tipo: 'oportunidade', titulo: `${num(pct, 0)}% veio de cliente novo`, texto: 'Ótima captação, mas pouca recompra: o cliente compra uma vez e não volta.', acao: 'Plano de renovação: contato 30 dias antes do fim do contrato com proposta de continuidade e bônus para contrato anual.' }];
      return [{ tipo: 'positivo', titulo: `Equilíbrio: ${num(pct, 0)}% novos, ${num(100 - pct, 0)}% recorrentes`, texto: 'Mix saudável entre captação e retenção.' }];
    }, grupo: 'Comercial', nome: 'Clientes novos × recorrentes', descricao: 'Das vendas do período, quanto veio de clientes que já compraram antes e quanto de clientes novos.',
    gerar: async c => {
      const vs = ganhos(c.leads);
      const ids = [...new Set(vs.map(l => l.client_id).filter(Boolean))];
      const anteriores: Record<number, number> = {};
      const ini = new Date(c.dataInicio + 'T00:00:00').toISOString();
      for (const b of blocos(ids)) {
        const { data } = await supabase.from('leads').select('client_id').in('client_id', b).eq('status', 'ganho').lt('fechado_em', ini).limit(1000);
        (data || []).forEach((x: any) => { anteriores[x.client_id] = (anteriores[x.client_id] || 0) + 1; });
      }
      const linhas = vs.map(l => ({ cliente: l.empresa, vendedor: vend(c, l), data: l.fechado_em || l.created_at, valor: valor(l), compras_antes: l.client_id ? anteriores[l.client_id] || 0 : 0, tipo: l.client_id && anteriores[l.client_id] ? 'Recorrente' : 'Novo' }))
        .sort((a, b) => b.valor - a.valor);
      const g = agrupar(linhas, l => l.tipo, (a, l) => { a.valor += l.valor; a.qtd++; }, () => ({ valor: 0, qtd: 0 }));
      return { grafico: { tipo: 'rosca', formato: 'brl', dados: g.map(x => ({ rotulo: `${x.chave} (${x.qtd})`, valor: x.valor })) },
        colunas: [{ k: 'cliente', t: 'Cliente' }, { k: 'tipo', t: 'Tipo' }, { k: 'compras_antes', t: 'Compras anteriores', tipo: 'n' }, { k: 'vendedor', t: 'Vendedor' }, { k: 'data', t: 'Data', tipo: 'data' }, { k: 'valor', t: 'Valor', tipo: 'brl' }], linhas };
    } },
  { id: 'funil', insights: (r) => {
      const out: Insight[] = [];
      const maior = [...r.linhas].sort((a, b) => b.qtd - a.qtd)[0];
      if (maior && maior.qtd) out.push({ tipo: 'oportunidade', titulo: `Gargalo em "${maior.etapa}": ${maior.qtd} negócios`, texto: `${kbrl(maior.valor)} parados nessa etapa.`, acao: maior.etapa === 'Novo' || maior.etapa === 'Contato' ? 'Mutirão de primeiro contato: cada vendedor qualifica os 10 leads mais antigos desta etapa nesta semana.' : 'Revisar as propostas em aberto: prazo de validade, follow-up marcado e próximo passo combinado com o cliente.' });
      const pond = somaCol(r, 'ponderado');
      if (pond) out.push({ tipo: 'positivo', titulo: `Previsão ponderada do pipeline: ${kbrl(pond)}`, texto: 'É o valor que tende a fechar pelas chances de cada etapa.' });
      return out;
    }, grupo: 'Comercial', nome: 'Funil por etapa (pipeline aberto)', descricao: 'Negócios em aberto hoje em cada etapa, com valor total e valor ponderado pela chance de fechar.',
    gerar: async c => {
      const { data } = await escopo(supabase.from('leads').select('id, etapa, valor_total, user_id, vendedor_nome').eq('status', 'aberto'), c).limit(3000);
      const prob: Record<number, number> = { 0: .1, 1: .25, 2: .45, 3: .7 }, nomes = ['Novo', 'Contato', 'Proposta', 'Negociação'];
      const linhas = [0, 1, 2, 3].map(e => { const ls = (data || []).filter((l: any) => Math.min(Number(l.etapa) || 0, 3) === e); const v = ls.reduce((s: number, l: any) => s + valor(l), 0); return { etapa: nomes[e], qtd: ls.length, valor: v, chance: prob[e] * 100, ponderado: v * prob[e] }; });
      return { grafico: { tipo: 'colunas', formato: 'brl', serie: 'Valor', serie2: 'Ponderado', dados: linhas.map(l => ({ rotulo: l.etapa, valor: l.valor, valor2: l.ponderado })) },
        colunas: [{ k: 'etapa', t: 'Etapa' }, { k: 'qtd', t: 'Negócios', tipo: 'n' }, { k: 'valor', t: 'Valor', tipo: 'brl' }, { k: 'chance', t: 'Chance de fechar', tipo: 'pct' }, { k: 'ponderado', t: 'Valor ponderado', tipo: 'brl' }], linhas,
        total: { etapa: 'Total', qtd: linhas.reduce((s, l) => s + l.qtd, 0), valor: linhas.reduce((s, l) => s + l.valor, 0), ponderado: linhas.reduce((s, l) => s + l.ponderado, 0) } };
    } },
  { id: 'followups', insights: (r) => {
      if (!r.linhas.length) return [{ tipo: 'positivo', titulo: 'Nenhum follow-up atrasado', texto: 'O time está em dia com os retornos.' }];
      const velhos = r.linhas.filter(l => l.dias > 30);
      const out: Insight[] = [{ tipo: 'alerta', titulo: `${r.linhas.length} retornos atrasados`, texto: `${kbrl(somaCol(r, 'valor'))} em negociações esfriando.`, acao: 'Bloco fixo de 1 hora por dia só para retornos; começar pelos de maior valor.' }];
      if (velhos.length) out.push({ tipo: 'oportunidade', titulo: `${velhos.length} atrasados há mais de 30 dias`, texto: 'Provavelmente já esfriaram.', acao: 'Fazer um último contato de reativação; sem resposta, marcar como perdido com motivo para limpar o funil.' });
      return out;
    }, grupo: 'Comercial', nome: 'Follow-ups atrasados', descricao: 'Negócios em aberto com retorno vencido, por vendedor. Quanto mais antigo, maior o risco de perder.',
    gerar: async c => {
      const h = hoje();
      const { data } = await escopo(supabase.from('leads').select('id, empresa, followup_em, valor_total, user_id, vendedor_nome, etapa').eq('status', 'aberto').lt('followup_em', h).not('followup_em', 'is', null), c).order('followup_em').limit(1000);
      const linhas = (data || []).map((l: any) => ({ cliente: l.empresa, vendedor: vend(c, l), followup: l.followup_em, dias: Math.round((new Date(h + 'T12:00').getTime() - new Date(l.followup_em + 'T12:00').getTime()) / 86400000), valor: valor(l) }));
      const g = agrupar(linhas, (l: any) => l.vendedor, (a, l) => { a.qtd++; }, () => ({ qtd: 0 })).sort((a, b) => b.qtd - a.qtd);
      return { grafico: { tipo: 'barras', formato: 'n', dados: g.map(x => ({ rotulo: x.chave, valor: x.qtd })) }, resumo: `${linhas.length} follow-ups atrasados · ${kbrl(linhas.reduce((s: number, l: any) => s + l.valor, 0))} em negociação parada`,
        colunas: [{ k: 'cliente', t: 'Cliente' }, { k: 'vendedor', t: 'Vendedor' }, { k: 'followup', t: 'Retorno era em', tipo: 'data' }, { k: 'dias', t: 'Dias de atraso', tipo: 'n' }, { k: 'valor', t: 'Valor', tipo: 'brl' }], linhas };
    } },
  { id: 'origem', comparar: { chave: l => l.origem, metrica: 'leads', rotulo: 'Leads', formato: 'n' },
    insights: (r) => {
      const validas = r.linhas.filter(l => l.leads >= 5);
      if (validas.length < 2) return [];
      const melhor = [...validas].sort((a, b) => b.conversao - a.conversao)[0], pior = [...validas].sort((a, b) => a.conversao - b.conversao)[0];
      return [{ tipo: 'oportunidade', titulo: `"${melhor.origem}" converte ${num(melhor.conversao, 0)}%; "${pior.origem}", ${num(pior.conversao, 0)}%`, texto: 'A origem do lead muda muito a chance de fechar.', acao: `Colocar mais esforço em "${melhor.origem}" e revisar a qualificação dos leads de "${pior.origem}" antes de mandar proposta.` }];
    }, grupo: 'Comercial', nome: 'Origem dos leads', descricao: 'De onde vêm os leads e quais origens mais viram venda.',
    gerar: c => {
      const linhas = agrupar(c.leads, l => l.origem || 'Não informada', (a, l) => { a.leads++; if (l.status === 'ganho') { a.vendas++; a.faturamento += valor(l); } }, () => ({ leads: 0, vendas: 0, faturamento: 0 }))
        .map(a => ({ origem: a.chave, leads: a.leads, vendas: a.vendas, conversao: a.leads ? a.vendas / a.leads * 100 : 0, faturamento: a.faturamento })).sort((a, b) => b.leads - a.leads);
      return { grafico: { tipo: 'colunas', formato: 'n', serie: 'Leads', serie2: 'Vendas', dados: linhas.map(l => ({ rotulo: l.origem, valor: l.leads, valor2: l.vendas })) },
        colunas: [{ k: 'origem', t: 'Origem' }, { k: 'leads', t: 'Leads', tipo: 'n' }, { k: 'vendas', t: 'Vendas', tipo: 'n' }, { k: 'conversao', t: 'Conversão', tipo: 'pct' }, { k: 'faturamento', t: 'Faturamento', tipo: 'brl' }], linhas };
    } },
  { id: 'agencia', comparar: { chave: l => l.canal, metrica: 'faturamento', rotulo: 'Faturamento', formato: 'brl' },
    insights: (r) => {
      const ag = r.linhas.find(l => l.canal === 'Agência');
      if (ag && ag.participacao > 50) return [{ tipo: 'alerta', titulo: `${num(ag.participacao, 0)}% do faturamento vem de agência`, texto: 'Dependência alta: a agência negocia preço e leva comissão.', acao: 'Aumentar a venda direta ao anunciante local, com pacotes próprios e atendimento do vendedor.' }];
      return [];
    }, grupo: 'Comercial', nome: 'Agência × venda direta', descricao: 'Quanto do faturamento passa por agência e quanto é venda direta ao anunciante.',
    gerar: c => {
      const linhas = agrupar(ganhos(c.leads), l => l.tipo === 'Agência' ? 'Agência' : 'Venda direta', (a, l) => { a.vendas++; a.faturamento += valor(l); }, () => ({ vendas: 0, faturamento: 0 }))
        .map(a => ({ canal: a.chave, vendas: a.vendas, faturamento: a.faturamento, ticket: a.vendas ? a.faturamento / a.vendas : 0 }));
      const tot = linhas.reduce((s, l) => s + l.faturamento, 0);
      linhas.forEach((l: any) => { l.participacao = tot ? l.faturamento / tot * 100 : 0; });
      return { grafico: { tipo: 'rosca', formato: 'brl', dados: linhas.map(l => ({ rotulo: l.canal, valor: l.faturamento })) },
        colunas: [{ k: 'canal', t: 'Canal' }, { k: 'vendas', t: 'Vendas', tipo: 'n' }, { k: 'faturamento', t: 'Faturamento', tipo: 'brl' }, { k: 'ticket', t: 'Ticket médio', tipo: 'brl' }, { k: 'participacao', t: 'Participação', tipo: 'pct' }], linhas };
    } },
  { id: 'segmento', comparar: { chave: l => l.segmento, metrica: 'faturamento', rotulo: 'Faturamento', formato: 'brl' },
    insights: (r, ant) => {
      const out: Insight[] = [];
      const tot = somaCol(r, 'faturamento'), top = r.linhas.find(l => l.segmento !== 'Sem segmento');
      if (top && tot) out.push({ tipo: 'oportunidade', titulo: `${top.segmento} é o segmento que mais compra (${num(top.faturamento / tot * 100, 0)}%)`, texto: `${top.clientes} clientes, ticket médio de ${kbrl(top.ticket)}.`, acao: `Prospectar mais ${top.segmento.toLowerCase()} pelo "Ao redor" (aparecem como potencial alto) e montar um case com um cliente atual do segmento.` });
      const antMap = porChave(ant, 'segmento', 'faturamento');
      const cresceu = r.linhas.map(l => ({ s: l.segmento, v: varPct(l.faturamento, antMap.get(l.segmento) || 0) })).filter(x => x.v !== null && x.v > 30 && x.s !== 'Sem segmento').sort((a, b) => b.v! - a.v!)[0];
      if (cresceu) out.push({ tipo: 'positivo', titulo: `${cresceu.s} cresceu ${num(cresceu.v!, 0)}%`, texto: 'Segmento aquecido no período.' });
      const sem = r.linhas.find(l => l.segmento === 'Sem segmento');
      if (sem && tot && sem.faturamento / tot > 0.3) out.push({ tipo: 'oportunidade', titulo: `${num(sem.faturamento / tot * 100, 0)}% das vendas sem segmento no cliente`, texto: 'Sem segmento, este relatório e o potencial do mapa ficam cegos.', acao: 'Pedir para cada vendedor completar o segmento dos seus 20 maiores clientes.' });
      return out;
    }, grupo: 'Comercial', nome: 'Faturamento por segmento', descricao: 'Em quais segmentos de cliente (supermercado, farmácia, concessionária…) a venda está concentrada.',
    gerar: async c => {
      const vs = ganhos(c.leads);
      const seg: Record<number, string> = {};
      for (const b of blocos([...new Set(vs.map(l => l.client_id).filter(Boolean))])) {
        const { data } = await supabase.from('clientes').select('id, segmento').in('id', b);
        (data || []).forEach((x: any) => { seg[x.id] = x.segmento || ''; });
      }
      const linhas = agrupar(vs, l => seg[l.client_id] || 'Sem segmento', (a, l) => { a.vendas++; a.faturamento += valor(l); a.clientes.add(l.client_id || l.empresa); }, () => ({ vendas: 0, faturamento: 0, clientes: new Set() }))
        .map(a => ({ segmento: a.chave, clientes: a.clientes.size, vendas: a.vendas, faturamento: a.faturamento, ticket: a.vendas ? a.faturamento / a.vendas : 0 })).sort((a, b) => b.faturamento - a.faturamento);
      return { grafico: { tipo: 'barras', formato: 'brl', dados: linhas.map(l => ({ rotulo: l.segmento, valor: l.faturamento })) },
        colunas: [{ k: 'segmento', t: 'Segmento' }, { k: 'clientes', t: 'Clientes', tipo: 'n' }, { k: 'vendas', t: 'Vendas', tipo: 'n' }, { k: 'faturamento', t: 'Faturamento', tipo: 'brl' }, { k: 'ticket', t: 'Ticket médio', tipo: 'brl' }], linhas };
    } },
  { id: 'visitas_vendedor', comparar: { chave: l => l.vendedor, metrica: 'visitas', rotulo: 'Visitas', formato: 'n' },
    insights: (r, ant) => {
      const out = insightTotal(r, ant, 'visitas', 'O número de visitas', v => num(v));
      const ruins = r.linhas.filter(l => l.visitas >= 8 && l.conv < 5);
      if (ruins.length) out.push({ tipo: 'oportunidade', titulo: `Muitas visitas e pouca venda: ${ruins.map(l => l.vendedor).join(', ')}`, texto: 'Estão visitando, mas a visita não vira negócio.', acao: 'Planejar a visita (objetivo, proposta pronta) e priorizar comércios de potencial alto no "Ao redor".' });
      const media = r.linhas.length ? somaCol(r, 'visitas') / r.linhas.length : 0;
      const poucas = r.linhas.filter(l => l.visitas < media * 0.5);
      if (poucas.length && media >= 4) out.push({ tipo: 'alerta', titulo: `Abaixo da metade da média de visitas: ${poucas.map(l => l.vendedor).join(', ')}`, texto: `Média do time: ${num(media, 1)} visitas no período.`, acao: 'Meta semanal de visitas e Rota do Dia montada pela liderança.' });
      return out;
    }, grupo: 'Comercial', nome: 'Visitas por vendedor', descricao: 'Visitas feitas no período, quantas viraram lead e quantas viraram venda.',
    gerar: c => {
      const status: Record<number, string> = {}; c.leads.forEach(l => { status[l.id] = l.status; });
      const linhas = agrupar(c.visitas, v => c.nomesMap[v.user_id] || 'Sem vendedor', (a, v) => { a.visitas++; if (v.lead_id) a.leads++; if (v.lead_id && status[v.lead_id] === 'ganho') a.vendas++; }, () => ({ visitas: 0, leads: 0, vendas: 0 }))
        .map(a => ({ vendedor: a.chave, visitas: a.visitas, leads: a.leads, vendas: a.vendas, conv: a.visitas ? a.vendas / a.visitas * 100 : 0 })).sort((a, b) => b.visitas - a.visitas);
      return { grafico: { tipo: 'colunas', formato: 'n', serie: 'Visitas', serie2: 'Viraram lead', dados: linhas.map(l => ({ rotulo: l.vendedor, valor: l.visitas, valor2: l.leads })) },
        colunas: [{ k: 'vendedor', t: 'Vendedor' }, { k: 'visitas', t: 'Visitas', tipo: 'n' }, { k: 'leads', t: 'Viraram lead', tipo: 'n' }, { k: 'vendas', t: 'Viraram venda', tipo: 'n' }, { k: 'conv', t: 'Visita → venda', tipo: 'pct' }], linhas };
    } },
  { id: 'top_clientes', comparar: { chave: l => l.cliente, metrica: 'faturamento', rotulo: 'Faturamento', formato: 'brl' },
    insights: (r) => {
      const top10 = r.linhas.slice(0, 10).reduce((s, l) => s + l.part, 0);
      if (top10 > 50) return [{ tipo: 'alerta', titulo: `Os 10 maiores somam ${num(top10, 0)}% do faturamento`, texto: 'Perder um deles pesa muito no mês.', acao: 'Contrato anual com os 10 maiores (com bônus de inserções) e contato mensal da diretoria.' }];
      return [{ tipo: 'positivo', titulo: `Carteira pulverizada: os 10 maiores somam ${num(top10, 0)}%`, texto: 'Nenhum cliente sozinho ameaça o faturamento.' }];
    }, grupo: 'Comercial', nome: 'Maiores clientes (concentração)', descricao: 'Os clientes que mais compraram no período e quanto do faturamento depende deles.',
    gerar: c => {
      const vs = agrupar(ganhos(c.leads), l => l.empresa || '—', (a, l) => { a.vendas++; a.faturamento += valor(l); }, () => ({ vendas: 0, faturamento: 0 })).sort((a, b) => b.faturamento - a.faturamento);
      const tot = vs.reduce((s, x) => s + x.faturamento, 0); let acum = 0;
      const linhas = vs.map((x, i) => { acum += x.faturamento; return { pos: i + 1, cliente: x.chave, vendas: x.vendas, faturamento: x.faturamento, part: tot ? x.faturamento / tot * 100 : 0, acum: tot ? acum / tot * 100 : 0 }; });
      const top10 = linhas.slice(0, 10).reduce((s, l) => s + l.part, 0);
      return { grafico: { tipo: 'barras', formato: 'brl', dados: linhas.slice(0, 10).map(l => ({ rotulo: l.cliente, valor: l.faturamento })) }, resumo: `Os 10 maiores clientes somam ${num(top10, 1)}% do faturamento do período`,
        colunas: [{ k: 'pos', t: '#', tipo: 'n' }, { k: 'cliente', t: 'Cliente' }, { k: 'vendas', t: 'Vendas', tipo: 'n' }, { k: 'faturamento', t: 'Faturamento', tipo: 'brl' }, { k: 'part', t: 'Participação', tipo: 'pct' }, { k: 'acum', t: 'Acumulado', tipo: 'pct' }], linhas };
    } },
  // ───────── Produtos e grade
  { id: 'produtos', comparar: { chave: l => l.produto, metrica: 'valor', rotulo: 'Valor', formato: 'brl' },
    insights: (r, ant) => {
      const antMap = porChave(ant, 'produto', 'valor'); const out: Insight[] = [];
      const vars = r.linhas.map(l => ({ p: l.produto, v: varPct(l.valor, antMap.get(l.produto) || 0) })).filter(x => x.v !== null);
      const sobe = [...vars].sort((a, b) => b.v! - a.v!)[0], cai = [...vars].sort((a, b) => a.v! - b.v!)[0];
      if (sobe && sobe.v! > 20) out.push({ tipo: 'positivo', titulo: `${sobe.p} cresceu ${num(sobe.v!, 0)}%`, texto: 'Produto em alta no período.', acao: 'Usar como porta de entrada em propostas para clientes novos.' });
      if (cai && cai.v! < -20) out.push({ tipo: 'alerta', titulo: `${cai.p} caiu ${num(Math.abs(cai.v!), 0)}%`, texto: 'Venda desse produto esfriou.', acao: 'Rever preço e apresentação; incluir em pacote com o produto que mais vende.' });
      return out;
    }, grupo: 'Produtos e grade', nome: 'Vendas por produto', descricao: 'Quantidade vendida e valor de cada produto ou formato (spot, testemunhal, patrocínio…).',
    gerar: c => {
      const its = ganhos(c.leads).flatMap(l => itensDe(l).map(i => ({ ...i, _lead: l })));
      const linhas = agrupar(its, i => i.servico || 'Sem nome', (a, i) => { a.qtd += Number(i.quantidade) || 0; a.valor += (i.bonificacao || i.tipoEspecial) ? 0 : (Number(i.quantidade) || 0) * (Number(i.precoUnitario) || 0); a.contratos.add(i._lead.id); }, () => ({ qtd: 0, valor: 0, contratos: new Set() }))
        .map(a => ({ produto: a.chave, contratos: a.contratos.size, qtd: a.qtd, valor: a.valor, medio: a.qtd ? a.valor / a.qtd : 0 })).sort((a, b) => b.valor - a.valor);
      return { grafico: { tipo: 'barras', formato: 'brl', dados: linhas.slice(0, 15).map(l => ({ rotulo: l.produto, valor: l.valor })) },
        colunas: [{ k: 'produto', t: 'Produto' }, { k: 'contratos', t: 'Contratos', tipo: 'n' }, { k: 'qtd', t: 'Quantidade', tipo: 'n' }, { k: 'valor', t: 'Valor (tabela)', tipo: 'brl' }, { k: 'medio', t: 'Preço médio', tipo: 'brl' }], linhas };
    } },
  { id: 'programas', comparar: { chave: l => `${l.programa} ${l.faixa}`, metrica: 'ins', rotulo: 'Inserções', formato: 'n' },
    insights: (r) => {
      const top = r.linhas[0];
      return top ? [{ tipo: 'oportunidade', titulo: `Faixa mais vendida: ${top.programa} ${top.faixa}`, texto: `${num(top.ins)} inserções no período.`, acao: 'Se a faixa está perto de lotar, subir o preço dela e oferecer as faixas vizinhas como alternativa.' }] : [];
    }, grupo: 'Produtos e grade', nome: 'Vendas por programa e horário', descricao: 'Inserções vendidas por programa e faixa horária: onde a grade está mais vendida.',
    gerar: c => {
      const its = ganhos(c.leads).flatMap(l => itensDe(l));
      const linhas = agrupar(its, i => `${(i.programa || 'ROTATIVO').toString().toUpperCase()}|${i.horario_inicial || '06:00'}–${i.horario_final || '20:00'}`, (a, i) => { a.ins += Number(i.quantidade) || 0; a.valor += (i.bonificacao || i.tipoEspecial) ? 0 : (Number(i.quantidade) || 0) * (Number(i.precoUnitario) || 0); }, () => ({ ins: 0, valor: 0 }))
        .map(a => { const [programa, faixa] = a.chave.split('|'); return { programa, faixa, ins: a.ins, valor: a.valor }; }).sort((a, b) => b.ins - a.ins);
      return { grafico: { tipo: 'barras', formato: 'n', dados: linhas.slice(0, 15).map(l => ({ rotulo: `${l.programa} ${l.faixa}`, valor: l.ins })) },
        colunas: [{ k: 'programa', t: 'Programa' }, { k: 'faixa', t: 'Faixa horária' }, { k: 'ins', t: 'Inserções', tipo: 'n' }, { k: 'valor', t: 'Valor (tabela)', tipo: 'brl' }], linhas };
    } },
  // ───────── Contratos e financeiro
  { id: 'renovacoes', insights: (r) => {
      const v30 = r.linhas.filter(l => l.dias <= 30), total = somaCol(r, 'valor');
      if (!r.linhas.length) return [{ tipo: 'positivo', titulo: 'Nenhum contrato vencendo em 90 dias', texto: 'Sem risco de renovação no curto prazo.' }];
      const out: Insight[] = [{ tipo: 'oportunidade', titulo: `${kbrl(total)} para renovar em 90 dias`, texto: `${r.linhas.length} contratos.`, acao: 'Ligar 30 dias antes do fim com proposta de continuidade; oferecer bônus para quem renovar por 12 meses.' }];
      if (v30.length) out.unshift({ tipo: 'alerta', titulo: `${v30.length} contratos vencem em até 30 dias`, texto: `${kbrl(v30.reduce((s, l) => s + l.valor, 0))} em risco imediato.`, acao: 'Contato ainda esta semana; o vendedor responsável já leva a proposta de renovação.' });
      return out;
    }, grupo: 'Contratos e financeiro', nome: 'Renovações a vencer (90 dias)', descricao: 'Contratos que terminam nos próximos 90 dias. É a lista de ligação da semana.',
    gerar: async c => {
      const h = hoje();
      const { data } = await escopo(supabase.from('leads').select('id, empresa, contrato_fim, valor_total, user_id, vendedor_nome, unidade').eq('status', 'ganho').gte('contrato_fim', h).lte('contrato_fim', somaDias(h, 90)), c).order('contrato_fim').limit(1000);
      const linhas = (data || []).map((l: any) => { const dias = Math.round((new Date(l.contrato_fim + 'T12:00').getTime() - new Date(h + 'T12:00').getTime()) / 86400000); return { cliente: l.empresa, vendedor: vend(c, l), unidade: l.unidade || '—', fim: l.contrato_fim, dias, faixa: dias <= 30 ? 'Até 30 dias' : dias <= 60 ? '31 a 60 dias' : '61 a 90 dias', valor: valor(l) }; });
      const g = ['Até 30 dias', '31 a 60 dias', '61 a 90 dias'].map(f => ({ rotulo: f, valor: linhas.filter((l: any) => l.faixa === f).reduce((s: number, l: any) => s + l.valor, 0) }));
      return { grafico: { tipo: 'colunas', formato: 'brl', serie: 'Valor a renovar', dados: g }, resumo: `${linhas.length} contratos · ${kbrl(linhas.reduce((s: number, l: any) => s + l.valor, 0))} para renovar`,
        colunas: [{ k: 'cliente', t: 'Cliente' }, { k: 'vendedor', t: 'Vendedor' }, { k: 'unidade', t: 'Unidade' }, { k: 'fim', t: 'Vence em', tipo: 'data' }, { k: 'dias', t: 'Dias', tipo: 'n' }, { k: 'valor', t: 'Valor do contrato', tipo: 'brl' }], linhas };
    } },
  { id: 'receita_contratada', insights: (r) => {
      const m = r.linhas.map(l => Number(l.receita) || 0);
      if (!m[0]) return [];
      const i = m.findIndex((v, k) => k > 0 && v < m[0] * 0.7);
      if (i > 0) return [{ tipo: 'alerta', titulo: `Receita contratada cai ${num((1 - m[i] / m[0]) * 100, 0)}% em ${r.linhas[i].rotulo}`, texto: `Hoje há ${kbrl(m[0])}/mês contratados; em ${r.linhas[i].rotulo}, ${kbrl(m[i])}. É o "buraco" que precisa ser vendido antes.`, acao: `Focar renovações dos contratos que acabam até ${r.linhas[i].rotulo} e montar campanha comercial para esse mês.` }];
      return [{ tipo: 'positivo', titulo: 'Receita contratada estável nos próximos meses', texto: `${kbrl(m[0])} contratados para este mês.` }];
    }, diretoria: true, grupo: 'Contratos e financeiro', nome: 'Receita contratada (próximos 12 meses)', descricao: 'O que já está vendido para os próximos meses, pelos contratos vigentes (valor do contrato dividido pelos meses de veiculação).',
    gerar: async c => {
      const h = hoje();
      const { data } = await escopo(supabase.from('leads').select('id, contrato_inicio, contrato_fim, valor_total, created_at').eq('status', 'ganho').gte('contrato_fim', h), c).limit(3000);
      const base = new Date(h + 'T12:00'); const meses = Array.from({ length: 12 }, (_, i) => { const d = new Date(base.getFullYear(), base.getMonth() + i, 1); return { chave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, rotulo: `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`, receita: 0, contratos: 0 }; });
      (data || []).forEach((l: any) => {
        const ini = (l.contrato_inicio || l.created_at || h).slice(0, 7), fim = l.contrato_fim.slice(0, 7);
        const [ai, mi] = ini.split('-').map(Number), [af, mf] = fim.split('-').map(Number);
        const total = Math.max((af - ai) * 12 + (mf - mi) + 1, 1), porMes = valor(l) / total;
        meses.forEach(m => { if (m.chave >= ini && m.chave <= fim) { m.receita += porMes; m.contratos++; } });
      });
      return { grafico: { tipo: 'colunas', formato: 'brl', serie: 'Receita contratada', dados: meses.map(m => ({ rotulo: m.rotulo, valor: m.receita })) },
        colunas: [{ k: 'rotulo', t: 'Mês' }, { k: 'contratos', t: 'Contratos ativos', tipo: 'n' }, { k: 'receita', t: 'Receita contratada', tipo: 'brl' }], linhas: meses };
    } },
  { id: 'inadimplencia', insights: (r) => {
      if (!r.linhas.length) return [{ tipo: 'positivo', titulo: 'Nenhuma parcela vencida', texto: 'Recebimentos em dia.' }];
      const mais60 = r.linhas.filter(l => l.dias > 60);
      const out: Insight[] = [{ tipo: 'alerta', titulo: `${kbrl(somaCol(r, 'valor'))} em atraso`, texto: `${r.linhas.length} parcelas vencidas.`, acao: 'Régua de cobrança: lembrete no 1º dia, ligação no 5º, aviso de suspensão da veiculação no 15º.' }];
      if (mais60.length) out.push({ tipo: 'alerta', titulo: `${mais60.length} parcelas com mais de 60 dias`, texto: `${kbrl(mais60.reduce((s, l) => s + l.valor, 0))} com risco alto de não receber.`, acao: 'Suspender novas veiculações desses clientes e negociar parcelamento ou protesto.' });
      return out;
    }, diretoria: true, grupo: 'Contratos e financeiro', nome: 'Parcelas vencidas (inadimplência)', descricao: 'Parcelas de vendas que venceram e não foram pagas, por faixa de atraso.',
    gerar: async c => {
      const h = hoje();
      let q = supabase.from('lancamentos').select('id, titulo, valor, data_vencimento, lead_id').eq('tipo', 'entrada').eq('status', 'pendente').lt('data_vencimento', h).not('lead_id', 'is', null);
      if (c.empresaId) q = q.eq('empresa_id', c.empresaId);
      const { data } = await q.order('data_vencimento').limit(1000);
      const leadInfo: Record<number, any> = {};
      for (const b of blocos([...new Set((data || []).map((x: any) => x.lead_id))])) {
        const { data: ls } = await escopo(supabase.from('leads').select('id, empresa, user_id, vendedor_nome, unidade').in('id', b), c);
        (ls || []).forEach((l: any) => { leadInfo[l.id] = l; });
      }
      const linhas = (data || []).filter((p: any) => leadInfo[p.lead_id]).map((p: any) => { const l = leadInfo[p.lead_id]; const dias = Math.round((new Date(h + 'T12:00').getTime() - new Date(p.data_vencimento + 'T12:00').getTime()) / 86400000); return { cliente: l.empresa, vendedor: vend(c, l), vencimento: p.data_vencimento, dias, faixa: dias <= 15 ? 'Até 15 dias' : dias <= 30 ? '16 a 30 dias' : dias <= 60 ? '31 a 60 dias' : 'Mais de 60 dias', valor: Number(p.valor) || 0 }; });
      const g = ['Até 15 dias', '16 a 30 dias', '31 a 60 dias', 'Mais de 60 dias'].map(f => ({ rotulo: f, valor: linhas.filter((l: any) => l.faixa === f).reduce((s: number, l: any) => s + l.valor, 0) }));
      return { grafico: { tipo: 'colunas', formato: 'brl', serie: 'Em atraso', dados: g }, resumo: `${linhas.length} parcelas · ${kbrl(linhas.reduce((s: number, l: any) => s + l.valor, 0))} em atraso`,
        colunas: [{ k: 'cliente', t: 'Cliente' }, { k: 'vendedor', t: 'Vendedor' }, { k: 'vencimento', t: 'Venceu em', tipo: 'data' }, { k: 'dias', t: 'Dias de atraso', tipo: 'n' }, { k: 'valor', t: 'Valor', tipo: 'brl' }], linhas };
    } },
  { id: 'recebimentos', insights: (r) => r.linhas.length ? [{ tipo: 'positivo', titulo: `${kbrl(somaCol(r, 'valor'))} recebidos no período`, texto: `${r.linhas.length} pagamentos.` }] : [], diretoria: true, grupo: 'Contratos e financeiro', nome: 'Recebimentos do período', descricao: 'O que efetivamente entrou no caixa no período (parcelas pagas), por dia.',
    gerar: async c => {
      let q = supabase.from('lancamentos').select('id, titulo, valor, data_pagamento, data_vencimento').eq('tipo', 'entrada').eq('status', 'pago').gte('data_pagamento', c.dataInicio).lte('data_pagamento', c.dataFim);
      if (c.empresaId) q = q.eq('empresa_id', c.empresaId);
      const { data, error } = await q.order('data_pagamento').limit(3000);
      if (error) return { grafico: null, colunas: [{ k: 'aviso', t: 'Aviso' }], linhas: [{ aviso: 'Não foi possível ler os recebimentos (o financeiro desta conta pode não registrar a data de pagamento).' }] };
      const linhas = (data || []).map((p: any) => ({ data: p.data_pagamento, descricao: p.titulo, vencimento: p.data_vencimento, valor: Number(p.valor) || 0 }));
      const g = agrupar(linhas, (l: any) => String(l.data).slice(0, 10), (a, l: any) => { a.valor += l.valor; }, () => ({ valor: 0 })).sort((a, b) => a.chave.localeCompare(b.chave));
      return { grafico: { tipo: 'colunas', formato: 'brl', serie: 'Recebido', dados: g.map(x => ({ rotulo: dataBR(x.chave).slice(0, 5), valor: x.valor })) }, resumo: `${kbrl(linhas.reduce((s: number, l: any) => s + l.valor, 0))} recebidos no período`,
        colunas: [{ k: 'data', t: 'Pago em', tipo: 'data' }, { k: 'descricao', t: 'Descrição' }, { k: 'vencimento', t: 'Vencimento', tipo: 'data' }, { k: 'valor', t: 'Valor', tipo: 'brl' }], linhas };
    } },
  { id: 'ano_anterior', insights: (r) => {
      const ate = new Date().getMonth();
      const atual = r.linhas.slice(0, ate + 1).reduce((s, l) => s + l.atual, 0), antes = r.linhas.slice(0, ate + 1).reduce((s, l) => s + l.anterior, 0), v = varPct(atual, antes);
      if (v === null) return [];
      const piores = r.linhas.slice(0, ate + 1).filter(l => l.variacao !== null && l.variacao < -15).map(l => l.mes);
      return [{ tipo: v >= 0 ? 'positivo' : 'alerta', titulo: `No acumulado do ano: ${fmtVar(v)} contra o ano passado`, texto: `${kbrl(atual)} até agora, contra ${kbrl(antes)} no mesmo período do ano passado.`, acao: piores.length ? `Entender o que aconteceu em ${piores.join(', ')} e planejar esses meses com antecedência no próximo ano.` : undefined }];
    }, grupo: 'Contratos e financeiro', nome: 'Comparativo com o ano anterior', descricao: 'Faturamento de cada mês deste ano contra o mesmo mês do ano passado.',
    gerar: async c => {
      const ano = new Date().getFullYear();
      const buscar = async (a: number) => {
        const { data } = await escopo(supabase.from('leads').select('valor_total, valor_fechado, fechado_em, created_at, status').eq('status', 'ganho').gte('fechado_em', new Date(a, 0, 1).toISOString()).lt('fechado_em', new Date(a + 1, 0, 1).toISOString()), c).limit(5000);
        const m = Array(12).fill(0); (data || []).forEach((l: any) => { m[new Date(diaReferenciaLead(l) + 'T12:00').getMonth()] += valor(l); }); return m;
      };
      const [atual, anterior] = await Promise.all([buscar(ano), buscar(ano - 1)]);
      const linhas = MESES.map((m, i) => ({ mes: m, anterior: anterior[i], atual: atual[i], variacao: anterior[i] ? (atual[i] - anterior[i]) / anterior[i] * 100 : null }));
      return { grafico: { tipo: 'colunas', formato: 'brl', serie: String(ano - 1), serie2: String(ano), dados: linhas.map(l => ({ rotulo: l.mes, valor: l.anterior, valor2: l.atual })) },
        colunas: [{ k: 'mes', t: 'Mês' }, { k: 'anterior', t: String(ano - 1), tipo: 'brl' }, { k: 'atual', t: String(ano), tipo: 'brl' }, { k: 'variacao', t: 'Variação', tipo: 'pct' }], linhas,
        total: { mes: 'Ano', anterior: anterior.reduce((a, b) => a + b, 0), atual: atual.reduce((a, b) => a + b, 0) } };
    } },
  // ───────── Produção
  { id: 'producao', insights: (r) => {
      const atr = r.linhas.filter(l => l.atraso > 0);
      return atr.length ? [{ tipo: 'alerta', titulo: `${atr.length} jobs atrasados`, texto: 'Atraso na produção atrasa a veiculação e gera reclamação do anunciante.', acao: 'Priorizar os atrasados pela data de início do contrato e avisar o vendedor de cada cliente.' }] : [{ tipo: 'positivo', titulo: 'Produção em dia', texto: 'Nenhum job passou do prazo.' }];
    }, grupo: 'Produção', nome: 'Produção em andamento e atrasos', descricao: 'Jobs de produção ainda não entregues, por etapa, com os que passaram do prazo.',
    gerar: async c => {
      let q = supabase.from('jobs').select('id, titulo, cliente, stage, deadline, created_at, unidade').not('stage', 'in', '(entregue,aguardando_assinatura)');
      if (c.empresaId) q = q.eq('empresa_id', c.empresaId);
      if (c.filtroUnidade !== 'Todas') q = q.eq('unidade', c.filtroUnidade);
      const { data } = await q.order('deadline', { ascending: true }).limit(1000);
      const agora = Date.now();
      const linhas = (data || []).map((j: any) => { const atraso = j.deadline ? Math.floor((agora - new Date(j.deadline).getTime()) / 86400000) : null; return { job: j.titulo || `Job ${j.id}`, cliente: j.cliente || '—', etapa: j.stage, prazo: j.deadline, atraso: atraso !== null && atraso > 0 ? atraso : 0, aberto: Math.floor((agora - new Date(j.created_at).getTime()) / 86400000) }; });
      const g = agrupar(linhas, (l: any) => l.etapa, (a, l: any) => { a.qtd++; if (l.atraso > 0) a.atrasados++; }, () => ({ qtd: 0, atrasados: 0 }));
      return { grafico: { tipo: 'colunas', formato: 'n', serie: 'Em produção', serie2: 'Atrasados', dados: g.map(x => ({ rotulo: x.chave, valor: x.qtd, valor2: x.atrasados })) }, resumo: `${linhas.length} jobs em andamento · ${linhas.filter((l: any) => l.atraso > 0).length} atrasados`,
        colunas: [{ k: 'job', t: 'Job' }, { k: 'cliente', t: 'Cliente' }, { k: 'etapa', t: 'Etapa' }, { k: 'prazo', t: 'Prazo', tipo: 'data' }, { k: 'atraso', t: 'Dias de atraso', tipo: 'n' }, { k: 'aberto', t: 'Dias em aberto', tipo: 'n' }], linhas };
    } },
];

// diretoria: valores de comissão, recebimentos e carteira contratada — só o diretor vê.
export const RELATORIOS = DEFS.map(d => ({ id: d.id, grupo: d.grupo, nome: d.nome, diretoria: Boolean(d.diretoria) }));

// ───────── Gráfico (SVG próprio: barras deitadas, colunas com até 2 séries, rosca)
const CORES = ['#22C55E', '#3B82F6', '#F59E0B', '#A855F7', '#EF4444', '#06B6D4', '#EC4899', '#84CC16'];
function fmtG(v: number, f?: string) { return f === 'brl' ? kbrl(v) : f === 'pct' ? `${num(v, 1)}%` : num(v); }
function GraficoView({ g }: { g: Grafico }) {
  if (!g.dados.length) return <p className="text-slate-500 text-xs py-8 text-center">Sem dados no período.</p>;
  if (g.tipo === 'barras') {
    const max = Math.max(...g.dados.map(d => d.valor), 1);
    return (
      <div className="space-y-1.5">
        {g.dados.slice(0, 15).map((d, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,160px)_minmax(0,1fr)_auto] gap-3 items-center text-xs">
            <span className="text-slate-300 font-bold truncate" title={d.rotulo}>{d.rotulo}</span>
            <div className="h-5 bg-white/5 rounded-md overflow-hidden"><div className="h-full rounded-md bg-[var(--cor-primaria)]" style={{ width: `${Math.max(d.valor / max * 100, 1)}%`, opacity: 1 - i * 0.04 }} /></div>
            <span className="text-white font-black tabular-nums">{fmtG(d.valor, g.formato)}</span>
          </div>
        ))}
      </div>
    );
  }
  if (g.tipo === 'rosca') {
    const tot = g.dados.reduce((s, d) => s + d.valor, 0) || 1; const R = 54, C = 2 * Math.PI * R;
    const fatias = g.dados.map((d, i) => ({ d, i, len: d.valor / tot * C, ini: g.dados.slice(0, i).reduce((s, x) => s + x.valor / tot * C, 0) }));
    return (
      <div className="flex flex-wrap items-center gap-6">
        <svg viewBox="0 0 140 140" className="w-36 h-36 -rotate-90">
          {fatias.map(({ d, i, len, ini }) => <circle key={i} cx="70" cy="70" r={R} fill="none" stroke={CORES[i % CORES.length]} strokeWidth="22" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-ini}><title>{d.rotulo}: {fmtG(d.valor, g.formato)}</title></circle>)}
        </svg>
        <div className="space-y-1.5 text-xs min-w-0">
          {g.dados.map((d, i) => (
            <p key={i} className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: CORES[i % CORES.length] }} /><span className="text-slate-300 font-bold">{d.rotulo}</span><span className="text-white font-black tabular-nums">{fmtG(d.valor, g.formato)}</span><span className="text-slate-500">({num(d.valor / tot * 100, 1)}%)</span></p>
          ))}
        </div>
      </div>
    );
  }
  const max = Math.max(...g.dados.map(d => Math.max(d.valor, d.valor2 || 0)), 1), dois = g.dados.some(d => d.valor2 !== undefined);
  // Rótulo de dados em cima de cada coluna; com duas séries e muitas colunas fica ilegível, aí só no hover
  const rotulos = !dois || g.dados.length <= 8;
  const rotulo = (v: number) => rotulos && v > 0 && <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[8px] font-black text-white whitespace-nowrap">{fmtG(v, g.formato)}</span>;
  return (
    <div>
      {dois && <div className="flex gap-4 text-[10px] text-slate-400 mb-2"><span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-blue-500" />{g.serie}</span><span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-[var(--cor-primaria)]" />{g.serie2}</span></div>}
      <div className="flex items-end gap-1.5 h-48 overflow-x-auto pt-5">
        {g.dados.map((d, i) => (
          <div key={i} className="flex-1 min-w-[34px] h-full flex flex-col justify-end items-center">
            <div className="w-full flex items-end justify-center gap-0.5 h-full">
              <div className={`${dois ? 'w-1/2' : 'w-full'} rounded-t bg-blue-500/80 relative`} style={{ height: `${Math.max(d.valor / max * 100, d.valor ? 2 : 0)}%` }} title={`${g.serie || ''} ${fmtG(d.valor, g.formato)}`}>
                {rotulo(d.valor)}
              </div>
              {dois && <div className="w-1/2 rounded-t bg-[var(--cor-primaria)] relative" style={{ height: `${Math.max((d.valor2 || 0) / max * 100, d.valor2 ? 2 : 0)}%` }} title={`${g.serie2 || ''} ${fmtG(d.valor2 || 0, g.formato)}`}>{rotulo(d.valor2 || 0)}</div>}
            </div>
            <span className="text-[9px] text-slate-500 font-bold mt-1 truncate max-w-full" title={d.rotulo}>{d.rotulo}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function celula(v: any, tipo?: Tipo) {
  if (tipo === 'var') return v === 'novo' ? 'novo' : v === null || v === undefined ? '—' : `${v >= 0 ? '+' : ''}${num(v, 0)}%`;
  if (v === null || v === undefined || v === '') return '—';
  if (tipo === 'brl') return brl(v);
  if (tipo === 'n') return num(v);
  if (tipo === 'pct') return `${num(v, 1)}%`;
  if (tipo === 'data') return dataBR(String(v));
  return String(v);
}
function celulaCsv(v: any, tipo?: Tipo) {
  if (v === null || v === undefined) return '';
  if (tipo === 'var') return v === 'novo' ? 'novo' : (Number(v) || 0).toFixed(1).replace('.', ',') + '%';
  if (tipo === 'brl' || tipo === 'pct' || tipo === 'n') return (Number(v) || 0).toFixed(tipo === 'n' ? 0 : 2).replace('.', ',');
  if (tipo === 'data') return dataBR(String(v));
  const t = String(v); return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export default function RelatoriosGerenciais({ id, ctx }: { id: string; ctx: Ctx }) {
  const def = DEFS.find(d => d.id === id)!;
  const [res, setRes] = useState<Resultado | null>(null);
  const [ant, setAnt] = useState<Resultado | null>(null);
  const [ia, setIa] = useState<{ carregando: boolean; texto?: string; itens?: { titulo: string; analise: string; acao: string; prioridade: string }[]; erro?: string } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [ordem, setOrdem] = useState<{ k: string; asc: boolean } | null>(null);
  const [opcao, setOpcao] = useState<number>(() => {
    if (!def.opcao) return 0;
    try { const v = Number(localStorage.getItem(`rel-op-${def.id}`)); return v || def.opcao.padrao; } catch { return def.opcao.padrao; }
  });

  // Só refaz quando o recorte muda de verdade (não a cada nova referência do ctx — a página
  // recalcula o ctx quando os clientes chegam em segundo plano, e isso refazia as consultas).
  const ctxRef = useRef(ctx);
  useEffect(() => { ctxRef.current = ctx; }); // roda antes do efeito de busca abaixo (ordem de declaração)
  const assinatura = `${ctx.dataInicio}|${ctx.dataFim}|${ctx.filtroUnidade}|${ctx.filtroVendedor}|${ctx.leads.length}|${ctx.visitas.length}`;

  useEffect(() => {
    let cancelado = false;
    setCarregando(true); setErro('');
    const c = ctxRef.current, op = def.opcao ? { [def.opcao.k]: opcao } : {};
    // Relatórios do período rodam também no período anterior (mesmo tamanho) pra comparar
    const anterior = def.comparar ? Promise.resolve(def.gerar({ ...c, leads: c.leadsAnt, visitas: c.visitasAnt, ajustes: c.ajustesAnt, dataInicio: c.periodoAnterior.inicio, dataFim: c.periodoAnterior.fim }, op)).catch(() => null) : Promise.resolve(null);
    Promise.all([Promise.resolve(def.gerar(c, op)), anterior])
      .then(([r, a]) => { if (!cancelado) { setRes(r); setAnt(a); setOrdem(null); setIa(null); } })
      .catch(e => { if (!cancelado) setErro(e?.message || 'Não foi possível gerar o relatório.'); })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, [def, assinatura, opcao]);

  // Coluna "vs anterior": só quando cada linha é uma chave única (vendedor, segmento…); em
  // relatórios linha-a-linha (perdas, clientes novos) fica só o resumo total.
  const cmp = def.comparar;
  const comVariacao = useMemo<Resultado | null>(() => {
    if (!res || !cmp) return res;
    const chaves = res.linhas.map(cmp.chave);
    if (new Set(chaves).size !== chaves.length) return res;
    const antMap = new Map((ant?.linhas || []).map(l => [cmp.chave(l), Number(l[cmp.metrica]) || 0]));
    const linhasV = res.linhas.map(l => { const b = antMap.get(cmp.chave(l)), a = Number(l[cmp.metrica]) || 0; return { ...l, _var: !ant ? null : b ? (a - b) / b * 100 : a > 0 ? 'novo' : null }; });
    const i = res.colunas.findIndex(c => c.k === cmp.metrica);
    const colunas = [...res.colunas]; colunas.splice(i + 1, 0, { k: '_var', t: 'vs anterior', tipo: 'var' });
    return { ...res, linhas: linhasV, colunas };
  }, [res, ant, cmp]);
  const totalAtual = res && cmp ? (cmp.total ? cmp.total(res) : res.linhas.reduce((s, l) => s + (Number(l[cmp.metrica]) || 0), 0)) : null;
  const totalAnt = ant && cmp ? (cmp.total ? cmp.total(ant) : ant.linhas.reduce((s, l) => s + (Number(l[cmp.metrica]) || 0), 0)) : null;
  const variacaoTotal = totalAtual !== null && totalAnt ? (totalAtual - totalAnt) / totalAnt * 100 : null;
  const insights = useMemo(() => res && def.insights ? def.insights(res, ant, ctxRef.current) : [], [res, ant, def]);

  async function analisarComIa() {
    if (!comVariacao) return;
    setIa({ carregando: true });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch('/api/relatorios/insights', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          relatorio: def.nome, descricao: def.descricao, periodo: `${dataBR(ctx.dataInicio)} a ${dataBR(ctx.dataFim)}`,
          periodo_anterior: `${dataBR(ctx.periodoAnterior.inicio)} a ${dataBR(ctx.periodoAnterior.fim)}`,
          resumo: res?.resumo || null, metrica: cmp ? { nome: cmp.rotulo, atual: totalAtual, anterior: totalAnt, variacao_pct: variacaoTotal } : null,
          colunas: comVariacao.colunas.map(c => c.t), linhas: comVariacao.linhas.slice(0, 40).map(l => comVariacao.colunas.map(c => celula(l[c.k], c.tipo))),
          achados: insights.map(i => `${i.titulo}. ${i.texto}`),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || 'Falha na análise.');
      setIa({ carregando: false, texto: j.resumo, itens: j.itens || [] });
    } catch (e: any) { setIa({ carregando: false, erro: e?.message || 'Falha na análise.' }); }
  }

  const linhas = useMemo(() => {
    const res = comVariacao;
    if (!res) return [];
    if (!ordem) return res.linhas;
    return [...res.linhas].sort((a, b) => { const x = a[ordem.k], y = b[ordem.k]; const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'pt-BR'); return ordem.asc ? r : -r; });
  }, [comVariacao, ordem]);

  function csv() {
    const res = comVariacao;
    if (!res) return '';
    return [res.colunas.map(c => c.t).join(';'), ...linhas.map(l => res.colunas.map(c => celulaCsv(l[c.k], c.tipo)).join(';')),
      ...(res.total ? [res.colunas.map(c => celulaCsv(res.total![c.k], c.tipo)).join(';')] : [])].join('\n');
  }
  function exportar() {
    const blob = new Blob(['﻿' + csv()], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${def.nome.replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, '_')}_${ctx.dataInicio}_a_${ctx.dataFim}.csv`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  return (
    <div className="space-y-4">
      <div className="bg-[#0B1120] border border-white/5 rounded-[28px] p-5 md:p-6 shadow-2xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-widest text-[var(--cor-primaria)]">{def.grupo}</p>
            <h2 className="text-white font-black uppercase italic text-lg tracking-tighter">{def.nome}</h2>
            <p className="text-xs text-slate-400 max-w-2xl">{def.descricao}</p>
            {res?.resumo && <p className="text-sm text-white font-bold mt-2">{res.resumo}</p>}
            {cmp && totalAtual !== null && !carregando && (
              <p className="text-xs text-slate-300 mt-2 flex flex-wrap items-center gap-2">
                <span>{cmp.total ? 'Total' : cmp.rotulo} no período: <b className="text-white">{cmp.formato === 'brl' ? brl(totalAtual) : num(totalAtual)}</b></span>
                {variacaoTotal !== null ? (
                  <span className={`inline-flex items-center gap-0.5 font-black px-2 py-0.5 rounded-lg ${variacaoTotal >= 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                    {variacaoTotal >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{num(Math.abs(variacaoTotal), 0)}%
                  </span>
                ) : null}
                <span className="text-slate-500">vs {dataBR(ctx.periodoAnterior.inicio)} a {dataBR(ctx.periodoAnterior.fim)}{totalAnt !== null ? ` (${cmp.formato === 'brl' ? brl(totalAnt) : num(totalAnt)})` : ''}</span>
              </p>
            )}
          </div>
          {def.opcao && (
            <label className="flex items-center gap-2 text-xs text-slate-300 font-bold">
              {def.opcao.rotulo}
              <input type="number" min={0} step={0.5} value={opcao} onChange={e => { const v = Number(e.target.value) || 0; setOpcao(v); try { localStorage.setItem(`rel-op-${def.id}`, String(v)); } catch { /* sem armazenamento */ } }} className="w-20 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-white text-right outline-none" />
              {def.opcao.sufixo}
            </label>
          )}
        </div>
        {carregando ? <div className="py-14 flex justify-center"><Loader2 className="animate-spin text-slate-500" /></div>
          : erro ? <p className="text-red-400 text-sm font-bold">{erro}</p>
          : res?.grafico ? <GraficoView g={res.grafico} /> : null}
      </div>

      {!carregando && res && (
        <div className="bg-[#0B1120] border border-white/5 rounded-[28px] p-5 md:p-6 shadow-2xl space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5"><Lightbulb size={12} className="text-amber-400" /> O que chama atenção e o que fazer</p>
            <button onClick={analisarComIa} disabled={ia?.carregando} className="flex items-center gap-1.5 bg-purple-600/20 border border-purple-500/30 text-purple-300 hover:bg-purple-600 hover:text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50">
              {ia?.carregando ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Analisar com IA
            </button>
          </div>
          {insights.length === 0 && !ia && <p className="text-xs text-slate-500">Nada fora do normal neste recorte. Use o botão Analisar com IA para uma leitura mais completa.</p>}
          {insights.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {insights.map((i, k) => (
                <div key={k} className={`rounded-2xl border p-3.5 ${i.tipo === 'alerta' ? 'border-red-500/30 bg-red-500/5' : i.tipo === 'positivo' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
                  <p className={`text-xs font-black flex items-start gap-1.5 ${i.tipo === 'alerta' ? 'text-red-300' : i.tipo === 'positivo' ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {i.tipo === 'alerta' ? <AlertTriangle size={13} className="shrink-0 mt-0.5" /> : i.tipo === 'positivo' ? <TrendingUp size={13} className="shrink-0 mt-0.5" /> : <Lightbulb size={13} className="shrink-0 mt-0.5" />}{i.titulo}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">{i.texto}</p>
                  {i.acao && <p className="text-[11px] text-white mt-2"><b className="text-[9px] uppercase tracking-widest text-slate-500 block">Plano de ação</b>{i.acao}</p>}
                </div>
              ))}
            </div>
          )}
          {ia?.erro && <p className="text-xs text-red-400 font-bold">{ia.erro}</p>}
          {ia?.texto && (
            <div className="rounded-2xl border border-purple-500/30 bg-purple-500/5 p-4 space-y-3">
              <p className="text-sm text-purple-100">{ia.texto}</p>
              {(ia.itens || []).map((x, k) => (
                <div key={k} className="border-t border-white/5 pt-2">
                  <p className="text-xs font-black text-white">{x.titulo} <span className={`ml-1 text-[9px] uppercase px-1.5 py-0.5 rounded ${x.prioridade === 'alta' ? 'bg-red-500/20 text-red-300' : x.prioridade === 'media' ? 'bg-amber-500/20 text-amber-300' : 'bg-white/10 text-slate-300'}`}>prioridade {x.prioridade}</span></p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{x.analise}</p>
                  <p className="text-[11px] text-white mt-1"><b className="text-[9px] uppercase tracking-widest text-slate-500">Ação: </b>{x.acao}</p>
                </div>
              ))}
              <p className="text-[9px] text-slate-500">Gerado por IA a partir dos números da tabela. Confira antes de decidir.</p>
            </div>
          )}
        </div>
      )}

      {!carregando && res && (
        <div className="bg-[#0B1120] border border-white/5 rounded-[28px] shadow-2xl overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-white/5">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{linhas.length} {linhas.length === 1 ? 'linha' : 'linhas'}</p>
            <div className="flex gap-2">
              <button onClick={() => { navigator.clipboard.writeText(csv().replace(/;/g, '\t')).catch(() => {}); }} className="flex items-center gap-1.5 bg-white/5 border border-white/10 text-slate-300 hover:text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest"><ClipboardCopy size={12} /> Copiar</button>
              <button onClick={exportar} disabled={!linhas.length} className="flex items-center gap-1.5 bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600 hover:text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-40"><Download size={12} /> Exportar planilha</button>
            </div>
          </div>
          <div className="overflow-x-auto max-h-[560px] overflow-y-auto custom-scrollbar">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[#0F172A] z-10">
                <tr>{comVariacao!.colunas.map(c => (
                  <th key={c.k} onClick={() => setOrdem(o => ({ k: c.k, asc: o?.k === c.k ? !o.asc : false }))} className={`px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-500 cursor-pointer hover:text-white whitespace-nowrap ${c.tipo && c.tipo !== 'txt' && c.tipo !== 'data' ? 'text-right' : 'text-left'}`}>
                    <span className="inline-flex items-center gap-1">{c.t}<ArrowUpDown size={9} className={ordem?.k === c.k ? 'text-[var(--cor-primaria)]' : 'opacity-30'} /></span>
                  </th>))}</tr>
              </thead>
              <tbody>
                {linhas.length === 0 && <tr><td colSpan={comVariacao!.colunas.length} className="px-4 py-8 text-center text-slate-500">Nada encontrado nesse período e filtro.</td></tr>}
                {linhas.map((l, i) => (
                  <tr key={i} className="border-t border-white/5 hover:bg-white/[0.02]">
                    {comVariacao!.colunas.map(c => <td key={c.k} className={`px-4 py-2 whitespace-nowrap ${c.tipo && c.tipo !== 'txt' && c.tipo !== 'data' ? 'text-right tabular-nums' : 'text-left'} ${c.k === comVariacao!.colunas[0].k ? 'text-white font-bold' : c.tipo === 'var' ? (l[c.k] === 'novo' ? 'text-sky-400 font-bold' : Number(l[c.k]) >= 0 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold') : 'text-slate-300'} ${c.k === 'motivo' ? 'whitespace-normal min-w-[260px]' : ''}`}>{celula(l[c.k], c.tipo)}</td>)}
                  </tr>
                ))}
              </tbody>
              {res.total && (
                <tfoot><tr className="border-t-2 border-white/10 bg-white/[0.03]">{comVariacao!.colunas.map(c => <td key={c.k} className={`px-4 py-2.5 font-black text-white whitespace-nowrap ${c.tipo && c.tipo !== 'txt' && c.tipo !== 'data' ? 'text-right tabular-nums' : ''}`}>{res.total![c.k] !== undefined ? celula(res.total![c.k], c.tipo) : ''}</td>)}</tr></tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
