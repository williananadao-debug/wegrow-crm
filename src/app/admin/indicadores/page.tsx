"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  ArrowLeft, ShieldAlert, Loader2, RefreshCw, BarChart2, DollarSign,
  Users, TrendingUp, TrendingDown, AlertTriangle, Percent, Wrench,
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

type Empresa = { id: string; nome: string; plano: string; status: string; modulos: Record<string, any>; created_at: string; };
type Billing = { empresa_id: string; valor_mensal: number; proximo_vencimento: string | null; };
type ClienteView = Empresa & { billing: Billing | null };

function diasParaVencer(d: string | null) { if (!d) return null; return Math.floor((new Date(d + 'T00:00:00').getTime() - Date.now()) / 86400000); }

const MESES_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export default function IndicadoresPage() {
  const { user, loading: authLoading } = useAuth();
  const isAdmin = ADMIN_EMAILS.includes(user?.email || '');

  const [clientes, setClientes] = useState<ClienteView[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState('');

  useEffect(() => {
    if (!user) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) setToken(session.access_token);
    });
  }, [user]);

  useEffect(() => { if (token && isAdmin) carregar(); }, [token, isAdmin]);

  const carregar = async () => {
    setLoading(true);
    const res = await fetch('/api/admin/empresas', { headers: { Authorization: `Bearer ${token}` } });
    const empresas: Empresa[] = res.ok ? await res.json() : [];
    const { data: billings } = await supabase.from('clientes_wegrow').select('*');
    const billingMap = Object.fromEntries((billings || []).map((b: Billing) => [b.empresa_id, b]));
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

  const NAO_INSTRUMENTADO = [
    { titulo: 'Churn mensal', formula: 'Clientes cancelados no mês ÷ clientes no início do mês', falta: '"Vencido" hoje é inadimplência, não cancelamento — falta registrar quando uma empresa é efetivamente encerrada (data + motivo).' },
    { titulo: 'MRR novo vs. perdido', formula: 'Diferença entre o MRR de hoje e o MRR do mês anterior', falta: 'Hoje só existe o estado atual do MRR — falta guardar um snapshot mensal pra comparar mês a mês.' },
    { titulo: 'Taxa de conversão por canal', formula: 'Fechados ÷ oportunidades abertas, por canal (IAlto / Nilton / orgânico)', falta: 'O cadastro do cliente não registra de onde ele veio — falta o campo "canal de origem".' },
    { titulo: 'CAC por canal', formula: 'Custo do canal (ex.: 25% recorrente IAlto) ÷ novas contas daquele canal', falta: 'Depende do campo "canal" acima, mais registrar a comissão paga por fechamento.' },
  ];

  return (
    <div className="min-h-screen bg-[#0B1120] text-white">
      <div className="max-w-4xl mx-auto px-4 py-10">

        <div className="flex items-center justify-between mb-8">
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
          <button onClick={carregar} className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors">
            <RefreshCw size={16} className={`text-slate-400 ${loading ? 'animate-spin' : ''}`}/>
          </button>
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
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><TrendingUp size={12}/> Aquisição — novas contas por mês</p>
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

            {/* Não instrumentado */}
            <section>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Wrench size={12}/> Ainda não instrumentado</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {NAO_INSTRUMENTADO.map((k, i) => (
                  <div key={i} className="bg-[#0F172A] border border-white/5 rounded-2xl p-4 opacity-60">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-black text-slate-300">{k.titulo}</p>
                      <span className="text-[9px] font-black uppercase text-slate-500 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full shrink-0">Sem dado</span>
                    </div>
                    <p className="text-slate-500 text-[10px] mb-2 font-mono">{k.formula}</p>
                    <p className="text-slate-600 text-[10px]">{k.falta}</p>
                  </div>
                ))}
              </div>
            </section>

          </div>
        )}
      </div>
    </div>
  );
}
