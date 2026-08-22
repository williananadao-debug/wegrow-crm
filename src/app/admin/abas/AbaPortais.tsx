"use client";
import { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, Trash2, Copy, ExternalLink, CheckCircle2 } from 'lucide-react';
import { AbaProps, headersAuth } from './types';

type Portal = { id: string; slug: string; nome_portal: string; ativo: boolean; cor_primaria: string; };

const BASE_URL = typeof window !== 'undefined' ? window.location.origin : 'https://www.wegrow.app.br';

export default function AbaPortais({ empresa, token }: AbaProps) {
  const [portais, setPortais] = useState<Portal[]>([]);
  const [loading, setLoading] = useState(true);
  const [novoSlug, setNovoSlug] = useState('');
  const [novoNome, setNovoNome] = useState('');
  const [criando, setCriando] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/portais?empresa_id=${empresa.id}`, { headers: headersAuth(token) });
    setPortais(res.ok ? await res.json() : []);
    setLoading(false);
  }, [empresa.id, token]);

  useEffect(() => { carregar(); }, [carregar]);

  const criarPortal = async () => {
    if (!novoSlug.trim() || !novoNome.trim()) return;
    setCriando(true);
    await fetch('/api/admin/portais', {
      method: 'POST',
      headers: headersAuth(token),
      body: JSON.stringify({ empresa_id: empresa.id, slug: novoSlug.trim(), nome_portal: novoNome.trim(), cor_primaria: '#22C55E', logo_texto: 'W', tipos_cadastro: [{ nome: 'Padrão', desc: '', valor: 0 }], segmentos: [], etapas: ['Recebido', 'Em análise', 'Proposta enviada', 'Em negociação', 'Concluído'], ativo: true }),
    });
    setCriando(false); setNovoSlug(''); setNovoNome('');
    carregar();
  };

  const togglePortal = async (p: Portal) => {
    await fetch('/api/admin/portais', {
      method: 'PATCH',
      headers: headersAuth(token),
      body: JSON.stringify({ id: p.id, ativo: !p.ativo }),
    });
    carregar();
  };

  const excluirPortal = async (id: string) => {
    if (!confirm('Excluir este portal?')) return;
    await fetch(`/api/admin/portais?id=${id}`, { method: 'DELETE', headers: headersAuth(token) });
    carregar();
  };

  const copiarLink = (slug: string) => {
    navigator.clipboard.writeText(`${BASE_URL}/p/${slug}`);
    setCopiado(slug); setTimeout(() => setCopiado(null), 2000);
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-slate-600"/></div>;

  return (
    <div className="space-y-4">
      {portais.length === 0 && <p className="text-slate-500 text-xs text-center py-4">Nenhum portal criado ainda.</p>}
      {portais.map(p => (
        <div key={p.id} className="flex items-center gap-3 bg-white/[0.03] border border-white/5 rounded-xl p-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[#0B1120] font-black text-xs flex-shrink-0" style={{ background: p.cor_primaria }}>{p.nome_portal?.[0]?.toUpperCase() || 'P'}</div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-black truncate">{p.nome_portal}</p>
            <p className="text-slate-500 text-[10px] font-mono">/p/{p.slug}</p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => copiarLink(p.slug)} className="p-1.5 text-slate-500 hover:text-white transition-colors" title="Copiar link">
              {copiado === p.slug ? <CheckCircle2 size={14} className="text-green-400"/> : <Copy size={14}/>}
            </button>
            <a href={`/p/${p.slug}`} target="_blank" rel="noopener noreferrer" className="p-1.5 text-slate-500 hover:text-white transition-colors"><ExternalLink size={14}/></a>
            <button onClick={() => togglePortal(p)} className={`px-2 py-1 rounded text-[9px] font-black uppercase ${p.ativo ? 'bg-green-500/10 text-green-400' : 'bg-white/5 text-slate-500'}`}>{p.ativo ? 'Ativo' : 'Inativo'}</button>
            <button onClick={() => excluirPortal(p.id)} className="p-1.5 text-slate-600 hover:text-red-400 transition-colors"><Trash2 size={14}/></button>
          </div>
        </div>
      ))}

      <div className="border-t border-white/5 pt-4 space-y-3">
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Criar novo portal</p>
        <div className="grid grid-cols-2 gap-2">
          <input value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="Nome do portal" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600"/>
          <input value={novoSlug} onChange={e => setNovoSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="slug-unico" className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm font-mono text-white outline-none focus:border-[#22C55E] transition-colors placeholder:text-slate-600"/>
        </div>
        <button onClick={criarPortal} disabled={criando || !novoSlug.trim() || !novoNome.trim()} className="w-full bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 text-[#22C55E] py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2">
          {criando ? <Loader2 size={13} className="animate-spin"/> : <Plus size={13}/>}
          Criar Portal
        </button>
      </div>
    </div>
  );
}
