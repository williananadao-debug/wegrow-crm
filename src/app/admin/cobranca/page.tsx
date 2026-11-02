"use client";
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Repeat, ShieldAlert, Loader2, Save, RefreshCw, AlertTriangle, ExternalLink, Handshake, Lock, BellRing } from 'lucide-react';
import { SkeletonPage } from '@/components/Skeleton';

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '').split(',').map(e => e.trim());

type Config = { regua_ativa: boolean; dias_lembrete: number; suspensao_automatica: boolean; dias_suspensao: number; multa_pct: number; juros_mes_pct: number };
type Pagamento = {
  asaas_payment_id: string; empresa_id: string; empresa_nome: string; empresa_logo: string | null; parceiro_nome: string | null;
  competencia: string | null; valor: number; valor_liquido: number | null; vencimento: string | null; pago_em: string | null;
  status: string; forma: string | null; invoice_url: string | null; split_valor: number | null; split_status: string | null;
};
type Dados = {
  config: Config; pagamentos: Pagamento[]; assinaturas_ativas: number; mrr_assinaturas: number;
  suspensas: { id: string; nome: string; desde: string }[]; statusPagos: string[];
};

const STATUS: Record<string, { label: string; cor: string }> = {
  PENDING:          { label: 'A vencer',    cor: 'bg-white/[0.04] text-slate-300 ring-white/10' },
  OVERDUE:          { label: 'Em atraso',   cor: 'bg-red-500/10 text-red-300 ring-red-500/25' },
  RECEIVED:         { label: 'Pago',        cor: 'bg-[#22C55E]/10 text-[#4ADE80] ring-[#22C55E]/25' },
  CONFIRMED:        { label: 'Confirmado',  cor: 'bg-[#22C55E]/10 text-[#4ADE80] ring-[#22C55E]/25' },
  RECEIVED_IN_CASH: { label: 'Pago (fora)', cor: 'bg-[#22C55E]/10 text-[#4ADE80] ring-[#22C55E]/25' },
  REFUNDED:         { label: 'Estornado',   cor: 'bg-amber-500/10 text-amber-300 ring-amber-500/25' },
  DELETED:          { label: 'Removido',    cor: 'bg-slate-500/10 text-slate-500 ring-slate-500/25' },
};

const brl = (v: number | null | undefined) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const data = (d: string | null | undefined) => (d ? d.substring(0, 10).split('-').reverse().join('/') : '—');
const BTN_PRI = 'inline-flex items-center gap-2 bg-[#22C55E] hover:bg-[#2BD468] text-[#0B1120] px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50';
const BTN_SEC = 'inline-flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-200 hover:text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50';
const INPUT = 'w-20 bg-white/[0.04] border border-white/10 rounded-lg px-2.5 py-2 text-white text-sm text-right tabular-nums outline-none focus:border-[#22C55E]/60';

const FILTROS = [
  { id: 'todos', label: 'Todos' },
  { id: 'atraso', label: 'Em atraso' },
  { id: 'aberto', label: 'A vencer' },
  { id: 'pago', label: 'Pagos' },
] as const;

export default function CobrancaPage() {
  const { user, loading: authLoading } = useAuth();
  const [token, setToken] = useState('');
  const [dados, setDados] = useState<Dados | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]['id']>('todos');

  const isAdmin = !authLoading && user && ADMIN_EMAILS.includes(user.email || '');

  useEffect(() => {
    if (!user) return;
    supabase.auth.getSession().then(({ data: { session } }) => { if (session?.access_token) setToken(session.access_token); });
  }, [user]);

  const carregar = async () => {
    if (!token) return;
    setLoading(true); setErro(null);
    try {
      const res = await fetch('/api/admin/cobranca', { headers: { Authorization: `Bearer ${token}` } });
      const j = await res.json();
      if (!res.ok) throw new Error(j.erro || `HTTP ${res.status}`);
      setDados(j); setConfig(j.config);
    } catch (e: any) { setErro(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { carregar(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const salvarConfig = async () => {
    if (!config) return;
    setSalvando(true);
    const res = await fetch('/api/admin/cobranca', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ acao: 'salvar_config', ...config }) });
    const j = await res.json().catch(() => ({}));
    setSalvando(false);
    if (!res.ok) { alert(j.erro || 'Erro ao salvar.'); return; }
    setSalvo(true); setTimeout(() => setSalvo(false), 2000);
  };

  const mes = new Date().toISOString().substring(0, 7);
  const k = useMemo(() => {
    const p = dados?.pagamentos || [];
    const pagos = dados?.statusPagos || [];
    const doMes = p.filter(x => x.competencia === mes);
    return {
      recebidoMes: doMes.filter(x => pagos.includes(x.status)).reduce((s, x) => s + Number(x.valor), 0),
      aReceberMes: doMes.filter(x => x.status === 'PENDING').reduce((s, x) => s + Number(x.valor), 0),
      atraso: p.filter(x => x.status === 'OVERDUE'),
      splitMes: doMes.filter(x => pagos.includes(x.status)).reduce((s, x) => s + Number(x.split_valor || 0), 0),
    };
  }, [dados, mes]);

  const lista = useMemo(() => {
    const p = dados?.pagamentos || [];
    if (filtro === 'atraso') return p.filter(x => x.status === 'OVERDUE');
    if (filtro === 'aberto') return p.filter(x => x.status === 'PENDING');
    if (filtro === 'pago') return p.filter(x => (dados?.statusPagos || []).includes(x.status));
    return p;
  }, [dados, filtro]);

  if (authLoading) return <div className="p-4 md:p-8"><SkeletonPage /></div>;
  if (!isAdmin) return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center">
      <div className="text-center"><ShieldAlert className="mx-auto text-red-500 mb-4" size={48}/><p className="text-white font-black text-2xl uppercase">Acesso Restrito</p></div>
    </div>
  );

  return (
    <div className="text-white pb-20">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mt-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-[28px] font-semibold tracking-tight flex items-center gap-2.5"><Repeat size={22} className="text-[#22C55E]"/> Cobrança</h1>
            <p className="text-sm text-slate-400 mt-1">Assinaturas no Asaas, comissão dos parceiros separada no pagamento e régua de cobrança automática.</p>
          </div>
          <button onClick={carregar} title="Atualizar" className={BTN_SEC}><RefreshCw size={15} className={loading ? 'animate-spin' : ''}/></button>
        </div>

        {erro && <div className="bg-red-500/[0.08] border border-red-500/20 rounded-xl p-4 mb-6 text-sm text-red-300 flex items-center gap-2"><AlertTriangle size={15}/> {erro} — rode a migration 20261102100000_cobranca_recorrente.sql se ainda não rodou.</div>}

        {loading && !dados ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 bg-white/[0.03] rounded-2xl animate-pulse"/>)}</div>
        ) : dados && config && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-px bg-white/[0.06] border border-white/[0.06] rounded-2xl overflow-hidden mb-6">
              {[
                { t: 'Assinaturas ativas', v: String(dados.assinaturas_ativas), s: `${brl(dados.mrr_assinaturas)}/mês recorrente` },
                { t: 'Recebido no mês', v: brl(k.recebidoMes), s: 'mensalidades pagas' },
                { t: 'A receber no mês', v: brl(k.aReceberMes), s: 'ainda não venceu' },
                { t: 'Em atraso', v: brl(k.atraso.reduce((s, x) => s + Number(x.valor), 0)), s: `${k.atraso.length} mensalidade${k.atraso.length === 1 ? '' : 's'}`, alerta: k.atraso.length > 0 },
                { t: 'Comissão a parceiros', v: brl(k.splitMes), s: 'separada no mês via split' },
              ].map(c => (
                <div key={c.t} className="bg-[#0F172A] p-5">
                  <p className="text-xs text-slate-400">{c.t}</p>
                  <p className={`text-xl font-semibold tabular-nums mt-1 ${c.alerta ? 'text-red-300' : ''}`}>{c.v}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{c.s}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-8">
              <div className="lg:col-span-3 bg-[#0F172A]/60 border border-white/[0.06] rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold flex items-center gap-2"><BellRing size={14} className="text-[#22C55E]"/> Régua de cobrança</h2>
                  <span className="text-xs text-slate-500">Roda todo dia às 9h</span>
                </div>
                <Linha titulo="Enviar avisos por e-mail" texto={`Lembrete ${config.dias_lembrete} dias antes do vencimento, aviso 1 dia depois e de novo com 5 dias de atraso. Vai para o e-mail financeiro do cliente.`}>
                  <Toggle on={config.regua_ativa} onChange={v => setConfig({ ...config, regua_ativa: v })}/>
                </Linha>
                <Linha titulo="Dias de antecedência do lembrete" texto="0 desliga o lembrete.">
                  <input type="number" min={0} max={15} value={config.dias_lembrete} onChange={e => setConfig({ ...config, dias_lembrete: Number(e.target.value) })} className={INPUT}/>
                </Linha>
                <Linha titulo="Suspender acesso por atraso" texto={`Com ${config.dias_suspensao} dias de atraso a equipe do cliente vê a tela de pendência (dados preservados). Avisa 3 dias antes; o pagamento libera sozinho.`}>
                  <Toggle on={config.suspensao_automatica} onChange={v => setConfig({ ...config, suspensao_automatica: v })}/>
                </Linha>
                <Linha titulo="Dias de atraso até suspender" texto="Mínimo de 5 dias.">
                  <input type="number" min={5} max={90} value={config.dias_suspensao} onChange={e => setConfig({ ...config, dias_suspensao: Number(e.target.value) })} className={INPUT}/>
                </Linha>
                <div className="grid grid-cols-2 gap-3">
                  <Linha titulo="Multa" texto="% após o vencimento">
                    <input type="number" min={0} max={2} step={0.5} value={config.multa_pct} onChange={e => setConfig({ ...config, multa_pct: Number(e.target.value) })} className={INPUT}/>
                  </Linha>
                  <Linha titulo="Juros" texto="% ao mês">
                    <input type="number" min={0} max={1} step={0.5} value={config.juros_mes_pct} onChange={e => setConfig({ ...config, juros_mes_pct: Number(e.target.value) })} className={INPUT}/>
                  </Linha>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={salvarConfig} disabled={salvando} className={BTN_PRI}>{salvando ? <Loader2 size={15} className="animate-spin"/> : <Save size={15}/>} Salvar regras</button>
                  {salvo && <span className="text-xs text-[#4ADE80]">Salvo.</span>}
                  <span className="text-xs text-slate-500">Multa e juros valem para assinaturas criadas ou atualizadas depois.</span>
                </div>
              </div>

              <div className="lg:col-span-2 space-y-4">
                <div className="bg-[#0F172A]/60 border border-white/[0.06] rounded-2xl p-5">
                  <h2 className="text-sm font-semibold flex items-center gap-2 mb-3"><Lock size={14} className="text-red-300"/> Acessos suspensos</h2>
                  {dados.suspensas.length === 0 ? <p className="text-xs text-slate-500">Nenhum cliente suspenso.</p> : (
                    <ul className="space-y-2">{dados.suspensas.map(s => (
                      <li key={s.id} className="flex items-center justify-between text-sm"><span>{s.nome}</span><span className="text-xs text-slate-500">desde {data(s.desde)}</span></li>
                    ))}</ul>
                  )}
                  <p className="text-[11px] text-slate-500 mt-3">Para liberar na mão: Visão geral → cliente → aba Faturamento.</p>
                </div>
                <div className="bg-[#0F172A]/60 border border-white/[0.06] rounded-2xl p-5">
                  <h2 className="text-sm font-semibold flex items-center gap-2 mb-2"><Handshake size={14} className="text-[#22C55E]"/> Como o parceiro recebe</h2>
                  <p className="text-xs text-slate-400 leading-relaxed">A comissão de cada mensalidade paga vai direto para a carteira Asaas do parceiro (split). A WeGrow emite a nota do valor cheio para o cliente; o parceiro emite nota da comissão para a WeGrow. Carteira e base do cálculo ficam em <Link href="/admin/parceiros" className="text-slate-200 underline">Parceiros</Link>.</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-sm font-semibold">Pagamentos <span className="text-slate-500 font-normal">· últimos 4 meses</span></h2>
              <div className="flex gap-1 bg-white/[0.03] border border-white/[0.06] rounded-lg p-1">
                {FILTROS.map(f => (
                  <button key={f.id} onClick={() => setFiltro(f.id)} className={`px-3 py-1.5 rounded-md text-xs font-medium ${filtro === f.id ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}>{f.label}</button>
                ))}
              </div>
            </div>
            <div className="bg-[#0F172A]/60 border border-white/[0.06] rounded-2xl overflow-x-auto">
              {lista.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-12">Nenhum pagamento aqui ainda. Ative a assinatura de um cliente na aba Faturamento.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 text-left border-b border-white/[0.06]">
                      <th className="font-medium px-4 py-3">Cliente</th>
                      <th className="font-medium px-4 py-3">Vencimento</th>
                      <th className="font-medium px-4 py-3 text-right">Valor</th>
                      <th className="font-medium px-4 py-3">Situação</th>
                      <th className="font-medium px-4 py-3">Pago em</th>
                      <th className="font-medium px-4 py-3">Parceiro</th>
                      <th className="font-medium px-4 py-3 text-right">Comissão</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map(p => {
                      const st = STATUS[p.status] || { label: p.status, cor: 'bg-white/[0.04] text-slate-400 ring-white/10' };
                      return (
                        <tr key={p.asaas_payment_id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              {p.empresa_logo ? <img src={p.empresa_logo} alt="" className="w-6 h-6 rounded object-contain bg-white/5"/> : <div className="w-6 h-6 rounded bg-white/5"/>}
                              <span className="font-medium">{p.empresa_nome}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-300 tabular-nums">{data(p.vencimento)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{brl(p.valor)}</td>
                          <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ring-1 ${st.cor}`}>{st.label}</span></td>
                          <td className="px-4 py-3 text-slate-400 tabular-nums">{data(p.pago_em)}</td>
                          <td className="px-4 py-3 text-slate-400">{p.parceiro_nome || '—'}</td>
                          <td className="px-4 py-3 text-right text-slate-300 tabular-nums">{p.split_valor != null ? brl(p.split_valor) : '—'}</td>
                          <td className="px-4 py-3 text-right">{p.invoice_url && <a href={p.invoice_url} target="_blank" rel="noopener noreferrer" title="Abrir fatura" className="inline-flex p-1.5 text-slate-500 hover:text-white"><ExternalLink size={14}/></a>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Linha({ titulo, texto, children }: { titulo: string; texto: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
      <span className="min-w-0">
        <span className="text-sm font-medium block">{titulo}</span>
        <span className="block text-xs text-slate-400 mt-0.5">{texto}</span>
      </span>
      {children}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={e => { e.preventDefault(); onChange(!on); }}
      className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${on ? 'bg-[#22C55E]' : 'bg-white/10'}`}>
      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${on ? 'left-5' : 'left-1'}`}/>
    </button>
  );
}
