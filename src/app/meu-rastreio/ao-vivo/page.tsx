"use client";
import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, Navigation, Clock, Gauge, ExternalLink } from 'lucide-react';
import { haQuanto, linkMapa, situacao, SITUACAO_INFO, type Veiculo } from '../../rastreio/shared';

const MapaRastreio = dynamic(() => import('../../rastreio/MapaRastreio'), { ssr: false });

type Dados = {
  empresa: { nome: string; logo: string | null; cor: string };
  veiculo: Partial<Veiculo> & { placa: string };
  expira: string;
  restanteMin: number;
};

// Link público de localização ao vivo (compartilhado pelo cliente ou pela central). Atualiza sozinho.
export default function AoVivoPage() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    const t = new URLSearchParams(window.location.search).get('t') || '';
    const r = await fetch(`/api/rastreio/ao-vivo?t=${encodeURIComponent(t)}`, { cache: 'no-store' }).catch(() => null);
    if (!r) return;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErro(j.error || 'Link indisponível.'); setDados(null); return; }
    setDados(j);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(carregar);
    const t = setInterval(() => { if (document.visibilityState === 'visible') carregar(); }, 5000);
    return () => clearInterval(t);
  }, [carregar]);

  if (erro) {
    return (
      <main className="min-h-[100dvh] bg-[#0B1120] text-white flex flex-col items-center justify-center p-6 text-center gap-3">
        <Navigation size={40} className="text-slate-500" />
        <h1 className="text-xl font-black">Localização indisponível</h1>
        <p className="text-slate-400 text-sm max-w-xs">{erro} Peça um novo link para quem compartilhou.</p>
      </main>
    );
  }
  if (!dados) return <main className="min-h-[100dvh] bg-[#0B1120] flex items-center justify-center"><Loader2 className="animate-spin text-slate-500" /></main>;

  const v = { ...dados.veiculo, id: 'ao-vivo' } as Veiculo;
  const s = situacao(v);
  const cor = dados.empresa.cor;
  const minRestantes = dados.restanteMin;

  return (
    <main className="min-h-[100dvh] bg-[#0B1120] text-white flex flex-col">
      <header className="px-4 py-3 flex items-center gap-3 border-b border-white/10">
        {dados.empresa.logo
          ? <img src={dados.empresa.logo} alt="" className="h-8 w-8 rounded-lg object-contain bg-white/5" />
          : <Navigation size={22} style={{ color: cor }} />}
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{dados.empresa.nome} · localização ao vivo</p>
          <h1 className="text-lg font-black tracking-wider truncate">{v.placa}{v.descricao ? <span className="text-slate-400 font-bold text-sm tracking-normal"> · {v.descricao}</span> : null}</h1>
        </div>
        <span className={`ml-auto shrink-0 text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${SITUACAO_INFO[s].classe}`}>{SITUACAO_INFO[s].label}</span>
      </header>

      <div className="flex-1 p-3">
        {v.ultima_lat != null
          ? <MapaRastreio veiculos={[v]} selecionadoId={v.id} chaveEnquadrar="ao-vivo" altura="h-[calc(100dvh-190px)] min-h-[300px]" />
          : <div className="h-[50vh] flex items-center justify-center text-slate-400 text-sm">O rastreador ainda não enviou posição.</div>}
      </div>

      <footer className="px-4 pb-5 grid grid-cols-3 gap-2 text-center">
        <div className="bg-white/5 rounded-xl p-2"><p className="text-[10px] text-slate-500 font-black uppercase flex items-center justify-center gap-1"><Gauge size={11} /> Velocidade</p><p className="font-black">{Math.round(Number(v.ultima_velocidade || 0))} km/h</p></div>
        <div className="bg-white/5 rounded-xl p-2"><p className="text-[10px] text-slate-500 font-black uppercase flex items-center justify-center gap-1"><Clock size={11} /> Posição</p><p className="font-black">{haQuanto(v.ultima_posicao_em || null)}</p></div>
        <div className="bg-white/5 rounded-xl p-2"><p className="text-[10px] text-slate-500 font-black uppercase">Link vale</p><p className="font-black">{minRestantes >= 120 ? `${Math.round(minRestantes / 60)} h` : `${minRestantes} min`}</p></div>
        {v.ultima_lat != null && (
          <a href={linkMapa(v.ultima_lat, v.ultima_lng!)} target="_blank" rel="noreferrer"
            className="col-span-3 mt-1 rounded-xl py-3 font-black uppercase text-xs flex items-center justify-center gap-2 text-[#0B1120]" style={{ background: cor }}>
            Abrir no Google Maps / rota até o veículo <ExternalLink size={13} />
          </a>
        )}
      </footer>
    </main>
  );
}
