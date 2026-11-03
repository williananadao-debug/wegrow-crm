"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Circle, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, LocateFixed, Navigation, Phone, Plus, MapPin, CheckCircle2, Store, Globe } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { queryOverpass } from '@/lib/prospeccaoOsm';

type Comercio = {
  osm_id: string; nome: string; segmento: string; segmento_osm: string; lat: number; lng: number; distancia_m: number;
  endereco: string | null; bairro: string | null; cidade: string | null; telefone: string | null; site: string | null;
  instagram: string | null; horario: string | null;
  cliente: { id: number; nome: string; segmento: string | null; situacao?: 'anunciando' | 'ja_comprou' | 'negociando' | 'cadastrado'; total_comprado?: number } | null;
  ultima_visita: { id: number; em: string; lead_id: number | null } | null;
};
type VisitaSolta = { id: number; nome: string; lat: number; lng: number; em: string; cliente_id: number | null; distancia_m: number };
type Resposta = { fonte?: string; centro: { lat: number; lng: number }; raio: number; comercios: Comercio[]; visitas: VisitaSolta[]; resumo: { total: number; clientes: number; novos: number } };

const SITUACAO: Record<string, { cor: string; label: string }> = {
  anunciando: { cor: '#22C55E', label: 'Anunciando' },
  ja_comprou: { cor: '#3B82F6', label: 'Já comprou' },
  negociando: { cor: '#A855F7', label: 'Negociando' },
  cadastrado: { cor: '#38BDF8', label: 'Cadastrado' },
  novo: { cor: '#F97316', label: 'Não cadastrado' },
};
const situacaoDe = (c: Comercio) => c.cliente ? (c.cliente.situacao || 'cadastrado') : 'novo';
const fmtDist = (m: number) => m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const ESPELHOS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
async function overpassNoNavegador(lat: number, lng: number, raio: number): Promise<any[]> {
  const corpo = 'data=' + encodeURIComponent(queryOverpass(lat, lng, raio));
  try {
    return await Promise.any(ESPELHOS.map(async url => {
      const r = await fetch(url, { method: 'POST', body: corpo, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(25000) });
      if (!r.ok) throw new Error(String(r.status));
      return (await r.json()).elements as any[];
    }));
  } catch {
    throw new Error('O mapa público de comércios está fora do ar agora. Tente de novo em alguns minutos.');
  }
}

function Recentrar({ lat, lng, raio }: { lat: number; lng: number; raio: number }) {
  const map = useMap();
  useEffect(() => { map.setView([lat, lng], raio <= 500 ? 16 : raio <= 1000 ? 15 : raio <= 2000 ? 14 : 13); }, [lat, lng, raio, map]);
  return null;
}

export default function ProspeccaoMapa({ empresaId, userId, onRegistrarVisita }: {
  empresaId: string; userId: string;
  onRegistrarVisita: (dados: { nome: string; telefone: string; cidade: string; clienteId: number | null }) => void;
}) {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [raio, setRaio] = useState(1000);
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'novos' | 'clientes'>('todos');
  const [segmento, setSegmento] = useState('Todos');
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [cadastrando, setCadastrando] = useState<string | null>(null);

  const localizar = useCallback(() => {
    setErro('');
    if (!navigator.geolocation) { setErro('Seu navegador não tem GPS.'); return; }
    setCarregando(true);
    navigator.geolocation.getCurrentPosition(
      p => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => { setCarregando(false); setErro('Libere a localização do navegador para ver os comércios em volta.'); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }, []);

  useEffect(() => { localizar(); }, [localizar]);

  useEffect(() => {
    if (!pos) return;
    let cancelado = false;
    (async () => {
      setCarregando(true); setErro('');
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const auth = { Authorization: `Bearer ${session?.access_token}` };
        const r = await fetch(`/api/prospeccao/proximos?lat=${pos.lat}&lng=${pos.lng}&raio=${raio}`, { headers: auth });
        let j = await r.json().catch(() => ({ erro: r.status === 504 ? 'O mapa demorou demais para responder. Tente de novo ou diminua o raio.' : 'Falha ao buscar comércios. Tente de novo.', osmNoNavegador: true }));
        if (!r.ok && j.osmNoNavegador) {
          // Plano B: o servidor do mapa aberto recusou o nosso servidor — pergunta direto daqui
          // (a rede do vendedor costuma passar) e manda os comércios pra cruzar com a carteira.
          const elementos = await overpassNoNavegador(pos.lat, pos.lng, raio);
          const r2 = await fetch('/api/prospeccao/proximos', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ lat: pos.lat, lng: pos.lng, raio, elementos }) });
          j = await r2.json().catch(() => ({ erro: 'Falha ao cruzar com a carteira.' }));
          if (!r2.ok) throw new Error(j.erro || 'Falha ao buscar comércios.');
        } else if (!r.ok) throw new Error(j.erro || 'Falha ao buscar comércios.');
        if (!cancelado) setDados(j);
      } catch (e: any) { if (!cancelado) setErro(e.message); }
      finally { if (!cancelado) setCarregando(false); }
    })();
    return () => { cancelado = true; };
  }, [pos, raio]);

  const segmentos = useMemo(() => ['Todos', ...Array.from(new Set((dados?.comercios || []).map(c => c.segmento))).sort((a, b) => a.localeCompare(b, 'pt-BR'))], [dados]);
  const lista = useMemo(() => (dados?.comercios || []).filter(c =>
    (filtro === 'todos' || (filtro === 'novos' ? !c.cliente : !!c.cliente)) && (segmento === 'Todos' || c.segmento === segmento)
  ), [dados, filtro, segmento]);

  async function cadastrar(c: Comercio) {
    setCadastrando(c.osm_id);
    const { data, error } = await supabase.from('clientes').insert([{
      nome_empresa: c.nome.toLocaleUpperCase('pt-BR'), nome_fantasia: c.nome, segmento: c.segmento_osm.startsWith('Outro') ? null : c.segmento_osm,
      telefone: c.telefone || '', endereco: c.endereco, bairro: c.bairro, cidade: c.cidade, status: 'ativo',
      empresa_id: empresaId, user_id: userId,
    }]).select('id, nome_empresa, segmento').single();
    setCadastrando(null);
    if (error || !data) { setErro(`Não foi possível cadastrar: ${error?.message || 'erro desconhecido'}`); return; }
    setDados(d => d && ({
      ...d,
      comercios: d.comercios.map(x => x.osm_id === c.osm_id ? { ...x, cliente: { id: data.id, nome: data.nome_empresa, segmento: data.segmento, situacao: 'cadastrado' } } : x),
      resumo: { ...d.resumo, clientes: d.resumo.clientes + 1, novos: d.resumo.novos - 1 },
    }));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex bg-white/5 border border-white/10 rounded-xl p-1">
          {[500, 1000, 2000, 3000].map(r => (
            <button key={r} onClick={() => setRaio(r)} className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase ${raio === r ? 'bg-amber-500 text-[#0F172A]' : 'text-slate-400 hover:text-white'}`}>{fmtDist(r)}</button>
          ))}
        </div>
        <div className="flex bg-white/5 border border-white/10 rounded-xl p-1">
          {([['todos', 'Todos'], ['novos', 'Não cadastrados'], ['clientes', 'Clientes']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFiltro(v)} className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase ${filtro === v ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-white'}`}>{l}</button>
          ))}
        </div>
        <select value={segmento} onChange={e => setSegmento(e.target.value)} className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[11px] font-bold text-white outline-none max-w-[220px]">
          {segmentos.map(s => <option key={s} value={s} className="bg-[#0B1120]">{s}</option>)}
        </select>
        <button onClick={localizar} className="ml-auto flex items-center gap-1.5 bg-blue-600/15 border border-blue-500/30 text-blue-400 hover:bg-blue-600 hover:text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase"><LocateFixed size={12} /> Minha posição</button>
      </div>

      {dados && (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-2.5"><p className="text-[9px] font-black uppercase text-slate-500">Comércios no raio</p><p className="text-lg font-black text-white">{dados.resumo.total}</p></div>
          <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-2.5"><p className="text-[9px] font-black uppercase text-orange-400">Não cadastrados</p><p className="text-lg font-black text-orange-400">{dados.resumo.novos}</p></div>
          <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-2.5"><p className="text-[9px] font-black uppercase text-green-400">Na carteira</p><p className="text-lg font-black text-green-400">{dados.resumo.clientes}</p></div>
        </div>
      )}

      {erro && <p className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-xs font-bold">{erro}</p>}

      <div className="h-[42vh] min-h-[280px] rounded-2xl overflow-hidden border border-white/10 relative">
        {pos ? (
          <MapContainer center={[pos.lat, pos.lng]} zoom={15} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
            <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Recentrar lat={pos.lat} lng={pos.lng} raio={raio} />
            <Circle center={[pos.lat, pos.lng]} radius={raio} pathOptions={{ color: '#F59E0B', weight: 1, fillOpacity: 0.04 }} />
            <CircleMarker center={[pos.lat, pos.lng]} radius={8} pathOptions={{ color: '#fff', weight: 3, fillColor: '#3B82F6', fillOpacity: 1 }}><Tooltip>Você está aqui</Tooltip></CircleMarker>
            {(dados?.visitas || []).map(v => (
              <CircleMarker key={`v${v.id}`} center={[v.lat, v.lng]} radius={5} pathOptions={{ color: '#0B1120', weight: 1, fillColor: '#94A3B8', fillOpacity: 0.9 }}>
                <Tooltip>{v.nome} · visitado em {new Date(v.em).toLocaleDateString('pt-BR')}</Tooltip>
              </CircleMarker>
            ))}
            {lista.map(c => {
              const s = SITUACAO[situacaoDe(c)];
              return (
                <CircleMarker key={c.osm_id} center={[c.lat, c.lng]} radius={selecionado === c.osm_id ? 10 : 6}
                  pathOptions={{ color: '#0B1120', weight: 1.5, fillColor: s.cor, fillOpacity: 0.95 }}
                  eventHandlers={{ click: () => { setSelecionado(c.osm_id); document.getElementById(`pros-${c.osm_id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } }}>
                  <Tooltip>{c.nome} · {c.segmento} · {s.label}</Tooltip>
                </CircleMarker>
              );
            })}
          </MapContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-500 text-xs font-bold">{erro ? '—' : 'Pegando sua localização...'}</div>
        )}
        {carregando && <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-[500]"><Loader2 className="animate-spin text-amber-400" size={28} /></div>}
      </div>

      <div className="flex flex-wrap gap-3 text-[9px] font-black uppercase text-slate-400">
        {Object.values(SITUACAO).map(s => <span key={s.label} className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: s.cor }} />{s.label}</span>)}
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-400" />Visitado (fora do mapa público)</span>
      </div>

      <div className="space-y-2">
        {dados && lista.length === 0 && !carregando && (
          <p className="text-slate-500 text-xs text-center py-6">Nenhum comércio com esse filtro no raio. Aumente o raio ou troque o filtro.</p>
        )}
        {lista.map(c => {
          const sit = situacaoDe(c); const s = SITUACAO[sit];
          return (
            <div key={c.osm_id} id={`pros-${c.osm_id}`} onClick={() => setSelecionado(c.osm_id)}
              className={`rounded-2xl border p-3 transition-colors cursor-pointer ${selecionado === c.osm_id ? 'border-amber-500/60 bg-amber-500/5' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-white text-sm font-black truncate">{c.nome}</p>
                  <p className="text-[10px] font-bold text-slate-400 flex items-center gap-1"><Store size={10} /> {c.segmento}</p>
                  {(c.endereco || c.bairro) && <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5"><MapPin size={10} /> {[c.endereco, c.bairro, c.cidade].filter(Boolean).join(' · ')}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-full" style={{ background: `${s.cor}22`, color: s.cor, border: `1px solid ${s.cor}55` }}>{s.label}</span>
                  <p className="text-[10px] font-black text-slate-500 mt-1">{fmtDist(c.distancia_m)}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[10px] text-slate-400">
                {c.cliente?.total_comprado ? <span className="text-green-400 font-black">Já comprou {fmtBRL(c.cliente.total_comprado)}</span> : null}
                {c.ultima_visita && <span>Última visita: {new Date(c.ultima_visita.em).toLocaleDateString('pt-BR')}</span>}
                {c.horario && <span>Horário: {c.horario}</span>}
              </div>
              <div className="flex flex-wrap gap-2 mt-2.5">
                {!c.cliente && (
                  <button onClick={e => { e.stopPropagation(); cadastrar(c); }} disabled={cadastrando === c.osm_id}
                    className="flex items-center gap-1 bg-orange-500/15 border border-orange-500/30 text-orange-400 hover:bg-orange-500 hover:text-white px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase disabled:opacity-50">
                    {cadastrando === c.osm_id ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Cadastrar
                  </button>
                )}
                {c.cliente && <span className="flex items-center gap-1 text-green-400 text-[10px] font-black uppercase px-1"><CheckCircle2 size={11} /> {c.cliente.nome}</span>}
                <button onClick={e => { e.stopPropagation(); onRegistrarVisita({ nome: c.cliente?.nome || c.nome, telefone: c.telefone || '', cidade: c.cidade || '', clienteId: c.cliente?.id ?? null }); }}
                  className="flex items-center gap-1 bg-blue-600/15 border border-blue-500/30 text-blue-400 hover:bg-blue-600 hover:text-white px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase">
                  <MapPin size={11} /> Registrar visita
                </button>
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                  className="flex items-center gap-1 bg-white/5 border border-white/10 text-slate-300 hover:text-white px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase"><Navigation size={11} /> Ir</a>
                {c.telefone && <a href={`tel:${c.telefone}`} onClick={e => e.stopPropagation()} className="flex items-center gap-1 bg-white/5 border border-white/10 text-slate-300 hover:text-white px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase"><Phone size={11} /> Ligar</a>}
                {c.site && <a href={c.site.startsWith('http') ? c.site : `https://${c.site}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="flex items-center gap-1 bg-white/5 border border-white/10 text-slate-300 hover:text-white px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase"><Globe size={11} /> Site</a>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[9px] text-slate-600">Comércios de {dados?.fonte || 'mapa público'}. Cidades pequenas podem ter cobertura parcial; o que você cadastra e visita passa a aparecer aqui.</p>
    </div>
  );
}
