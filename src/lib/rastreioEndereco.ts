// Endereço da última posição (geocodificação reversa no OpenStreetMap/Nominatim).
// Cache no próprio veículo: só busca de novo se ele andou mais que MOVEU_M desde a última busca.
// O Nominatim pede no máximo ~1 req/s e um User-Agent identificando o app (sem dados pessoais).
import type { SupabaseClient } from '@supabase/supabase-js';
import { distanciaMetros } from '@/lib/rastreio';

const MOVEU_M = 60;

type VeicEnd = { id: string; ultima_lat: number | null; ultima_lng: number | null; endereco: string | null; endereco_lat: number | null; endereco_lng: number | null };

function montar(a: Record<string, string | undefined>, nome?: string) {
  const rua = a.road || a.pedestrian || a.footway || a.highway || a.path;
  const numero = a.house_number;
  const bairro = a.suburb || a.neighbourhood || a.quarter || a.city_district;
  const cidade = a.city || a.town || a.village || a.municipality;
  const uf = a['ISO3166-2-lvl4']?.split('-')[1] || a.state;
  const linha1 = [rua ? `${rua}${numero ? `, ${numero}` : ''}` : nome, bairro].filter(Boolean).join(' - ');
  return [linha1, [cidade, uf].filter(Boolean).join('/')].filter(Boolean).join(' · ') || null;
}

export async function enderecoReverso(lat: number, lng: number): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=pt-BR`;
  const r = await fetch(url, { headers: { 'User-Agent': 'WeGrow-Rastreio/1.0' }, signal: AbortSignal.timeout(6000) }).catch(() => null);
  if (!r?.ok) return null;
  const j = await r.json().catch(() => null) as { address?: Record<string, string>; name?: string; display_name?: string } | null;
  if (!j) return null;
  return montar(j.address || {}, j.name) || j.display_name?.split(',').slice(0, 3).join(',') || null;
}

/** Devolve o endereço atual do veículo, usando o cache quando ele não saiu do lugar. */
export async function enderecoDoVeiculo(db: SupabaseClient, v: VeicEnd): Promise<string | null> {
  if (v.ultima_lat == null || v.ultima_lng == null) return null;
  if (v.endereco && v.endereco_lat != null && v.endereco_lng != null
    && distanciaMetros(v.ultima_lat, v.ultima_lng, v.endereco_lat, v.endereco_lng) < MOVEU_M) {
    return v.endereco;
  }
  const end = await enderecoReverso(v.ultima_lat, v.ultima_lng);
  if (end) await db.from('rastreio_veiculos').update({ endereco: end, endereco_lat: v.ultima_lat, endereco_lng: v.ultima_lng }).eq('id', v.id);
  return end || v.endereco;
}

export const COLS_ENDERECO = 'id, ultima_lat, ultima_lng, endereco, endereco_lat, endereco_lng';
