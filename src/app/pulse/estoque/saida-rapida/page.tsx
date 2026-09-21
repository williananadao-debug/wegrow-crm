"use client";
import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { Loader2, Activity, ArrowLeft, ScanLine, CheckCircle2, XCircle, PackageMinus, Minus, Plus, Trash2, Printer, Undo2, Zap, ClipboardList, Volume2, VolumeX } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ordenarPorNome } from '@/lib/ordenacao';
import { usePulseAccess } from '../../usePulseAccess';
import { ServicoConfig, alertarEstoqueBaixoSeCruzou } from '../../shared';

type Leitura = { id: string; nome: string; sku: string; ok: boolean; mensagem: string; hora: string; servicoId?: number; movimentoId?: number; desfeita?: boolean };
type Linha = { servicoId: number; nome: string; sku: string; unidade: string; saldo: number; quantidade: number };
type Comprovante = { codigo: string; data: string; solicitante: string; motivo: string; destino: string; observacao: string; linhas: (Linha & { saldoDepois: number })[] };

const MOTIVOS = [
  { v: 'producao', l: 'Uso em produção / obra' }, { v: 'uso_interno', l: 'Uso interno' }, { v: 'perda', l: 'Perda / quebra' },
  { v: 'retrabalho', l: 'Retrabalho' }, { v: 'amostra', l: 'Amostra / brinde' },
];
const MOTIVO_LABEL = Object.fromEntries(MOTIVOS.map(m => [m.v, m.l]));

// Bip curto de confirmação / erro (WebAudio, sem arquivo) — quem opera o leitor não olha pra tela.
function bip(ok: boolean) {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx(); const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = ok ? 880 : 220; g.gain.value = 0.08;
    o.start(); o.stop(ctx.currentTime + (ok ? 0.09 : 0.3));
  } catch { /* sem áudio, segue */ }
}

// Saída de estoque do dia a dia. Dois modos:
//  • Requisição (padrão): bipa vários itens, ajusta a quantidade, escolhe motivo/destino/produção e
//    confirma tudo de uma vez — sai um comprovante com código. Cada saída fica ligada à requisição.
//  • Imediato: o antigo "1 bip = 1 unidade", pra bancada com item avulso; com desfazer.
// Ajuste manual de quantidade exata continua só em /pulse/estoque (diretor/gerente).
export default function SaidaRapidaPage() {
  const { authLoading, temPulse, user, perfil } = usePulseAccess();
  const [servicos, setServicos] = useState<ServicoConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [modo, setModo] = useState<'requisicao' | 'imediato'>('requisicao');
  const [som, setSom] = useState(true);
  const [codigo, setCodigo] = useState('');
  const [processando, setProcessando] = useState(false);
  const [leituras, setLeituras] = useState<Leitura[]>([]);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [motivo, setMotivo] = useState('producao');
  const [destino, setDestino] = useState('');
  const [producaoId, setProducaoId] = useState('');
  const [observacao, setObservacao] = useState('');
  const [producoes, setProducoes] = useState<{ id: number; produto_final_nome: string }[]>([]);
  const [comprovante, setComprovante] = useState<Comprovante | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!perfil?.empresa_id) return;
    Promise.all([
      supabase.from('servicos').select('*').eq('empresa_id', perfil.empresa_id).not('estoque', 'is', null),
      supabase.from('pulse_producoes').select('id, produto_final_nome').eq('empresa_id', perfil.empresa_id).eq('status', 'em_producao').order('created_at', { ascending: false }).limit(60),
    ]).then(([s, p]) => {
      if (s.data) setServicos(ordenarPorNome(s.data as ServicoConfig[]));
      if (p.data) setProducoes(p.data as { id: number; produto_final_nome: string }[]);
      setLoading(false);
    });
  }, [perfil?.empresa_id]);

  useEffect(() => { inputRef.current?.focus(); }, [loading, comprovante]);

  const tocar = (ok: boolean) => { if (som) bip(ok); };
  const registrarLeitura = (l: Omit<Leitura, 'id' | 'hora'>) => {
    setLeituras(prev => [{ ...l, id: crypto.randomUUID(), hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }, ...prev].slice(0, 30));
  };

  // achar por SKU exato; se não for SKU, aceita nome (único resultado) — dá pra digitar sem leitor
  const acharServico = (texto: string): { servico?: ServicoConfig; varios?: ServicoConfig[] } => {
    const t = texto.trim().toLowerCase();
    const porSku = servicos.find(s => (s.sku || '').toLowerCase() === t);
    if (porSku) return { servico: porSku };
    const porNome = servicos.filter(s => s.nome.toLowerCase().includes(t));
    if (porNome.length === 1) return { servico: porNome[0] };
    return porNome.length > 1 ? { varios: porNome } : {};
  };

  const sugestoes = useMemo(() => {
    const t = codigo.trim().toLowerCase();
    if (t.length < 2) return [];
    return servicos.filter(s => s.nome.toLowerCase().includes(t) || (s.sku || '').toLowerCase().includes(t)).slice(0, 6);
  }, [codigo, servicos]);

  const adicionarLinha = (s: ServicoConfig) => {
    setLinhas(prev => {
      const existe = prev.find(l => l.servicoId === s.id);
      if (existe) return prev.map(l => l.servicoId === s.id ? { ...l, quantidade: l.quantidade + 1 } : l);
      return [...prev, { servicoId: s.id, nome: s.nome, sku: s.sku || '', unidade: s.unidade || 'un', saldo: s.estoque ?? 0, quantidade: 1 }];
    });
  };

  const processarImediato = async (s: ServicoConfig, sku: string) => {
    const atual = s.estoque ?? 0;
    if (atual <= 0) { tocar(false); registrarLeitura({ nome: s.nome, sku, ok: false, mensagem: 'Sem estoque disponível pra dar saída.' }); return; }
    const novo = atual - 1;
    setServicos(prev => prev.map(x => x.id === s.id ? { ...x, estoque: novo } : x));
    await supabase.from('servicos').update({ estoque: novo }).eq('id', s.id);
    const { data: mov } = await supabase.from('estoque_movimentacoes').insert([{
      empresa_id: perfil?.empresa_id, servico_id: s.id, quantidade: -1, tipo: 'ajuste', motivo, destino: destino || null,
      producao_id: producaoId ? Number(producaoId) : null, user_id: user?.id, observacao: 'Saída via leitor de código de barras.',
    }]).select('id').single();
    alertarEstoqueBaixoSeCruzou(s.id, atual, novo, s.estoque_minimo ?? 5);
    tocar(true);
    registrarLeitura({ nome: s.nome, sku, ok: true, mensagem: `Saída registrada — estoque agora: ${novo}`, servicoId: s.id, movimentoId: mov?.id });
  };

  const processarCodigo = async (texto: string) => {
    const t = texto.trim();
    if (!t || processando) return;
    setProcessando(true); setErro(null);
    const { servico, varios } = acharServico(t);
    if (!servico) {
      tocar(false);
      registrarLeitura({ nome: '—', sku: t, ok: false, mensagem: varios ? `${varios.length} itens parecidos — escolha na lista ou seja mais específico.` : 'Código/nome não encontrado no catálogo.' });
    } else if (modo === 'imediato') {
      await processarImediato(servico, t);
    } else {
      const jaNaLista = linhas.find(l => l.servicoId === servico.id)?.quantidade || 0;
      if (jaNaLista + 1 > (servico.estoque ?? 0)) { tocar(false); setErro(`${servico.nome}: só há ${servico.estoque ?? 0} em estoque.`); }
      else { adicionarLinha(servico); tocar(true); }
    }
    setProcessando(false); setCodigo('');
    inputRef.current?.focus();
  };

  const desfazer = async (l: Leitura) => {
    if (!l.movimentoId || !l.servicoId || l.desfeita) return;
    const s = servicos.find(x => x.id === l.servicoId); if (!s) return;
    const novo = (s.estoque ?? 0) + 1;
    setServicos(prev => prev.map(x => x.id === s.id ? { ...x, estoque: novo } : x));
    await supabase.from('servicos').update({ estoque: novo }).eq('id', s.id);
    await supabase.from('estoque_movimentacoes').insert([{ empresa_id: perfil?.empresa_id, servico_id: s.id, quantidade: 1, tipo: 'estorno', motivo: 'uso_interno', user_id: user?.id, observacao: 'Desfeita a saída via leitor (erro de leitura).' }]);
    setLeituras(prev => prev.map(x => x.id === l.id ? { ...x, desfeita: true, mensagem: 'Saída desfeita — estoque devolvido.' } : x));
  };

  const alterarQtd = (id: number, delta: number, valor?: number) => setLinhas(prev => prev.map(l => {
    if (l.servicoId !== id) return l;
    const q = Math.max(1, Math.min(l.saldo, valor !== undefined ? valor : l.quantidade + delta));
    return { ...l, quantidade: q };
  }));

  const confirmarRequisicao = async () => {
    if (linhas.length === 0 || !perfil?.empresa_id) return;
    if (motivo === 'producao' && !destino.trim() && !producaoId) { setErro('Informe o destino (obra/cliente/setor) ou escolha a produção.'); return; }
    setProcessando(true); setErro(null);
    const reqId = crypto.randomUUID();
    const finais: (Linha & { saldoDepois: number })[] = [];
    let falha: string | null = null;
    for (const l of linhas) {
      const { data: fresco } = await supabase.from('servicos').select('estoque, estoque_minimo').eq('id', l.servicoId).single();
      const atual = Number(fresco?.estoque) || 0;
      if (l.quantidade > atual) { falha = `${l.nome}: estoque mudou e agora só há ${atual}.`; break; }
      const novo = atual - l.quantidade;
      const e1 = await supabase.from('servicos').update({ estoque: novo }).eq('id', l.servicoId);
      const e2 = await supabase.from('estoque_movimentacoes').insert([{
        empresa_id: perfil.empresa_id, servico_id: l.servicoId, quantidade: -l.quantidade, tipo: 'ajuste', motivo, destino: destino.trim() || null,
        producao_id: producaoId ? Number(producaoId) : null, requisicao_id: reqId, user_id: user?.id,
        observacao: observacao.trim() || `Requisição ${reqId.slice(0, 8).toUpperCase()}`,
      }]);
      if (e1.error || e2.error) { falha = e1.error?.message || e2.error?.message || 'Erro ao gravar.'; break; }
      alertarEstoqueBaixoSeCruzou(l.servicoId, atual, novo, fresco?.estoque_minimo ?? 5);
      finais.push({ ...l, saldoDepois: novo });
      setServicos(prev => prev.map(x => x.id === l.servicoId ? { ...x, estoque: novo } : x));
    }
    setProcessando(false);
    if (falha) { tocar(false); setErro(`${falha}${finais.length ? ` (${finais.length} item(ns) anterior(es) já foram baixados — veja no Kardex.)` : ''}`); return; }
    tocar(true);
    const prod = producoes.find(p => String(p.id) === producaoId);
    setComprovante({
      codigo: reqId.slice(0, 8).toUpperCase(), data: new Date().toLocaleString('pt-BR'), solicitante: perfil?.nome || user?.email || '—',
      motivo: MOTIVO_LABEL[motivo] || motivo, destino: [destino.trim(), prod ? `Produção #${prod.id} — ${prod.produto_final_nome}` : ''].filter(Boolean).join(' · ') || '—',
      observacao: observacao.trim(), linhas: finais,
    });
    setLinhas([]); setObservacao('');
  };

  const imprimir = (c: Comprovante) => {
    const w = window.open('', '_blank', 'width=720,height=800'); if (!w) return;
    w.document.write(`<html><head><title>Requisição ${c.codigo}</title><style>body{font-family:Arial;padding:28px;color:#111}h1{font-size:18px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}th,td{border-bottom:1px solid #ccc;padding:7px 4px;text-align:left}th:last-child,td:last-child,td:nth-child(3),th:nth-child(3){text-align:right}.m{font-size:12px;color:#555;line-height:1.6}.ass{margin-top:60px;display:flex;gap:40px}.ass div{flex:1;border-top:1px solid #000;padding-top:4px;font-size:11px;text-align:center}</style></head><body>
      <h1>Requisição de material — ${c.codigo}</h1><div class="m">${c.data} · Solicitante: ${c.solicitante}<br>Motivo: ${c.motivo}<br>Destino: ${c.destino}${c.observacao ? `<br>Obs.: ${c.observacao}` : ''}</div>
      <table><tr><th>Item</th><th>SKU</th><th>Qtd</th><th>Saldo após</th></tr>${c.linhas.map(l => `<tr><td>${l.nome}</td><td>${l.sku || '—'}</td><td>${l.quantidade} ${l.unidade}</td><td>${l.saldoDepois}</td></tr>`).join('')}</table>
      <div class="ass"><div>Quem retirou</div><div>Almoxarifado</div></div></body></html>`);
    w.document.close(); w.focus(); w.print();
  };

  if (authLoading) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;
  if (!temPulse) return (
    <div className="p-4 md:p-8 pb-20 text-white"><div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center"><Activity size={32} className="text-slate-600 mx-auto mb-3" /><p className="text-slate-400 font-bold text-sm">O módulo Pulse não está ativo pra sua empresa ainda.</p></div></div>
  );

  const inp = 'w-full h-10 bg-black/40 border border-white/10 rounded-xl px-3 text-sm text-white outline-none focus:border-[var(--cor-primaria)]';
  const lbl = 'block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1';

  return (
    <div className="p-4 md:p-8 pb-20 text-white">
      <header className="mb-6 flex items-center gap-4 flex-wrap">
        <Link href="/pulse/estoque" className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors"><ArrowLeft size={16} className="text-slate-400" /></Link>
        <div>
          <h1 className="text-3xl font-black tracking-tighter uppercase italic text-[var(--cor-primaria)] flex items-center gap-3"><ScanLine size={28} /> Saída de Estoque</h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Bipe o código ou digite o nome — motivo e destino ficam registrados</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setSom(s => !s)} title={som ? 'Som ligado' : 'Som desligado'} className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-400">{som ? <Volume2 size={15} /> : <VolumeX size={15} />}</button>
          <div className="flex gap-1 bg-black/30 border border-white/10 rounded-xl p-1">
            <button onClick={() => setModo('requisicao')} className={`px-3 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest flex items-center gap-1.5 ${modo === 'requisicao' ? 'bg-[var(--cor-primaria)] text-[#0B1120]' : 'text-slate-400 hover:text-white'}`}><ClipboardList size={12} /> Requisição</button>
            <button onClick={() => setModo('imediato')} className={`px-3 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest flex items-center gap-1.5 ${modo === 'imediato' ? 'bg-[var(--cor-primaria)] text-[#0B1120]' : 'text-slate-400 hover:text-white'}`}><Zap size={12} /> Imediato</button>
          </div>
        </div>
      </header>

      {loading ? <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-slate-600" /></div> : (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
          <div className="xl:col-span-3 space-y-5">
            <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6 relative">
              <div className="flex items-center gap-3">
                <ScanLine size={26} className="text-[var(--cor-primaria)] shrink-0" />
                <input ref={inputRef} value={codigo} onChange={e => setCodigo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') processarCodigo(codigo); }} autoFocus disabled={processando}
                  placeholder="Escaneie o código ou digite o nome do item + Enter" className="flex-1 bg-black/30 border-2 border-white/10 focus:border-[var(--cor-primaria)] rounded-2xl px-4 py-3.5 text-white text-base font-mono font-bold outline-none disabled:opacity-50" />
              </div>
              {sugestoes.length > 0 && (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-1.5">
                  {sugestoes.map(s => (
                    <button key={s.id} onClick={() => { setCodigo(''); modo === 'imediato' ? processarImediato(s, s.sku || s.nome) : ((s.estoque ?? 0) > 0 ? (adicionarLinha(s), tocar(true)) : (tocar(false), setErro(`${s.nome}: sem estoque.`))); inputRef.current?.focus(); }}
                      className="text-left bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3 py-2 text-xs">
                      <p className="font-bold truncate">{s.nome}</p><p className="text-[10px] text-slate-500">{s.sku || 'sem SKU'} · estoque {s.estoque ?? 0}{s.localizacao ? ` · 📍 ${s.localizacao}` : ''}</p>
                    </button>
                  ))}
                </div>
              )}
              {erro && <p className="mt-3 text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{erro}</p>}
            </div>

            {modo === 'requisicao' && (
              <div className="bg-[#0F172A] border border-white/10 rounded-3xl overflow-hidden">
                <div className="p-4 border-b border-white/5 flex items-center justify-between"><h3 className="font-black uppercase text-xs text-slate-400 flex items-center gap-2"><PackageMinus size={14} /> Itens da requisição ({linhas.length})</h3>{linhas.length > 0 && <button onClick={() => setLinhas([])} className="text-[10px] font-black uppercase text-slate-500 hover:text-red-400">Limpar</button>}</div>
                {linhas.length === 0 ? <p className="text-slate-600 text-sm font-bold text-center py-10">Bipe os itens — cada leitura soma 1 na quantidade.</p> : (
                  <div className="divide-y divide-white/5">
                    {linhas.map(l => (
                      <div key={l.servicoId} className="flex items-center gap-3 p-3">
                        <div className="flex-1 min-w-0"><p className="text-white text-sm font-bold truncate">{l.nome}</p><p className="text-[10px] text-slate-500">{l.sku || 'sem SKU'} · saldo {l.saldo} {l.unidade} → fica {l.saldo - l.quantidade}</p></div>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => alterarQtd(l.servicoId, -1)} className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-lg"><Minus size={13} /></button>
                          <input type="number" min="1" max={l.saldo} value={l.quantidade} onChange={e => alterarQtd(l.servicoId, 0, Number(e.target.value) || 1)} className="w-16 h-8 bg-black/40 border border-white/10 rounded-lg text-center text-sm font-black outline-none focus:border-[var(--cor-primaria)]" />
                          <button onClick={() => alterarQtd(l.servicoId, 1)} disabled={l.quantidade >= l.saldo} className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-lg disabled:opacity-30"><Plus size={13} /></button>
                        </div>
                        <button onClick={() => setLinhas(prev => prev.filter(x => x.servicoId !== l.servicoId))} className="text-slate-600 hover:text-red-400 p-1"><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {modo === 'imediato' && (
              <div className="bg-[#0F172A] border border-white/10 rounded-3xl overflow-hidden">
                <div className="p-4 border-b border-white/5"><h3 className="font-black uppercase text-xs text-slate-400 flex items-center gap-2"><PackageMinus size={14} /> Últimas leituras</h3></div>
                {leituras.length === 0 ? <p className="text-slate-600 text-sm font-bold text-center py-10">Nenhuma leitura ainda.</p> : (
                  <div className="divide-y divide-white/5 max-h-96 overflow-y-auto">
                    {leituras.map(l => (
                      <div key={l.id} className={`flex items-center gap-3 p-3 ${l.desfeita ? 'opacity-50' : ''}`}>
                        {l.ok ? <CheckCircle2 size={16} className="text-[var(--cor-primaria)] shrink-0" /> : <XCircle size={16} className="text-red-400 shrink-0" />}
                        <div className="flex-1 min-w-0"><p className="text-white text-sm font-bold truncate">{l.nome}</p><p className={`text-[10px] font-bold ${l.ok ? 'text-slate-500' : 'text-red-400'}`}>{l.mensagem} <span className="text-slate-700 font-mono">({l.sku})</span></p></div>
                        {l.ok && l.movimentoId && !l.desfeita && <button onClick={() => desfazer(l)} className="text-[10px] font-black uppercase text-slate-400 hover:text-amber-300 flex items-center gap-1"><Undo2 size={11} /> Desfazer</button>}
                        <span className="text-slate-600 text-[10px] shrink-0">{l.hora}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="xl:col-span-2 space-y-5">
            <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-5 space-y-3">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Motivo e destino {modo === 'imediato' && <span className="text-slate-600 normal-case font-bold">(vale pra próxima leitura)</span>}</p>
              <label className="block"><span className={lbl}>Motivo</span><select value={motivo} onChange={e => setMotivo(e.target.value)} className={inp}>{MOTIVOS.map(m => <option key={m.v} value={m.v} className="bg-[#0B1120]">{m.l}</option>)}</select></label>
              <label className="block"><span className={lbl}>Vincular a uma produção (opcional)</span>
                <select value={producaoId} onChange={e => setProducaoId(e.target.value)} className={inp}><option value="" className="bg-[#0B1120]">Nenhuma</option>{producoes.map(p => <option key={p.id} value={p.id} className="bg-[#0B1120]">#{p.id} — {p.produto_final_nome}</option>)}</select></label>
              <label className="block"><span className={lbl}>Destino (obra / cliente / setor)</span><input value={destino} onChange={e => setDestino(e.target.value)} placeholder="Ex: Montagem — Fornalha Nova Aliança" className={inp} /></label>
              {modo === 'requisicao' && <label className="block"><span className={lbl}>Observação</span><input value={observacao} onChange={e => setObservacao(e.target.value)} className={inp} /></label>}
              {modo === 'requisicao' && (
                <button onClick={confirmarRequisicao} disabled={linhas.length === 0 || processando} className="w-full py-3.5 rounded-xl bg-[var(--cor-primaria)] text-[#0B1120] font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 disabled:opacity-40">
                  {processando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Confirmar saída ({linhas.reduce((s, l) => s + l.quantidade, 0)} un.)
                </button>
              )}
            </div>

            {comprovante && (
              <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-3xl p-5">
                <p className="text-emerald-300 font-black text-sm flex items-center gap-2"><CheckCircle2 size={16} /> Requisição {comprovante.codigo} registrada</p>
                <p className="text-[11px] text-slate-400 mt-1">{comprovante.linhas.length} item(ns) · {comprovante.motivo} · {comprovante.destino}</p>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => imprimir(comprovante)} className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-[11px] font-black uppercase flex items-center justify-center gap-1.5"><Printer size={13} /> Imprimir comprovante</button>
                  <button onClick={() => setComprovante(null)} className="px-3 rounded-xl bg-white/5 text-slate-400 hover:text-white"><XCircle size={15} /></button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
