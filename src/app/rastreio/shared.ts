import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';

export type ClienteRastreio = {
  id: string; empresa_id: string; tipo: 'PF' | 'PJ'; nome: string; documento: string | null;
  telefone: string | null; email: string | null; endereco: string | null; cidade: string | null;
  mensalidade: number; dia_vencimento: number | null; status: 'ativo' | 'suspenso' | 'cancelado'; observacoes: string | null;
  relatorio_email?: 'semanal' | 'mensal' | null;
};

export type Veiculo = {
  id: string; empresa_id: string; cliente_id: string | null; placa: string; descricao: string | null; tipo: string;
  imei: string; modelo_rastreador: string | null; chip_numero: string | null; chip_operadora: string | null;
  tem_bloqueio: boolean; traccar_device_id: number | null; instalado_em: string | null; instalado_por: string | null;
  limite_velocidade: number | null; status: 'ativo' | 'inativo'; bloqueado: boolean;
  ultima_lat: number | null; ultima_lng: number | null; ultima_velocidade: number | null; ultimo_curso: number | null;
  ignicao: boolean | null; bateria_externa: number | null; ultima_posicao_em: string | null; ultima_comunicacao_em: string | null;
  satelites?: number | null; sinal_gsm?: number | null; bateria_interna?: number | null; carregando?: boolean | null;
  endereco?: string | null; grupo?: string | null; odometro_km?: number | null; ignicao_virtual?: boolean;
  consumo_km_l?: number | null; horario_uso?: { dias?: number[]; inicio?: string; fim?: string } | null; ocorrencia_aberta_id?: number | null;
};

export type Evento = { id: number; veiculo_id: string; tipo: string; mensagem: string; lat: number | null; lng: number | null; lido: boolean; ocorrido_em: string };

// Colunas que o mapa precisa — nunca select('*') de posições (tabela grande).
export const COLUNAS_VEICULO = 'id, empresa_id, cliente_id, placa, descricao, tipo, imei, modelo_rastreador, chip_numero, chip_operadora, tem_bloqueio, traccar_device_id, instalado_em, instalado_por, limite_velocidade, status, bloqueado, ultima_lat, ultima_lng, ultima_velocidade, ultimo_curso, ignicao, bateria_externa, ultima_posicao_em, ultima_comunicacao_em, satelites, sinal_gsm, bateria_interna, carregando, endereco, grupo, odometro_km, ignicao_virtual, consumo_km_l, horario_uso, ocorrencia_aberta_id';

export const OFFLINE_MIN = 30; // sem comunicação há mais que isso = offline

export type Situacao = 'andando' | 'parado' | 'offline' | 'sem_sinal';

export function situacao(v: Pick<Veiculo, 'ultima_comunicacao_em' | 'ultima_posicao_em' | 'ultima_velocidade'>): Situacao {
  const ultimo = v.ultima_comunicacao_em || v.ultima_posicao_em;
  if (!ultimo) return 'sem_sinal';
  if (Date.now() - new Date(ultimo).getTime() > OFFLINE_MIN * 60000) return 'offline';
  return Number(v.ultima_velocidade || 0) > 3 ? 'andando' : 'parado';
}

export const SITUACAO_INFO: Record<Situacao, { label: string; cor: string; classe: string }> = {
  andando:   { label: 'Em movimento',   cor: '#22C55E', classe: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  parado:    { label: 'Parado',         cor: '#38BDF8', classe: 'text-sky-400 bg-sky-500/10 border-sky-500/30' },
  offline:   { label: 'Sem comunicação', cor: '#F59E0B', classe: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  sem_sinal: { label: 'Aguardando 1º sinal', cor: '#64748B', classe: 'text-slate-400 bg-white/5 border-white/10' },
};

export function haQuanto(iso: string | null) {
  if (!iso) return 'nunca';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.round(h / 24)} d`;
}

export const fmtDataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export const fmtHora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
export const fmtMoeda = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const mascaraPlaca = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);

export function mascaraDocumento(s: string) {
  const d = s.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 11) return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
}

// Formato oficial "Maps URLs" (api=1): no celular abre direto o app do Google Maps; o antigo
// ?q= dava erro no celular. Coordenada com 6 casas (≈ 10 cm) para o link não ficar gigante.
const coord = (lat: number, lng: number) => `${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;
export const linkMapa = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${coord(lat, lng)}`;
export const linkStreetView = (lat: number, lng: number) => `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${coord(lat, lng)}`;

/** Sinal do chip em barras 0-4 (GT06 manda 0-4; outros mandam 0-31 ou dBm negativo). */
export function barrasSinal(s: number | null | undefined) {
  if (s == null) return null;
  if (s < 0) return s >= -70 ? 4 : s >= -85 ? 3 : s >= -100 ? 2 : s >= -110 ? 1 : 0;
  if (s <= 5) return Math.min(4, Math.round(s));
  return Math.min(4, Math.round((s / 31) * 4));
}

/** POST nas rotas /api/rastreio/* com o token da sessão. */
export async function apiRastreio(caminho: string, corpo: unknown) {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(`/api/rastreio/${caminho}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
    body: JSON.stringify(corpo),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
  return j;
}

export function useRastreioAccess() {
  const auth = (useAuth() || {}) as {
    loading?: boolean;
    perfil?: { empresa_id?: string; cargo?: string | null; nome?: string | null } | null;
    empresa?: { modulos?: Record<string, unknown> | null } | null;
  };
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  return {
    authLoading: Boolean(auth.loading),
    perfil,
    temRastreio: Boolean(empresa?.modulos?.rastreio),
    podeBloquear: perfil?.cargo === 'diretor' || perfil?.cargo === 'gerente',
  };
}
