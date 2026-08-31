"use client";
import { useEffect, useState, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { CheckCircle2, Clock, Loader2, AlertCircle, ArrowLeft, Search, XCircle } from 'lucide-react';
import Link from 'next/link';

type Lead = {
  id: number; empresa: string; status: string; etapa: number; etapaDescricao: string; criadoEm: string;
  numeroProcesso?: string | null; andamentos?: { nome: string; dataHora: string }[];
};
type PortalConfig = { nome_portal: string; cor_primaria: string; logo_texto: string; etapas: string[] };

function StatusContent() {
  const { slug } = useParams() as { slug: string };
  const sp = useSearchParams();
  const [config, setConfig] = useState<PortalConfig | null>(null);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [erro, setErro] = useState('');

  useEffect(() => {
    fetch(`/api/portal/${slug}`).then(r => r.ok ? r.json() : null).then(d => d && setConfig(d));
  }, [slug]);

  useEffect(() => {
    const id = sp.get('id');
    if (id) buscarPorId(id);
  }, [sp]);

  const cor = config?.cor_primaria || '#22C55E';
  const logo = config?.logo_texto || 'W';
  const etapas = config?.etapas ?? ['Recebido', 'Em análise', 'Proposta enviada', 'Em negociação', 'Concluído'];

  const buscarPorId = async (id: string) => {
    setLoading(true); setErro(''); setLeads([]);
    const r = await fetch(`/api/portal/${slug}/status?id=${id}`);
    const j = await r.json();
    if (!r.ok) setErro(j.erro || 'Não encontrado.');
    else setLeads([j]);
    setLoading(false);
  };

  const buscarPorTermo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!busca.trim()) return;
    setLoading(true); setErro(''); setLeads([]);
    const isId = /^\d+$/.test(busca.trim());
    const url = isId ? `/api/portal/${slug}/status?id=${busca.trim()}` : `/api/portal/${slug}/status?busca=${encodeURIComponent(busca.trim())}`;
    const r = await fetch(url);
    const j = await r.json();
    if (!r.ok) setErro(j.erro || 'Não encontrado.');
    else setLeads(Array.isArray(j) ? j : [j]);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-4">

        {/* Header */}
        <div className="bg-[#0F172A] border border-white/10 p-6 rounded-3xl text-center">
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-[#0B1120] text-sm" style={{ background: cor }}>{logo}</div>
            <div className="text-left">
              <p className="font-black text-white text-sm uppercase tracking-tight">{config?.nome_portal || '...'}</p>
              <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: cor }}>Acompanhar Cadastro</p>
            </div>
          </div>
          <form onSubmit={buscarPorTermo} className="flex gap-2 mt-4">
            <input
              type="text" placeholder="Protocolo, CNPJ ou WhatsApp..."
              className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm outline-none placeholder:text-slate-600"
              value={busca} onChange={e => setBusca(e.target.value)}
              onFocus={e => (e.target.style.borderColor = cor)} onBlur={e => (e.target.style.borderColor = '')}
            />
            <button type="submit" className="px-5 py-3 rounded-2xl font-black transition-all" style={{ background: cor, color: '#0B1120' }}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            </button>
          </form>
        </div>

        {/* Erro */}
        {erro && (
          <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
            <AlertCircle size={18} className="text-red-400 shrink-0" />
            <p className="text-red-400 text-sm font-bold">{erro}</p>
          </div>
        )}

        {/* Resultados */}
        {leads.map(lead => {
          const etapaAtual = Math.min(lead.etapa, etapas.length - 1);
          const concluido = lead.status === 'ganho' || lead.etapa >= etapas.length - 1;
          const perdido = lead.status === 'perdido';

          return (
            <div key={lead.id} className="bg-[#0F172A] border border-white/10 p-6 rounded-3xl shadow-2xl animate-in fade-in duration-500">
              <div className="flex items-center justify-between bg-[#0B1120] border border-white/5 rounded-2xl p-4 mb-6">
                <div>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Empresa</p>
                  <p className="text-white font-black text-sm uppercase">{lead.empresa}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Protocolo</p>
                  <p className="font-black text-lg" style={{ color: cor }}>#{String(lead.id).padStart(6, '0')}</p>
                </div>
              </div>

              {perdido ? (
                <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-2xl p-4 mb-4">
                  <XCircle size={20} className="text-red-400 shrink-0" />
                  <p className="text-red-400 text-sm font-bold">Este processo foi encerrado. Entre em contato para reabrir.</p>
                </div>
              ) : (
                <div className="space-y-2 mb-6">
                  {etapas.map((label, i) => {
                    const done = i < etapaAtual || concluido;
                    const current = !concluido && i === etapaAtual;
                    return (
                      <div key={i} className={`flex items-center gap-3 p-3 rounded-xl transition-all ${current ? 'border border-white/10' : ''} ${!done && !current ? 'opacity-20' : ''}`}
                        style={current ? { background: `${cor}15` } : {}}>
                        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: done ? `${cor}25` : current ? `${cor}20` : 'rgba(255,255,255,0.05)' }}>
                          {done
                            ? <CheckCircle2 size={14} style={{ color: cor }} />
                            : <Clock size={14} className={current ? '' : 'text-slate-600'} style={current ? { color: cor } : {}} />
                          }
                        </div>
                        <span className="text-xs font-black uppercase tracking-wide" style={current ? { color: cor } : { color: done ? '#cbd5e1' : '#475569' }}>
                          {label}
                          {current && <span className="ml-2 text-[8px] bg-white/10 px-1.5 py-0.5 rounded">ATUAL</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {(lead.andamentos?.length ?? 0) > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                    Andamentos do processo{lead.numeroProcesso ? ` · ${lead.numeroProcesso}` : ''}
                  </p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {lead.andamentos!.map((a, i) => (
                      <div key={i} className="bg-[#0B1120] border border-white/5 rounded-xl p-3">
                        <p className="text-[11.5px] font-bold text-slate-200">{a.nome}</p>
                        <p className="text-[10px] text-slate-600">{new Date(a.dataHora).toLocaleDateString('pt-BR')}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[10px] text-slate-600 text-center">
                Cadastro enviado em {new Date(lead.criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
              </p>
            </div>
          );
        })}

        <Link href={`/p/${slug}`} className="flex items-center justify-center gap-1 text-slate-500 hover:text-white text-xs font-bold uppercase tracking-widest transition-colors">
          <ArrowLeft size={12} /> Voltar ao portal
        </Link>
      </div>
    </div>
  );
}

export default function StatusPage() {
  return <Suspense fallback={<div className="min-h-screen bg-[#0B1120] flex items-center justify-center"><Loader2 size={32} className="animate-spin text-slate-500" /></div>}><StatusContent /></Suspense>;
}
