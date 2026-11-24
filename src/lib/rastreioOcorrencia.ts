// Central de ocorrências (roubo, furto, suspeita): abrir dispara o protocolo — rastreador em
// modo intensivo (posição a cada 10 s), link ao vivo de 72 h para a polícia/seguradora, alarme
// para a central (painel + e-mail) e linha do tempo do atendimento. Encerrar volta ao normal.
import type { SupabaseClient } from '@supabase/supabase-js';
import { registrarEvento } from '@/lib/rastreio';
import { criarCompartilhamento } from '@/lib/rastreioApp';
import { configurarAparelho } from '@/lib/rastreioAparelho';

export const TIPOS_OCORRENCIA = { roubo: 'Roubo', furto: 'Furto', suspeita: 'Suspeita', sinistro: 'Sinistro / acidente', outro: 'Outro' } as const;
export type TipoOcorrencia = keyof typeof TIPOS_OCORRENCIA;
type Passo = { em: string; texto: string; autor: string };

const urlApp = () => (process.env.NEXT_PUBLIC_APP_URL || 'https://www.wegrow.app.br').replace(/\/$/, '');

export async function abrirOcorrencia(db: SupabaseClient, p: {
  empresaId: string; veiculoId: string; clienteId?: string | null; tipo: string; descricao?: string; bo?: string;
  origem: 'painel' | 'app'; autor: { userId: string | null; nome: string };
}) {
  const { data: v } = await db.from('rastreio_veiculos').select('id, empresa_id, cliente_id, placa, ultima_lat, ultima_lng, ocorrencia_aberta_id')
    .eq('id', p.veiculoId).eq('empresa_id', p.empresaId).eq('status', 'ativo').maybeSingle();
  if (!v) throw new Error('Veículo não encontrado.');
  if (p.clienteId && v.cliente_id !== p.clienteId) throw new Error('Veículo não encontrado.');
  if (v.ocorrencia_aberta_id) {
    const { data: aberta } = await db.from('rastreio_ocorrencias').select('id').eq('id', v.ocorrencia_aberta_id).eq('status', 'aberta').maybeSingle();
    if (aberta) return { id: aberta.id as number, jaAberta: true, link: null as string | null };
  }
  const tipo = (p.tipo in TIPOS_OCORRENCIA ? p.tipo : 'roubo') as TipoOcorrencia;
  const agora = new Date().toISOString();
  const passos: Passo[] = [{ em: agora, texto: `Ocorrência de ${TIPOS_OCORRENCIA[tipo].toLowerCase()} aberta${p.origem === 'app' ? ' pelo cliente no app' : ''}${p.descricao ? `: ${p.descricao}` : ''}`, autor: p.autor.nome }];

  let link: string | null = null;
  try {
    const { token } = await criarCompartilhamento(db, { empresaId: v.empresa_id, veiculoId: v.id, horas: 72, criadoPor: p.autor.nome, origem: p.origem });
    link = `${urlApp()}/meu-rastreio/ao-vivo?t=${token}`;
    passos.push({ em: agora, texto: 'Link de localização ao vivo (72 h) gerado para polícia/seguradora', autor: 'sistema' });
  } catch { /* segue sem link */ }

  try {
    const r = await configurarAparelho(db, { empresaId: v.empresa_id, veiculoId: v.id, comando: 'intervalo', params: { ligado: 10, desligado: 10 }, autor: p.autor });
    passos.push({ em: agora, texto: `Rastreador em modo intensivo (posição a cada 10 s). ${r.naFila ? 'Aparelho sem sinal: comando na fila.' : ''}`.trim(), autor: 'sistema' });
  } catch (e) {
    passos.push({ em: agora, texto: `Não deu para colocar o rastreador em modo intensivo: ${(e as Error).message}`, autor: 'sistema' });
  }

  const { data: oc, error } = await db.from('rastreio_ocorrencias').insert({
    empresa_id: v.empresa_id, veiculo_id: v.id, cliente_id: v.cliente_id, tipo, descricao: p.descricao?.slice(0, 1000) || null,
    bo_numero: p.bo?.slice(0, 60) || null, origem: p.origem, aberta_por: p.autor.nome, link_compartilhamento: link, linha_tempo: passos,
  }).select('id').single();
  if (error || !oc) throw new Error('Não foi possível registrar a ocorrência.');
  await db.from('rastreio_veiculos').update({ ocorrencia_aberta_id: oc.id }).eq('id', v.id);
  await registrarEvento(db, {
    empresa_id: v.empresa_id, veiculo_id: v.id, tipo: 'alarme', lido: false,
    mensagem: `${v.placa}: OCORRÊNCIA DE ${TIPOS_OCORRENCIA[tipo].toUpperCase()} aberta por ${p.autor.nome}${p.origem === 'app' ? ' (app do cliente)' : ''}`,
    lat: v.ultima_lat, lng: v.ultima_lng,
  });
  return { id: oc.id as number, jaAberta: false, link };
}

export async function anotarOcorrencia(db: SupabaseClient, empresaId: string, id: number, texto: string, autor: string, extra?: { bo?: string }) {
  const { data: oc } = await db.from('rastreio_ocorrencias').select('linha_tempo').eq('id', id).eq('empresa_id', empresaId).maybeSingle();
  if (!oc) throw new Error('Ocorrência não encontrada.');
  const passos = [...((oc.linha_tempo as Passo[]) || []), { em: new Date().toISOString(), texto: texto.slice(0, 1000), autor }];
  await db.from('rastreio_ocorrencias').update({ linha_tempo: passos, ...(extra?.bo ? { bo_numero: extra.bo.slice(0, 60) } : {}) }).eq('id', id);
}

export async function encerrarOcorrencia(db: SupabaseClient, empresaId: string, id: number, status: 'recuperado' | 'encerrada', autor: { userId: string | null; nome: string }, obs?: string) {
  const { data: oc } = await db.from('rastreio_ocorrencias').select('id, veiculo_id, linha_tempo, status').eq('id', id).eq('empresa_id', empresaId).maybeSingle();
  if (!oc) throw new Error('Ocorrência não encontrada.');
  if (oc.status !== 'aberta') throw new Error('Ocorrência já encerrada.');
  const agora = new Date().toISOString();
  const passos: Passo[] = [...((oc.linha_tempo as Passo[]) || []), { em: agora, texto: `${status === 'recuperado' ? 'Veículo recuperado' : 'Ocorrência encerrada'}${obs ? `: ${obs}` : ''}`, autor: autor.nome }];
  try {
    await configurarAparelho(db, { empresaId, veiculoId: oc.veiculo_id, comando: 'intervalo', params: { ligado: 30, desligado: 300 }, autor });
    passos.push({ em: agora, texto: 'Rastreador de volta ao intervalo normal (30 s / 300 s)', autor: 'sistema' });
  } catch { /* fica registrado só o encerramento */ }
  await db.from('rastreio_ocorrencias').update({ status, encerrada_em: agora, linha_tempo: passos }).eq('id', id);
  await db.from('rastreio_veiculos').update({ ocorrencia_aberta_id: null }).eq('id', oc.veiculo_id);
}
