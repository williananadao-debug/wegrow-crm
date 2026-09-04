"use client";
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  ArrowLeft, ShieldAlert, Loader2, RefreshCw, Target, X, Save,
  Plus, Trash2, MapPin, Radio, Phone, Calendar, User, AlertTriangle, Clock,
} from 'lucide-react';

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '').split(',').map(e => e.trim());

type Prospect = {
  id: string;
  nome: string;
  segmento: string | null;
  cidade: string | null;
  status: string;
  canal: string | null;
  faturamento_nota: string | null;
  fonte: string | null;
  estrategia: string | null;
  contato: string | null;
  whatsapp: string | null;
  notas: string | null;
  proxima_acao_em: string | null;
};

const STATUS_CFG: Record<string, { label: string; cor: string; dot: string }> = {
  bom_fit:      { label: 'Bom fit',      cor: 'text-blue-400 border-blue-500/30 bg-blue-500/10',       dot: 'bg-blue-400' },
  avancado:     { label: 'Avançado',     cor: 'text-amber-400 border-amber-500/30 bg-amber-500/10',    dot: 'bg-amber-400' },
  cliente:      { label: 'Cliente',      cor: 'text-[#22C55E] border-[#22C55E]/30 bg-[#22C55E]/10',    dot: 'bg-[#22C55E]' },
  porte_grande: { label: 'Porte grande', cor: 'text-rose-400 border-rose-500/30 bg-rose-500/10',       dot: 'bg-rose-400' },
  perdido:      { label: 'Perdido',      cor: 'text-slate-500 border-slate-500/30 bg-slate-500/10',    dot: 'bg-slate-500' },
};
// Ordem de funil — perdido fica sempre por último, é uma lateral e não uma etapa de avanço.
const COLUNAS = ['bom_fit', 'avancado', 'cliente', 'porte_grande', 'perdido'];

const CANAL_LABELS: Record<string, string> = { ialto: 'IAlto', nilton: 'Nilton', organico: 'Orgânico', indicacao: 'Indicação', direto: 'Direto' };

const VAZIO: Partial<Prospect> = { nome: '', segmento: '', cidade: '', status: 'bom_fit', canal: '', faturamento_nota: '', fonte: '', estrategia: '', contato: '', whatsapp: '', notas: '', proxima_acao_em: '' };

function diasAte(iso: string | null): number | null {
  if (!iso) return null;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(iso + 'T00:00:00');
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
}

function fmtDataCurta(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export default function ProspeccaoPage() {
  const { user, loading: authLoading } = useAuth();
  const isAdmin = ADMIN_EMAILS.includes(user?.email || '');

  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [semTabela, setSemTabela] = useState(false);
  const [token, setToken] = useState('');
  const [movendoId, setMovendoId] = useState<string | null>(null);

  const [editando, setEditando] = useState<Prospect | Partial<Prospect> | null>(null);
  const [criandoNovo, setCriandoNovo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) setToken(session.access_token);
    });
  }, [user]);

  useEffect(() => { if (token && isAdmin) carregar(); }, [token, isAdmin]);

  const carregar = async () => {
    setLoading(true);
    const res = await fetch('/api/admin/prospects', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const json = await res.json();
      setSemTabela(!!json.semTabela);
      setProspects(json.itens || []);
    }
    setLoading(false);
  };

  const abrirEdicao = (p: Prospect) => { setEditando(p); setCriandoNovo(false); setErro(null); };
  const abrirNovo = (statusInicial?: string) => { setEditando({ ...VAZIO, ...(statusInicial ? { status: statusInicial } : {}) }); setCriandoNovo(true); setErro(null); };

  const salvar = async () => {
    if (!editando) return;
    setSaving(true); setErro(null);
    const isNovo = criandoNovo;
    const url = '/api/admin/prospects';
    const method = isNovo ? 'POST' : 'PATCH';
    const body = isNovo ? editando : { id: (editando as Prospect).id, ...editando };
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) { const j = await res.json().catch(() => ({})); setErro(j.erro || 'Erro ao salvar.'); return; }
    setEditando(null); carregar();
  };

  const excluir = async (id: string) => {
    if (!confirm('Remover este prospect?')) return;
    await fetch(`/api/admin/prospects?id=${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setEditando(null); carregar();
  };

  // Move o card otimisticamente na UI e só depois confirma no servidor — arrastar
  // não pode esperar round-trip pra sentir responsivo, e se falhar reverte sozinho
  // no próximo carregar().
  const onDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    const novoStatus = destination.droppableId;

    setProspects(prev => prev.map(p => p.id === draggableId ? { ...p, status: novoStatus } : p));
    setMovendoId(draggableId);
    const res = await fetch('/api/admin/prospects', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: draggableId, status: novoStatus }),
    });
    setMovendoId(null);
    if (!res.ok) carregar(); // reverte pro estado real do servidor
  };

  const proximasAcoes = useMemo(() => {
    return prospects
      .map(p => ({ p, dias: diasAte(p.proxima_acao_em) }))
      .filter((x): x is { p: Prospect; dias: number } => x.dias !== null && x.dias <= 7 && x.p.status !== 'perdido' && x.p.status !== 'cliente')
      .sort((a, b) => a.dias - b.dias);
  }, [prospects]);

  if (authLoading) return null;
  if (!isAdmin) return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center">
      <div className="text-center"><ShieldAlert size={40} className="text-red-500 mx-auto mb-3"/><p className="text-red-400 font-black uppercase tracking-widest">Acesso restrito</p></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0B1120] text-white">
      <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-8">

        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors">
              <ArrowLeft size={16} className="text-slate-400"/>
            </Link>
            <div>
              <h1 className="text-2xl font-black uppercase italic tracking-tighter flex items-center gap-2">
                <Target size={22} className="text-[#22C55E]"/> Prospecção
              </h1>
              <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold">Pipeline interno da WeGrow · não é dado de cliente</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => abrirNovo()} className="flex items-center gap-1.5 bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E] px-3 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all">
              <Plus size={13}/> Novo
            </button>
            <button onClick={carregar} className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors">
              <RefreshCw size={16} className={`text-slate-400 ${loading ? 'animate-spin' : ''}`}/>
            </button>
          </div>
        </div>

        {semTabela && (
          <div className="bg-[#0F172A] border border-yellow-500/20 rounded-3xl p-8 mb-6">
            <p className="text-yellow-400 font-black text-sm uppercase tracking-widest mb-4">Rode a migração no Supabase</p>
            <p className="text-slate-400 text-xs mb-3">Execute <code className="text-[#22C55E] font-mono">supabase/migrations/20260815120000_wegrow_prospects.sql</code> no SQL Editor do Supabase Studio — cria a tabela e já semeia com as 25 empresas do mapa de prospecção.</p>
          </div>
        )}

        {/* Próximas ações — o que "controle de prospecção" mais precisa: o que fazer hoje/essa semana, sem caçar card por card */}
        {!semTabela && !loading && proximasAcoes.length > 0 && (
          <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-4 mb-6">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><Clock size={12}/> Próximas ações (7 dias)</p>
            <div className="flex flex-wrap gap-2">
              {proximasAcoes.map(({ p, dias }) => (
                <button key={p.id} onClick={() => abrirEdicao(p)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-bold transition-all hover:brightness-110 ${dias < 0 ? 'bg-red-500/10 border-red-500/30 text-red-400' : dias === 0 ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-white/5 border-white/10 text-slate-300'}`}>
                  {dias < 0 && <AlertTriangle size={11}/>}
                  {p.nome}
                  <span className="opacity-70">{dias < 0 ? `${Math.abs(dias)}d atrasado` : dias === 0 ? 'hoje' : `em ${dias}d`}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-slate-600"/></div>
        ) : semTabela ? null : (
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex gap-3 overflow-x-auto pb-4">
              {COLUNAS.map(status => {
                const cfg = STATUS_CFG[status];
                const itens = prospects.filter(p => p.status === status);
                return (
                  <div key={status} className="w-[280px] shrink-0 flex flex-col">
                    <div className="flex items-center justify-between mb-2 px-1">
                      <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-slate-300">
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}/> {cfg.label}
                      </span>
                      <span className="text-[10px] font-black text-slate-600">{itens.length}</span>
                    </div>
                    <Droppable droppableId={status}>
                      {(provided, snapshot) => (
                        <div ref={provided.innerRef} {...provided.droppableProps}
                          className={`flex-1 min-h-[120px] rounded-2xl p-2 space-y-2 border transition-colors ${snapshot.isDraggingOver ? 'bg-white/[0.04] border-white/20' : 'bg-[#0F172A]/50 border-white/5'}`}>
                          {itens.map((p, index) => {
                            const dias = diasAte(p.proxima_acao_em);
                            const atrasado = dias !== null && dias < 0 && status !== 'perdido' && status !== 'cliente';
                            return (
                              <Draggable key={p.id} draggableId={p.id} index={index}>
                                {(dragProvided, dragSnapshot) => (
                                  <div ref={dragProvided.innerRef} {...dragProvided.draggableProps} {...dragProvided.dragHandleProps}
                                    onClick={() => abrirEdicao(p)}
                                    className={`bg-[#131C2E] border rounded-xl p-3 cursor-pointer transition-all hover:border-white/20 ${dragSnapshot.isDragging ? 'border-[#22C55E]/50 shadow-2xl rotate-1' : 'border-white/5'} ${movendoId === p.id ? 'opacity-60' : ''} ${atrasado ? 'ring-1 ring-red-500/40' : ''}`}>
                                    <div className="flex items-start justify-between gap-2 mb-1.5">
                                      <h3 className="font-black text-white text-[13px] leading-tight">{p.nome}</h3>
                                      {p.canal && <span className="text-[8px] font-black uppercase tracking-widest bg-white/5 border border-white/10 text-slate-500 px-1.5 py-0.5 rounded-full shrink-0">{CANAL_LABELS[p.canal] || p.canal}</span>}
                                    </div>
                                    <div className="flex flex-wrap gap-x-2.5 gap-y-1 text-[10px] text-slate-500">
                                      {p.cidade && <span className="flex items-center gap-1"><MapPin size={9}/> {p.cidade}</span>}
                                      {p.segmento && <span className="flex items-center gap-1"><Radio size={9}/> {p.segmento}</span>}
                                    </div>
                                    {p.estrategia && <p className="text-slate-400 text-[10.5px] mt-2 line-clamp-2">{p.estrategia}</p>}
                                    {p.proxima_acao_em && (
                                      <div className={`flex items-center gap-1 mt-2 text-[10px] font-bold ${atrasado ? 'text-red-400' : 'text-slate-500'}`}>
                                        {atrasado ? <AlertTriangle size={10}/> : <Calendar size={10}/>} {fmtDataCurta(p.proxima_acao_em)}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </Draggable>
                            );
                          })}
                          {provided.placeholder}
                          {itens.length === 0 && (
                            <button onClick={() => abrirNovo(status)} className="w-full py-6 text-slate-700 hover:text-slate-500 text-[10px] font-black uppercase tracking-widest transition-colors">
                              + adicionar
                            </button>
                          )}
                        </div>
                      )}
                    </Droppable>
                  </div>
                );
              })}
            </div>
          </DragDropContext>
        )}
      </div>

      {/* Modal */}
      {editando && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-white/10 flex-shrink-0">
              <h2 className="font-black text-white uppercase italic tracking-tight">{criandoNovo ? 'Novo prospect' : (editando as Prospect).nome}</h2>
              <button onClick={() => setEditando(null)} className="text-slate-500 hover:text-white transition-colors"><X size={18}/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {erro && <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-3 text-red-400 text-xs font-bold">{erro}</div>}

              {criandoNovo && (
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Nome da empresa</label>
                  <input value={editando.nome || ''} onChange={e => setEditando(v => ({ ...v, nome: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-colors"/>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Status</label>
                  <select value={editando.status || 'bom_fit'} onChange={e => setEditando(v => ({ ...v, status: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-colors">
                    {COLUNAS.map(s => <option key={s} value={s} className="bg-[#0B1120]">{STATUS_CFG[s].label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Canal</label>
                  <select value={editando.canal || ''} onChange={e => setEditando(v => ({ ...v, canal: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-colors">
                    <option value="" className="bg-[#0B1120]">— não definido —</option>
                    {Object.entries(CANAL_LABELS).map(([k, l]) => <option key={k} value={k} className="bg-[#0B1120]">{l}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Cidade</label>
                  <input value={editando.cidade || ''} onChange={e => setEditando(v => ({ ...v, cidade: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-colors"/>
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Segmento</label>
                  <input value={editando.segmento || ''} onChange={e => setEditando(v => ({ ...v, segmento: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-colors"/>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block flex items-center gap-1"><User size={9}/> Contato</label>
                  <input value={editando.contato || ''} onChange={e => setEditando(v => ({ ...v, contato: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-colors"/>
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block flex items-center gap-1"><Phone size={9}/> WhatsApp</label>
                  <input value={editando.whatsapp || ''} onChange={e => setEditando(v => ({ ...v, whatsapp: e.target.value }))} placeholder="(47) 99999-9999" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600"/>
                </div>
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block flex items-center gap-1"><Calendar size={9}/> Próxima ação</label>
                <input type="date" value={editando.proxima_acao_em || ''} onChange={e => setEditando(v => ({ ...v, proxima_acao_em: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-colors"/>
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Estratégia</label>
                <textarea value={editando.estrategia || ''} onChange={e => setEditando(v => ({ ...v, estrategia: e.target.value }))} rows={2} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-medium outline-none focus:border-[#22C55E] transition-colors resize-none"/>
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-1 block">Notas</label>
                <textarea value={editando.notas || ''} onChange={e => setEditando(v => ({ ...v, notas: e.target.value }))} rows={3} placeholder="Histórico de conversas, próximos passos..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-medium outline-none focus:border-[#22C55E] transition-colors resize-none placeholder:text-slate-600"/>
              </div>

              {editando.fonte && <p className="text-slate-600 text-[10px]">Fonte: {editando.fonte}{editando.faturamento_nota ? ` · ${editando.faturamento_nota}` : ''}</p>}
            </div>

            <div className="p-6 border-t border-white/10 flex gap-3 flex-shrink-0">
              {!criandoNovo && (
                <button onClick={() => excluir((editando as Prospect).id)} className="p-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 transition-colors">
                  <Trash2 size={16}/>
                </button>
              )}
              <button onClick={() => setEditando(null)} className="flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest bg-white/5 text-slate-400 hover:bg-white/10 transition-colors">
                Fechar
              </button>
              <button onClick={salvar} disabled={saving || (criandoNovo && !editando.nome)} className="flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest bg-[#22C55E] text-[#0B1120] hover:bg-[#16A34A] disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                {saving ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>}
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
