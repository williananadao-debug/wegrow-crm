"use client";
import { useState, useEffect, useCallback, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { Plus, X, Loader2, Clock, Scale, User, Tag, Flame, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import AdvocaciaTopNav from '../AdvocaciaTopNav';
import DocumentosPanel from '../DocumentosPanel';
import AndamentosProcessuais from '../AndamentosProcessuais';
import PrazosProcessuais from '../PrazosProcessuais';
import {
  ADVOCACIA_STAGES, ADVOCACIA_STAGE_GANHO, ADVOCACIA_STAGE_PERDIDO,
  AREAS_JURIDICAS, TIPO_HONORARIO_LABELS, fmtMoeda, fmtData, diasDesde, DIAS_LEAD_ESFRIANDO,
} from '../shared';

type LeadAdvocacia = {
  id: number;
  empresa: string;
  valor_total: number;
  etapa: number;
  status: string;
  origem?: string | null;
  telefone?: string | null;
  cnpj?: string | null;
  endereco?: string | null;
  followup_em?: string | null;
  created_at: string;
  advocacia_area_juridica?: string | null;
  advocacia_advogado_id?: string | null;
};

type PerfilOpcao = { id: string; nome: string };

const STAGE_KEYS = Object.keys(ADVOCACIA_STAGES).map(Number).filter(k => k !== ADVOCACIA_STAGE_PERDIDO);

export default function AdvocaciaProcessosPage() {
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  const nomeEmpresa = empresa?.nome;

  const [leads, setLeads] = useState<LeadAdvocacia[]>([]);
  const [advogados, setAdvogados] = useState<PerfilOpcao[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<LeadAdvocacia | null>(null);
  const [salvando, setSalvando] = useState(false);

  const vazio = { empresa: '', valor_total: '', origem: '', telefone: '', advocacia_area_juridica: AREAS_JURIDICAS[0] as string, advocacia_advogado_id: '' };
  const [form, setForm] = useState(vazio);

  const carregar = useCallback(async () => {
    if (!perfil?.empresa_id) return;
    setLoading(true);
    const [{ data: leadsData }, { data: perfisData }] = await Promise.all([
      supabase.from('leads').select('id, empresa, valor_total, etapa, status, origem, telefone, cnpj, endereco, followup_em, created_at, advocacia_area_juridica, advocacia_advogado_id')
        .eq('empresa_id', perfil.empresa_id).order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, nome').eq('empresa_id', perfil.empresa_id),
    ]);
    setLeads((leadsData as LeadAdvocacia[]) || []);
    setAdvogados((perfisData as PerfilOpcao[]) || []);
    setLoading(false);
  }, [perfil?.empresa_id]);

  useEffect(() => { carregar(); }, [carregar]);

  const nomeAdvogado = (id?: string | null) => advogados.find(a => a.id === id)?.nome || '—';

  const leadsPorEtapa = useMemo(() => {
    const mapa: Record<number, LeadAdvocacia[]> = {};
    STAGE_KEYS.forEach(k => { mapa[k] = []; });
    mapa[ADVOCACIA_STAGE_PERDIDO] = [];
    leads.forEach(l => { (mapa[l.etapa] ||= []).push(l); });
    return mapa;
  }, [leads]);

  // Ao entrar em "Contrato fechado": garante um advocacia_processos (alimenta
  // Financeiro/Inteligência) E liga esse processo a um cliente de verdade da tabela
  // `clientes` (mesma usada em /customers) — busca por CNPJ/CPF, senão por nome exato,
  // senão cria um novo. Documentos já enviados no lead (intake) seguem pro cliente junto,
  // via backfill — não precisa duplicar arquivo nem criar join complicado depois.
  const garantirProcesso = async (lead: LeadAdvocacia) => {
    const { data: existente } = await supabase.from('advocacia_processos').select('id').eq('lead_id', lead.id).maybeSingle();
    if (existente || !perfil?.empresa_id) return;

    let clientId: number | null = null;
    const cnpjDigitos = (lead.cnpj || '').replace(/\D/g, '');
    if (cnpjDigitos) {
      const { data: porCnpj } = await supabase.from('clientes').select('id').eq('empresa_id', perfil.empresa_id).eq('cnpj', lead.cnpj).maybeSingle();
      clientId = porCnpj?.id || null;
    }
    if (!clientId) {
      const { data: porNome } = await supabase.from('clientes').select('id').eq('empresa_id', perfil.empresa_id).ilike('nome_empresa', lead.empresa).maybeSingle();
      clientId = porNome?.id || null;
    }
    if (!clientId) {
      const { data: novoCliente } = await supabase.from('clientes').insert([{
        empresa_id: perfil.empresa_id,
        nome_empresa: lead.empresa,
        telefone: lead.telefone || null,
        cnpj: lead.cnpj || null,
        endereco: lead.endereco || null,
        status: 'ativo',
      }]).select('id').single();
      clientId = novoCliente?.id || null;
    }

    await supabase.from('advocacia_processos').insert([{
      empresa_id: perfil.empresa_id,
      lead_id: lead.id,
      client_id: clientId,
      cliente_nome: lead.empresa,
      advogado_responsavel_id: lead.advocacia_advogado_id || null,
      area_juridica: lead.advocacia_area_juridica || 'Outro',
      tipo_honorario: 'fixo',
      honorario_fixo: lead.valor_total || 0,
      status: 'ativo',
    }]);

    if (clientId) {
      await supabase.from('advocacia_documentos').update({ client_id: clientId }).eq('lead_id', lead.id).is('client_id', null);
    }
  };

  const onDragEnd = useCallback(async (result: DropResult) => {
    const { destination, draggableId, source } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId) return;
    const novaEtapa = parseInt(destination.droppableId, 10);
    const leadId = parseInt(draggableId, 10);
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;
    const novoStatus = novaEtapa === ADVOCACIA_STAGE_GANHO ? 'ganho' : novaEtapa === ADVOCACIA_STAGE_PERDIDO ? 'perdido' : 'aberto';

    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, etapa: novaEtapa, status: novoStatus } : l));
    await supabase.from('leads').update({ etapa: novaEtapa, status: novoStatus }).eq('id', leadId);
    if (novaEtapa === ADVOCACIA_STAGE_GANHO) await garantirProcesso({ ...lead, etapa: novaEtapa });
  }, [leads, perfil?.empresa_id]);

  const abrirNovo = () => { setEditando(null); setForm(vazio); setModalAberto(true); };
  const abrirEdicao = (lead: LeadAdvocacia) => {
    setEditando(lead);
    setForm({
      empresa: lead.empresa, valor_total: String(lead.valor_total || ''), origem: lead.origem || '',
      telefone: lead.telefone || '', advocacia_area_juridica: lead.advocacia_area_juridica || AREAS_JURIDICAS[0],
      advocacia_advogado_id: lead.advocacia_advogado_id || '',
    });
    setModalAberto(true);
  };

  const salvar = async () => {
    if (!form.empresa.trim() || !perfil?.empresa_id) return;
    setSalvando(true);
    const payload = {
      empresa: form.empresa.trim(),
      valor_total: Number(form.valor_total) || 0,
      origem: form.origem.trim() || null,
      telefone: form.telefone.trim() || null,
      advocacia_area_juridica: form.advocacia_area_juridica,
      advocacia_advogado_id: form.advocacia_advogado_id || null,
    };
    if (editando) {
      await supabase.from('leads').update(payload).eq('id', editando.id);
    } else {
      await supabase.from('leads').insert([{ ...payload, empresa_id: perfil.empresa_id, etapa: 0, status: 'aberto', tipo: 'advocacia', itens: [] }]);
    }
    setSalvando(false);
    setModalAberto(false);
    carregar();
  };

  const excluir = async () => {
    if (!editando) return;
    if (!confirm(`Excluir o processo de "${editando.empresa}"? Essa ação não pode ser desfeita.`)) return;
    await supabase.from('leads').delete().eq('id', editando.id);
    setModalAberto(false);
    carregar();
  };

  return (
    <div>
      <AdvocaciaTopNav nomeEmpresa={nomeEmpresa} />
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[22px] font-bold text-[#241c14]" style={{ fontFamily: 'var(--font-advocacia-serif)' }}>Funil de processos</h1>
            <p className="text-[13px] text-[#6b6862] mt-1">Leads jurídicos, do primeiro contato ao contrato fechado.</p>
          </div>
          <button onClick={abrirNovo} className="flex items-center gap-2 bg-[#241c14] hover:bg-[#3a2c1c] text-white px-4 py-2.5 rounded-lg text-[14px] font-semibold transition-all">
            <Plus size={16} /> Novo lead
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-[#d9861c]" /></div>
        ) : (
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {STAGE_KEYS.map(stage => (
                <Droppable key={stage} droppableId={String(stage)}>
                  {(provided, snapshot) => (
                    <div ref={provided.innerRef} {...provided.droppableProps}
                      className={`bg-white border rounded-2xl p-3 min-h-[240px] transition-colors ${snapshot.isDraggingOver ? 'border-[#d9861c] bg-[#fdf0d4]/30' : 'border-[#e5e0d5]'}`}>
                      <div className="flex items-center justify-between px-1 mb-3">
                        <p className="text-[12px] font-bold uppercase tracking-wide text-[#6b6862]">{ADVOCACIA_STAGES[stage]}</p>
                        <span className="text-[11px] font-mono text-[#9a958a]">{leadsPorEtapa[stage]?.length || 0}</span>
                      </div>
                      <div className="space-y-2">
                        {(leadsPorEtapa[stage] || []).map((lead, index) => {
                          const dias = diasDesde(lead.followup_em);
                          const esfriando = dias !== null && dias >= DIAS_LEAD_ESFRIANDO && stage !== ADVOCACIA_STAGE_GANHO;
                          return (
                            <Draggable key={lead.id} draggableId={String(lead.id)} index={index}>
                              {(dragProvided, dragSnapshot) => (
                                <div ref={dragProvided.innerRef} {...dragProvided.draggableProps} {...dragProvided.dragHandleProps}
                                  onClick={() => abrirEdicao(lead)}
                                  className={`bg-white border rounded-xl p-3 cursor-pointer transition-shadow ${dragSnapshot.isDragging ? 'shadow-lg border-[#d9861c]' : 'border-[#e5e0d5] hover:border-[#d9861c]/50'}`}>
                                  <p className="text-[13.5px] font-semibold text-[#241c14] truncate">{lead.empresa}</p>
                                  <p className="text-[13px] font-mono text-[#d9861c] font-bold mt-0.5">{fmtMoeda(lead.valor_total)}</p>
                                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                    {lead.advocacia_area_juridica && (
                                      <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#e8f0fd] text-[#1d6fd9]">
                                        <Tag size={9} /> {lead.advocacia_area_juridica}
                                      </span>
                                    )}
                                    {esfriando && (
                                      <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#fce8e8] text-[#d63f3f]">
                                        <Flame size={9} /> Esfriando
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 mt-2 text-[11px] text-[#9a958a]">
                                    <User size={10} /> {nomeAdvogado(lead.advocacia_advogado_id)}
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}
                      </div>
                    </div>
                  )}
                </Droppable>
              ))}
            </div>
          </DragDropContext>
        )}
      </div>

      {modalAberto && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setModalAberto(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[16px] font-bold text-[#241c14] flex items-center gap-2"><Scale size={16} className="text-[#d9861c]" /> {editando ? 'Editar lead' : 'Novo lead'}</h2>
              <button onClick={() => setModalAberto(false)} className="text-[#9a958a] hover:text-[#241c14]"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold uppercase text-[#9a958a]">Cliente</label>
                <input value={form.empresa} onChange={e => setForm(f => ({ ...f, empresa: e.target.value }))}
                  className="w-full mt-1 border border-[#e5e0d5] rounded-lg px-3 py-2 text-[14px] focus:outline-none focus:border-[#d9861c]" placeholder="Nome do cliente" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold uppercase text-[#9a958a]">Honorário estimado</label>
                  <input type="number" value={form.valor_total} onChange={e => setForm(f => ({ ...f, valor_total: e.target.value }))}
                    className="w-full mt-1 border border-[#e5e0d5] rounded-lg px-3 py-2 text-[14px] focus:outline-none focus:border-[#d9861c]" placeholder="0,00" />
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase text-[#9a958a]">Telefone</label>
                  <input value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))}
                    className="w-full mt-1 border border-[#e5e0d5] rounded-lg px-3 py-2 text-[14px] focus:outline-none focus:border-[#d9861c]" placeholder="(00) 00000-0000" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold uppercase text-[#9a958a]">Área jurídica</label>
                  <select value={form.advocacia_area_juridica} onChange={e => setForm(f => ({ ...f, advocacia_area_juridica: e.target.value }))}
                    className="w-full mt-1 border border-[#e5e0d5] rounded-lg px-3 py-2 text-[14px] focus:outline-none focus:border-[#d9861c] bg-white">
                    {AREAS_JURIDICAS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase text-[#9a958a]">Advogado responsável</label>
                  <select value={form.advocacia_advogado_id} onChange={e => setForm(f => ({ ...f, advocacia_advogado_id: e.target.value }))}
                    className="w-full mt-1 border border-[#e5e0d5] rounded-lg px-3 py-2 text-[14px] focus:outline-none focus:border-[#d9861c] bg-white">
                    <option value="">—</option>
                    {advogados.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase text-[#9a958a]">Origem</label>
                <input value={form.origem} onChange={e => setForm(f => ({ ...f, origem: e.target.value }))}
                  className="w-full mt-1 border border-[#e5e0d5] rounded-lg px-3 py-2 text-[14px] focus:outline-none focus:border-[#d9861c]" placeholder="Instagram, Google, Indicação..." />
              </div>
              {editando && (
                <div className="pt-3 border-t border-[#e5e0d5]">
                  <PrazosProcessuais leadId={editando.id} />
                </div>
              )}
              {editando && (
                <div className="pt-3 border-t border-[#e5e0d5]">
                  <AndamentosProcessuais leadId={editando.id} />
                </div>
              )}
              {editando && (
                <div className="pt-3 border-t border-[#e5e0d5]">
                  <DocumentosPanel leadId={editando.id} />
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 mt-5">
              {editando && (
                <button onClick={excluir} className="p-2.5 rounded-lg border border-[#f5c6c6] text-[#d63f3f] hover:bg-[#fce8e8]"><Trash2 size={16} /></button>
              )}
              <button onClick={salvar} disabled={salvando || !form.empresa.trim()}
                className="flex-1 bg-[#d9861c] hover:bg-[#c47818] disabled:opacity-50 text-white py-2.5 rounded-lg text-[14px] font-semibold transition-all flex items-center justify-center gap-2">
                {salvando ? <Loader2 size={16} className="animate-spin" /> : editando ? 'Salvar alterações' : 'Criar lead'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
