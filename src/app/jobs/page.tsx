"use client";
import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { 
  Clapperboard, Mic2, MonitorPlay, CheckCircle2, Clock, 
  Calendar, Plus, X, Trash2, Edit2
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
};

// Removemos a coluna 'entregue' para focar apenas na produção ativa
const STAGES = {
  roteiro: { title: 'Roteiro / Copy', icon: <Clapperboard size={14}/>, color: 'border-pink-500' },
  gravacao: { title: 'Locução / Gravação', icon: <Mic2 size={14}/>, color: 'border-purple-500' },
  edicao: { title: 'Edição / Motion', icon: <MonitorPlay size={14}/>, color: 'border-blue-500' },
  aprovacao: { title: 'Aprovação', icon: <Clock size={14}/>, color: 'border-yellow-500' }
};

export default function JobsPage() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  // Estados do Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingJobId, setEditingJobId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
      titulo: '',
      briefing: '',
      prioridade: 'media',
      deadline: new Date().toISOString().split('T')[0] // Hoje
  });

  // O useEffect agora depende do 'user' para garantir que temos o ID antes de buscar
  useEffect(() => {
    if (user) {
      fetchJobs();
    }
  }, [user]);

  const fetchJobs = async () => {
    if (!user) return;

    const { data } = await supabase
        .from('jobs')
        .select('*')
        .neq('stage', 'entregue') // Filtra para não trazer os finalizados
        .eq('user_id', user.id)   // FILTRO MESTRE: Traz apenas os Jobs do Vendedor Logado
        .order('deadline', { ascending: true });
        
    if (data) setJobs(data as any);
    setLoading(false);
  };

  const onDragEnd = async (result: any) => {
    const { destination, draggableId } = result;
    if (!destination) return;

    const newStage = destination.droppableId;
    const id = parseInt(draggableId);

    // Optimistic UI Update (Atualiza visualmente primeiro)
    setJobs(prev => prev.map(job => job.id === id ? { ...job, stage: newStage } : job));

    // Save to DB
    await supabase.from('jobs').update({ stage: newStage }).eq('id', id);
  };

  // --- CRUD (CRIAR, EDITAR, DELETAR, FINALIZAR) ---

  const handleFinalizar = async (e: React.MouseEvent, id: number) => {
      e.stopPropagation(); // Evita abrir o modal ao clicar no botão
      if(!confirm("Deseja finalizar este Job? Ele será removido da esteira.")) return;

      // Optimistic Update: Remove da tela na mesma hora
      setJobs(prev => prev.filter(j => j.id !== id));

      // Atualiza no banco para 'entregue'
      await supabase.from('jobs').update({ stage: 'entregue' }).eq('id', id);
  };

  const abrirModal = (job?: Job) => {
      if (job) {
          setEditingJobId(job.id);
          setFormData({
              titulo: job.titulo,
              briefing: job.briefing || '',
              prioridade: job.prioridade as any,
              deadline: job.deadline ? job.deadline.split('T')[0] : ''
          });
      } else {
          setEditingJobId(null);
          setFormData({ titulo: '', briefing: '', prioridade: 'media', deadline: new Date().toISOString().split('T')[0] });
      }
      setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!formData.titulo) return alert("Título obrigatório");

      const payload = {
          ...formData,
          user_id: user?.id,
          ...(editingJobId ? {} : { stage: 'roteiro' }) 
      };

      if (editingJobId) {
          const { error } = await supabase.from('jobs').update(payload).eq('id', editingJobId);
          if (!error) {
              setJobs(prev => prev.map(j => j.id === editingJobId ? { ...j, ...payload } as Job : j));
          }
      } else {
          const { data, error } = await supabase.from('jobs').insert([payload]).select();
          if (!error && data) {
              setJobs(prev => [data[0], ...prev]);
          }
      }
      setIsModalOpen(false);
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
      e.stopPropagation(); 
      if(!confirm("Tem certeza que deseja excluir este Job?")) return;
      
      const { error } = await supabase.from('jobs').delete().eq('id', id);
      if(!error) setJobs(prev => prev.filter(j => j.id !== id));
  };

  const getPriorityColor = (p: string) => {
    if (p === 'alta') return 'bg-red-500 text-white border-red-500';
    if (p === 'media') return 'bg-yellow-500 text-[#0F172A] border-yellow-500';
    return 'bg-blue-500 text-white border-blue-500';
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-[#0B1120] text-white font-black animate-pulse">CARREGANDO PRODUÇÃO...</div>;

  return (
    <div className="h-full flex flex-col pb-20 animate-in fade-in duration-500 text-white">
      {/* HEADER */}
      <div className="p-6 flex justify-between items-end">
        <div>
            <h1 className="text-3xl font-black uppercase italic tracking-tighter">Produção</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-[0.2em] mt-1">Sua Esteira de Jobs</p>
        </div>
        <div className="flex items-center gap-4">
            <div className="text-right hidden md:block">
                <span className="text-xs font-bold text-slate-400 uppercase">Seus Ativos</span>
                <p className="text-2xl font-black text-white leading-none">{jobs.length}</p>
            </div>
            <button onClick={() => abrirModal()} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2 shadow-lg transition-all">
                <Plus size={18} /> Novo Job
            </button>
        </div>
      </div>

      {/* KANBAN */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-4 p-6 h-[calc(100vh-180px)] overflow-x-auto items-start custom-scrollbar">
          {Object.entries(STAGES).map(([key, stage]) => {
            const stageJobs = jobs.filter(j => j.stage === key);
            
            return (
              <Droppable key={key} droppableId={key}>
                {(provided) => (
                  <div 
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`bg-[#0B1120] border-t-4 ${stage.color} border-x border-b border-white/5 rounded-2xl p-3 h-full flex flex-col min-w-[280px] md:flex-1`}
                  >
                    <div className="flex items-center gap-2 mb-4 px-1 pt-1">
                        <div className={`p-1.5 rounded-lg bg-white/5 text-slate-300`}>{stage.icon}</div>
                        <h3 className="font-black uppercase text-xs tracking-wide flex-1">{stage.title}</h3>
                        <span className="text-slate-600 text-[9px] font-bold bg-white/5 px-2 py-0.5 rounded-full">{stageJobs.length}</span>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pb-10">
                      {stageJobs.map((job, index) => (
                        <Draggable key={job.id} draggableId={job.id.toString()} index={index}>
                          {(prov, snap) => (
                            <div
                              ref={prov.innerRef}
                              {...prov.draggableProps}
                              {...prov.dragHandleProps}
                              className={`bg-white/[0.03] p-4 rounded-xl border border-white/5 group hover:border-white/20 transition-all cursor-grab active:cursor-grabbing relative ${snap.isDragging ? 'rotate-2 shadow-2xl bg-[#0F172A] z-50' : ''}`}
                              onClick={() => abrirModal(job)} 
                            >
                              <div className="flex justify-between items-start mb-2">
                                  <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded border ${getPriorityColor(job.prioridade)}`}>
                                      {job.prioridade}
                                  </span>
                                  <div className="flex gap-2">
                                      {job.deadline && (
                                          <div className={`flex items-center gap-1 text-[9px] font-mono font-bold ${new Date(job.deadline) < new Date() && job.stage !== 'entregue' ? 'text-red-500' : 'text-slate-400'}`}>
                                              <Calendar size={10}/>
                                              {new Date(job.deadline).toLocaleDateString('pt-BR').slice(0,5)}
                                          </div>
                                      )}
                                      <button onClick={(e) => handleDelete(e, job.id)} className="text-slate-600 hover:text-red-500 transition-colors"><Trash2 size={12}/></button>
                                  </div>
                              </div>
                              
                              <h4 className="font-bold text-sm text-white mb-2 leading-tight">{job.titulo}</h4>
                              
                              {job.briefing && (
                                <p className="text-[10px] text-slate-400 line-clamp-2 mb-3 bg-black/20 p-2 rounded-lg border border-white/5 font-medium">
                                    {job.briefing}
                                </p>
                              )}

                              <div className="flex items-center justify-between border-t border-white/5 pt-2 mt-1 mb-2">
                                  <div className="flex items-center gap-1 text-[9px] text-slate-600 font-mono">
                                      <Clock size={10}/>
                                      <span>ID: {job.id}</span>
                                  </div>
                                  <div className="p-1 bg-white/5 rounded-full text-slate-500 group-hover:text-white transition-colors">
                                      <Edit2 size={10}/>
                                  </div>
                              </div>

                              {/* BOTÃO MÁGICO FINALIZAR (Aparece no hover) */}
                              <button 
                                  onClick={(e) => handleFinalizar(e, job.id)}
                                  className="w-full mt-2 bg-[#22C55E]/10 hover:bg-[#22C55E] text-[#22C55E] hover:text-[#0F172A] py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all opacity-0 group-hover:opacity-100"
                              >
                                  <CheckCircle2 size={14} /> Finalizar Job
                              </button>

                            </div>
                          )}
                        </Draggable>
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

      {/* MODAL DE CRIAÇÃO/EDIÇÃO */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
            <div className="bg-[#0B1120] border border-white/10 w-full max-w-lg rounded-[32px] shadow-2xl relative flex flex-col animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center p-6 border-b border-white/10">
                    <h2 className="text-xl font-black uppercase italic tracking-tighter text-white">{editingJobId ? 'Editar Job' : 'Novo Job'}</h2>
                    <button onClick={() => setIsModalOpen(false)} className="bg-white/5 p-2 rounded-full hover:bg-white/10 transition-colors"><X className="text-slate-500 hover:text-white" size={20}/></button>
                </div>
                
                <form onSubmit={handleSave} className="p-6 space-y-4">
                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Título do Job</label>
                        <input className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-blue-500 transition-colors" placeholder="Ex: Vídeo Institucional" value={formData.titulo} onChange={e => setFormData({...formData, titulo: e.target.value})} autoFocus required />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Prioridade</label>
                            <select className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-blue-500 appearance-none cursor-pointer" value={formData.prioridade} onChange={e => setFormData({...formData, prioridade: e.target.value as any})}>
                                <option value="baixa" className="bg-[#0B1120]">Baixa</option>
                                <option value="media" className="bg-[#0B1120]">Média</option>
                                <option value="alta" className="bg-[#0B1120]">Alta</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Deadline</label>
                            <input type="date" className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-blue-500" value={formData.deadline} onChange={e => setFormData({...formData, deadline: e.target.value})} />
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Briefing / Detalhes</label>
                        <textarea className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-medium outline-none focus:border-blue-500 min-h-[100px] resize-none" placeholder="Descreva o que precisa ser feito..." value={formData.briefing} onChange={e => setFormData({...formData, briefing: e.target.value})} />
                    </div>

                    <button type="submit" className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black uppercase text-xs tracking-widest hover:scale-[1.02] transition-all shadow-lg mt-2">
                        {editingJobId ? 'Salvar Alterações' : 'Criar Job'}
                    </button>
                </form>
            </div>
        </div>
      )}
    </div>
  );
}