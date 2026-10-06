"use client";
import { useEffect, useState } from 'react';
import {
  Loader2, Mail, CheckCircle2, Circle, Factory, Wallet, FileText, Download, PenLine,
  LogOut, CalendarClock, ExternalLink, X, Camera, AlertCircle,
} from 'lucide-react';

type Parcela = { chave: string; rotulo: string; valor: number; vencimento: string | null; pago: boolean; pagoEm: string | null; boletoUrl: string | null };
type Producao = {
  id: number; produto: string; status: string; statusLabel: string; etapaAtual: number; previsaoEntrega: string | null;
  linhaDoTempo: { tipo: string; texto: string | null; foto: string | null; em: string }[];
  fotos: { url: string; em: string }[];
};
type Pedido = {
  id: number; fechadoEm: string; valorTotal: number; itens: { nome: string; quantidade: number }[];
  producoes: Producao[]; parcelas: Parcela[]; totalPago: number;
  contrato: { assinado: boolean; linkAssinatura: string | null; arquivos: { nome: string; url: string }[] };
};
type Dados = { empresa: { nome: string; logo: string | null; cor: string }; cliente: { nome: string }; etapas: string[]; pedidos: Pedido[] };

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBr = (iso: string | null) => iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('pt-BR') : '—';
const hojeIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const codigo = (id: number) => `LD-${String(id).padStart(4, '0')}`;

function Login() {
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault(); setEnviando(true); setErro(null);
    const res = await fetch('/api/portal-cliente/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) setErro(j.erro || 'Não foi possível enviar agora.'); else setMsg(j.mensagem);
    setEnviando(false);
  };
  return (
    <div className="min-h-dvh bg-slate-100 text-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 w-full max-w-sm">
        <h1 className="text-lg font-black">Portal do Cliente</h1>
        <p className="text-sm text-slate-500 mt-1 mb-5">Acompanhe a produção do seu pedido, pagamentos e contrato.</p>
        {msg ? (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl p-4 flex items-start gap-2">
            <Mail size={16} className="shrink-0 mt-0.5" />
            <span>{msg} Confira também a caixa de spam.</span>
          </div>
        ) : (
          <form onSubmit={enviar} className="space-y-3">
            <label className="text-xs font-bold text-slate-600 block">E-mail cadastrado na compra</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" autoComplete="email"
              className="w-full border border-slate-300 rounded-xl px-4 py-3 text-base outline-none focus:border-slate-900" />
            {erro && <p className="text-sm text-red-600">{erro}</p>}
            <button disabled={enviando} className="w-full bg-slate-900 hover:bg-slate-700 disabled:opacity-60 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2">
              {enviando ? <Loader2 size={18} className="animate-spin" /> : <Mail size={18} />} Receber link de acesso
            </button>
            <p className="text-xs text-slate-400 text-center">Sem senha: enviamos um link de acesso pro seu e-mail.</p>
          </form>
        )}
      </div>
    </div>
  );
}

function Secao({ icone, titulo, children, id }: { icone: React.ReactNode; titulo: string; children: React.ReactNode; id: string }) {
  return (
    <section id={id} className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 scroll-mt-20">
      <h3 className="font-black text-sm uppercase tracking-wide text-slate-700 flex items-center gap-2 mb-4">{icone} {titulo}</h3>
      {children}
    </section>
  );
}

function PedidoView({ p, etapas, cor, abrirFoto }: { p: Pedido; etapas: string[]; cor: string; abrirFoto: (u: string) => void }) {
  const hoje = hojeIso();
  const proximaAberta = p.parcelas.find(x => !x.pago);
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
        <p className="text-xs font-bold text-slate-400">Pedido {codigo(p.id)} · fechado em {dataBr(p.fechadoEm)}</p>
        <p className="font-black text-lg leading-tight mt-1">{p.itens.map(i => `${i.quantidade > 1 ? i.quantidade + 'x ' : ''}${i.nome}`).join(' + ') || 'Pedido'}</p>
        <p className="text-sm text-slate-500 mt-1">Valor total: <b className="text-slate-800">{brl(p.valorTotal)}</b></p>
        <nav className="flex gap-2 mt-4 overflow-x-auto [scrollbar-width:none]">
          {[['producao', 'Produção'], ['pagamentos', 'Pagamentos'], ['contrato', 'Contrato']].map(([id, l]) => (
            <a key={id} href={`#${id}-${p.id}`} className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50">{l}</a>
          ))}
        </nav>
      </div>

      <Secao id={`producao-${p.id}`} icone={<Factory size={16} />} titulo="Produção">
        {p.producoes.length === 0 ? (
          <p className="text-sm text-slate-500">A produção ainda não começou. Assim que iniciar, as etapas e fotos aparecem aqui.</p>
        ) : p.producoes.map(pr => {
          const concluida = pr.status !== 'em_producao';
          return (
            <div key={pr.id} className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold">{pr.produto}</p>
                <span className="text-xs font-black px-2.5 py-1 rounded-full" style={{ background: `${cor}22`, color: '#0f172a' }}>{pr.statusLabel}</span>
              </div>
              {pr.previsaoEntrega && (
                <p className="text-sm text-slate-600 flex items-center gap-1.5"><CalendarClock size={14} /> Previsão de entrega: <b>{dataBr(pr.previsaoEntrega)}</b></p>
              )}
              <ol className="space-y-2">
                {etapas.map((e, i) => {
                  const feita = concluida || i < pr.etapaAtual;
                  const atual = !concluida && i === pr.etapaAtual;
                  return (
                    <li key={e} className={`flex items-center gap-2.5 text-sm ${feita ? 'text-slate-800' : atual ? 'font-bold text-slate-900' : 'text-slate-400'}`}>
                      {feita ? <CheckCircle2 size={18} style={{ color: cor }} className="shrink-0" /> : atual ? <Loader2 size={18} className="shrink-0 animate-spin text-slate-700" /> : <Circle size={18} className="shrink-0" />}
                      {e}{atual && <span className="text-[10px] font-black uppercase bg-slate-900 text-white px-1.5 py-0.5 rounded">agora</span>}
                    </li>
                  );
                })}
              </ol>
              {pr.fotos.length > 0 && (
                <div>
                  <p className="text-xs font-black uppercase text-slate-500 flex items-center gap-1.5 mb-2"><Camera size={13} /> Fotos da produção ({pr.fotos.length})</p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {pr.fotos.map(f => (
                      <button key={f.url} onClick={() => abrirFoto(f.url)} className="relative aspect-square rounded-lg overflow-hidden bg-slate-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={f.url} alt="Foto da produção" loading="lazy" className="w-full h-full object-cover" />
                        <span className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] px-1 py-0.5">{dataBr(f.em)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {pr.linhaDoTempo.some(e => e.texto) && (
                <div>
                  <p className="text-xs font-black uppercase text-slate-500 mb-2">Últimas atualizações</p>
                  <ul className="space-y-1.5">
                    {pr.linhaDoTempo.filter(e => e.texto).slice(0, 8).map((e, i) => (
                      <li key={i} className="text-sm text-slate-700 flex gap-2"><span className="text-slate-400 shrink-0 w-20">{dataBr(e.em)}</span>{e.texto}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </Secao>

      <Secao id={`pagamentos-${p.id}`} icone={<Wallet size={16} />} titulo="Pagamentos">
        {p.parcelas.length === 0 ? <p className="text-sm text-slate-500">Nenhum plano de pagamento registrado.</p> : (
          <>
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1.5"><span className="text-slate-500">Pago</span><b>{brl(p.totalPago)} de {brl(p.parcelas.reduce((s, x) => s + x.valor, 0))}</b></div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ background: cor, width: `${Math.min(100, (p.totalPago / Math.max(1, p.parcelas.reduce((s, x) => s + x.valor, 0))) * 100)}%` }} />
              </div>
            </div>
            <ul className="divide-y divide-slate-100">
              {p.parcelas.map(x => {
                const atrasada = !x.pago && x.vencimento && x.vencimento < hoje;
                return (
                  <li key={x.chave} className={`py-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 ${x === proximaAberta ? 'bg-amber-50/60 -mx-2 px-2 rounded-lg' : ''}`}>
                    <div className="flex-1 min-w-[140px]">
                      <p className="text-sm font-bold">{x.rotulo}</p>
                      <p className="text-xs text-slate-500">{x.vencimento ? `Vencimento ${dataBr(x.vencimento)}` : 'Data a combinar'}</p>
                    </div>
                    <span className="text-sm font-black">{brl(x.valor)}</span>
                    {x.pago ? (
                      <span className="text-[11px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">Pago{x.pagoEm ? ` em ${dataBr(x.pagoEm)}` : ''}</span>
                    ) : atrasada ? (
                      <span className="text-[11px] font-black text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">Em atraso</span>
                    ) : (
                      <span className="text-[11px] font-black text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">Em aberto</span>
                    )}
                    {x.boletoUrl && (
                      <a href={x.boletoUrl} target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto text-center text-xs font-black text-white bg-slate-900 hover:bg-slate-700 px-3 py-2 rounded-lg flex items-center justify-center gap-1">
                        Pagar / ver boleto <ExternalLink size={12} />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Secao>

      <Secao id={`contrato-${p.id}`} icone={<FileText size={16} />} titulo="Contrato">
        <p className={`text-sm font-bold flex items-center gap-1.5 mb-3 ${p.contrato.assinado ? 'text-emerald-700' : 'text-amber-700'}`}>
          {p.contrato.assinado ? <><CheckCircle2 size={16} /> Contrato assinado</> : <><PenLine size={16} /> Aguardando sua assinatura</>}
        </p>
        {p.contrato.linkAssinatura && (
          <a href={p.contrato.linkAssinatura} target="_blank" rel="noopener noreferrer" className="mb-3 w-full sm:w-auto inline-flex justify-center items-center gap-2 text-sm font-black text-white bg-slate-900 hover:bg-slate-700 px-4 py-2.5 rounded-xl">
            <PenLine size={15} /> Assinar contrato
          </a>
        )}
        {p.contrato.arquivos.length > 0 ? (
          <ul className="space-y-2">
            {p.contrato.arquivos.map(a => (
              <li key={a.url}>
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-bold text-slate-800 border border-slate-200 hover:bg-slate-50 rounded-xl px-3 py-2.5">
                  <Download size={15} className="shrink-0" /> <span className="truncate capitalize">{a.nome}</span>
                </a>
              </li>
            ))}
          </ul>
        ) : !p.contrato.linkAssinatura && <p className="text-sm text-slate-500">O contrato assinado vai aparecer aqui para download.</p>}
      </Secao>
    </div>
  );
}

export default function PortalCliente() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [estado, setEstado] = useState<'carregando' | 'login' | 'ok' | 'erro'>('carregando');
  const [foto, setFoto] = useState<string | null>(null);
  const [pedidoSel, setPedidoSel] = useState(0);

  useEffect(() => {
    fetch('/api/portal-cliente/dados', { cache: 'no-store' })
      .then(async r => {
        if (r.status === 401) { setEstado('login'); return; }
        if (!r.ok) { setEstado('erro'); return; }
        setDados(await r.json()); setEstado('ok');
      })
      .catch(() => setEstado('erro'));
  }, []);

  const sair = async () => { await fetch('/api/portal-cliente/sair', { method: 'POST' }); window.location.reload(); };

  if (estado === 'carregando') return <div className="min-h-dvh bg-slate-100 flex items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;
  if (estado === 'login') return <Login />;
  if (estado === 'erro' || !dados) return (
    <div className="min-h-dvh bg-slate-100 text-slate-700 flex items-center justify-center p-4 text-center">
      <p className="flex items-center gap-2"><AlertCircle size={18} /> Não foi possível carregar o portal agora. Tente de novo em instantes.</p>
    </div>
  );

  const pedido = dados.pedidos[pedidoSel];
  return (
    <div className="min-h-dvh bg-slate-100 text-slate-900">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          {dados.empresa.logo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={dados.empresa.logo} alt={dados.empresa.nome} className="h-8 max-w-[140px] object-contain" />
            : <span className="font-black truncate">{dados.empresa.nome}</span>}
          <button onClick={sair} className="text-xs font-bold text-slate-500 hover:text-slate-900 flex items-center gap-1"><LogOut size={14} /> Sair</button>
        </div>
        <div className="h-1" style={{ background: dados.empresa.cor }} />
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        <div>
          <p className="text-sm text-slate-500">Olá,</p>
          <h2 className="text-xl font-black leading-tight">{dados.cliente.nome}</h2>
        </div>

        {dados.pedidos.length === 0 ? (
          <p className="bg-white rounded-2xl border border-slate-200 p-5 text-sm text-slate-500">Nenhum pedido encontrado ainda.</p>
        ) : (
          <>
            {dados.pedidos.length > 1 && (
              <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
                {dados.pedidos.map((p, i) => (
                  <button key={p.id} onClick={() => setPedidoSel(i)} className={`shrink-0 text-xs font-black px-3 py-2 rounded-xl border ${i === pedidoSel ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-600'}`}>
                    {codigo(p.id)}
                  </button>
                ))}
              </div>
            )}
            {pedido && <PedidoView p={pedido} etapas={dados.etapas} cor={dados.empresa.cor} abrirFoto={setFoto} />}
          </>
        )}
        <p className="text-center text-[11px] text-slate-400 pt-2">Portal do Cliente · {dados.empresa.nome}</p>
      </main>

      {foto && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-3" onClick={() => setFoto(null)}>
          <button className="absolute top-3 right-3 text-white p-2" aria-label="Fechar"><X size={24} /></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={foto} alt="Foto da produção" className="max-h-full max-w-full object-contain rounded-lg" />
        </div>
      )}
    </div>
  );
}
