"use client";
import { useState, useEffect, useRef } from 'react';
import { Loader2, Radio, Send, Sparkles, CheckCircle2, ExternalLink, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';

type Mensagem = { role: 'user' | 'assistant'; content: string; propostas?: PropostaResposta[] | null; empresa?: string | null };
type ItemProposta = { produto: string; especificacao?: string; emissora?: string; quantidade: number; valor_unitario: number };
type PropostaResposta = { titulo: string; corpo: string; itens?: ItemProposta[]; valor_total?: number };

const SUGESTOES = [
  'Quero montar uma proposta pra um cliente novo',
  'Tenho um lead que quer divulgar um evento',
  'Cliente pequeno, verba baixa, o que ofereço?',
];

export default function MaxPage() {
  const auth = useAuth() || {};
  const authLoading = (auth as any).loading;
  const user = auth.user;
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  const temMax = Boolean(empresa?.modulos?.max);

  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [input, setInput] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [criandoLead, setCriandoLead] = useState<number | null>(null);
  const [leadsCriados, setLeadsCriados] = useState<Record<string, number>>({});
  const fimRef = useRef<HTMLDivElement>(null);

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
      const res = await fetch('/api/max/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ mensagens: novaHistoria.map(m => ({ role: m.role, content: m.content })) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao falar com o Max.');
      setMensagens(prev => [...prev, { role: 'assistant', content: json.resposta || '...', propostas: json.propostas, empresa: json.empresa }]);
    } catch (err: any) {
      setErro(err?.message || 'Erro ao falar com o Max.');
    } finally {
      setEnviando(false);
    }
  };

  const atualizarItem = (msgIndex: number, propIndex: number, itemIndex: number, patch: Partial<ItemProposta>) => {
    setMensagens(prev => prev.map((m, i) => {
      if (i !== msgIndex || !m.propostas) return m;
      const propostas = m.propostas.map((p, pi) => {
        if (pi !== propIndex || !p.itens) return p;
        const itens = p.itens.map((it, ii) => ii === itemIndex ? { ...it, ...patch } : it);
        const valor_total = itens.reduce((acc, it) => acc + it.quantidade * it.valor_unitario, 0);
        return { ...p, itens, valor_total };
      });
      return { ...m, propostas };
    }));
  };

  const criarLead = async (msgIndex: number, propIndex: number) => {
    const msg = mensagens[msgIndex];
    const prop = msg.propostas?.[propIndex];
    if (!prop) return;
    const chave = `${msgIndex}-${propIndex}`;
    setCriandoLead(msgIndex * 100 + propIndex);
    try {
      const itensPayload = (prop.itens || []).map(i => ({
        servico: i.especificacao ? `${i.produto} — ${i.especificacao}${i.emissora ? ` (${i.emissora})` : ''}` : i.produto,
        quantidade: i.quantidade,
        precoUnitario: i.valor_unitario,
      }));
      const valorTotal = itensPayload.reduce((acc, i) => acc + i.quantidade * i.precoUnitario, 0);

      const { data: leadData, error } = await supabase.from('leads').insert([{
        empresa: msg.empresa || 'Lead do Max',
        itens: itensPayload,
        valor_total: valorTotal,
        status: 'aberto',
        etapa: 0,
        tipo: 'Max',
        descricao: `${prop.titulo}\n\n${prop.corpo}`,
        unidade: perfil?.unidade || null,
        user_id: user?.id,
        criado_por: user?.id,
        empresa_id: perfil?.empresa_id,
      }]).select('id').single();
      if (error) throw error;

      setLeadsCriados(prev => ({ ...prev, [chave]: leadData.id }));
    } catch (err: any) {
      setErro(err?.message || 'Erro ao criar lead.');
    } finally {
      setCriandoLead(null);
    }
  };

  if (authLoading) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;

  if (!temMax) {
    return (
      <div className="p-4 md:p-8 pb-20 text-white">
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <Radio size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-sm">O Max não está ativo pra sua empresa ainda.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 pb-20 text-white flex flex-col h-[calc(100vh-2rem)] md:h-screen max-w-3xl mx-auto">
      <header className="mb-4 flex-shrink-0">
        <h1 className="text-4xl font-black tracking-tighter uppercase italic text-rose-400 flex items-center gap-3">
          <Radio size={32} /> Max
        </h1>
        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Consultor de vendas — Demais FM</p>
      </header>

      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {mensagens.length === 0 && (
          <div className="space-y-3">
            <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4 text-slate-300 text-sm">
              Olá! Vamos montar a melhor proposta para o seu cliente 🎯 Me conta: qual é o nome da empresa e o que ela faz? E o que o cliente quer alcançar com a divulgação?
            </div>
            <div className="flex flex-wrap gap-2">
              {SUGESTOES.map(s => (
                <button key={s} onClick={() => enviar(s)} className="bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 px-3 py-2 rounded-xl text-xs font-bold text-left">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {mensagens.map((m, mi) => (
          <div key={mi} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm ${m.role === 'user' ? 'bg-[#22C55E] text-[#0B1120] font-semibold' : 'bg-[#0F172A] border border-white/10 text-slate-200'}`}>
              <p className="whitespace-pre-wrap">{m.content}</p>

              {m.propostas && m.propostas.length > 0 && (
                <div className="mt-4 space-y-3">
                  {m.propostas.map((p, pi) => {
                    const chave = `${mi}-${pi}`;
                    const leadId = leadsCriados[chave];
                    const semItens = !p.itens || p.itens.length === 0;
                    return (
                      <div key={pi} className="bg-black/30 border border-rose-500/20 rounded-2xl p-4">
                        <p className="text-rose-300 font-black text-xs uppercase tracking-widest mb-2">{p.titulo}</p>
                        {semItens ? (
                          <p className="text-amber-400 text-[10px] font-bold mb-2">⚠️ O Max não estruturou os itens dessa proposta — confira o texto abaixo e crie o lead manualmente se precisar.</p>
                        ) : (
                          <div className="space-y-1.5 mb-3">
                            {p.itens!.map((item, ii) => (
                              <div key={ii} className="flex items-center gap-2 bg-white/5 rounded-lg px-2.5 py-1.5">
                                <span className="flex-1 text-[11px] text-slate-300 truncate">{item.produto}{item.especificacao ? ` — ${item.especificacao}` : ''}{item.emissora ? ` (${item.emissora})` : ''}</span>
                                <input type="number" min="1" value={item.quantidade} onChange={e => atualizarItem(mi, pi, ii, { quantidade: Number(e.target.value) })} className="w-12 bg-black/40 border border-white/10 rounded px-1 py-0.5 text-[10px] text-white text-center outline-none" />
                                <span className="text-slate-600 text-[10px]">×</span>
                                <input type="number" step="0.01" min="0" value={item.valor_unitario} onChange={e => atualizarItem(mi, pi, ii, { valor_unitario: Number(e.target.value) })} className="w-20 bg-black/40 border border-white/10 rounded px-1 py-0.5 text-[10px] text-white text-center outline-none" />
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center justify-between border-t border-white/5 pt-2.5">
                          <span className="text-white font-black text-sm">R$ {(p.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          {leadId ? (
                            <Link href="/deals" className="inline-flex items-center gap-1.5 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-[#22C55E]">
                              <CheckCircle2 size={11} /> Lead criado <ExternalLink size={10} />
                            </Link>
                          ) : (
                            <button onClick={() => criarLead(mi, pi)} disabled={criandoLead === mi * 100 + pi} className="bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                              {criandoLead === mi * 100 + pi ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                              Criar lead com esta proposta
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}

        {enviando && (
          <div className="flex justify-start">
            <div className="bg-[#0F172A] border border-white/10 rounded-2xl px-4 py-3 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-rose-400" />
              <span className="text-slate-500 text-xs font-bold">Max está pensando...</span>
            </div>
          </div>
        )}

        {erro && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold p-3 rounded-xl">{erro}</div>}
        <div ref={fimRef} />
      </div>

      <div className="flex-shrink-0 flex items-center gap-2 bg-[#0F172A] border border-white/10 rounded-2xl p-2">
        {mensagens.length > 0 && (
          <button onClick={() => { setMensagens([]); setErro(null); setLeadsCriados({}); }} title="Nova conversa" className="p-2.5 text-slate-400 hover:text-rose-400 hover:bg-white/5 rounded-xl transition-colors flex-shrink-0">
            <Trash2 size={18} />
          </button>
        )}
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
          placeholder="Conta sobre o cliente pro Max..."
          className="flex-1 bg-transparent outline-none text-white text-sm px-2"
        />
        <button onClick={() => enviar()} disabled={enviando || !input.trim()} className="p-2.5 bg-rose-500 hover:bg-rose-600 disabled:opacity-40 text-white rounded-xl transition-colors flex-shrink-0">
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
