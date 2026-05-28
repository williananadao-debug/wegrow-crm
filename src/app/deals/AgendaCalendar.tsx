"use client";
import React, { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Plus, Check, CalendarDays } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Tarefa = { id: number; titulo: string; data: string; concluido: boolean; };
type Visita = { id: number; empresa: string; created_at: string; };

type Props = {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  empresaId: string;
  perfilNome?: string;
};

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function pad(n: number) { return String(n).padStart(2, '0'); }

export default function AgendaCalendar({ isOpen, onClose, userId, empresaId, perfilNome }: Props) {
  const today = new Date();
  const [ano, setAno] = useState(today.getFullYear());
  const [mes, setMes] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate());
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [novaTarefa, setNovaTarefa] = useState('');
  const [adicionando, setAdicionando] = useState(false);

  const fetchDados = useCallback(async () => {
    if (!userId || !empresaId) return;
    const inicio = `${ano}-${pad(mes + 1)}-01`;
    const ultimoDia = new Date(ano, mes + 1, 0).getDate();
    const fim = `${ano}-${pad(mes + 1)}-${pad(ultimoDia)}`;

    const [{ data: t }, { data: v }] = await Promise.all([
      supabase.from('tarefas')
        .select('id, titulo, data, concluido')
        .eq('user_id', userId)
        .eq('empresa_id', empresaId)
        .gte('data', inicio)
        .lte('data', fim),
      supabase.from('visitas')
        .select('id, empresa, created_at')
        .eq('user_id', userId)
        .eq('empresa_id', empresaId)
        .gte('created_at', `${inicio}T00:00:00`)
        .lte('created_at', `${fim}T23:59:59`),
    ]);
    setTarefas((t || []) as Tarefa[]);
    setVisitas((v || []) as Visita[]);
  }, [userId, empresaId, ano, mes]);

  useEffect(() => {
    if (isOpen) fetchDados();
  }, [isOpen, fetchDados]);

  const dayStr = useCallback((d: number) => `${ano}-${pad(mes + 1)}-${pad(d)}`, [ano, mes]);

  const tarefasDoDay = useCallback((d: number) => tarefas.filter(t => t.data === dayStr(d)), [tarefas, dayStr]);
  const visitasDoDay = useCallback((d: number) => visitas.filter(v => v.created_at.startsWith(dayStr(d))), [visitas, dayStr]);

  const primeiroDia = new Date(ano, mes, 1).getDay();
  const ultimoDia = new Date(ano, mes + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(primeiroDia).fill(null), ...Array.from({ length: ultimoDia }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMes = () => { if (mes === 0) { setAno(a => a - 1); setMes(11); } else setMes(m => m - 1); setSelectedDay(null); };
  const nextMes = () => { if (mes === 11) { setAno(a => a + 1); setMes(0); } else setMes(m => m + 1); setSelectedDay(null); };

  const adicionarTarefa = async () => {
    if (!novaTarefa.trim() || !selectedDay) return;
    const { data: inserted } = await supabase.from('tarefas')
      .insert([{ titulo: novaTarefa.trim(), data: dayStr(selectedDay), user_id: userId, empresa_id: empresaId, concluido: false }])
      .select('id, titulo, data, concluido').single();
    if (inserted) setTarefas(prev => [...prev, inserted as Tarefa]);
    setNovaTarefa('');
    setAdicionando(false);
  };

  const toggleTarefa = async (id: number, concluido: boolean) => {
    await supabase.from('tarefas').update({ concluido: !concluido }).eq('id', id);
    setTarefas(prev => prev.map(t => t.id === id ? { ...t, concluido: !concluido } : t));
  };

  const deletarTarefa = async (id: number) => {
    await supabase.from('tarefas').delete().eq('id', id);
    setTarefas(prev => prev.filter(t => t.id !== id));
  };

  if (!isOpen) return null;

  const selTarefas = selectedDay ? tarefasDoDay(selectedDay) : [];
  const selVisitas = selectedDay ? visitasDoDay(selectedDay) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-[#0F172A] border border-white/10 rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-blue-400" />
            <span className="font-black text-white uppercase tracking-widest text-sm">Agenda</span>
            {perfilNome && <span className="text-slate-500 text-xs">— {perfilNome}</span>}
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors"><X size={18} /></button>
        </div>

        {/* Navegação de mês */}
        <div className="flex items-center justify-between px-5 py-3 shrink-0">
          <button onClick={prevMes} className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5"><ChevronLeft size={18} /></button>
          <span className="font-black text-white text-sm uppercase tracking-wide">{MESES[mes]} {ano}</span>
          <button onClick={nextMes} className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5"><ChevronRight size={18} /></button>
        </div>

        {/* Dias da semana */}
        <div className="grid grid-cols-7 px-4 shrink-0">
          {DIAS.map(d => (
            <div key={d} className="text-center text-[9px] font-black uppercase text-slate-600 py-1">{d}</div>
          ))}
        </div>

        {/* Grid do mês */}
        <div className="grid grid-cols-7 px-4 gap-y-1 shrink-0">
          {cells.map((day, i) => {
            if (!day) return <div key={i} />;
            const pendentes = tarefasDoDay(day).filter(t => !t.concluido).length;
            const concluidas = tarefasDoDay(day).filter(t => t.concluido).length;
            const nVisitas = visitasDoDay(day).length;
            const isSelected = selectedDay === day;
            const isHoje = today.getFullYear() === ano && today.getMonth() === mes && today.getDate() === day;
            return (
              <button
                key={i}
                onClick={() => setSelectedDay(isSelected ? null : day)}
                className={`flex flex-col items-center justify-center rounded-xl py-1.5 transition-all ${
                  isSelected ? 'bg-blue-600 text-white' :
                  isHoje ? 'bg-white/10 text-white ring-1 ring-blue-500/40' :
                  'text-slate-300 hover:bg-white/5'
                }`}
              >
                <span className={`text-xs leading-none ${isHoje && !isSelected ? 'font-black' : 'font-semibold'}`}>{day}</span>
                <div className="flex gap-0.5 mt-1 min-h-[6px]">
                  {pendentes > 0 && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                  {concluidas > 0 && <span className="w-1.5 h-1.5 rounded-full bg-green-500" />}
                  {nVisitas > 0 && <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />}
                </div>
              </button>
            );
          })}
        </div>

        {/* Legenda */}
        <div className="flex gap-4 px-5 py-2 shrink-0">
          <span className="flex items-center gap-1 text-[9px] text-slate-500"><span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" /> Tarefa</span>
          <span className="flex items-center gap-1 text-[9px] text-slate-500"><span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" /> Concluída</span>
          <span className="flex items-center gap-1 text-[9px] text-slate-500"><span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" /> Visita</span>
        </div>

        {/* Detalhe do dia selecionado */}
        {selectedDay && (
          <div className="border-t border-white/10 flex-1 overflow-y-auto p-5 space-y-2">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-black uppercase text-slate-400">{pad(selectedDay)}/{pad(mes + 1)}/{ano}</span>
              <button
                onClick={() => { setAdicionando(true); setNovaTarefa(''); }}
                className="flex items-center gap-1 text-[10px] font-black uppercase text-blue-400 hover:text-blue-300 transition-colors"
              >
                <Plus size={12} /> Nova Tarefa
              </button>
            </div>

            {adicionando && (
              <div className="flex gap-2 mb-2">
                <input
                  autoFocus
                  value={novaTarefa}
                  onChange={e => setNovaTarefa(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') adicionarTarefa();
                    if (e.key === 'Escape') { setAdicionando(false); setNovaTarefa(''); }
                  }}
                  placeholder="Ex: Ligar para João às 14h..."
                  className="flex-1 bg-white/5 border border-blue-500/40 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-500 placeholder:text-slate-600"
                />
                <button onClick={adicionarTarefa} className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl px-3 text-xs font-black transition-colors">OK</button>
                <button onClick={() => { setAdicionando(false); setNovaTarefa(''); }} className="text-slate-500 hover:text-white text-xs transition-colors px-1">✕</button>
              </div>
            )}

            {selTarefas.length === 0 && selVisitas.length === 0 && !adicionando && (
              <p className="text-slate-600 text-xs text-center py-6">Nenhum compromisso neste dia.<br /><span className="text-slate-700">Clique em + Nova Tarefa para adicionar.</span></p>
            )}

            {selTarefas.map(t => (
              <div key={t.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${t.concluido ? 'border-green-500/20 bg-green-500/5' : 'border-white/5 bg-white/[0.02]'}`}>
                <button
                  onClick={() => toggleTarefa(t.id, t.concluido)}
                  className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${t.concluido ? 'bg-green-500 border-green-500' : 'border-slate-600 hover:border-blue-400'}`}
                >
                  {t.concluido && <Check size={10} className="text-white" strokeWidth={3} />}
                </button>
                <span className={`flex-1 text-xs ${t.concluido ? 'line-through text-slate-600' : 'text-slate-200'}`}>{t.titulo}</span>
                <button onClick={() => deletarTarefa(t.id)} className="text-slate-700 hover:text-red-400 transition-colors text-xs ml-1">✕</button>
              </div>
            ))}

            {selVisitas.map(v => (
              <div key={v.id} className="flex items-center gap-3 p-3 rounded-xl border border-orange-500/20 bg-orange-500/5">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-orange-300 font-bold truncate">{v.empresa}</p>
                  <p className="text-[10px] text-slate-600">Visita registrada</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
