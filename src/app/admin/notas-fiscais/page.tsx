"use client";
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  Receipt, ShieldAlert, Loader2, Save, Search, Check, X, AlertTriangle, RefreshCw, Mail, FileText,
  Plus, CheckCircle2, Circle, Zap, Send,
} from 'lucide-react';
import { SkeletonPage } from '@/components/Skeleton';

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '').split(',').map(e => e.trim());

type Config = {
  ativo: boolean; municipal_service_id: string | null; municipal_service_code: string; municipal_service_name: string;
  descricao: string; observacoes: string | null; iss: number; retain_iss: boolean; enviar_email: boolean;
};
type Nota = {
  id: string; empresa_id: string; empresa_nome: string; empresa_logo: string | null; competencia: string; valor: number;
  status: string; numero: string | null; pdf_url: string | null; xml_url: string | null; erro: string | null;
  email_para: string | null; email_enviado_em: string | null; origem: string | null; created_at: string;
};

const STATUS: Record<string, { label: string; cor: string }> = {
  SCHEDULED:               { label: 'Agendada',      cor: 'bg-sky-500/10 text-sky-300 ring-sky-500/25' },
  SYNCHRONIZED:            { label: 'Na prefeitura', cor: 'bg-sky-500/10 text-sky-300 ring-sky-500/25' },
  AUTHORIZED:              { label: 'Autorizada',    cor: 'bg-[#22C55E]/10 text-[#4ADE80] ring-[#22C55E]/25' },
  PROCESSING_CANCELLATION: { label: 'Cancelando',    cor: 'bg-yellow-500/10 text-yellow-300 ring-yellow-500/25' },
  CANCELED:                { label: 'Cancelada',     cor: 'bg-slate-500/10 text-slate-400 ring-slate-500/25' },
  CANCELLATION_DENIED:     { label: 'Cancel. negado',cor: 'bg-red-500/10 text-red-300 ring-red-500/25' },
  ERROR:                   { label: 'Erro',          cor: 'bg-red-500/10 text-red-300 ring-red-500/25' },
};

const brl = (v: number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const comp = (c: string) => { const [a, m] = c.split('-'); return `${m}/${a}`; };
const BTN_PRI = 'inline-flex items-center gap-2 bg-[#22C55E] hover:bg-[#2BD468] text-[#0B1120] px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50';
const BTN_SEC = 'inline-flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-200 hover:text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50';
const INPUT = 'w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#22C55E]/60 focus:ring-2 focus:ring-[#22C55E]/15 transition';

export default function NotasFiscaisPage() {
  const { user, loading: authLoading } = useAuth();
  const [token, setToken] = useState('');
  const [config, setConfig] = useState<Config | null>(null);
  const [fiscal, setFiscal] = useState<{ configurado: boolean; detalhe?: string; dados?: any } | null>(null);
  const [notas, setNotas] = useState<Nota[]>([]);
  const [loading, setLoading] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [busca, setBusca] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [servicos, setServicos] = useState<{ id: string; codigo: string; nome: string }[] | null>(null);
  const [acaoId, setAcaoId] = useState<string | null>(null);

  const [emitirAberto, setEmitirAberto] = useState(false);
  const [clientes, setClientes] = useState<{ id: string; nome: string }[]>([]);
  const [emitirEmpresa, setEmitirEmpresa] = useState('');
  const [emitirComp, setEmitirComp] = useState(new Date().toISOString().substring(0, 7));
  const [emitindo, setEmitindo] = useState(false);
  const [erroEmitir, setErroEmitir] = useState<string | null>(null);

  const isAdmin = !authLoading && user && ADMIN_EMAILS.includes(user.email || '');

  useEffect(() => {
    if (!user) return;
    supabase.auth.getSession().then(({ data: { session } }) => { if (session?.access_token) setToken(session.access_token); });
  }, [user]);
  useEffect(() => { if (token) carregar(); }, [token]);

  const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` });

  const carregar = async () => {
    setLoading(true); setErroCarga(null);
    try {
      const res = await fetch('/api/admin/nota-fiscal', { headers: headers() });
      const json = await res.json();
      if (!res.ok) { setErroCarga(json.erro || 'Erro ao carregar.'); return; }
      setConfig(json.config); setFiscal(json.fiscal); setNotas(json.notas);
    } catch (err: any) {
      setErroCarga(err?.message || 'Erro ao carregar.');
    } finally { setLoading(false); }
  };

  const post = async (body: any) => {
    const res = await fetch('/api/admin/nota-fiscal', { method: 'POST', headers: headers(), body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, json };
  };

  const salvar = async () => {
    if (!config) return;
    setSalvando(true);
    const { ok, json } = await post({ acao: 'salvar', ...config, iss: Number(config.iss) || 0 });
    setSalvando(false);
    if (!ok) { alert(json.erro || 'Erro ao salvar.'); return; }
    setSalvo(true); setTimeout(() => setSalvo(false), 2000);
  };

  const buscarServicos = async () => {
    setBuscando(true);
    const { ok, json } = await post({ acao: 'servicos', q: busca });
    setBuscando(false);
    if (!ok) { alert(json.erro || 'Erro na busca.'); return; }
    setServicos(json.servicos);
  };

  const acaoNota = async (n: Nota, acao: 'sincronizar' | 'reenviar') => {
    setAcaoId(n.id + acao);
    const { ok, json } = await post({ acao, id: n.id });
    setAcaoId(null);
    if (!ok) { alert(json.erro || 'Erro.'); return; }
    carregar();
  };

  const abrirEmitir = async () => {
    setErroEmitir(null); setEmitirAberto(true);
    if (clientes.length) return;
    const res = await fetch('/api/admin/empresas', { headers: headers() });
    const lista = res.ok ? await res.json() : [];
    setClientes(lista.filter((e: any) => e.status === 'ativa' && !e.modulos?.demo).sort((a: any, b: any) => a.nome.localeCompare(b.nome)));
  };

  const emitir = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmitindo(true); setErroEmitir(null);
    const { ok, json } = await post({ acao: 'emitir', empresa_id: emitirEmpresa, competencia: emitirComp });
    setEmitindo(false);
    if (!ok) { setErroEmitir(json.erro || 'Erro ao emitir.'); carregar(); return; }
    if (json.jaExistia) alert('Essa empresa já tem nota nessa competência — nada foi emitido de novo.');
    setEmitirAberto(false);
    carregar();
  };

  if (authLoading) return <div className="p-4 md:p-8"><SkeletonPage /></div>;
  if (!isAdmin) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center"><ShieldAlert className="mx-auto text-red-500 mb-4" size={48}/><p className="text-white font-semibold text-xl">Acesso restrito</p></div>
    </div>
  );

  const passos = [
    { ok: !!fiscal?.configurado, titulo: 'Conta Asaas habilitada para NFS-e', texto: fiscal?.configurado ? 'Dados fiscais encontrados no Asaas da WeGrow.' : 'No Asaas: Notas fiscais → Configurações (Curitiba, Simples Nacional, certificado A1).' },
    { ok: !!config?.municipal_service_code && !!config?.descricao, titulo: 'Modelo da nota', texto: config ? `Serviço ${config.municipal_service_code} — ${config.municipal_service_name}` : '—' },
    { ok: !!config?.ativo, titulo: 'Emissão automática', texto: config?.ativo ? 'Emite quando o pagamento é recebido e envia por e-mail.' : 'Desligada — só emite pelo botão "Emitir nota".' },
  ];
  const competenciaAtual = new Date().toISOString().substring(0, 7);
  const previa = (config?.descricao || '').replaceAll('{competencia}', comp(competenciaAtual)).replaceAll('{empresa}', 'Cliente Exemplo LTDA');
  const autorizadasMes = notas.filter(n => n.status === 'AUTHORIZED' && n.competencia === competenciaAtual);

  return (
    <div className="text-white pb-20">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mt-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-[28px] font-semibold tracking-tight flex items-center gap-2.5"><Receipt size={22} className="text-[#22C55E]"/> Notas fiscais</h1>
            <p className="text-sm text-slate-400 mt-1">NFS-e da mensalidade WeGrow, emitida pelo Asaas e enviada para o e-mail financeiro de cada cliente.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={carregar} title="Atualizar" className={BTN_SEC}><RefreshCw size={15} className={loading ? 'animate-spin' : ''}/></button>
            <button onClick={abrirEmitir} className={BTN_PRI}><Plus size={15}/> Emitir nota</button>
          </div>
        </div>

        {erroCarga && (
          <div className="bg-red-500/[0.08] border border-red-500/20 rounded-xl p-4 mb-6 text-sm text-red-300 flex items-center gap-2"><AlertTriangle size={15}/> {erroCarga}</div>
        )}

        {loading && !config ? (
          <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-white/[0.03] rounded-2xl animate-pulse"/>)}</div>
        ) : config && (
          <>
            {/* Checklist */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-white/[0.06] border border-white/[0.06] rounded-2xl overflow-hidden mb-6">
              {passos.map((p, i) => (
                <div key={i} className="bg-[#0F172A] p-5 flex gap-3">
                  {p.ok ? <CheckCircle2 size={20} className="text-[#22C55E] shrink-0 mt-0.5"/> : <Circle size={20} className="text-slate-600 shrink-0 mt-0.5"/>}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{p.titulo}</p>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">{p.texto}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-8">
              {/* Modelo */}
              <div className="lg:col-span-3 bg-[#0F172A]/60 border border-white/[0.06] rounded-2xl p-5 space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Modelo da nota</h2>
                  <span className="text-xs text-slate-500">Espelha a NFS-e nº 8 (Trailer Travel)</span>
                </div>

                <label className="flex items-center justify-between gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] cursor-pointer">
                  <span>
                    <span className="text-sm font-medium flex items-center gap-2"><Zap size={14} className="text-[#22C55E]"/> Emitir automaticamente</span>
                    <span className="block text-xs text-slate-400 mt-0.5">Ao clicar em "Pagamento recebido" no God Mode ou quando o Asaas confirmar o pagamento.</span>
                  </span>
                  <Toggle on={config.ativo} onChange={v => setConfig({ ...config, ativo: v })}/>
                </label>

                <div>
                  <p className="text-[13px] text-slate-300 mb-1.5">Serviço (Código de Tributação Nacional)</p>
                  <div className="grid grid-cols-[110px_1fr] gap-2">
                    <input value={config.municipal_service_code} onChange={e => setConfig({ ...config, municipal_service_code: e.target.value, municipal_service_id: null })} className={INPUT}/>
                    <input value={config.municipal_service_name} onChange={e => setConfig({ ...config, municipal_service_name: e.target.value, municipal_service_id: null })} className={INPUT}/>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <div className="flex-1 flex items-center bg-white/[0.04] border border-white/10 rounded-lg px-3 gap-2 focus-within:border-[#22C55E]/50">
                      <Search size={14} className="text-slate-500"/>
                      <input value={busca} onChange={e => setBusca(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); buscarServicos(); } }}
                        placeholder="Buscar na lista do Asaas (ex.: desenvolvimento)" className="flex-1 bg-transparent outline-none text-sm py-2 placeholder:text-slate-500"/>
                    </div>
                    <button onClick={buscarServicos} disabled={buscando} className={BTN_SEC}>{buscando ? <Loader2 size={14} className="animate-spin"/> : 'Buscar'}</button>
                  </div>
                  {config.municipal_service_id && <p className="text-xs text-[#4ADE80] mt-1.5 flex items-center gap-1"><Check size={12}/> Vinculado ao serviço do Asaas (id {config.municipal_service_id})</p>}
                  {servicos && (
                    <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-white/[0.06] divide-y divide-white/[0.04]">
                      {servicos.length === 0 && <p className="text-xs text-slate-500 p-3">Nada encontrado — mantenha o código digitado.</p>}
                      {servicos.map(s => (
                        <button key={s.id} onClick={() => { setConfig({ ...config, municipal_service_id: s.id, municipal_service_code: s.codigo || config.municipal_service_code, municipal_service_name: s.nome }); setServicos(null); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-white/[0.04] flex gap-3">
                          <span className="text-slate-400 tabular-nums shrink-0">{s.codigo}</span><span className="truncate">{s.nome}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-[13px] text-slate-300 mb-1.5">Descrição do serviço <span className="text-slate-500">— use {'{competencia}'} e {'{empresa}'}</span></p>
                  <textarea rows={6} value={config.descricao} onChange={e => setConfig({ ...config, descricao: e.target.value })} className={INPUT + ' font-mono text-[13px] resize-y'}/>
                </div>
                <div>
                  <p className="text-[13px] text-slate-300 mb-1.5">Observações</p>
                  <textarea rows={2} value={config.observacoes || ''} onChange={e => setConfig({ ...config, observacoes: e.target.value })} className={INPUT + ' resize-y'}/>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <p className="text-[13px] text-slate-300 mb-1.5">ISS %</p>
                    <input type="number" step="0.01" value={config.iss} onChange={e => setConfig({ ...config, iss: e.target.value as any })} className={INPUT}/>
                    <p className="text-[11px] text-slate-500 mt-1">Simples Nacional: 0 (vai no DAS)</p>
                  </div>
                  <label className="flex items-center justify-between gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] cursor-pointer sm:mt-6 h-fit">
                    <span className="text-sm">Reter ISS</span><Toggle on={config.retain_iss} onChange={v => setConfig({ ...config, retain_iss: v })}/>
                  </label>
                  <label className="flex items-center justify-between gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] cursor-pointer sm:mt-6 h-fit">
                    <span className="text-sm">Enviar e-mail</span><Toggle on={config.enviar_email} onChange={v => setConfig({ ...config, enviar_email: v })}/>
                  </label>
                </div>

                <div className="flex justify-end">
                  <button onClick={salvar} disabled={salvando} className={BTN_PRI}>
                    {salvando ? <Loader2 size={14} className="animate-spin"/> : salvo ? <Check size={14}/> : <Save size={14}/>} {salvo ? 'Salvo' : 'Salvar modelo'}
                  </button>
                </div>
              </div>

              {/* Prévia */}
              <div className="lg:col-span-2 space-y-4">
                <div className="bg-white text-slate-800 rounded-2xl overflow-hidden shadow-2xl">
                  <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-600">DANFSe · prévia</span>
                    <span className="text-[11px] text-slate-500">Curitiba / PR</span>
                  </div>
                  <div className="p-5 space-y-4 text-[12px]">
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase">Prestador</p>
                      <p className="font-semibold">WILLIAN DA SILVA ANADAO TECNOLOGIA DA INFORMACAO LTDA</p>
                      <p className="text-slate-500">66.660.599/0001-06 · Simples Nacional</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase">Tomador</p>
                      <p className="font-semibold">Cliente (razão social e CNPJ da aba Faturamento)</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase">Serviço prestado · {config.municipal_service_code}</p>
                      <p className="font-semibold">{config.municipal_service_name}</p>
                      <p className="whitespace-pre-line text-slate-700 mt-2 leading-relaxed">{previa}</p>
                      {config.observacoes && <p className="text-slate-500 mt-2 text-[11px]">{config.observacoes}</p>}
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                      <span className="text-slate-500">ISSQN {Number(config.iss) || 0}% · {config.retain_iss ? 'Retido' : 'Não retido'}</span>
                      <span className="font-bold text-sm">Valor da mensalidade</span>
                    </div>
                  </div>
                </div>
                <div className="bg-[#0F172A]/60 border border-white/[0.06] rounded-2xl p-5 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-400">Autorizadas em {comp(competenciaAtual)}</p>
                    <p className="text-2xl font-semibold tabular-nums mt-1">{autorizadasMes.length}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Valor faturado</p>
                    <p className="text-2xl font-semibold tabular-nums mt-1">{brl(autorizadasMes.reduce((s, n) => s + Number(n.valor), 0))}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Notas emitidas */}
            <div className="bg-[#0F172A]/60 border border-white/[0.06] rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
                <h2 className="text-base font-semibold">Notas emitidas</h2>
                <span className="text-xs text-slate-500">{notas.length} no histórico</span>
              </div>
              {notas.length === 0 ? (
                <div className="text-center py-14">
                  <FileText className="mx-auto text-slate-600 mb-3" size={28}/>
                  <p className="text-sm text-slate-400">Nenhuma nota emitida ainda.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-500 border-b border-white/[0.06]">
                        <th className="text-left font-medium py-2.5 pl-5 pr-3">Cliente</th>
                        <th className="text-left font-medium py-2.5 px-3">Competência</th>
                        <th className="text-left font-medium py-2.5 px-3">Situação</th>
                        <th className="text-right font-medium py-2.5 px-3">Valor</th>
                        <th className="text-left font-medium py-2.5 px-3 hidden md:table-cell">E-mail</th>
                        <th className="pr-5"/>
                      </tr>
                    </thead>
                    <tbody>
                      {notas.map(n => {
                        const st = STATUS[n.status] || STATUS.SCHEDULED;
                        return (
                          <tr key={n.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
                            <td className="py-3 pl-5 pr-3">
                              <p className="font-medium truncate max-w-[220px]">{n.empresa_nome}</p>
                              <p className="text-xs text-slate-500">{n.numero ? `NFS-e nº ${n.numero}` : 'Sem número ainda'} · {new Date(n.created_at).toLocaleDateString('pt-BR')}</p>
                            </td>
                            <td className="py-3 px-3 tabular-nums text-slate-300">{comp(n.competencia)}</td>
                            <td className="py-3 px-3">
                              <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ring-1 ring-inset ${st.cor}`}>{st.label}</span>
                              {n.erro && <p className="text-xs text-red-300 mt-1 max-w-[280px]">{n.erro}</p>}
                            </td>
                            <td className="py-3 px-3 text-right tabular-nums font-medium">{brl(n.valor)}</td>
                            <td className="py-3 px-3 hidden md:table-cell">
                              {n.email_enviado_em
                                ? <span className="text-xs text-[#4ADE80] flex items-center gap-1.5"><Check size={12}/> {n.email_para}</span>
                                : <span className="text-xs text-slate-500 flex items-center gap-1.5"><Mail size={12}/> {n.email_para || 'sem e-mail cadastrado'}</span>}
                            </td>
                            <td className="py-3 pr-5">
                              <div className="flex items-center justify-end gap-1">
                                {n.pdf_url && <a href={n.pdf_url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 px-2.5 py-1.5 rounded-lg">PDF</a>}
                                {n.status !== 'ERROR' && (
                                  <button onClick={() => acaoNota(n, 'sincronizar')} title="Atualizar com o Asaas" className="p-1.5 rounded-md text-slate-500 hover:text-white hover:bg-white/[0.06]">
                                    {acaoId === n.id + 'sincronizar' ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>}
                                  </button>
                                )}
                                {n.status === 'AUTHORIZED' && (
                                  <button onClick={() => acaoNota(n, 'reenviar')} title="Reenviar e-mail" className="p-1.5 rounded-md text-slate-500 hover:text-white hover:bg-white/[0.06]">
                                    {acaoId === n.id + 'reenviar' ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {emitirAberto && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={emitir} className="bg-[#0F172A] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold flex items-center gap-2"><Receipt size={16} className="text-[#22C55E]"/> Emitir nota</h3>
              <button type="button" onClick={() => setEmitirAberto(false)} className="p-1.5 rounded-md text-slate-500 hover:bg-white/[0.06]"><X size={16}/></button>
            </div>
            <label className="block">
              <span className="text-[13px] text-slate-300 mb-1.5 block">Cliente</span>
              <select required value={emitirEmpresa} onChange={e => setEmitirEmpresa(e.target.value)} className={INPUT}>
                <option value="" className="bg-[#0B1120]">Selecione...</option>
                {clientes.map(c => <option key={c.id} value={c.id} className="bg-[#0B1120]">{c.nome}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[13px] text-slate-300 mb-1.5 block">Competência</span>
              <input required type="month" value={emitirComp} onChange={e => setEmitirComp(e.target.value)} className={INPUT}/>
            </label>
            <p className="text-xs text-slate-500">Valor, razão social e CNPJ vêm da aba Faturamento do cliente. A nota vai para o e-mail financeiro cadastrado lá assim que a prefeitura autorizar.</p>
            {erroEmitir && <div className="text-sm p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300">{erroEmitir}</div>}
            <button type="submit" disabled={emitindo || !emitirEmpresa} className={BTN_PRI + ' w-full justify-center'}>
              {emitindo ? <Loader2 size={14} className="animate-spin"/> : <Receipt size={14}/>} Emitir nota
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={e => { e.preventDefault(); onChange(!on); }}
      className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${on ? 'bg-[#22C55E]' : 'bg-white/10'}`}>
      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${on ? 'left-5' : 'left-1'}`}/>
    </button>
  );
}
