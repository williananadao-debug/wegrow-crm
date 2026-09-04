"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  ArrowLeft, ShieldAlert, Loader2, RefreshCw, Sparkles, Plus, X, Save,
  LogIn, Building2, Package, Gavel, Scale, Edit2, Calendar,
} from 'lucide-react';

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '').split(',').map(e => e.trim());

type EmpresaDemo = {
  id: string;
  nome: string;
  modulos: Record<string, any>;
  created_at: string | null;
};

function moduloTags(modulos: Record<string, any>) {
  const tags: { label: string; icon: React.ReactNode }[] = [];
  if (modulos?.pulse) tags.push({ label: 'Pulse', icon: <Package size={10}/> });
  if (modulos?.argus && modulos?.argus_vertical === 'veiculos') tags.push({ label: 'Argus Veículos', icon: <Gavel size={10}/> });
  else if (modulos?.argus) tags.push({ label: 'Argus Licitação', icon: <Gavel size={10}/> });
  if (modulos?.advocacia) tags.push({ label: 'Advocacia', icon: <Scale size={10}/> });
  return tags;
}

export default function DemosPage() {
  const { user, loading: authLoading } = useAuth();
  const isAdmin = ADMIN_EMAILS.includes(user?.email || '');

  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [empresas, setEmpresas] = useState<EmpresaDemo[]>([]);
  const [entrandoComoId, setEntrandoComoId] = useState<string | null>(null);
  const [editandoNotaId, setEditandoNotaId] = useState<string | null>(null);
  const [notaRascunho, setNotaRascunho] = useState('');
  const [salvandoNota, setSalvandoNota] = useState(false);

  const [showNova, setShowNova] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novoDiretorNome, setNovoDiretorNome] = useState('');
  const [novoDiretorEmail, setNovoDiretorEmail] = useState('');
  const [novoNota, setNovoNota] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tipo: 'sucesso' | 'erro'; msg: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) setToken(session.access_token);
    });
  }, [user]);

  useEffect(() => { if (token && isAdmin) carregar(); }, [token, isAdmin]);

  const carregar = async () => {
    setLoading(true);
    const res = await fetch('/api/admin/empresas', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const json = await res.json();
      setEmpresas((json || []).filter((e: any) => !!e.modulos?.demo));
    }
    setLoading(false);
  };

  const entrarComoEmpresa = async (empresaId: string) => {
    setEntrandoComoId(empresaId);
    try {
      const res = await fetch('/api/admin/entrar-como', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ empresa_id: empresaId }),
      });
      const json = await res.json();
      if (!res.ok || !json.link) { alert(json.erro || 'Erro ao gerar acesso.'); return; }
      window.open(json.link, '_blank');
    } finally {
      setEntrandoComoId(null);
    }
  };

  const abrirEdicaoNota = (e: EmpresaDemo) => { setEditandoNotaId(e.id); setNotaRascunho(e.modulos?.demo_nota || ''); };

  const salvarNota = async (e: EmpresaDemo) => {
    setSalvandoNota(true);
    const novosModulos = { ...e.modulos, demo_nota: notaRascunho };
    const res = await fetch('/api/admin/empresas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: e.id, modulos: novosModulos }),
    });
    setSalvandoNota(false);
    if (res.ok) { setEditandoNotaId(null); carregar(); }
  };

  const criarDemo = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/empresas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          nome: novoNome, diretorNome: novoDiretorNome, diretorEmail: novoDiretorEmail,
          modulos: { demo: true, demo_nota: novoNota || undefined },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setFeedback({ tipo: 'erro', msg: json.erro || `Erro ao criar (HTTP ${res.status}).` }); return; }
      setFeedback({ tipo: 'sucesso', msg: `Demo criada! Login: ${json.diretorEmail} · Senha: ${json.senhaTemp}` });
      setNovoNome(''); setNovoDiretorNome(''); setNovoDiretorEmail(''); setNovoNota('');
      carregar();
    } catch (err: any) {
      setFeedback({ tipo: 'erro', msg: 'Erro de rede: ' + (err?.message || 'desconhecido') });
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) return null;
  if (!isAdmin) return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center">
      <div className="text-center"><ShieldAlert size={40} className="text-red-500 mx-auto mb-3"/><p className="text-red-400 font-black uppercase tracking-widest">Acesso restrito</p></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0B1120] text-white">
      <div className="max-w-4xl mx-auto px-4 py-8">

        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors">
              <ArrowLeft size={16} className="text-slate-400"/>
            </Link>
            <div>
              <h1 className="text-2xl font-black uppercase italic tracking-tighter flex items-center gap-2">
                <Sparkles size={22} className="text-purple-400"/> Modelos de demo
              </h1>
              <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold">Empresas fake usadas em apresentação comercial · não são clientes pagantes</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowNova(true)} className="flex items-center gap-1.5 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 px-3 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all">
              <Plus size={13}/> Nova demo
            </button>
            <button onClick={carregar} className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors">
              <RefreshCw size={16} className={`text-slate-400 ${loading ? 'animate-spin' : ''}`}/>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-slate-600"/></div>
        ) : empresas.length === 0 ? (
          <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-10 text-center">
            <Sparkles size={28} className="mx-auto text-slate-700 mb-3"/>
            <p className="text-slate-500 text-sm">Nenhum modelo de demo cadastrado ainda.</p>
            <p className="text-slate-600 text-xs mt-1">Marque "Empresa demo" ao criar uma empresa nova pra ela aparecer aqui.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {empresas.map(e => (
              <div key={e.id} className="bg-[#0F172A] border border-white/5 hover:border-white/10 rounded-2xl p-5 transition-colors">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <h3 className="font-black text-white text-sm flex items-center gap-2"><Building2 size={14} className="text-slate-500"/> {e.nome}</h3>
                      {moduloTags(e.modulos).map(t => (
                        <span key={t.label} className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest bg-white/5 border border-white/10 text-slate-400 px-2 py-0.5 rounded-full">{t.icon} {t.label}</span>
                      ))}
                    </div>
                    {e.created_at && (
                      <p className="text-[10px] text-slate-600 flex items-center gap-1"><Calendar size={9}/> criada em {new Date(e.created_at).toLocaleDateString('pt-BR')}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => entrarComoEmpresa(e.id)} disabled={entrandoComoId === e.id}
                      className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50">
                      {entrandoComoId === e.id ? <Loader2 size={11} className="animate-spin"/> : <LogIn size={11}/>} Entrar como
                    </button>
                  </div>
                </div>

                {editandoNotaId === e.id ? (
                  <div className="mt-3 space-y-2">
                    <textarea autoFocus value={notaRascunho} onChange={ev => setNotaRascunho(ev.target.value)} rows={2}
                      placeholder="Pra qual prospect/reunião esse modelo serve? Ex: 'Oficina de motos + loja de scooter elétrica — usado na reunião Belli Motoshop'"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-medium outline-none focus:border-purple-400/50 transition-colors resize-none placeholder:text-slate-600"/>
                    <div className="flex gap-2">
                      <button onClick={() => salvarNota(e)} disabled={salvandoNota} className="flex items-center gap-1.5 bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50">
                        {salvandoNota ? <Loader2 size={10} className="animate-spin"/> : <Save size={10}/>} Salvar
                      </button>
                      <button onClick={() => setEditandoNotaId(null)} className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white px-3 py-1.5 transition-colors">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => abrirEdicaoNota(e)} className="mt-3 w-full text-left group">
                    {e.modulos?.demo_nota ? (
                      <p className="text-slate-400 text-xs flex items-start gap-1.5"><Edit2 size={10} className="mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"/> {e.modulos.demo_nota}</p>
                    ) : (
                      <p className="text-slate-700 text-xs flex items-center gap-1.5 group-hover:text-slate-500 transition-colors"><Edit2 size={10}/> Adicionar nota — pra qual prospect esse modelo serve?</p>
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Nova Demo */}
      {showNova && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6 w-full max-w-sm">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-black uppercase text-sm flex items-center gap-2"><Sparkles size={14} className="text-purple-400"/> Nova demo</h3>
              <button onClick={() => { setShowNova(false); setFeedback(null); }} className="text-slate-500 hover:text-white"><X size={16}/></button>
            </div>
            <form onSubmit={criarDemo} className="space-y-3">
              <input required placeholder="Nome da empresa fake *" value={novoNome} onChange={e => setNovoNome(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-purple-400/50"/>
              <textarea placeholder="Nota — pra qual prospect/reunião? (opcional)" value={novoNota} onChange={e => setNovoNota(e.target.value)} rows={2} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-medium outline-none focus:border-purple-400/50 resize-none placeholder:text-slate-600"/>
              <div className="border-t border-white/10 pt-3 mt-1">
                <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest mb-2">Login pra você entrar direto (obrigatório)</p>
                <input required placeholder="Seu nome ou apelido pra essa demo *" value={novoDiretorNome} onChange={e => setNovoDiretorNome(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-purple-400/50 mb-3"/>
                <input required type="email" placeholder="E-mail (pode ser um seu, +alias) *" value={novoDiretorEmail} onChange={e => setNovoDiretorEmail(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-purple-400/50"/>
              </div>
              {feedback && (
                <div className={`text-xs font-bold p-3 rounded-xl ${feedback.tipo === 'sucesso' ? 'bg-purple-500/10 border border-purple-500/30 text-purple-300' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>
                  {feedback.msg}
                </div>
              )}
              <button type="submit" disabled={saving} className="w-full bg-purple-500 hover:bg-purple-600 text-white py-3 rounded-xl font-black uppercase text-xs transition-all">
                {saving ? 'Criando...' : 'Criar demo'}
              </button>
              <p className="text-[10px] text-slate-600 text-center">Depois de criada, configure os módulos (Pulse/Argus/Advocacia) na tela principal do admin — aqui você só cria e organiza.</p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
