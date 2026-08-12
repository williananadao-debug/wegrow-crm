"use client";
import { useState, useEffect, useRef } from 'react';
import { Loader2, Bot, Send, Paperclip, Activity, Sparkles, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import NotaFiscalModal from '@/components/NotaFiscalModal';
import { ServicoConfig } from '@/app/pulse/shared';

type Mensagem = { role: 'user' | 'assistant'; content: string; leadsGerados?: number; materialGerado?: boolean };

const SUGESTOES = [
  'Tem cliente parado que eu deveria resgatar?',
  'Algum contrato vencendo que eu preciso renovar?',
  'Me dá uma lista de clientes novos pra abordar',
  'Monta o catálogo de vendas pra eu imprimir',
];

export default function ThorPage() {
  const auth = useAuth() || {};
  const authLoading = (auth as any).loading;
  const user = auth.user;
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  const temThor = Boolean(empresa?.modulos?.thor);

  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [input, setInput] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  const [servicos, setServicos] = useState<ServicoConfig[]>([]);
  const [notaModalAberto, setNotaModalAberto] = useState(false);

  useEffect(() => {
    if (!perfil?.empresa_id) return;
    supabase.from('servicos').select('*').eq('empresa_id', perfil.empresa_id).then(({ data }) => { if (data) setServicos(data as ServicoConfig[]); });
  }, [perfil?.empresa_id]);

  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [mensagens, enviando]);

  const enviar = async (texto?: string) => {
    const conteudo = (texto ?? input).trim();
    if (!conteudo || enviando) return;
    setErro(null);
    const novaHistoria: Mensagem[] = [...mensagens, { role: 'user', content: conteudo }];
    setMensagens(novaHistoria);
    setInput('');
    setEnviando(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');
      const res = await fetch('/api/thor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ mensagens: novaHistoria.map(m => ({ role: m.role, content: m.content })) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao falar com a THOR.');
      setMensagens(prev => [...prev, { role: 'assistant', content: json.resposta || '...', leadsGerados: json.leadsGerados || 0, materialGerado: Boolean(json.materialGerado) }]);
    } catch (err: any) {
      setErro(err?.message || 'Erro ao falar com a THOR.');
    } finally {
      setEnviando(false);
    }
  };

  if (authLoading) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;

  if (!temThor) {
    return (
      <div className="p-4 md:p-8 pb-20 text-white">
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <Bot size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-sm">A THOR não está ativa pra sua empresa ainda.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 pb-20 text-white flex flex-col h-[calc(100vh-2rem)] md:h-screen max-w-3xl mx-auto">
      <header className="mb-4 flex-shrink-0">
        <h1 className="text-4xl font-black tracking-tighter uppercase italic text-purple-400 flex items-center gap-3">
          <Bot size={32} /> THOR
        </h1>
        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Sua assistente de IA de vendas</p>
      </header>

      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {mensagens.length === 0 && (
          <div className="space-y-3">
            <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4 text-slate-300 text-sm">
              Oi! Eu sou a THOR. Consigo gerar lista de clientes pra retomar contato (resgate, contratos vencendo, primeira compra) e ler nota fiscal de fornecedor por foto pra já dar entrada no estoque e lançar a despesa.
            </div>
            <div className="flex flex-wrap gap-2">
              {SUGESTOES.map(s => (
                <button key={s} onClick={() => enviar(s)} className="bg-purple-500/10 border border-purple-500/30 text-purple-300 hover:bg-purple-500/20 px-3 py-2 rounded-xl text-xs font-bold text-left">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {mensagens.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${m.role === 'user' ? 'bg-[#22C55E] text-[#0B1120] font-semibold' : 'bg-[#0F172A] border border-white/10 text-slate-200'}`}>
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.role === 'assistant' && (m.leadsGerados || 0) > 0 && (
                <Link href="/deals" className="mt-2 inline-flex items-center gap-1.5 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-[#22C55E]">
                  <Sparkles size={11} /> {m.leadsGerados} leads criados <ExternalLink size={10} />
                </Link>
              )}
              {m.role === 'assistant' && m.materialGerado && (
                <Link href="/thor/catalogo" target="_blank" className="mt-2 inline-flex items-center gap-1.5 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-[#22C55E]">
                  <Sparkles size={11} /> Ver catálogo de vendas <ExternalLink size={10} />
                </Link>
              )}
            </div>
          </div>
        ))}

        {enviando && (
          <div className="flex justify-start">
            <div className="bg-[#0F172A] border border-white/10 rounded-2xl px-4 py-3 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-purple-400" />
              <span className="text-slate-500 text-xs font-bold">THOR está pensando...</span>
            </div>
          </div>
        )}

        {erro && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold p-3 rounded-xl">{erro}</div>}
        <div ref={fimRef} />
      </div>

      <div className="flex-shrink-0 flex items-center gap-2 bg-[#0F172A] border border-white/10 rounded-2xl p-2">
        <button onClick={() => setNotaModalAberto(true)} title="Dar entrada por nota fiscal" className="p-2.5 text-slate-400 hover:text-purple-400 hover:bg-white/5 rounded-xl transition-colors flex-shrink-0">
          <Paperclip size={18} />
        </button>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
          placeholder="Pergunte alguma coisa pra THOR..."
          className="flex-1 bg-transparent outline-none text-white text-sm px-2"
        />
        <button onClick={() => enviar()} disabled={enviando || !input.trim()} className="p-2.5 bg-purple-500 hover:bg-purple-600 disabled:opacity-40 text-white rounded-xl transition-colors flex-shrink-0">
          <Send size={16} />
        </button>
      </div>

      <NotaFiscalModal
        aberto={notaModalAberto}
        onFechar={() => setNotaModalAberto(false)}
        servicos={servicos}
        empresaId={perfil?.empresa_id}
        userId={user?.id}
        onConcluido={(resumo) => {
          setMensagens(prev => [...prev, { role: 'assistant', content: `✅ Nota fiscal lançada${resumo.fornecedor ? ` — ${resumo.fornecedor}` : ''}: R$ ${resumo.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}, ${resumo.itens} ${resumo.itens === 1 ? 'item atualizado' : 'itens atualizados'} no estoque.` }]);
          supabase.from('servicos').select('*').eq('empresa_id', perfil?.empresa_id).then(({ data }) => { if (data) setServicos(data as ServicoConfig[]); });
        }}
      />
    </div>
  );
}
