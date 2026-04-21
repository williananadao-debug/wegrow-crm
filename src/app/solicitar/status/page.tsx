"use client";
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Clock, Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

const ETAPAS = [
  { label: 'Solicitação recebida', icon: CheckCircle2, color: 'text-[#22C55E]', bg: 'bg-[#22C55E]/20' },
  { label: 'Em análise', icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500/20' },
  { label: 'Proposta sendo elaborada', icon: Clock, color: 'text-purple-400', bg: 'bg-purple-500/20' },
  { label: 'Em negociação', icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
  { label: 'Finalizado', icon: CheckCircle2, color: 'text-[#22C55E]', bg: 'bg-[#22C55E]/20' },
];

function StatusContent() {
  const params = useSearchParams();
  const id = params.get('id');

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!id) { setErro('ID não informado.'); setLoading(false); return; }
    fetch(`/api/portal/status?id=${id}`)
      .then(r => r.json())
      .then(res => {
        if (res.erro) setErro(res.erro);
        else setData(res);
      })
      .catch(() => setErro('Não foi possível carregar o status.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center">
      <Loader2 size={40} className="text-[#22C55E] animate-spin" />
    </div>
  );

  if (erro) return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center p-4">
      <div className="bg-[#0F172A] border border-red-500/20 p-8 rounded-3xl max-w-md w-full text-center">
        <AlertCircle size={40} className="text-red-400 mx-auto mb-4" />
        <h2 className="text-white font-black uppercase text-lg mb-2">Solicitação não encontrada</h2>
        <p className="text-slate-400 text-sm mb-6">{erro}</p>
        <Link href="/solicitar" className="text-[#22C55E] font-bold text-sm hover:underline flex items-center gap-1 justify-center">
          <ArrowLeft size={14}/> Fazer nova solicitação
        </Link>
      </div>
    </div>
  );

  const etapaAtual = data.status === 'perdido' ? 5 : Math.min(data.etapa, 4);

  return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center p-4">
      <div className="bg-[#0F172A] border border-white/10 p-8 rounded-3xl max-w-lg w-full shadow-2xl animate-in fade-in duration-500">

        <div className="text-center mb-8">
          <span className="text-[10px] font-black text-orange-500 uppercase tracking-[0.2em]">Portal do Anunciante</span>
          <h1 className="text-2xl font-black text-white uppercase italic tracking-tighter mt-1">Acompanhar Solicitação</h1>
        </div>

        <div className="bg-[#0B1120] border border-white/5 rounded-2xl p-4 mb-8 flex items-center justify-between">
          <div>
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Empresa</p>
            <p className="text-white font-black text-sm uppercase">{data.empresa}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Protocolo</p>
            <p className="text-[#22C55E] font-black text-lg">#{String(data.id).padStart(6, '0')}</p>
          </div>
        </div>

        <div className="space-y-3 mb-8">
          {ETAPAS.map((etapa, i) => {
            const isDone = i < etapaAtual;
            const isCurrent = i === etapaAtual;
            const Icon = etapa.icon;
            return (
              <div key={i} className={`flex items-center gap-4 p-3 rounded-xl transition-all ${isCurrent ? `${etapa.bg} border border-white/10` : isDone ? 'opacity-60' : 'opacity-20'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isCurrent ? etapa.bg : isDone ? 'bg-white/10' : 'bg-white/5'}`}>
                  {isDone ? <CheckCircle2 size={16} className="text-[#22C55E]" /> : <Icon size={16} className={isCurrent ? etapa.color : 'text-slate-600'} />}
                </div>
                <span className={`text-xs font-black uppercase tracking-wide ${isCurrent ? etapa.color : isDone ? 'text-slate-400' : 'text-slate-600'}`}>
                  {etapa.label}
                  {isCurrent && <span className="ml-2 text-[8px] bg-white/10 px-1.5 py-0.5 rounded">ATUAL</span>}
                </span>
              </div>
            );
          })}
        </div>

        <p className="text-[10px] text-slate-600 text-center mb-6">
          Solicitação enviada em {new Date(data.criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
        </p>

        <Link href="/solicitar" className="block text-center text-slate-500 hover:text-white text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-1 justify-center">
          <ArrowLeft size={12}/> Nova solicitação
        </Link>
      </div>
    </div>
  );
}

export default function StatusPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0B1120] flex items-center justify-center"><Loader2 size={40} className="text-[#22C55E] animate-spin" /></div>}>
      <StatusContent />
    </Suspense>
  );
}
