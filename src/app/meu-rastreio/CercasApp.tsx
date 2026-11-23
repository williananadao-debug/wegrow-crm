"use client";
import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, Plus, Trash2, Crosshair, X, Undo2, Circle as IconeCirculo, PenLine } from 'lucide-react';
import type { Veiculo } from '../rastreio/shared';
import type { CercaMapa } from '../rastreio/MapaRastreio';

const MapaRastreio = dynamic(() => import('../rastreio/MapaRastreio'), { ssr: false });

type Cerca = CercaMapa & { veiculo_id: string; ativo: boolean; dentro: boolean | null };
const RAIOS = [100, 200, 500, 1000, 3000, 10000];
const fmtRaio = (m: number) => (m >= 1000 ? `${m / 1000} km` : `${m} m`);

async function chamar(corpo: unknown) {
  const r = await fetch('/api/rastreio/app/cercas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
  return j;
}

// Cercas criadas pelo cliente: toca no mapa para marcar o centro, escolhe o raio e o nome.
// O aviso de entrada/saída chega como alerta (e notificação, se ligada em Notificações).
export default function CercasApp({ veiculo, cor }: { veiculo: Veiculo; cor: string }) {
  const [cercas, setCercas] = useState<Cerca[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [nova, setNova] = useState<{ lat: number; lng: number } | null>(null);
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState('');
  const [raio, setRaio] = useState(200);
  const [modo, setModo] = useState<'desenho' | 'circulo'>('desenho');
  const [pontos, setPontos] = useState<[number, number][]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    const r = await fetch('/api/rastreio/app/cercas', { cache: 'no-store' }).then(x => x.json()).catch(() => ({ cercas: [] }));
    setCercas(r.cercas || []);
    setCarregando(false);
  }, []);
  useEffect(() => { void Promise.resolve().then(carregar); }, [carregar]);

  const doVeiculo = cercas.filter(c => c.veiculo_id === veiculo.id);
  const noMapa: CercaMapa[] = [
    ...doVeiculo,
    ...(modo === 'circulo' && nova ? [{ id: 'nova', nome: nome || 'Nova cerca', lat: nova.lat, lng: nova.lng, raio_m: raio, ativo: true, tipo: 'circulo' }] : []),
  ];
  const limpar = () => { setCriando(false); setNova(null); setPontos([]); setNome(''); setErro(''); };
  const pronto = modo === 'desenho' ? pontos.length >= 3 : Boolean(nova);

  const salvar = async () => {
    if (!pronto) return;
    setOcupado(true); setErro('');
    try {
      await chamar(modo === 'desenho'
        ? { acao: 'criar', veiculoId: veiculo.id, nome, tipo: 'poligono', pontos }
        : { acao: 'criar', veiculoId: veiculo.id, nome, lat: nova!.lat, lng: nova!.lng, raio });
      limpar();
      await carregar();
    } catch (e) { setErro((e as Error).message); }
    finally { setOcupado(false); }
  };
  const acao = async (a: 'alternar' | 'excluir', c: Cerca) => {
    if (a === 'excluir' && !confirm(`Excluir a cerca "${c.nome}"?`)) return;
    setOcupado(true);
    await chamar({ acao: a, id: c.id }).catch(e => setErro((e as Error).message));
    await carregar();
    setOcupado(false);
  };

  return (
    <>
      {criando && (
        <p className="text-sm font-bold" style={{ color: cor }}>
          {modo === 'desenho'
            ? (pontos.length < 3 ? `Toque no mapa para marcar os cantos da área (${pontos.length} de no mínimo 3).` : `${pontos.length} pontos. Continue tocando para ajustar ou salve.`)
            : (nova ? 'Ajuste o raio e dê um nome. Tocar no mapa muda o centro.' : 'Toque no mapa onde fica o lugar (casa, trabalho...).')}
        </p>
      )}
      <MapaRastreio veiculos={[veiculo]} selecionadoId={veiculo.id} cercas={noMapa} chaveEnquadrar={`cercas|${veiculo.id}|${doVeiculo.length}`} altura="h-[42vh] min-h-[260px]"
        desenho={criando && modo === 'desenho' ? pontos : undefined}
        onClickMapa={criando ? (lat, lng) => (modo === 'desenho' ? setPontos(p => [...p, [lat, lng] as [number, number]].slice(0, 40)) : setNova({ lat, lng })) : undefined} />

      {criando ? (
        <section className="bg-[#0F172A] border border-white/10 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Nova cerca</p>
            <button onClick={limpar} aria-label="Cancelar" className="text-slate-400"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {([['desenho', 'Desenhar área', PenLine], ['circulo', 'Círculo', IconeCirculo]] as const).map(([m, t, Icone]) => (
              <button key={m} onClick={() => { setModo(m); setErro(''); }} className="min-h-11 rounded-xl border text-sm font-black flex items-center justify-center gap-2"
                style={modo === m ? { borderColor: cor, background: `${cor}1F` } : { borderColor: 'rgba(255,255,255,0.1)', color: '#CBD5E1' }}><Icone size={16} /> {t}</button>
            ))}
          </div>
          {modo === 'desenho' && pontos.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setPontos(p => p.slice(0, -1))} className="min-h-11 rounded-xl border border-white/15 bg-white/5 text-sm font-bold flex items-center justify-center gap-2"><Undo2 size={16} /> Desfazer ponto</button>
              <button onClick={() => setPontos([])} className="min-h-11 rounded-xl border border-white/15 bg-white/5 text-sm font-bold">Recomeçar</button>
            </div>
          )}
          {modo === 'circulo' && veiculo.ultima_lat != null && (
            <button onClick={() => setNova({ lat: veiculo.ultima_lat!, lng: veiculo.ultima_lng! })} className="w-full min-h-11 rounded-xl border border-white/15 bg-white/5 text-sm font-bold flex items-center justify-center gap-2">
              <Crosshair size={16} /> Usar onde o veículo está agora
            </button>
          )}
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome (ex.: Casa)" maxLength={60}
            className="w-full min-h-12 bg-white/5 border border-white/15 rounded-xl px-4 text-sm text-white outline-none" />
          {modo === 'circulo' && <div className="grid grid-cols-3 gap-2">
            {RAIOS.map(r => (
              <button key={r} onClick={() => setRaio(r)} className="min-h-11 rounded-xl border text-sm font-black"
                style={raio === r ? { borderColor: cor, background: `${cor}1F` } : { borderColor: 'rgba(255,255,255,0.1)', color: '#CBD5E1' }}>{fmtRaio(r)}</button>
            ))}
          </div>}
          {erro && <p className="text-sm text-red-300">{erro}</p>}
          <button onClick={salvar} disabled={ocupado || !pronto || !nome.trim()} className="w-full min-h-14 rounded-2xl font-black uppercase text-[#0B1120] disabled:opacity-40 flex items-center justify-center gap-2" style={{ background: cor }}>
            {ocupado && <Loader2 size={16} className="animate-spin" />} Salvar cerca
          </button>
        </section>
      ) : (
        <button onClick={() => { setCriando(true); setErro(''); }} className="w-full min-h-14 rounded-2xl font-black uppercase text-sm text-[#0B1120] flex items-center justify-center gap-2" style={{ background: cor }}>
          <Plus size={18} /> Criar cerca
        </button>
      )}

      <section aria-label="Cercas" className="space-y-2">
        {carregando ? <Loader2 size={18} className="animate-spin text-slate-500 mx-auto" /> : doVeiculo.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-4">Nenhuma cerca neste veículo. Crie uma para ser avisado quando ele sair ou chegar em um lugar.</p>
        ) : doVeiculo.map(c => (
          <article key={c.id} className="rounded-2xl border border-white/10 bg-[#0F172A] p-4 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-black truncate">{c.nome}</p>
              <p className="text-xs text-slate-400">{c.tipo === 'poligono' ? 'Área desenhada' : `Raio de ${fmtRaio(c.raio_m)}`}{c.dentro != null && c.ativo ? ` · veículo ${c.dentro ? 'dentro' : 'fora'}` : ''}</p>
            </div>
            <button onClick={() => acao('alternar', c)} disabled={ocupado} className="min-h-10 px-3 rounded-xl border text-xs font-black uppercase"
              style={c.ativo ? { borderColor: cor, color: cor } : { borderColor: 'rgba(255,255,255,0.15)', color: '#94A3B8' }}>{c.ativo ? 'Ligada' : 'Desligada'}</button>
            <button onClick={() => acao('excluir', c)} disabled={ocupado} aria-label={`Excluir ${c.nome}`} className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-slate-400"><Trash2 size={16} /></button>
          </article>
        ))}
      </section>
    </>
  );
}
