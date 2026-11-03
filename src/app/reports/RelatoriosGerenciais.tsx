"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Download, ClipboardCopy, ArrowUpDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { diaReferenciaLead } from '@/lib/dataFechamento';

// Relatórios gerenciais do menu de /reports: cada um devolve um gráfico (em cima) e uma tabela
// (embaixo), sempre no recorte de período/unidade/vendedor da tela. Os que precisam de dado fora
// do período (contratos vigentes, parcelas vencidas, ano anterior) buscam só aquele recorte.

export type Ctx = {
  empresaId?: string; userId?: string; isDirector: boolean; isGerente: boolean; unidadeGerente?: string;
  dataInicio: string; dataFim: string; filtroUnidade: string; filtroVendedor: string;
  nomesMap: Record<string, string>; leads: any[]; leadsAnt: any[]; visitas: any[];
};
type Tipo = 'txt' | 'brl' | 'n' | 'pct' | 'data';
type Coluna = { k: string; t: string; tipo?: Tipo };
type Ponto = { rotulo: string; valor: number; valor2?: number };
type Grafico = { tipo: 'barras' | 'colunas' | 'rosca'; dados: Ponto[]; serie?: string; serie2?: string; formato?: 'brl' | 'n' | 'pct' };
type Resultado = { grafico: Grafico | null; colunas: Coluna[]; linhas: Record<string, any>[]; resumo?: string; total?: Record<string, any> };
type Def = { id: string; grupo: string; nome: string; descricao: string; diretoria?: boolean; gerar: (c: Ctx, op: Record<string, number>) => Promise<Resultado> | Resultado; opcao?: { k: string; rotulo: string; padrao: number; sufixo: string } };

const brl = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
const kbrl = (v: number) => Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : brl(v);
const num = (v: number, d = 0) => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: d });
const dataBR = (d: string | null | undefined) => d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('pt-BR') : '—';
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const somaDias = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const vend = (c: Ctx, l: any) => l.vendedor_nome || c.nomesMap[l.user_id] || 'Sem vendedor';
const ganhos = (ls: any[]) => ls.filter(l => l.status === 'ganho');
const valor = (l: any) => Number(l.valor_total) || 0;
const blocos = <T,>(arr: T[], n = 150) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

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
  { id: 'vendas_vendedor', grupo: 'Comercial', nome: 'Vendas por vendedor', descricao: 'Faturamento, quantidade de vendas, ticket médio e conversão de cada vendedor no período.',
    gerar: c => {
      const linhas = agrupar(c.leads, l => vend(c, l), (a, l) => { a.leads++; if (l.status === 'ganho') { a.vendas++; a.faturamento += valor(l); a.desconto += Number(l.desconto) || 0; } }, () => ({ leads: 0, vendas: 0, faturamento: 0, desconto: 0 }))
        .map(a => ({ vendedor: a.chave, leads: a.leads, vendas: a.vendas, faturamento: a.faturamento, ticket: a.vendas ? a.faturamento / a.vendas : 0, conversao: a.leads ? a.vendas / a.leads * 100 : 0, desc_pct: a.faturamento + a.desconto ? a.desconto / (a.faturamento + a.desconto) * 100 : 0 }))
        .sort((a, b) => b.faturamento - a.faturamento);
      return { grafico: { tipo: 'barras', formato: 'brl', dados: linhas.map(l => ({ rotulo: l.vendedor, valor: l.faturamento })) },
        colunas: [{ k: 'vendedor', t: 'Vendedor' }, { k: 'leads', t: 'Leads', tipo: 'n' }, { k: 'vendas', t: 'Vendas', tipo: 'n' }, { k: 'faturamento', t: 'Faturamento', tipo: 'brl' }, { k: 'ticket', t: 'Ticket médio', tipo: 'brl' }, { k: 'conversao', t: 'Conversão', tipo: 'pct' }, { k: 'desc_pct', t: 'Desconto médio', tipo: 'pct' }], linhas };
    } },
  { id: 'comissao', diretoria: true, grupo: 'Comercial', nome: 'Comissão por vendedor', descricao: 'Comissão sobre as vendas ganhas no período, com o percentual que você definir.', opcao: { k: 'pct', rotulo: 'Comissão', padrao: 5, sufixo: '%' },
    gerar: (c, op) => {
      const pct = op.pct ?? 5;
      const linhas = agrupar(ganhos(c.leads), l => vend(c, l), (a, l) => { a.vendas++; a.faturamento += valor(l); }, () => ({ vendas: 0, faturamento: 0 }))
        .map(a => ({ vendedor: a.chave, vendas: a.vendas, faturamento: a.faturamento, pct, comissao: a.faturamento * pct / 100 })).sort((a, b) => b.comissao - a.comissao);
      return { grafico: { tipo: 'barras', formato: 'brl', dados: linhas.map(l => ({ rotulo: l.vendedor, valor: l.comissao })) },
        colunas: [{ k: 'vendedor', t: 'Vendedor' }, { k: 'vendas', t: 'Vendas', tipo: 'n' }, { k: 'faturamento', t: 'Faturamento', tipo: 'brl' }, { k: 'pct', t: '% comissão', tipo: 'pct' }, { k: 'comissao', t: 'Comissão', tipo: 'brl' }], linhas,
        total: { vendedor: 'Total', vendas: linhas.reduce((s, l) => s + l.vendas, 0), faturamento: linhas.reduce((s, l) => s + l.faturamento, 0), comissao: linhas.reduce((s, l) => s + l.comissao, 0) } };
    } },
  { id: 'descontos', grupo: 'Comercial', nome: 'Descontos concedidos', descricao: 'Quanto cada vendedor deu de desconto: valor bruto, desconto e percentual sobre o bruto.',
    gerar: c => {
      const linhas = agrupar(ganhos(c.leads), l => vend(c, l), (a, l) => { a.vendas++; a.liquido += valor(l); a.desconto += Number(l.desconto) || 0; }, () => ({ vendas: 0, liquido: 0, desconto: 0 }))
        .map(a => ({ vendedor: a.chave, vendas: a.vendas, bruto: a.liquido + a.desconto, desconto: a.desconto, liquido: a.liquido, pct: a.liquido + a.desconto ? a.desconto / (a.liquido + a.desconto) * 100 : 0 })).sort((a, b) => b.pct - a.pct);
      return { grafico: { tipo: 'barras', formato: 'pct', dados: linhas.map(l => ({ rotulo: l.vendedor, valor: l.pct })) },
        colunas: [{ k: 'vendedor', t: 'Vendedor' }, { k: 'vendas', t: 'Vendas', tipo: 'n' }, { k: 'bruto', t: 'Valor bruto', tipo: 'brl' }, { k: 'desconto', t: 'Desconto', tipo: 'brl' }, { k: 'liquido', t: 'Valor líquido', tipo: 'brl' }, { k: 'pct', t: '% de desconto', tipo: 'pct' }], linhas };
    } },
  { id: 'perdas', grupo: 'Comercial', nome: 'Motivos de perda', descricao: 'Negócios perdidos no período, agrupados pelo motivo registrado na perda.',
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
  { id: 'novos_recorrentes', grupo: 'Comercial', nome: 'Clientes novos × recorrentes', descricao: 'Das vendas do período, quanto veio de clientes que já compraram antes e quanto de clientes novos.',
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
  { id: 'funil', grupo: 'Comercial', nome: 'Funil por etapa (pipeline aberto)', descricao: 'Negócios em aberto hoje em cada etapa, com valor total e valor ponderado pela chance de fechar.',
    gerar: async c => {
      const { data } = await escopo(supabase.from('leads').select('id, etapa, valor_total, user_id, vendedor_nome').eq('status', 'aberto'), c).limit(3000);
      const prob: Record<number, number> = { 0: .1, 1: .25, 2: .45, 3: .7 }, nomes = ['Novo', 'Contato', 'Proposta', 'Negociação'];
      const linhas = [0, 1, 2, 3].map(e => { const ls = (data || []).filter((l: any) => Math.min(Number(l.etapa) || 0, 3) === e); const v = ls.reduce((s: number, l: any) => s + valor(l), 0); return { etapa: nomes[e], qtd: ls.length, valor: v, chance: prob[e] * 100, ponderado: v * prob[e] }; });
      return { grafico: { tipo: 'colunas', formato: 'brl', serie: 'Valor', serie2: 'Ponderado', dados: linhas.map(l => ({ rotulo: l.etapa, valor: l.valor, valor2: l.ponderado })) },
        colunas: [{ k: 'etapa', t: 'Etapa' }, { k: 'qtd', t: 'Negócios', tipo: 'n' }, { k: 'valor', t: 'Valor', tipo: 'brl' }, { k: 'chance', t: 'Chance de fechar', tipo: 'pct' }, { k: 'ponderado', t: 'Valor ponderado', tipo: 'brl' }], linhas,
        total: { etapa: 'Total', qtd: linhas.reduce((s, l) => s + l.qtd, 0), valor: linhas.reduce((s, l) => s + l.valor, 0), ponderado: linhas.reduce((s, l) => s + l.ponderado, 0) } };
    } },
  { id: 'followups', grupo: 'Comercial', nome: 'Follow-ups atrasados', descricao: 'Negócios em aberto com retorno vencido, por vendedor. Quanto mais antigo, maior o risco de perder.',
    gerar: async c => {
      const h = hoje();
      const { data } = await escopo(supabase.from('leads').select('id, empresa, followup_em, valor_total, user_id, vendedor_nome, etapa').eq('status', 'aberto').lt('followup_em', h).not('followup_em', 'is', null), c).order('followup_em').limit(1000);
      const linhas = (data || []).map((l: any) => ({ cliente: l.empresa, vendedor: vend(c, l), followup: l.followup_em, dias: Math.round((new Date(h + 'T12:00').getTime() - new Date(l.followup_em + 'T12:00').getTime()) / 86400000), valor: valor(l) }));
      const g = agrupar(linhas, (l: any) => l.vendedor, (a, l) => { a.qtd++; }, () => ({ qtd: 0 })).sort((a, b) => b.qtd - a.qtd);
      return { grafico: { tipo: 'barras', formato: 'n', dados: g.map(x => ({ rotulo: x.chave, valor: x.qtd })) }, resumo: `${linhas.length} follow-ups atrasados · ${kbrl(linhas.reduce((s: number, l: any) => s + l.valor, 0))} em negociação parada`,
        colunas: [{ k: 'cliente', t: 'Cliente' }, { k: 'vendedor', t: 'Vendedor' }, { k: 'followup', t: 'Retorno era em', tipo: 'data' }, { k: 'dias', t: 'Dias de atraso', tipo: 'n' }, { k: 'valor', t: 'Valor', tipo: 'brl' }], linhas };
    } },
  { id: 'origem', grupo: 'Comercial', nome: 'Origem dos leads', descricao: 'De onde vêm os leads e quais origens mais viram venda.',
    gerar: c => {
      const linhas = agrupar(c.leads, l => l.origem || 'Não informada', (a, l) => { a.leads++; if (l.status === 'ganho') { a.vendas++; a.faturamento += valor(l); } }, () => ({ leads: 0, vendas: 0, faturamento: 0 }))
        .map(a => ({ origem: a.chave, leads: a.leads, vendas: a.vendas, conversao: a.leads ? a.vendas / a.leads * 100 : 0, faturamento: a.faturamento })).sort((a, b) => b.leads - a.leads);
      return { grafico: { tipo: 'colunas', formato: 'n', serie: 'Leads', serie2: 'Vendas', dados: linhas.map(l => ({ rotulo: l.origem, valor: l.leads, valor2: l.vendas })) },
        colunas: [{ k: 'origem', t: 'Origem' }, { k: 'leads', t: 'Leads', tipo: 'n' }, { k: 'vendas', t: 'Vendas', tipo: 'n' }, { k: 'conversao', t: 'Conversão', tipo: 'pct' }, { k: 'faturamento', t: 'Faturamento', tipo: 'brl' }], linhas };
    } },
  { id: 'agencia', grupo: 'Comercial', nome: 'Agência × venda direta', descricao: 'Quanto do faturamento passa por agência e quanto é venda direta ao anunciante.',
    gerar: c => {
      const linhas = agrupar(ganhos(c.leads), l => l.tipo === 'Agência' ? 'Agência' : 'Venda direta', (a, l) => { a.vendas++; a.faturamento += valor(l); }, () => ({ vendas: 0, faturamento: 0 }))
        .map(a => ({ canal: a.chave, vendas: a.vendas, faturamento: a.faturamento, ticket: a.vendas ? a.faturamento / a.vendas : 0 }));
      const tot = linhas.reduce((s, l) => s + l.faturamento, 0);
      linhas.forEach((l: any) => { l.participacao = tot ? l.faturamento / tot * 100 : 0; });
      return { grafico: { tipo: 'rosca', formato: 'brl', dados: linhas.map(l => ({ rotulo: l.canal, valor: l.faturamento })) },
        colunas: [{ k: 'canal', t: 'Canal' }, { k: 'vendas', t: 'Vendas', tipo: 'n' }, { k: 'faturamento', t: 'Faturamento', tipo: 'brl' }, { k: 'ticket', t: 'Ticket médio', tipo: 'brl' }, { k: 'participacao', t: 'Participação', tipo: 'pct' }], linhas };
    } },
  { id: 'segmento', grupo: 'Comercial', nome: 'Faturamento por segmento', descricao: 'Em quais segmentos de cliente (supermercado, farmácia, concessionária…) a venda está concentrada.',
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
  { id: 'visitas_vendedor', grupo: 'Comercial', nome: 'Visitas por vendedor', descricao: 'Visitas feitas no período, quantas viraram lead e quantas viraram venda.',
    gerar: c => {
      const status: Record<number, string> = {}; c.leads.forEach(l => { status[l.id] = l.status; });
      const linhas = agrupar(c.visitas, v => c.nomesMap[v.user_id] || 'Sem vendedor', (a, v) => { a.visitas++; if (v.lead_id) a.leads++; if (v.lead_id && status[v.lead_id] === 'ganho') a.vendas++; }, () => ({ visitas: 0, leads: 0, vendas: 0 }))
        .map(a => ({ vendedor: a.chave, visitas: a.visitas, leads: a.leads, vendas: a.vendas, conv: a.visitas ? a.vendas / a.visitas * 100 : 0 })).sort((a, b) => b.visitas - a.visitas);
      return { grafico: { tipo: 'colunas', formato: 'n', serie: 'Visitas', serie2: 'Viraram lead', dados: linhas.map(l => ({ rotulo: l.vendedor, valor: l.visitas, valor2: l.leads })) },
        colunas: [{ k: 'vendedor', t: 'Vendedor' }, { k: 'visitas', t: 'Visitas', tipo: 'n' }, { k: 'leads', t: 'Viraram lead', tipo: 'n' }, { k: 'vendas', t: 'Viraram venda', tipo: 'n' }, { k: 'conv', t: 'Visita → venda', tipo: 'pct' }], linhas };
    } },
  { id: 'top_clientes', grupo: 'Comercial', nome: 'Maiores clientes (concentração)', descricao: 'Os clientes que mais compraram no período e quanto do faturamento depende deles.',
    gerar: c => {
      const vs = agrupar(ganhos(c.leads), l => l.empresa || '—', (a, l) => { a.vendas++; a.faturamento += valor(l); }, () => ({ vendas: 0, faturamento: 0 })).sort((a, b) => b.faturamento - a.faturamento);
      const tot = vs.reduce((s, x) => s + x.faturamento, 0); let acum = 0;
      const linhas = vs.map((x, i) => { acum += x.faturamento; return { pos: i + 1, cliente: x.chave, vendas: x.vendas, faturamento: x.faturamento, part: tot ? x.faturamento / tot * 100 : 0, acum: tot ? acum / tot * 100 : 0 }; });
      const top10 = linhas.slice(0, 10).reduce((s, l) => s + l.part, 0);
      return { grafico: { tipo: 'barras', formato: 'brl', dados: linhas.slice(0, 10).map(l => ({ rotulo: l.cliente, valor: l.faturamento })) }, resumo: `Os 10 maiores clientes somam ${num(top10, 1)}% do faturamento do período`,
        colunas: [{ k: 'pos', t: '#', tipo: 'n' }, { k: 'cliente', t: 'Cliente' }, { k: 'vendas', t: 'Vendas', tipo: 'n' }, { k: 'faturamento', t: 'Faturamento', tipo: 'brl' }, { k: 'part', t: 'Participação', tipo: 'pct' }, { k: 'acum', t: 'Acumulado', tipo: 'pct' }], linhas };
    } },
  // ───────── Produtos e grade
  { id: 'produtos', grupo: 'Produtos e grade', nome: 'Vendas por produto', descricao: 'Quantidade vendida e valor de cada produto ou formato (spot, testemunhal, patrocínio…).',
    gerar: c => {
      const its = ganhos(c.leads).flatMap(l => itensDe(l).map(i => ({ ...i, _lead: l })));
      const linhas = agrupar(its, i => i.servico || 'Sem nome', (a, i) => { a.qtd += Number(i.quantidade) || 0; a.valor += (i.bonificacao || i.tipoEspecial) ? 0 : (Number(i.quantidade) || 0) * (Number(i.precoUnitario) || 0); a.contratos.add(i._lead.id); }, () => ({ qtd: 0, valor: 0, contratos: new Set() }))
        .map(a => ({ produto: a.chave, contratos: a.contratos.size, qtd: a.qtd, valor: a.valor, medio: a.qtd ? a.valor / a.qtd : 0 })).sort((a, b) => b.valor - a.valor);
      return { grafico: { tipo: 'barras', formato: 'brl', dados: linhas.slice(0, 15).map(l => ({ rotulo: l.produto, valor: l.valor })) },
        colunas: [{ k: 'produto', t: 'Produto' }, { k: 'contratos', t: 'Contratos', tipo: 'n' }, { k: 'qtd', t: 'Quantidade', tipo: 'n' }, { k: 'valor', t: 'Valor (tabela)', tipo: 'brl' }, { k: 'medio', t: 'Preço médio', tipo: 'brl' }], linhas };
    } },
  { id: 'programas', grupo: 'Produtos e grade', nome: 'Vendas por programa e horário', descricao: 'Inserções vendidas por programa e faixa horária: onde a grade está mais vendida.',
    gerar: c => {
      const its = ganhos(c.leads).flatMap(l => itensDe(l));
      const linhas = agrupar(its, i => `${(i.programa || 'ROTATIVO').toString().toUpperCase()}|${i.horario_inicial || '06:00'}–${i.horario_final || '20:00'}`, (a, i) => { a.ins += Number(i.quantidade) || 0; a.valor += (i.bonificacao || i.tipoEspecial) ? 0 : (Number(i.quantidade) || 0) * (Number(i.precoUnitario) || 0); }, () => ({ ins: 0, valor: 0 }))
        .map(a => { const [programa, faixa] = a.chave.split('|'); return { programa, faixa, ins: a.ins, valor: a.valor }; }).sort((a, b) => b.ins - a.ins);
      return { grafico: { tipo: 'barras', formato: 'n', dados: linhas.slice(0, 15).map(l => ({ rotulo: `${l.programa} ${l.faixa}`, valor: l.ins })) },
        colunas: [{ k: 'programa', t: 'Programa' }, { k: 'faixa', t: 'Faixa horária' }, { k: 'ins', t: 'Inserções', tipo: 'n' }, { k: 'valor', t: 'Valor (tabela)', tipo: 'brl' }], linhas };
    } },
  // ───────── Contratos e financeiro
  { id: 'renovacoes', grupo: 'Contratos e financeiro', nome: 'Renovações a vencer (90 dias)', descricao: 'Contratos que terminam nos próximos 90 dias. É a lista de ligação da semana.',
    gerar: async c => {
      const h = hoje();
      const { data } = await escopo(supabase.from('leads').select('id, empresa, contrato_fim, valor_total, user_id, vendedor_nome, unidade').eq('status', 'ganho').gte('contrato_fim', h).lte('contrato_fim', somaDias(h, 90)), c).order('contrato_fim').limit(1000);
      const linhas = (data || []).map((l: any) => { const dias = Math.round((new Date(l.contrato_fim + 'T12:00').getTime() - new Date(h + 'T12:00').getTime()) / 86400000); return { cliente: l.empresa, vendedor: vend(c, l), unidade: l.unidade || '—', fim: l.contrato_fim, dias, faixa: dias <= 30 ? 'Até 30 dias' : dias <= 60 ? '31 a 60 dias' : '61 a 90 dias', valor: valor(l) }; });
      const g = ['Até 30 dias', '31 a 60 dias', '61 a 90 dias'].map(f => ({ rotulo: f, valor: linhas.filter((l: any) => l.faixa === f).reduce((s: number, l: any) => s + l.valor, 0) }));
      return { grafico: { tipo: 'colunas', formato: 'brl', serie: 'Valor a renovar', dados: g }, resumo: `${linhas.length} contratos · ${kbrl(linhas.reduce((s: number, l: any) => s + l.valor, 0))} para renovar`,
        colunas: [{ k: 'cliente', t: 'Cliente' }, { k: 'vendedor', t: 'Vendedor' }, { k: 'unidade', t: 'Unidade' }, { k: 'fim', t: 'Vence em', tipo: 'data' }, { k: 'dias', t: 'Dias', tipo: 'n' }, { k: 'valor', t: 'Valor do contrato', tipo: 'brl' }], linhas };
    } },
  { id: 'receita_contratada', diretoria: true, grupo: 'Contratos e financeiro', nome: 'Receita contratada (próximos 12 meses)', descricao: 'O que já está vendido para os próximos meses, pelos contratos vigentes (valor do contrato dividido pelos meses de veiculação).',
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
  { id: 'inadimplencia', diretoria: true, grupo: 'Contratos e financeiro', nome: 'Parcelas vencidas (inadimplência)', descricao: 'Parcelas de vendas que venceram e não foram pagas, por faixa de atraso.',
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
  { id: 'recebimentos', diretoria: true, grupo: 'Contratos e financeiro', nome: 'Recebimentos do período', descricao: 'O que efetivamente entrou no caixa no período (parcelas pagas), por dia.',
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
  { id: 'ano_anterior', grupo: 'Contratos e financeiro', nome: 'Comparativo com o ano anterior', descricao: 'Faturamento de cada mês deste ano contra o mesmo mês do ano passado.',
    gerar: async c => {
      const ano = new Date().getFullYear();
      const buscar = async (a: number) => {
        const { data } = await escopo(supabase.from('leads').select('valor_total, fechado_em, created_at, status').eq('status', 'ganho').gte('fechado_em', new Date(a, 0, 1).toISOString()).lt('fechado_em', new Date(a + 1, 0, 1).toISOString()), c).limit(5000);
        const m = Array(12).fill(0); (data || []).forEach((l: any) => { m[new Date(diaReferenciaLead(l) + 'T12:00').getMonth()] += valor(l); }); return m;
      };
      const [atual, anterior] = await Promise.all([buscar(ano), buscar(ano - 1)]);
      const linhas = MESES.map((m, i) => ({ mes: m, anterior: anterior[i], atual: atual[i], variacao: anterior[i] ? (atual[i] - anterior[i]) / anterior[i] * 100 : null }));
      return { grafico: { tipo: 'colunas', formato: 'brl', serie: String(ano - 1), serie2: String(ano), dados: linhas.map(l => ({ rotulo: l.mes, valor: l.anterior, valor2: l.atual })) },
        colunas: [{ k: 'mes', t: 'Mês' }, { k: 'anterior', t: String(ano - 1), tipo: 'brl' }, { k: 'atual', t: String(ano), tipo: 'brl' }, { k: 'variacao', t: 'Variação', tipo: 'pct' }], linhas,
        total: { mes: 'Ano', anterior: anterior.reduce((a, b) => a + b, 0), atual: atual.reduce((a, b) => a + b, 0) } };
    } },
  // ───────── Produção
  { id: 'producao', grupo: 'Produção', nome: 'Produção em andamento e atrasos', descricao: 'Jobs de produção ainda não entregues, por etapa, com os que passaram do prazo.',
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
  return (
    <div>
      {dois && <div className="flex gap-4 text-[10px] text-slate-400 mb-2"><span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-blue-500" />{g.serie}</span><span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-[var(--cor-primaria)]" />{g.serie2}</span></div>}
      <div className="flex items-end gap-1.5 h-48 overflow-x-auto pt-5">
        {g.dados.map((d, i) => (
          <div key={i} className="flex-1 min-w-[34px] h-full flex flex-col justify-end items-center">
            <div className="w-full flex items-end justify-center gap-0.5 h-full">
              <div className={`${dois ? 'w-1/2' : 'w-full'} rounded-t bg-blue-500/80 relative`} style={{ height: `${Math.max(d.valor / max * 100, d.valor ? 2 : 0)}%` }} title={`${g.serie || ''} ${fmtG(d.valor, g.formato)}`}>
                {!dois && d.valor > 0 && <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[8px] font-black text-white whitespace-nowrap">{fmtG(d.valor, g.formato)}</span>}
              </div>
              {dois && <div className="w-1/2 rounded-t bg-[var(--cor-primaria)]" style={{ height: `${Math.max((d.valor2 || 0) / max * 100, d.valor2 ? 2 : 0)}%` }} title={`${g.serie2 || ''} ${fmtG(d.valor2 || 0, g.formato)}`} />}
            </div>
            <span className="text-[9px] text-slate-500 font-bold mt-1 truncate max-w-full" title={d.rotulo}>{d.rotulo}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function celula(v: any, tipo?: Tipo) {
  if (v === null || v === undefined || v === '') return '—';
  if (tipo === 'brl') return brl(v);
  if (tipo === 'n') return num(v);
  if (tipo === 'pct') return `${num(v, 1)}%`;
  if (tipo === 'data') return dataBR(String(v));
  return String(v);
}
function celulaCsv(v: any, tipo?: Tipo) {
  if (v === null || v === undefined) return '';
  if (tipo === 'brl' || tipo === 'pct' || tipo === 'n') return (Number(v) || 0).toFixed(tipo === 'n' ? 0 : 2).replace('.', ',');
  if (tipo === 'data') return dataBR(String(v));
  const t = String(v); return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export default function RelatoriosGerenciais({ id, ctx }: { id: string; ctx: Ctx }) {
  const def = DEFS.find(d => d.id === id)!;
  const [res, setRes] = useState<Resultado | null>(null);
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
    Promise.resolve(def.gerar(ctxRef.current, def.opcao ? { [def.opcao.k]: opcao } : {}))
      .then(r => { if (!cancelado) { setRes(r); setOrdem(null); } })
      .catch(e => { if (!cancelado) setErro(e?.message || 'Não foi possível gerar o relatório.'); })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, [def, assinatura, opcao]);

  const linhas = useMemo(() => {
    if (!res) return [];
    if (!ordem) return res.linhas;
    return [...res.linhas].sort((a, b) => { const x = a[ordem.k], y = b[ordem.k]; const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'pt-BR'); return ordem.asc ? r : -r; });
  }, [res, ordem]);

  function csv() {
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
                <tr>{res.colunas.map(c => (
                  <th key={c.k} onClick={() => setOrdem(o => ({ k: c.k, asc: o?.k === c.k ? !o.asc : false }))} className={`px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-500 cursor-pointer hover:text-white whitespace-nowrap ${c.tipo && c.tipo !== 'txt' && c.tipo !== 'data' ? 'text-right' : 'text-left'}`}>
                    <span className="inline-flex items-center gap-1">{c.t}<ArrowUpDown size={9} className={ordem?.k === c.k ? 'text-[var(--cor-primaria)]' : 'opacity-30'} /></span>
                  </th>))}</tr>
              </thead>
              <tbody>
                {linhas.length === 0 && <tr><td colSpan={res.colunas.length} className="px-4 py-8 text-center text-slate-500">Nada encontrado nesse período e filtro.</td></tr>}
                {linhas.map((l, i) => (
                  <tr key={i} className="border-t border-white/5 hover:bg-white/[0.02]">
                    {res.colunas.map(c => <td key={c.k} className={`px-4 py-2 whitespace-nowrap ${c.tipo && c.tipo !== 'txt' && c.tipo !== 'data' ? 'text-right tabular-nums' : 'text-left'} ${c.k === res.colunas[0].k ? 'text-white font-bold' : 'text-slate-300'} ${c.k === 'motivo' ? 'whitespace-normal min-w-[260px]' : ''}`}>{celula(l[c.k], c.tipo)}</td>)}
                  </tr>
                ))}
              </tbody>
              {res.total && (
                <tfoot><tr className="border-t-2 border-white/10 bg-white/[0.03]">{res.colunas.map(c => <td key={c.k} className={`px-4 py-2.5 font-black text-white whitespace-nowrap ${c.tipo && c.tipo !== 'txt' && c.tipo !== 'data' ? 'text-right tabular-nums' : ''}`}>{res.total![c.k] !== undefined ? celula(res.total![c.k], c.tipo) : ''}</td>)}</tr></tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
