"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Loader2, ChevronRight, Car, TrendingUp, Percent } from 'lucide-react';
import ArgusTopNav from './ArgusTopNav';
import { fmtMoeda, fmtMoedaCompacta } from './shared';

type LeadVeiculo = {
  id: number;
  empresa: string;
  valor_total: number;
  status: string;
  etapa: number;
  veiculo_referencia: string | null;
  vendedor_nome: string | null;
  created_at: string;
};

export default function ArgusPainelVeiculos() {
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const empresa = auth.empresa;

  const [leads, setLeads] = useState<LeadVeiculo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!perfil?.empresa_id) return;
    const hoje = new Date();
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString();
    supabase.from('leads')
      .select('id, empresa, valor_total, status, etapa, veiculo_referencia, vendedor_nome, created_at')
      .eq('empresa_id', perfil.empresa_id)
      .gte('created_at', inicioMes)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setLeads((data as LeadVeiculo[]) || []); setLoading(false); });
  }, [perfil?.empresa_id]);

  const abertos = leads.filter(l => l.status === 'aberto');
  const ganhos = leads.filter(l => l.status === 'ganho');
  const perdidos = leads.filter(l => l.status === 'perdido');
  const valorVendidoMes = ganhos.reduce((acc, l) => acc + Number(l.valor_total || 0), 0);
  const finalizados = ganhos.length + perdidos.length;
  const taxaConversao = finalizados > 0 ? Math.round((ganhos.length / finalizados) * 100) : 0;
  const recentes = [...leads].slice(0, 8);

  return (
    <div>
      <ArgusTopNav nomeEmpresa={empresa?.nome} />
    <div className="p-4 md:p-8 pb-20 text-white">
      <header className="mb-8">
        <h1 className="text-3xl font-black tracking-tighter uppercase italic text-white">
          Torre de Controle — <em className="text-[#22C55E] not-italic">Vendas</em>
        </h1>
        <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Funil, comissões e marketing consolidados</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-5">
          <p className="text-3xl font-black text-white">{abertos.length}</p>
          <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wide mt-1">Leads no funil</p>
        </div>
        <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-5">
          <p className="text-3xl font-black text-[#22C55E]">{fmtMoedaCompacta(valorVendidoMes)}</p>
          <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wide mt-1">Vendido este mês</p>
        </div>
        <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-5">
          <p className="text-3xl font-black text-white">{taxaConversao}%</p>
          <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wide mt-1">Taxa de conversão</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        <Link href="/argus/vendas" className="bg-[#0B1120] border border-white/10 hover:border-[#22C55E]/40 rounded-2xl p-5 transition-all flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-white flex items-center gap-2"><Car size={16} className="text-[#22C55E]" /> Vendas</p>
            <p className="text-[12px] text-slate-500 font-semibold mt-1">{leads.length} lead(s) este mês</p>
          </div>
          <ChevronRight size={16} className="text-slate-600" />
        </Link>
        <Link href="/argus/comissoes" className="bg-[#0B1120] border border-white/10 hover:border-[#22C55E]/40 rounded-2xl p-5 transition-all flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-white flex items-center gap-2"><Percent size={16} className="text-[#22C55E]" /> Comissões</p>
            <p className="text-[12px] text-slate-500 font-semibold mt-1">{ganhos.length} venda(s) fechada(s)</p>
          </div>
          <ChevronRight size={16} className="text-slate-600" />
        </Link>
        <Link href="/argus/marketing" className="bg-[#0B1120] border border-white/10 hover:border-[#22C55E]/40 rounded-2xl p-5 transition-all flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-white flex items-center gap-2"><TrendingUp size={16} className="text-[#22C55E]" /> Marketing</p>
            <p className="text-[12px] text-slate-500 font-semibold mt-1">Redes sociais da loja</p>
          </div>
          <ChevronRight size={16} className="text-slate-600" />
        </Link>
      </div>

      <div className="flex items-center justify-between mb-4">
        <p className="text-[13px] font-bold text-slate-500 uppercase tracking-widest">Movimentação recente</p>
        <Link href="/argus/vendas" className="text-[13px] font-bold text-[#22C55E] flex items-center gap-1">Ver tudo <ChevronRight size={12} /></Link>
      </div>

      {loading ? (
        <div className="p-8 flex justify-center"><Loader2 size={22} className="animate-spin text-[#22C55E]" /></div>
      ) : recentes.length === 0 ? (
        <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-10 text-center">
          <p className="text-slate-500 font-semibold text-sm">Nenhum lead registrado este mês ainda.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {recentes.map(l => (
            <div key={l.id} className="bg-[#0B1120] border border-white/10 rounded-xl p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">{l.empresa}</p>
                <p className="text-[12px] text-slate-500 font-semibold truncate">{l.veiculo_referencia || 'Sem veículo informado'} · {l.vendedor_nome || 'Sem vendedor'}</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-sm font-bold text-white">{fmtMoeda(l.valor_total)}</span>
                <span className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded-full border ${l.status === 'ganho' ? 'text-[#22C55E] bg-[#22C55E]/10 border-[#22C55E]/20' : l.status === 'perdido' ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-blue-400 bg-blue-500/10 border-blue-500/20'}`}>
                  {l.status === 'ganho' ? 'Ganho' : l.status === 'perdido' ? 'Perdido' : 'Aberto'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    </div>
  );
}
