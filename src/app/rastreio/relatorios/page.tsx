"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, FileBarChart, Download, Route, ParkingCircle, Bell, CalendarDays, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRastreioAccess, apiRastreio, fmtDataHora, fmtHora, linkMapa } from '../shared';
import { fmtDuracao } from '../analise';

type Aba = 'resumo' | 'viagens' | 'eventos';
type V = { id: string; placa: string; descricao: string | null };
type Resumo = { veiculo_id: string; dia: string; km: number; minutos_movimento: number; minutos_ligado: number; paradas: number; viagens: number; velocidade_max: number; excessos: number; primeira_posicao: string | null; ultima_posicao: string | null };
type Ev = { id: number; veiculo_id: string; tipo: string; mensagem: string; lat: number | null; lng: number | null; ocorrido_em: string };
type Viagens = {
  placa: string; km: number; minutosMovimento: number; velMax: number; truncado: boolean;
  viagens: { ini: string; fim: string; km: number; minutos: number; velMax: number; de?: { lat: number; lng: number }; ate?: { lat: number; lng: number } }[];
  paradas: { lat: number; lng: number; ini: string; fim: string; minutos: number }[];
};

const hoje = () => new Date().toLocaleDateString('en-CA');
const menosDias = (n: number) => new Date(Date.now() - n * 86400_000).toLocaleDateString('en-CA');
const dataBR = (d: string) => d.split('-').reverse().join('/');
const TIPOS: Record<string, string> = {
  alarme: 'Alarmes', cerca: 'Cercas', velocidade: 'Velocidade', ignicao_ligada: 'Ignição ligada', ignicao_desligada: 'Ignição desligada',
  offline: 'Sem comunicação', online: 'Voltou a comunicar', comando: 'Bloqueios', manutencao: 'Manutenção',
};

function baixarCsv(nome: string, linhas: (string | number)[][]) {
  const csv = '﻿' + linhas.map(l => l.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = nome;
  a.click();
}

export default function RelatoriosRastreioPage() {
  const { authLoading, temRastreio } = useRastreioAccess();
  const [aba, setAba] = useState<Aba>('resumo');
  const [veics, setVeics] = useState<V[]>([]);
  const [veiculo, setVeiculo] = useState('todos');
  const [ini, setIni] = useState(menosDias(6));
  const [fim, setFim] = useState(hoje());
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [resumo, setResumo] = useState<Resumo[]>([]);
  const [eventos, setEventos] = useState<Ev[]>([]);
  const [tipoEv, setTipoEv] = useState('todos');
  const [viagens, setViagens] = useState<Viagens | null>(null);

  useEffect(() => {
    void Promise.resolve().then(async () => {
      const { data } = await supabase.from('rastreio_veiculos').select('id, placa, descricao').eq('status', 'ativo').order('placa');
      setVeics((data as V[]) || []);
    });
  }, []);

  const placa = useMemo(() => Object.fromEntries(veics.map(v => [v.id, v.placa])), [veics]);
  const periodoOk = /^\d{4}-\d{2}-\d{2}$/.test(ini) && /^\d{4}-\d{2}-\d{2}$/.test(fim) && ini <= fim;
  const dias = periodoOk ? Math.round((Date.parse(fim) - Date.parse(ini)) / 86400_000) + 1 : 0;

  const gerar = useCallback(async () => {
    if (!periodoOk) { setErro('Período inválido.'); return; }
    setErro(''); setCarregando(true);
    try {
      if (aba === 'resumo') {
        if (dias > 62) throw new Error('Escolha até 62 dias.');
        if (fim >= hoje()) await apiRastreio('relatorio', { acao: 'hoje' }).catch(() => null);
        let q = supabase.from('rastreio_resumo_diario')
          .select('veiculo_id, dia, km, minutos_movimento, minutos_ligado, paradas, viagens, velocidade_max, excessos, primeira_posicao, ultima_posicao')
          .gte('dia', ini).lte('dia', fim).order('dia').limit(5000);
        if (veiculo !== 'todos') q = q.eq('veiculo_id', veiculo);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        setResumo((data as Resumo[]) || []);
      } else if (aba === 'eventos') {
        if (dias > 62) throw new Error('Escolha até 62 dias.');
        let q = supabase.from('rastreio_eventos').select('id, veiculo_id, tipo, mensagem, lat, lng, ocorrido_em')
          .gte('ocorrido_em', `${ini}T00:00:00-03:00`).lte('ocorrido_em', `${fim}T23:59:59.999-03:00`)
          .order('ocorrido_em', { ascending: false }).limit(3000);
        if (veiculo !== 'todos') q = q.eq('veiculo_id', veiculo);
        if (tipoEv !== 'todos') q = q.eq('tipo', tipoEv);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        setEventos((data as Ev[]) || []);
      } else {
        if (veiculo === 'todos') throw new Error('Escolha um veículo.');
        setViagens(await apiRastreio('relatorio', { acao: 'viagens', veiculoId: veiculo, ini, fim }));
      }
    } catch (e) { setErro((e as Error).message); }
    finally { setCarregando(false); }
  }, [aba, ini, fim, veiculo, tipoEv, periodoOk, dias]);

  useEffect(() => { if (veics.length && aba !== 'viagens') void Promise.resolve().then(gerar); }, [aba, veics.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Totais por veículo no resumo
  const porVeiculo = useMemo(() => {
    const m: Record<string, { km: number; mov: number; lig: number; paradas: number; viagens: number; vmax: number; exc: number; dias: number }> = {};
    for (const r of resumo) {
      const t = (m[r.veiculo_id] ||= { km: 0, mov: 0, lig: 0, paradas: 0, viagens: 0, vmax: 0, exc: 0, dias: 0 });
      t.km += Number(r.km); t.mov += r.minutos_movimento; t.lig += r.minutos_ligado; t.paradas += r.paradas; t.viagens += r.viagens;
      t.vmax = Math.max(t.vmax, r.velocidade_max); t.exc += r.excessos; t.dias++;
    }
    return Object.entries(m).sort((a, b) => b[1].km - a[1].km);
  }, [resumo]);

  const exportar = () => {
    const nome = `rastreio-${aba}-${ini}-a-${fim}.csv`;
    if (aba === 'resumo') {
      baixarCsv(nome, [['Placa', 'Dia', 'Km', 'Em movimento (min)', 'Ligado (min)', 'Viagens', 'Paradas', 'Vel. máx (km/h)', 'Excessos', 'Primeira posição', 'Última posição'],
        ...resumo.map(r => [placa[r.veiculo_id] || '', dataBR(r.dia), String(r.km).replace('.', ','), r.minutos_movimento, r.minutos_ligado, r.viagens, r.paradas, r.velocidade_max, r.excessos, r.primeira_posicao ? fmtHora(r.primeira_posicao) : '', r.ultima_posicao ? fmtHora(r.ultima_posicao) : ''])]);
    } else if (aba === 'eventos') {
      baixarCsv(nome, [['Data', 'Placa', 'Tipo', 'Descrição', 'Mapa'], ...eventos.map(e => [fmtDataHora(e.ocorrido_em), placa[e.veiculo_id] || '', TIPOS[e.tipo] || e.tipo, e.mensagem, e.lat != null ? linkMapa(e.lat, e.lng!) : ''])]);
    } else if (viagens) {
      baixarCsv(nome, [['Tipo', 'Início', 'Fim', 'Duração (min)', 'Km', 'Vel. máx', 'Mapa'],
        ...[...viagens.viagens.map(x => ['Viagem', fmtDataHora(x.ini), fmtDataHora(x.fim), x.minutos, x.km.toFixed(1).replace('.', ','), Math.round(x.velMax), x.ate ? linkMapa(x.ate.lat, x.ate.lng) : '']),
          ...viagens.paradas.map(x => ['Parada', fmtDataHora(x.ini), fmtDataHora(x.fim), x.minutos, '', '', linkMapa(x.lat, x.lng)])].sort((a, b) => String(a[1]).localeCompare(String(b[1])))]);
    }
  };

  if (authLoading) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;
  if (!temRastreio) return <div className="p-8 text-slate-400 text-sm">O módulo Rastreio não está ativo pra sua empresa.</div>;
  const ctl = 'bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none [color-scheme:dark]';
  const temDados = aba === 'resumo' ? resumo.length > 0 : aba === 'eventos' ? eventos.length > 0 : Boolean(viagens);

  return (
    <div className="md:p-8 pb-20 text-white">
      <Link href="/rastreio" className="inline-flex items-center gap-1 text-xs font-black uppercase text-slate-500 hover:text-white mb-3"><ArrowLeft size={14} /> Frota</Link>
      <h1 className="text-2xl md:text-4xl font-black tracking-tighter uppercase italic text-sky-400 flex items-center gap-2 md:gap-3 mb-4">
        <FileBarChart className="w-6 h-6 md:w-8 md:h-8 shrink-0" /> Relatórios
      </h1>

      <div className="flex gap-2 mb-4 faixa-scroll">
        {([['resumo', 'Resumo por dia', CalendarDays], ['viagens', 'Viagens e paradas', Route], ['eventos', 'Alertas e eventos', Bell]] as const).map(([k, t, I]) => (
          <button key={k} onClick={() => setAba(k)} className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs uppercase border ${aba === k ? 'bg-sky-400 text-[#0B1120] border-sky-400' : 'bg-white/5 border-white/10 text-slate-300'}`}><I size={14} /> {t}</button>
        ))}
      </div>

      <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4 mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1"><span className="text-[10px] font-black uppercase text-slate-500">Veículo</span>
          <select value={veiculo} onChange={e => setVeiculo(e.target.value)} className={ctl}>
            {aba !== 'viagens' && <option value="todos">Todos os veículos</option>}
            {aba === 'viagens' && veiculo === 'todos' && <option value="todos">Escolha…</option>}
            {veics.map(v => <option key={v.id} value={v.id}>{v.placa}{v.descricao ? ` · ${v.descricao}` : ''}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1"><span className="text-[10px] font-black uppercase text-slate-500">De</span><input type="date" value={ini} max={fim} onChange={e => setIni(e.target.value)} className={ctl} /></label>
        <label className="flex flex-col gap-1"><span className="text-[10px] font-black uppercase text-slate-500">Até</span><input type="date" value={fim} max={hoje()} onChange={e => setFim(e.target.value)} className={ctl} /></label>
        {aba === 'eventos' && (
          <label className="flex flex-col gap-1"><span className="text-[10px] font-black uppercase text-slate-500">Tipo</span>
            <select value={tipoEv} onChange={e => setTipoEv(e.target.value)} className={ctl}>
              <option value="todos">Todos</option>
              {Object.entries(TIPOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          </label>
        )}
        <div className="flex gap-2 ml-auto">
          {[['7 dias', 6], ['30 dias', 29]].map(([t, n]) => (
            <button key={t} onClick={() => { setIni(menosDias(Number(n))); setFim(hoje()); }} className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-black">{t}</button>
          ))}
          <button onClick={gerar} disabled={carregando} className="px-5 py-2 rounded-xl bg-sky-400 text-[#0B1120] text-xs font-black uppercase inline-flex items-center gap-2 disabled:opacity-50">
            {carregando && <Loader2 size={14} className="animate-spin" />} Gerar
          </button>
          {temDados && <button onClick={exportar} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-black uppercase inline-flex items-center gap-2"><Download size={14} /> Planilha</button>}
        </div>
      </div>
      {erro && <p className="mb-4 text-sm font-bold text-red-400">{erro}</p>}

      {aba === 'resumo' && (
        <>
          {porVeiculo.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-4">
              {porVeiculo.map(([id, t]) => (
                <div key={id} className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
                  <Link href={`/rastreio/veiculos/${id}`} className="font-black tracking-wider hover:text-sky-300">{placa[id] || '—'}</Link>
                  <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                    <Mini l="Rodou" v={`${t.km.toFixed(1)} km`} />
                    <Mini l="Em movimento" v={fmtDuracao(t.mov)} />
                    <Mini l="Ligado" v={fmtDuracao(t.lig)} />
                    <Mini l="Viagens" v={String(t.viagens)} />
                    <Mini l="Vel. máx" v={`${t.vmax} km/h`} />
                    <Mini l="Excessos" v={String(t.exc)} alerta={t.exc > 0} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <Tabela vazio={!carregando && resumo.length === 0} cab={['Dia', 'Placa', 'Km', 'Movimento', 'Ligado', 'Viagens', 'Paradas', 'Vel. máx', 'Excessos', 'Horário']}>
            {resumo.map(r => (
              <tr key={r.veiculo_id + r.dia}>
                <td className="py-2 pr-3">{dataBR(r.dia)}</td><td className="pr-3 font-bold">{placa[r.veiculo_id]}</td>
                <td className="pr-3">{Number(r.km).toFixed(1)}</td><td className="pr-3">{fmtDuracao(r.minutos_movimento)}</td><td className="pr-3">{fmtDuracao(r.minutos_ligado)}</td>
                <td className="pr-3">{r.viagens}</td><td className="pr-3">{r.paradas}</td><td className="pr-3">{r.velocidade_max}</td>
                <td className={`pr-3 ${r.excessos ? 'text-red-400 font-bold' : ''}`}>{r.excessos}</td>
                <td className="pr-3 text-slate-400">{r.primeira_posicao ? `${fmtHora(r.primeira_posicao)}–${fmtHora(r.ultima_posicao!)}` : '—'}</td>
              </tr>
            ))}
          </Tabela>
        </>
      )}

      {aba === 'viagens' && viagens && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Mini grande l="Rodou" v={`${viagens.km.toFixed(1)} km`} /><Mini grande l="Em movimento" v={fmtDuracao(viagens.minutosMovimento)} />
            <Mini grande l="Viagens" v={String(viagens.viagens.length)} /><Mini grande l="Paradas" v={String(viagens.paradas.length)} />
          </div>
          {viagens.truncado && <p className="text-xs text-amber-300 mb-2">Período com muitas posições: mostrando o começo. Diminua o período.</p>}
          <Tabela vazio={!viagens.viagens.length && !viagens.paradas.length} cab={['', 'Início', 'Fim', 'Duração', 'Km', 'Vel. máx', '']}>
            {[...viagens.viagens.map(x => ({ t: x.ini, tipo: 'v' as const, x })), ...viagens.paradas.map(x => ({ t: x.ini, tipo: 'p' as const, x }))]
              .sort((a, b) => a.t.localeCompare(b.t)).map((l, i) => l.tipo === 'v' ? (
                <tr key={i}><td className="py-2 pr-3"><Route size={14} className="text-sky-400" /></td><td className="pr-3">{fmtDataHora(l.x.ini)}</td><td className="pr-3">{fmtHora(l.x.fim)}</td>
                  <td className="pr-3">{fmtDuracao(l.x.minutos)}</td><td className="pr-3">{l.x.km.toFixed(1)}</td><td className="pr-3">{Math.round(l.x.velMax)}</td>
                  <td>{l.x.ate && <a href={linkMapa(l.x.ate.lat, l.x.ate.lng)} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-white"><ExternalLink size={13} /></a>}</td></tr>
              ) : (
                <tr key={i} className="bg-amber-500/[0.04]"><td className="py-2 pr-3"><ParkingCircle size={14} className="text-amber-400" /></td><td className="pr-3">{fmtDataHora(l.x.ini)}</td><td className="pr-3">{fmtHora(l.x.fim)}</td>
                  <td className="pr-3">{fmtDuracao(l.x.minutos)}</td><td className="pr-3 text-slate-500">parado</td><td></td>
                  <td><a href={linkMapa((l.x as Viagens['paradas'][0]).lat, (l.x as Viagens['paradas'][0]).lng)} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-white"><ExternalLink size={13} /></a></td></tr>
              ))}
          </Tabela>
        </>
      )}
      {aba === 'viagens' && !viagens && !carregando && <p className="text-sm text-slate-500">Escolha um veículo e um período de até 7 dias e clique em Gerar.</p>}

      {aba === 'eventos' && (
        <Tabela vazio={!carregando && eventos.length === 0} cab={['Quando', 'Placa', 'Tipo', 'Descrição', '']}>
          {eventos.map(e => (
            <tr key={e.id}>
              <td className="py-2 pr-3 whitespace-nowrap">{fmtDataHora(e.ocorrido_em)}</td><td className="pr-3 font-bold">{placa[e.veiculo_id]}</td>
              <td className={`pr-3 whitespace-nowrap ${e.tipo === 'alarme' ? 'text-red-400 font-bold' : 'text-slate-300'}`}>{TIPOS[e.tipo] || e.tipo}</td>
              <td className="pr-3">{e.mensagem.replace(`${placa[e.veiculo_id]}: `, '')}</td>
              <td>{e.lat != null && <a href={linkMapa(e.lat, e.lng!)} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-white"><ExternalLink size={13} /></a>}</td>
            </tr>
          ))}
        </Tabela>
      )}
    </div>
  );
}

function Mini({ l, v, alerta, grande }: { l: string; v: string; alerta?: boolean; grande?: boolean }) {
  return (
    <div className={grande ? 'bg-[#0F172A] border border-white/10 rounded-2xl p-4' : ''}>
      <p className="text-[10px] font-black uppercase text-slate-500">{l}</p>
      <p className={`font-black ${grande ? 'text-xl' : ''} ${alerta ? 'text-red-400' : ''}`}>{v}</p>
    </div>
  );
}

function Tabela({ cab, children, vazio }: { cab: string[]; children: React.ReactNode; vazio: boolean }) {
  return (
    <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4 overflow-x-auto">
      {vazio ? <p className="text-sm text-slate-500 py-6 text-center">Nada no período. (O resumo de cada dia fica pronto de madrugada; o de hoje é atualizado quando você gera.)</p> : (
        <table className="w-full text-sm">
          <thead><tr className="text-[10px] uppercase text-slate-500 text-left">{cab.map((c, i) => <th key={i} className="py-2 pr-3">{c}</th>)}</tr></thead>
          <tbody className="divide-y divide-white/5">{children}</tbody>
        </table>
      )}
    </div>
  );
}
