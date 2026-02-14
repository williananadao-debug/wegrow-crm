"use client";
import React, { useState, useEffect, useRef } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { 
  Plus, X, Trash2, Radio, Zap, Mic2, MessageCircle, MapPin, 
  Upload, Target, MapPinOff, User, Briefcase, Printer, Edit2, Loader2 
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Toast } from '@/components/Toast';

// --- TIPOS ---
type ItemVenda = { servico: string; quantidade: number; precoUnitario: number; };
type Historico = { id: number; texto: string; created_at: string; }; 
type ServicoConfig = { id: number; nome: string; preco: number; tipo?: string };

interface Lead { 
  id: number; 
  empresa: string; 
  valor_total: number; 
  itens: ItemVenda[]; 
  etapa: number; 
  status: 'aberto' | 'ganho' | 'perdido'; 
  tipo: 'Agência' | 'Anunciante';
  created_at: string; 
  telefone?: string;
  checkin?: string;         
  localizacao_url?: string; 
  foto_url?: string;
  user_id?: string;    
  filial_id?: number;
  client_id?: number;
}

type ClienteOpcao = {
  id: number;
  nome_empresa: string;
  telefone: string; 
  cnpj?: string;
  email?: string;
};

const STAGES = {
  0: { title: 'Novo Lead', color: 'border-slate-500' },
  1: { title: 'Contato Feito', color: 'border-blue-500' },
  2: { title: 'Proposta', color: 'border-purple-500' },
  3: { title: 'Negociação', color: 'border-yellow-500' },
  4: { title: 'Ganhos', color: 'border-[#22C55E]' },
  5: { title: 'Perdidos', color: 'border-red-500' },
};

export default function DealsPage() {
  const { user, perfil } = useAuth();
  
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientesOpcoes, setClientesOpcoes] = useState<ClienteOpcao[]>([]);
  const [listaServicos, setListaServicos] = useState<ServicoConfig[]>([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLeadId, setEditingLeadId] = useState<number | null>(null);
  
  const [novaEmpresa, setNovaEmpresa] = useState('');
  const [novoTelefone, setNovoTelefone] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [tipoCliente, setTipoCliente] = useState<'Agência' | 'Anunciante'>('Anunciante');
  
  const [itensTemporarios, setItensTemporarios] = useState<ItemVenda[]>([]);
  const [servicoAtual, setServicoAtual] = useState('');
  const [qtdAtual, setQtdAtual] = useState(1);
  const [precoAtual, setPrecoAtual] = useState(0);
  
  const [fotoUrl, setFotoUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [historico, setHistorico] = useState<Historico[]>([]);
  const [novaNota, setNovaNota] = useState('');

  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const META_MENSAL = 100000;

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      setLoading(true);
      
      // Busca Leads
      const { data: leadsData } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
      if (leadsData) setLeads(leadsData);

      // Busca Clientes Ativos
      const { data: clientesData } = await supabase.from('clientes').select('id, nome_empresa, telefone, cnpj, email').eq('status', 'ativo').order('nome_empresa', { ascending: true });
      if (clientesData) setClientesOpcoes(clientesData as any);

      // Busca Tabela de Preços/Serviços
      const { data: servicosData } = await supabase.from('servicos').select('*').order('id', { ascending: true });
      if (servicosData) setListaServicos(servicosData);
      
      setLoading(false);
    };
    fetchData();
  }, [user]);

  const getIcone = (tipo: string | undefined) => {
      if(tipo === 'Zap') return <Zap size={14} className="text-yellow-400" />;
      if(tipo === 'Radio') return <Radio size={14} className="text-purple-400" />;
      return <Mic2 size={14} className="text-blue-400" />;
  };

  // --- FUNÇÃO CHECK-IN ROBUSTA PARA CELULAR ---
  const fazerCheckin = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!navigator.geolocation) return alert("Seu dispositivo não suporta GPS.");

    setToastMessage("📡 Localizando...");
    setShowToast(true);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const mapsUrl = `https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`;
        const now = new Date();
        const msg = `${now.getDate().toString().padStart(2,'0')}/${(now.getMonth()+1).toString().padStart(2,'0')} às ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
        
        const { error } = await supabase.from('leads').update({ checkin: msg, localizacao_url: mapsUrl }).eq('id', id);
        if (!error) {
           setLeads(prev => prev.map(l => l.id === id ? { ...l, checkin: msg, localizacao_url: mapsUrl } : l));
           setToastMessage("📍 Check-in Confirmado!");
           setShowToast(true);
        }
      },
      (err) => alert("Erro GPS: " + err.message),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const mudarEtapa = async (id: number, novaEtapa: number, novoStatus: 'ganho' | 'perdido' | 'aberto') => {
    const { error } = await supabase.from('leads').update({ etapa: novaEtapa, status: novoStatus }).eq('id', id);
    if (!error) {
        setLeads(prev => prev.map(l => l.id === id ? { ...l, etapa: novaEtapa, status: novoStatus } : l));
        if (novoStatus === 'ganho') {
            setToastMessage("🎉 Venda Ganha!");
            setShowToast(true);
        }
    }
  };

  const onDragEnd = async (result: any) => {
    const { destination, draggableId } = result;
    if (!destination) return;
    const novaEtapa = parseInt(destination.droppableId);
    let novoStatus: 'aberto' | 'ganho' | 'perdido' = 'aberto';
    if (novaEtapa === 4) novoStatus = 'ganho';
    if (novaEtapa === 5) novoStatus = 'perdido';
    await mudarEtapa(parseInt(draggableId), novaEtapa, novoStatus);
  };

  const enviarWhatsapp = (e: React.MouseEvent, lead: Lead) => {
    e.stopPropagation();
    if (!lead.telefone) return alert("WhatsApp não cadastrado!");
    const telefoneLimpo = lead.telefone.replace(/\D/g, '');
    const msg = `Olá *${lead.empresa}*! Segue o resumo da nossa proposta no valor de R$ ${lead.valor_total.toLocaleString('pt-BR')}.`;
    window.open(`https://wa.me/55${telefoneLimpo}?text=${msg}`, '_blank');
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
      e.stopPropagation();
      if(!confirm("Excluir permanentemente?")) return;
      const { error } = await supabase.from('leads').delete().eq('id', id);
      if (!error) {
        setLeads(prev => prev.filter(l => l.id !== id));
        setIsModalOpen(false);
      }
  };

  const salvarLead = async (e: React.FormEvent) => {
    e.preventDefault();
    const valorTotal = itensTemporarios.reduce((acc, item) => acc + (item.precoUnitario * item.quantidade), 0);
    const payload = {
        empresa: novaEmpresa,
        telefone: novoTelefone,
        valor_total: valorTotal,
        itens: itensTemporarios,
        foto_url: fotoUrl,
        user_id: user?.id,
        client_id: selectedClientId,
        ...(editingLeadId ? {} : { etapa: 0, status: 'aberto' })
    };

    if (editingLeadId) {
        await supabase.from('leads').update(payload).eq('id', editingLeadId);
        setLeads(prev => prev.map(l => l.id === editingLeadId ? { ...l, ...payload } as Lead : l));
    } else {
        const { data } = await supabase.from('leads').insert([payload]).select();
        if (data) setLeads(prev => [data[0], ...prev]);
    }
    setIsModalOpen(false);
  };

  const abrirModal = (lead?: Lead) => {
    if (lead) {
        setEditingLeadId(lead.id);
        setNovaEmpresa(lead.empresa);
        setNovoTelefone(lead.telefone || '');
        setItensTemporarios(lead.itens || []);
        setFotoUrl(lead.foto_url || '');
    } else {
        setEditingLeadId(null);
        setNovaEmpresa('');
        setNovoTelefone('');
        setItensTemporarios([]);
        setFotoUrl('');
    }
    setIsModalOpen(true);
  };

  const getLeadsByStage = (stageIdx: number) => leads.filter(l => l.etapa === stageIdx);

  return (
    <div className="h-full flex flex-col pb-20 md:pb-2 overflow-hidden">
      
      {/* HEADER */}
      <div className="flex justify-between items-end mb-4 px-4">
        <div>
          <h1 className="text-2xl font-black text-white uppercase italic tracking-tighter">Pipeline</h1>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Gestão de Vendas</p>
        </div>
        <button onClick={() => abrirModal()} className="bg-[#22C55E] text-[#0F172A] px-4 py-2 rounded-xl font-black text-xs uppercase flex items-center gap-2">
            <Plus size={16} strokeWidth={3} /> Gerar
        </button>
      </div>

      {/* KANBAN */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex-1 flex gap-3 overflow-x-auto px-4 pb-4 snap-x snap-mandatory h-full">
          {Object.entries(STAGES).map(([key, stage]) => {
            const stageIdx = parseInt(key);
            const leadsDaColuna = getLeadsByStage(stageIdx);

            return (
              <Droppable key={key} droppableId={key}>
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className={`bg-[#0B1120] border-t-4 ${stage.color} border-x border-b border-white/5 rounded-2xl p-2 min-w-[85vw] md:min-w-[280px] flex flex-col h-full snap-center`}>
                    <div className="flex justify-between items-center mb-3 px-1">
                      <h3 className="text-white font-black uppercase italic text-xs tracking-wide">{stage.title}</h3>
                      <span className="text-slate-500 text-[10px] font-bold bg-white/5 px-2 py-0.5 rounded-lg">{leadsDaColuna.length}</span>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1">
                      {leadsDaColuna.map((lead, index) => (
                        <Draggable key={lead.id} draggableId={lead.id.toString()} index={index}>
                          {(provided, snapshot) => (
                            <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} className={`bg-white/[0.03] p-4 rounded-2xl border border-white/5 group relative transition-all ${snapshot.isDragging ? 'rotate-2 shadow-2xl bg-slate-900' : ''}`}>
                              
                              <div className="flex justify-between items-start mb-2">
                                <button onClick={() => abrirModal(lead)} className="p-2 bg-white/5 rounded-lg text-slate-500 hover:text-white"><Edit2 size={14}/></button>
                                
                                {/* AÇÕES MOBILE: Vertical | DESKTOP: Horizontal */}
                                <div className="flex flex-col md:flex-row gap-2">
                                  <button onClick={(e) => enviarWhatsapp(e, lead)} className="bg-[#22C55E]/10 p-2.5 md:p-2 rounded-xl text-[#22C55E] hover:bg-[#22C55E] hover:text-white transition-all">
                                    <MessageCircle size={20} className="md:w-4 md:h-4" />
                                  </button>
                                  <button onClick={(e) => fazerCheckin(e, lead.id)} className="bg-blue-600/10 p-2.5 md:p-2 rounded-xl text-blue-400 hover:bg-blue-600 hover:text-white transition-all">
                                    <MapPin size={20} className="md:w-4 md:h-4" />
                                  </button>
                                </div>
                              </div>

                              <h4 className="text-white font-black text-sm uppercase leading-tight mb-1 truncate">{lead.empresa}</h4>
                              
                              <div className="text-[#22C55E] font-black text-sm mb-3">R$ {lead.valor_total.toLocaleString('pt-BR')}</div>

                              {lead.checkin && (
                                <div className="flex items-center gap-1 mb-3 text-[9px] font-bold text-blue-400 bg-blue-400/10 w-fit px-2 py-0.5 rounded-md uppercase">
                                  <MapPin size={10}/> Visitado {lead.checkin.split(' às')[0]}
                                </div>
                              )}

                              {lead.status === 'aberto' && (
                                <button onClick={() => mudarEtapa(lead.id, lead.etapa + 1, 'aberto')} className="w-full py-2.5 bg-white/5 text-slate-400 hover:text-white rounded-xl text-[10px] font-black uppercase border border-white/5 transition-all">
                                  Avançar
                                </button>
                              )}
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

      {/* MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[999] flex items-center justify-center p-0 md:p-4 animate-in fade-in duration-200">
           <div className="bg-[#0B1120] w-full h-full md:h-auto md:max-h-[90vh] md:max-w-xl md:rounded-[40px] flex flex-col relative border-white/10 md:border">
              
              <div className="flex justify-between items-center p-6 border-b border-white/10">
                  <h2 className="text-xl font-black uppercase italic text-white tracking-tighter">
                    {editingLeadId ? 'Editar Negócio' : 'Nova Oportunidade'}
                  </h2>
                  <div className="flex items-center gap-3">
                      {editingLeadId && (
                        <button onClick={(e) => handleDelete(e, editingLeadId)} className="p-2.5 bg-red-500/10 text-red-500 rounded-full hover:bg-red-500 hover:text-white transition-all">
                          <Trash2 size={20}/>
                        </button>
                      )}
                      <button onClick={() => setIsModalOpen(false)} className="p-2.5 bg-white/5 rounded-full text-slate-500 hover:text-white transition-colors"><X size={20}/></button>
                  </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                <form id="dealForm" onSubmit={salvarLead} className="space-y-6">
                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Empresa / Cliente</label>
                        <select className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-4 text-white text-sm font-bold outline-none focus:border-[#22C55E]" value={selectedClientId || ''} onChange={(e) => {
                                const id = Number(e.target.value);
                                const cli = clientesOpcoes.find(c => c.id === id);
                                if(cli) { setSelectedClientId(id); setNovaEmpresa(cli.nome_empresa); setNovoTelefone(cli.telefone || ''); }
                            }} required>
                            <option value="">Selecionar Cliente...</option>
                            {clientesOpcoes.map(c => <option key={c.id} value={c.id}>{c.nome_empresa}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-2">WhatsApp de Contato</label>
                        <input className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-4 text-white text-sm font-bold outline-none focus:border-[#22C55E]" value={novoTelefone} onChange={e => setNovoTelefone(e.target.value)} placeholder="(00) 00000-0000" />
                    </div>

                    {/* Lógica de Itens simplificada para o espaço */}
                    <div className="bg-white/5 p-4 rounded-3xl border border-white/5">
                        <p className="text-[10px] font-black uppercase text-slate-400 mb-4">Itens da Proposta</p>
                        {itensTemporarios.length === 0 ? (
                           <div className="text-center py-4 text-slate-600 text-xs italic">Nenhum item adicionado</div>
                        ) : (
                          itensTemporarios.map((item, i) => (
                            <div key={i} className="flex justify-between text-xs text-white border-b border-white/5 py-2">
                                <span>{item.quantidade}x {item.servico}</span>
                                <span className="font-bold">R$ {(item.precoUnitario * item.quantidade).toLocaleString()}</span>
                            </div>
                          ))
                        )}
                    </div>
                </form>
              </div>

              <div className="p-6 bg-[#0B1120] border-t border-white/10">
                  <button type="submit" form="dealForm" className="w-full bg-[#22C55E] text-[#0F172A] py-5 rounded-3xl font-black uppercase text-xs tracking-widest shadow-xl hover:scale-[1.02] transition-all">
                      {editingLeadId ? 'Salvar Alterações' : 'Confirmar e Gerar'}
                  </button>
              </div>
           </div>
        </div>
      )}

      <Toast message={toastMessage} isVisible={showToast} onClose={() => setShowToast(false)} />
    </div>
  );
}