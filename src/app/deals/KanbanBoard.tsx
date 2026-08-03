"use client";
import React, { useMemo } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import {
  MessageCircle, MapPin, MapPinOff, User, Edit2,
  Sparkles, Crosshair, CalendarDays, AlertTriangle,
  Building2, FileText, Hash, CheckCircle2, RefreshCcw,
  Info, Lock, Target, Clock, Mail, PenLine, X,
} from 'lucide-react';

type ItemVenda = { servico: string; quantidade: number; precoUnitario: number; tempo?: string; programa?: string; };
type Historico = { id: number; texto: string; created_at: string; };
type Atividade = { id: number; tipo: 'etapa' | 'nota' | 'followup'; descricao: string; created_at: string; };

type Lead = {
  id: number;
  empresa: string;
  valor_total: number;
  desconto?: number;
  itens: ItemVenda[];
  etapa: number;
  status: string;
  tipo: string;
  created_at: string;
  telefone?: string;
  checkin?: string;
  localizacao_url?: string;
  foto_url?: string;
  user_id?: string;
  empresa_id?: string;
  filial_id?: number;
  client_id?: number;
  contrato_inicio?: string;
  contrato_fim?: string;
  origem?: string;
  unidade?: string;
  cidade?: string;
  descricao?: string;
  notas?: Historico[];
  followup_em?: string;
  status_aprovacao?: string | null;
  cnpj?: string;
  atividades?: Atividade[];
  docuseal_submission_id?: string;
  docuseal_sign_url?: string;
  docuseal_assinado?: boolean;
  contrato_manual_url?: string;
};

const formatId = (id: number, prefix: string) => `${prefix}-${String(id).padStart(4, '0')}`;

const formatarData = (dataIso: string) => {
  if (!dataIso) return '';
  const parts = dataIso.split('T')[0].split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return new Date(dataIso).toLocaleDateString('pt-BR');
};

const LeadCard = React.memo(({
  lead, index, isDirector, isLideranca, usersMap, clientesMap,
  abrirModal, enviarWhatsapp, fazerCheckin, mudarEtapa, imprimirContrato, abrirEmailModal, isCDL
}: any) => {
  const isPhantom = lead.id > 1000000;

  const daysLeft = useMemo(() => {
    if (!lead.contrato_fim) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const end = new Date(lead.contrato_fim + 'T00:00:00');
    return Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }, [lead.contrato_fim]);

  const clienteVinculado = lead.client_id ? clientesMap[lead.client_id] : null;
  const risco = clienteVinculado?.risco?.toLowerCase() || 'verde';
  const corRisco = risco === 'vermelho' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]' :
    risco === 'amarelo' ? 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.8)]' :
      'bg-[#22C55E] shadow-[0_0_8px_rgba(34,197,94,0.8)]';

  const diasParado = useMemo(() => {
    if (lead.status !== 'aberto') return null;
    const criado = new Date(lead.created_at);
    return Math.floor((Date.now() - criado.getTime()) / 86400000);
  }, [lead.created_at, lead.status]);

  return (
    <Draggable draggableId={lead.id.toString()} index={index}>
      {(provided: any, snapshot: any) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          style={provided.draggableProps.style}
          className={`bg-white/[0.03] p-3 rounded-xl border border-white/5 group hover:border-[#22C55E]/50 transition-all relative ${snapshot.isDragging ? 'rotate-2 scale-105 shadow-2xl bg-[#0F172A] z-50' : ''}`}
        >
          <div {...provided.dragHandleProps} className="absolute top-2 right-2 p-1 opacity-30 hover:opacity-70 cursor-grab active:cursor-grabbing touch-none" style={{ touchAction: 'none' }}>
            <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" className="text-slate-400"><circle cx="2" cy="2" r="1.5" /><circle cx="8" cy="2" r="1.5" /><circle cx="2" cy="7" r="1.5" /><circle cx="8" cy="7" r="1.5" /><circle cx="2" cy="12" r="1.5" /><circle cx="8" cy="12" r="1.5" /></svg>
          </div>
          {lead.tipo === 'visita' && (
            <div className="bg-blue-500/20 border border-blue-500/40 p-1.5 rounded-lg mb-2 flex items-center gap-1 text-blue-400">
              <MapPin size={12} />
              <span className="text-[9px] font-black uppercase tracking-widest">Visita Registrada</span>
            </div>
          )}

          {!lead.user_id && isDirector && (
            <div className="bg-yellow-500/20 border border-yellow-500/40 p-1.5 rounded-lg mb-2 flex items-center gap-1 text-yellow-400">
              <Sparkles size={12} />
              <span className="text-[9px] font-black uppercase tracking-widest animate-pulse">LEAD DO PORTAL (ATRIBUIR)</span>
            </div>
          )}

          {lead.status_aprovacao === 'pendente' && (
            <div className="bg-orange-500/20 border border-orange-500/40 p-1.5 rounded-lg mb-2 flex items-center gap-1 text-orange-400">
              <Lock size={12} />
              <span className="text-[9px] font-black uppercase tracking-widest animate-pulse">Aprovação Pendente</span>
            </div>
          )}
          {lead.status_aprovacao === 'recusado' && (
            <div className="bg-red-500/20 border border-red-500/40 p-1.5 rounded-lg mb-2 flex items-center gap-1 text-red-400">
              <X size={12} />
              <span className="text-[9px] font-black uppercase tracking-widest">Desconto Recusado</span>
            </div>
          )}

          <div className="flex justify-between items-start mb-1">
            <div className="flex items-center gap-2">
              <div className="cursor-pointer bg-white/5 hover:bg-white/10 px-1.5 py-0.5 rounded transition-colors" onClick={() => abrirModal(lead)}>
                <Edit2 size={10} className="text-slate-500" />
              </div>
              {isPhantom ? (
                <span className="text-[8px] font-black text-yellow-500 bg-yellow-500/10 border border-yellow-500/20 px-1.5 py-0.5 rounded tracking-widest flex items-center gap-0.5 animate-pulse">
                  <RefreshCcw size={8} /> OFFLINE
                </span>
              ) : (
                <span className="text-[9px] font-black text-slate-400 bg-white/5 px-1.5 py-0.5 rounded tracking-widest flex items-center gap-0.5">
                  <Hash size={8} />LD-{String(lead.id).padStart(4, '0')}
                </span>
              )}
            </div>

            <div className="flex flex-row gap-2">
              <button onClick={(e) => enviarWhatsapp(e, lead)} className="bg-white/5 md:bg-transparent p-2 md:p-0 rounded-lg md:rounded-none text-[#22C55E] hover:text-white hover:bg-[#22C55E]/20 transition-all" title="Enviar WhatsApp">
                <MessageCircle size={18} className="md:w-[14px] md:h-[14px]" />
              </button>
              <button onClick={(e) => { e.stopPropagation(); abrirEmailModal(lead); }} className="bg-white/5 md:bg-transparent p-2 md:p-0 rounded-lg md:rounded-none text-sky-400 hover:text-white hover:bg-sky-600/20 transition-all" title="Enviar Proposta por E-mail">
                <Mail size={18} className="md:w-[14px] md:h-[14px]" />
              </button>
              <button onClick={(e) => fazerCheckin(lead.id, e)} className="bg-white/5 md:bg-transparent p-2 md:p-0 rounded-lg md:rounded-none text-blue-400 hover:text-white hover:bg-blue-600/20 transition-all" title="Registrar Visita">
                <MapPin size={18} className="md:w-[14px] md:h-[14px]" />
              </button>
            </div>
          </div>

          {(() => {
            const isIA = lead.origem?.includes('IA') || lead.origem?.includes('Inteligência') || lead.descricao?.includes('IA Sugere');
            const isManual = lead.origem?.includes('Manual') || lead.origem === 'Estratégia';
            const isPortal = !isIA && !isManual && (lead.origem === 'Portal Web' || lead.descricao);

            if (!isIA && !isManual && !isPortal) return null;

            let badgeConfig = {
              color: 'text-blue-400',
              bg: 'bg-blue-500/10 border-blue-500/20',
              icon: <Info size={10} className="text-blue-400" />,
              label: 'Veio do Portal'
            };

            if (isIA) {
              badgeConfig = {
                color: 'text-purple-400',
                bg: 'bg-purple-600/10 border-purple-500/20',
                icon: <Sparkles size={10} className="text-purple-400" />,
                label: 'Veio pela IA'
              };
            } else if (isManual) {
              badgeConfig = {
                color: 'text-[#22C55E]',
                bg: 'bg-[#22C55E]/10 border-[#22C55E]/20',
                icon: <Target size={10} className="text-[#22C55E]" />,
                label: 'Estratégia Manual'
              };
            }

            return (
              <div className={`border p-2 rounded-lg mt-2 mb-2 ${badgeConfig.bg}`}>
                <div className="flex items-center gap-1 mb-1">
                  {badgeConfig.icon}
                  <span className={`text-[8px] font-black uppercase tracking-widest ${badgeConfig.color}`}>{badgeConfig.label}</span>
                </div>
                {lead.descricao && <p className="text-[10px] text-slate-300 italic line-clamp-3">"{lead.descricao}"</p>}
                {lead.cidade && <span className="mt-1 inline-block text-[8px] font-bold text-slate-400 uppercase">📍 Cidade: {lead.cidade}</span>}
              </div>
            );
          })()}

          <div className="mb-2 mt-2">
            {lead.checkin && lead.checkin.includes('Meta') ? (
              <div className="bg-purple-600/20 border border-purple-500/30 p-1.5 rounded-lg flex items-center gap-2 mb-1">
                <Crosshair size={12} className="text-purple-400" />
                <span className="text-[9px] font-bold text-purple-200 uppercase truncate">{lead.checkin}</span>
              </div>
            ) : lead.checkin ? (
              <div className="flex items-center gap-1 mb-1">
                <MapPin size={10} className="text-pink-500" />
                <span className="text-[9px] font-bold text-blue-400 uppercase truncate">Visitado {lead.checkin.split(',')[0]}</span>
              </div>
            ) : (
              lead.status === 'aberto' && <div className="flex items-center gap-1 mb-2"><MapPinOff size={10} className="text-red-500" /><span className="text-[9px] font-black text-red-500 uppercase">PENDENTE</span></div>
            )}
          </div>

          <div className="mb-1 flex items-center gap-2 flex-wrap">
            <h4 className="font-black text-sm uppercase leading-tight transition-colors max-w-full text-white group-hover:text-slate-200 flex items-center gap-2">
              {lead.client_id && (
                <div title={`Análise de Risco: ${risco.toUpperCase()}`} className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${corRisco}`}></div>
              )}
              <span className="truncate">{lead.empresa}</span>
            </h4>

            {!lead.client_id && (
              <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest flex items-center gap-1 animate-pulse">
                <Sparkles size={8} /> NOVO
              </span>
            )}

            {lead.unidade && (
              <span className="bg-white/5 text-slate-300 border border-white/10 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest flex items-center gap-1">
                <Building2 size={8} /> {lead.unidade}
              </span>
            )}

            {(lead.docuseal_assinado || lead.contrato_manual_url) && (
              <span className="bg-green-500/20 text-green-400 border border-green-500/30 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest flex items-center gap-1">
                <PenLine size={8} /> Contrato Assinado
              </span>
            )}
            {lead.docuseal_submission_id && !lead.docuseal_assinado && !lead.contrato_manual_url && (
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest flex items-center gap-1">
                <PenLine size={8} /> Ass. Enviada
              </span>
            )}
          </div>

          {isLideranca && (
            <div className="mb-2 mt-1 inline-flex items-center gap-1 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded text-[8px] font-black text-blue-400 uppercase tracking-widest">
              <User size={8} /> {lead.user_id && usersMap[lead.user_id] ? usersMap[lead.user_id] : 'Sem Dono'}
            </div>
          )}

          <div className="space-y-0.5 border-l border-white/10 pl-2 mb-2 mt-1">
            {Array.isArray(lead.itens) && lead.itens.slice(0, 2).map((item: any, i: number) => (
              <p key={i} className="text-[9px] text-slate-400 font-bold uppercase truncate">{item.quantidade}x {item.servico}</p>
            ))}
            {Array.isArray(lead.itens) && lead.itens.length > 2 && <p className="text-[9px] text-slate-500 italic">+{lead.itens.length - 2} items...</p>}
          </div>

          <div className="flex items-center gap-1 text-[#22C55E] font-black text-sm mb-2">
            R$ {(lead.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            {lead.desconto && lead.desconto > 0 ? <span className="text-[8px] text-red-400 ml-1 bg-red-500/10 px-1 py-0.5 rounded">COM DESCONTO</span> : null}
          </div>

          {lead.contrato_inicio && lead.contrato_fim && (
            <div className="mb-2 flex items-center gap-2 p-1.5 bg-white/[0.02] border border-white/5 rounded-lg">
              <CalendarDays size={12} className="text-slate-500" />
              <div className="flex flex-col">
                <span className="text-[8px] font-black uppercase text-slate-500">Contrato</span>
                <span className="text-[9px] text-slate-300 font-mono leading-none">
                  {formatarData(lead.contrato_inicio)} até {formatarData(lead.contrato_fim)}
                </span>
              </div>

              {daysLeft !== null && daysLeft <= 30 && daysLeft >= 0 && (
                <div className="ml-auto flex items-center gap-1 bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded text-[8px] font-black uppercase animate-pulse border border-red-500/30">
                  <AlertTriangle size={10} /> {daysLeft}D
                </div>
              )}
              {daysLeft !== null && daysLeft < 0 && (
                <div className="ml-auto flex items-center bg-red-500 text-white px-1.5 py-0.5 rounded text-[8px] font-black uppercase">
                  VENCIDO
                </div>
              )}
            </div>
          )}

          {lead.followup_em && (() => {
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const fu = new Date(lead.followup_em + 'T00:00:00');
            const diff = Math.ceil((fu.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            const isOverdue = diff < 0;
            const isToday = diff === 0;
            return (
              <div className={`mb-2 flex items-center gap-1 px-2 py-1 rounded-lg border text-[8px] font-black uppercase ${isOverdue ? 'bg-red-500/20 border-red-500/40 text-red-400 animate-pulse' : isToday ? 'bg-orange-500/20 border-orange-500/40 text-orange-400 animate-pulse' : 'bg-blue-500/10 border-blue-500/20 text-blue-400'}`}>
                <CalendarDays size={9} />
                {isOverdue ? `Follow-up atrasado ${Math.abs(diff)}d` : isToday ? 'Follow-up HOJE' : `Follow-up em ${diff}d`}
              </div>
            );
          })()}

          {diasParado !== null && diasParado >= 14 && (
            <div className={`mb-2 flex items-center gap-1 px-2 py-1 rounded-lg border text-[8px] font-black uppercase ${diasParado >= 30 ? 'bg-red-500/20 border-red-500/40 text-red-400 animate-pulse' : 'bg-orange-500/10 border-orange-500/30 text-orange-400'}`}>
              <Clock size={9} /> Parado há {diasParado} dias
            </div>
          )}

          {lead.status === 'aberto' ? (
            <div className="space-y-2 pt-1">
              <button onClick={() => mudarEtapa(lead.id, lead.etapa + 1, 'aberto', true)} className="w-full py-1.5 bg-white/5 text-slate-300 hover:bg-blue-600 hover:text-white rounded text-[9px] font-black uppercase tracking-wider transition-colors border border-white/5">
                AVANÇAR ETAPA
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => mudarEtapa(lead.id, 4, 'ganho')}
                  className={`py-1.5 rounded text-[9px] font-black uppercase tracking-wider transition-colors ${lead.status_aprovacao === 'pendente' ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-[#22C55E]/10 text-[#22C55E] hover:bg-[#22C55E] hover:text-[#0F172A]'}`}
                >
                  GANHO
                </button>
                <button onClick={() => mudarEtapa(lead.id, 5, 'perdido')} className="py-1.5 bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white rounded text-[9px] font-black uppercase tracking-wider transition-colors">PERDIDO</button>
              </div>
            </div>
          ) : lead.status === 'ganho' ? (
            <div className="mt-2 flex gap-2 pt-2 border-t border-white/5">
              <button onClick={(e) => imprimirContrato(e, lead)} className="flex-1 text-center inline-flex justify-center items-center gap-1 text-[8px] bg-purple-600/10 text-purple-400 px-2 py-1.5 rounded font-black uppercase hover:bg-purple-600 hover:text-white transition-all">
                <FileText size={10} /> {isCDL ? 'CADASTRO' : 'CONTRATO'}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </Draggable>
  );
});
LeadCard.displayName = 'LeadCard';

type KanbanBoardProps = {
  activeStages: Record<string, { title: string; color: string }>;
  onDragEnd: (result: any) => void;
  getLeadsByStage: (idx: number) => Lead[];
  getStageTotal: (idx: number) => number;
  isDirector: boolean;
  isLideranca: boolean;
  usersMap: Record<string, string>;
  clientesMap: Record<number, { risco?: string }>;
  abrirModal: (lead?: any) => void;
  enviarWhatsapp: (e: React.MouseEvent, lead: any) => void;
  fazerCheckin: (id: number, e?: React.MouseEvent) => void;
  mudarEtapa: (id: number, etapa: number, status: string, pedirProxima?: boolean) => void;
  imprimirContrato: (e: React.MouseEvent, lead: any) => void;
  abrirEmailModal: (lead: any) => void;
  isCDL: boolean;
};

export default function KanbanBoard({
  activeStages, onDragEnd, getLeadsByStage, getStageTotal,
  isDirector, isLideranca, usersMap, clientesMap,
  abrirModal, enviarWhatsapp, fazerCheckin, mudarEtapa,
  imprimirContrato, abrirEmailModal, isCDL,
}: KanbanBoardProps) {
  return (
    <DragDropContext onDragEnd={onDragEnd} enableDefaultSensors>
      <div className="flex gap-3 pb-2 flex-1 min-h-0 items-start overflow-x-auto md:snap-x md:snap-mandatory px-1 md:px-0" style={{ overflowY: 'hidden' }}>
        {Object.entries(activeStages).map(([key, stage]) => {
          const stageIdx = parseInt(key);
          const totalColuna = getStageTotal(stageIdx);
          const leadsDaColuna = getLeadsByStage(stageIdx);

          return (
            <Droppable key={key} droppableId={key}>
              {(provided: any) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`bg-[#0B1120] border-t-4 ${stage.color} border-x border-b border-white/5 rounded-2xl p-2 flex flex-col min-w-[85vw] md:min-w-[250px] md:flex-1 md:snap-center`}
                  style={{ height: 'calc(100dvh - 190px)' }}
                >
                  <div className="flex items-center justify-between mb-2 px-1 pt-1 pb-2 border-b border-white/5">
                    <div>
                      <h3 className="text-white font-black uppercase italic text-xs tracking-wide leading-none">{stage.title}</h3>
                      <span className="text-slate-500 text-[9px] font-bold">{leadsDaColuna.length} lead{leadsDaColuna.length !== 1 ? 's' : ''}</span>
                    </div>
                    {totalColuna > 0 && (
                      <span className="text-white font-black text-sm font-mono leading-none">
                        R$ {totalColuna.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })}
                      </span>
                    )}
                  </div>

                  <div className="space-y-2 flex-1 overflow-y-scroll custom-scrollbar pr-1 pb-10" style={{ overscrollBehavior: 'contain' }}>
                    {leadsDaColuna.map((lead, index) => {
                      if (!lead || !lead.id) return null;
                      return (
                        <LeadCard
                          key={lead.id}
                          lead={lead}
                          index={index}
                          isDirector={isDirector}
                          isLideranca={isLideranca}
                          usersMap={usersMap}
                          clientesMap={clientesMap}
                          abrirModal={abrirModal}
                          enviarWhatsapp={enviarWhatsapp}
                          fazerCheckin={fazerCheckin}
                          mudarEtapa={mudarEtapa}
                          imprimirContrato={imprimirContrato}
                          abrirEmailModal={abrirEmailModal}
                          isCDL={isCDL}
                        />
                      );
                    })}
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
