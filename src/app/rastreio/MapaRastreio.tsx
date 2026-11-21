"use client";
import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Polygon, Tooltip, Circle, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { situacao, SITUACAO_INFO, type Veiculo } from './shared';

export type PontoTrajeto = { lat: number; lng: number; velocidade?: number | null; registrado_em?: string };
export type CercaMapa = { id: string; nome: string; lat: number; lng: number; raio_m: number; ativo?: boolean; tipo?: string; poligono?: [number, number][] | null };

// Camadas de mapa (como na Anjia: ruas, satélite com nomes, escuro). Escolha fica salva no navegador.
const CAMADAS = {
  ruas: { nome: 'Ruas', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '&copy; OpenStreetMap', max: 19 },
  satelite: { nome: 'Satélite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: 'Imagens &copy; Esri', max: 19 },
  escuro: { nome: 'Escuro', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attr: '&copy; OpenStreetMap &copy; CARTO', max: 20 },
} as const;
type Camada = keyof typeof CAMADAS;
const ROTULOS_SATELITE = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';

function camadaSalva(): Camada {
  try { const c = localStorage.getItem('rastreio_camada'); if (c && c in CAMADAS) return c as Camada; } catch { /* sem storage */ }
  return 'ruas';
}

/** Mantém o veículo no centro enquanto ele anda (botão "Seguir"). */
function Seguir({ ponto }: { ponto: [number, number] | null }) {
  const map = useMap();
  useEffect(() => { if (ponto) map.panTo(ponto, { animate: true }); }, [map, ponto?.[0], ponto?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
export type ParadaMapa = { lat: number; lng: number; ini: string; minutos: number };

const hora = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');

// Seta girada pelo curso quando anda; bolinha quando parado. Cadeado vermelho se bloqueado.
function iconeVeiculo(v: Veiculo, selecionado: boolean) {
  const s = situacao(v);
  const cor = v.bloqueado ? '#EF4444' : SITUACAO_INFO[s].cor;
  const tam = selecionado ? 38 : 30;
  const seta = s === 'andando'
    ? `<svg width="14" height="14" viewBox="0 0 24 24" style="transform:rotate(${Number(v.ultimo_curso || 0)}deg)"><path d="M12 2 L20 20 L12 15 L4 20 Z" fill="#0B1120"/></svg>`
    : v.bloqueado
      ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0B1120" stroke-width="3"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`
      : `<div style="width:8px;height:8px;border-radius:50%;background:#0B1120"></div>`;
  return L.divIcon({
    className: '',
    html: `<div style="width:${tam}px;height:${tam}px;border-radius:50%;background:${cor};border:3px solid ${selecionado ? '#fff' : '#0B1120'};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(0,0,0,.5);">${seta}</div>`,
    iconSize: [tam, tam],
    iconAnchor: [tam / 2, tam / 2],
  });
}

const iconeInicio = L.divIcon({ className: '', html: '<div style="width:14px;height:14px;border-radius:50%;background:#fff;border:3px solid #38BDF8"></div>', iconSize: [14, 14], iconAnchor: [7, 7] });
const iconeParada = (n: number) => L.divIcon({
  className: '',
  html: `<div style="width:22px;height:22px;border-radius:50%;background:#F59E0B;color:#0B1120;font:900 11px system-ui;display:flex;align-items:center;justify-content:center;border:2px solid #0B1120">${n}</div>`,
  iconSize: [22, 22], iconAnchor: [11, 11],
});
const iconeReplay = L.divIcon({
  className: '',
  html: '<div style="width:20px;height:20px;border-radius:50%;background:#fff;border:4px solid #22C55E;box-shadow:0 0 0 6px rgba(34,197,94,.25)"></div>',
  iconSize: [20, 20], iconAnchor: [10, 10],
});

function Enquadrar({ pontos, chave }: { pontos: [number, number][]; chave: string }) {
  const map = useMap();
  useEffect(() => {
    if (!pontos.length) return;
    if (pontos.length === 1) map.setView(pontos[0], Math.max(map.getZoom(), 15));
    else map.fitBounds(L.latLngBounds(pontos), { padding: [40, 40], maxZoom: 16 });
    // Só reenquadra quando muda o "assunto" (outro veículo/dia), não a cada atualização.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  return null;
}

function Clique({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: e => onClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

// Trajeto em trechos: vermelho onde passou do limite de velocidade.
function trechos(p: PontoTrajeto[], limite: number | null | undefined) {
  const out: { cor: string; pts: [number, number][] }[] = [];
  for (let i = 1; i < p.length; i++) {
    const cor = limite && Number(p[i].velocidade || 0) > limite ? '#EF4444' : '#38BDF8';
    const ult = out[out.length - 1];
    if (ult && ult.cor === cor) ult.pts.push([p[i].lat, p[i].lng]);
    else out.push({ cor, pts: [[p[i - 1].lat, p[i - 1].lng], [p[i].lat, p[i].lng]] });
  }
  return out;
}

export default function MapaRastreio({
  veiculos, selecionadoId, onSelecionar, trajeto, altura = 'h-[55vh] min-h-[320px]', chaveEnquadrar,
  limiteVelocidade, paradas, cercas, replay, onClickMapa, desenho, seguirId,
}: {
  veiculos: Veiculo[]; selecionadoId?: string | null; onSelecionar?: (id: string) => void;
  trajeto?: PontoTrajeto[]; altura?: string; chaveEnquadrar: string;
  limiteVelocidade?: number | null; paradas?: ParadaMapa[]; cercas?: CercaMapa[];
  replay?: PontoTrajeto | null; onClickMapa?: (lat: number, lng: number) => void;
  /** Vértices da cerca em polígono sendo desenhada. */
  desenho?: [number, number][];
  /** Veículo a manter centralizado (modo seguir). */
  seguirId?: string | null;
}) {
  // O mapa só roda no navegador (dynamic ssr:false), então dá para ler o localStorage já no início.
  const [camada, setCamada] = useState<Camada>(camadaSalva);
  const trocarCamada = (c: Camada) => { setCamada(c); try { localStorage.setItem('rastreio_camada', c); } catch { /* ok */ } };
  const seguido = seguirId ? veiculos.find(v => v.id === seguirId && v.ultima_lat != null) : null;
  const cam = CAMADAS[camada];
  const comPosicao = veiculos.filter(v => v.ultima_lat != null && v.ultima_lng != null);
  const linha: [number, number][] = (trajeto || []).map(p => [p.lat, p.lng]);
  const pontos: [number, number][] = linha.length ? linha : comPosicao.map(v => [v.ultima_lat!, v.ultima_lng!]);
  const centro: [number, number] = pontos[0] || [-25.4284, -49.2733]; // Curitiba

  return (
    <div className={`${altura} rounded-2xl overflow-hidden border border-white/10 relative z-0 ${onClickMapa ? 'cursor-crosshair' : ''}`}>
      <MapContainer center={centro} zoom={pontos.length ? 13 : 11} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer key={camada} attribution={cam.attr} url={cam.url} maxZoom={cam.max} />
        {camada === 'satelite' && <TileLayer key="rotulos" url={ROTULOS_SATELITE} maxZoom={19} />}
        <Enquadrar pontos={pontos} chave={chaveEnquadrar} />
        {seguido && <Seguir ponto={[seguido.ultima_lat!, seguido.ultima_lng!]} />}
        {onClickMapa && <Clique onClick={onClickMapa} />}
        {(cercas || []).map(c => c.tipo === 'poligono' && c.poligono?.length ? (
          <Polygon key={c.id} positions={c.poligono}
            pathOptions={{ color: c.ativo === false ? '#64748B' : '#A78BFA', weight: 2, fillOpacity: 0.08, dashArray: c.ativo === false ? '6 6' : undefined }}>
            <Tooltip>Cerca: {c.nome} (área desenhada)</Tooltip>
          </Polygon>
        ) : (
          <Circle key={c.id} center={[c.lat, c.lng]} radius={c.raio_m}
            pathOptions={{ color: c.ativo === false ? '#64748B' : '#A78BFA', weight: 2, fillOpacity: 0.08, dashArray: c.ativo === false ? '6 6' : undefined }}>
            <Tooltip>Cerca: {c.nome} ({c.raio_m >= 1000 ? `${(c.raio_m / 1000).toFixed(1)} km` : `${c.raio_m} m`})</Tooltip>
          </Circle>
        ))}
        {desenho && desenho.length > 0 && (
          <>
            <Polygon positions={desenho} pathOptions={{ color: '#A78BFA', weight: 2, dashArray: '4 4', fillOpacity: 0.12 }} />
            {desenho.map((p, i) => <CircleMarker key={`d${i}`} center={p} radius={5} pathOptions={{ color: '#fff', fillColor: '#A78BFA', fillOpacity: 1, weight: 2 }} />)}
          </>
        )}
        {linha.length > 1 && trechos(trajeto!, limiteVelocidade).map((t, i) => (
          <Polyline key={i} positions={t.pts} pathOptions={{ color: t.cor, weight: 4, opacity: 0.85 }} />
        ))}
        {linha.length > 1 && (
          <Marker position={linha[0]} icon={iconeInicio}>
            <Tooltip>Início do trajeto{trajeto?.[0]?.registrado_em ? ` · ${hora(trajeto[0].registrado_em)}` : ''}</Tooltip>
          </Marker>
        )}
        {(paradas || []).map((p, i) => (
          <Marker key={`p${i}`} position={[p.lat, p.lng]} icon={iconeParada(i + 1)}>
            <Tooltip>Parada {i + 1} · {hora(p.ini)} · {p.minutos} min</Tooltip>
          </Marker>
        ))}
        {replay && (
          <Marker position={[replay.lat, replay.lng]} icon={iconeReplay} zIndexOffset={1000}>
            <Tooltip permanent direction="top" offset={[0, -12]}>{hora(replay.registrado_em)} · {Math.round(Number(replay.velocidade || 0))} km/h</Tooltip>
          </Marker>
        )}
        {!replay && comPosicao.map(v => (
          <Marker key={v.id} position={[v.ultima_lat!, v.ultima_lng!]} icon={iconeVeiculo(v, v.id === selecionadoId)}
            eventHandlers={onSelecionar ? { click: () => onSelecionar(v.id) } : undefined}>
            <Tooltip direction="top" offset={[0, -14]}>
              <b>{v.placa}</b>{v.descricao ? ` · ${v.descricao}` : ''}<br />
              {v.bloqueado ? 'BLOQUEADO · ' : ''}{SITUACAO_INFO[situacao(v)].label} · {Math.round(Number(v.ultima_velocidade || 0))} km/h
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
      <div className="absolute top-2 right-2 z-[500] flex rounded-lg overflow-hidden border border-black/20 shadow-lg text-[10px] font-black uppercase">
        {(Object.keys(CAMADAS) as Camada[]).map(c => (
          <button key={c} type="button" onClick={() => trocarCamada(c)}
            className={`px-2.5 py-1.5 ${camada === c ? 'bg-sky-400 text-[#0B1120]' : 'bg-[#0F172A]/90 text-slate-200 hover:bg-[#1E293B]'}`}>{CAMADAS[c].nome}</button>
        ))}
      </div>
    </div>
  );
}
