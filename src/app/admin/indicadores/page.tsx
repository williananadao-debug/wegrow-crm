"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  ArrowLeft, ShieldAlert, Loader2, RefreshCw, BarChart2, DollarSign,
  Users, TrendingUp, TrendingDown, AlertTriangle, Percent, Wrench, Printer,
  Download, X,
} from 'lucide-react';

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '').split(',').map(e => e.trim());

// Time de operação hoje é só o Willian — ajustar aqui quando a equipe crescer.
const PESSOAS_OPERACAO = 1;

const CUSTO_CONTRATO = 50;
const CUSTO_VERCEL = 159;
const CUSTO_CLAUDE = 115;
const CUSTO_DOCUSEAL = 105;
const CUSTO_CONTABILIDADE = 260; // Contabilizei

function custoSupabase(n: number) {
  if (n <= 20) return 160;
  if (n <= 60) return 280;
  if (n <= 120) return 450;
  return 650;
}

type Empresa = { id: string; nome: string; plano: string; status: string; modulos: Record<string, any>; created_at: string; canal_origem?: string | null; cancelado_em?: string | null; };
type Billing = { empresa_id: string; valor_mensal: number; proximo_vencimento: string | null; };
type ClienteView = Empresa & { billing: Billing | null };
type Prospect = { id: string; canal: string | null; status: string; };
type MrrSnapshot = { ano: number; mes: number; mrr_total: number; clientes: number; };

const CANAL_LABELS: Record<string, string> = { ialto: 'IAlto', nilton: 'Nilton', organico: 'Orgânico', indicacao: 'Indicação', direto: 'Direto' };

function diasParaVencer(d: string | null) { if (!d) return null; return Math.floor((new Date(d + 'T00:00:00').getTime() - Date.now()) / 86400000); }

const MESES_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export default function IndicadoresPage() {
  const { user, loading: authLoading } = useAuth();
  const isAdmin = ADMIN_EMAILS.includes(user?.email || '');

  const [clientes, setClientes] = useState<ClienteView[]>([]);
  const [todasEmpresas, setTodasEmpresas] = useState<Empresa[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [mrrSnapshots, setMrrSnapshots] = useState<MrrSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState('');
  const [exportarGrafico, setExportarGrafico] = useState(false);

  // Fundo branco isolado (só o gráfico, sem o app em volta) pra colar direto numa
  // apresentação — dispara o PDF sozinho e volta pro painel quando fecha a impressão.
  useEffect(() => {
    if (!exportarGrafico) return;
    const t = setTimeout(() => window.print(), 80);
    const voltar = () => setExportarGrafico(false);
    window.addEventListener('afterprint', voltar);
    return () => { clearTimeout(t); window.removeEventListener('afterprint', voltar); };
  }, [exportarGrafico]);

  useEffect(() => {
    if (!user) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) setToken(session.access_token);
    });
  }, [user]);

  useEffect(() => { if (token && isAdmin) carregar(); }, [token, isAdmin]);

  const carregar = async () => {
    setLoading(true);
    const [res, { data: billings }, { data: prospectsData }, { data: snapshotsData }] = await Promise.all([
      fetch('/api/admin/empresas', { headers: { Authorization: `Bearer ${token}` } }),
      supabase.from('clientes_wegrow').select('*'),
      supabase.from('wegrow_prospects').select('id, canal, status'),
      supabase.from('mrr_snapshots_mensais').select('ano, mes, mrr_total, clientes').order('ano', { ascending: true }).order('mes', { ascending: true }),
    ]);
    const empresas: Empresa[] = res.ok ? await res.json() : [];
    const billingMap = Object.fromEntries((billings || []).map((b: Billing) => [b.empresa_id, b]));
    // churn/canal precisam ver quem já cancelou também — clientes (ativos) continua
    // filtrando suspensa pros cards de MRR/inadimplência de hoje.
    setTodasEmpresas(empresas);
    setProspects((prospectsData as Prospect[]) || []);
    setMrrSnapshots((snapshotsData as MrrSnapshot[]) || []);
    const merged: ClienteView[] = empresas
      .filter(e => e.status !== 'suspensa')
      .map(e => ({ ...e, billing: billingMap[e.id] ?? null }));
    setClientes(merged);
    setLoading(false);
  };

  if (authLoading) return null;
  if (!isAdmin) return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center">
      <div className="text-center"><ShieldAlert size={40} className="text-red-500 mx-auto mb-3"/><p className="text-red-400 font-black uppercase tracking-widest">Acesso restrito</p></div>
    </div>
  );

  const mrr = clientes.reduce((s, c) => s + (c.billing?.valor_mensal ?? 0), 0);
  const arpu = clientes.length > 0 ? mrr / clientes.length : 0;
  const custoFerramentas = CUSTO_CONTRATO + CUSTO_VERCEL + custoSupabase(clientes.length) + CUSTO_CLAUDE + CUSTO_DOCUSEAL + CUSTO_CONTABILIDADE;
  const imposto = mrr * 0.06;
  const lucroLiquido = mrr - imposto - custoFerramentas;

  const vencidos = clientes.filter(c => {
    const d = diasParaVencer(c.billing?.proximo_vencimento ?? null);
    return d !== null && d < 0;
  });
  const inadimplenciaPct = clientes.length > 0 ? (vencidos.length / clientes.length) * 100 : 0;

  const capacidade = clientes.length / PESSOAS_OPERACAO;

  // Novas contas por mês — últimos 6 meses, a partir da data de criação da empresa.
  const hoje = new Date();
  const meses6 = Array.from({ length: 6 }).map((_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - (5 - i), 1);
    return { ano: d.getFullYear(), mes: d.getMonth(), label: `${MESES_PT[d.getMonth()]}/${String(d.getFullYear()).slice(2)}` };
  });
  const novasPorMes = meses6.map(m => ({
    ...m,
    count: clientes.filter(c => {
      const d = new Date(c.created_at);
      return d.getFullYear() === m.ano && d.getMonth() === m.mes;
    }).length,
  }));
  const maxNovas = Math.max(1, ...novasPorMes.map(m => m.count));

  // Churn mensal (mês corrente): cancelados no mês ÷ ativos no início do mês. "Ativo no
  // início do mês" = já existia antes do mês começar e (nunca cancelou, ou cancelou só
  // depois do início do mês).
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59);
  const ativosNoInicioDoMes = todasEmpresas.filter(e => {
    const criada = new Date(e.created_at);
    if (criada >= inicioMes) return false;
    if (!e.cancelado_em) return true;
    return new Date(e.cancelado_em) >= inicioMes;
  });
  const canceladosNoMes = todasEmpresas.filter(e => e.cancelado_em && new Date(e.cancelado_em) >= inicioMes && new Date(e.cancelado_em) <= fimMes);
  const churnPct = ativosNoInicioDoMes.length > 0 ? (canceladosNoMes.length / ativosNoInicioDoMes.length) * 100 : null;

  // MRR novo vs. perdido: diferença entre os 2 snapshots mensais mais recentes (populados
  // por /api/cron/snapshot-mrr todo dia 1). Só existe comparação a partir do 2º snapshot.
  const snapshotsOrdenados = [...mrrSnapshots].sort((a, b) => (a.ano - b.ano) || (a.mes - b.mes));
  const ultimoSnapshot = snapshotsOrdenados[snapshotsOrdenados.length - 1] || null;
  const penultimoSnapshot = snapshotsOrdenados[snapshotsOrdenados.length - 2] || null;
  const mrrVariacao = ultimoSnapshot && penultimoSnapshot ? ultimoSnapshot.mrr_total - penultimoSnapshot.mrr_total : null;

  // Taxa de conversão por canal: fechados (status='cliente') ÷ total de prospects daquele
  // canal, direto de wegrow_prospects — não depende do campo novo canal_origem.
  const canaisComProspect = Array.from(new Set(prospects.map(p => p.canal).filter(Boolean))) as string[];
  const conversaoPorCanal = canaisComProspect.map(canal => {
    const doCanal = prospects.filter(p => p.canal === canal);
    const convertidos = doCanal.filter(p => p.status === 'cliente');
    return { canal, total: doCanal.length, convertidos: convertidos.length, pct: doCanal.length > 0 ? (convertidos.length / doCanal.length) * 100 : 0 };
  }).sort((a, b) => b.total - a.total);

  // CAC por canal: só IAlto tem custo recorrente modelado (25% do MRR dos clientes vindos
  // de lá) — os outros canais não têm comissão/custo de aquisição conhecido ainda.
  const clientesIalto = clientes.filter(c => c.canal_origem === 'ialto');
  const mrrIalto = clientesIalto.reduce((s, c) => s + (c.billing?.valor_mensal ?? 0), 0);
  const cacIalto = clientesIalto.length > 0 ? (mrrIalto * 0.25) / clientesIalto.length : null;
  const clientesSemCanal = clientes.filter(c => !c.canal_origem).length;

  if (exportarGrafico) {
    return (
      <div className="min-h-screen bg-white text-slate-900 p-10 print:p-0">
        <button onClick={() => setExportarGrafico(false)} className="print:hidden absolute top-4 right-4 p-2 rounded-lg hover:bg-slate-100 text-slate-500" title="Fechar">
          <X size={16}/>
        </button>
        <div className="max-w-xl mx-auto">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Wegrow · Indicadores</p>
          <h2 className="text-lg font-black uppercase italic tracking-tighter mb-1">Aquisição — novas contas por mês</h2>
          <p className="text-slate-400 text-[10px] mb-6">{new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
          <div className="space-y-3">
            {novasPorMes.map((m, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-[11px] font-black text-slate-500 uppercase w-10 shrink-0">{m.label}</span>
                <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-[#22C55E] rounded-full" style={{ width: `${(m.count / maxNovas) * 100}%` }}/>
                </div>
                <span className="text-sm font-black text-slate-900 w-6 text-right shrink-0">{m.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B1120] text-white">
      <div className="max-w-4xl mx-auto px-4 py-10">

        {/* Título só aparece impresso/exportado — a navegação normal fica escondida no print */}
        <div className="hidden print:block mb-8">
          <div className="text-xl font-black uppercase italic tracking-tighter">Wegrow · Indicadores</div>
          <p className="text-xs font-bold">{new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
        </div>

        <div className="flex items-center justify-between mb-8 print:hidden">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors">
              <ArrowLeft size={16} className="text-slate-400"/>
            </Link>
            <div>
              <h1 className="text-2xl font-black uppercase italic tracking-tighter flex items-center gap-2">
                <BarChart2 size={22} className="text-[#22C55E]"/> Indicadores
              </h1>
              <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold">Plano de negócio · painel interno</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} title="Gerar apresentação (imprimir / salvar PDF)" className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors">
              <Printer size={16} className="text-slate-400"/>
            </button>
            <button onClick={carregar} className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors">
              <RefreshCw size={16} className={`text-slate-400 ${loading ? 'animate-spin' : ''}`}/>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-slate-600"/></div>
        ) : (
          <div className="space-y-8">

            {/* Receita & Rentabilidade */}
            <section>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><DollarSign size={12}/> Receita &amp; rentabilidade</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-4">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">MRR</p>
                  <p className="text-xl font-black text-[#22C55E]">R$ {mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-4">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">ARPU</p>
                  <p className="text-xl font-black text-white">R$ {arpu.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-4">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Lucro líquido (est.)</p>
                  <p className={`text-xl font-black ${lucroLiquido >= 0 ? 'text-[#22C55E]' : 'text-red-400'}`}>R$ {lucroLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-4">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Clientes ativos</p>
                  <p className="text-xl font-black text-white">{clientes.length}</p>
                </div>
              </div>

              {/* Waterfall do lucro líquido */}
              <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-5">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3">Como o lucro líquido é calculado</p>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between"><span className="text-slate-400">MRR bruto</span><span className="font-mono font-bold text-white">R$ {mrr.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">− Imposto (Simples, 6%)</span><span className="font-mono text-red-400">− R$ {imposto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">− Ferramentas (Vercel, Supabase, Claude IA, Docuseal, contrato, contabilidade)</span><span className="font-mono text-red-400">− R$ {custoFerramentas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                  <div className="border-t border-white/10 pt-2 flex justify-between"><span className="font-black text-white">= Lucro líquido</span><span className={`font-mono font-black ${lucroLiquido >= 0 ? 'text-[#22C55E]' : 'text-red-400'}`}>R$ {lucroLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                </div>
                <p className="text-slate-600 text-[10px] mt-3">Supabase escala com a base ({clientes.length} clientes → R$ {custoSupabase(clientes.length)}/mês nessa faixa). Não inclui PJ contratado, pró-labore ou split entre sócios.</p>
              </div>
            </section>

            {/* Retenção */}
            <section>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><AlertTriangle size={12}/> Retenção</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-4">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Inadimplência</p>
                  <p className={`text-xl font-black ${vencidos.length > 0 ? 'text-red-400' : 'text-white'}`}>{inadimplenciaPct.toFixed(0)}%</p>
                  <p className="text-slate-600 text-[10px] mt-1">{vencidos.length} de {clientes.length} clientes vencidos</p>
                </div>
                <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-4">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1"><Percent size={10}/> Capacidade</p>
                  <p className="text-xl font-black text-white">{capacidade.toFixed(0)}<span className="text-xs text-slate-500 font-bold"> cli./pessoa</span></p>
                  <p className="text-slate-600 text-[10px] mt-1">{clientes.length} clientes ÷ {PESSOAS_OPERACAO} pessoa na operação — ajustar no código quando a equipe crescer.</p>
                </div>
              </div>
            </section>

            {/* Aquisição */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><TrendingUp size={12}/> Aquisição — novas contas por mês</p>
                <button onClick={() => setExportarGrafico(true)} title="Exportar só este gráfico (PDF, fundo branco)" className="p-1.5 rounded-lg hover:bg-white/5 text-slate-600 hover:text-slate-300 transition-colors">
                  <Download size={13}/>
                </button>
              </div>
              <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-5">
                <div className="space-y-2.5">
                  {novasPorMes.map((m, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-[10px] font-black text-slate-500 uppercase w-10 shrink-0">{m.label}</span>
                      <div className="flex-1 h-3 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-[#22C55E] rounded-full transition-all" style={{ width: `${(m.count / maxNovas) * 100}%` }}/>
                      </div>
                      <span className="text-xs font-black text-white w-5 text-right shrink-0">{m.count}</span>
                    </div>
                  ))}
                </div>
                <p className="text-slate-600 text-[10px] mt-3">Baseado na data de criação da empresa no sistema — pode não bater exatamente com a data de fechamento do contrato pra contas antigas.</p>
              </div>
            </section>

            {/* Churn, MRR novo/perdido, conversão e CAC por canal */}
            <section>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Wrench size={12}/> Retenção e aquisição por canal</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

                <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-4">
                  <p className="text-xs font-black text-slate-300 mb-2">Churn mensal ({MESES_PT[hoje.getMonth()]}/{hoje.getFullYear()})</p>
                  {churnPct === null ? (
                    <p className="text-slate-500 text-[10px]">Sem clientes ativos no início do mês pra calcular ainda.</p>
                  ) : (
                    <>
                      <p className={`text-2xl font-black ${churnPct > 0 ? 'text-red-400' : 'text-[#22C55E]'}`}>{churnPct.toFixed(1)}%</p>
                      <p className="text-slate-500 text-[10px] mt-1">{canceladosNoMes.length} cancelado(s) de {ativosNoInicioDoMes.length} ativo(s) no início do mês.</p>
                    </>
                  )}
                </div>

                <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-4">
                  <p className="text-xs font-black text-slate-300 mb-2">MRR novo vs. perdido</p>
                  {mrrVariacao === null ? (
                    <p className="text-slate-500 text-[10px]">Aguardando o próximo snapshot mensal (roda todo dia 1) pra ter 2 pontos de comparação.</p>
                  ) : (
                    <>
                      <p className={`text-2xl font-black ${mrrVariacao >= 0 ? 'text-[#22C55E]' : 'text-red-400'}`}>{mrrVariacao >= 0 ? '+' : ''}R$ {mrrVariacao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      <p className="text-slate-500 text-[10px] mt-1">{MESES_PT[penultimoSnapshot!.mes - 1]}/{penultimoSnapshot!.ano} → {MESES_PT[ultimoSnapshot!.mes - 1]}/{ultimoSnapshot!.ano}</p>
                    </>
                  )}
                </div>

                <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-4">
                  <p className="text-xs font-black text-slate-300 mb-2">Conversão por canal</p>
                  {conversaoPorCanal.length === 0 ? (
                    <p className="text-slate-500 text-[10px]">Nenhum prospect com canal registrado ainda em /admin/prospeccao.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {conversaoPorCanal.map(c => (
                        <div key={c.canal} className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-400 font-bold">{CANAL_LABELS[c.canal] || c.canal}</span>
                          <span className="text-white font-black">{c.convertidos}/{c.total} <span className="text-slate-500 font-bold">({c.pct.toFixed(0)}%)</span></span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-4">
                  <p className="text-xs font-black text-slate-300 mb-2">CAC por canal</p>
                  {cacIalto === null ? (
                    <p className="text-slate-500 text-[10px]">Nenhum cliente com canal "IAlto" definido ainda em Clientes WeGrow → aba Contrato.</p>
                  ) : (
                    <>
                      <p className="text-xl font-black text-white">R$ {cacIalto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}<span className="text-[10px] text-slate-500 font-bold uppercase"> /mês · IAlto</span></p>
                      <p className="text-slate-500 text-[10px] mt-1">25% do MRR de {clientesIalto.length} cliente(s) vindos desse canal — outros canais sem custo recorrente modelado ainda.</p>
                    </>
                  )}
                  {clientesSemCanal > 0 && <p className="text-slate-600 text-[10px] mt-2 pt-2 border-t border-white/5">{clientesSemCanal} cliente(s) ativo(s) sem canal de origem definido.</p>}
                </div>

              </div>
            </section>

          </div>
        )}
      </div>
    </div>
  );
}
