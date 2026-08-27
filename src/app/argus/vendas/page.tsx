"use client";
import { useState, useEffect, useCallback, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Loader2, Car, Search, Plus, X, Trash2, Tag } from 'lucide-react';
import ArgusTopNav from '../ArgusTopNav';
import { fmtMoeda } from '../shared';

type LeadVeiculo = {
  id: number;
  empresa: string;
  valor_total: number;
  status: string;
  etapa: number;
  veiculo_referencia: string | null;
  veiculo_placa: string | null;
  veiculo_fipe_valor: number | null;
  veiculo_valor_compra: number | null;
  veiculo_data_compra: string | null;
  veiculo_data_venda: string | null;
  vendedor_nome: string | null;
  cidade: string | null;
  telefone: string | null;
  created_at: string;
};

// Mesmo padrão de funil arrastável do Advocacia (ADVOCACIA_STAGES em
// src/app/advocacia/processos/page.tsx): colunas visíveis pra etapas "vivas" +
// "Ganho"; "Perdido" não vira coluna (deixaria o funil poluído de carro morto),
// fica só como ação dentro do card/modal — mesma escolha de lá.
const COLUNAS: { id: string; label: string }[] = [
  { id: '0', label: 'Novo' },
  { id: '1', label: 'Contato' },
  { id: '2', label: 'Proposta' },
  { id: '3', label: 'Negociação' },
  { id: 'ganho', label: 'Ganho' },
];

const FORM_VAZIO = {
  empresa: '', telefone: '', cidade: '', vendedor_nome: '',
  veiculo_referencia: '', veiculo_placa: '', valor_total: '',
  veiculo_fipe_valor: '', veiculo_valor_compra: '', veiculo_data_compra: '',
};

export default function ArgusVendasVeiculosPage() {
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const empresa = auth.empresa;

  const [leads, setLeads] = useState<LeadVeiculo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [verPerdidos, setVerPerdidos] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<LeadVeiculo | null>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(() => {
    if (!perfil?.empresa_id) return;
    setLoading(true);
    supabase.from('leads')
      .select('id, empresa, valor_total, status, etapa, veiculo_referencia, veiculo_placa, veiculo_fipe_valor, veiculo_valor_compra, veiculo_data_compra, veiculo_data_venda, vendedor_nome, cidade, telefone, created_at')
      .eq('empresa_id', perfil.empresa_id)
      .not('veiculo_placa', 'is', null)
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data }) => { setLeads((data as LeadVeiculo[]) || []); setLoading(false); });
  }, [perfil?.empresa_id]);

  useEffect(() => { carregar(); }, [carregar]);

  const filtrados = useMemo(() => leads.filter(l => {
    if (!busca.trim()) return true;
    const alvo = busca.toLowerCase();
    return l.empresa?.toLowerCase().includes(alvo) || l.veiculo_referencia?.toLowerCase().includes(alvo) ||
      l.veiculo_placa?.toLowerCase().includes(alvo) || l.vendedor_nome?.toLowerCase().includes(alvo);
  }), [leads, busca]);

  const leadsPorColuna = useMemo(() => {
    const mapa: Record<string, LeadVeiculo[]> = {};
    COLUNAS.forEach(c => { mapa[c.id] = []; });
    filtrados.forEach(l => {
      if (l.status === 'ganho') mapa.ganho.push(l);
      else if (l.status === 'aberto') (mapa[String(l.etapa)] ||= []).push(l);
    });
    return mapa;
  }, [filtrados]);

  const perdidos = useMemo(() => filtrados.filter(l => l.status === 'perdido'), [filtrados]);
  const valorGanho = leads.filter(l => l.status === 'ganho').reduce((acc, l) => acc + Number(l.valor_total || 0), 0);

  const onDragEnd = useCallback(async (result: DropResult) => {
    const { destination, draggableId, source } = result;
    if (!destination || destination.droppableId === source.droppableId) return;
    const leadId = parseInt(draggableId, 10);
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;
    const patch = destination.droppableId === 'ganho'
      ? { status: 'ganho', veiculo_data_venda: lead.veiculo_data_venda || new Date().toISOString().slice(0, 10) }
      : { status: 'aberto', etapa: Number(destination.droppableId) };
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, ...patch } : l));
    await supabase.from('leads').update(patch).eq('id', leadId);
  }, [leads]);

  const abrirNovo = () => { setEditando(null); setForm(FORM_VAZIO); setErro(''); setModalAberto(true); };
  const abrirEdicao = (lead: LeadVeiculo) => {
    setEditando(lead);
    setForm({
      empresa: lead.empresa, telefone: lead.telefone || '', cidade: lead.cidade || '',
      vendedor_nome: lead.vendedor_nome || '', veiculo_referencia: lead.veiculo_referencia || '',
      veiculo_placa: lead.veiculo_placa || '', valor_total: String(lead.valor_total || ''),
      veiculo_fipe_valor: lead.veiculo_fipe_valor != null ? String(lead.veiculo_fipe_valor) : '',
      veiculo_valor_compra: lead.veiculo_valor_compra != null ? String(lead.veiculo_valor_compra) : '',
      veiculo_data_compra: lead.veiculo_data_compra || '',
    });
    setErro('');
    setModalAberto(true);
  };

  const salvar = async () => {
    if (!perfil?.empresa_id) return;
    if (!form.empresa.trim() || !form.valor_total || !form.veiculo_placa.trim()) { setErro('Cliente, placa e valor são obrigatórios.'); return; }
    setSalvando(true);
    setErro('');
    const payload = {
      empresa: form.empresa.trim(),
      telefone: form.telefone.trim() || null,
      cidade: form.cidade.trim() || null,
      vendedor_nome: form.vendedor_nome.trim() || null,
      veiculo_referencia: form.veiculo_referencia.trim() || null,
      veiculo_placa: form.veiculo_placa.trim().toUpperCase(),
      valor_total: Number(form.valor_total),
      veiculo_fipe_valor: form.veiculo_fipe_valor ? Number(form.veiculo_fipe_valor) : null,
      veiculo_valor_compra: form.veiculo_valor_compra ? Number(form.veiculo_valor_compra) : null,
      veiculo_data_compra: form.veiculo_data_compra || null,
    };
    const { error } = editando
      ? await supabase.from('leads').update(payload).eq('id', editando.id)
      : await supabase.from('leads').insert([{ ...payload, empresa_id: perfil.empresa_id, status: 'aberto', etapa: 0 }]);
    setSalvando(false);
    if (error) { setErro(error.message); return; }
    setModalAberto(false);
    carregar();
  };

  const marcarPerdido = async () => {
    if (!editando) return;
    await supabase.from('leads').update({ status: 'perdido' }).eq('id', editando.id);
    setModalAberto(false);
    carregar();
  };

  const excluir = async () => {
    if (!editando) return;
    if (!confirm(`Excluir a venda de "${editando.empresa}"? Essa ação não pode ser desfeita.`)) return;
    await supabase.from('leads').delete().eq('id', editando.id);
    setModalAberto(false);
    carregar();
  };

  return (
    <div>
      <ArgusTopNav nomeEmpresa={empresa?.nome} />
      <main className="max-w-[1500px] mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#171717] flex items-center gap-2" style={{ fontFamily: 'var(--font-argus-serif)' }}>
              <Car size={22} className="text-[#171717]" /> Funil de vendas
            </h1>
            <p className="text-[13px] text-[#8a8a8a] mt-1">Do primeiro contato ao carro entregue.</p>
          </div>
          <button onClick={abrirNovo} className="flex items-center gap-2 bg-[#171717] hover:bg-black text-white px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest">
            <Plus size={14} /> Nova Venda
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex items-center bg-white border border-[#e0e0e0] rounded-xl px-3 py-2 gap-2 flex-1 min-w-[220px]">
            <Search size={14} className="text-[#8a8a8a]" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente, veículo, placa ou vendedor..." className="flex-1 outline-none text-sm text-[#171717] bg-transparent" />
          </div>
          <div className="bg-white border border-[#e0e0e0] rounded-xl px-4 py-2">
            <span className="text-[11px] font-bold text-[#8a8a8a] uppercase tracking-wide">Vendido: </span>
            <span className="text-sm font-bold text-[#171717]">{fmtMoeda(valorGanho)}</span>
          </div>
          <button onClick={() => setVerPerdidos(v => !v)} className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest border transition-all ${verPerdidos ? 'bg-red-600 text-white border-red-600' : 'bg-white text-red-600 border-red-200 hover:border-red-400'}`}>
            {perdidos.length} perdido(s)
          </button>
        </div>

        {loading ? (
          <div className="p-8 flex justify-center"><Loader2 size={22} className="animate-spin text-[#171717]" /></div>
        ) : verPerdidos ? (
          perdidos.length === 0 ? (
            <div className="bg-white border border-[#e0e0e0] rounded-2xl p-10 text-center">
              <p className="text-[#5c5c5c] font-semibold text-sm">Nenhuma venda perdida ainda.</p>
            </div>
          ) : (
            <div className="bg-white border border-[#e0e0e0] rounded-2xl overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e0e0e0] bg-[#f5f5f5]">
                    <th className="text-left px-4 py-3 text-[11px] font-bold text-[#8a8a8a] uppercase">Cliente</th>
                    <th className="text-left px-4 py-3 text-[11px] font-bold text-[#8a8a8a] uppercase">Veículo</th>
                    <th className="text-left px-4 py-3 text-[11px] font-bold text-[#8a8a8a] uppercase">Vendedor</th>
                    <th className="text-right px-4 py-3 text-[11px] font-bold text-[#8a8a8a] uppercase">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {perdidos.map(l => (
                    <tr key={l.id} onClick={() => abrirEdicao(l)} className="border-b border-[#f0f0f0] last:border-0 hover:bg-[#fafafa] cursor-pointer">
                      <td className="px-4 py-3 font-bold text-[#171717]">{l.empresa}</td>
                      <td className="px-4 py-3 text-[#5c5c5c]">{l.veiculo_referencia || '—'} · {l.veiculo_placa}</td>
                      <td className="px-4 py-3 text-[#5c5c5c]">{l.vendedor_nome || '—'}</td>
                      <td className="px-4 py-3 text-right font-bold text-[#171717]">{fmtMoeda(l.valor_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {COLUNAS.map(coluna => (
                <Droppable key={coluna.id} droppableId={coluna.id}>
                  {(provided, snapshot) => (
                    <div ref={provided.innerRef} {...provided.droppableProps}
                      className={`bg-white border rounded-2xl p-3 min-h-[280px] transition-colors ${snapshot.isDraggingOver ? 'border-[#171717] bg-[#f5f5f5]' : 'border-[#e0e0e0]'}`}>
                      <div className="flex items-center justify-between px-1 mb-3">
                        <p className={`text-[12px] font-bold uppercase tracking-wide ${coluna.id === 'ganho' ? 'text-[#1fa85a]' : 'text-[#8a8a8a]'}`}>{coluna.label}</p>
                        <span className="text-[11px] font-mono text-[#9a958a]">{leadsPorColuna[coluna.id]?.length || 0}</span>
                      </div>
                      <div className="space-y-2">
                        {(leadsPorColuna[coluna.id] || []).map((lead, index) => (
                          <Draggable key={lead.id} draggableId={String(lead.id)} index={index}>
                            {(dragProvided, dragSnapshot) => (
                              <div ref={dragProvided.innerRef} {...dragProvided.draggableProps} {...dragProvided.dragHandleProps}
                                onClick={() => abrirEdicao(lead)}
                                className={`bg-white border rounded-xl p-3 cursor-pointer transition-shadow ${dragSnapshot.isDragging ? 'shadow-lg border-[#171717]' : 'border-[#e0e0e0] hover:border-[#171717]/40'}`}>
                                <p className="text-[13.5px] font-semibold text-[#171717] truncate">{lead.empresa}</p>
                                <p className="text-[13px] font-mono text-[#171717] font-bold mt-0.5">{fmtMoeda(lead.valor_total)}</p>
                                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                  <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#e8f0fd] text-[#1d6fd9]">
                                    <Tag size={9} /> {lead.veiculo_referencia || lead.veiculo_placa}
                                  </span>
                                </div>
                                {lead.vendedor_nome && (
                                  <p className="text-[11px] text-[#9a958a] mt-2">{lead.vendedor_nome}</p>
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
              ))}
            </div>
          </DragDropContext>
        )}
      </main>

      {modalAberto && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setModalAberto(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e0e0e0]">
              <p className="text-lg font-bold text-[#171717]" style={{ fontFamily: 'var(--font-argus-serif)' }}>{editando ? 'Editar venda' : 'Nova Venda'}</p>
              <button onClick={() => setModalAberto(false)} className="text-[#8a8a8a] hover:text-[#171717]"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-bold text-[#8a8a8a] uppercase block mb-1">Cliente *</label>
                <input value={form.empresa} onChange={e => setForm({ ...form, empresa: e.target.value })} placeholder="Nome do cliente" className="w-full bg-[#f5f5f5] border border-[#e0e0e0] rounded-xl px-3 py-2.5 text-sm text-[#171717] outline-none focus:border-[#171717]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-[#8a8a8a] uppercase block mb-1">Telefone</label>
                  <input value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} className="w-full bg-[#f5f5f5] border border-[#e0e0e0] rounded-xl px-3 py-2.5 text-sm text-[#171717] outline-none focus:border-[#171717]" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[#8a8a8a] uppercase block mb-1">Cidade</label>
                  <input value={form.cidade} onChange={e => setForm({ ...form, cidade: e.target.value })} className="w-full bg-[#f5f5f5] border border-[#e0e0e0] rounded-xl px-3 py-2.5 text-sm text-[#171717] outline-none focus:border-[#171717]" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-[#8a8a8a] uppercase block mb-1">Vendedor</label>
                <input value={form.vendedor_nome} onChange={e => setForm({ ...form, vendedor_nome: e.target.value })} placeholder="Quem está atendendo" className="w-full bg-[#f5f5f5] border border-[#e0e0e0] rounded-xl px-3 py-2.5 text-sm text-[#171717] outline-none focus:border-[#171717]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-[#8a8a8a] uppercase block mb-1">Veículo</label>
                  <input value={form.veiculo_referencia} onChange={e => setForm({ ...form, veiculo_referencia: e.target.value })} placeholder="Ex: HB20 2022 Sense" className="w-full bg-[#f5f5f5] border border-[#e0e0e0] rounded-xl px-3 py-2.5 text-sm text-[#171717] outline-none focus:border-[#171717]" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[#8a8a8a] uppercase block mb-1">Placa *</label>
                  <input value={form.veiculo_placa} onChange={e => setForm({ ...form, veiculo_placa: e.target.value })} className="w-full bg-[#f5f5f5] border border-[#e0e0e0] rounded-xl px-3 py-2.5 text-sm text-[#171717] outline-none focus:border-[#171717] uppercase" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-[#8a8a8a] uppercase block mb-1">Valor da proposta *</label>
                <input type="number" value={form.valor_total} onChange={e => setForm({ ...form, valor_total: e.target.value })} placeholder="0,00" className="w-full bg-[#f5f5f5] border border-[#e0e0e0] rounded-xl px-3 py-2.5 text-sm text-[#171717] outline-none focus:border-[#171717]" />
              </div>
              <p className="text-[11px] font-bold text-[#8a8a8a] uppercase tracking-wide pt-2 border-t border-[#f0f0f0]">Dados de compra (opcional, alimenta a Gestão Financeira)</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-[#8a8a8a] uppercase block mb-1">FIPE</label>
                  <input type="number" value={form.veiculo_fipe_valor} onChange={e => setForm({ ...form, veiculo_fipe_valor: e.target.value })} className="w-full bg-[#f5f5f5] border border-[#e0e0e0] rounded-xl px-3 py-2.5 text-sm text-[#171717] outline-none focus:border-[#171717]" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[#8a8a8a] uppercase block mb-1">Valor de compra</label>
                  <input type="number" value={form.veiculo_valor_compra} onChange={e => setForm({ ...form, veiculo_valor_compra: e.target.value })} className="w-full bg-[#f5f5f5] border border-[#e0e0e0] rounded-xl px-3 py-2.5 text-sm text-[#171717] outline-none focus:border-[#171717]" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[#8a8a8a] uppercase block mb-1">Data de compra</label>
                  <input type="date" value={form.veiculo_data_compra} onChange={e => setForm({ ...form, veiculo_data_compra: e.target.value })} className="w-full bg-[#f5f5f5] border border-[#e0e0e0] rounded-xl px-3 py-2.5 text-sm text-[#171717] outline-none focus:border-[#171717]" />
                </div>
              </div>
              {erro && <p className="text-xs font-bold text-red-600">{erro}</p>}
            </div>
            <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-[#e0e0e0]">
              <div className="flex items-center gap-2">
                {editando && (
                  <>
                    <button onClick={excluir} className="p-2.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50"><Trash2 size={16} /></button>
                    {editando.status !== 'perdido' && (
                      <button onClick={marcarPerdido} className="px-3 py-2.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold uppercase tracking-wide">Marcar perdido</button>
                    )}
                  </>
                )}
              </div>
              <button onClick={salvar} disabled={salvando} className="flex items-center gap-2 bg-[#171717] hover:bg-black disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest">
                {salvando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} {editando ? 'Salvar' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
