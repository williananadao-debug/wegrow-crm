"use client";
import { useState } from 'react';
import { CDL } from '@/lib/cdl-config';
import { CheckCircle2, XCircle, Loader2, AlertCircle, LogIn, CreditCard, History, Calendar, Award, ArrowLeft, QrCode } from 'lucide-react';
import Link from 'next/link';

type DadosAssociado = {
  id: number;
  empresa: string;
  tipo: string;
  segmento: string | null;
  contrato_inicio: string | null;
  contrato_fim: string | null;
  valor_total: number;
  ativa: boolean;
  historicoPagamentos: { data: string; descricao: string }[];
};

function maskCnpj(value: string) {
  const d = value.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0,2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

function PortalAssociadoConteudo({ dados, onSair }: { dados: DadosAssociado; onSair: () => void }) {
  const diasParaVencer = dados.contrato_fim
    ? Math.floor((new Date(dados.contrato_fim + 'T00:00:00').getTime() - Date.now()) / 86400000)
    : null;

  return (
    <div className="bg-[#0F172A] border border-white/10 p-6 rounded-3xl max-w-md w-full shadow-2xl animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#22C55E] rounded-xl flex items-center justify-center font-black text-[#0B1120] text-sm">CDL</div>
          <div>
            <p className="font-black text-white text-sm uppercase tracking-tight">{CDL.nome}</p>
            <p className="text-[10px] text-[#22C55E] uppercase tracking-widest font-bold">Área do Associado</p>
          </div>
        </div>
        <div className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[9px] font-black uppercase ${dados.ativa ? 'bg-[#22C55E]/20 text-[#22C55E] border border-[#22C55E]/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
          {dados.ativa ? <CheckCircle2 size={10}/> : <XCircle size={10}/>}
          {dados.ativa ? 'Ativo' : 'Vencido'}
        </div>
      </div>

      {/* Empresa */}
      <div className="bg-[#0B1120] border border-white/5 rounded-2xl p-4 mb-4">
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Empresa</p>
        <h2 className="text-lg font-black text-white uppercase">{dados.empresa}</h2>
        <p className="text-[10px] text-[#22C55E] font-bold mt-0.5">Protocolo #{String(dados.id).padStart(6, '0')}</p>
      </div>

      {/* Infos */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-[#0B1120] border border-white/5 rounded-2xl p-3">
          <div className="flex items-center gap-1 mb-1">
            <Award size={10} className="text-[#22C55E]"/>
            <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Plano</p>
          </div>
          <p className="text-white font-black text-xs uppercase">{dados.tipo || '—'}</p>
        </div>
        <div className="bg-[#0B1120] border border-white/5 rounded-2xl p-3">
          <div className="flex items-center gap-1 mb-1">
            <CreditCard size={10} className="text-[#22C55E]"/>
            <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Anuidade</p>
          </div>
          <p className="text-white font-black text-xs">R$ {(dados.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        </div>
        {dados.contrato_inicio && (
          <div className="bg-[#0B1120] border border-white/5 rounded-2xl p-3">
            <div className="flex items-center gap-1 mb-1">
              <Calendar size={10} className="text-[#22C55E]"/>
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Associado desde</p>
            </div>
            <p className="text-white font-black text-xs">{new Date(dados.contrato_inicio + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
          </div>
        )}
        {dados.contrato_fim && (
          <div className={`border rounded-2xl p-3 ${!dados.ativa ? 'bg-red-500/10 border-red-500/20' : diasParaVencer !== null && diasParaVencer <= 30 ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-[#0B1120] border-white/5'}`}>
            <div className="flex items-center gap-1 mb-1">
              <Calendar size={10} className={!dados.ativa ? 'text-red-400' : diasParaVencer !== null && diasParaVencer <= 30 ? 'text-yellow-400' : 'text-[#22C55E]'}/>
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Validade</p>
            </div>
            <p className={`font-black text-xs ${!dados.ativa ? 'text-red-400' : diasParaVencer !== null && diasParaVencer <= 30 ? 'text-yellow-400' : 'text-white'}`}>
              {new Date(dados.contrato_fim + 'T00:00:00').toLocaleDateString('pt-BR')}
              {diasParaVencer !== null && diasParaVencer >= 0 && diasParaVencer <= 30 && <span className="ml-1 text-[8px]">({diasParaVencer}d)</span>}
            </p>
          </div>
        )}
      </div>

      {/* Alertas */}
      {!dados.ativa && (
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-2xl p-3 mb-4">
          <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5"/>
          <p className="text-red-400 text-xs font-bold">Sua associação está vencida. Entre em contato com a CDL para renovar seus benefícios.</p>
        </div>
      )}
      {dados.ativa && diasParaVencer !== null && diasParaVencer <= 30 && (
        <div className="flex items-start gap-3 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-3 mb-4">
          <AlertCircle size={16} className="text-yellow-400 shrink-0 mt-0.5"/>
          <p className="text-yellow-400 text-xs font-bold">Sua associação vence em {diasParaVencer} dias. Entre em contato para renovar.</p>
        </div>
      )}

      {/* Histórico de pagamentos */}
      {dados.historicoPagamentos.length > 0 && (
        <div className="bg-[#0B1120] border border-white/5 rounded-2xl p-4 mb-4">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1"><History size={10}/> Histórico de Pagamentos</p>
          <div className="space-y-2">
            {dados.historicoPagamentos.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-[#22C55E] rounded-full shrink-0"/>
                <span className="text-[10px] text-slate-400">{new Date(p.data).toLocaleDateString('pt-BR')} — {p.descricao}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Carteirinha */}
      <Link
        href={`/carteirinha/${dados.id}`}
        className="w-full bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E] py-3 rounded-2xl font-black uppercase text-xs tracking-widest transition-all flex items-center justify-center gap-2 mb-3"
      >
        <QrCode size={14}/> Ver Carteirinha Digital
      </Link>

      <button
        onClick={onSair}
        className="w-full bg-white/5 hover:bg-white/10 text-slate-500 hover:text-white py-2.5 rounded-xl font-bold uppercase text-xs tracking-widest transition-colors flex items-center justify-center gap-1"
      >
        <ArrowLeft size={12}/> Sair
      </button>
    </div>
  );
}

export default function PortalAssociadoPage() {
  const [cnpj, setCnpj] = useState('');
  const [protocolo, setProtocolo] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [dados, setDados] = useState<DadosAssociado | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    setLoading(true);

    const res = await fetch(`/api/portal-cdl/associado?cnpj=${encodeURIComponent(cnpj)}&id=${encodeURIComponent(protocolo)}`);
    const json = await res.json();

    if (!res.ok) {
      setErro(json.erro || 'Não foi possível verificar os dados.');
    } else {
      setDados(json);
    }
    setLoading(false);
  };

  if (dados) return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center p-4">
      <PortalAssociadoConteudo dados={dados} onSair={() => setDados(null)} />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center p-4">
      <div className="bg-[#0F172A] border border-white/10 p-8 rounded-3xl max-w-md w-full shadow-2xl animate-in fade-in duration-500">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-12 h-12 bg-[#22C55E] rounded-xl flex items-center justify-center font-black text-[#0B1120] text-xl shadow-[0_0_20px_rgba(34,197,94,0.3)]">CDL</div>
            <div className="text-left">
              <p className="font-black text-white text-sm uppercase tracking-tight">{CDL.nome}</p>
              <p className="text-[10px] text-[#22C55E] uppercase tracking-widest font-bold">Área do Associado</p>
            </div>
          </div>
          <h1 className="text-xl font-black text-white uppercase italic tracking-tighter">Consultar Associação</h1>
          <p className="text-slate-400 text-sm mt-2">Informe seu CNPJ e número de protocolo para acessar seus dados.</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">CNPJ</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="00.000.000/0001-00"
              value={cnpj}
              onChange={e => setCnpj(maskCnpj(e.target.value))}
              required
              className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-white font-mono text-sm outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600"
            />
          </div>
          <div>
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Número do Protocolo</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Ex: 000123"
              value={protocolo}
              onChange={e => setProtocolo(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-white font-mono text-sm outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600"
            />
          </div>
          <button
            type="submit"
            disabled={loading || cnpj.replace(/\D/g, '').length !== 14 || !protocolo}
            className="w-full bg-[#22C55E] hover:bg-[#16A34A] text-[#0B1120] py-4 rounded-2xl font-black uppercase text-sm tracking-widest disabled:opacity-50 flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
          >
            {loading ? <Loader2 size={18} className="animate-spin"/> : <LogIn size={18}/>}
            {loading ? 'Verificando...' : 'Acessar'}
          </button>
        </form>

        {erro && (
          <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-2xl p-4 mt-4">
            <AlertCircle size={18} className="text-red-400 shrink-0"/>
            <p className="text-red-400 text-sm font-bold">{erro}</p>
          </div>
        )}

        <div className="mt-6 pt-6 border-t border-white/5 flex flex-col gap-2">
          <Link href="/portal-cdl/status" className="text-center text-slate-500 hover:text-white text-xs font-bold uppercase tracking-widest transition-colors">
            Acompanhar pré-cadastro
          </Link>
          <Link href="/portal-cdl" className="text-center text-slate-600 hover:text-white text-xs font-bold uppercase tracking-widest transition-colors">
            Novo cadastro
          </Link>
        </div>
      </div>
    </div>
  );
}
