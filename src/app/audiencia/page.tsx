"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Radio, Plus, Trash2, Upload, Loader2, X, BarChart3, Save, ClipboardPaste, Table2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useUnidades } from '@/lib/useUnidades';
import { DIAS, FONTES, adivinharColunas, lerTabela, montarFaixas, numeroBR, type DiaTipo, type Faixa, type Mapa, type Pesquisa } from '@/lib/audiencia';

// Audiência por emissora: pesquisas (Kantar IBOPE, instituto regional, streaming ou manual) com os
// números por faixa horária. A proposta do pipeline usa a pesquisa mais recente da emissora.

const INPUT = 'w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-[var(--cor-primaria)]';
const HORAS = Array.from({ length: 20 }, (_, i) => i + 5); // 05h às 24h
const fmt = (v: number | null | undefined, d = 0) => v === null || v === undefined ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: d });

type PesquisaForm = { fonte: string; instituto: string; praca: string; publico: string; universo: string; periodo_inicio: string; periodo_fim: string };
const FORM_VAZIO: PesquisaForm = { fonte: 'kantar_ibope', instituto: 'Kantar IBOPE Media', praca: '', publico: 'Total 10+', universo: '', periodo_inicio: '', periodo_fim: '' };

export default function AudienciaPage() {
  const auth = useAuth() || {};
  const perfil = (auth as any).perfil;
  const empresaId = perfil?.empresa_id as string | undefined;
  const podeEditar = ['diretor', 'gerente'].includes(perfil?.cargo);
  const { unidades } = useUnidades(empresaId);

  const [unidade, setUnidade] = useState('');
  const [pesquisas, setPesquisas] = useState<Pesquisa[]>([]);
  const [selecionada, setSelecionada] = useState<number | null>(null);
  const [faixas, setFaixas] = useState<Faixa[]>([]);
  const [dia, setDia] = useState<DiaTipo>('seg_sex');
  const [carregando, setCarregando] = useState(false);
  const [editor, setEditor] = useState<null | { id: number | null; form: PesquisaForm }>(null);
  const [importar, setImportar] = useState(false);
  const [erro, setErro] = useState('');

  const unidadeAtual = unidade || unidades[0]?.nome || '';

  const carregarPesquisas = useCallback(async () => {
    if (!empresaId || !unidadeAtual) return;
    const { data, error } = await supabase.from('audiencia_pesquisas').select('*').eq('empresa_id', empresaId).eq('unidade', unidadeAtual).order('periodo_fim', { ascending: false, nullsFirst: false }).limit(50);
    if (error) { setErro('Rode a migration 20261103100000_audiencia.sql no Supabase para ativar a Audiência.'); return; }
    setErro('');
    setPesquisas((data || []) as Pesquisa[]);
    setSelecionada(prev => (data || []).some(p => p.id === prev) ? prev : (data?.[0]?.id ?? null));
  }, [empresaId, unidadeAtual]);

  useEffect(() => { carregarPesquisas(); }, [carregarPesquisas]);

  useEffect(() => {
    if (!selecionada) { setFaixas([]); return; }
    let cancelado = false;
    setCarregando(true);
    supabase.from('audiencia_faixas').select('dia_tipo, hora_inicio, hora_fim, ouvintes_minuto, audiencia_pct, share_pct, alcance').eq('pesquisa_id', selecionada).order('hora_inicio').limit(500)
      .then(({ data }) => {
        if (cancelado) return;
        const fx = ((data || []) as any[]).map(f => ({ ...f, hora_inicio: String(f.hora_inicio).slice(0, 5), hora_fim: String(f.hora_fim).slice(0, 5) })) as Faixa[];
        setFaixas(fx);
        const dias = new Set(fx.map(f => f.dia_tipo));
        setDia(d => dias.has(d) || !dias.size ? d : ([...dias][0] as DiaTipo));
        setCarregando(false);
      });
    return () => { cancelado = true; };
  }, [selecionada]);

  const pesquisa = pesquisas.find(p => p.id === selecionada) || null;
  const faixasDia = useMemo(() => faixas.filter(f => f.dia_tipo === dia).sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio)), [faixas, dia]);
  const diasComDados = useMemo(() => (Object.keys(DIAS) as DiaTipo[]).filter(d => faixas.some(f => f.dia_tipo === d)), [faixas]);
  const maxOpm = Math.max(1, ...faixasDia.map(f => Number(f.ouvintes_minuto) || 0));
  const picos = useMemo(() => [...faixasDia].filter(f => f.ouvintes_minuto !== null).sort((a, b) => Number(b.ouvintes_minuto) - Number(a.ouvintes_minuto)).slice(0, 3).map(f => f.hora_inicio), [faixasDia]);

  async function salvarPesquisa() {
    if (!editor || !empresaId) return;
    const f = editor.form;
    const payload = {
      empresa_id: empresaId, unidade: unidadeAtual, fonte: f.fonte, instituto: f.instituto.trim() || null, praca: f.praca.trim() || null,
      publico: f.publico.trim() || 'Total', universo: numeroBR(f.universo), periodo_inicio: f.periodo_inicio || null, periodo_fim: f.periodo_fim || null,
    };
    const res = editor.id
      ? await supabase.from('audiencia_pesquisas').update(payload).eq('id', editor.id).select('id').single()
      : await supabase.from('audiencia_pesquisas').insert([{ ...payload, criado_por: (auth as any).user?.id }]).select('id').single();
    if (res.error) { setErro(`Não foi possível salvar: ${res.error.message}`); return; }
    setEditor(null);
    await carregarPesquisas();
    setSelecionada(res.data.id);
    if (!editor.id) setImportar(true);
  }

  async function excluirPesquisa() {
    if (!pesquisa) return;
    await supabase.from('audiencia_pesquisas').delete().eq('id', pesquisa.id);
    setSelecionada(null);
    carregarPesquisas();
  }

  async function gravarFaixas(novas: Faixa[], substituirDia: DiaTipo[] | 'tudo') {
    if (!pesquisa || !empresaId) return;
    let del = supabase.from('audiencia_faixas').delete().eq('pesquisa_id', pesquisa.id);
    if (substituirDia !== 'tudo') del = del.in('dia_tipo', substituirDia);
    await del;
    if (novas.length) {
      const { error } = await supabase.from('audiencia_faixas').insert(novas.map(f => ({ ...f, pesquisa_id: pesquisa.id, empresa_id: empresaId })));
      if (error) { setErro(`Não foi possível gravar as faixas: ${error.message}`); return; }
    }
    const { data } = await supabase.from('audiencia_faixas').select('dia_tipo, hora_inicio, hora_fim, ouvintes_minuto, audiencia_pct, share_pct, alcance').eq('pesquisa_id', pesquisa.id).order('hora_inicio').limit(500);
    setFaixas(((data || []) as any[]).map(f => ({ ...f, hora_inicio: String(f.hora_inicio).slice(0, 5), hora_fim: String(f.hora_fim).slice(0, 5) })));
  }

  return (
    <div className="p-4 md:p-6 space-y-4 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-black tracking-tighter text-white uppercase italic flex items-center gap-2"><Radio size={22} className="text-[var(--cor-primaria)]" /> Audiência</h1>
          <p className="text-slate-500 text-[10px] md:text-xs font-bold uppercase tracking-widest">Pesquisas por emissora · usadas na proposta para mostrar impactos e custo por mil</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={unidadeAtual} onChange={e => setUnidade(e.target.value)} className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm font-bold outline-none">
            {unidades.map(u => <option key={u.id} value={u.nome} className="bg-[#0B1120]">{u.nome}</option>)}
          </select>
          {podeEditar && unidadeAtual && (
            <button onClick={() => setEditor({ id: null, form: { ...FORM_VAZIO } })} className="flex items-center gap-2 bg-[var(--cor-primaria)] text-[#0F172A] px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest"><Plus size={14} /> Nova pesquisa</button>
          )}
        </div>
      </div>

      {erro && <p className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-xs font-bold">{erro}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-4">
        <div className="bg-[#0B1120] border border-white/5 rounded-2xl p-3 space-y-2 h-fit">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 px-1">Pesquisas de {unidadeAtual || '—'}</p>
          {pesquisas.length === 0 && (
            <p className="text-slate-500 text-xs px-1 py-4">Nenhuma pesquisa ainda. {podeEditar ? 'Clique em "Nova pesquisa" e cole a tabela do Excel (IBOPE, instituto ou streaming).' : 'Peça para a liderança cadastrar.'}</p>
          )}
          {pesquisas.map((p, i) => (
            <button key={p.id} onClick={() => setSelecionada(p.id)} className={`w-full text-left rounded-xl p-3 border transition-colors ${selecionada === p.id ? 'border-[var(--cor-primaria)] bg-[rgb(var(--cor-primaria-rgb)/8%)]' : 'border-white/5 bg-white/[0.02] hover:border-white/15'}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-white text-xs font-black truncate">{FONTES[p.fonte] || p.fonte}</p>
                {i === 0 && <span className="text-[8px] font-black uppercase text-[var(--cor-primaria)]">usada na proposta</span>}
              </div>
              <p className="text-[10px] text-slate-400">{[p.praca, p.publico].filter(Boolean).join(' · ')}</p>
              <p className="text-[10px] text-slate-500">{p.periodo_inicio ? `${new Date(p.periodo_inicio + 'T12:00').toLocaleDateString('pt-BR')} a ${p.periodo_fim ? new Date(p.periodo_fim + 'T12:00').toLocaleDateString('pt-BR') : '—'}` : 'Período não informado'}</p>
            </button>
          ))}
        </div>

        <div className="bg-[#0B1120] border border-white/5 rounded-2xl p-4 space-y-4 min-w-0">
          {!pesquisa ? (
            <p className="text-slate-500 text-sm py-10 text-center">Selecione ou cadastre uma pesquisa.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-white font-black text-lg">{pesquisa.instituto || FONTES[pesquisa.fonte]}</h2>
                  <p className="text-xs text-slate-400">{[pesquisa.praca, pesquisa.publico, pesquisa.universo ? `universo ${fmt(pesquisa.universo)} pessoas` : null].filter(Boolean).join(' · ')}</p>
                </div>
                {podeEditar && (
                  <div className="flex gap-2">
                    <button onClick={() => setImportar(true)} className="flex items-center gap-1.5 bg-blue-600/15 border border-blue-500/30 text-blue-400 hover:bg-blue-600 hover:text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase"><Upload size={12} /> Importar / editar faixas</button>
                    <button onClick={() => setEditor({ id: pesquisa.id, form: { fonte: pesquisa.fonte, instituto: pesquisa.instituto || '', praca: pesquisa.praca || '', publico: pesquisa.publico, universo: pesquisa.universo ? String(pesquisa.universo) : '', periodo_inicio: pesquisa.periodo_inicio || '', periodo_fim: pesquisa.periodo_fim || '' } })} className="bg-white/5 border border-white/10 text-slate-300 hover:text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase">Dados</button>
                    <button onClick={excluirPesquisa} title="Excluir pesquisa" className="p-2 bg-red-500/10 rounded-xl text-red-400 hover:bg-red-500 hover:text-white"><Trash2 size={14} /></button>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(DIAS) as DiaTipo[]).map(d => (
                  <button key={d} onClick={() => setDia(d)} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase ${dia === d ? 'bg-white/15 text-white' : 'text-slate-500 hover:text-white'} ${diasComDados.includes(d) ? '' : 'opacity-50'}`}>{DIAS[d]}</button>
                ))}
              </div>

              {carregando ? <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-slate-500" /></div> : faixasDia.length === 0 ? (
                <p className="text-slate-500 text-sm py-8 text-center">Sem números para {DIAS[dia]}. {podeEditar ? 'Use "Importar / editar faixas".' : ''}</p>
              ) : (
                <>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-1.5"><BarChart3 size={11} /> Ouvintes por minuto ao longo do dia</p>
                    <div className="flex items-end gap-1 h-40 overflow-x-auto">
                      {faixasDia.map(f => {
                        const v = Number(f.ouvintes_minuto) || 0;
                        const pico = picos.includes(f.hora_inicio);
                        return (
                          <div key={f.hora_inicio} className="flex-1 min-w-[22px] flex flex-col items-center justify-end h-full" title={`${f.hora_inicio}–${f.hora_fim}: ${fmt(v)} ouvintes/min`}>
                            <span className="text-[8px] text-slate-400 font-bold">{v >= 1000 ? fmt(v / 1000, 1) + 'k' : fmt(v)}</span>
                            <div className={`w-full rounded-t ${pico ? 'bg-[var(--cor-primaria)]' : 'bg-blue-600/60'}`} style={{ height: `${Math.max(v / maxOpm * 100, 2)}%` }} />
                            <span className="text-[8px] text-slate-500 mt-1">{f.hora_inicio.slice(0, 2)}h</span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">Em verde: os 3 horários de maior audiência, sugeridos na proposta.</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs min-w-[520px]">
                      <thead><tr className="text-[9px] uppercase tracking-widest text-slate-500"><th className="text-left py-2">Faixa</th><th className="text-right">Ouvintes/min</th><th className="text-right">Audiência %</th><th className="text-right">Share %</th><th className="text-right">Alcance</th></tr></thead>
                      <tbody>
                        {faixasDia.map(f => (
                          <tr key={f.hora_inicio} className="border-t border-white/5 text-slate-300">
                            <td className="py-1.5 font-bold">{f.hora_inicio}–{f.hora_fim}</td><td className="text-right tabular-nums">{fmt(f.ouvintes_minuto)}</td><td className="text-right tabular-nums">{fmt(f.audiencia_pct, 2)}</td><td className="text-right tabular-nums">{fmt(f.share_pct, 1)}</td><td className="text-right tabular-nums">{fmt(f.alcance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {editor && (
        <div className="fixed inset-0 bg-black/80 z-[999] flex items-center justify-center p-4" onClick={() => setEditor(null)}>
          <div className="bg-[#0B1120] border border-white/10 rounded-3xl w-full max-w-lg p-6 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center"><h2 className="text-white font-black uppercase italic">{editor.id ? 'Dados da pesquisa' : `Nova pesquisa · ${unidadeAtual}`}</h2><button onClick={() => setEditor(null)} className="text-slate-500 hover:text-white"><X size={18} /></button></div>
            {([['fonte', 'Fonte'], ['instituto', 'Instituto'], ['praca', 'Praça'], ['publico', 'Público'], ['universo', 'Universo (pessoas)'], ['periodo_inicio', 'Período: início'], ['periodo_fim', 'Período: fim']] as [keyof PesquisaForm, string][]).map(([k, l]) => (
              <label key={k} className="block space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{l}</span>
                {k === 'fonte' ? (
                  <select value={editor.form.fonte} onChange={e => setEditor({ ...editor, form: { ...editor.form, fonte: e.target.value, instituto: FONTES[e.target.value] && e.target.value !== 'instituto' ? FONTES[e.target.value] : editor.form.instituto } })} className={INPUT}>
                    {Object.entries(FONTES).map(([v, n]) => <option key={v} value={v} className="bg-[#0B1120]">{n}</option>)}
                  </select>
                ) : (
                  <input type={k.startsWith('periodo') ? 'date' : 'text'} value={editor.form[k]} onChange={e => setEditor({ ...editor, form: { ...editor.form, [k]: e.target.value } })} className={INPUT} placeholder={k === 'praca' ? 'Ex.: Grande Florianópolis' : k === 'publico' ? 'Ex.: Total 10+' : ''} />
                )}
              </label>
            ))}
            <button onClick={salvarPesquisa} className="w-full flex items-center justify-center gap-2 bg-[var(--cor-primaria)] text-[#0F172A] py-3 rounded-xl font-black text-xs uppercase tracking-widest"><Save size={14} /> Salvar</button>
          </div>
        </div>
      )}

      {importar && pesquisa && <ImportarFaixas faixas={faixas} diaInicial={dia} onFechar={() => setImportar(false)} onGravar={async (n, s) => { await gravarFaixas(n, s); setImportar(false); }} />}
    </div>
  );
}

function ImportarFaixas({ faixas, diaInicial, onFechar, onGravar }: { faixas: Faixa[]; diaInicial: DiaTipo; onFechar: () => void; onGravar: (novas: Faixa[], substituir: DiaTipo[] | 'tudo') => Promise<void> }) {
  const [modo, setModo] = useState<'colar' | 'grade'>('colar');
  const [texto, setTexto] = useState('');
  const [dia, setDia] = useState<DiaTipo>(diaInicial);
  const [mapa, setMapa] = useState<Mapa | null>(null);
  const [gravando, setGravando] = useState(false);
  const tabela = useMemo(() => lerTabela(texto), [texto]);
  const mapaAtual = mapa || adivinharColunas(tabela.cabecalho);
  const previa = useMemo(() => montarFaixas(tabela.linhas, mapaAtual, dia), [tabela, mapaAtual, dia]);

  const [grade, setGrade] = useState<Record<number, { opm: string; aud: string; share: string }>>(() => {
    const g: Record<number, { opm: string; aud: string; share: string }> = {};
    HORAS.forEach(h => { const f = faixas.find(x => x.dia_tipo === diaInicial && Number(x.hora_inicio.slice(0, 2)) === h); g[h] = { opm: f?.ouvintes_minuto != null ? String(f.ouvintes_minuto) : '', aud: f?.audiencia_pct != null ? String(f.audiencia_pct) : '', share: f?.share_pct != null ? String(f.share_pct) : '' }; });
    return g;
  });

  async function gravar() {
    setGravando(true);
    if (modo === 'colar') {
      const dias = [...new Set(previa.map(f => f.dia_tipo))];
      await onGravar(previa, dias);
    } else {
      const novas: Faixa[] = HORAS.filter(h => grade[h].opm || grade[h].aud).map(h => ({
        dia_tipo: dia, hora_inicio: `${String(h).padStart(2, '0')}:00`, hora_fim: h === 24 ? '23:59' : `${String(h + 1).padStart(2, '0')}:00`,
        ouvintes_minuto: numeroBR(grade[h].opm), audiencia_pct: numeroBR(grade[h].aud), share_pct: numeroBR(grade[h].share), alcance: null,
      })).filter(f => f.hora_inicio !== '24:00');
      await onGravar(novas, [dia]);
    }
    setGravando(false);
  }

  const COLS: [keyof Mapa, string][] = [['hora', 'Faixa horária'], ['dia', 'Dia da semana'], ['opm', 'Ouvintes por minuto'], ['aud', 'Audiência %'], ['share', 'Share %'], ['alcance', 'Alcance']];

  return (
    <div className="fixed inset-0 bg-black/80 z-[999] flex items-center justify-center p-2 md:p-4" onClick={onFechar}>
      <div className="bg-[#0B1120] border border-white/10 rounded-3xl w-full max-w-3xl max-h-[94dvh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b border-white/10">
          <h2 className="text-white font-black uppercase italic">Faixas de audiência</h2>
          <button onClick={onFechar} className="text-slate-500 hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          <div className="flex flex-wrap gap-2 items-center">
            <button onClick={() => setModo('colar')} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase ${modo === 'colar' ? 'bg-white/15 text-white' : 'text-slate-500'}`}><ClipboardPaste size={12} /> Colar do Excel</button>
            <button onClick={() => setModo('grade')} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase ${modo === 'grade' ? 'bg-white/15 text-white' : 'text-slate-500'}`}><Table2 size={12} /> Digitar hora a hora</button>
            <select value={dia} onChange={e => setDia(e.target.value as DiaTipo)} className="ml-auto bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-bold outline-none">
              {(Object.keys(DIAS) as DiaTipo[]).map(d => <option key={d} value={d} className="bg-[#0B1120]">{DIAS[d]}</option>)}
            </select>
          </div>

          {modo === 'colar' ? (
            <>
              <p className="text-xs text-slate-400">Abra a planilha (exportação do Easy Media, relatório do instituto ou do streaming), selecione a tabela <b>com o cabeçalho</b>, copie e cole aqui. Se a tabela não tiver a coluna de dia, vale o dia escolhido acima.</p>
              <textarea value={texto} onChange={e => { setTexto(e.target.value); setMapa(null); }} rows={7} className={`${INPUT} font-mono text-xs`} placeholder={'Faixa\tOuvintes/min\tAudiência %\tShare %\n06:00-07:00\t12.500\t2,1\t18,4'} />
              {tabela.cabecalho.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {COLS.map(([k, l]) => (
                    <label key={k} className="space-y-1">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">{l}</span>
                      <select value={mapaAtual[k]} onChange={e => setMapa({ ...mapaAtual, [k]: Number(e.target.value) })} className={`${INPUT} py-2 text-xs`}>
                        <option value={-1} className="bg-[#0B1120]">— não tem —</option>
                        {tabela.cabecalho.map((c, i) => <option key={i} value={i} className="bg-[#0B1120]">{c || `Coluna ${i + 1}`}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              )}
              {tabela.cabecalho.length > 0 && (
                <p className={`text-xs font-bold ${previa.length ? 'text-[var(--cor-primaria)]' : 'text-orange-400'}`}>
                  {previa.length ? `${previa.length} faixas reconhecidas (${[...new Set(previa.map(f => DIAS[f.dia_tipo]))].join(', ')}). Ao gravar, substituem as faixas desses dias.` : 'Nenhuma faixa reconhecida — confira qual coluna é a faixa horária.'}
                </p>
              )}
            </>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[420px]">
                <thead><tr className="text-[9px] uppercase tracking-widest text-slate-500"><th className="text-left py-1">Hora</th><th>Ouvintes/min</th><th>Audiência %</th><th>Share %</th></tr></thead>
                <tbody>
                  {HORAS.filter(h => h < 24).map(h => (
                    <tr key={h}>
                      <td className="py-1 text-slate-400 font-bold">{String(h).padStart(2, '0')}h</td>
                      {(['opm', 'aud', 'share'] as const).map(c => (
                        <td key={c} className="px-1"><input value={grade[h][c]} onChange={e => setGrade(g => ({ ...g, [h]: { ...g[h], [c]: e.target.value } }))} className={`${INPUT} py-1.5 text-right`} inputMode="decimal" /></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="p-5 border-t border-white/10">
          <button onClick={gravar} disabled={gravando || (modo === 'colar' && !previa.length)} className="w-full flex items-center justify-center gap-2 bg-[var(--cor-primaria)] text-[#0F172A] py-3 rounded-xl font-black text-xs uppercase tracking-widest disabled:opacity-40">
            {gravando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Gravar faixas
          </button>
        </div>
      </div>
    </div>
  );
}
