"use client";
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Loader2, ArrowUp, Bot, User as UserIcon } from 'lucide-react';
import ArgusTopNav from '../ArgusTopNav';
import { fetchJsonSeguro } from '../shared';

type Mensagem = { role: 'user' | 'assistant'; content: string };

const SUGESTOES = [
  'Quais editais estou acompanhando agora?',
  'Tem algum prazo vencendo essa semana?',
  'Qual o resumo financeiro do mês?',
  'Busca pregões eletrônicos novos em SC',
];

export default function ArgusAgentePage() {
  const auth = useAuth() || {};
  const empresa = auth.empresa;

  const [mensagens, setMensagens] = useState<Mensagem[]>([
    { role: 'assistant', content: 'Olá! Sou o Agente Argus. Posso consultar seus editais, alertas, financeiro e buscar direto no PNCP. O que você quer saber?' },
  ]);
  const [input, setInput] = useState('');
  const [enviando, setEnviando] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [mensagens, enviando]);

  const enviar = async (texto?: string) => {
    const conteudo = (texto ?? input).trim();
    if (!conteudo || enviando) return;
    const novasMensagens: Mensagem[] = [...mensagens, { role: 'user', content: conteudo }];
    setMensagens(novasMensagens);
    setInput('');
    setEnviando(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { ok, json } = await fetchJsonSeguro('/api/argus/agente/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ mensagens: novasMensagens }),
      });
      setMensagens(prev => [...prev, { role: 'assistant', content: ok ? (json.resposta || 'Sem resposta.') : `Erro: ${json.erro || json.error}` }]);
    } catch {
      setMensagens(prev => [...prev, { role: 'assistant', content: 'Erro ao falar com o agente. Tenta de novo.' }]);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div>
      <ArgusTopNav nomeEmpresa={empresa?.nome} />
      <main className="max-w-[1000px] mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-[#241c14] mb-1" style={{ fontFamily: 'var(--font-argus-serif)' }}>Agente de Análise</h1>
        <p className="text-[#6b6862] text-sm mb-6">Pergunte sobre seus editais, alertas ou financeiro — o agente consulta seus dados reais e o PNCP ao vivo.</p>

        <div className="flex flex-wrap gap-2 mb-4">
          {SUGESTOES.map(s => (
            <button key={s} onClick={() => enviar(s)} disabled={enviando}
              className="text-[13px] font-semibold text-[#6b6862] bg-white border border-[#e5e0d5] hover:border-[#d9861c]/50 hover:text-[#d9861c] px-3 py-1.5 rounded-full transition-all disabled:opacity-50">
              {s}
            </button>
          ))}
        </div>

        <div className="bg-white border border-[#e5e0d5] rounded-2xl shadow-sm flex flex-col" style={{ height: '520px' }}>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
            {mensagens.map((m, i) => (
              <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${m.role === 'user' ? 'bg-[#241c14]' : 'bg-[#fdf0d4]'}`}>
                  {m.role === 'user' ? <UserIcon size={13} className="text-white" /> : <Bot size={13} className="text-[#d9861c]" />}
                </div>
                <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-[#241c14] text-white' : 'bg-[#f7f6f3] text-[#241c14]'}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {enviando && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-[#fdf0d4] flex items-center justify-center flex-shrink-0"><Bot size={13} className="text-[#d9861c]" /></div>
                <div className="px-4 py-2.5 rounded-2xl bg-[#f7f6f3]"><Loader2 size={14} className="animate-spin text-[#9a958a]" /></div>
              </div>
            )}
          </div>
          <div className="border-t border-[#e5e0d5] p-3 flex items-center gap-2">
            <input
              value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') enviar(); }}
              placeholder="Pergunte sobre licitações, contratos, financeiro…"
              disabled={enviando}
              className="flex-1 bg-[#faf7f2] border border-[#e5e0d5] rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#d9861c] disabled:opacity-50"
            />
            <button onClick={() => enviar()} disabled={enviando || !input.trim()} className="w-10 h-10 rounded-xl bg-[#d9861c] hover:bg-[#c47716] disabled:opacity-50 text-white flex items-center justify-center flex-shrink-0 transition-all">
              <ArrowUp size={16} />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
