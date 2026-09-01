"use client";
import { useState, useEffect, useCallback } from 'react';
import { Plus, Loader2, ListChecks, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  AdvocaciaTarefa, PRIORIDADE_TAREFA_LABELS, PRIORIDADE_TAREFA_CORES,
  STATUS_TAREFA_LABELS, STATUS_TAREFA_CORES, fmtData,
} from './shared';

type PerfilOpcao = { id: string; nome: string };

// Tarefa de processo — evolução de Prazos (data + concluído) pra responsável individual +
// prioridade + status em 3 estados, o suficiente pra alimentar "Minhas tarefas"
// (/advocacia/tarefas) cruzando todos os processos de um advogado.
export default function TarefasProcesso({ leadId, advogados }: { leadId: number; advogados: PerfilOpcao[] }) {
  const auth = useAuth() || {};
  const perfil = auth.perfil;

  const [processoId, setProcessoId] = useState<number | null>(null);
  const [tarefas, setTarefas] = useState<AdvocaciaTarefa[]>([]);
  const [loading, setLoading] = useState(true);

  const [titulo, setTitulo] = useState('');
  const [responsavelId, setResponsavelId] = useState('');
  const [prioridade, setPrioridade] = useState<AdvocaciaTarefa['prioridade']>('media');
  const [dataPrevista, setDataPrevista] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data: proc } = await supabase.from('advocacia_processos').select('id').eq('lead_id', leadId).maybeSingle();
    setProcessoId(proc?.id ?? null);
    if (proc?.id) {
      const { data: itens } = await supabase.from('advocacia_tarefas')
        .select('id, processo_id, titulo, descricao, responsavel_id, prioridade, status, data_prevista, concluida_em, created_at')
        .eq('processo_id', proc.id).order('created_at', { ascending: false });
      setTarefas((itens as AdvocaciaTarefa[]) || []);
    }
    setLoading(false);
  }, [leadId]);

  useEffect(() => { carregar(); }, [carregar]);

  const nomeResponsavel = (id?: string | null) => advogados.find(a => a.id === id)?.nome || '—';

  const adicionar = async () => {
    if (!processoId || !perfil?.empresa_id || !titulo.trim()) return;
    setSalvando(true);
    const { data } = await supabase.from('advocacia_tarefas').insert([{
      empresa_id: perfil.empresa_id, processo_id: processoId, titulo: titulo.trim(),
      responsavel_id: responsavelId || null, prioridade, data_prevista: dataPrevista || null, criado_por: perfil.id,
    }]).select('id, processo_id, titulo, descricao, responsavel_id, prioridade, status, data_prevista, concluida_em, created_at');
    if (data) setTarefas(prev => [data[0] as AdvocaciaTarefa, ...prev]);
    setTitulo(''); setResponsavelId(''); setPrioridade('media'); setDataPrevista('');
    setSalvando(false);
  };

  const mudarStatus = async (id: number, status: AdvocaciaTarefa['status']) => {
    const concluida_em = status === 'concluida' ? new Date().toISOString() : null;
    setTarefas(prev => prev.map(t => t.id === id ? { ...t, status, concluida_em } : t));
    await supabase.from('advocacia_tarefas').update({ status, concluida_em }).eq('id', id);
  };

  const excluir = async (id: number) => {
    setTarefas(prev => prev.filter(t => t.id !== id));
    await supabase.from('advocacia_tarefas').delete().eq('id', id);
  };

  if (loading) return <div className="flex justify-center py-3"><Loader2 size={14} className="animate-spin text-[#d9861c]" /></div>;
  if (!processoId) return null;

  return (
    <div>
      <p className="text-[13px] font-bold text-[#241c14] flex items-center gap-1.5 mb-2"><ListChecks size={14} className="text-[#d9861c]" /> Tarefas</p>

      <div className="space-y-1.5 mb-3">
        {tarefas.length === 0 && <p className="text-[12px] text-[#9a958a]">Nenhuma tarefa ainda.</p>}
        {tarefas.map(t => (
          <div key={t.id} className="flex items-center gap-2 bg-[#faf7f2] border border-[#e5e0d5] rounded-lg px-3 py-2">
            <div className="flex-1 min-w-0">
              <p className={`text-[13px] font-semibold truncate ${t.status === 'concluida' ? 'line-through text-[#9a958a]' : 'text-[#241c14]'}`}>{t.titulo}</p>
              <p className="text-[11px] text-[#9a958a] mt-0.5">{nomeResponsavel(t.responsavel_id)}{t.data_prevista ? ` · ${fmtData(t.data_prevista)}` : ''}</p>
            </div>
            <span className={`text-[9px] font-bold uppercase px-2 py-1 rounded-full border flex-shrink-0 ${PRIORIDADE_TAREFA_CORES[t.prioridade]}`}>{PRIORIDADE_TAREFA_LABELS[t.prioridade]}</span>
            <select value={t.status} onChange={e => mudarStatus(t.id, e.target.value as AdvocaciaTarefa['status'])}
              className={`text-[10px] font-bold uppercase px-2 py-1.5 rounded-lg border flex-shrink-0 outline-none ${STATUS_TAREFA_CORES[t.status]}`}>
              {Object.entries(STATUS_TAREFA_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button onClick={() => excluir(t.id)} className="text-[#9a958a] hover:text-[#d13b3b] flex-shrink-0"><Trash2 size={13} /></button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Nova tarefa..."
          className="flex-1 min-w-[140px] border border-[#e5e0d5] rounded-lg px-2.5 py-1.5 text-[12px] focus:outline-none focus:border-[#d9861c]" />
        <select value={responsavelId} onChange={e => setResponsavelId(e.target.value)}
          className="border border-[#e5e0d5] rounded-lg px-2 py-1.5 text-[12px] bg-white focus:outline-none focus:border-[#d9861c]">
          <option value="">Responsável...</option>
          {advogados.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
        </select>
        <select value={prioridade} onChange={e => setPrioridade(e.target.value as AdvocaciaTarefa['prioridade'])}
          className="border border-[#e5e0d5] rounded-lg px-2 py-1.5 text-[12px] bg-white focus:outline-none focus:border-[#d9861c]">
          {Object.entries(PRIORIDADE_TAREFA_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input type="date" value={dataPrevista} onChange={e => setDataPrevista(e.target.value)}
          className="border border-[#e5e0d5] rounded-lg px-2 py-1.5 text-[12px] focus:outline-none focus:border-[#d9861c]" />
        <button onClick={adicionar} disabled={salvando || !titulo.trim()}
          className="flex items-center gap-1 bg-[#241c14] hover:bg-[#3a2c1c] disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-[12px] font-semibold flex-shrink-0">
          {salvando ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Adicionar
        </button>
      </div>
    </div>
  );
}
