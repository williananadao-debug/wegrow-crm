"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, FileBarChart, Download, Route, ParkingCircle, Bell, CalendarDays, ExternalLink, Fuel, MapPin } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRastreioAccess, apiRastreio, fmtDataHora, fmtHora, linkMapa } from '../shared';
import { fmtDuracao } from '../analise';

type Aba = 'resumo' | 'frota' | 'locais' | 'viagens' | 'eventos';
type V = { id: string; placa: string; descricao: string | null; consumo_km_l?: number | null };
type Resumo = { veiculo_id: string; dia: string; km: number; minutos_movimento: number; minutos_ligado: number; paradas: number; viagens: number; velocidade_max: number; excessos: number; primeira_posicao: string | null; ultima_posicao: string | null;
  minutos_ocioso?: number; freadas?: number; aceleracoes?: number; nota_conducao?: number | null; motorista_id?: string | null };
type Local = { veiculo_id: string; nome: string; visitas: number; minutos: number; ultima: string };
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
  horario: 'Fora do horário', sem_comunicacao: 'Sem comunicar há dias',
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
  const [locais, setLocais] = useState<Local[]>([]);
  const [motoristas, setMotoristas] = useState<Record<string, string>>({});
  const [precoComb, setPrecoComb] = useState(6);

  useEffect(() => {
    void Promise.resolve().then(async () => {
      const [{ data }, { data: ms }, { data: cfg }] = await Promise.all([
        supabase.from('rastreio_veiculos').select('id, placa, descricao, consumo_km_l').eq('status', 'ativo').order('placa'),
        supabase.from('rastreio_motoristas').select('id, nome').limit(2000),
        supabase.from('rastreio_cobranca_config').select('preco_combustivel').maybeSingle(),
      ]);
      setVeics((data as V[]) || []);
      setMotoristas(Object.fromEntries((ms || []).map(m => [m.id, m.nome])));
      if (cfg?.preco_combustivel) setPrecoComb(Number(cfg.preco_combustivel));
    });
  }, []);

  const placa = useMemo(() => Object.fromEntries(veics.map(v => [v.id, v.placa])), [veics]);
  const periodoOk = /^\d{4}-\d{2}-\d{2}$/.test(ini) && /^\d{4}-\d{2}-\d{2}$/.test(fim) && ini <= fim;
  const dias = periodoOk ? Math.round((Date.parse(fim) - Date.parse(ini)) / 86400_000) + 1 : 0;

  const gerar = useCallback(async () => {
    if (!periodoOk) { setErro('Período inválido.'); return; }
    setErro(''); setCarregando(true);
    try {
      if (aba === 'locais') {
        if (dias > 62) throw new Error('Escolha até 62 dias.');
        // Permanência nas cercas: pares "entrou em X" → "saiu de X" dos alertas de cerca
        let q = supabase.from('rastreio_eventos').select('veiculo_id, mensagem, ocorrido_em').eq('tipo', 'cerca')
          .gte('ocorrido_em', `${ini}T00:00:00-03:00`).lte('ocorrido_em', `${fim}T23:59:59.999-03:00`).order('ocorrido_em').limit(10000);
        if (veiculo !== 'todos') q = q.eq('veiculo_id', veiculo);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        const dentro = new Map<string, string>(); const acc = new Map<string, Local>();
        for (const e of data || []) {
          const m = String(e.mensagem).match(/: (entrou em|saiu de) (.+)$/);
          if (!m) continue;
          const chave = `${e.veiculo_id}|${m[2]}`;
          if (m[1] === 'entrou em') { dentro.set(chave, e.ocorrido_em); continue; }
          const ent = dentro.get(chave); dentro.delete(chave);
          if (!ent) continue;
          const l = acc.get(chave) || { veiculo_id: e.veiculo_id, nome: m[2], visitas: 0, minutos: 0, ultima: ent };
          l.visitas++; l.minutos += Math.max(0, Math.round((Date.parse(e.ocorrido_em) - Date.parse(ent)) / 60000)); l.ultima = ent;
          acc.set(chave, l);
        }
        setLocais([...acc.values()].sort((a, b) => b.minutos - a.minutos));
      } else if (aba === 'resumo' || aba === 'frota') {
        if (dias > 62) throw new Error('Escolha até 62 dias.');
        if (fim >= hoje()) await apiRastreio('relatorio', { acao: 'hoje' }).catch(() => null);
        let q = supabase.from('rastreio_resumo_diario')
          .select('veiculo_id, dia, km, minutos_movimento, minutos_ligado, paradas, viagens, velocidade_max, excessos, primeira_posicao, ultima_posicao, minutos_ocioso, freadas, aceleracoes, nota_conducao, motorista_id')
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

  // Frota: combustível (km ÷ km/l do veículo × preço), motor ligado parado e nota de condução
  const consumo = useMemo(() => Object.fromEntries(veics.map(v => [v.id, Number(v.consumo_km_l) || 0])), [veics]);
  const frota = useMemo(() => {
    const m: Record<string, { km: number; ocioso: number; freadas: number; acel: number; exc: number; notas: number[] }> = {};
    const mot: Record<string, { km: number; exc: number; freadas: number; notas: number[]; dias: number }> = {};
    for (const r of resumo) {
      const t = (m[r.veiculo_id] ||= { km: 0, ocioso: 0, freadas: 0, acel: 0, exc: 0, notas: [] });
      t.km += Number(r.km); t.ocioso += r.minutos_ocioso || 0; t.freadas += r.freadas || 0; t.acel += r.aceleracoes || 0; t.exc += r.excessos;
      if (r.nota_conducao != null) t.notas.push(r.nota_conducao);
      if (r.motorista_id) {
        const d = (mot[r.motorista_id] ||= { km: 0, exc: 0, freadas: 0, notas: [], dias: 0 });
        d.km += Number(r.km); d.exc += r.excessos; d.freadas += r.freadas || 0; d.dias++; if (r.nota_conducao != null) d.notas.push(r.nota_conducao);
      }
    }
    const media = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
    const veic = Object.entries(m).map(([id, t]) => {
      const litros = consumo[id] ? t.km / consumo[id] : null;
      return { id, ...t, nota: media(t.notas), litros, custo: litros != null ? litros * precoComb : null };
    }).sort((a, b) => b.km - a.km);
    const porMot = Object.entries(mot).map(([id, t]) => ({ id, ...t, nota: media(t.notas) })).sort((a, b) => (b.nota ?? 0) - (a.nota ?? 0));
    return { veic, porMot, litros: veic.reduce((s, x) => s + (x.litros || 0), 0), custo: veic.reduce((s, x) => s + (x.custo || 0), 0), ocioso: veic.reduce((s, x) => s + x.ocioso, 0), semConsumo: veic.filter(x => !consumo[x.id]).length };
  }, [resumo, consumo, precoComb]);
  const corNota = (n: number | null) => (n == null ? 'text-slate-500' : n >= 85 ? 'text-emerald-400' : n >= 65 ? 'text-amber-300' : 'text-red-400');

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
    if (aba === 'frota') {
      baixarCsv(nome, [['Placa', 'Km', 'Litros (estim.)', 'Custo combustível (R$)', 'Motor ligado parado (min)', 'Excessos', 'Freadas bruscas', 'Arrancadas bruscas', 'Nota de condução'],
        ...frota.veic.map(x => [placa[x.id] || '', x.km.toFixed(1).replace('.', ','), x.litros != null ? x.litros.toFixed(1).replace('.', ',') : '', x.custo != null ? x.custo.toFixed(2).replace('.', ',') : '', x.ocioso, x.exc, x.freadas, x.acel, x.nota ?? ''])]);
      return;
    }
    if (aba === 'locais') {
      baixarCsv(nome, [['Placa', 'Local (cerca)', 'Visitas', 'Tempo total (min)', 'Última entrada'], ...locais.map(l => [placa[l.veiculo_id] || '', l.nome, l.visitas, l.minutos, fmtDataHora(l.ultima)])]);
      return;
    }
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
  const temDados = aba === 'resumo' || aba === 'frota' ? resumo.length > 0 : aba === 'locais' ? locais.length > 0 : aba === 'eventos' ? eventos.length > 0 : Boolean(viagens);

  return (
    <div className="md:p-8 pb-20 text-white">
      <Link href="/rastreio" className="inline-flex items-center gap-1 text-xs font-black uppercase text-slate-500 hover:text-white mb-3"><ArrowLeft size={14} /> Frota</Link>
      <h1 className="text-2xl md:text-4xl font-black tracking-tighter uppercase italic text-sky-400 flex items-center gap-2 md:gap-3 mb-4">
        <FileBarChart className="w-6 h-6 md:w-8 md:h-8 shrink-0" /> Relatórios
      </h1>

      <div className="flex gap-2 mb-4 faixa-scroll">
        {([['resumo', 'Resumo por dia', CalendarDays], ['frota', 'Frota e condução', Fuel], ['locais', 'Tempo nos locais', MapPin], ['viagens', 'Viagens e paradas', Route], ['eventos', 'Alertas e eventos', Bell]] as const).map(([k, t, I]) => (
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

      {aba === 'frota' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Mini grande l="Combustível (estim.)" v={`${frota.litros.toFixed(0)} L`} />
            <Mini grande l="Custo combustível" v={frota.custo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
            <Mini grande l="Motor ligado parado" v={fmtDuracao(frota.ocioso)} alerta={frota.ocioso > 600} />
            <Mini grande l={`Preço do litro`} v={`R$ ${precoComb.toFixed(2).replace('.', ',')}`} />
          </div>
          {frota.semConsumo > 0 && <p className="text-xs text-amber-300 mb-3">{frota.semConsumo} veículo(s) sem consumo (km/l) cadastrado: informe em Editar veículo para calcular o combustível. O preço do litro fica em Financeiro → Regras.</p>}
          <Tabela vazio={!carregando && frota.veic.length === 0} cab={['Placa', 'Km', 'Litros', 'Custo', 'Ligado parado', 'Excessos', 'Freadas', 'Arrancadas', 'Nota']}>
            {frota.veic.map(x => (
              <tr key={x.id}>
                <td className="py-2 pr-3 font-bold">{placa[x.id]}</td><td className="pr-3">{x.km.toFixed(1)}</td>
                <td className="pr-3">{x.litros != null ? x.litros.toFixed(1) : '—'}</td><td className="pr-3">{x.custo != null ? x.custo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}</td>
                <td className="pr-3">{fmtDuracao(x.ocioso)}</td><td className={`pr-3 ${x.exc ? 'text-red-400 font-bold' : ''}`}>{x.exc}</td>
                <td className="pr-3">{x.freadas}</td><td className="pr-3">{x.acel}</td>
                <td className={`pr-3 font-black ${corNota(x.nota)}`}>{x.nota ?? '—'}</td>
              </tr>
            ))}
          </Tabela>
          {frota.porMot.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">Por motorista</p>
              <Tabela vazio={false} cab={['Motorista', 'Dias', 'Km', 'Excessos', 'Freadas', 'Nota média']}>
                {frota.porMot.map(x => (
                  <tr key={x.id}><td className="py-2 pr-3 font-bold">{motoristas[x.id] || '—'}</td><td className="pr-3">{x.dias}</td><td className="pr-3">{x.km.toFixed(1)}</td>
                    <td className="pr-3">{x.exc}</td><td className="pr-3">{x.freadas}</td><td className={`pr-3 font-black ${corNota(x.nota)}`}>{x.nota ?? '—'}</td></tr>
                ))}
              </Tabela>
            </div>
          )}
          <p className="text-[11px] text-slate-500 mt-3">Nota de condução: começa em 100 e perde pontos por excesso de velocidade, freada e arrancada brusca. Freadas e arrancadas dependem do intervalo de envio do rastreador (mais preciso com 10–30 s). O motorista é o vinculado ao veículo em cada dia.</p>
        </>
      )}

      {aba === 'locais' && (
        <>
          <Tabela vazio={!carregando && locais.length === 0} cab={['Placa', 'Local (cerca)', 'Visitas', 'Tempo total', 'Média por visita', 'Última entrada']}>
            {locais.map(l => (
              <tr key={l.veiculo_id + l.nome}><td className="py-2 pr-3 font-bold">{placa[l.veiculo_id]}</td><td className="pr-3">{l.nome}</td><td className="pr-3">{l.visitas}</td>
                <td className="pr-3">{fmtDuracao(l.minutos)}</td><td className="pr-3">{fmtDuracao(Math.round(l.minutos / Math.max(1, l.visitas)))}</td><td className="pr-3 text-slate-400">{fmtDataHora(l.ultima)}</td></tr>
            ))}
          </Tabela>
          <p className="text-[11px] text-slate-500 mt-3">Cadastre os lugares (clientes, base, obras) como cercas no veículo: o relatório soma quantas vezes e quanto tempo ele ficou em cada um.</p>
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
