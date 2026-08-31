"use client";
import { useState, useEffect, useCallback } from 'react';
import { Plus, Loader2, CalendarClock, Check, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { fmtData } from './shared';

type Prazo = { id: number; titulo: string; data_prazo: string; concluido: boolean };

// Prazos processuais (audiência, recurso, contestação...) — um processo tem vários ao
// longo da vida. Só aparece depois que o lead vira advocacia_processos (Contrato
// fechado), mesma condição de AndamentosProcessuais.
export default function PrazosProcessuais({ leadId }: { leadId: number }) {
  const auth = useAuth() || {};
  const perfil = auth.perfil;

  const [processoId, setProcessoId] = useState<number | null>(null);
  const [prazos, setPrazos] = useState<Prazo[]>([]);
  const [loading, setLoading] = useState(true);
  const [titulo, setTitulo] = useState('');
  const [dataPrazo, setDataPrazo] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data: proc } = await supabase.from('advocacia_processos').select('id').eq('lead_id', leadId).maybeSingle();
    setProcessoId(proc?.id ?? null);
    if (proc?.id) {
      const { data: itens } = await supabase.from('advocacia_prazos')
        .select('id, titulo, data_prazo, concluido').eq('processo_id', proc.id).order('data_prazo', { ascending: true });
      setPrazos((itens as Prazo[]) || []);
    }
    setLoading(false);
  }, [leadId]);

  useEffect(() => { carregar(); }, [carregar]);

  const adicionar = async () => {
    if (!processoId || !perfil?.empresa_id || !titulo.trim() || !dataPrazo) return;
    setSalvando(true);
    const { data } = await supabase.from('advocacia_prazos').insert([{
      empresa_id: perfil.empresa_id, processo_id: processoId, titulo: titulo.trim(), data_prazo: dataPrazo, criado_por: perfil.id,
    }]).select('id, titulo, data_prazo, concluido');
    if (data) setPrazos(prev => [...prev, data[0] as Prazo].sort((a, b) => a.data_prazo.localeCompare(b.data_prazo)));
    setTitulo(''); setDataPrazo('');
    setSalvando(false);
  };

  const concluir = async (id: number) => {
    setPrazos(prev => prev.map(p => p.id === id ? { ...p, concluido: true } : p));
    await supabase.from('advocacia_prazos').update({ concluido: true }).eq('id', id);
  };

  const excluir = async (id: number) => {
    setPrazos(prev => prev.filter(p => p.id !== id));
    await supabase.from('advocacia_prazos').delete().eq('id', id);
  };

  if (loading) return <div className="flex justify-center py-3"><Loader2 size={14} className="animate-spin text-[#d9861c]" /></div>;
  if (!processoId) return null;

  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <p className="text-[11px] font-bold uppercase text-[#9a958a] flex items-center gap-1.5 mb-2"><CalendarClock size={12} /> Prazos e audiências</p>
      {prazos.filter(p => !p.concluido).length > 0 && (
        <div className="space-y-1.5 mb-2">
          {prazos.filter(p => !p.concluido).map(p => {
            const vencido = p.data_prazo < hoje;
            return (
              <div key={p.id} className={`flex items-center justify-between gap-2 border rounded-lg px-3 py-2 ${vencido ? 'bg-[#fce8e8] border-[#f5c6c6]' : 'bg-[#faf7f2] border-[#e5e0d5]'}`}>
                <span className="text-[12.5px] font-semibold text-[#241c14] truncate">{p.titulo}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-[11px] font-bold ${vencido ? 'text-[#d63f3f]' : 'text-[#9a958a]'}`}>{fmtData(p.data_prazo)}</span>
                  <button onClick={() => concluir(p.id)} className="text-[#6b6862] hover:text-[#1fa85a]"><Check size={13} /></button>
                  <button onClick={() => excluir(p.id)} className="text-[#6b6862] hover:text-[#d63f3f]"><Trash2 size={13} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Audiência de conciliação"
          className="flex-1 min-w-[160px] border border-[#e5e0d5] rounded-lg px-2.5 py-1.5 text-[13px] focus:outline-none focus:border-[#d9861c]" />
        <input type="date" value={dataPrazo} onChange={e => setDataPrazo(e.target.value)}
          className="border border-[#e5e0d5] rounded-lg px-2.5 py-1.5 text-[13px] focus:outline-none focus:border-[#d9861c]" />
        <button onClick={adicionar} disabled={salvando || !titulo.trim() || !dataPrazo}
          className="flex items-center gap-1.5 bg-[#241c14] hover:bg-[#3a2c1c] disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-[12px] font-semibold">
          {salvando ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Adicionar
        </button>
      </div>
    </div>
  );
}
