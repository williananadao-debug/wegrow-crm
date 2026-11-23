"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Wallet, RefreshCw, PlugZap, CheckCircle2, AlertTriangle, ExternalLink, Send, FileText, Settings2, X, Plus, Banknote, Trash2, FileSignature, Copy } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRastreioAccess, apiRastreio, fmtMoeda } from '../shared';

type Status = {
  conectado: boolean; ambiente: string | null; webhook: boolean; splitAtivo: boolean; podeGerir: boolean; ehDiretor: boolean;
  config: {
    taxa_wegrow_pct: number; dias_suspensao: number; multa_pct: number; juros_mes_pct: number; nfse_automatica: boolean; nfse_servico_codigo: string | null; nfse_servico_descricao: string | null;
    emp_razao: string | null; emp_documento: string | null; emp_endereco: string | null; emp_cidade: string | null; emp_uf: string | null; emp_telefone: string | null; emp_email: string | null;
    contrato_fidelidade_meses: number; contrato_valor_equipamento: number; contrato_taxa_instalacao: number; contrato_texto_extra: string | null;
  };
};
type Contrato = { id: number; cliente_id: string; status: string; link_empresa: string | null; link_cliente: string | null; created_at: string; assinado_em: string | null; arquivos: { nome: string; path: string }[] | null };
type Avulsa = { clienteId: string; nome: string; descricao: string; valor: string; vencimento: string; forma: string; parcelas: number };
const DESCRICOES = ['Instalação do rastreador', 'Equipamento (rastreador)', 'Visita técnica', 'Troca/reinstalação do rastreador', 'Mensalidade avulsa'];
type Cli = {
  id: string; nome: string; telefone: string | null; documento: string | null; mensalidade: number; dia_vencimento: number | null; status: string;
  asaas_assinatura_id: string | null; assinatura_status: string | null; forma_pagamento: string; em_atraso_desde: string | null; suspenso_automatico: boolean;
};
type Cob = {
  id: number; cliente_id: string; valor: number; valor_liquido: number | null; taxa_wegrow: number | null; vencimento: string | null; pago_em: string | null;
  status: string; forma: string | null; invoice_url: string | null; nf_url: string | null; descricao: string | null; asaas_assinatura_id: string | null;
};

const FORMAS: Record<string, string> = { UNDEFINED: 'Cliente escolhe (boleto, Pix ou cartão)', BOLETO: 'Boleto', PIX: 'Pix', CREDIT_CARD: 'Cartão recorrente' };
const PAGOS = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'];
const STATUS_INFO: Record<string, { t: string; c: string }> = {
  PENDING: { t: 'A vencer', c: 'text-sky-300 bg-sky-500/10 border-sky-500/30' },
  OVERDUE: { t: 'Vencida', c: 'text-red-300 bg-red-500/10 border-red-500/30' },
  RECEIVED: { t: 'Paga', c: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' },
  CONFIRMED: { t: 'Paga', c: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' },
  RECEIVED_IN_CASH: { t: 'Paga (dinheiro)', c: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' },
  REFUNDED: { t: 'Estornada', c: 'text-slate-400 bg-white/5 border-white/10' },
  DELETED: { t: 'Removida', c: 'text-slate-500 bg-white/5 border-white/10' },
};
const mesAtual = () => new Date().toLocaleDateString('en-CA').slice(0, 7);
const dataBR = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—');

export default function RastreioFinanceiroPage() {
  const { authLoading, temRastreio } = useRastreioAccess();
  const [st, setSt] = useState<Status | null>(null);
  const [clientes, setClientes] = useState<Cli[]>([]);
  const [cobs, setCobs] = useState<Cob[]>([]);
  const [mes, setMes] = useState(mesAtual());
  const [ocupado, setOcupado] = useState('');
  const [aviso, setAviso] = useState<{ ok: boolean; t: string } | null>(null);
  const [chave, setChave] = useState('');
  const [ambiente, setAmbiente] = useState<'producao' | 'sandbox'>('producao');
  const [cfgAberta, setCfgAberta] = useState(false);
  const [cfg, setCfg] = useState<Status['config'] | null>(null);
  const [formas, setFormas] = useState<Record<string, string>>({});
  const [contratos, setContratos] = useState<Record<string, Contrato>>({});
  const [avulsa, setAvulsa] = useState<Avulsa | null>(null);
  const [links, setLinks] = useState<{ titulo: string; nome: string; telefone: string | null; itens: { rotulo: string; url: string }[] } | null>(null);

  const carregarStatus = useCallback(async () => {
    try { const s = await apiRastreio('financeiro', { acao: 'status' }); setSt(s); setCfg(s.config); } catch (e) { setAviso({ ok: false, t: (e as Error).message }); }
  }, []);
  const carregarClientes = useCallback(async () => {
    const { data } = await supabase.from('rastreio_clientes')
      .select('id, nome, telefone, documento, mensalidade, dia_vencimento, status, asaas_assinatura_id, assinatura_status, forma_pagamento, em_atraso_desde, suspenso_automatico')
      .neq('status', 'cancelado').order('nome');
    setClientes((data as Cli[]) || []);
  }, []);
  const carregarCobs = useCallback(async () => {
    const [a, m] = mes.split('-').map(Number);
    const ini = `${mes}-01`, fim = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
    const { data } = await supabase.from('rastreio_cobrancas')
      .select('id, cliente_id, valor, valor_liquido, taxa_wegrow, vencimento, pago_em, status, forma, invoice_url, nf_url, descricao, asaas_assinatura_id')
      .gte('vencimento', ini).lte('vencimento', fim).neq('status', 'DELETED').order('vencimento').limit(2000);
    setCobs((data as Cob[]) || []);
  }, [mes]);

  // Último contrato de cada cliente (antes da migration a tabela não existe: fica vazio)
  const carregarContratos = useCallback(async () => {
    const { data } = await supabase.from('rastreio_contratos').select('id, cliente_id, status, link_empresa, link_cliente, created_at, assinado_em, arquivos')
      .neq('status', 'cancelado').order('created_at', { ascending: false }).limit(1000);
    const m: Record<string, Contrato> = {};
    for (const c of (data as Contrato[]) || []) if (!m[c.cliente_id]) m[c.cliente_id] = c;
    setContratos(m);
  }, []);

  useEffect(() => { void Promise.resolve().then(() => { carregarStatus(); carregarClientes(); carregarContratos(); }); }, [carregarStatus, carregarClientes, carregarContratos]);
  useEffect(() => { void Promise.resolve().then(carregarCobs); }, [carregarCobs]);

  const acao = async (nome: string, corpo: Record<string, unknown>, ok: (r: Record<string, unknown>) => string) => {
    setOcupado(nome + String(corpo.clienteId || '')); setAviso(null);
    try {
      const r = await apiRastreio('financeiro', { acao: nome, ...corpo });
      setAviso({ ok: true, t: ok(r) });
      await Promise.all([carregarStatus(), carregarClientes(), carregarCobs(), carregarContratos()]);
      return r as Record<string, unknown>;
    } catch (e) { setAviso({ ok: false, t: (e as Error).message }); return null; }
    finally { setOcupado(''); }
  };

  const nomeCli = useMemo(() => Object.fromEntries(clientes.map(c => [c.id, c])), [clientes]);
  const k = useMemo(() => {
    const pagas = cobs.filter(c => PAGOS.includes(c.status));
    return {
      mrr: clientes.filter(c => c.assinatura_status === 'ativa' && c.status !== 'cancelado').reduce((s, c) => s + Number(c.mensalidade || 0), 0),
      recebido: pagas.reduce((s, c) => s + Number(c.valor), 0),
      liquido: pagas.reduce((s, c) => s + Number(c.valor_liquido ?? c.valor), 0),
      aReceber: cobs.filter(c => c.status === 'PENDING').reduce((s, c) => s + Number(c.valor), 0),
      vencido: cobs.filter(c => c.status === 'OVERDUE').reduce((s, c) => s + Number(c.valor), 0),
      taxa: pagas.reduce((s, c) => s + Number(c.taxa_wegrow || 0), 0),
      atraso: clientes.filter(c => c.em_atraso_desde).length,
      semAssinatura: clientes.filter(c => c.assinatura_status !== 'ativa' && Number(c.mensalidade) > 0).length,
    };
  }, [cobs, clientes]);

  const emitirAvulsa = async () => {
    if (!avulsa) return;
    const r = await acao('avulsa', {
      clienteId: avulsa.clienteId, descricao: avulsa.descricao, valor: Number(avulsa.valor.replace(/\./g, '').replace(',', '.')),
      vencimento: avulsa.vencimento, forma: avulsa.forma, parcelas: avulsa.parcelas,
    }, () => `${avulsa.nome}: cobrança criada.`);
    if (!r) return;
    const cli = nomeCli[avulsa.clienteId];
    setAvulsa(null);
    if (r.link) setLinks({ titulo: 'Cobrança criada', nome: avulsa.nome, telefone: cli?.telefone || null, itens: [{ rotulo: avulsa.descricao, url: String(r.link) }] });
  };

  const mandarContrato = async (c: Cli) => {
    if (contratos[c.id]?.status === 'enviado' && !confirm(`${c.nome} já tem um contrato esperando assinatura. Gerar um novo (o anterior deixa de valer)?`)) return;
    const r = await acao('contrato', { clienteId: c.id }, () => `${c.nome}: contrato gerado. Assine primeiro e depois mande o link para o cliente.`);
    if (!r) return;
    setLinks({ titulo: 'Contrato para assinatura', nome: c.nome, telefone: c.telefone, itens: [
      ...(r.linkEmpresa ? [{ rotulo: 'Sua assinatura (empresa assina primeiro)', url: String(r.linkEmpresa) }] : []),
      ...(r.linkCliente ? [{ rotulo: 'Link do cliente para assinar o contrato', url: String(r.linkCliente) }] : []),
    ] });
  };

  const abrirContratoAssinado = async (ct: Contrato) => {
    const r = await acao('contrato_arquivo', { contratoId: ct.id }, () => 'Abrindo o contrato assinado…');
    if (r?.url) window.location.assign(String(r.url));
  };

  const cobrarWhats = (c: Cob) => {
    const cli = nomeCli[c.cliente_id];
    if (!c.invoice_url) return;
    const txt = `Olá ${cli?.nome?.split(' ')[0] || ''}! Segue o link da mensalidade do rastreamento (vencimento ${dataBR(c.vencimento)}, ${fmtMoeda(c.valor)}): ${c.invoice_url}`;
    const fone = String(cli?.telefone || '').replace(/\D/g, '');
    window.open(fone ? `https://wa.me/55${fone}?text=${encodeURIComponent(txt)}` : `https://wa.me/?text=${encodeURIComponent(txt)}`, '_blank');
  };

  if (authLoading || !st) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;
  if (!temRastreio) return <div className="p-8 text-slate-400 text-sm">O módulo Rastreio não está ativo pra sua empresa.</div>;
  const inp = 'w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400';

  return (
    <div className="md:p-8 pb-20 text-white">
      <Link href="/rastreio" className="inline-flex items-center gap-1 text-xs font-black uppercase text-slate-500 hover:text-white mb-3"><ArrowLeft size={14} /> Frota</Link>
      <header className="mb-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <h1 className="text-2xl md:text-4xl font-black tracking-tighter uppercase italic text-[#22C55E] flex items-center gap-2 md:gap-3">
          <Wallet className="w-6 h-6 md:w-8 md:h-8 shrink-0" /> Financeiro do rastreio
        </h1>
        <div className="flex gap-2">
          {st.podeGerir && <button onClick={() => setCfgAberta(true)} className="inline-flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2.5 rounded-xl font-black text-xs uppercase"><Settings2 size={14} /> Regras</button>}
          {st.conectado && st.podeGerir && (
            <button onClick={() => acao('sincronizar', {}, r => `Sincronizado: ${r.pagamentos} pagamento(s) de ${r.clientes} cliente(s).`)} disabled={!!ocupado}
              className="inline-flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2.5 rounded-xl font-black text-xs uppercase disabled:opacity-50">
              {ocupado === 'sincronizar' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Atualizar do Asaas
            </button>
          )}
        </div>
      </header>

      {aviso && (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm font-bold flex justify-between gap-3 ${aviso.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>
          <span>{aviso.t}</span><button onClick={() => setAviso(null)}><X size={14} /></button>
        </div>
      )}

      {!st.conectado ? (
        <div className="bg-[#0F172A] border border-amber-500/30 rounded-2xl p-5 mb-4 max-w-2xl">
          <p className="font-black text-lg flex items-center gap-2 mb-1"><PlugZap size={18} className="text-amber-400" /> Conecte a conta Asaas da empresa</p>
          <p className="text-sm text-slate-400 mb-3">As mensalidades dos clientes caem direto na conta Asaas da sua empresa (boleto, Pix e cartão recorrente). Abrir conta no Asaas é grátis.</p>
          <ol className="text-sm text-slate-300 list-decimal ml-5 space-y-1 mb-4">
            <li>Crie a conta em <a href="https://www.asaas.com" target="_blank" rel="noreferrer" className="text-sky-400 underline">asaas.com</a> com o CNPJ da empresa e envie os documentos pedidos.</li>
            <li>No Asaas: <b>Integrações → Chave de API → Gerar chave</b>.</li>
            <li>Cole a chave aqui. O WeGrow já cadastra sozinho o aviso de pagamento.</li>
          </ol>
          {st.ehDiretor ? (
            <div className="space-y-2">
              <input value={chave} onChange={e => setChave(e.target.value)} placeholder="$aact_..." className={inp} type="password" autoComplete="off" />
              <div className="flex gap-2 items-center">
                <select value={ambiente} onChange={e => setAmbiente(e.target.value as 'producao' | 'sandbox')} className="bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5 text-sm [color-scheme:dark]">
                  <option value="producao">Produção (dinheiro de verdade)</option>
                  <option value="sandbox">Sandbox (teste)</option>
                </select>
                <button onClick={() => acao('conectar', { apiKey: chave, ambiente }, r => `Asaas conectado: ${r.nome || r.email}. Aviso de pagamento: ${r.webhook}.`).then(() => setChave(''))}
                  disabled={!!ocupado || chave.length < 20} className="ml-auto bg-[#22C55E] text-[#0B1120] px-5 py-2.5 rounded-xl font-black text-xs uppercase disabled:opacity-40 inline-flex items-center gap-2">
                  {ocupado === 'conectar' && <Loader2 size={14} className="animate-spin" />} Conectar
                </button>
              </div>
            </div>
          ) : <p className="text-xs text-slate-500">Peça para o diretor da empresa conectar.</p>}
        </div>
      ) : (
        <p className="text-xs text-slate-500 mb-4 flex items-center gap-1">
          <CheckCircle2 size={13} className="text-emerald-400" /> Asaas conectado{st.ambiente === 'sandbox' ? ' (SANDBOX — teste)' : ''}
          {st.webhook ? ' · aviso de pagamento ativo' : ''}{st.config.nfse_automatica ? ' · NF automática ligada' : ''}
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card l="Receita mensal (assinaturas)" v={fmtMoeda(k.mrr)} c="text-[#22C55E]" />
        <Card l={`Recebido em ${mes.split('-').reverse().join('/')}`} v={fmtMoeda(k.recebido)} sub={k.liquido !== k.recebido ? `líquido ${fmtMoeda(k.liquido)}` : undefined} />
        <Card l="A receber no mês" v={fmtMoeda(k.aReceber)} c="text-sky-300" />
        <Card l="Vencido" v={fmtMoeda(k.vencido)} c={k.vencido ? 'text-red-400' : undefined} sub={k.atraso ? `${k.atraso} cliente(s) em atraso` : undefined} />
      </div>
      {st.splitAtivo && <p className="text-[11px] text-slate-500 mb-4">Taxa da plataforma WeGrow: {st.config.taxa_wegrow_pct}% de cada mensalidade paga, descontada automaticamente no Asaas{k.taxa ? ` (${fmtMoeda(k.taxa)} neste mês)` : ''}.</p>}

      <section className="bg-[#0F172A] border border-white/10 rounded-2xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Assinaturas dos clientes</p>
          {k.semAssinatura > 0 && <span className="text-[11px] font-black text-amber-300">{k.semAssinatura} sem cobrança automática</span>}
        </div>
        <div className="divide-y divide-white/5">
          {clientes.map(c => {
            const ativa = c.assinatura_status === 'ativa';
            const forma = formas[c.id] ?? c.forma_pagamento ?? 'UNDEFINED';
            return (
              <div key={c.id} className="py-3 flex flex-col md:flex-row md:items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-black truncate">{c.nome}
                    {c.status === 'suspenso' && <span className="ml-2 text-[10px] font-black uppercase text-amber-400">suspenso{c.suspenso_automatico ? ' (atraso)' : ''}</span>}
                    {c.em_atraso_desde && <span className="ml-2 text-[10px] font-black uppercase text-red-400">em atraso desde {dataBR(c.em_atraso_desde)}</span>}
                  </p>
                  <p className="text-xs text-slate-400">{fmtMoeda(c.mensalidade)}/mês · vence dia {c.dia_vencimento || 10}{!c.documento ? ' · falta CPF/CNPJ' : ''}</p>
                </div>
                <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border w-fit ${ativa ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' : 'text-slate-400 bg-white/5 border-white/10'}`}>{ativa ? 'cobrança automática' : c.assinatura_status === 'cancelada' ? 'cancelada' : 'sem cobrança'}</span>
                {st.podeGerir && st.conectado && (
                  <div className="flex items-center gap-2">
                    <select value={forma} onChange={e => setFormas(f => ({ ...f, [c.id]: e.target.value }))} className="bg-white/[0.03] border border-white/10 rounded-lg px-2 py-1.5 text-xs [color-scheme:dark] max-w-[190px]">
                      {Object.entries(FORMAS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                    </select>
                    <button onClick={() => acao('assinatura', { clienteId: c.id, forma }, r => `${c.nome}: cobrança ${ativa ? 'atualizada' : 'criada'}.${r.nf ? ` ${r.nf}.` : ''}`)}
                      disabled={!!ocupado || !(Number(c.mensalidade) > 0)} className="bg-[#22C55E] text-[#0B1120] px-3 py-1.5 rounded-lg font-black text-[10px] uppercase disabled:opacity-40 inline-flex items-center gap-1">
                      {ocupado === 'assinatura' + c.id && <Loader2 size={12} className="animate-spin" />}{ativa ? 'Atualizar' : 'Criar cobrança'}
                    </button>
                    {ativa && (
                      <button onClick={() => confirm(`Cancelar a cobrança automática de ${c.nome}? As mensalidades em aberto são removidas no Asaas.`) && acao('cancelar', { clienteId: c.id }, () => `${c.nome}: cobrança cancelada.`)}
                        disabled={!!ocupado} className="text-[10px] font-black uppercase text-slate-500 hover:text-red-400">Cancelar</button>
                    )}
                    <button onClick={() => setAvulsa({ clienteId: c.id, nome: c.nome, descricao: DESCRICOES[0], valor: st.config.contrato_taxa_instalacao ? String(st.config.contrato_taxa_instalacao).replace('.', ',') : '', vencimento: new Date(Date.now() + 3 * 86400_000).toLocaleDateString('en-CA'), forma: 'UNDEFINED', parcelas: 1 })}
                      disabled={!!ocupado} title="Cobrança avulsa: instalação, equipamento, visita..." className="inline-flex items-center gap-1 bg-white/5 border border-white/10 px-2.5 py-1.5 rounded-lg font-black text-[10px] uppercase disabled:opacity-40"><Plus size={12} /> Avulsa</button>
                  </div>
                )}
                {st.podeGerir && (() => {
                  const ct = contratos[c.id];
                  if (ct?.status === 'assinado') return (
                    <button onClick={() => abrirContratoAssinado(ct)} disabled={!!ocupado} className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2.5 py-1.5 rounded-lg border text-emerald-300 bg-emerald-500/10 border-emerald-500/30 w-fit">
                      <FileSignature size={12} /> Contrato assinado
                    </button>
                  );
                  return (
                    <div className="flex items-center gap-1">
                      {ct?.status === 'enviado' && (
                        <button onClick={() => setLinks({ titulo: 'Contrato aguardando assinatura', nome: c.nome, telefone: c.telefone, itens: [
                          ...(ct.link_empresa ? [{ rotulo: 'Sua assinatura (empresa assina primeiro)', url: ct.link_empresa }] : []),
                          ...(ct.link_cliente ? [{ rotulo: 'Link do cliente para assinar o contrato', url: ct.link_cliente }] : []),
                        ] })} className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2.5 py-1.5 rounded-lg border text-amber-300 bg-amber-500/10 border-amber-500/30">
                          <FileSignature size={12} /> Aguardando assinatura
                        </button>
                      )}
                      <button onClick={() => mandarContrato(c)} disabled={!!ocupado} className="inline-flex items-center gap-1 bg-white/5 border border-white/10 px-2.5 py-1.5 rounded-lg font-black text-[10px] uppercase disabled:opacity-40">
                        {ocupado === 'contrato' + c.id ? <Loader2 size={12} className="animate-spin" /> : <FileSignature size={12} />}{ct ? 'Novo contrato' : 'Gerar contrato'}
                      </button>
                    </div>
                  );
                })()}
              </div>
            );
          })}
          {clientes.length === 0 && <p className="text-sm text-slate-500 py-6 text-center">Nenhum cliente ainda.</p>}
        </div>
      </section>

      <section className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3 gap-2">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Cobranças do mês</p>
          <input type="month" value={mes} onChange={e => setMes(e.target.value || mesAtual())} className="bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-sm [color-scheme:dark]" />
        </div>
        {cobs.length === 0 ? <p className="text-sm text-slate-500 py-6 text-center">Nenhuma cobrança com vencimento neste mês.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-[10px] uppercase text-slate-500 text-left"><th className="py-2 pr-3">Cliente</th><th className="pr-3">Vence</th><th className="pr-3">Valor</th><th className="pr-3">Situação</th><th className="pr-3">Pago em</th><th></th></tr></thead>
              <tbody className="divide-y divide-white/5">
                {cobs.map(c => {
                  const si = STATUS_INFO[c.status] || { t: c.status, c: 'text-slate-400 bg-white/5 border-white/10' };
                  return (
                    <tr key={c.id}>
                      <td className="py-2 pr-3 font-bold">{nomeCli[c.cliente_id]?.nome || '—'}
                        <span className="block text-[11px] font-normal text-slate-500">{c.asaas_assinatura_id ? 'Mensalidade' : (c.descricao || 'Avulsa')}{c.forma === 'CREDIT_CARD' ? ' · cartão' : c.forma === 'PIX' ? ' · Pix' : c.forma === 'BOLETO' ? ' · boleto' : ''}</span>
                      </td>
                      <td className="pr-3 text-slate-300">{dataBR(c.vencimento)}</td>
                      <td className="pr-3">{fmtMoeda(c.valor)}</td>
                      <td className="pr-3"><span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${si.c}`}>{si.t}</span></td>
                      <td className="pr-3 text-slate-400">{dataBR(c.pago_em)}</td>
                      <td className="text-right whitespace-nowrap">
                        {c.invoice_url && <a href={c.invoice_url} target="_blank" rel="noreferrer" title="Abrir fatura" className="inline-flex p-1.5 text-slate-400 hover:text-white"><ExternalLink size={14} /></a>}
                        {c.invoice_url && !PAGOS.includes(c.status) && <button onClick={() => cobrarWhats(c)} title="Mandar cobrança pelo WhatsApp" className="inline-flex p-1.5 text-emerald-400 hover:text-emerald-300"><Send size={14} /></button>}
                        {c.nf_url && <a href={c.nf_url} target="_blank" rel="noreferrer" title="Nota fiscal" className="inline-flex p-1.5 text-sky-400"><FileText size={14} /></a>}
                        {st.podeGerir && !PAGOS.includes(c.status) && c.status !== 'REFUNDED' && (
                          <>
                            <button onClick={() => confirm(`Dar baixa de ${fmtMoeda(c.valor)} como recebido em mãos (dinheiro/maquininha)?`) && acao('receber_dinheiro', { cobrancaId: c.id }, () => 'Baixa registrada.')}
                              disabled={!!ocupado} title="Recebi em mãos" className="inline-flex p-1.5 text-amber-300 hover:text-amber-200 disabled:opacity-40"><Banknote size={14} /></button>
                            <button onClick={() => confirm('Cancelar esta cobrança? O link/boleto deixa de valer.') && acao('cancelar_cobranca', { cobrancaId: c.id }, () => 'Cobrança cancelada.')}
                              disabled={!!ocupado} title="Cancelar cobrança" className="inline-flex p-1.5 text-slate-500 hover:text-red-400 disabled:opacity-40"><Trash2 size={14} /></button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {cfgAberta && cfg && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setCfgAberta(false)}>
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-black uppercase mb-4 flex items-center gap-2"><Settings2 size={18} /> Regras de cobrança</h2>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <Campo l="Suspender app após (dias de atraso)" v={cfg.dias_suspensao} on={x => setCfg({ ...cfg, dias_suspensao: x })} />
              <Campo l="Multa (%)" v={cfg.multa_pct} on={x => setCfg({ ...cfg, multa_pct: x })} />
              <Campo l="Juros ao mês (%)" v={cfg.juros_mes_pct} on={x => setCfg({ ...cfg, juros_mes_pct: x })} />
            </div>
            <p className="text-[11px] text-slate-500 mb-4">Suspensão bloqueia só o app do cliente (o rastreador continua funcionando para a central). Pagou, reativa sozinho. 0 = nunca suspender automaticamente. Multa máxima 2% e juros 1% ao mês (Código de Defesa do Consumidor).</p>
            <label className="flex items-center gap-2 text-sm font-bold mb-2">
              <input type="checkbox" checked={cfg.nfse_automatica} onChange={e => setCfg({ ...cfg, nfse_automatica: e.target.checked })} className="accent-emerald-500 w-4 h-4" />
              Emitir nota fiscal (NFS-e) automática quando a mensalidade for paga
            </label>
            {cfg.nfse_automatica && (
              <div className="space-y-2 mb-2">
                <input value={cfg.nfse_servico_codigo || ''} onChange={e => setCfg({ ...cfg, nfse_servico_codigo: e.target.value })} placeholder="Código do serviço municipal (seu contador informa)" className={inp} />
                <input value={cfg.nfse_servico_descricao || ''} onChange={e => setCfg({ ...cfg, nfse_servico_descricao: e.target.value })} placeholder="Descrição do serviço" className={inp} />
                <p className="text-[11px] text-amber-200/80 flex gap-1"><AlertTriangle size={12} className="shrink-0 mt-0.5" /> Antes, configure a emissão de notas no Asaas (Notas Fiscais → Configurações) com os dados da prefeitura. Vale para as cobranças criadas ou atualizadas depois de ligar.</p>
              </div>
            )}
            <div className="border-t border-white/10 mt-5 pt-4">
              <p className="font-black uppercase text-sm mb-1 flex items-center gap-2"><FileSignature size={16} /> Dados do contrato</p>
              <p className="text-[11px] text-slate-500 mb-3">Vão no contrato de rastreamento que o cliente assina pelo celular. Modelo padrão com comodato do equipamento, bloqueio e LGPD: vale revisar com um advogado.</p>
              <div className="grid grid-cols-2 gap-2">
                <TextoCfg l="Razão social (ou nome do MEI)" v={cfg.emp_razao} on={x => setCfg({ ...cfg, emp_razao: x })} cls="col-span-2" />
                <TextoCfg l="CNPJ" v={cfg.emp_documento} on={x => setCfg({ ...cfg, emp_documento: x })} />
                <TextoCfg l="Telefone" v={cfg.emp_telefone} on={x => setCfg({ ...cfg, emp_telefone: x })} />
                <TextoCfg l="Endereço" v={cfg.emp_endereco} on={x => setCfg({ ...cfg, emp_endereco: x })} cls="col-span-2" />
                <TextoCfg l="Cidade (foro)" v={cfg.emp_cidade} on={x => setCfg({ ...cfg, emp_cidade: x })} />
                <TextoCfg l="UF" v={cfg.emp_uf} on={x => setCfg({ ...cfg, emp_uf: x.toUpperCase().slice(0, 2) })} />
                <TextoCfg l="E-mail de quem assina pela empresa" v={cfg.emp_email} on={x => setCfg({ ...cfg, emp_email: x })} cls="col-span-2" />
              </div>
              <div className="grid grid-cols-3 gap-3 mt-3">
                <Campo l="Fidelidade (meses, 0 = sem)" v={cfg.contrato_fidelidade_meses} on={x => setCfg({ ...cfg, contrato_fidelidade_meses: x })} />
                <Campo l="Valor do equipamento (R$)" v={cfg.contrato_valor_equipamento} on={x => setCfg({ ...cfg, contrato_valor_equipamento: x })} />
                <Campo l="Taxa de instalação (R$)" v={cfg.contrato_taxa_instalacao} on={x => setCfg({ ...cfg, contrato_taxa_instalacao: x })} />
              </div>
              <label className="block mt-3">
                <span className="text-[10px] font-black uppercase text-slate-500">Cláusulas adicionais (opcional, uma por linha)</span>
                <textarea value={cfg.contrato_texto_extra || ''} onChange={e => setCfg({ ...cfg, contrato_texto_extra: e.target.value })} rows={3} className={`${inp} mt-1`} />
              </label>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setCfgAberta(false)} className="flex-1 bg-white/5 border border-white/10 rounded-xl py-3 font-black text-xs uppercase">Fechar</button>
              <button onClick={() => acao('config', { config: { ...cfg, contrato: cfg } }, () => 'Regras salvas.').then(() => setCfgAberta(false))} disabled={!!ocupado}
                className="flex-1 bg-[#22C55E] text-[#0B1120] rounded-xl py-3 font-black text-xs uppercase disabled:opacity-40">Salvar</button>
            </div>
          </div>
        </div>
      )}
      {avulsa && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => !ocupado && setAvulsa(null)}>
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6 w-full max-w-md space-y-3" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-black uppercase flex items-center gap-2"><Plus size={18} /> Cobrança avulsa</h2>
            <p className="text-sm text-slate-400 -mt-2">{avulsa.nome}</p>
            <label className="block"><span className="text-[10px] font-black uppercase text-slate-500">Descrição</span>
              <input list="desc-avulsa" value={avulsa.descricao} onChange={e => setAvulsa({ ...avulsa, descricao: e.target.value })} className={`${inp} mt-1`} />
              <datalist id="desc-avulsa">{DESCRICOES.map(d => <option key={d} value={d} />)}</datalist>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className="text-[10px] font-black uppercase text-slate-500">Valor total (R$)</span>
                <input value={avulsa.valor} onChange={e => setAvulsa({ ...avulsa, valor: e.target.value.replace(/[^\d,.]/g, '') })} inputMode="decimal" placeholder="150,00" className={`${inp} mt-1`} />
              </label>
              <label className="block"><span className="text-[10px] font-black uppercase text-slate-500">Vencimento</span>
                <input type="date" value={avulsa.vencimento} min={new Date().toLocaleDateString('en-CA')} onChange={e => setAvulsa({ ...avulsa, vencimento: e.target.value })} className={`${inp} mt-1 [color-scheme:dark]`} />
              </label>
              <label className="block"><span className="text-[10px] font-black uppercase text-slate-500">Forma</span>
                <select value={avulsa.forma} onChange={e => setAvulsa({ ...avulsa, forma: e.target.value, parcelas: e.target.value === 'PIX' ? 1 : avulsa.parcelas })} className={`${inp} mt-1 [color-scheme:dark]`}>
                  <option value="UNDEFINED">Cliente escolhe</option><option value="BOLETO">Boleto</option><option value="PIX">Pix</option><option value="CREDIT_CARD">Cartão de crédito</option>
                </select>
              </label>
              <label className="block"><span className="text-[10px] font-black uppercase text-slate-500">Parcelas</span>
                <select value={avulsa.parcelas} disabled={avulsa.forma === 'PIX'} onChange={e => setAvulsa({ ...avulsa, parcelas: Number(e.target.value) })} className={`${inp} mt-1 [color-scheme:dark] disabled:opacity-40`}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n === 1 ? 'À vista' : `${n}x`}</option>)}
                </select>
              </label>
            </div>
            <p className="text-[11px] text-slate-500">O cliente recebe o link para pagar. No cartão parcelado o Asaas cobra as parcelas no cartão sozinho; no boleto parcelado vai um boleto por mês.</p>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setAvulsa(null)} disabled={!!ocupado} className="flex-1 bg-white/5 border border-white/10 rounded-xl py-3 font-black text-xs uppercase">Cancelar</button>
              <button onClick={emitirAvulsa} disabled={!!ocupado || !avulsa.valor || !avulsa.descricao.trim()} className="flex-1 bg-[#22C55E] text-[#0B1120] rounded-xl py-3 font-black text-xs uppercase disabled:opacity-40 inline-flex items-center justify-center gap-2">
                {ocupado.startsWith('avulsa') && <Loader2 size={14} className="animate-spin" />} Emitir cobrança
              </button>
            </div>
          </div>
        </div>
      )}

      {links && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setLinks(null)}>
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6 w-full max-w-md space-y-3" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-black uppercase">{links.titulo}</h2>
            <p className="text-sm text-slate-400 -mt-2">{links.nome}</p>
            {links.itens.map(it => {
              const fone = String(links.telefone || '').replace(/\D/g, '');
              const txt = `Olá ${links.nome.split(' ')[0]}! ${it.rotulo}: ${it.url}`;
              return (
                <div key={it.url} className="rounded-xl border border-white/10 p-3 space-y-2">
                  <p className="text-[11px] font-black uppercase text-slate-400">{it.rotulo}</p>
                  <input readOnly value={it.url} onFocus={e => e.currentTarget.select()} className={`${inp} text-xs font-mono`} />
                  <div className="flex gap-2">
                    <button onClick={() => navigator.clipboard?.writeText(it.url).then(() => setAviso({ ok: true, t: 'Link copiado.' })).catch(() => null)} className="flex-1 inline-flex items-center justify-center gap-1 bg-white/5 border border-white/10 rounded-lg py-2 text-[11px] font-black uppercase"><Copy size={12} /> Copiar</button>
                    <a href={it.url} target="_blank" rel="noreferrer" className="flex-1 inline-flex items-center justify-center gap-1 bg-white/5 border border-white/10 rounded-lg py-2 text-[11px] font-black uppercase"><ExternalLink size={12} /> Abrir</a>
                    {!it.rotulo.startsWith('Sua') && <a href={fone ? `https://wa.me/55${fone}?text=${encodeURIComponent(txt)}` : `https://wa.me/?text=${encodeURIComponent(txt)}`} target="_blank" rel="noreferrer" className="flex-1 inline-flex items-center justify-center gap-1 bg-emerald-600 rounded-lg py-2 text-[11px] font-black uppercase"><Send size={12} /> WhatsApp</a>}
                  </div>
                </div>
              );
            })}
            <button onClick={() => setLinks(null)} className="w-full bg-white/5 border border-white/10 rounded-xl py-3 font-black text-xs uppercase">Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function TextoCfg({ l, v, on, cls }: { l: string; v: string | null; on: (x: string) => void; cls?: string }) {
  return (
    <label className={`block ${cls || ''}`}>
      <span className="text-[10px] font-black uppercase text-slate-500">{l}</span>
      <input value={v || ''} onChange={e => on(e.target.value)} className="w-full mt-1 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none" />
    </label>
  );
}

function Card({ l, v, c, sub }: { l: string; v: string; c?: string; sub?: string }) {
  return (
    <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{l}</p>
      <p className={`text-xl font-black ${c || 'text-white'}`}>{v}</p>
      {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
    </div>
  );
}

function Campo({ l, v, on }: { l: string; v: number; on: (x: number) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase text-slate-500 leading-tight block min-h-[28px]">{l}</span>
      <input type="number" value={v} onChange={e => on(Number(e.target.value))} className="w-full mt-1 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none" />
    </label>
  );
}
