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
      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-[#241c14] flex items-center gap-2 mb-6" style={{ fontFamily: 'var(--font-argus-serif)' }}>
          <Car size={22} className="text-[#d9861c]" /> Vendas
        </h1>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white border border-[#e5e0d5] rounded-2xl p-4">
            <p className="text-[11px] font-bold text-[#9a958a] uppercase tracking-wide mb-1">No funil</p>
            <p className="text-xl font-bold text-[#1d6fd9]">{abertos}</p>
          </div>
          <div className="bg-white border border-[#e5e0d5] rounded-2xl p-4">
            <p className="text-[11px] font-bold text-[#9a958a] uppercase tracking-wide mb-1">Ganhos</p>
            <p className="text-xl font-bold text-[#1fa85a]">{ganhos}</p>
          </div>
          <div className="bg-white border border-[#e5e0d5] rounded-2xl p-4">
            <p className="text-[11px] font-bold text-[#9a958a] uppercase tracking-wide mb-1">Perdidos</p>
            <p className="text-xl font-bold text-red-600">{perdidos}</p>
          </div>
          <div className="bg-white border border-[#e5e0d5] rounded-2xl p-4">
            <p className="text-[11px] font-bold text-[#9a958a] uppercase tracking-wide mb-1">Valor vendido</p>
            <p className="text-xl font-bold text-[#241c14]">{fmtMoeda(valorGanho)}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex items-center bg-white border border-[#e5e0d5] rounded-xl px-3 py-2 gap-2 flex-1 min-w-[200px]">
            <Search size={14} className="text-[#9a958a]" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente, veículo ou vendedor..." className="flex-1 outline-none text-sm text-[#241c14] bg-transparent" />
          </div>
          {(['todos', 'aberto', 'ganho', 'perdido'] as const).map(s => (
            <button key={s} onClick={() => setFiltroStatus(s)} className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest border transition-all ${filtroStatus === s ? 'bg-[#d9861c] text-white border-[#d9861c]' : 'bg-white text-[#6b6862] border-[#e5e0d5] hover:border-[#d9861c]/40'}`}>
              {s === 'todos' ? 'Todos' : s === 'aberto' ? 'Aberto' : s === 'ganho' ? 'Ganho' : 'Perdido'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="p-8 flex justify-center"><Loader2 size={22} className="animate-spin text-[#d9861c]" /></div>
        ) : filtrados.length === 0 ? (
          <div className="bg-white border border-[#e5e0d5] rounded-2xl p-10 text-center">
            <p className="text-[#6b6862] font-semibold text-sm">Nenhum lead encontrado.</p>
          </div>
        ) : (
          <div className="bg-white border border-[#e5e0d5] rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e5e0d5] bg-[#faf7f2]">
                  <th className="text-left px-4 py-3 text-[11px] font-bold text-[#9a958a] uppercase">Cliente</th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold text-[#9a958a] uppercase">Veículo</th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold text-[#9a958a] uppercase">Vendedor</th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold text-[#9a958a] uppercase">Etapa</th>
                  <th className="text-right px-4 py-3 text-[11px] font-bold text-[#9a958a] uppercase">Valor</th>
                  <th className="text-right px-4 py-3 text-[11px] font-bold text-[#9a958a] uppercase">Data</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(l => (
                  <tr key={l.id} className="border-b border-[#f0ede6] last:border-0 hover:bg-[#faf7f2]">
                    <td className="px-4 py-3 font-bold text-[#241c14]">{l.empresa}</td>
                    <td className="px-4 py-3 text-[#6b6862]">{l.veiculo_referencia || '—'}</td>
                    <td className="px-4 py-3 text-[#6b6862]">{l.vendedor_nome || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${l.status === 'ganho' ? 'text-[#1fa85a] bg-[#d9f2e3] border-[#1fa85a]/20' : l.status === 'perdido' ? 'text-red-600 bg-red-50 border-red-200' : 'text-[#1d6fd9] bg-[#e8f0fd] border-[#1d6fd9]/20'}`}>
                        {l.status === 'ganho' ? 'Ganho' : l.status === 'perdido' ? 'Perdido' : ETAPA_LABEL[l.etapa] || 'Aberto'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-[#241c14]">{fmtMoeda(l.valor_total)}</td>
                    <td className="px-4 py-3 text-right text-[#9a958a] text-[12px]">{fmtData(l.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
