"use client";
import React from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import {
  Clapperboard, Mic2, MonitorPlay, Radio, Archive,
  Clock, Hash, Edit2, Building2, User, Music, ShieldCheck, CalendarDays,
} from 'lucide-react';

type Job = {
  id: number; titulo: string; briefing: string; stage: string; prioridade: 'baixa' | 'media' | 'alta';
  deadline: string; created_at: string; user_id: string; empresa_id?: string; unidade?: string;
  vendedor_nome?: string; client_id?: number; cliente?: string; agencia?: string; num_pi?: string;
  data_inicio?: string; hora_inicio?: string; data_fim?: string; hora_fim?: string; itens_opec?: any;
  audio_url?: string;
};

const formatId = (id: number, prefix: string) => `${prefix}-${String(id).padStart(4, '0')}`;

const formatarData = (dataIso: string) => {
  if (!dataIso) return '';
  const parts = dataIso.split('T')[0].split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return new Date(dataIso).toLocaleDateString('pt-BR');
};

const getPriorityColor = (p: string) => {
  if (p === 'alta') return 'bg-red-500 text-white border-red-500';
  if (p === 'media') return 'bg-yellow-500 text-[#0F172A] border-yellow-500';
  return 'bg-blue-500 text-white border-blue-500';
};

const STAGES = {
  roteiro:  { title: 'Roteiro / Copy',      icon: <Clapperboard size={14}/>, color: 'border-pink-500' },
  gravacao: { title: 'Locução / Gravação',   icon: <Mic2 size={14}/>,         color: 'border-purple-500' },
  edicao:   { title: 'Edição / Motion',      icon: <MonitorPlay size={14}/>,  color: 'border-blue-500' },
  aprovacao:{ title: 'OPEC / No Ar',         icon: <Radio size={14}/>,        color: 'border-[#22C55E]' },
};

const JobCard = React.memo(({ job, index, filtroUnidade, isDirector, abrirModal, handleFinalizar, isOpec, isCDL }: any) => {
  const leadRef = job.briefing?.match(/LD-\d+/)?.[0] || '';
  const isFinalizado = job.stage === 'entregue';
  const deadlineDiff = job.deadline && !isFinalizado
    ? Math.ceil((new Date(job.deadline + 'T00:00:00').getTime() - new Date().setHours(0,0,0,0)) / 86400000)
    : null;
  const deadlineClass = deadlineDiff === null ? '' :
    deadlineDiff < 0 ? 'bg-red-500/20 text-red-400 animate-pulse border border-red-500/30' :
    deadlineDiff <= 2 ? 'bg-orange-500/20 text-orange-400 animate-pulse border border-orange-500/30' :
    'bg-white/5 text-slate-400';

  return (
    <Draggable draggableId={job.id.toString()} index={index} isDragDisabled={isOpec}>
      {(prov: any, snap: any) => (
        <div
          ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps}
          className={`bg-white/[0.03] p-4 rounded-xl border border-white/5 group hover:border-white/20 transition-all ${isOpec ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'} relative flex flex-col ${snap.isDragging ? 'rotate-2 shadow-2xl bg-[#0F172A] z-50' : ''} ${isFinalizado ? 'opacity-70 hover:opacity-100 grayscale hover:grayscale-0' : ''}`}
          onClick={() => abrirModal(job)}
        >
          <div className="flex justify-between items-start mb-2">
            <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded border ${getPriorityColor(job.prioridade)}`}>{job.prioridade}</span>
            <div className="flex gap-2 items-center">
              {leadRef && (<span className="text-[9px] font-black text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded tracking-widest flex items-center gap-0.5 border border-blue-500/20 shadow-sm"><Hash size={8}/> {leadRef}</span>)}
              {job.audio_url && (<span className="text-[8px] text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20 flex items-center gap-0.5"><Music size={8}/> ÁUDIO</span>)}
              {job.deadline && (<div className={`flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${deadlineClass}`}><Clock size={10}/> {deadlineDiff !== null && deadlineDiff <= 2 && deadlineDiff >= 0 ? `${deadlineDiff}D` : deadlineDiff !== null && deadlineDiff < 0 ? 'ATRASADO' : formatarData(job.deadline).slice(0,5)}</div>)}
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
              <div className="flex justify-between items-center text-[9px] font-mono text-slate-400 bg-white/5 px-2 py-1 rounded"><span className="text-[#22C55E] font-black">INÍCIO</span><span className="text-white">{formatarData(job.data_inicio)} {job.hora_inicio ? `às ${job.hora_inicio}` : ''}</span></div>
              <div className="flex justify-between items-center text-[9px] font-mono text-slate-400 bg-white/5 px-2 py-1 rounded"><span className="text-red-400 font-black">FIM</span><span className="text-white">{formatarData(job.data_fim)} {job.hora_fim ? `às ${job.hora_fim}` : ''}</span></div>
            </div>
          )}

          <div className="flex flex-wrap gap-1 mb-2 mt-auto">
            {filtroUnidade === 'Todas' && job.unidade && (<span className="text-[8px] bg-white/5 text-slate-400 px-1.5 py-0.5 rounded uppercase font-bold flex items-center gap-1"><Building2 size={8}/> {job.unidade}</span>)}
            {job.vendedor_nome && (<span className="text-[8px] bg-blue-600/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded uppercase font-black flex items-center gap-1"><User size={8}/> {isCDL ? 'CONS' : 'VEND'}: {job.vendedor_nome.split(' ')[0]}</span>)}
          </div>

          <div className="flex items-center justify-between border-t border-white/5 pt-2 mt-2">
            <div className="flex items-center gap-1 text-[9px] text-slate-500 font-mono font-bold tracking-widest bg-white/5 px-2 py-0.5 rounded"><Hash size={10}/> {formatId(job.id, 'JB')}</div>
            <div className="p-1 bg-white/5 rounded-full text-slate-500 group-hover:text-white transition-colors"><Edit2 size={10}/></div>
          </div>

          {!isFinalizado && !isOpec && (
            <button onClick={(e) => handleFinalizar(e, job.id)} className="w-full mt-2 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all opacity-0 group-hover:opacity-100 bg-[#22C55E]/10 text-[#22C55E] hover:bg-[#22C55E] hover:text-[#0F172A]">
              <ShieldCheck size={14}/> Finalizar e Liberar OPEC
            </button>
          )}
        </div>
      )}
    </Draggable>
  );
});
JobCard.displayName = 'JobCard';

type JobsKanbanProps = {
  jobs: Job[];
  onDragEnd: (result: any) => void;
  isOpec: boolean;
  isDirector: boolean;
  isCDL: boolean;
  filtroUnidade: string;
  filtroVendedor: string;
  mostrarFinalizados: boolean;
  abrirModal: (job: any) => void;
  handleFinalizar: (e: React.MouseEvent, id: number) => void;
};

export default function JobsKanban({
  jobs, onDragEnd, isOpec, isDirector, isCDL,
  filtroUnidade, filtroVendedor, mostrarFinalizados,
  abrirModal, handleFinalizar,
}: JobsKanbanProps) {
  const VISIBLE_STAGES: Record<string, { title: string; icon: React.ReactNode; color: string }> = mostrarFinalizados
    ? { ...STAGES, entregue: { title: 'Finalizados (OPEC)', icon: <Archive size={14}/>, color: 'border-slate-500' } }
    : STAGES;

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-3 pb-2 flex-1 min-h-0 items-start overflow-x-auto overflow-y-hidden snap-x snap-mandatory px-1 md:px-0 mt-2">
        {Object.entries(VISIBLE_STAGES).map(([key, stage]) => {
          const stageJobs = jobs.filter(j => j.stage === key);
          return (
            <Droppable key={key} droppableId={key} isDropDisabled={isOpec}>
              {(provided: any) => (
                <div
                  ref={provided.innerRef} {...provided.droppableProps}
                  className={`bg-[#0B1120] border-t-4 ${stage.color} border-x border-b border-white/5 rounded-2xl p-2 h-full flex flex-col min-w-[85vw] md:min-w-[280px] md:flex-1 snap-center`}
                >
                  <div className="flex items-center gap-2 mb-3 px-1 pt-1">
                    <div className="p-1.5 rounded-lg bg-white/5 text-slate-300">{stage.icon}</div>
                    <h3 className="font-black uppercase text-xs tracking-wide flex-1 truncate">{stage.title}</h3>
                    <span className="text-slate-600 text-[9px] font-bold bg-white/5 px-2 py-0.5 rounded-full">{stageJobs.length}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pb-10 pr-1">
                    {stageJobs.map((job, index) => (
                      <JobCard
                        key={job.id} job={job} index={index}
                        filtroUnidade={filtroUnidade} filtroVendedor={filtroVendedor}
                        isDirector={isDirector} abrirModal={abrirModal}
                        handleFinalizar={handleFinalizar} isOpec={isOpec} isCDL={isCDL}
                      />
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
  );
}
