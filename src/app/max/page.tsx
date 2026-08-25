"use client";
import { useState, useEffect, useRef } from 'react';
import { Loader2, Radio, Send, Sparkles, CheckCircle2, ExternalLink, Trash2, MessageCircle, Download } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';

type Mensagem = { role: 'user' | 'assistant'; content: string; propostas?: PropostaResposta[] | null; empresa?: string | null };
type ItemProposta = { produto: string; especificacao?: string; emissora?: string; quantidade: number; valor_unitario: number };
type PropostaResposta = { titulo: string; corpo: string; itens?: ItemProposta[]; valor_total?: number };
type ClienteInfo = { id: number; nome_empresa: string; telefone?: string | null; cidade?: string | null; cnpj?: string | null };

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
  const [telefonesCliente, setTelefonesCliente] = useState<Record<number, string>>({});
  const [clientesExistentes, setClientesExistentes] = useState<ClienteInfo[]>([]);
  const [confirmacao, setConfirmacao] = useState<Record<string, { sugerido: ClienteInfo | null; escolha: number | 'novo' | null }>>({});
  const [baixandoPptx, setBaixandoPptx] = useState<number | null>(null);
  const [erroPptx, setErroPptx] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [mensagens, enviando]);

  useEffect(() => {
    if (!perfil?.empresa_id) return;
    supabase.from('clientes').select('id, nome_empresa, telefone, cidade, cnpj').eq('empresa_id', perfil.empresa_id)
      .then(({ data }) => { if (data) setClientesExistentes(data); });
  }, [perfil?.empresa_id]);

  // Mesmo padrão de casamento por nome usado no NotaFiscalModal — evita duplicar cadastro
  // de cliente quando o nome vem escrito ligeiramente diferente entre conversas.
  const normalizarNome = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  const acharClienteParecido = (nome: string) => {
    const alvo = normalizarNome(nome);
    if (!alvo) return null;
    const exato = clientesExistentes.find(c => normalizarNome(c.nome_empresa) === alvo);
    if (exato) return exato;
    const parcial = clientesExistentes.find(c => normalizarNome(c.nome_empresa).includes(alvo) || alvo.includes(normalizarNome(c.nome_empresa)));
    return parcial || null;
  };

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

  // 1º clique: só levanta o candidato e mostra o card de validação — não cria nada ainda.
  const iniciarConfirmacaoCliente = (msgIndex: number, propIndex: number) => {
    const msg = mensagens[msgIndex];
    const nomeEmpresa = msg.empresa || '';
    const sugerido = acharClienteParecido(nomeEmpresa);
    const chave = `${msgIndex}-${propIndex}`;
    setConfirmacao(prev => ({ ...prev, [chave]: { sugerido, escolha: sugerido ? sugerido.id : 'novo' } }));
  };

  const criarLead = async (msgIndex: number, propIndex: number) => {
    const msg = mensagens[msgIndex];
    const prop = msg.propostas?.[propIndex];
    if (!prop) return;
    const chave = `${msgIndex}-${propIndex}`;
    const escolha = confirmacao[chave]?.escolha;
    setCriandoLead(msgIndex * 100 + propIndex);
    try {
      const nomeEmpresa = msg.empresa || 'Lead do Max';
      let clientId: number | null = null;
      let nomeParaLead = nomeEmpresa;

      if (typeof escolha === 'number') {
        const escolhido = clientesExistentes.find(c => c.id === escolha);
        clientId = escolha;
        nomeParaLead = escolhido?.nome_empresa || nomeEmpresa;
      } else {
        const { data: novoCliente, error: erroCliente } = await supabase.from('clientes').insert([{
          nome_empresa: nomeEmpresa, status: 'ativo', status_risco: 'em_analise', empresa_id: perfil?.empresa_id,
        }]).select('id, nome_empresa').single();
        if (!erroCliente && novoCliente) {
          clientId = novoCliente.id;
          setClientesExistentes(prev => [...prev, novoCliente]);
        }
      }

      const itensPayload = (prop.itens || []).map(i => ({
        servico: i.especificacao ? `${i.produto} — ${i.especificacao}${i.emissora ? ` (${i.emissora})` : ''}` : i.produto,
        quantidade: i.quantidade,
        precoUnitario: i.valor_unitario,
      }));
      const valorTotal = itensPayload.reduce((acc, i) => acc + i.quantidade * i.precoUnitario, 0);

      const { data: leadData, error } = await supabase.from('leads').insert([{
        empresa: nomeParaLead,
        client_id: clientId,
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

  // O .pptx traz até 4 propostas (1/2 no slide 7, 3/4 no slide 8 — o slide 8 some do
  // pacote quando são só 1 ou 2) — por isso é 1 download por mensagem, não 1 por card.
  const baixarPptx = async (msgIndex: number) => {
    const msg = mensagens[msgIndex];
    if (!msg.propostas || msg.propostas.length === 0) return;
    setErroPptx(null);
    setBaixandoPptx(msgIndex);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');
      const res = await fetch('/api/max/proposta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({
          empresa: msg.empresa,
          propostas: msg.propostas.map(p => ({ titulo: p.titulo, corpo: p.corpo })),
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.erro || 'Erro ao gerar o arquivo.');
      }
      const avisosHeader = res.headers.get('X-Pptx-Avisos');
      if (avisosHeader) {
        try {
          const avisos: string[] = JSON.parse(decodeURIComponent(avisosHeader));
          if (avisos.length > 0) alert(avisos.join('\n\n'));
        } catch { /* ignora header malformado — não impede o download */ }
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Proposta - ${msg.empresa || 'Cliente'}.pptx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setErroPptx(err?.message || 'Erro ao gerar o arquivo.');
    } finally {
      setBaixandoPptx(null);
    }
  };

  const enviarPropostaWhatsapp = (msgIndex: number, prop: PropostaResposta, empresaNome?: string | null) => {
    const telefone = (telefonesCliente[msgIndex] || '').replace(/\D/g, '');
    if (!telefone) return;
    const saudacao = `Olá${empresaNome ? `, time da ${empresaNome}` : ''}! Segue a proposta ${prop.titulo}:\n\n`;
    const mensagem = saudacao + prop.corpo;
    window.open(`https://wa.me/55${telefone.replace(/^55/, '')}?text=${encodeURIComponent(mensagem)}`, '_blank');
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
                  <button
                    onClick={() => baixarPptx(mi)}
                    disabled={baixandoPptx === mi}
                    className="w-full flex items-center justify-center gap-2 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors"
                  >
                    {baixandoPptx === mi ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                    Baixar proposta em PPTX
                  </button>
                  {erroPptx && baixandoPptx === null && (
                    <p className="text-red-400 text-[10px] font-bold">{erroPptx}</p>
                  )}
                  <div>
                    <label className="text-[9px] font-black uppercase text-slate-500 tracking-widest">WhatsApp do cliente (pra enviar a proposta)</label>
                    <input
                      type="tel" placeholder="47999999999"
                      value={telefonesCliente[mi] || ''}
                      onChange={e => setTelefonesCliente(prev => ({ ...prev, [mi]: e.target.value }))}
                      className="w-full mt-1 bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-xs outline-none focus:border-rose-500"
                    />
                  </div>
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
                        <div className="flex items-center justify-between border-t border-white/5 pt-2.5 gap-2 flex-wrap">
                          <span className="text-white font-black text-sm">R$ {(p.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          <div className="flex items-center gap-2 flex-wrap">
                            <button onClick={() => enviarPropostaWhatsapp(mi, p, m.empresa)} disabled={!(telefonesCliente[mi] || '').trim()} className="bg-green-600/20 hover:bg-green-600/30 disabled:opacity-30 disabled:cursor-not-allowed border border-green-500/30 text-green-400 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                              <MessageCircle size={11} /> Enviar WhatsApp
                            </button>
                            {!leadId && !confirmacao[chave] && (
                              <button onClick={() => iniciarConfirmacaoCliente(mi, pi)} className="bg-rose-500 hover:bg-rose-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                                <Sparkles size={11} /> Criar lead com esta proposta
                              </button>
                            )}
                          </div>
                        </div>

                        {leadId && (
                          <div className="mt-3 pt-3 border-t border-white/5 flex justify-end">
                            <Link href="/deals" className="inline-flex items-center gap-1.5 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-[#22C55E]">
                              <CheckCircle2 size={11} /> Lead criado <ExternalLink size={10} />
                            </Link>
                          </div>
                        )}

                        {!leadId && confirmacao[chave] && (
                          <div className="mt-3 pt-3 border-t border-white/5 space-y-2.5">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Confirme o cliente antes de criar o lead</p>
                            {confirmacao[chave].sugerido ? (
                              <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-3">
                                <p className="text-amber-300 text-xs font-bold">Achamos um cliente parecido no cadastro:</p>
                                <p className="text-white text-sm font-black mt-1">{confirmacao[chave].sugerido!.nome_empresa}</p>
                                <p className="text-slate-400 text-[10px] mt-0.5">
                                  {confirmacao[chave].sugerido!.telefone || 'sem telefone'} · {confirmacao[chave].sugerido!.cidade || 'sem cidade'}{confirmacao[chave].sugerido!.cnpj ? ` · ${confirmacao[chave].sugerido!.cnpj}` : ''}
                                </p>
                              </div>
                            ) : (
                              <p className="text-slate-400 text-[11px]">Nenhum cliente parecido encontrado no cadastro — vai criar um novo com o nome "{m.empresa}".</p>
                            )}
                            <select
                              value={String(confirmacao[chave].escolha ?? 'novo')}
                              onChange={e => setConfirmacao(prev => ({ ...prev, [chave]: { ...prev[chave], escolha: e.target.value === 'novo' ? 'novo' : Number(e.target.value) } }))}
                              className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white outline-none focus:border-rose-500"
                            >
                              <option value="novo" className="bg-[#0B1120]">+ Criar cliente novo "{m.empresa}"</option>
                              {clientesExistentes.map(c => (
                                <option key={c.id} value={c.id} className="bg-[#0B1120]">Usar cliente existente: {c.nome_empresa}</option>
                              ))}
                            </select>
                            <div className="flex gap-2">
                              <button onClick={() => setConfirmacao(prev => { const cp = { ...prev }; delete cp[chave]; return cp; })} className="flex-1 text-slate-500 hover:text-white text-[10px] font-bold uppercase tracking-widest py-2">Cancelar</button>
                              <button onClick={() => criarLead(mi, pi)} disabled={criandoLead === mi * 100 + pi} className="flex-1 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5">
                                {criandoLead === mi * 100 + pi ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                                Confirmar e criar lead
                              </button>
                            </div>
                          </div>
                        )}
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
          <button onClick={() => { setMensagens([]); setErro(null); setLeadsCriados({}); setConfirmacao({}); setTelefonesCliente({}); }} title="Nova conversa" className="p-2.5 text-slate-400 hover:text-rose-400 hover:bg-white/5 rounded-xl transition-colors flex-shrink-0">
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
