"use client";
import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { situacao, SITUACAO_INFO, type Veiculo } from './shared';

export type PontoTrajeto = { lat: number; lng: number; velocidade?: number | null; registrado_em?: string };

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

export default function MapaRastreio({ veiculos, selecionadoId, onSelecionar, trajeto, altura = 'h-[55vh] min-h-[320px]', chaveEnquadrar }: {
  veiculos: Veiculo[]; selecionadoId?: string | null; onSelecionar?: (id: string) => void;
  trajeto?: PontoTrajeto[]; altura?: string; chaveEnquadrar: string;
}) {
  const comPosicao = veiculos.filter(v => v.ultima_lat != null && v.ultima_lng != null);
  const linha: [number, number][] = (trajeto || []).map(p => [p.lat, p.lng]);
  const pontos: [number, number][] = linha.length ? linha : comPosicao.map(v => [v.ultima_lat!, v.ultima_lng!]);
  const centro: [number, number] = pontos[0] || [-25.4284, -49.2733]; // Curitiba

  return (
    <div className={`${altura} rounded-2xl overflow-hidden border border-white/10 relative z-0`}>
      <MapContainer center={centro} zoom={pontos.length ? 13 : 11} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Enquadrar pontos={pontos} chave={chaveEnquadrar} />
        {linha.length > 1 && <Polyline positions={linha} pathOptions={{ color: '#38BDF8', weight: 4, opacity: 0.85 }} />}
        {linha.length > 1 && (
          <Marker position={linha[0]} icon={L.divIcon({ className: '', html: '<div style="width:14px;height:14px;border-radius:50%;background:#fff;border:3px solid #38BDF8"></div>', iconSize: [14, 14], iconAnchor: [7, 7] })}>
            <Tooltip>Início do trajeto{trajeto?.[0]?.registrado_em ? ` · ${new Date(trajeto[0].registrado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}</Tooltip>
          </Marker>
        )}
        {comPosicao.map(v => (
          <Marker key={v.id} position={[v.ultima_lat!, v.ultima_lng!]} icon={iconeVeiculo(v, v.id === selecionadoId)}
            eventHandlers={onSelecionar ? { click: () => onSelecionar(v.id) } : undefined}>
            <Tooltip direction="top" offset={[0, -14]}>
              <b>{v.placa}</b>{v.descricao ? ` · ${v.descricao}` : ''}<br />
              {v.bloqueado ? 'BLOQUEADO · ' : ''}{SITUACAO_INFO[situacao(v)].label} · {Math.round(Number(v.ultima_velocidade || 0))} km/h
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
