"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  ArrowLeft, ShieldAlert, Loader2, RefreshCw, Target, X, Save,
  Plus, Trash2, MapPin, Radio, Phone, Calendar, User,
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

const STATUS_CFG: Record<string, { label: string; cor: string }> = {
  avancado:     { label: 'Avançado',     cor: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  bom_fit:      { label: 'Bom fit',      cor: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  cliente:      { label: 'Cliente',      cor: 'bg-[#22C55E]/15 text-[#22C55E] border-[#22C55E]/30' },
  porte_grande: { label: 'Porte grande', cor: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
  perdido:      { label: 'Perdido',      cor: 'bg-slate-500/15 text-slate-500 border-slate-500/30' },
};
const ORDEM_STATUS = ['avancado', 'bom_fit', 'cliente', 'porte_grande', 'perdido'];

const CANAL_LABELS: Record<string, string> = { ialto: 'IAlto', nilton: 'Nilton', organico: 'Orgânico', indicacao: 'Indicação', direto: 'Direto' };

const VAZIO: Partial<Prospect> = { nome: '', segmento: '', cidade: '', status: 'bom_fit', canal: '', faturamento_nota: '', fonte: '', estrategia: '', contato: '', whatsapp: '', notas: '', proxima_acao_em: '' };

export default function ProspeccaoPage() {
  const { user, loading: authLoading } = useAuth();
  const isAdmin = ADMIN_EMAILS.includes(user?.email || '');

  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [semTabela, setSemTabela] = useState(false);
  const [token, setToken] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string | null>(null);

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
  const abrirNovo = () => { setEditando({ ...VAZIO }); setCriandoNovo(true); setErro(null); };

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

  if (authLoading) return null;
  if (!isAdmin) return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center">
      <div className="text-center"><ShieldAlert size={40} className="text-red-500 mx-auto mb-3"/><p className="text-red-400 font-black uppercase tracking-widest">Acesso restrito</p></div>
    </div>
  );

  const contagens = ORDEM_STATUS.map(s => ({ status: s, total: prospects.filter(p => p.status === s).length }));
  const visiveis = filtroStatus ? prospects.filter(p => p.status === filtroStatus) : prospects;
  const agrupados = ORDEM_STATUS
    .map(s => ({ status: s, itens: visiveis.filter(p => p.status === s) }))
    .filter(g => g.itens.length > 0);

  return (
    <div className="min-h-screen bg-[#0B1120] text-white">
      <div className="max-w-4xl mx-auto px-4 py-10">

        <div className="flex items-center justify-between mb-6">
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
            <button onClick={abrirNovo} className="flex items-center gap-1.5 bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E] px-3 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all">
              <Plus size={13}/> Novo
            </button>
            <button onClick={carregar} className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors">
              <RefreshCw size={16} className={`text-slate-400 ${loading ? 'animate-spin' : ''}`}/>
            </button>
          </div>
        </div>

        {!semTabela && (
          <div className="flex flex-wrap gap-2 mb-6">
            <button onClick={() => setFiltroStatus(null)} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${!filtroStatus ? 'bg-white text-[#0B1120] border-white' : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'}`}>
              Todos <span className="opacity-60">{prospects.length}</span>
            </button>
            {contagens.filter(c => c.total > 0).map(c => (
              <button key={c.status} onClick={() => setFiltroStatus(c.status)} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${filtroStatus === c.status ? STATUS_CFG[c.status].cor : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'}`}>
                {STATUS_CFG[c.status].label} <span className="opacity-60">{c.total}</span>
              </button>
            ))}
          </div>
        )}

        {semTabela && (
          <div className="bg-[#0F172A] border border-yellow-500/20 rounded-3xl p-8 mb-6">
            <p className="text-yellow-400 font-black text-sm uppercase tracking-widest mb-4">Rode a migração no Supabase</p>
            <p className="text-slate-400 text-xs mb-3">Execute <code className="text-[#22C55E] font-mono">supabase/migrations/20260815120000_wegrow_prospects.sql</code> no SQL Editor do Supabase Studio — cria a tabela e já semeia com as 25 empresas do mapa de prospecção.</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-slate-600"/></div>
        ) : (
          <div className="space-y-6">
            {agrupados.map(g => (
              <div key={g.status}>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{STATUS_CFG[g.status].label} · {g.itens.length}</p>
                <div className="space-y-2">
                  {g.itens.map(p => (
                    <button key={p.id} onClick={() => abrirEdicao(p)} className="w-full text-left bg-[#0F172A] border border-white/5 hover:border-white/20 rounded-2xl p-4 transition-all">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h3 className="font-black text-white text-sm">{p.nome}</h3>
                            {p.canal && <span className="text-[9px] font-black uppercase tracking-widest bg-white/5 border border-white/10 text-slate-400 px-2 py-0.5 rounded-full">{CANAL_LABELS[p.canal] || p.canal}</span>}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                            {p.cidade && <span className="flex items-center gap-1"><MapPin size={10}/> {p.cidade}</span>}
                            {p.segmento && <span className="flex items-center gap-1"><Radio size={10}/> {p.segmento}</span>}
                          </div>
                          {p.estrategia && <p className="text-slate-400 text-[11px] mt-2 line-clamp-2">{p.estrategia}</p>}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {!loading && !semTabela && prospects.length === 0 && (
              <p className="text-slate-500 text-sm text-center py-12">Nenhum prospect cadastrado ainda.</p>
            )}
          </div>
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
                    {ORDEM_STATUS.map(s => <option key={s} value={s} className="bg-[#0B1120]">{STATUS_CFG[s].label}</option>)}
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
