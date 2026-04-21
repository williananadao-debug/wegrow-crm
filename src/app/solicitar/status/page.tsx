"use client";
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle2, Clock, Loader2, AlertCircle, ArrowLeft, Search } from 'lucide-react';
import Link from 'next/link';

const ETAPAS = [
  { label: 'Solicitação recebida', icon: CheckCircle2, color: 'text-[#22C55E]', bg: 'bg-[#22C55E]/20' },
  { label: 'Em análise', icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500/20' },
  { label: 'Proposta sendo elaborada', icon: Clock, color: 'text-purple-400', bg: 'bg-purple-500/20' },
  { label: 'Em negociação', icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
  { label: 'Finalizado', icon: CheckCircle2, color: 'text-[#22C55E]', bg: 'bg-[#22C55E]/20' },
];

function TimelineLead({ data }: { data: any }) {
  const etapaAtual = data.status === 'perdido' ? 5 : Math.min(data.etapa, 4);
  return (
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

      <Link href="/solicitar/status" className="block text-center text-slate-500 hover:text-white text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-1 justify-center">
        <ArrowLeft size={12}/> Buscar outra solicitação
      </Link>
    </div>
  );
}

function BuscaForm() {
  const router = useRouter();
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(false);
  const [resultados, setResultados] = useState<any[] | null>(null);
  const [erro, setErro] = useState('');

  const handleBusca = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!busca.trim()) return;
    setLoading(true);
    setErro('');
    setResultados(null);
    const res = await fetch(`/api/portal/status?busca=${encodeURIComponent(busca.trim())}`);
    const json = await res.json();
    if (!res.ok) setErro(json.erro || 'Nenhuma solicitação encontrada.');
    else setResultados(Array.isArray(json) ? json : [json]);
    setLoading(false);
  };

  return (
    <div className="bg-[#0F172A] border border-white/10 p-8 rounded-3xl max-w-lg w-full shadow-2xl animate-in fade-in duration-500">
      <div className="text-center mb-8">
        <span className="text-[10px] font-black text-orange-500 uppercase tracking-[0.2em]">Portal do Anunciante</span>
        <h1 className="text-2xl font-black text-white uppercase italic tracking-tighter mt-1">Consultar Status</h1>
        <p className="text-slate-400 text-sm mt-2">Digite seu CNPJ, telefone ou número de protocolo.</p>
      </div>

      <form onSubmit={handleBusca} className="space-y-4 mb-6">
        <div className="relative">
          <input
            type="text"
            placeholder="Ex: 12.345.678/0001-90 ou (47) 99999-9999 ou #000042"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm font-semibold outline-none focus:border-orange-500 transition-colors placeholder:text-slate-600"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !busca.trim()}
          className="w-full bg-gradient-to-r from-orange-500 to-red-600 text-white py-4 rounded-2xl font-black uppercase text-sm tracking-widest disabled:opacity-50 flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
        >
          {loading ? <Loader2 size={18} className="animate-spin"/> : <Search size={18}/>}
          {loading ? 'Buscando...' : 'Buscar Solicitação'}
        </button>
      </form>

      {erro && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-2xl p-4 mb-4">
          <AlertCircle size={20} className="text-red-400 shrink-0"/>
          <p className="text-red-400 text-sm font-bold">{erro}</p>
        </div>
      )}

      {resultados && resultados.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">{resultados.length} solicitação(ões) encontrada(s)</p>
          {resultados.map(r => (
            <button
              key={r.id}
              onClick={() => router.push(`/solicitar/status?id=${r.id}`)}
              className="w-full flex items-center justify-between bg-white/[0.03] hover:bg-white/[0.07] border border-white/5 hover:border-white/20 rounded-2xl px-4 py-3 transition-all text-left"
            >
              <div>
                <p className="text-white font-black text-sm uppercase">{r.empresa}</p>
                <p className="text-slate-500 text-[10px] mt-0.5">
                  {new Date(r.criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[#22C55E] font-black text-sm">#{String(r.id).padStart(6, '0')}</p>
                <p className="text-[9px] text-slate-500 uppercase font-bold mt-0.5">{r.etapaDescricao}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      <Link href="/solicitar" className="block text-center text-slate-600 hover:text-white text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-1 justify-center mt-6">
        <ArrowLeft size={12}/> Nova solicitação
      </Link>
    </div>
  );
}

function StatusContent() {
  const params = useSearchParams();
  const id = params.get('id');

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/portal/status?id=${id}`)
      .then(r => r.json())
      .then(res => { if (res.erro) setErro(res.erro); else setData(res); })
      .catch(() => setErro('Não foi possível carregar o status.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (!id) {
    return <BuscaForm />;
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center">
      <Loader2 size={40} className="text-[#22C55E] animate-spin" />
    </div>
  );

  if (erro) return (
    <div className="bg-[#0F172A] border border-red-500/20 p-8 rounded-3xl max-w-md w-full text-center">
      <AlertCircle size={40} className="text-red-400 mx-auto mb-4" />
      <h2 className="text-white font-black uppercase text-lg mb-2">Solicitação não encontrada</h2>
      <p className="text-slate-400 text-sm mb-6">{erro}</p>
      <Link href="/solicitar/status" className="text-[#22C55E] font-bold text-sm hover:underline flex items-center gap-1 justify-center">
        <ArrowLeft size={14}/> Buscar novamente
      </Link>
    </div>
  );

  if (data) return <TimelineLead data={data} />;

  return null;
}

export default function StatusPage() {
  return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center p-4">
      <Suspense fallback={<Loader2 size={40} className="text-[#22C55E] animate-spin" />}>
        <StatusContent />
      </Suspense>
    </div>
  );
}
