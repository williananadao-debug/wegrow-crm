"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Brain, Search, X, Loader2, Download, Trash2, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { NexusCategoria, NexusArquivo, NEXUS_CATS, NEXUS_CAT_LABEL, NEXUS_CAT_BG, NexusIcon, NexusThumb } from '@/components/nexus-shared';

type ItemComCliente = NexusArquivo & { clientes: { id: number; nome_empresa: string } | null };

export default function NexusPage() {
  const auth = useAuth() || {};
  const authLoading = (auth as any).loading;
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  const user = auth.user;
  const isDirector = perfil?.cargo === 'diretor';
  const temNexus = Boolean(empresa?.modulos?.nexus);

  const [itens, setItens] = useState<ItemComCliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<'todos' | NexusCategoria>('todos');
  const [detalhe, setDetalhe] = useState<ItemComCliente | null>(null);

  const fetchTudo = async () => {
    setLoading(true);
    const { data } = await supabase.from('nexus_arquivos').select('*, clientes(id, nome_empresa)').order('created_at', { ascending: false });
    if (data) setItens(data as any);
    setLoading(false);
  };

  useEffect(() => {
    if (perfil?.empresa_id && temNexus) fetchTudo();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil?.empresa_id, temNexus]);

  const filtrados = itens.filter(item => {
    if (cat !== 'todos' && item.categoria !== cat) return false;
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    const hay = (item.titulo + ' ' + item.tags.join(' ') + ' ' + (item.clientes?.nome_empresa || '')).toLowerCase();
    return hay.includes(q);
  });

  const handleDelete = async (item: ItemComCliente) => {
    if (!confirm(`Excluir "${item.titulo}"? Essa ação não pode ser desfeita.`)) return;
    await supabase.storage.from('nexus').remove([item.arquivo_path]);
    const { error } = await supabase.from('nexus_arquivos').delete().eq('id', item.id);
    if (!error) {
      setItens(prev => prev.filter(i => i.id !== item.id));
      setDetalhe(null);
    }
  };

  if (authLoading) {
    return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600"/></div>;
  }

  if (!temNexus) {
    return (
      <div className="p-4 md:p-8 pb-20 text-white">
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <Brain size={32} className="text-slate-600 mx-auto mb-3"/>
          <p className="text-slate-400 font-bold text-sm">O módulo Nexus não está ativo pra sua empresa ainda.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 pb-20 text-white">
      <header className="mb-6">
        <h1 className="text-4xl font-black tracking-tighter uppercase italic text-indigo-400 flex items-center gap-3">
          <Brain size={32}/> Nexus
        </h1>
        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Fotos, documentos, layouts e manutenções — em todos os clientes</p>
      </header>

      <div className="flex items-center gap-2 mb-4">
        <div className="flex-1 flex items-center gap-2 bg-[#0F172A] border border-white/10 rounded-xl px-4 py-3 focus-within:border-indigo-400 transition-all">
          <Search size={16} className="text-slate-500 flex-shrink-0"/>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar por equipamento, peça, cliente, tag..."
            className="flex-1 bg-transparent outline-none text-white text-sm"
          />
        </div>
        <span className="text-[11px] text-slate-500 font-bold whitespace-nowrap">{filtrados.length} {filtrados.length === 1 ? 'item' : 'itens'}</span>
      </div>

      <div className="flex gap-1.5 flex-wrap mb-6">
        {NEXUS_CATS.map(c => (
          <button key={c.key} type="button" onClick={() => setCat(c.key)} className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${cat === c.key ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300' : 'bg-white/[0.02] border-white/10 text-slate-500 hover:text-white'}`}>
            {c.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-slate-600"/></div>
      ) : filtrados.length === 0 ? (
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-16 text-center">
          <Brain size={32} className="text-slate-600 mx-auto mb-3"/>
          <p className="text-slate-400 font-bold text-sm">{itens.length === 0 ? 'Nada no Nexus ainda.' : 'Nada encontrado pra essa busca.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filtrados.map(item => (
            <button key={item.id} type="button" onClick={() => setDetalhe(item)} className="bg-[#0F172A] border border-white/5 hover:border-white/20 rounded-2xl overflow-hidden text-left transition-all">
              <div className={`h-20 flex items-center justify-center overflow-hidden ${NEXUS_CAT_BG[item.categoria]}`}>
                <NexusThumb categoria={item.categoria} arquivoUrl={item.arquivo_url} titulo={item.titulo} size={24} />
              </div>
              <div className="p-3">
                <p className="text-[11px] font-bold text-white truncate">{item.titulo}</p>
                <p className="text-[9px] text-indigo-400 font-black uppercase tracking-widest truncate mt-1">{item.clientes?.nome_empresa || 'Cliente removido'}</p>
                <p className="text-[8px] text-slate-500 mt-0.5">{new Date(item.created_at).toLocaleDateString('pt-BR')}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {detalhe && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4" onClick={() => setDetalhe(null)}>
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className={`h-32 flex items-center justify-center relative overflow-hidden ${NEXUS_CAT_BG[detalhe.categoria]}`}>
              <NexusThumb categoria={detalhe.categoria} arquivoUrl={detalhe.arquivo_url} titulo={detalhe.titulo} size={36} />
              <button onClick={() => setDetalhe(null)} className="absolute top-3 right-3 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5"><X size={14}/></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-indigo-400">{NEXUS_CAT_LABEL[detalhe.categoria]}</p>
                <p className="text-white font-black text-sm mt-0.5">{detalhe.titulo}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white/5 rounded-lg p-2">
                  <p className="text-[8px] font-black uppercase text-slate-500">Adicionado em</p>
                  <p className="text-[11px] text-slate-300 font-bold">{new Date(detalhe.created_at).toLocaleDateString('pt-BR')}</p>
                </div>
                <div className="bg-white/5 rounded-lg p-2">
                  <p className="text-[8px] font-black uppercase text-slate-500">Responsável</p>
                  <p className="text-[11px] text-slate-300 font-bold truncate">{detalhe.responsavel_nome || '—'}</p>
                </div>
              </div>
              {detalhe.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {detalhe.tags.map((t, i) => <span key={i} className="text-[9px] font-bold bg-white/5 text-slate-400 px-2 py-1 rounded-md">{t}</span>)}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <a href={detalhe.arquivo_url} target="_blank" rel="noopener noreferrer" className="flex-1 bg-white/5 hover:bg-white/10 text-slate-300 font-black uppercase text-[10px] py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all">
                  <Download size={13}/> Abrir arquivo
                </a>
                {(isDirector || detalhe.user_id === user?.id) && (
                  <button onClick={() => handleDelete(detalhe)} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 rounded-xl transition-all">
                    <Trash2 size={14}/>
                  </button>
                )}
              </div>
              {detalhe.clientes && (
                <Link href={`/customers?abrirCliente=${detalhe.clientes.id}&aba=nexus`} className="w-full bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 font-black uppercase text-[10px] py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all">
                  Ver cadastro de {detalhe.clientes.nome_empresa} <ArrowRight size={12}/>
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
