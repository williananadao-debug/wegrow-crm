"use client";
import { useCallback, useEffect, useState } from 'react';
import { Wrench, Plus, Check, Trash2, Loader2, Gauge, UserRound, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Veiculo } from '../../shared';

type Item = { id: string; nome: string; intervalo_km: number | null; intervalo_dias: number | null; ultima_km: number | null; ultima_em: string | null; ativo: boolean };
type Motorista = { id: string; nome: string; telefone: string | null };
type VeicExtra = { odometro_km: number; odometro_base_km: number; motorista_id: string | null };

const MODELOS = [
  { nome: 'Troca de óleo', km: 5000, dias: 180 },
  { nome: 'Revisão', km: 10000, dias: 365 },
  { nome: 'Pneus', km: 40000, dias: null },
  { nome: 'Licenciamento', km: null, dias: 365 },
];
const hoje = () => new Date().toLocaleDateString('en-CA');

// Hodômetro (km informado na instalação + km do rastreador), manutenção por km/data e motorista.
export default function Manutencao({ v }: { v: Veiculo }) {
  const [extra, setExtra] = useState<VeicExtra | null>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [indisponivel, setIndisponivel] = useState(false);
  const [form, setForm] = useState<{ nome: string; km: string; dias: string } | null>(null);
  const [ajusteOdo, setAjusteOdo] = useState<string | null>(null);
  const [novoMot, setNovoMot] = useState<{ nome: string; telefone: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const [{ data: ve, error }, { data: ms }, { data: mo }] = await Promise.all([
      supabase.from('rastreio_veiculos').select('odometro_km, odometro_base_km, motorista_id').eq('id', v.id).maybeSingle(),
      supabase.from('rastreio_manutencoes').select('id, nome, intervalo_km, intervalo_dias, ultima_km, ultima_em, ativo').eq('veiculo_id', v.id).order('created_at'),
      supabase.from('rastreio_motoristas').select('id, nome, telefone').eq('ativo', true).order('nome').limit(500),
    ]);
    if (error) { setIndisponivel(true); return; }
    setExtra(ve as VeicExtra); setItens((ms as Item[]) || []); setMotoristas((mo as Motorista[]) || []);
  }, [v.id]);
  useEffect(() => { void Promise.resolve().then(carregar); }, [carregar]);

  if (indisponivel || !extra) return null;
  const odo = Number(extra.odometro_km || 0);

  const salvarItem = async () => {
    if (!form?.nome.trim() || (!form.km && !form.dias)) return;
    setSalvando(true);
    await supabase.from('rastreio_manutencoes').insert({
      empresa_id: v.empresa_id, veiculo_id: v.id, nome: form.nome.trim().slice(0, 60),
      intervalo_km: form.km ? Number(form.km) : null, intervalo_dias: form.dias ? Number(form.dias) : null,
      ultima_km: odo, ultima_em: hoje(),
    });
    setSalvando(false); setForm(null); carregar();
  };
  const feito = async (m: Item) => {
    await supabase.from('rastreio_manutencoes').update({ ultima_km: odo, ultima_em: hoje(), avisado_em: null }).eq('id', m.id);
    carregar();
  };
  const excluir = async (m: Item) => {
    if (!confirm(`Excluir "${m.nome}"?`)) return;
    await supabase.from('rastreio_manutencoes').delete().eq('id', m.id);
    carregar();
  };
  const salvarOdo = async () => {
    const km = Number(String(ajusteOdo).replace(/\./g, '').replace(',', '.'));
    if (!(km >= 0)) return;
    await supabase.from('rastreio_veiculos').update({ odometro_base_km: km, odometro_base_em: hoje(), odometro_km: km }).eq('id', v.id);
    setAjusteOdo(null); carregar();
  };
  const trocarMotorista = async (id: string) => {
    await supabase.from('rastreio_veiculos').update({ motorista_id: id || null }).eq('id', v.id);
    carregar();
  };
  const criarMotorista = async () => {
    if (!novoMot?.nome.trim()) return;
    const { data } = await supabase.from('rastreio_motoristas').insert({
      empresa_id: v.empresa_id, cliente_id: v.cliente_id, nome: novoMot.nome.trim().slice(0, 80), telefone: novoMot.telefone.trim() || null,
    }).select('id').single();
    setNovoMot(null);
    if (data?.id) await trocarMotorista(data.id); else carregar();
  };

  const inp = 'bg-white/[0.03] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none';
  return (
    <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4 space-y-4">
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2"><Gauge size={13} /> Hodômetro</p>
          {ajusteOdo === null && <button onClick={() => setAjusteOdo(String(Math.round(odo)))} className="text-[10px] font-black uppercase text-sky-400">Ajustar</button>}
        </div>
        {ajusteOdo === null ? <p className="text-2xl font-black tabular-nums">{Math.round(odo).toLocaleString('pt-BR')} km</p> : (
          <div className="flex gap-2 items-center">
            <input autoFocus value={ajusteOdo} onChange={e => setAjusteOdo(e.target.value)} inputMode="numeric" className={`${inp} w-32`} placeholder="km do painel" />
            <button onClick={salvarOdo} className="px-3 py-1.5 rounded-lg bg-sky-400 text-[#0B1120] text-[10px] font-black uppercase">Salvar</button>
            <button onClick={() => setAjusteOdo(null)} className="text-slate-500"><X size={14} /></button>
          </div>
        )}
        <p className="text-[10px] text-slate-500">Informe o km do painel do veículo; daí em diante o rastreador soma sozinho (atualiza toda madrugada).</p>
      </div>

      <div>
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2 mb-1"><UserRound size={13} /> Motorista</p>
        {novoMot ? (
          <div className="flex flex-wrap gap-2">
            <input autoFocus value={novoMot.nome} onChange={e => setNovoMot({ ...novoMot, nome: e.target.value })} placeholder="Nome" className={`${inp} flex-1 min-w-[120px]`} />
            <input value={novoMot.telefone} onChange={e => setNovoMot({ ...novoMot, telefone: e.target.value })} placeholder="Telefone" className={`${inp} w-32`} />
            <button onClick={criarMotorista} className="px-3 py-1.5 rounded-lg bg-sky-400 text-[#0B1120] text-[10px] font-black uppercase">Salvar</button>
            <button onClick={() => setNovoMot(null)} className="text-slate-500"><X size={14} /></button>
          </div>
        ) : (
          <div className="flex gap-2">
            <select value={extra.motorista_id || ''} onChange={e => trocarMotorista(e.target.value)} className={`${inp} flex-1 [color-scheme:dark]`}>
              <option value="">Sem motorista definido</option>
              {motoristas.map(m => <option key={m.id} value={m.id}>{m.nome}{m.telefone ? ` · ${m.telefone}` : ''}</option>)}
            </select>
            <button onClick={() => setNovoMot({ nome: '', telefone: '' })} title="Novo motorista" className="px-2 rounded-lg bg-white/5 border border-white/10"><Plus size={13} /></button>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2"><Wrench size={13} /> Manutenção</p>
          {!form && <button onClick={() => setForm({ nome: '', km: '', dias: '' })} className="text-[10px] font-black uppercase text-sky-400 flex items-center gap-1"><Plus size={12} /> Nova</button>}
        </div>
        {form && (
          <div className="rounded-xl border border-white/10 p-3 mb-2 space-y-2">
            <div className="flex flex-wrap gap-1">
              {MODELOS.map(m => <button key={m.nome} onClick={() => setForm({ nome: m.nome, km: m.km ? String(m.km) : '', dias: m.dias ? String(m.dias) : '' })} className="px-2 py-1 rounded-full border border-white/10 text-[10px] font-black text-slate-300">{m.nome}</button>)}
            </div>
            <input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="O quê (ex.: troca de óleo)" className={`${inp} w-full`} />
            <div className="flex gap-2 items-center text-xs text-slate-400">
              a cada <input value={form.km} onChange={e => setForm({ ...form, km: e.target.value.replace(/\D/g, '') })} className={`${inp} w-20`} placeholder="km" /> km
              ou <input value={form.dias} onChange={e => setForm({ ...form, dias: e.target.value.replace(/\D/g, '') })} className={`${inp} w-16`} placeholder="dias" /> dias
            </div>
            <p className="text-[10px] text-slate-500">Conta a partir de hoje ({Math.round(odo).toLocaleString('pt-BR')} km). O alerta chega no painel e no celular do cliente.</p>
            <div className="flex gap-2">
              <button onClick={() => setForm(null)} className="flex-1 bg-white/5 border border-white/10 rounded-lg py-1.5 text-[10px] font-black uppercase">Cancelar</button>
              <button onClick={salvarItem} disabled={salvando || !form.nome.trim() || (!form.km && !form.dias)} className="flex-1 bg-sky-400 text-[#0B1120] rounded-lg py-1.5 text-[10px] font-black uppercase disabled:opacity-40 inline-flex items-center justify-center gap-1">{salvando && <Loader2 size={11} className="animate-spin" />} Salvar</button>
            </div>
          </div>
        )}
        {itens.length === 0 && !form ? <p className="text-xs text-slate-500">Nada programado. Ex.: troca de óleo a cada 5.000 km.</p> : (
          <ul className="space-y-2">
            {itens.map(m => {
              const kmFeito = m.ultima_km != null ? odo - Number(m.ultima_km) : 0;
              const diasFeito = m.ultima_em ? Math.floor((Date.parse(hoje()) - Date.parse(m.ultima_em)) / 86400_000) : 0;
              const pct = Math.max(m.intervalo_km ? kmFeito / m.intervalo_km : 0, m.intervalo_dias ? diasFeito / m.intervalo_dias : 0);
              const vencida = pct >= 1;
              return (
                <li key={m.id} className="text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`font-bold ${vencida ? 'text-red-400' : 'text-slate-200'}`}>{m.nome}{vencida ? ' · vencida' : ''}</span>
                    <span className="flex items-center gap-2">
                      <button onClick={() => feito(m)} title="Marcar como feita hoje" className="text-[10px] font-black uppercase text-emerald-400 flex items-center gap-1"><Check size={12} /> Feita</button>
                      <button onClick={() => excluir(m)} className="text-slate-500 hover:text-red-400"><Trash2 size={12} /></button>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 mt-1 overflow-hidden"><div className={`h-full ${vencida ? 'bg-red-500' : pct > 0.85 ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, pct * 100)}%` }} /></div>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {m.intervalo_km ? `${Math.round(kmFeito).toLocaleString('pt-BR')} de ${m.intervalo_km.toLocaleString('pt-BR')} km` : ''}
                    {m.intervalo_km && m.intervalo_dias ? ' · ' : ''}
                    {m.intervalo_dias ? `${diasFeito} de ${m.intervalo_dias} dias` : ''}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
