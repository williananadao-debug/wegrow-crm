"use client";
import { useState } from 'react';
import { Shield, Plus, Trash2, Loader2, MapPin, Crosshair, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Veiculo } from '../../shared';
import type { CercaMapa } from '../../MapaRastreio';

export type Cerca = CercaMapa & { ativo: boolean; dentro: boolean | null };

const RAIOS = [100, 300, 500, 1000, 3000, 10000];
const fmtRaio = (m: number) => (m >= 1000 ? `${m / 1000} km` : `${m} m`);

// Cercas virtuais: o servidor avisa (alerta no painel e no app) quando o veículo entra ou sai.
export default function Cercas({ v, cercas, onMudou, escolhendo, setEscolhendo, ponto, setPonto }: {
  v: Veiculo; cercas: Cerca[]; onMudou: () => void;
  escolhendo: boolean; setEscolhendo: (b: boolean) => void;
  ponto: { lat: number; lng: number } | null; setPonto: (p: { lat: number; lng: number } | null) => void;
}) {
  const [nome, setNome] = useState('');
  const [raio, setRaio] = useState(300);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const formAberto = ponto !== null || escolhendo;

  const usarPosicaoAtual = () => {
    if (v.ultima_lat == null) return;
    setPonto({ lat: v.ultima_lat, lng: v.ultima_lng! });
    setEscolhendo(false);
  };

  const salvar = async () => {
    if (!ponto || !nome.trim()) return;
    setSalvando(true); setErro('');
    const { error } = await supabase.from('rastreio_cercas').insert({
      empresa_id: v.empresa_id, veiculo_id: v.id, nome: nome.trim().slice(0, 60), lat: ponto.lat, lng: ponto.lng, raio_m: raio,
    });
    setSalvando(false);
    if (error) { setErro('Não deu para salvar a cerca.'); return; }
    setNome(''); setPonto(null); setEscolhendo(false);
    onMudou();
  };

  const alternar = async (c: Cerca) => {
    await supabase.from('rastreio_cercas').update({ ativo: !c.ativo, dentro: null }).eq('id', c.id);
    onMudou();
  };
  const excluir = async (c: Cerca) => {
    if (!confirm(`Excluir a cerca "${c.nome}"?`)) return;
    await supabase.from('rastreio_cercas').delete().eq('id', c.id);
    onMudou();
  };

  return (
    <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2"><Shield size={13} /> Cercas virtuais</p>
        {!formAberto && (
          <button onClick={() => { setEscolhendo(true); setPonto(null); }} className="text-[10px] font-black uppercase text-violet-300 flex items-center gap-1"><Plus size={12} /> Nova</button>
        )}
      </div>

      {formAberto && (
        <div className="mb-3 rounded-xl border border-violet-500/30 bg-violet-500/5 p-3 space-y-2">
          {!ponto ? (
            <>
              <p className="text-xs text-violet-200 flex items-center gap-1"><Crosshair size={13} /> Clique no mapa onde fica o centro da cerca</p>
              {v.ultima_lat != null && <button onClick={usarPosicaoAtual} className="text-[11px] font-black uppercase text-sky-400 flex items-center gap-1"><MapPin size={12} /> ou usar a posição atual do veículo</button>}
            </>
          ) : (
            <>
              <p className="text-[11px] text-slate-400">Centro: {ponto.lat.toFixed(5)}, {ponto.lng.toFixed(5)} <button onClick={() => { setPonto(null); setEscolhendo(true); }} className="text-sky-400 underline ml-1">trocar</button></p>
              <input autoFocus value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome (ex.: Casa, Empresa, Garagem)"
                className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-violet-400" />
              <div className="flex flex-wrap gap-1">
                {RAIOS.map(r => (
                  <button key={r} onClick={() => setRaio(r)} className={`px-2.5 py-1 rounded-full text-[11px] font-black border ${raio === r ? 'bg-violet-400 text-[#0B1120] border-violet-400' : 'border-white/10 text-slate-300'}`}>{fmtRaio(r)}</button>
                ))}
              </div>
            </>
          )}
          {erro && <p className="text-xs text-red-300">{erro}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={() => { setPonto(null); setEscolhendo(false); setNome(''); }} className="flex-1 bg-white/5 border border-white/10 rounded-lg py-2 text-[11px] font-black uppercase flex items-center justify-center gap-1"><X size={12} /> Cancelar</button>
            <button onClick={salvar} disabled={!ponto || !nome.trim() || salvando} className="flex-1 bg-violet-400 text-[#0B1120] rounded-lg py-2 text-[11px] font-black uppercase disabled:opacity-40 flex items-center justify-center gap-1">
              {salvando && <Loader2 size={12} className="animate-spin" />} Salvar cerca
            </button>
          </div>
        </div>
      )}

      {cercas.length === 0 && !formAberto ? (
        <p className="text-xs text-slate-500">Nenhuma cerca. Crie uma (ex.: casa ou empresa do cliente) para receber alerta quando o veículo sair ou chegar.</p>
      ) : (
        <ul className="divide-y divide-white/5 text-xs">
          {cercas.map(c => (
            <li key={c.id} className="py-2 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${c.ativo ? 'bg-violet-400' : 'bg-slate-600'}`} />
              <span className="flex-1 min-w-0">
                <span className={`font-bold ${c.ativo ? 'text-slate-200' : 'text-slate-500 line-through'}`}>{c.nome}</span>
                <span className="text-slate-500"> · {fmtRaio(c.raio_m)}{c.ativo && c.dentro != null ? ` · veículo ${c.dentro ? 'dentro' : 'fora'}` : ''}</span>
              </span>
              <button onClick={() => alternar(c)} className="text-[10px] font-black uppercase text-slate-400 hover:text-white">{c.ativo ? 'Pausar' : 'Ativar'}</button>
              <button onClick={() => excluir(c)} title="Excluir" className="p-1 text-slate-500 hover:text-red-400"><Trash2 size={13} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
