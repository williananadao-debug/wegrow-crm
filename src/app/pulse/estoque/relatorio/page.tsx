"use client";
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Loader2, Activity, BarChart3, ArrowLeft, TrendingUp, TrendingDown, Wallet, PackageX, Flame } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { usePulseAccess } from '../../usePulseAccess';
import { ServicoConfig } from '../../shared';

type Movimentacao = { servico_id: number; quantidade: number; valor_unitario: number | null; created_at: string };

const PERIODOS = [
  { id: '30d', label: '30 dias', dias: 30 }, { id: '90d', label: '90 dias', dias: 90 }, { id: '12m', label: '12 meses', dias: 365 },
] as const;

const fmtR$ = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function RelatorioEstoquePage() {
  const { authLoading, temPulse, perfil } = usePulseAccess();

  const [servicos, setServicos] = useState<ServicoConfig[]>([]);
  const [movimentos, setMovimentos] = useState<Movimentacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<typeof PERIODOS[number]['id']>('90d');
  const [agora] = useState(() => Date.now());

  useEffect(() => {
    if (!perfil?.empresa_id) return;
    setLoading(true);
    Promise.all([
      supabase.from('servicos').select('*').eq('empresa_id', perfil.empresa_id).not('estoque', 'is', null),
      supabase.from('estoque_movimentacoes').select('servico_id, quantidade, valor_unitario, created_at').eq('empresa_id', perfil.empresa_id).limit(5000),
    ]).then(([resServicos, resMov]) => {
      if (resServicos.data) setServicos(resServicos.data as ServicoConfig[]);
      if (resMov.data) setMovimentos(resMov.data as Movimentacao[]);
      setLoading(false);
    });
  }, [perfil?.empresa_id]);

  const servicoPorId = useMemo(() => new Map(servicos.map(s => [s.id, s])), [servicos]);

  const dentroDoPeriodo = useMemo(() => {
    const dias = PERIODOS.find(p => p.id === periodo)!.dias;
    const corte = agora - dias * 86400000;
    return movimentos.filter(m => new Date(m.created_at).getTime() >= corte);
  }, [movimentos, periodo, agora]);

  const custoDe = (s: ServicoConfig) => s.preco_custo ?? s.preco ?? 0;

  const kpis = useMemo(() => {
    const valorTotalEstoque = servicos.reduce((acc, s) => acc + (s.estoque || 0) * custoDe(s), 0);

    let compradoRs = 0, vendidoRs = 0;
    for (const m of dentroDoPeriodo) {
      const servico = servicoPorId.get(m.servico_id);
      const valorUnit = m.valor_unitario ?? (servico ? custoDe(servico) : 0);
      if (m.quantidade > 0) compradoRs += m.quantidade * valorUnit;
      else vendidoRs += Math.abs(m.quantidade) * valorUnit;
    }

    const saidaPorProduto = new Map<number, number>();
    for (const m of dentroDoPeriodo) {
      if (m.quantidade >= 0) continue;
      saidaPorProduto.set(m.servico_id, (saidaPorProduto.get(m.servico_id) || 0) + Math.abs(m.quantidade));
    }
    const parados = servicos.filter(s => (s.estoque || 0) > 0 && !saidaPorProduto.has(s.id));

    return { valorTotalEstoque, compradoRs, vendidoRs, paradosCount: parados.length, saidaPorProduto, parados };
  }, [servicos, dentroDoPeriodo, servicoPorId]);

  const maisGiram = useMemo(() => {
    return Array.from(kpis.saidaPorProduto.entries())
      .map(([servicoId, qtd]) => ({ servico: servicoPorId.get(servicoId), qtd }))
      .filter(x => x.servico)
      .sort((a, b) => b.qtd - a.qtd)
      .slice(0, 8);
  }, [kpis, servicoPorId]);

  const maiorValorParado = useMemo(() => {
    return [...servicos]
      .map(s => ({ servico: s, valor: (s.estoque || 0) * custoDe(s) }))
      .filter(x => x.valor > 0)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 8);
  }, [servicos]);

  const parados = useMemo(() => {
    return [...kpis.parados]
      .map(s => ({ servico: s, valor: (s.estoque || 0) * custoDe(s) }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 8);
  }, [kpis.parados]);

  const maxBarra = Math.max(kpis.compradoRs, kpis.vendidoRs, 1);

  if (authLoading) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;

  if (!temPulse) {
    return (
      <div className="p-4 md:p-8 pb-20 text-white">
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <Activity size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-sm">O módulo Pulse não está ativo pra sua empresa ainda.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 pb-20 text-white">
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/pulse/estoque" className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors">
            <ArrowLeft size={16} className="text-slate-400" />
          </Link>
          <div>
            <h1 className="text-3xl font-black tracking-tighter uppercase italic text-[var(--cor-primaria)] flex items-center gap-3">
              <BarChart3 size={28} /> Relatório de Estoque
            </h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Visão gerencial — o que tá parado e o que tá girando</p>
          </div>
        </div>
        <div className="flex gap-1 bg-black/30 border border-white/10 rounded-lg p-1 self-start md:self-auto">
          {PERIODOS.map(p => (
            <button key={p.id} onClick={() => setPeriodo(p.id)} className={`px-3 py-1.5 rounded text-[10px] font-black uppercase transition-all ${periodo === p.id ? 'bg-[var(--cor-primaria)] text-[#0B1120]' : 'text-slate-400 hover:text-white'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-slate-600" /></div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><Wallet size={10} /> Valor em estoque</p>
              <p className="text-xl font-black text-white mt-1">{fmtR$(kpis.valorTotalEstoque)}</p>
            </div>
            <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><TrendingDown size={10} /> Comprado no período</p>
              <p className="text-xl font-black text-purple-400 mt-1">{fmtR$(kpis.compradoRs)}</p>
            </div>
            <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><TrendingUp size={10} /> Vendido/consumido</p>
              <p className="text-xl font-black text-orange-400 mt-1">{fmtR$(kpis.vendidoRs)}</p>
            </div>
            <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><PackageX size={10} /> Produtos parados</p>
              <p className={`text-xl font-black mt-1 ${kpis.paradosCount > 0 ? 'text-amber-400' : 'text-white'}`}>{kpis.paradosCount}</p>
            </div>
          </div>

          <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-5">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Comprado × Vendido no período</p>
            <div className="space-y-2.5">
              <div className="flex items-center gap-3">
                <span className="w-20 text-[10px] font-black text-purple-400 uppercase shrink-0">Comprado</span>
                <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-400 rounded-full" style={{ width: `${(kpis.compradoRs / maxBarra) * 100}%` }} />
                </div>
                <span className="w-24 text-right text-xs font-black text-white shrink-0">{fmtR$(kpis.compradoRs)}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-20 text-[10px] font-black text-orange-400 uppercase shrink-0">Vendido</span>
                <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-400 rounded-full" style={{ width: `${(kpis.vendidoRs / maxBarra) * 100}%` }} />
                </div>
                <span className="w-24 text-right text-xs font-black text-white shrink-0">{fmtR$(kpis.vendidoRs)}</span>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-[#0F172A] border border-white/10 rounded-3xl overflow-hidden">
              <div className="p-4 border-b border-white/5 flex items-center gap-2">
                <Flame size={14} className="text-orange-400" />
                <h3 className="font-black uppercase text-xs text-slate-300 tracking-widest">Mais giram ({PERIODOS.find(p => p.id === periodo)!.label})</h3>
              </div>
              {maisGiram.length === 0 ? (
                <p className="text-slate-500 text-xs text-center py-8">Nenhuma saída registrada nesse período.</p>
              ) : (
                <div className="divide-y divide-white/5">
                  {maisGiram.map(x => (
                    <div key={x.servico!.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <p className="text-white font-bold text-xs truncate">{x.servico!.nome}</p>
                      <span className="text-orange-400 font-black text-xs shrink-0">{x.qtd} un</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-[#0F172A] border border-white/10 rounded-3xl overflow-hidden">
              <div className="p-4 border-b border-white/5 flex items-center gap-2">
                <Wallet size={14} className="text-slate-400" />
                <h3 className="font-black uppercase text-xs text-slate-300 tracking-widest">Maior valor parado</h3>
              </div>
              {maiorValorParado.length === 0 ? (
                <p className="text-slate-500 text-xs text-center py-8">Nenhum produto com estoque.</p>
              ) : (
                <div className="divide-y divide-white/5">
                  {maiorValorParado.map(x => (
                    <div key={x.servico.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="text-white font-bold text-xs truncate">{x.servico.nome}</p>
                        <p className="text-slate-600 text-[10px]">{x.servico.estoque} un</p>
                      </div>
                      <span className="text-white font-black text-xs shrink-0">{fmtR$(x.valor)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-[#0F172A] border border-white/10 rounded-3xl overflow-hidden">
            <div className="p-4 border-b border-white/5 flex items-center gap-2">
              <PackageX size={14} className="text-amber-400" />
              <h3 className="font-black uppercase text-xs text-slate-300 tracking-widest">Parados — sem nenhuma saída no período</h3>
            </div>
            {parados.length === 0 ? (
              <p className="text-slate-500 text-xs text-center py-8">Nenhum produto parado nesse período — tudo girando.</p>
            ) : (
              <div className="divide-y divide-white/5">
                {parados.map(x => (
                  <div key={x.servico.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-white font-bold text-xs truncate">{x.servico.nome}</p>
                      <p className="text-slate-600 text-[10px]">{x.servico.estoque} un parado</p>
                    </div>
                    <span className="text-amber-400 font-black text-xs shrink-0">{fmtR$(x.valor)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
