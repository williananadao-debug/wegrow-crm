"use client";
import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Plus, Search, Users, Car, Pencil, X, Lock, Phone, Smartphone, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  useRastreioAccess, COLUNAS_VEICULO, situacao, SITUACAO_INFO, fmtMoeda, mascaraPlaca, mascaraDocumento, apiRastreio,
  type ClienteRastreio, type Veiculo,
} from '../shared';

const CLIENTE_VAZIO = { tipo: 'PF' as 'PF' | 'PJ', nome: '', documento: '', telefone: '', email: '', endereco: '', cidade: '', mensalidade: '', dia_vencimento: '10', status: 'ativo', observacoes: '' };
const VEICULO_VAZIO = {
  placa: '', descricao: '', tipo: 'carro', imei: '', modelo_rastreador: '', chip_numero: '', chip_operadora: '',
  tem_bloqueio: true, instalado_em: new Date().toLocaleDateString('en-CA'), instalado_por: '', limite_velocidade: '',
};
const TIPOS = [['carro', 'Carro'], ['moto', 'Moto'], ['caminhao', 'Caminhão'], ['van', 'Van/Utilitário'], ['maquina', 'Máquina'], ['outro', 'Outro']];

type Modal =
  | { tipo: 'instalacao'; clienteId: string | null }   // novo veículo (cliente novo ou existente)
  | { tipo: 'veiculo'; veiculo: Veiculo }               // editar veículo
  | { tipo: 'cliente'; cliente: ClienteRastreio };      // editar cliente

export default function RastreioClientesPage() {
  const { authLoading, perfil, temRastreio, podeBloquear } = useRastreioAccess();
  const empresaId = perfil?.empresa_id as string | undefined;

  const [clientes, setClientes] = useState<ClienteRastreio[]>([]);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [modal, setModal] = useState<Modal | null>(null);
  const [cf, setCf] = useState(CLIENTE_VAZIO);
  const [vf, setVf] = useState(VEICULO_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  const carregar = useCallback(async () => {
    if (!empresaId) return;
    const [{ data: cs }, { data: vs }] = await Promise.all([
      supabase.from('rastreio_clientes').select('*').eq('empresa_id', empresaId).order('nome'),
      supabase.from('rastreio_veiculos').select(COLUNAS_VEICULO).eq('empresa_id', empresaId).order('placa'),
    ]);
    setClientes((cs as ClienteRastreio[]) || []);
    setVeiculos((vs as Veiculo[]) || []);
    setLoading(false);
    return (vs as Veiculo[]) || [];
  }, [empresaId]);

  // ?nova=1 abre a nova instalação; ?veiculo=<id> abre a edição (link do detalhe do veículo).
  useEffect(() => {
    carregar()?.then(vs => {
      const q = new URLSearchParams(window.location.search);
      if (q.get('nova')) abrirInstalacao(null);
      const vid = q.get('veiculo');
      const alvo = vid && vs?.find(v => v.id === vid);
      if (alvo) abrirVeiculo(alvo);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregar]);

  const porCliente = useMemo(() => {
    const m: Record<string, Veiculo[]> = {};
    veiculos.forEach(v => { (m[v.cliente_id || '_'] ||= []).push(v); });
    return m;
  }, [veiculos]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter(c => [c.nome, c.documento, c.telefone, ...(porCliente[c.id] || []).flatMap(v => [v.placa, v.imei])]
      .some(x => String(x || '').toLowerCase().includes(q)));
  }, [clientes, busca, porCliente]);

  const receitaMensal = clientes.filter(c => c.status === 'ativo').reduce((s, c) => s + Number(c.mensalidade || 0), 0);
  const ativos = veiculos.filter(v => v.status === 'ativo').length;

  function abrirInstalacao(clienteId: string | null) {
    setCf(CLIENTE_VAZIO); setVf(VEICULO_VAZIO); setErro('');
    setModal({ tipo: 'instalacao', clienteId });
  }
  function abrirVeiculo(v: Veiculo) {
    setVf({
      placa: v.placa, descricao: v.descricao || '', tipo: v.tipo, imei: v.imei, modelo_rastreador: v.modelo_rastreador || '',
      chip_numero: v.chip_numero || '', chip_operadora: v.chip_operadora || '', tem_bloqueio: v.tem_bloqueio,
      instalado_em: v.instalado_em || '', instalado_por: v.instalado_por || '', limite_velocidade: v.limite_velocidade ? String(v.limite_velocidade) : '',
    });
    setErro('');
    setModal({ tipo: 'veiculo', veiculo: v });
  }
  function abrirCliente(c: ClienteRastreio) {
    setCf({
      tipo: c.tipo, nome: c.nome, documento: c.documento ? mascaraDocumento(c.documento) : '', telefone: c.telefone || '', email: c.email || '',
      endereco: c.endereco || '', cidade: c.cidade || '', mensalidade: String(c.mensalidade ?? ''), dia_vencimento: String(c.dia_vencimento ?? '10'),
      status: c.status, observacoes: c.observacoes || '',
    });
    setErro('');
    setModal({ tipo: 'cliente', cliente: c });
  }

  const dadosCliente = () => ({
    tipo: cf.tipo, nome: cf.nome.trim(), documento: cf.documento.replace(/\D/g, '') || null, telefone: cf.telefone.trim() || null,
    email: cf.email.trim() || null, endereco: cf.endereco.trim() || null, cidade: cf.cidade.trim() || null,
    mensalidade: Number(String(cf.mensalidade).replace(',', '.')) || 0, dia_vencimento: Number(cf.dia_vencimento) || null,
    status: cf.status, observacoes: cf.observacoes.trim() || null,
  });
  const dadosVeiculo = () => ({
    placa: mascaraPlaca(vf.placa), descricao: vf.descricao.trim() || null, tipo: vf.tipo, imei: vf.imei.replace(/\s/g, ''),
    modelo_rastreador: vf.modelo_rastreador.trim() || null, chip_numero: vf.chip_numero.trim() || null, chip_operadora: vf.chip_operadora.trim() || null,
    tem_bloqueio: vf.tem_bloqueio, instalado_em: vf.instalado_em || null, instalado_por: vf.instalado_por.trim() || null,
    limite_velocidade: Number(vf.limite_velocidade) || null,
  });

  const validarVeiculo = () => {
    const d = dadosVeiculo();
    if (d.placa.length < 7) return 'Placa incompleta (7 caracteres).';
    if (!/^\d{10,17}$/.test(d.imei)) return 'IMEI deve ter só números (normalmente 15). Está na etiqueta do rastreador.';
    return '';
  };

  const salvar = async () => {
    if (!modal || !empresaId) return;
    setErro('');
    setSalvando(true);
    try {
      if (modal.tipo === 'cliente') {
        if (!cf.nome.trim()) throw new Error('Informe o nome do cliente.');
        const { error } = await supabase.from('rastreio_clientes').update(dadosCliente()).eq('id', modal.cliente.id);
        if (error) throw error;
        setAviso('Cliente atualizado.');
      } else {
        const msg = validarVeiculo();
        if (msg) throw new Error(msg);
        let veiculoId: string;
        if (modal.tipo === 'veiculo') {
          const { error } = await supabase.from('rastreio_veiculos').update(dadosVeiculo()).eq('id', modal.veiculo.id);
          if (error) throw error;
          veiculoId = modal.veiculo.id;
        } else {
          let clienteId = modal.clienteId;
          if (!clienteId) {
            if (!cf.nome.trim()) throw new Error('Informe o nome do cliente.');
            const { data, error } = await supabase.from('rastreio_clientes').insert({ empresa_id: empresaId, ...dadosCliente() }).select('id').single();
            if (error) throw error;
            clienteId = data.id;
          }
          const { data, error } = await supabase.from('rastreio_veiculos').insert({ empresa_id: empresaId, cliente_id: clienteId, ...dadosVeiculo() }).select('id').single();
          if (error) throw error;
          veiculoId = data.id;
        }
        // Cadastra/atualiza o IMEI no servidor de rastreio (não bloqueia o salvamento se falhar).
        const r = await apiRastreio('dispositivo', { veiculoId }).catch(e => ({ mensagem: (e as Error).message }));
        setAviso(r?.mensagem ? `Veículo salvo. ${r.mensagem}` : 'Veículo salvo e vinculado ao servidor de rastreio.');
      }
      setModal(null);
      carregar();
    } catch (err: unknown) {
      const m = (err as { message?: string })?.message || 'Erro ao salvar.';
      setErro(m.includes('rastreio_veiculos_imei_ativo_uq') ? 'Esse IMEI já está em outro veículo ativo.' : m);
    } finally {
      setSalvando(false);
    }
  };

  // Link de uso único do app do cliente (/meu-rastreio), mandado pelo WhatsApp do instalador.
  const [gerandoAcesso, setGerandoAcesso] = useState<string | null>(null);
  const enviarAcesso = async (c: ClienteRastreio) => {
    setGerandoAcesso(c.id);
    try {
      const r = await apiRastreio('convite', { clienteId: c.id });
      const texto = `Olá, ${c.nome.split(' ')[0]}! Aqui está o seu acesso ao app de rastreamento do seu veículo. Toque no link para entrar (vale por ${r.validadeDias} dias e só uma vez):
${r.link}

Depois de abrir, use "Adicionar à tela inicial" para ter o app no celular.`;
      const fone = String(c.telefone || '').replace(/\D/g, '');
      if (fone) window.open(`https://wa.me/${fone.length <= 11 ? `55${fone}` : fone}?text=${encodeURIComponent(texto)}`, '_blank');
      else { await navigator.clipboard?.writeText(texto).catch(() => null); }
      setAviso(fone ? 'WhatsApp aberto com o link de acesso.' : 'Cliente sem telefone: o link de acesso foi copiado — cole onde quiser enviar.');
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setGerandoAcesso(null);
    }
  };

  const desativarVeiculo = async (v: Veiculo) => {
    if (!confirm(`Desativar ${v.placa}? O rastreador para de aparecer no mapa (o histórico fica guardado).`)) return;
    await supabase.from('rastreio_veiculos').update({ status: 'inativo' }).eq('id', v.id);
    setModal(null);
    carregar();
  };

  const excluirVeiculo = async (v: Veiculo) => {
    const digitado = prompt(`Excluir ${v.placa} DE VEZ? Apaga também todo o histórico (trajetos, alertas, bloqueios). Isso não tem volta.\n\nPara confirmar, digite a placa:`);
    if (digitado == null) return;
    if (digitado.trim().toUpperCase() !== v.placa) { alert('Placa não confere. Nada foi excluído.'); return; }
    try {
      const r = await apiRastreio('veiculo-excluir', { veiculoId: v.id });
      setAviso(r.mensagem);
      setModal(null);
      carregar();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  if (authLoading) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;
  if (!temRastreio) return <div className="p-8 text-slate-400 text-sm">O módulo Rastreio não está ativo pra sua empresa.</div>;

  const inp = 'w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-sky-400';
  const lbl = 'text-[10px] font-black uppercase text-slate-500 ml-1';
  const mostrarCliente = modal && (modal.tipo === 'cliente' || (modal.tipo === 'instalacao' && !modal.clienteId));
  const mostrarVeiculo = modal && modal.tipo !== 'cliente';
  const clienteDoModal = modal?.tipo === 'instalacao' && modal.clienteId ? clientes.find(c => c.id === modal.clienteId) : null;

  return (
    <div className="md:p-8 pb-20 text-white">
      <Link href="/rastreio" className="inline-flex items-center gap-1 text-xs font-black uppercase text-slate-500 hover:text-white mb-3"><ArrowLeft size={14} /> Frota</Link>
      <header className="mb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl md:text-4xl font-black tracking-tighter uppercase italic text-sky-400 flex items-center gap-2 md:gap-3">
          <Users className="w-6 h-6 md:w-8 md:h-8 shrink-0" /> Clientes do rastreio
        </h1>
        <button onClick={() => abrirInstalacao(null)} className="inline-flex items-center gap-2 bg-sky-400 text-[#0B1120] hover:scale-105 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all w-fit">
          <Plus size={14} /> Nova instalação
        </button>
      </header>

      {aviso && <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 px-4 py-3 text-sm font-bold flex justify-between">{aviso}<button onClick={() => setAviso('')}><X size={14} /></button></div>}

      <div className="grid grid-cols-3 gap-3 mb-4">
        <Card label="Clientes" valor={String(clientes.length)} />
        <Card label="Veículos ativos" valor={String(ativos)} />
        <Card label="Mensalidades (ativos)" valor={fmtMoeda(receitaMensal)} cor="text-[#22C55E]" />
      </div>

      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome, CPF/CNPJ, telefone, placa ou IMEI" className={`${inp} pl-9`} />
      </div>

      {loading ? <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div> : (
        <div className="space-y-3">
          {lista.map(c => (
            <div key={c.id} className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-black">{c.nome} <span className="text-[10px] font-black text-slate-500 ml-1">{c.tipo}</span>
                    {c.status !== 'ativo' && <span className="ml-2 text-[10px] font-black uppercase text-amber-400">{c.status}</span>}</p>
                  <p className="text-xs text-slate-400">
                    {[c.documento ? mascaraDocumento(c.documento) : null, c.cidade].filter(Boolean).join(' · ')}
                    {c.telefone && <a href={`https://wa.me/55${c.telefone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="ml-2 text-sky-400 inline-flex items-center gap-1"><Phone size={11} />{c.telefone}</a>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-[#22C55E]">{fmtMoeda(c.mensalidade)}/mês</span>
                  <button onClick={() => enviarAcesso(c)} disabled={gerandoAcesso === c.id || c.status === 'cancelado'} className="px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 text-[10px] font-black uppercase inline-flex items-center gap-1 disabled:opacity-40" title="Manda pelo WhatsApp o link para o cliente entrar no app">
                    {gerandoAcesso === c.id ? <Loader2 size={12} className="animate-spin" /> : <Smartphone size={12} />} Acesso ao app
                  </button>
                  <button onClick={() => abrirCliente(c)} className="p-2 rounded-lg bg-white/5 hover:bg-white/10" title="Editar cliente"><Pencil size={13} /></button>
                  <button onClick={() => abrirInstalacao(c.id)} className="px-3 py-2 rounded-lg bg-sky-400/10 text-sky-300 hover:bg-sky-400/20 text-[10px] font-black uppercase inline-flex items-center gap-1"><Plus size={12} /> Veículo</button>
                </div>
              </div>
              {(porCliente[c.id] || []).length > 0 && (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {(porCliente[c.id] || []).map(v => {
                    const s = situacao(v);
                    return (
                      <div key={v.id} className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 ${v.status === 'inativo' ? 'border-white/5 opacity-50' : 'border-white/10 bg-white/[0.02]'}`}>
                        <Link href={`/rastreio/veiculos/${v.id}`} className="min-w-0 flex items-center gap-2 hover:text-sky-300">
                          <Car size={14} className="shrink-0 text-slate-500" />
                          <span className="font-black tracking-wider">{v.placa}</span>
                          <span className="text-xs text-slate-400 truncate">{v.descricao}</span>
                        </Link>
                        <div className="flex items-center gap-2 shrink-0">
                          {v.status === 'inativo' ? <span className="text-[10px] font-black uppercase text-slate-500">inativo</span>
                            : <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${v.bloqueado ? 'text-red-400 bg-red-500/10 border-red-500/30' : SITUACAO_INFO[s].classe}`}>{v.bloqueado ? <Lock size={10} className="inline" /> : SITUACAO_INFO[s].label}</span>}
                          <button onClick={() => abrirVeiculo(v)} className="p-1.5 rounded-lg hover:bg-white/10" title="Editar veículo"><Pencil size={12} /></button>
                          {v.status === 'inativo' && podeBloquear && (
                            <button onClick={() => excluirVeiculo(v)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-400/80" title="Excluir de vez"><Trash2 size={12} /></button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          {lista.length === 0 && <p className="text-center text-sm text-slate-500 py-10">{clientes.length ? 'Nada encontrado.' : 'Nenhum cliente ainda — comece por "Nova instalação".'}</p>}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-start md:items-center justify-center p-4 overflow-y-auto" onClick={() => !salvando && setModal(null)}>
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-5 md:p-6 w-full max-w-2xl my-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black uppercase">
                {modal.tipo === 'cliente' ? 'Editar cliente' : modal.tipo === 'veiculo' ? `Editar ${modal.veiculo.placa}` : clienteDoModal ? `Novo veículo · ${clienteDoModal.nome}` : 'Nova instalação'}
              </h2>
              <button onClick={() => setModal(null)} className="p-2 rounded-lg hover:bg-white/10"><X size={16} /></button>
            </div>

            {mostrarCliente && (
              <section className="mb-5">
                <p className="text-[11px] font-black uppercase tracking-widest text-sky-400 mb-2">Cliente</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="col-span-2 md:col-span-1">
                    <label className={lbl}>Tipo</label>
                    <select value={cf.tipo} onChange={e => setCf({ ...cf, tipo: e.target.value as 'PF' | 'PJ' })} className={inp}>
                      <option value="PF" className="bg-[#0B1120]">Pessoa física</option><option value="PJ" className="bg-[#0B1120]">Empresa</option>
                    </select>
                  </div>
                  <div className="col-span-2 md:col-span-3"><label className={lbl}>{cf.tipo === 'PF' ? 'Nome completo' : 'Razão social / nome'}</label><input value={cf.nome} onChange={e => setCf({ ...cf, nome: e.target.value })} className={inp} /></div>
                  <div className="col-span-2"><label className={lbl}>{cf.tipo === 'PF' ? 'CPF' : 'CNPJ'}</label><input value={cf.documento} onChange={e => setCf({ ...cf, documento: mascaraDocumento(e.target.value) })} className={inp} inputMode="numeric" /></div>
                  <div className="col-span-2"><label className={lbl}>Telefone / WhatsApp</label><input value={cf.telefone} onChange={e => setCf({ ...cf, telefone: e.target.value })} className={inp} inputMode="tel" /></div>
                  <div className="col-span-2"><label className={lbl}>E-mail</label><input value={cf.email} onChange={e => setCf({ ...cf, email: e.target.value })} className={inp} type="email" /></div>
                  <div className="col-span-2"><label className={lbl}>Cidade</label><input value={cf.cidade} onChange={e => setCf({ ...cf, cidade: e.target.value })} className={inp} /></div>
                  <div className="col-span-2 md:col-span-4"><label className={lbl}>Endereço</label><input value={cf.endereco} onChange={e => setCf({ ...cf, endereco: e.target.value })} className={inp} /></div>
                  <div><label className={lbl}>Mensalidade (R$)</label><input value={cf.mensalidade} onChange={e => setCf({ ...cf, mensalidade: e.target.value })} className={inp} inputMode="decimal" placeholder="69,90" /></div>
                  <div><label className={lbl}>Vencimento (dia)</label><input value={cf.dia_vencimento} onChange={e => setCf({ ...cf, dia_vencimento: e.target.value.replace(/\D/g, '').slice(0, 2) })} className={inp} inputMode="numeric" /></div>
                  {modal.tipo === 'cliente' && (
                    <div className="col-span-2">
                      <label className={lbl}>Situação</label>
                      <select value={cf.status} onChange={e => setCf({ ...cf, status: e.target.value })} className={inp}>
                        <option value="ativo" className="bg-[#0B1120]">Ativo</option><option value="suspenso" className="bg-[#0B1120]">Suspenso (inadimplente)</option><option value="cancelado" className="bg-[#0B1120]">Cancelado</option>
                      </select>
                    </div>
                  )}
                  <div className="col-span-2 md:col-span-4"><label className={lbl}>Observações</label><input value={cf.observacoes} onChange={e => setCf({ ...cf, observacoes: e.target.value })} className={inp} /></div>
                </div>
              </section>
            )}

            {mostrarVeiculo && (
              <section>
                <p className="text-[11px] font-black uppercase tracking-widest text-sky-400 mb-2">Veículo e rastreador</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div><label className={lbl}>Placa</label><input value={vf.placa} onChange={e => setVf({ ...vf, placa: mascaraPlaca(e.target.value) })} className={`${inp} uppercase tracking-wider font-black`} placeholder="ABC1D23" /></div>
                  <div>
                    <label className={lbl}>Tipo</label>
                    <select value={vf.tipo} onChange={e => setVf({ ...vf, tipo: e.target.value })} className={inp}>
                      {TIPOS.map(([k, n]) => <option key={k} value={k} className="bg-[#0B1120]">{n}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2"><label className={lbl}>Descrição</label><input value={vf.descricao} onChange={e => setVf({ ...vf, descricao: e.target.value })} className={inp} placeholder="Gol prata 2015" /></div>
                  <div className="col-span-2"><label className={lbl}>IMEI do rastreador</label><input value={vf.imei} onChange={e => setVf({ ...vf, imei: e.target.value.replace(/\D/g, '').slice(0, 17) })} className={`${inp} font-mono`} inputMode="numeric" placeholder="15 números da etiqueta" /></div>
                  <div className="col-span-2"><label className={lbl}>Modelo do rastreador</label><input value={vf.modelo_rastreador} onChange={e => setVf({ ...vf, modelo_rastreador: e.target.value })} className={inp} placeholder="Ex.: GT06, J16, ST310U" /></div>
                  <div className="col-span-2"><label className={lbl}>Número do chip</label><input value={vf.chip_numero} onChange={e => setVf({ ...vf, chip_numero: e.target.value })} className={inp} inputMode="tel" /></div>
                  <div><label className={lbl}>Operadora</label><input value={vf.chip_operadora} onChange={e => setVf({ ...vf, chip_operadora: e.target.value })} className={inp} placeholder="Vivo, Claro…" /></div>
                  <div><label className={lbl}>Alerta acima de (km/h)</label><input value={vf.limite_velocidade} onChange={e => setVf({ ...vf, limite_velocidade: e.target.value.replace(/\D/g, '').slice(0, 3) })} className={inp} inputMode="numeric" placeholder="vazio = sem" /></div>
                  <div><label className={lbl}>Instalado em</label><input type="date" value={vf.instalado_em} onChange={e => setVf({ ...vf, instalado_em: e.target.value })} className={`${inp} [color-scheme:dark]`} /></div>
                  <div><label className={lbl}>Instalador</label><input value={vf.instalado_por} onChange={e => setVf({ ...vf, instalado_por: e.target.value })} className={inp} /></div>
                  <label className="col-span-2 flex items-center gap-2 text-sm text-slate-300 mt-5 cursor-pointer">
                    <input type="checkbox" checked={vf.tem_bloqueio} onChange={e => setVf({ ...vf, tem_bloqueio: e.target.checked })} className="accent-sky-400 w-4 h-4" />
                    Relé de bloqueio instalado
                  </label>
                </div>
              </section>
            )}

            {erro && <p className="mt-4 text-sm font-bold text-red-400">{erro}</p>}

            <div className="flex flex-wrap gap-2 mt-5">
              {modal.tipo === 'veiculo' && modal.veiculo.status === 'ativo' && (
                <button onClick={() => desativarVeiculo(modal.veiculo)} className="px-4 py-3 rounded-xl border border-red-500/30 text-red-400 text-xs font-black uppercase hover:bg-red-500/10">Desativar veículo</button>
              )}
              {modal.tipo === 'veiculo' && podeBloquear && (
                <button onClick={() => excluirVeiculo(modal.veiculo)} className="px-4 py-3 rounded-xl text-red-400/80 text-xs font-black uppercase hover:bg-red-500/10 inline-flex items-center gap-1"><Trash2 size={13} /> Excluir de vez</button>
              )}
              <button onClick={() => setModal(null)} disabled={salvando} className="ml-auto px-5 py-3 rounded-xl bg-white/5 border border-white/10 text-xs font-black uppercase">Cancelar</button>
              <button onClick={salvar} disabled={salvando} className="px-6 py-3 rounded-xl bg-sky-400 text-[#0B1120] text-xs font-black uppercase disabled:opacity-50 inline-flex items-center gap-2">
                {salvando && <Loader2 size={14} className="animate-spin" />} Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ label, valor, cor }: { label: string; valor: string; cor?: string }) {
  return (
    <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-xl md:text-2xl font-black ${cor || 'text-white'}`}>{valor}</p>
    </div>
  );
}
