"use client";
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { 
  Clapperboard, Mic2, MonitorPlay, CheckCircle2, Clock, 
  Calendar, Plus, X, Trash2, Edit2, Filter, Building2, User, Hash, Radio, FileText, CalendarDays, ShieldCheck, AlignLeft, Archive
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';

type Job = {
  id: number;
  titulo: string;
  briefing: string;
  stage: string;
  prioridade: 'baixa' | 'media' | 'alta';
  deadline: string;
  created_at: string;
  user_id: string;
  empresa_id?: string;
  unidade?: string;
  vendedor_nome?: string;
  client_id?: number; 
  
  // Campos OPEC
  cliente?: string;
  agencia?: string;
  num_pi?: string;
  data_inicio?: string;
  hora_inicio?: string;
  data_fim?: string;
  hora_fim?: string;
  itens_opec?: any;
};

// As 4 colunas padrão
const STAGES = {
  roteiro: { title: 'Roteiro / Copy', icon: <Clapperboard size={14}/>, color: 'border-pink-500' },
  gravacao: { title: 'Locução / Gravação', icon: <Mic2 size={14}/>, color: 'border-purple-500' },
  edicao: { title: 'Edição / Motion', icon: <MonitorPlay size={14}/>, color: 'border-blue-500' },
  aprovacao: { title: 'OPEC / No Ar', icon: <Radio size={14}/>, color: 'border-[#22C55E]' }
};

const formatId = (id: number, prefix: string) => `${prefix}-${String(id).padStart(4, '0')}`;

const formatarData = (dataIso: string) => {
    if (!dataIso) return '';
    const parts = dataIso.split('T')[0].split('-');
    if(parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return new Date(dataIso).toLocaleDateString('pt-BR');
};

const getPriorityColor = (p: string) => {
    if (p === 'alta') return 'bg-red-500 text-white border-red-500';
    if (p === 'media') return 'bg-yellow-500 text-[#0F172A] border-yellow-500';
    return 'bg-blue-500 text-white border-blue-500';
};

// 👇 CARD EM MODELO F1 (React.memo) PARA ALTA PERFORMANCE 👇
const JobCard = React.memo(({ job, index, filtroUnidade, filtroVendedor, isDirector, abrirModal, handleFinalizar, isOpec }: any) => {
    const leadRef = job.briefing?.match(/LD-\d+/)?.[0] || '';
    const isFinalizado = job.stage === 'entregue';

    return (
        // 👇 CADEADO: isDragDisabled bloqueia o arrastar se for OPEC
        <Draggable draggableId={job.id.toString()} index={index} isDragDisabled={isOpec}>
          {(prov, snap) => (
            <div
              ref={prov.innerRef}
              {...prov.draggableProps}
              {...prov.dragHandleProps}
              className={`bg-white/[0.03] p-4 rounded-xl border border-white/5 group hover:border-white/20 transition-all ${isOpec ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'} relative flex flex-col ${snap.isDragging ? 'rotate-2 shadow-2xl bg-[#0F172A] z-50' : ''} ${isFinalizado ? 'opacity-70 hover:opacity-100 grayscale hover:grayscale-0' : ''}`}
              onClick={() => abrirModal(job)} 
            >
              <div className="flex justify-between items-start mb-2">
                  <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded border ${getPriorityColor(job.prioridade)}`}>
                      {job.prioridade}
                  </span>
                  <div className="flex gap-2 items-center">
                      {leadRef && (
                          <span className="text-[9px] font-black text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded tracking-widest flex items-center gap-0.5 border border-blue-500/20 shadow-sm">
                              <Hash size={8}/> {leadRef}
                          </span>
                      )}
                      {job.deadline && (
                          <div className={`flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${new Date(job.deadline) < new Date() && !isFinalizado ? 'bg-red-500/10 text-red-500' : 'bg-white/5 text-slate-400'}`}>
                              <Clock size={10}/> {formatarData(job.deadline).slice(0,5)}
                          </div>
                      )}
                  </div>
              </div>
              
              <h4 className="font-black text-sm text-white mb-2 leading-tight uppercase">{job.titulo}</h4>
              
              {job.itens_opec && job.itens_opec.length > 0 && (
                  <div className="flex flex-col gap-1 mb-2 bg-black/30 p-2 rounded-lg border border-white/5">
                      <span className="text-[8px] text-slate-500 font-bold uppercase tracking-widest mb-0.5 border-b border-white/5 pb-1">Mídia Contratada</span>
                      {job.itens_opec.map((item: any, idx: number) => (
                          <span key={idx} className="text-[10px] text-slate-300 font-bold uppercase flex items-center gap-1 truncate">
                              <span className="text-emerald-400 bg-emerald-500/10 px-1 rounded">{item.quantidade}x</span> {item.servico}
                          </span>
                      ))}
                  </div>
              )}

              {(job.data_inicio || job.data_fim) && (
                  <div className="flex flex-col gap-1.5 mb-3 bg-black/30 p-2 rounded-lg border border-white/5">
                      <span className="text-[8px] text-slate-500 font-bold uppercase tracking-widest mb-0.5 border-b border-white/5 pb-1 flex items-center gap-1"><CalendarDays size={8}/> Período de Veiculação</span>
                      <div className="flex justify-between items-center text-[9px] font-mono text-slate-400 bg-white/5 px-2 py-1 rounded">
                          <span className="text-[#22C55E] font-black">INÍCIO</span>
                          <span className="text-white">{formatarData(job.data_inicio)} {job.hora_inicio ? `às ${job.hora_inicio}` : ''}</span>
                      </div>
                      <div className="flex justify-between items-center text-[9px] font-mono text-slate-400 bg-white/5 px-2 py-1 rounded">
                          <span className="text-red-400 font-black">FIM</span>
                          <span className="text-white">{formatarData(job.data_fim)} {job.hora_fim ? `às ${job.hora_fim}` : ''}</span>
                      </div>
                  </div>
              )}

              <div className="flex flex-wrap gap-1 mb-2 mt-auto">
                  {filtroUnidade === 'Todas' && job.unidade && (
                      <span className="text-[8px] bg-white/5 text-slate-400 px-1.5 py-0.5 rounded uppercase font-bold flex items-center gap-1"><Building2 size={8}/> {job.unidade}</span>
                  )}
                  {job.vendedor_nome && (
                      <span className="text-[8px] bg-blue-600/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded uppercase font-black flex items-center gap-1">
                          <User size={8}/> VEND: {job.vendedor_nome.split(' ')[0]} 
                      </span>
                  )}
              </div>

              <div className="flex items-center justify-between border-t border-white/5 pt-2 mt-2">
                  <div className="flex items-center gap-1 text-[9px] text-slate-500 font-mono font-bold tracking-widest bg-white/5 px-2 py-0.5 rounded">
                      <Hash size={10}/> {formatId(job.id, 'JB')}
                  </div>
                  <div className="p-1 bg-white/5 rounded-full text-slate-500 group-hover:text-white transition-colors">
                      <Edit2 size={10}/>
                  </div>
              </div>

              {/* 👇 CADEADO: Botão de Finalizar só aparece se não for OPEC e se não estiver finalizado */}
              {!isFinalizado && !isOpec && (
                  <button 
                      onClick={(e) => handleFinalizar(e, job.id)}
                      className="w-full mt-2 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all opacity-0 group-hover:opacity-100 bg-[#22C55E]/10 text-[#22C55E] hover:bg-[#22C55E] hover:text-[#0F172A]"
                  >
                      <ShieldCheck size={14} /> Finalizar e Liberar OPEC
                  </button>
              )}
            </div>
          )}
        </Draggable>
    );
});
JobCard.displayName = 'JobCard';

export default function JobsPage() {
  const auth = useAuth() || {};
  const user = auth.user; // 👈 Puxando o user
  const perfil = auth.perfil;
  
  // 👇 IDENTIFICA SE O USUÁRIO LOGADO É A OPEC (CORRIGIDO) 👇
  const isOpec = user?.email === 'opec@wegrow.com.br';

  const [rawJobs, setRawJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const [filtroPeriodo, setFiltroPeriodo] = useState<string>('Todo o Período');
  const [filtroUnidade, setFiltroUnidade] = useState<string>('Todas');
  const [filtroVendedor, setFiltroVendedor] = useState<string>('Todos');
  
  const [mostrarFinalizados, setMostrarFinalizados] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingJobId, setEditingJobId] = useState<number | null>(null);
  const [formData, setFormData] = useState<Partial<Job>>({
      titulo: '', briefing: '', prioridade: 'media', deadline: new Date().toISOString().split('T')[0],
      unidade: '', vendedor_nome: '', cliente: '', agencia: '', num_pi: '', 
      data_inicio: '', hora_inicio: '', data_fim: '', hora_fim: '', itens_opec: []
  });

  const isDirector = perfil?.cargo === 'diretor' || user?.email === 'admin@wegrow.com';

  useEffect(() => {
    const fetchJobs = async () => {
      setLoading(true);
      let query = supabase.from('jobs').select('*').order('created_at', { ascending: false });
      
      if (!mostrarFinalizados) {
          query = query.neq('stage', 'entregue');
      }

      // Se for a OPEC, ela precisa ver TODOS os jobs, então ignoramos o filtro de vendedor/unidade para ela.
      if (!isDirector && !isOpec) query = query.or(`user_id.eq.${user?.id},vendedor_nome.ilike.%${perfil?.nome}%`);
      
      const { data } = await query;
      if (data) setRawJobs(data as any);
      setLoading(false);
    };

    if (user) fetchJobs();
  }, [user, perfil, mostrarFinalizados, isDirector, isOpec]); 

  const unidadesDisponiveis = useMemo(() => Array.from(new Set(rawJobs.map(j => j.unidade).filter(Boolean))) as string[], [rawJobs]);
  const vendedoresDisponiveis = useMemo(() => Array.from(new Set(rawJobs.map(j => j.vendedor_nome).filter(Boolean))) as string[], [rawJobs]);

  const jobsFiltrados = useMemo(() => rawJobs.filter(job => {
      if (filtroUnidade !== 'Todas' && job.unidade !== filtroUnidade) return false;
      if (filtroVendedor !== 'Todos' && job.vendedor_nome !== filtroVendedor && job.user_id !== filtroVendedor) return false;
      if (filtroPeriodo !== 'Todo o Período') {
          const dataJob = new Date(job.created_at || new Date());
          const hoje = new Date();
          if (filtroPeriodo === 'Mês Atual') {
              if (dataJob.getMonth() !== hoje.getMonth() || dataJob.getFullYear() !== hoje.getFullYear()) return false;
          } else if (filtroPeriodo === 'Mês Passado') {
              const mesPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
              if (dataJob.getMonth() !== mesPassado.getMonth() || dataJob.getFullYear() !== mesPassado.getFullYear()) return false;
          } else if (filtroPeriodo === 'Ano Atual') {
              if (dataJob.getFullYear() !== hoje.getFullYear()) return false;
          }
      }
      return true;
  }), [rawJobs, filtroUnidade, filtroVendedor, filtroPeriodo]);

  const onDragEnd = useCallback(async (result: any) => {
    // 👇 CADEADO: Segurança dupla, se por acaso a OPEC tentar arrastar, a função aborta.
    if (isOpec) return;

    const { destination, draggableId } = result;
    if (!destination) return;
    const newStage = destination.droppableId;
    const id = parseInt(draggableId);
    setRawJobs(prev => prev.map(job => job.id === id ? { ...job, stage: newStage } : job));
    await supabase.from('jobs').update({ stage: newStage }).eq('id', id);
  }, [isOpec]);

  const handleFinalizar = useCallback(async (e: React.MouseEvent, id: number) => {
      e.stopPropagation(); 
      if(isOpec) return; // Segurança dupla

      if(!confirm("Deseja finalizar a produção? O Job ficará disponível na API para o sistema OPEC importar.")) return;
      
      setRawJobs(prev => 
          mostrarFinalizados 
              ? prev.map(j => j.id === id ? { ...j, stage: 'entregue' } : j)
              : prev.filter(j => j.id !== id)
      );
      
      await supabase.from('jobs').update({ stage: 'entregue' }).eq('id', id);
      alert("✅ Produção Finalizada! Os dados e a ordem de inserção estão liberados para o sistema da OPEC consumir.");
  }, [mostrarFinalizados, isOpec]);

  const abrirModal = useCallback((job?: Job) => {
      if (job) {
          setEditingJobId(job.id);
          setFormData({ 
              ...job, 
              deadline: job.deadline ? job.deadline.split('T')[0] : '',
              data_inicio: job.data_inicio ? job.data_inicio.split('T')[0] : '',
              data_fim: job.data_fim ? job.data_fim.split('T')[0] : '',
              hora_inicio: job.hora_inicio || '',
              hora_fim: job.hora_fim || '',
              vendedor_nome: job.vendedor_nome || ''
          });
      } else {
          setEditingJobId(null);
          setFormData({ 
            titulo: '', briefing: '', prioridade: 'media', deadline: new Date().toISOString().split('T')[0],
            unidade: filtroUnidade !== 'Todas' ? filtroUnidade : '', vendedor_nome: isDirector ? '' : (perfil?.nome || ''),
            cliente: '', agencia: '', num_pi: '', data_inicio: '', hora_inicio: '', data_fim: '', hora_fim: '', itens_opec: []
          });
      }
      setIsModalOpen(true);
  }, [filtroUnidade, isDirector, perfil?.nome]);

  const handleSave = async (e: React.FormEvent) => {
      e.preventDefault();
      if(isOpec) return; // Segurança dupla

      if (!formData.titulo) return alert("Título obrigatório");

      const payload = {
          ...formData,
          user_id: user?.id,
          empresa_id: perfil?.empresa_id,
          vendedor_nome: formData.vendedor_nome || perfil?.nome,
          ...(editingJobId ? {} : { stage: 'roteiro' }) 
      };

      if (editingJobId) {
          const { error } = await supabase.from('jobs').update(payload).eq('id', editingJobId);
          if (!error) setRawJobs(prev => prev.map(j => j.id === editingJobId ? { ...j, ...payload } as Job : j));
      } else {
          const { data, error } = await supabase.from('jobs').insert([payload]).select();
          if (!error && data) setRawJobs(prev => [data[0], ...prev]);
      }
      setIsModalOpen(false);
  };

  const handleDelete = useCallback(async (e: React.MouseEvent, id: number) => {
      e.stopPropagation(); 
      if(isOpec) return; // Segurança dupla

      if(!confirm("Tem certeza que deseja excluir este Job de Produção? Esta ação não pode ser desfeita.")) return;
      const { error } = await supabase.from('jobs').delete().eq('id', id);
      if(!error) {
          setRawJobs(prev => prev.filter(j => j.id !== id));
          setIsModalOpen(false);
      }
  }, [isOpec]);

  if (loading) return <div className="h-screen flex items-center justify-center bg-[#0B1120] text-white font-black animate-pulse">CARREGANDO PRODUÇÃO...</div>;

  const VISIBLE_STAGES = mostrarFinalizados 
    ? { ...STAGES, entregue: { title: 'Finalizados (OPEC)', icon: <Archive size={14}/>, color: 'border-slate-500' } } 
    : STAGES;

  return (
    <div className="h-full flex flex-col pb-20 animate-in fade-in duration-500 text-white">
      <div className="p-6 flex flex-col md:flex-row justify-between items-start md:items-end gap-4 pb-4">
        <div>
            <h1 className="text-3xl font-black uppercase italic tracking-tighter">Produção</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-[0.2em] mt-1">Esteira de Jobs e OPEC</p>
        </div>
        
        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
            <div className="flex items-center bg-white/5 border border-white/10 rounded-2xl overflow-hidden w-full md:w-auto shadow-lg">
                <Filter size={14} className="text-slate-400 ml-3 mr-1" />
                <select value={filtroPeriodo} onChange={e => setFiltroPeriodo(e.target.value)} className="bg-transparent text-white text-[10px] font-bold uppercase tracking-wider outline-none cursor-pointer py-3 px-2 border-r border-white/10">
                    <option value="Todo o Período" className="bg-[#0B1120]">Todo o Período</option>
                    <option value="Ano Atual" className="bg-[#0B1120]">Ano Atual</option>
                    <option value="Mês Atual" className="bg-[#0B1120]">Mês Atual</option>
                    <option value="Mês Passado" className="bg-[#0B1120]">Mês Passado</option>
                </select>
                <select value={filtroUnidade} onChange={e => setFiltroUnidade(e.target.value)} className="bg-transparent text-white text-[10px] font-bold uppercase tracking-wider outline-none cursor-pointer py-3 px-2 border-r border-white/10">
                    <option value="Todas" className="bg-[#0B1120]">Todas Unidades</option>
                    {unidadesDisponiveis.map(u => <option key={u} value={u} className="bg-[#0B1120]">{u}</option>)}
                </select>
                {isDirector && (
                    <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)} className="bg-transparent text-orange-500 text-[10px] font-black uppercase tracking-wider outline-none cursor-pointer py-3 px-2 border-r border-white/10">
                        <option value="Todos" className="bg-[#0B1120]">Toda Equipe</option>
                        {vendedoresDisponiveis.map(v => <option key={v} value={v} className="bg-[#0B1120]">{v}</option>)}
                    </select>
                )}
                
                <button 
                    onClick={() => setMostrarFinalizados(!mostrarFinalizados)}
                    className={`bg-transparent text-[10px] font-black uppercase tracking-wider outline-none cursor-pointer py-3 px-4 transition-colors ${mostrarFinalizados ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-white/5'}`}
                >
                    {mostrarFinalizados ? 'Ocultar Arquivo' : 'Ver Finalizados'}
                </button>
            </div>

            {/* 👇 CADEADO: Botão Novo Job desaparece para OPEC 👇 */}
            {!isOpec && (
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <button onClick={() => abrirModal()} className="w-full md:w-auto bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg transition-all">
                        <Plus size={18} /> Novo Job
                    </button>
                </div>
            )}
        </div>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-4 p-6 pt-0 h-[calc(100vh-200px)] overflow-x-auto items-start custom-scrollbar">
          {Object.entries(VISIBLE_STAGES).map(([key, stage]) => {
            const stageJobs = jobsFiltrados.filter(j => j.stage === key);
            
            return (
              <Droppable key={key} droppableId={key} isDropDisabled={isOpec}>
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className={`bg-[#0B1120] border-t-4 ${stage.color} border-x border-b border-white/5 rounded-2xl p-3 h-full flex flex-col min-w-[280px] md:flex-1`}>
                    <div className="flex items-center gap-2 mb-4 px-1 pt-1">
                        <div className={`p-1.5 rounded-lg bg-white/5 text-slate-300`}>{stage.icon}</div>
                        <h3 className="font-black uppercase text-xs tracking-wide flex-1">{stage.title}</h3>
                        <span className="text-slate-600 text-[9px] font-bold bg-white/5 px-2 py-0.5 rounded-full">{stageJobs.length}</span>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pb-10">
                      {stageJobs.map((job, index) => (
                         <JobCard key={job.id} job={job} index={index} filtroUnidade={filtroUnidade} filtroVendedor={filtroVendedor} isDirector={isDirector} abrirModal={abrirModal} handleFinalizar={handleFinalizar} isOpec={isOpec} />
                      ))}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            );
          })}
        </div>
      </DragDropContext>

      {/* MODAL DE CRIAÇÃO / EDIÇÃO */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
            <div className="bg-[#0B1120] border border-white/10 w-full max-w-5xl rounded-[32px] shadow-2xl relative flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center p-6 border-b border-white/10 flex-shrink-0">
                    <h2 className="text-xl font-black uppercase italic tracking-tighter text-white flex items-center gap-2">
                        {editingJobId ? 'Painel OPEC / Produção' : 'Novo Job'}
                        {editingJobId && <span className="text-blue-500 bg-blue-500/10 px-2 py-1 rounded text-lg">#{formatId(editingJobId, 'JB')}</span>}
                        
                        {formData.briefing?.match(/LD-\d+/)?.[0] && (
                            <span className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded text-sm flex items-center gap-1 ml-2 shadow-sm">
                                <FileText size={14}/> {formData.briefing?.match(/LD-\d+/)?.[0]}
                            </span>
                        )}
                        {/* 👇 AVISO VISUAL DE QUE ESTÁ BLOQUEADO 👇 */}
                        {isOpec && <span className="text-orange-500 text-[10px] border border-orange-500/30 bg-orange-500/10 px-2 py-1 ml-2 rounded font-black tracking-widest uppercase">Somente Leitura</span>}
                    </h2>
                    <div className="flex items-center gap-2">
                        {/* 👇 CADEADO: Lixeira some para OPEC 👇 */}
                        {editingJobId && !isOpec && (
                            <button type="button" onClick={(e) => handleDelete(e, editingJobId)} className="bg-red-500/10 p-2 rounded-full text-red-500 hover:bg-red-500 hover:text-white transition-colors" title="Excluir Job">
                                <Trash2 size={20}/>
                            </button>
                        )}
                        <button onClick={() => setIsModalOpen(false)} className="bg-white/5 p-2 rounded-full hover:bg-white/10 transition-colors">
                            <X className="text-slate-500 hover:text-white" size={20}/>
                        </button>
                    </div>
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                    <form id="jobForm" onSubmit={handleSave} className="space-y-6">
                        
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                            
                            <div className="lg:col-span-4 space-y-6">
                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Título do Job (Referência)</label>
                                    <input disabled={isOpec} className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-blue-500 uppercase disabled:opacity-70" placeholder="Ex: Spot 30s Dia das Mães" value={formData.titulo || ''} onChange={e => setFormData({...formData, titulo: e.target.value})} required />
                                </div>

                                <div className="bg-blue-500/5 border border-blue-500/20 p-5 rounded-2xl space-y-4">
                                    <h3 className="text-xs font-black text-blue-400 uppercase flex items-center gap-2"><CalendarDays size={14}/> Período do Contrato</h3>
                                    
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2 block truncate">Data Início</label>
                                            <input disabled={isOpec} type="date" className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-3 text-white text-xs font-bold outline-none focus:border-blue-500 disabled:opacity-70" value={formData.data_inicio || ''} onChange={e => setFormData({...formData, data_inicio: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2 block truncate">Hora Início</label>
                                            <input disabled={isOpec} type="time" className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-3 text-white text-xs font-bold outline-none focus:border-blue-500 disabled:opacity-70" value={formData.hora_inicio || ''} onChange={e => setFormData({...formData, hora_inicio: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2 block truncate">Data Fim</label>
                                            <input disabled={isOpec} type="date" className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-3 text-white text-xs font-bold outline-none focus:border-blue-500 disabled:opacity-70" value={formData.data_fim || ''} onChange={e => setFormData({...formData, data_fim: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2 block truncate">Hora Fim</label>
                                            <input disabled={isOpec} type="time" className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-3 text-white text-xs font-bold outline-none focus:border-blue-500 disabled:opacity-70" value={formData.hora_fim || ''} onChange={e => setFormData({...formData, hora_fim: e.target.value})} />
                                        </div>
                                        <div className="col-span-2">
                                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2 block truncate">Nº PI (Opcional)</label>
                                            <input disabled={isOpec} className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-3 text-white text-xs font-bold outline-none focus:border-blue-500 disabled:opacity-70" value={formData.num_pi || ''} onChange={e => setFormData({...formData, num_pi: e.target.value})} placeholder="Ex: 089144" />
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-white/[0.02] border border-white/5 p-5 rounded-2xl space-y-4">
                                    <div>
                                        <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Vendedor Origem</label>
                                        <input className="w-full bg-blue-600/10 border border-blue-500/30 rounded-xl px-4 py-3 text-blue-400 text-sm font-black uppercase outline-none" value={formData.vendedor_nome || ''} onChange={e => setFormData({...formData, vendedor_nome: e.target.value})} disabled={!isDirector || isOpec} />
                                    </div>
                                    <hr className="border-white/5" />
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2 text-red-400">Deadline (Prazo)</label>
                                            <input disabled={isOpec} type="date" className="w-full bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl px-3 py-3 text-xs font-bold outline-none focus:border-red-500 disabled:opacity-70" value={formData.deadline || ''} onChange={e => setFormData({...formData, deadline: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Prioridade</label>
                                            <select disabled={isOpec} className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-3 text-white text-xs font-bold outline-none focus:border-blue-500 appearance-none disabled:opacity-70" value={formData.prioridade || 'media'} onChange={e => setFormData({...formData, prioridade: e.target.value as any})}>
                                                <option value="baixa" className="bg-[#0B1120]">Baixa</option>
                                                <option value="media" className="bg-[#0B1120]">Média</option>
                                                <option value="alta" className="bg-[#0B1120]">Alta Urgência</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="lg:col-span-8 space-y-6">
                                <div className="bg-[#0F172A] border border-white/10 p-5 rounded-2xl">
                                    <h3 className="text-xs font-black text-[#22C55E] uppercase mb-4 flex items-center gap-2"><AlignLeft size={16}/> Tabela de Mídia Contratada (Defina os Horários)</h3>
                                    
                                    {formData.itens_opec && formData.itens_opec.length > 0 ? (
                                        <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
                                            <table className="w-full text-left text-[10px] text-slate-300">
                                                <thead className="bg-white/5 font-black uppercase text-slate-500 tracking-wider">
                                                    <tr>
                                                        <th className="p-3 w-12">Qtd</th>
                                                        <th className="p-3">Serviço</th>
                                                        <th className="p-3 w-20">Duração</th>
                                                        <th className="p-3">Programa</th>
                                                        <th className="p-3 w-36">Horários</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-white/5">
                                                    {formData.itens_opec.map((item: any, i: number) => (
                                                        <tr key={i} className="hover:bg-white/5 transition-colors">
                                                            <td className="p-3 font-black text-white">{item.quantidade}x</td>
                                                            <td className="p-3 font-bold text-blue-400 uppercase">{item.servico}</td>
                                                            <td className="p-3 font-mono text-slate-400">{item.tempo || '30"'}</td>
                                                            <td className="p-3 uppercase font-medium">{item.programa || 'ROTATIVO'}</td>
                                                            <td className="p-2">
                                                                <div className="flex items-center gap-1">
                                                                    <input 
                                                                        type="time" 
                                                                        disabled={isOpec}
                                                                        className="w-full bg-black/50 border border-white/10 rounded p-1.5 text-[10px] text-emerald-400 font-bold outline-none focus:border-emerald-500 disabled:opacity-70" 
                                                                        value={item.horario_inicial || ''} 
                                                                        onChange={(e) => {
                                                                            const novosItens = [...formData.itens_opec];
                                                                            novosItens[i].horario_inicial = e.target.value;
                                                                            setFormData({...formData, itens_opec: novosItens});
                                                                        }} 
                                                                    />
                                                                    <span className="text-slate-500 font-mono">às</span>
                                                                    <input 
                                                                        type="time" 
                                                                        disabled={isOpec}
                                                                        className="w-full bg-black/50 border border-white/10 rounded p-1.5 text-[10px] text-emerald-400 font-bold outline-none focus:border-emerald-500 disabled:opacity-70" 
                                                                        value={item.horario_final || ''} 
                                                                        onChange={(e) => {
                                                                            const novosItens = [...formData.itens_opec];
                                                                            novosItens[i].horario_final = e.target.value;
                                                                            setFormData({...formData, itens_opec: novosItens});
                                                                        }} 
                                                                    />
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="bg-white/[0.02] p-8 rounded-xl text-center border border-dashed border-white/10">
                                            <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Nenhum Serviço Mapeado</p>
                                            <p className="text-[10px] text-slate-600 mt-2 max-w-xs mx-auto">Este job foi criado sem serviços no carrinho ou antes da atualização do sistema.</p>
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Roteiro / Texto do Locutor / Briefing</label>
                                    <textarea disabled={isOpec} className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-medium outline-none focus:border-blue-500 min-h-[220px] resize-none custom-scrollbar leading-relaxed disabled:opacity-70" placeholder="Cole o roteiro de gravação ou orientações do cliente aqui..." value={formData.briefing || ''} onChange={e => setFormData({...formData, briefing: e.target.value})} />
                                </div>
                            </div>

                        </div>

                    </form>
                </div>
                
                <div className="p-6 border-t border-white/10 bg-[#0F172A] flex-shrink-0 rounded-b-[32px] flex justify-end items-center">
                    {/* 👇 CADEADO: O botão muda se for OPEC 👇 */}
                    {isOpec ? (
                        <button type="button" onClick={() => setIsModalOpen(false)} className="bg-white/10 text-white px-8 py-3 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-white/20 transition-all">
                            Fechar Visualização
                        </button>
                    ) : (
                        <button type="submit" form="jobForm" className="bg-blue-600 text-white px-8 py-3 rounded-xl font-black uppercase text-xs tracking-widest hover:scale-105 transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)]">
                            {editingJobId ? 'Salvar Edições' : 'Criar Job Manual'}
                        </button>
                    )}
                </div>
            </div>
        </div>
      )}
    </div>
  );
}