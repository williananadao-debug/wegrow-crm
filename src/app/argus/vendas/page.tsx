"use client";
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Loader2, Car, Search } from 'lucide-react';
import ArgusTopNav from '../ArgusTopNav';
import { fmtMoeda, fmtData } from '../shared';

type LeadVeiculo = {
  id: number;
  empresa: string;
  valor_total: number;
  status: string;
  etapa: number;
  veiculo_referencia: string | null;
  vendedor_nome: string | null;
  cidade: string | null;
  telefone: string | null;
  created_at: string;
};

const ETAPA_LABEL: Record<number, string> = { 0: 'Novo', 1: 'Contato', 2: 'Proposta', 3: 'Negociação' };

export default function ArgusVendasVeiculosPage() {
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const empresa = auth.empresa;

  const [leads, setLeads] = useState<LeadVeiculo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'aberto' | 'ganho' | 'perdido'>('todos');
  const [busca, setBusca] = useState('');

  useEffect(() => {
    if (!perfil?.empresa_id) return;
    setLoading(true);
    supabase.from('leads')
      .select('id, empresa, valor_total, status, etapa, veiculo_referencia, vendedor_nome, cidade, telefone, created_at')
      .eq('empresa_id', perfil.empresa_id)
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data }) => { setLeads((data as LeadVeiculo[]) || []); setLoading(false); });
  }, [perfil?.empresa_id]);

  const filtrados = leads.filter(l => {
    if (filtroStatus !== 'todos' && l.status !== filtroStatus) return false;
    if (busca.trim()) {
      const alvo = busca.toLowerCase();
      if (!l.empresa?.toLowerCase().includes(alvo) && !l.veiculo_referencia?.toLowerCase().includes(alvo) && !l.vendedor_nome?.toLowerCase().includes(alvo)) return false;
    }
    return true;
  });

  const abertos = leads.filter(l => l.status === 'aberto').length;
  const ganhos = leads.filter(l => l.status === 'ganho').length;
  const perdidos = leads.filter(l => l.status === 'perdido').length;
  const valorGanho = leads.filter(l => l.status === 'ganho').reduce((acc, l) => acc + Number(l.valor_total || 0), 0);

  return (
    <div>
      <ArgusTopNav nomeEmpresa={empresa?.nome} />
    <div className="p-4 md:p-8 pb-20 text-white">
      <h1 className="text-3xl font-black tracking-tighter uppercase italic text-white flex items-center gap-3 mb-6">
        <Car size={26} className="text-[#22C55E]" /> Vendas
      </h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-4">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">No funil</p>
          <p className="text-xl font-black text-blue-400">{abertos}</p>
        </div>
        <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-4">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Ganhos</p>
          <p className="text-xl font-black text-[#22C55E]">{ganhos}</p>
        </div>
        <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-4">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Perdidos</p>
          <p className="text-xl font-black text-red-400">{perdidos}</p>
        </div>
        <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-4">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Valor vendido</p>
          <p className="text-xl font-black text-white">{fmtMoeda(valorGanho)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center bg-[#0B1120] border border-white/10 rounded-xl px-3 py-2 gap-2 flex-1 min-w-[200px]">
          <Search size={14} className="text-slate-500" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente, veículo ou vendedor..." className="flex-1 outline-none text-sm text-white bg-transparent placeholder:text-slate-600" />
        </div>
        {(['todos', 'aberto', 'ganho', 'perdido'] as const).map(s => (
          <button key={s} onClick={() => setFiltroStatus(s)} className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest border transition-all ${filtroStatus === s ? 'bg-[#22C55E] text-[#0B1120] border-[#22C55E]' : 'bg-[#0B1120] text-slate-400 border-white/10 hover:border-[#22C55E]/40'}`}>
            {s === 'todos' ? 'Todos' : s === 'aberto' ? 'Aberto' : s === 'ganho' ? 'Ganho' : 'Perdido'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-8 flex justify-center"><Loader2 size={22} className="animate-spin text-[#22C55E]" /></div>
      ) : filtrados.length === 0 ? (
        <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-10 text-center">
          <p className="text-slate-500 font-semibold text-sm">Nenhum lead encontrado.</p>
        </div>
      ) : (
        <div className="bg-[#0B1120] border border-white/10 rounded-2xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02]">
                <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">Cliente</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">Veículo</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">Vendedor</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">Etapa</th>
                <th className="text-right px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">Valor</th>
                <th className="text-right px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">Data</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(l => (
                <tr key={l.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 font-bold text-white">{l.empresa}</td>
                  <td className="px-4 py-3 text-slate-400">{l.veiculo_referencia || '—'}</td>
                  <td className="px-4 py-3 text-slate-400">{l.vendedor_nome || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${l.status === 'ganho' ? 'text-[#22C55E] bg-[#22C55E]/10 border-[#22C55E]/20' : l.status === 'perdido' ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-blue-400 bg-blue-500/10 border-blue-500/20'}`}>
                      {l.status === 'ganho' ? 'Ganho' : l.status === 'perdido' ? 'Perdido' : ETAPA_LABEL[l.etapa] || 'Aberto'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-white">{fmtMoeda(l.valor_total)}</td>
                  <td className="px-4 py-3 text-right text-slate-500 text-[12px]">{fmtData(l.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
    </div>
  );
}
