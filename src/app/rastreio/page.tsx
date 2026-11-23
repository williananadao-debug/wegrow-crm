"use client";
import { useEffect, useMemo, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Loader2, Navigation, Search, Lock, Bell, Users, Plus, Gauge, Power, ChevronRight, CheckCheck, Wallet, FileBarChart } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  useRastreioAccess, COLUNAS_VEICULO, situacao, SITUACAO_INFO, haQuanto, fmtDataHora,
  type Veiculo, type Evento, type Situacao,
} from './shared';

const MapaRastreio = dynamic(() => import('./MapaRastreio'), { ssr: false });

const ATUALIZAR_SEG = 20;

export default function RastreioFrotaPage() {
  const { authLoading, perfil, temRastreio } = useRastreioAccess();
  const empresaId = perfil?.empresa_id as string | undefined;

  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [clientes, setClientes] = useState<Record<string, string>>({});
  const [alertas, setAlertas] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Situacao | 'bloqueado' | 'todos'>('todos');
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [grupo, setGrupo] = useState<string>('');
  const [, setTique] = useState(0); // re-render pro "há X min"

  const carregar = useCallback(async () => {
    if (!empresaId) return;
    const [{ data: vs }, { data: ev }] = await Promise.all([
      supabase.from('rastreio_veiculos').select(COLUNAS_VEICULO).eq('empresa_id', empresaId).eq('status', 'ativo').order('placa'),
      supabase.from('rastreio_eventos').select('id, veiculo_id, tipo, mensagem, lat, lng, lido, ocorrido_em')
        .eq('empresa_id', empresaId).eq('lido', false).neq('tipo', 'resposta_aparelho').order('ocorrido_em', { ascending: false }).limit(30),
    ]);
    setVeiculos((vs as Veiculo[]) || []);
    setAlertas((ev as Evento[]) || []);
    setLoading(false);
  }, [empresaId]);

  useEffect(() => {
    if (!empresaId) return;
    void Promise.resolve().then(carregar);
    supabase.from('rastreio_clientes').select('id, nome').eq('empresa_id', empresaId)
      .then(({ data }) => setClientes(Object.fromEntries((data || []).map(c => [c.id, c.nome]))));
    const t = setInterval(() => { if (document.visibilityState === 'visible') { carregar(); setTique(x => x + 1); } }, ATUALIZAR_SEG * 1000);
    return () => clearInterval(t);
  }, [empresaId, carregar]);

  const contagem = useMemo(() => {
    const c = { andando: 0, parado: 0, offline: 0, sem_sinal: 0, bloqueado: 0 };
    veiculos.forEach(v => { c[situacao(v)]++; if (v.bloqueado) c.bloqueado++; });
    return c;
  }, [veiculos]);

  const grupos = useMemo(() => [...new Set(veiculos.map(v => v.grupo).filter(Boolean) as string[])].sort(), [veiculos]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return veiculos.filter(v => {
      if (grupo && (v.grupo || '') !== grupo) return false;
      if (filtro === 'bloqueado' ? !v.bloqueado : filtro !== 'todos' && situacao(v) !== filtro) return false;
      if (!q) return true;
      return [v.placa, v.descricao, v.imei, v.grupo, v.cliente_id ? clientes[v.cliente_id] : ''].some(x => String(x || '').toLowerCase().includes(q));
    });
  }, [veiculos, busca, filtro, clientes, grupo]);

  const marcarLidos = async () => {
    const ids = alertas.map(a => a.id);
    setAlertas([]);
    if (ids.length) await supabase.from('rastreio_eventos').update({ lido: true }).in('id', ids);
  };

  if (authLoading) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;
  if (!temRastreio) {
    return (
      <div className="md:p-8 pb-20 text-white">
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <Navigation size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-sm">O módulo Rastreio não está ativo pra sua empresa ainda.</p>
        </div>
      </div>
    );
  }

  const cards: { chave: Situacao | 'bloqueado' | 'todos'; label: string; valor: number; cor: string }[] = [
    { chave: 'todos', label: 'Veículos', valor: veiculos.length, cor: 'text-white' },
    { chave: 'andando', label: 'Em movimento', valor: contagem.andando, cor: 'text-emerald-400' },
    { chave: 'parado', label: 'Parados', valor: contagem.parado, cor: 'text-sky-400' },
    { chave: 'offline', label: 'Sem comunicação', valor: contagem.offline + contagem.sem_sinal, cor: 'text-amber-400' },
    { chave: 'bloqueado', label: 'Bloqueados', valor: contagem.bloqueado, cor: 'text-red-400' },
  ];

  return (
    <div className="md:p-8 pb-20 text-white">
      <header className="mb-4 md:mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-4xl font-black tracking-tighter uppercase italic text-sky-400 flex items-center gap-2 md:gap-3">
            <Navigation className="w-6 h-6 md:w-8 md:h-8 shrink-0" /> Rastreio
          </h1>
          <p className="hidden md:block text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Frota ao vivo · atualiza a cada {ATUALIZAR_SEG}s</p>
        </div>
        <div className="flex gap-2">
          <Link href="/rastreio/clientes" className="inline-flex items-center gap-2 bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest">
            <Users size={14} /> Clientes
          </Link>
          <Link href="/rastreio/financeiro" className="inline-flex items-center gap-2 bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest">
            <Wallet size={14} /> Financeiro
          </Link>
          <Link href="/rastreio/relatorios" className="inline-flex items-center gap-2 bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest">
            <FileBarChart size={14} /> Relatórios
          </Link>
          <Link href="/rastreio/clientes?nova=1" className="inline-flex items-center gap-2 bg-sky-400 text-[#0B1120] hover:scale-105 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all">
            <Plus size={14} /> Nova instalação
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        {cards.map(c => (
          <button key={c.chave} onClick={() => setFiltro(filtro === c.chave ? 'todos' : c.chave)}
            className={`text-left bg-[#0F172A] border rounded-2xl p-4 transition-all ${filtro === c.chave && c.chave !== 'todos' ? 'border-sky-400/60' : 'border-white/10 hover:border-white/20'} ${c.chave === 'todos' ? 'col-span-2 md:col-span-1' : ''}`}>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{c.label}</p>
            <p className={`text-2xl font-black ${c.cor}`}>{c.valor}</p>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>
      ) : veiculos.length === 0 ? (
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <Navigation size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-sm mb-1">Nenhum veículo rastreado ainda.</p>
          <p className="text-slate-500 text-xs mb-4">Cadastre o cliente e o veículo com o IMEI do rastreador instalado.</p>
          <Link href="/rastreio/clientes?nova=1" className="inline-flex items-center gap-2 bg-sky-400 text-[#0B1120] px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest">
            <Plus size={14} /> Primeira instalação
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <MapaRastreio veiculos={lista} selecionadoId={selecionado} onSelecionar={setSelecionado}
              chaveEnquadrar={`${filtro}|${grupo}|${selecionado ? '' : lista.length}`} />

            {alertas.length > 0 && (
              <div className="bg-[#0F172A] border border-amber-500/30 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-black uppercase tracking-widest text-amber-400 flex items-center gap-2"><Bell size={14} /> Alertas novos ({alertas.length})</p>
                  <button onClick={marcarLidos} className="text-[10px] font-black uppercase text-slate-400 hover:text-white flex items-center gap-1"><CheckCheck size={13} /> Marcar como vistos</button>
                </div>
                <ul className="divide-y divide-white/5 max-h-60 overflow-y-auto">
                  {alertas.map(a => (
                    <li key={a.id}>
                      <Link href={`/rastreio/veiculos/${a.veiculo_id}`} className="flex items-center justify-between gap-3 py-2 text-sm hover:text-sky-300">
                        <span className={a.tipo === 'alarme' ? 'text-red-300 font-bold' : 'text-slate-200'}>{a.mensagem}</span>
                        <span className="text-[11px] text-slate-500 shrink-0">{fmtDataHora(a.ocorrido_em)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-3 flex flex-col max-h-[75vh]">
            <div className="relative mb-3">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Placa, cliente ou IMEI"
                className="w-full bg-white/[0.03] border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white outline-none focus:border-sky-400" />
            </div>
            {grupos.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {['', ...grupos].map(g => (
                  <button key={g || '_todos'} onClick={() => setGrupo(g)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase border ${grupo === g ? 'bg-violet-400 text-[#0B1120] border-violet-400' : 'border-white/10 text-slate-300'}`}>{g || 'Todos os grupos'}</button>
                ))}
              </div>
            )}
            <ul className="overflow-y-auto space-y-2 pr-1">
              {lista.map(v => {
                const s = situacao(v);
                return (
                  <li key={v.id} onMouseEnter={() => setSelecionado(v.id)}
                    className={`rounded-xl border p-3 transition-all ${selecionado === v.id ? 'border-sky-400/50 bg-sky-400/5' : 'border-white/5 bg-white/[0.02]'}`}>
                    <Link href={`/rastreio/veiculos/${v.id}`} className="block">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-black tracking-wider">{v.placa}</p>
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${v.bloqueado ? 'text-red-400 bg-red-500/10 border-red-500/30' : SITUACAO_INFO[s].classe}`}>
                          {v.bloqueado ? <span className="inline-flex items-center gap-1"><Lock size={10} /> Bloqueado</span> : SITUACAO_INFO[s].label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 truncate">{[v.descricao, v.cliente_id ? clientes[v.cliente_id] : null].filter(Boolean).join(' · ') || '—'}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-500">
                        <span className="inline-flex items-center gap-1"><Gauge size={11} /> {Math.round(Number(v.ultima_velocidade || 0))} km/h</span>
                        <span className={`inline-flex items-center gap-1 ${v.ignicao ? 'text-emerald-400' : ''}`}><Power size={11} /> {v.ignicao == null ? '—' : v.ignicao ? 'ligado' : 'desligado'}</span>
                        <span className="ml-auto inline-flex items-center gap-0.5">{haQuanto(v.ultima_comunicacao_em || v.ultima_posicao_em)} <ChevronRight size={12} /></span>
                      </div>
                    </Link>
                  </li>
                );
              })}
              {lista.length === 0 && <li className="text-center text-xs text-slate-500 py-6">Nenhum veículo nesse filtro.</li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
