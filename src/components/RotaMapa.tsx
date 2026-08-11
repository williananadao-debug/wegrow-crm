"use client";
import { MapContainer, TileLayer, Marker, Polyline, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { ParadaGeo } from '@/lib/geocode';

function marcadorNumerado(numero: number) {
  return L.divIcon({
    className: '',
    html: `<div style="width:28px;height:28px;border-radius:50%;background:#F59E0B;border:2px solid #0B1120;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;color:#0B1120;box-shadow:0 2px 8px rgba(0,0,0,.4);">${numero}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export default function RotaMapa({ paradas }: { paradas: ParadaGeo[] }) {
  const localizadas = paradas.filter(p => p.lat !== undefined && p.lng !== undefined) as (ParadaGeo & { lat: number; lng: number })[];
  const todasProcessadas = paradas.every(p => p.geocodeStatus === 'ok' || p.geocodeStatus === 'falhou');

  if (localizadas.length === 0) {
    return (
      <div className="h-[50vh] min-h-[260px] max-h-[520px] flex items-center justify-center bg-black/30 rounded-2xl border border-white/5 px-6 text-center">
        <p className="text-slate-500 text-xs font-bold">
          {todasProcessadas
            ? 'Não conseguimos localizar esses endereços no mapa. A navegação de verdade continua funcionando pelo botão do Google Maps abaixo.'
            : 'Localizando endereços no mapa...'}
        </p>
      </div>
    );
  }

  const linha: [number, number][] = localizadas.map(p => [p.lat, p.lng]);

  return (
    <div className="h-[50vh] min-h-[320px] max-h-[520px] rounded-2xl overflow-hidden border border-white/10">
      <MapContainer
        {...(localizadas.length > 1
          ? { bounds: L.latLngBounds(linha), boundsOptions: { padding: [30, 30] as [number, number] } }
          : { center: linha[0], zoom: 14 })}
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {linha.length > 1 && <Polyline positions={linha} pathOptions={{ color: '#F59E0B', weight: 3, dashArray: '6 6' }} />}
        {localizadas.map((p, i) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={marcadorNumerado(i + 1)}>
            <Tooltip>{p.nome}</Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
