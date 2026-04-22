"use client";
import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Users, Zap, Building2, ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useRouter } from 'next/navigation';

type Result = {
  id: number;
  tipo: 'lead' | 'cliente';
  nome: string;
  sub?: string;
  badge?: string;
};

export default function GlobalSearch() {
  const { perfil } = useAuth() || {};
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setResults([]);
      setSelected(0);
    }
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (!q.trim() || !perfil?.empresa_id) { setResults([]); return; }
    setLoading(true);
    try {
      const [leadsRes, clientesRes] = await Promise.all([
        supabase.from('leads').select('id, empresa, status, valor_total, unidade')
          .eq('empresa_id', perfil.empresa_id)
          .ilike('empresa', `%${q}%`)
          .limit(5),
        supabase.from('clientes').select('id, nome_empresa, cidade, cnpj')
          .eq('empresa_id', perfil.empresa_id)
          .or(`nome_empresa.ilike.%${q}%,cnpj.ilike.%${q}%,cidade.ilike.%${q}%`)
          .limit(5),
      ]);
      const leadRows: Result[] = (leadsRes.data || []).map(l => ({
        id: l.id, tipo: 'lead' as const, nome: l.empresa || 'Lead s/ nome',
        sub: `R$ ${(Number(l.valor_total) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} · ${l.unidade || '—'}`,
        badge: l.status,
      }));
      const clienteRows: Result[] = (clientesRes.data || []).map(c => ({
        id: c.id, tipo: 'cliente' as const, nome: c.nome_empresa || 'Cliente s/ nome',
        sub: [c.cidade, c.cnpj].filter(Boolean).join(' · '),
      }));
      setResults([...leadRows, ...clienteRows]);
      setSelected(0);
    } finally {
      setLoading(false);
    }
  }, [perfil?.empresa_id]);

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => search(query), 300);
  }, [query, search]);

  const navigate = (r: Result) => {
    setOpen(false);
    router.push(r.tipo === 'lead' ? '/deals' : '/customers');
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    if (e.key === 'Enter' && results[selected]) navigate(results[selected]);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-start justify-center pt-20 px-4" onClick={() => setOpen(false)}>
      <div className="w-full max-w-xl bg-[#0F172A] border border-white/15 rounded-[28px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
          {loading ? <Loader2 size={18} className="text-slate-400 animate-spin flex-shrink-0" /> : <Search size={18} className="text-slate-400 flex-shrink-0" />}
          <input
            ref={inputRef}
            type="text"
            placeholder="Buscar leads, clientes, cidades..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-slate-600"
          />
          <kbd className="text-[9px] font-black uppercase text-slate-600 bg-white/5 px-2 py-1 rounded border border-white/10 hidden md:block">ESC</kbd>
          <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-white p-1 transition-colors">
            <X size={16}/>
          </button>
        </div>

        {results.length > 0 ? (
          <ul className="py-2 max-h-72 overflow-y-auto custom-scrollbar">
            {results.map((r, i) => (
              <li key={`${r.tipo}-${r.id}`}>
                <button
                  onClick={() => navigate(r)}
                  className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-colors ${i === selected ? 'bg-white/10' : 'hover:bg-white/5'}`}
                >
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${r.tipo === 'lead' ? 'bg-blue-500/15 text-blue-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                    {r.tipo === 'lead' ? <Zap size={14}/> : <Building2 size={14}/>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-sm truncate">{r.nome}</p>
                    {r.sub && <p className="text-slate-500 text-[10px] font-bold uppercase truncate">{r.sub}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {r.badge && (
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${r.badge === 'ganho' ? 'bg-green-500/15 text-green-400' : r.badge === 'perdido' ? 'bg-red-500/15 text-red-400' : 'bg-blue-500/15 text-blue-400'}`}>{r.badge}</span>
                    )}
                    <span className="text-[9px] font-black uppercase text-slate-600">{r.tipo}</span>
                    <ArrowRight size={12} className="text-slate-600"/>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : query.trim() && !loading ? (
          <div className="py-10 text-center text-slate-600 text-xs font-bold uppercase flex flex-col items-center gap-2">
            <Search size={24} className="opacity-30"/>
            Nenhum resultado para "{query}"
          </div>
        ) : !query.trim() ? (
          <div className="py-8 px-5 flex flex-wrap gap-2">
            {[
              { label: 'Leads abertos', icon: <Zap size={12}/>, action: () => { router.push('/deals'); setOpen(false); } },
              { label: 'Clientes', icon: <Users size={12}/>, action: () => { router.push('/customers'); setOpen(false); } },
              { label: 'Dashboard', icon: <Building2 size={12}/>, action: () => { router.push('/dashboard'); setOpen(false); } },
            ].map(item => (
              <button key={item.label} onClick={item.action} className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-slate-300 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase transition-colors">
                {item.icon}{item.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="px-5 py-2 border-t border-white/5 flex items-center gap-4 text-[9px] text-slate-600 font-bold uppercase">
          <span>↑↓ Navegar</span>
          <span>↵ Abrir</span>
          <span>ESC Fechar</span>
          <span className="ml-auto">Ctrl+K para abrir</span>
        </div>
      </div>
    </div>
  );
}
