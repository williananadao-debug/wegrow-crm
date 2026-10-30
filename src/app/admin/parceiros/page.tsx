"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Handshake, ShieldAlert, ArrowLeft, Plus, Loader2, X, Save, ExternalLink, Mail, Radio } from 'lucide-react';
import { SkeletonPage } from '@/components/Skeleton';

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '').split(',').map(e => e.trim());

type Parceiro = {
  id: string; nome: string; logo_url: string | null; comissao_pct: number; ativo: boolean;
  usuarios: string[]; radios_ativas: number; radios_teste: number;
};

export default function AdminParceirosPage() {
  const { user, loading: authLoading } = useAuth();
  const [token, setToken] = useState('');
  const [parceiros, setParceiros] = useState<Parceiro[]>([]);
  const [loading, setLoading] = useState(true);
  const [pctEditado, setPctEditado] = useState<Record<string, string>>({});
  const [emailNovo, setEmailNovo] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState('');

  const isAdmin = !authLoading && user && ADMIN_EMAILS.includes(user.email || '');

  useEffect(() => {
    if (!user) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) setToken(session.access_token);
    });
  }, [user]);

  useEffect(() => { if (token) carregar(); }, [token]);

  const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` });

  const carregar = async () => {
    const res = await fetch('/api/admin/parceiros', { headers: headers() });
    const json = await res.json().catch(() => []);
    if (res.ok) setParceiros(json);
    setLoading(false);
  };

  const acao = async (chave: string, body: any) => {
    setSalvando(chave);
    try {
      const res = await fetch('/api/admin/parceiros', { method: 'POST', headers: headers(), body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { alert(json.erro || `Erro (HTTP ${res.status}).`); return false; }
      await carregar();
      return true;
    } finally { setSalvando(null); }
  };

  if (authLoading) return <div className="p-4 md:p-8"><SkeletonPage /></div>;
  if (!isAdmin) return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center">
      <div className="text-center">
        <ShieldAlert className="mx-auto text-red-500 mb-4" size={48}/>
        <p className="text-white font-black text-2xl uppercase">Acesso Restrito</p>
      </div>
    </div>
  );

  return (
    <div className="text-white p-4 md:p-8 pb-20">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8 border-b border-white/5 pb-6 gap-4">
          <div>
            <Link href="/admin" className="text-slate-500 hover:text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 mb-2"><ArrowLeft size={12}/> God Mode</Link>
            <h1 className="text-2xl md:text-3xl font-black uppercase italic flex items-center gap-3"><Handshake className="text-[#22C55E]" size={30}/> Parceiros</h1>
            <p className="text-slate-500 text-xs mt-1">Revendas que vendem, dão suporte e treinam. Cada uma vê só a própria carteira em <span className="text-slate-300 font-bold">/parceiro</span>.</p>
          </div>
          <form onSubmit={async e => { e.preventDefault(); if (await acao('novo', { acao: 'criar', nome: novoNome, comissao_pct: 40 })) setNovoNome(''); }} className="flex items-center gap-2">
            <input value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="Novo parceiro" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-[#22C55E] w-40"/>
            <button disabled={!novoNome.trim() || salvando === 'novo'} className="bg-[#22C55E] text-[#0B1120] px-4 py-2.5 rounded-xl text-xs font-black uppercase flex items-center gap-2 disabled:opacity-50">
              {salvando === 'novo' ? <Loader2 size={14} className="animate-spin"/> : <Plus size={14}/>} Criar
            </button>
          </form>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-600"/></div>
        ) : parceiros.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-16 border border-dashed border-white/10 rounded-3xl">Nenhum parceiro ainda. Rode a migration 20261030100000_parceiros.sql ou crie um acima.</p>
        ) : (
          <div className="space-y-4">
            {parceiros.map(p => (
              <div key={p.id} className={`bg-[#0F172A] border rounded-3xl p-6 ${p.ativo ? 'border-white/10' : 'border-white/5 opacity-60'}`}>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <p className="text-lg font-black">{p.nome} {!p.ativo && <span className="text-[9px] uppercase text-red-400 border border-red-500/30 rounded px-2 py-0.5 ml-2 align-middle">Pausado</span>}</p>
                    <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-1"><Radio size={12}/> {p.radios_ativas} clientes · {p.radios_teste} em teste</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                      <input type="number" min={0} max={100} step={0.5}
                        value={pctEditado[p.id] ?? String(p.comissao_pct)}
                        onChange={e => setPctEditado(s => ({ ...s, [p.id]: e.target.value }))}
                        className="w-16 bg-transparent px-3 py-2 text-sm font-black outline-none text-right"/>
                      <span className="text-slate-500 text-xs font-black pr-3">% comissão</span>
                    </div>
                    {pctEditado[p.id] !== undefined && pctEditado[p.id] !== String(p.comissao_pct) && (
                      <button onClick={async () => { if (await acao(p.id + ':pct', { acao: 'atualizar', id: p.id, comissao_pct: pctEditado[p.id] })) setPctEditado(s => { const n = { ...s }; delete n[p.id]; return n; }); }}
                        className="bg-[#22C55E] text-[#0B1120] px-3 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5">
                        {salvando === p.id + ':pct' ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Salvar
                      </button>
                    )}
                    <button onClick={() => acao(p.id + ':ativo', { acao: 'atualizar', id: p.id, ativo: !p.ativo })}
                      className="bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 px-3 py-2 rounded-xl text-[10px] font-black uppercase">
                      {p.ativo ? 'Pausar acesso' : 'Reativar'}
                    </button>
                    <a href={`/parceiro?parceiro_id=${p.id}`} target="_blank" rel="noopener noreferrer"
                      className="bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 px-3 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-1.5">
                      <ExternalLink size={12}/> Ver portal
                    </a>
                  </div>
                </div>

                <div className="mt-5 pt-5 border-t border-white/5">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Quem acessa o portal (login do WeGrow)</p>
                  <div className="flex flex-wrap gap-2">
                    {p.usuarios.map(email => (
                      <span key={email} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full pl-3 pr-1.5 py-1 text-xs font-bold">
                        <Mail size={11} className="text-slate-500"/> {email}
                        <button onClick={() => { if (confirm(`Tirar o acesso de ${email} ao portal ${p.nome}?`)) acao(p.id + ':' + email, { acao: 'remover_usuario', id: p.id, email }); }}
                          className="p-0.5 rounded-full text-slate-500 hover:text-red-400 hover:bg-red-500/10">
                          {salvando === p.id + ':' + email ? <Loader2 size={11} className="animate-spin"/> : <X size={11}/>}
                        </button>
                      </span>
                    ))}
                    <form onSubmit={async e => { e.preventDefault(); if (await acao(p.id + ':add', { acao: 'add_usuario', id: p.id, email: emailNovo[p.id] })) setEmailNovo(s => ({ ...s, [p.id]: '' })); }} className="flex items-center gap-1.5">
                      <input type="email" value={emailNovo[p.id] || ''} onChange={e => setEmailNovo(s => ({ ...s, [p.id]: e.target.value }))} placeholder="email@parceiro.com.br"
                        className="bg-white/5 border border-white/10 rounded-full px-3 py-1 text-xs font-bold outline-none focus:border-[#22C55E] w-52"/>
                      <button disabled={!emailNovo[p.id]?.includes('@')} className="p-1.5 rounded-full bg-[#22C55E]/15 text-[#22C55E] disabled:opacity-40">
                        {salvando === p.id + ':add' ? <Loader2 size={12} className="animate-spin"/> : <Plus size={12}/>}
                      </button>
                    </form>
                  </div>
                  <p className="text-[10px] text-slate-600 mt-2">O e-mail precisa ser de um login que já existe no WeGrow (ex.: o diretor da conta de teste do parceiro). A rádio entra na carteira pelo seletor “Parceiro” na aba Faturamento da empresa.</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
