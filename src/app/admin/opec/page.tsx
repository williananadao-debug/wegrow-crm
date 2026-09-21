"use client";
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { ArrowLeft, ShieldAlert, Loader2, Radio, CheckCircle2, AlertTriangle, XCircle, Copy, Download, ChevronDown, ChevronRight, Play } from 'lucide-react';

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '').split(',').map(e => e.trim());

const STATUS_OPTS = [
  { v: 'entregue', l: 'Entregue' }, { v: 'aprovacao', l: 'OPEC / No Ar' }, { v: 'gravacao', l: 'Locução / Gravação' },
  { v: 'roteiro', l: 'Roteiro / Copy' }, { v: 'aguardando_assinatura', l: 'Aguardando assinatura' },
];

type Problema = { nivel: 'erro' | 'aviso'; campo: string; mensagem: string };
type Contrato = { numero_contrato: string | null; id_job: number | null; cliente: string; unidade: string; status: string; problemas: Problema[] };
type Resposta = {
  resumo: { total: number; comErro: number; comAviso: number; ok: number; porProblema: { nivel: 'erro' | 'aviso'; mensagem: string; quantidade: number }[] };
  contratos: Contrato[]; pacotes: any[];
};

export default function OpecValidacaoPage() {
  const { user, loading: authLoading } = useAuth();
  const isAdmin = ADMIN_EMAILS.includes(user?.email || '');
  const [token, setToken] = useState('');
  const [empresas, setEmpresas] = useState<{ id: string; nome: string }[]>([]);
  const [empresa, setEmpresa] = useState('');
  const [status, setStatus] = useState('entregue');
  const [dataInicial, setDataInicial] = useState('');
  const [dataFinal, setDataFinal] = useState('');
  const [numeroContrato, setNumeroContrato] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [res, setRes] = useState<Resposta | null>(null);
  const [filtro, setFiltro] = useState<'todos' | 'erro' | 'aviso' | 'ok'>('todos');
  const [aberto, setAberto] = useState<number | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.auth.getSession().then(({ data: { session } }) => { if (session?.access_token) setToken(session.access_token); });
  }, [user]);

  useEffect(() => {
    if (!token || !isAdmin) return;
    fetch('/api/admin/empresas', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then((lista: any[]) => {
        const l = (lista || []).map(e => ({ id: e.id, nome: e.nome })).sort((a, b) => a.nome.localeCompare(b.nome));
        setEmpresas(l);
        const demais = l.find(e => /demais/i.test(e.nome));
        if (demais) setEmpresa(demais.id);
      });
  }, [token, isAdmin]);

  const validar = async () => {
    if (!empresa) return;
    setLoading(true); setErro(null); setRes(null); setAberto(null);
    try {
      const qs = new URLSearchParams({ empresa, status });
      if (dataInicial) qs.set('data_inicial', dataInicial);
      if (dataFinal) qs.set('data_final', dataFinal);
      if (numeroContrato.trim()) qs.set('numero_contrato', numeroContrato.trim());
      const r = await fetch(`/api/admin/opec-validacao?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || `HTTP ${r.status}`);
      setRes(j);
      setFiltro('todos');
    } catch (e: any) { setErro(e?.message || 'Erro ao validar.'); }
    finally { setLoading(false); }
  };

  const lista = useMemo(() => {
    if (!res) return [];
    return res.contratos.map((c, i) => ({ c, i })).filter(({ c }) => {
      const temErro = c.problemas.some(p => p.nivel === 'erro'); const temAviso = c.problemas.some(p => p.nivel === 'aviso');
      return filtro === 'todos' || (filtro === 'erro' && temErro) || (filtro === 'aviso' && !temErro && temAviso) || (filtro === 'ok' && !temErro && !temAviso);
    });
  }, [res, filtro]);

  const copiarJson = async (obj: any) => { try { await navigator.clipboard.writeText(JSON.stringify(obj, null, 2)); setCopiado(true); setTimeout(() => setCopiado(false), 1500); } catch {} };
  const baixar = (obj: any, nome: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
    a.download = nome; a.click(); URL.revokeObjectURL(a.href);
  };

  if (authLoading) return null;
  if (!isAdmin) return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center">
      <div className="text-center"><ShieldAlert size={40} className="text-red-500 mx-auto mb-3" /><p className="text-red-400 font-black uppercase tracking-widest">Acesso restrito</p></div>
    </div>
  );

  const inp = 'w-full h-10 bg-white/5 border border-white/10 rounded-xl px-3 text-sm text-white font-semibold outline-none focus:border-[#22C55E]/60';
  const lbl = 'block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1';

  return (
    <div className="min-h-screen bg-[#0B1120] text-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/admin" className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors"><ArrowLeft size={16} className="text-slate-400" /></Link>
          <div>
            <h1 className="text-2xl font-black uppercase italic tracking-tighter flex items-center gap-2"><Radio size={22} className="text-[#22C55E]" /> Validação OPEC</h1>
            <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold">Mostra exatamente o que a API /api/opec entrega e confere contra o gabarito</p>
          </div>
        </div>

        <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-4 mb-6 grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
          <label className="col-span-2 block"><span className={lbl}>Empresa (emissora)</span>
            <select value={empresa} onChange={e => setEmpresa(e.target.value)} className={inp}>
              <option value="" className="bg-[#0B1120]">Selecione…</option>
              {empresas.map(e => <option key={e.id} value={e.id} className="bg-[#0B1120]">{e.nome}</option>)}
            </select></label>
          <label className="block"><span className={lbl}>Status do job</span>
            <select value={status} onChange={e => setStatus(e.target.value)} className={inp}>{STATUS_OPTS.map(o => <option key={o.v} value={o.v} className="bg-[#0B1120]">{o.l}</option>)}</select></label>
          <label className="block"><span className={lbl}>Criado de</span><input type="date" value={dataInicial} onChange={e => setDataInicial(e.target.value)} className={inp} /></label>
          <label className="block"><span className={lbl}>até</span><input type="date" value={dataFinal} onChange={e => setDataFinal(e.target.value)} className={inp} /></label>
          <label className="block"><span className={lbl}>Nº do contrato</span><input value={numeroContrato} onChange={e => setNumeroContrato(e.target.value)} placeholder="Ex: 3234" className={inp} /></label>
          <button onClick={validar} disabled={!empresa || loading} className="col-span-2 md:col-span-6 h-10 bg-[#22C55E] text-[#0B1120] rounded-xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 hover:scale-[1.01] transition-transform disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} {loading ? 'Validando…' : 'Validar dados'}
          </button>
        </div>

        {erro && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-bold rounded-xl p-4 mb-6">{erro}</div>}

        {res && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {[
                { k: 'todos' as const, l: 'Contratos/jobs', n: res.resumo.total, cor: 'text-white', icon: null },
                { k: 'erro' as const, l: 'Com erro', n: res.resumo.comErro, cor: 'text-red-400', icon: <XCircle size={12} /> },
                { k: 'aviso' as const, l: 'Só avisos', n: res.resumo.comAviso, cor: 'text-yellow-400', icon: <AlertTriangle size={12} /> },
                { k: 'ok' as const, l: 'Sem problemas', n: res.resumo.ok, cor: 'text-[#22C55E]', icon: <CheckCircle2 size={12} /> },
              ].map(c => (
                <button key={c.k} onClick={() => setFiltro(c.k)} className={`text-left bg-[#0F172A] border rounded-2xl p-4 transition-all ${filtro === c.k ? 'border-white/40' : 'border-white/5 hover:border-white/20'}`}>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">{c.icon}{c.l}</p>
                  <p className={`text-2xl font-black ${c.cor}`}>{c.n}</p>
                </button>
              ))}
            </div>

            {res.resumo.porProblema.length > 0 && (
              <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-5 mb-6">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">O que mais aparece</p>
                <div className="space-y-1.5">
                  {res.resumo.porProblema.map((p, i) => (
                    <div key={i} className="flex items-start gap-3 text-xs">
                      <span className={`shrink-0 mt-0.5 text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${p.nivel === 'erro' ? 'text-red-400 border-red-500/30 bg-red-500/10' : 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10'}`}>{p.nivel}</span>
                      <span className="text-slate-300 flex-1">{p.mensagem}</span>
                      <span className="text-slate-500 font-mono shrink-0">{p.quantidade}×</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {res.resumo.total === 0 && <p className="text-center text-slate-500 text-sm py-10">Nenhum job encontrado com esses filtros — é exatamente o que a OPEC receberia (lista vazia).</p>}

            <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{lista.length} de {res.resumo.total} exibidos</p>
              <div className="flex gap-2">
                <button onClick={() => baixar(res.pacotes, `opec_${status}.json`)} className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest"><Download size={12} /> JSON completo</button>
                <button onClick={() => baixar({ resumo: res.resumo, contratos: res.contratos }, `opec_relatorio_${status}.json`)} className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest"><Download size={12} /> Relatório</button>
              </div>
            </div>

            <div className="space-y-2">
              {lista.map(({ c, i }) => {
                const erros = c.problemas.filter(p => p.nivel === 'erro').length; const avisos = c.problemas.length - erros;
                const open = aberto === i;
                return (
                  <div key={i} className="bg-[#0F172A] border border-white/5 rounded-2xl overflow-hidden">
                    <button onClick={() => setAberto(open ? null : i)} className="w-full text-left p-4 flex items-center gap-3 hover:bg-white/[0.02]">
                      {open ? <ChevronDown size={14} className="text-slate-500 shrink-0" /> : <ChevronRight size={14} className="text-slate-500 shrink-0" />}
                      <span className="font-mono text-xs text-slate-400 shrink-0 w-24">LD-{String(c.numero_contrato ?? '—').padStart(4, '0')}</span>
                      <span className="font-black text-sm truncate flex-1 min-w-0">{c.cliente}</span>
                      <span className="text-[10px] text-slate-500 hidden md:inline shrink-0">{c.unidade} · job {c.id_job}</span>
                      {erros > 0 && <span className="text-[10px] font-black text-red-400 bg-red-500/10 border border-red-500/30 px-2 py-0.5 rounded-full shrink-0">{erros} erro{erros > 1 ? 's' : ''}</span>}
                      {avisos > 0 && <span className="text-[10px] font-black text-yellow-400 bg-yellow-500/10 border border-yellow-500/30 px-2 py-0.5 rounded-full shrink-0">{avisos} aviso{avisos > 1 ? 's' : ''}</span>}
                      {c.problemas.length === 0 && <span className="text-[10px] font-black text-[#22C55E] bg-[#22C55E]/10 border border-[#22C55E]/30 px-2 py-0.5 rounded-full shrink-0">OK</span>}
                    </button>
                    {open && (
                      <div className="border-t border-white/5 p-4 space-y-4">
                        {c.problemas.length > 0 && (
                          <div className="space-y-1.5">
                            {c.problemas.map((p, k) => (
                              <p key={k} className="text-xs flex items-start gap-2">
                                <span className={`shrink-0 text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${p.nivel === 'erro' ? 'text-red-400 border-red-500/30 bg-red-500/10' : 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10'}`}>{p.nivel}</span>
                                <span className="text-slate-300"><span className="text-slate-500 font-mono">{p.campo}</span> — {p.mensagem}</span>
                              </p>
                            ))}
                          </div>
                        )}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">JSON que a OPEC recebe</p>
                            <button onClick={() => copiarJson(res.pacotes[i])} className="flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-400 hover:text-white"><Copy size={11} /> {copiado ? 'Copiado!' : 'Copiar'}</button>
                          </div>
                          <pre className="bg-black/40 border border-white/5 rounded-xl p-3 text-[11px] text-slate-300 overflow-auto max-h-[420px] custom-scrollbar">{JSON.stringify(res.pacotes[i], null, 2)}</pre>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
