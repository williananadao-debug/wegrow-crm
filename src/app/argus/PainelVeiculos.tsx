"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Loader2, ChevronRight, Car, TrendingUp, Percent, DollarSign } from 'lucide-react';
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

      <header className="bg-[#171717] text-white">
        <div className="max-w-[1400px] mx-auto px-6 py-14">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/15 px-3 py-1 rounded-full mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-white" />
            <span className="text-[12px] font-bold uppercase tracking-widest text-white/70">Torre de Controle — Loja de Veículos</span>
          </div>
          <h1 className="text-5xl font-bold leading-[1.05] mb-4" style={{ fontFamily: 'var(--font-argus-serif)' }}>
            Controle total<br />das <em>Vendas</em>
          </h1>
          <p className="text-white/60 text-sm max-w-md mb-8">
            Funil de vendas, comissões e marketing consolidados — sem duplicar o estoque e a vitrine, que continuam no sistema de vocês.
          </p>
          <div className="flex flex-wrap gap-10">
            <div><p className="text-3xl font-bold">{abertos.length}</p><p className="text-[12px] text-white/50 font-bold uppercase tracking-wide mt-1">Leads no funil</p></div>
            <div><p className="text-3xl font-bold">{fmtMoedaCompacta(valorVendidoMes)}</p><p className="text-[12px] text-white/50 font-bold uppercase tracking-wide mt-1">Vendido este mês</p></div>
            <div><p className="text-3xl font-bold">{taxaConversao}%</p><p className="text-[12px] text-white/50 font-bold uppercase tracking-wide mt-1">Taxa de conversão</p></div>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-10">
          <Link href="/argus/vendas" className="bg-white border border-[#e0e0e0] hover:border-[#171717]/40 rounded-2xl p-5 transition-all flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-[#171717] flex items-center gap-2"><Car size={16} className="text-[#171717]" /> Vendas</p>
              <p className="text-[12px] text-[#8a8a8a] font-semibold mt-1">{leads.length} lead(s) este mês</p>
            </div>
            <ChevronRight size={16} className="text-[#c9c9c9]" />
          </Link>
          <Link href="/argus/comissoes" className="bg-white border border-[#e0e0e0] hover:border-[#171717]/40 rounded-2xl p-5 transition-all flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-[#171717] flex items-center gap-2"><Percent size={16} className="text-[#171717]" /> Comissões</p>
              <p className="text-[12px] text-[#8a8a8a] font-semibold mt-1">{ganhos.length} venda(s) fechada(s)</p>
            </div>
            <ChevronRight size={16} className="text-[#c9c9c9]" />
          </Link>
          <Link href="/argus/financeiro-veiculos" className="bg-white border border-[#e0e0e0] hover:border-[#171717]/40 rounded-2xl p-5 transition-all flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-[#171717] flex items-center gap-2"><DollarSign size={16} className="text-[#171717]" /> Gestão Financeira</p>
              <p className="text-[12px] text-[#8a8a8a] font-semibold mt-1">Custo, margem e lucro por veículo</p>
            </div>
            <ChevronRight size={16} className="text-[#c9c9c9]" />
          </Link>
          <Link href="/argus/marketing" className="bg-white border border-[#e0e0e0] hover:border-[#171717]/40 rounded-2xl p-5 transition-all flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-[#171717] flex items-center gap-2"><TrendingUp size={16} className="text-[#171717]" /> Marketing</p>
              <p className="text-[12px] text-[#8a8a8a] font-semibold mt-1">Redes sociais da loja</p>
            </div>
            <ChevronRight size={16} className="text-[#c9c9c9]" />
          </Link>
        </div>

        <div className="flex items-center justify-between mb-4">
          <p className="text-[13px] font-bold text-[#8a8a8a] uppercase tracking-widest">Movimentação recente</p>
          <Link href="/argus/vendas" className="text-[13px] font-bold text-[#171717] flex items-center gap-1">Ver tudo <ChevronRight size={12} /></Link>
        </div>

        {loading ? (
          <div className="p-8 flex justify-center"><Loader2 size={22} className="animate-spin text-[#171717]" /></div>
        ) : recentes.length === 0 ? (
          <div className="bg-white border border-[#e0e0e0] rounded-2xl p-10 text-center">
            <p className="text-[#5c5c5c] font-semibold text-sm">Nenhum lead registrado este mês ainda.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentes.map(l => (
              <div key={l.id} className="bg-white border border-[#e0e0e0] rounded-xl p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#171717] truncate">{l.empresa}</p>
                  <p className="text-[12px] text-[#8a8a8a] font-semibold truncate">{l.veiculo_referencia || 'Sem veículo informado'} · {l.vendedor_nome || 'Sem vendedor'}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm font-bold text-[#171717]">{fmtMoeda(l.valor_total)}</span>
                  <span className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded-full border ${l.status === 'ganho' ? 'text-[#1fa85a] bg-[#d9f2e3] border-[#1fa85a]/20' : l.status === 'perdido' ? 'text-red-600 bg-red-50 border-red-200' : 'text-[#1d6fd9] bg-[#e8f0fd] border-[#1d6fd9]/20'}`}>
                    {l.status === 'ganho' ? 'Ganho' : l.status === 'perdido' ? 'Perdido' : 'Aberto'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
