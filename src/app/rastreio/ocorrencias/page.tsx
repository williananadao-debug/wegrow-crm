"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Siren, Loader2, X, Copy, ExternalLink, Send, CheckCircle2, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRastreioAccess, apiRastreio, fmtDataHora, type Veiculo } from '../shared';

type Passo = { em: string; texto: string; autor: string };
type Ocorrencia = {
  id: number; veiculo_id: string; cliente_id: string | null; tipo: string; status: string; descricao: string | null; bo_numero: string | null;
  origem: string; aberta_por: string | null; aberta_em: string; encerrada_em: string | null; link_compartilhamento: string | null; linha_tempo: Passo[];
};
const TIPOS: Record<string, string> = { roubo: 'Roubo', furto: 'Furto', suspeita: 'Suspeita', sinistro: 'Sinistro / acidente', outro: 'Outro' };

// Central de ocorrências: roubo/furto em andamento no topo, com mapa ao vivo, linha do tempo e B.O.
export default function OcorrenciasPage() {
  const { authLoading, temRastreio, podeBloquear } = useRastreioAccess();
  const [lista, setLista] = useState<Ocorrencia[]>([]);
  const [veics, setVeics] = useState<Record<string, Pick<Veiculo, 'id' | 'placa' | 'descricao' | 'ultima_lat' | 'ultima_lng' | 'ultima_posicao_em'>>>({});
  const [carregando, setCarregando] = useState(true);
  const [aberta, setAberta] = useState<number | null>(null);
  const [nota, setNota] = useState('');
  const [bo, setBo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; t: string } | null>(null);
  const [nova, setNova] = useState<{ veiculoId: string; tipo: string; descricao: string; bloquear: boolean } | null>(null);
  const [todosVeics, setTodosVeics] = useState<{ id: string; placa: string; descricao: string | null }[]>([]);

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('rastreio_ocorrencias').select('*').order('aberta_em', { ascending: false }).limit(200);
    const ocs = (data as Ocorrencia[]) || [];
    setLista(ocs);
    const ids = [...new Set(ocs.map(o => o.veiculo_id))];
    if (ids.length) {
      const { data: vs } = await supabase.from('rastreio_veiculos').select('id, placa, descricao, ultima_lat, ultima_lng, ultima_posicao_em').in('id', ids);
      setVeics(Object.fromEntries((vs || []).map(v => [v.id, v])));
    }
    setCarregando(false);
  }, []);
  useEffect(() => { void Promise.resolve().then(carregar); const t = setInterval(carregar, 20000); return () => clearInterval(t); }, [carregar]);

  const abrirNova = async () => {
    if (!todosVeics.length) {
      const { data } = await supabase.from('rastreio_veiculos').select('id, placa, descricao').eq('status', 'ativo').order('placa').limit(2000);
      setTodosVeics(data || []);
    }
    setNova({ veiculoId: '', tipo: 'roubo', descricao: '', bloquear: false });
  };

  const acao = async (corpo: Record<string, unknown>, ok: string) => {
    setOcupado(true); setAviso(null);
    try { const r = await apiRastreio('ocorrencia', corpo); setAviso({ ok: true, t: r.bloqueio ? `${ok} ${r.bloqueio}` : ok }); await carregar(); return r; }
    catch (e) { setAviso({ ok: false, t: (e as Error).message }); return null; }
    finally { setOcupado(false); }
  };

  const atual = useMemo(() => lista.find(o => o.id === aberta) || null, [lista, aberta]);
  const emAndamento = lista.filter(o => o.status === 'aberta');

  if (authLoading || carregando) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;
  if (!temRastreio) return <div className="p-8 text-slate-400 text-sm">O módulo Rastreio não está ativo pra sua empresa.</div>;
  const inp = 'w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-red-400';

  return (
    <div className="md:p-8 pb-20 text-white">
      <header className="mb-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-4xl font-black tracking-tighter uppercase italic text-red-400 flex items-center gap-2"><Siren className="w-6 h-6 md:w-8 md:h-8" /> Ocorrências</h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Roubo, furto e suspeita · protocolo de atendimento</p>
        </div>
        <button onClick={abrirNova} className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-500 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest w-fit"><Plus size={14} /> Registrar ocorrência</button>
      </header>
      {aviso && <div className={`mb-4 rounded-xl border px-4 py-3 text-sm font-bold flex justify-between ${aviso.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}><span>{aviso.t}</span><button onClick={() => setAviso(null)}><X size={14} /></button></div>}

      {emAndamento.length > 0 && (
        <div className="mb-4 rounded-2xl border border-red-500/40 bg-red-500/10 p-4">
          <p className="text-[11px] font-black uppercase tracking-widest text-red-300 mb-2">{emAndamento.length} em andamento</p>
          <div className="flex flex-wrap gap-2">
            {emAndamento.map(o => (
              <button key={o.id} onClick={() => setAberta(o.id)} className="rounded-xl bg-red-600/20 border border-red-500/40 px-3 py-2 text-left">
                <p className="font-black">{veics[o.veiculo_id]?.placa || '—'} · {TIPOS[o.tipo] || o.tipo}</p>
                <p className="text-[11px] text-red-200">desde {fmtDataHora(o.aberta_em)}{o.origem === 'app' ? ' · aberta pelo cliente' : ''}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-[#0F172A] border border-white/10 rounded-2xl overflow-hidden">
        {lista.length === 0 ? <p className="text-sm text-slate-500 p-8 text-center">Nenhuma ocorrência registrada.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-[10px] uppercase text-slate-500 text-left"><th className="p-3">Veículo</th><th>Tipo</th><th>Aberta</th><th>Situação</th><th>B.O.</th></tr></thead>
            <tbody className="divide-y divide-white/5">
              {lista.map(o => (
                <tr key={o.id} onClick={() => setAberta(o.id)} className="cursor-pointer hover:bg-white/[0.03]">
                  <td className="p-3 font-black">{veics[o.veiculo_id]?.placa || '—'}</td>
                  <td>{TIPOS[o.tipo] || o.tipo}</td>
                  <td className="text-slate-400">{fmtDataHora(o.aberta_em)}</td>
                  <td><span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${o.status === 'aberta' ? 'text-red-300 border-red-500/40 bg-red-500/10' : o.status === 'recuperado' ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' : 'text-slate-400 border-white/10'}`}>{o.status === 'aberta' ? 'Em andamento' : o.status === 'recuperado' ? 'Recuperado' : 'Encerrada'}</span></td>
                  <td className="text-slate-400">{o.bo_numero || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {atual && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setAberta(null)}>
          <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-lg font-black uppercase">{veics[atual.veiculo_id]?.placa} · {TIPOS[atual.tipo]}</h2>
                <p className="text-xs text-slate-400">Aberta em {fmtDataHora(atual.aberta_em)} por {atual.aberta_por}{atual.bo_numero ? ` · B.O. ${atual.bo_numero}` : ''}</p>
              </div>
              <button onClick={() => setAberta(null)}><X size={18} /></button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/rastreio/veiculos/${atual.veiculo_id}`} className="inline-flex items-center gap-1 bg-white/5 border border-white/10 px-3 py-2 rounded-xl text-[11px] font-black uppercase"><ExternalLink size={12} /> Mapa ao vivo</Link>
              {atual.link_compartilhamento && (
                <>
                  <button onClick={() => navigator.clipboard?.writeText(atual.link_compartilhamento!).then(() => setAviso({ ok: true, t: 'Link copiado.' }))} className="inline-flex items-center gap-1 bg-white/5 border border-white/10 px-3 py-2 rounded-xl text-[11px] font-black uppercase"><Copy size={12} /> Link para a polícia</button>
                  <a href={`https://wa.me/?text=${encodeURIComponent(`Localização ao vivo do veículo ${veics[atual.veiculo_id]?.placa}: ${atual.link_compartilhamento}`)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 bg-emerald-600 px-3 py-2 rounded-xl text-[11px] font-black uppercase"><Send size={12} /> WhatsApp</a>
                </>
              )}
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">Linha do tempo</p>
              <ol className="space-y-2 border-l border-white/10 pl-4">
                {(atual.linha_tempo || []).map((p, i) => (
                  <li key={i} className="text-sm"><p className="text-[11px] text-slate-500">{fmtDataHora(p.em)} · {p.autor}</p><p>{p.texto}</p></li>
                ))}
              </ol>
            </div>
            {atual.status === 'aberta' && (
              <div className="space-y-2 border-t border-white/10 pt-4">
                <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2} placeholder="Anotar andamento (ex.: polícia acionada, viatura a caminho...)" className={inp} />
                <div className="flex gap-2">
                  <input value={bo} onChange={e => setBo(e.target.value)} placeholder="Nº do B.O." className={inp} />
                  <button disabled={ocupado || (!nota.trim() && !bo.trim())} onClick={() => acao({ acao: 'anotar', id: atual.id, texto: nota, bo }, 'Anotado.').then(() => { setNota(''); setBo(''); })} className="bg-white/10 border border-white/15 px-4 rounded-xl text-xs font-black uppercase disabled:opacity-40">Anotar</button>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button disabled={ocupado} onClick={() => confirm('Marcar o veículo como recuperado e encerrar?') && acao({ acao: 'encerrar', id: atual.id, status: 'recuperado' }, 'Ocorrência encerrada: recuperado.')} className="bg-emerald-600 rounded-xl py-3 text-xs font-black uppercase disabled:opacity-40 inline-flex items-center justify-center gap-1"><CheckCircle2 size={14} /> Recuperado</button>
                  <button disabled={ocupado} onClick={() => confirm('Encerrar a ocorrência sem recuperação?') && acao({ acao: 'encerrar', id: atual.id, status: 'encerrada' }, 'Ocorrência encerrada.')} className="bg-white/5 border border-white/10 rounded-xl py-3 text-xs font-black uppercase disabled:opacity-40">Encerrar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {nova && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => !ocupado && setNova(null)}>
          <div className="bg-[#0F172A] border border-red-500/30 rounded-3xl p-6 w-full max-w-md space-y-3" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-black uppercase text-red-300 flex items-center gap-2"><Siren size={18} /> Registrar ocorrência</h2>
            <select value={nova.veiculoId} onChange={e => setNova({ ...nova, veiculoId: e.target.value })} className={`${inp} [color-scheme:dark]`}>
              <option value="">Escolha o veículo</option>
              {todosVeics.map(v => <option key={v.id} value={v.id}>{v.placa}{v.descricao ? ` · ${v.descricao}` : ''}</option>)}
            </select>
            <select value={nova.tipo} onChange={e => setNova({ ...nova, tipo: e.target.value })} className={`${inp} [color-scheme:dark]`}>
              {Object.entries(TIPOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
            <textarea value={nova.descricao} onChange={e => setNova({ ...nova, descricao: e.target.value })} rows={3} placeholder="O que aconteceu, onde, quem avisou" className={inp} />
            {podeBloquear && (
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={nova.bloquear} onChange={e => setNova({ ...nova, bloquear: e.target.checked })} className="accent-red-500 w-4 h-4" /> Enviar bloqueio (só sai com o veículo parado ou devagar)</label>
            )}
            <p className="text-[11px] text-slate-400">Ao registrar: rastreador passa a mandar posição a cada 10 s, sai um link ao vivo de 72 h para polícia/seguradora e a central recebe o alarme.</p>
            <div className="flex gap-2">
              <button onClick={() => setNova(null)} disabled={ocupado} className="flex-1 bg-white/5 border border-white/10 rounded-xl py-3 text-xs font-black uppercase">Cancelar</button>
              <button disabled={ocupado || !nova.veiculoId} onClick={async () => { const r = await acao({ acao: 'abrir', ...nova }, 'Ocorrência registrada.'); if (r) { setNova(null); setAberta(r.id); } }}
                className="flex-1 bg-red-600 rounded-xl py-3 text-xs font-black uppercase disabled:opacity-40 inline-flex items-center justify-center gap-2">{ocupado && <Loader2 size={14} className="animate-spin" />} Registrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
