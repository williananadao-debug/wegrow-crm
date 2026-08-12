"use client";
import { useState, useEffect } from 'react';
import { Loader2, Printer, Package } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';

type Produto = { nome: string; preco: number; imagem_url: string | null };
type Categoria = { nome: string; produtos: Produto[] };
type Catalogo = { empresaNome: string; logoUrl: string | null; intro: string; categorias: Categoria[] };

export default function CatalogoVendasPage() {
  const auth = useAuth() || {};
  const authLoading = (auth as any).loading;

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [dados, setDados] = useState<Catalogo | null>(null);

  useEffect(() => {
    if (authLoading) return;
    (async () => {
      setLoading(true);
      setErro(null);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Sessão expirada.');
        const res = await fetch('/api/ia/material-vendas', {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erro ao gerar catálogo.');
        setDados(json);
      } catch (err: any) {
        setErro(err?.message || 'Erro ao gerar catálogo.');
      } finally {
        setLoading(false);
      }
    })();
  }, [authLoading]);

  if (authLoading || loading) {
    return (
      <div className="p-10 flex flex-col items-center justify-center gap-3 text-white min-h-[50vh]">
        <Loader2 size={28} className="animate-spin text-purple-400" />
        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Montando catálogo...</p>
      </div>
    );
  }

  if (erro || !dados) {
    return (
      <div className="p-10 max-w-md mx-auto text-center text-white min-h-[50vh] flex flex-col items-center justify-center">
        <Package size={32} className="text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400 font-bold text-sm">{erro || 'Não foi possível gerar o catálogo.'}</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto text-white">
      <div className="print:hidden flex justify-end mb-6">
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 bg-purple-500 hover:bg-purple-600 text-white px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all">
          <Printer size={14} /> Imprimir / Salvar PDF
        </button>
      </div>

      <header className="flex items-center gap-4 mb-8 pb-8 border-b border-white/10">
        {dados.logoUrl && (
          <div className="bg-white rounded-2xl w-20 h-20 flex items-center justify-center overflow-hidden flex-shrink-0">
            <img src={dados.logoUrl} alt="" className="w-full h-full object-contain p-2" />
          </div>
        )}
        <div>
          <h1 className="text-3xl font-black uppercase italic tracking-tighter">{dados.empresaNome}</h1>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">Catálogo de Produtos e Serviços</p>
        </div>
      </header>

      {dados.intro && (
        <p className="text-slate-300 text-sm leading-relaxed mb-10 max-w-2xl">{dados.intro}</p>
      )}

      <div className="space-y-10">
        {dados.categorias.map(cat => (
          <div key={cat.nome} style={{ breakInside: 'avoid' }}>
            <h2 className="text-sm font-black uppercase tracking-widest text-purple-400 mb-4 pb-2 border-b border-white/5">{cat.nome}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {cat.produtos.map((p, i) => (
                <div key={i} style={{ breakInside: 'avoid' }} className="bg-[#0F172A] border border-white/10 rounded-2xl overflow-hidden">
                  <div className="h-28 bg-black/20 flex items-center justify-center overflow-hidden">
                    {p.imagem_url ? <img src={p.imagem_url} alt="" className="w-full h-full object-cover" /> : <Package size={22} className="text-slate-700" />}
                  </div>
                  <div className="p-3">
                    <p className="text-white text-xs font-bold leading-tight">{p.nome}</p>
                    <p className="text-[#22C55E] text-sm font-black mt-1">R$ {p.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
