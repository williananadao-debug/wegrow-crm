"use client";
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2, AlertCircle, Building2, Tag, Calendar, Award } from 'lucide-react';

type Carteirinha = {
  id: number;
  empresa: string;
  tipo: string;
  segmento: string | null;
  unidade: string;
  contrato_inicio: string | null;
  contrato_fim: string | null;
  ativa: boolean;
};

export default function CarteirinhaPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<Carteirinha | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!id) return;
    fetch(`/api/portal-cdl/carteirinha?id=${id}`)
      .then(r => r.json())
      .then(res => {
        if (res.erro) setErro(res.erro);
        else setData(res);
      })
      .catch(() => setErro('Não foi possível carregar a carteirinha.'))
      .finally(() => setLoading(false));
  }, [id]);

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&color=22C55E&bgcolor=0B1120&data=${encodeURIComponent(`${typeof window !== 'undefined' ? window.location.origin : ''}/carteirinha/${id}`)}`;

  if (loading) return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center">
      <Loader2 size={40} className="text-[#22C55E] animate-spin" />
    </div>
  );

  if (erro || !data) return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center p-4">
      <div className="bg-[#0F172A] border border-red-500/20 p-8 rounded-3xl max-w-sm w-full text-center">
        <AlertCircle size={40} className="text-red-400 mx-auto mb-4" />
        <h2 className="text-white font-black uppercase text-lg mb-2">Carteirinha não encontrada</h2>
        <p className="text-slate-400 text-sm">{erro || 'Este ID não corresponde a um associado ativo.'}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Card frente */}
        <div className={`bg-gradient-to-br ${data.ativa ? 'from-[#0F2A1A] to-[#0B1120]' : 'from-[#1A0F0F] to-[#0B1120]'} border ${data.ativa ? 'border-[#22C55E]/40' : 'border-red-500/40'} rounded-3xl p-6 shadow-2xl mb-4`}>
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-[#22C55E] rounded-xl flex items-center justify-center font-black text-[#0B1120] text-lg shadow-[0_0_20px_rgba(34,197,94,0.3)]">CDL</div>
              <div>
                <p className="font-black text-white text-sm uppercase tracking-tight">CDL de Taio</p>
                <p className="text-[9px] text-[#22C55E] uppercase tracking-widest font-bold">Câmara de Dirigentes Lojistas</p>
              </div>
            </div>
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase ${data.ativa ? 'bg-[#22C55E]/20 text-[#22C55E] border border-[#22C55E]/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
              {data.ativa ? <CheckCircle2 size={12}/> : <XCircle size={12}/>}
              {data.ativa ? 'Ativo' : 'Vencido'}
            </div>
          </div>

          {/* Nome */}
          <div className="mb-6">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Empresa Associada</p>
            <h1 className="text-xl font-black text-white uppercase tracking-tight leading-tight">{data.empresa}</h1>
          </div>

          {/* Infos */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-black/30 rounded-2xl p-3">
              <div className="flex items-center gap-1 mb-1">
                <Award size={10} className="text-[#22C55E]"/>
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Tipo</p>
              </div>
              <p className="text-white font-black text-xs uppercase">{data.tipo}</p>
            </div>
            {data.segmento && (
              <div className="bg-black/30 rounded-2xl p-3">
                <div className="flex items-center gap-1 mb-1">
                  <Tag size={10} className="text-[#22C55E]"/>
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Segmento</p>
                </div>
                <p className="text-white font-black text-xs uppercase truncate">{data.segmento}</p>
              </div>
            )}
            {data.contrato_inicio && (
              <div className="bg-black/30 rounded-2xl p-3">
                <div className="flex items-center gap-1 mb-1">
                  <Calendar size={10} className="text-[#22C55E]"/>
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Desde</p>
                </div>
                <p className="text-white font-black text-xs">{new Date(data.contrato_inicio + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
              </div>
            )}
            {data.contrato_fim && (
              <div className={`rounded-2xl p-3 ${!data.ativa ? 'bg-red-500/10' : 'bg-black/30'}`}>
                <div className="flex items-center gap-1 mb-1">
                  <Calendar size={10} className={data.ativa ? 'text-[#22C55E]' : 'text-red-400'}/>
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Validade</p>
                </div>
                <p className={`font-black text-xs ${data.ativa ? 'text-white' : 'text-red-400'}`}>
                  {new Date(data.contrato_fim + 'T00:00:00').toLocaleDateString('pt-BR')}
                </p>
              </div>
            )}
          </div>

          {/* QR + Protocolo */}
          <div className="flex items-center justify-between bg-black/30 rounded-2xl p-4">
            <div>
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Protocolo</p>
              <p className="text-[#22C55E] font-black text-lg">#{String(data.id).padStart(6, '0')}</p>
              <p className="text-[8px] text-slate-600 mt-1">Escaneie para verificar</p>
            </div>
            <img
              src={qrUrl}
              alt="QR Code"
              width={80}
              height={80}
              className="rounded-xl opacity-90"
            />
          </div>
        </div>

        <p className="text-center text-[9px] text-slate-600 uppercase font-bold tracking-widest">
          CDL de Taio · Câmara de Dirigentes Lojistas do Alto Vale do Itajaí
        </p>
      </div>
    </div>
  );
}
