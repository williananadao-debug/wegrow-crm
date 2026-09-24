"use client";
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Loader2, Activity, BarChart3, ArrowLeft, TrendingUp, TrendingDown, Wallet, PackageX, Flame } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { usePulseAccess } from '../../usePulseAccess';
import { ServicoConfig } from '../../shared';
import { curvaABC } from '@/lib/estoqueGestao';

type Movimentacao = { servico_id: number; quantidade: number; valor_unitario: number | null; created_at: string; tipo?: string | null; motivo?: string | null };
const MOTIVOS_PERDA: Record<string, string> = { perda: 'Perda / quebra', retrabalho: 'Retrabalho', amostra: 'Amostra / brinde', devolucao_fornecedor: 'Devolução ao fornecedor' };

const PERIODOS = [
  { id: '30d', label: '30 dias', dias: 30 }, { id: '90d', label: '90 dias', dias: 90 }, { id: '12m', label: '12 meses', dias: 365 },
] as const;

const fmtR$ = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function RelatorioEstoquePage() {
  const { authLoading, temPulse, perfil } = usePulseAccess();

  const [servicos, setServicos] = useState<ServicoConfig[]>([]);
  const [movimentos, setMovimentos] = useState<Movimentacao[]>([]);
  const [custosMedios, setCustosMedios] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<typeof PERIODOS[number]['id']>('90d');
  const [agora] = useState(() => Date.now());

  useEffect(() => {
    if (!perfil?.empresa_id) return;
    setLoading(true);
    Promise.all([
      supabase.from('servicos').select('*').eq('empresa_id', perfil.empresa_id).not('estoque', 'is', null),
      supabase.from('estoque_movimentacoes').select('servico_id, quantidade, valor_unitario, created_at, tipo, motivo').eq('empresa_id', perfil.empresa_id).limit(5000),
      supabase.from('pulse_estoque_custos').select('servico_id, custo_medio').eq('empresa_id', perfil.empresa_id),
    ]).then(([resServicos, resMov, resCustos]) => {
      if (resCustos?.data) setCustosMedios(Object.fromEntries(resCustos.data.filter((c: any) => c.custo_medio != null).map((c: any) => [c.servico_id, Number(c.custo_medio)])));
      if (resServicos.data) setServicos(resServicos.data as ServicoConfig[]);
      if (resMov.data) setMovimentos(resMov.data as Movimentacao[]);
      setLoading(false);
    });
  }, [perfil?.empresa_id]);

  const servicoPorId = useMemo(() => new Map(servicos.map(s => [s.id, s])), [servicos]);

  const dentroDoPeriodo = useMemo(() => {
    const dias = PERIODOS.find(p => p.id === periodo)!.dias;
    const corte = agora - dias * 86400000;
    return movimentos
      .filter(m => new Date(m.created_at).getTime() >= corte)
      // Esse relatório é só sobre estoque físico de verdade (matéria-prima/produto com
      // controle de quantidade) — "servicos" acima já vem filtrado por .not('estoque', 'is',
      // null). Sem esse mesmo filtro aqui, uma movimentação antiga de produto SOB ENCOMENDA
      // (ex: venda de trailer que teve NF vinculada por engano — bug corrigido em 7a842f2)
      // continuava contando como "vendido/consumido" nesse relatório pra sempre, mesmo depois
      // do produto voltar a ser sob encomenda (estoque=null) — inflava "Vendido" com valor de
      // venda avulsa (ex: R$ 229.900 de um trailer) que não é giro de estoque nenhum.
      .filter(m => servicoPorId.has(m.servico_id));
  }, [movimentos, periodo, agora, servicoPorId]);

  // custo médio das entradas quando existe; senão o custo cadastrado; senão o preço
  const custoDe = (s: ServicoConfig) => custosMedios[s.id] ?? s.preco_custo ?? s.preco ?? 0;

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

  // Curva ABC: valor consumido (saídas) no período — A = ~80% do valor, B = próximos 15%, C = resto
  const abc = useMemo(() => {
    const porItem = new Map<number, number>();
    for (const m of dentroDoPeriodo) {
      if (m.quantidade >= 0 || m.tipo === 'estorno') continue;
      const s = servicoPorId.get(m.servico_id);
      const valorUnit = m.valor_unitario ?? (s ? custoDe(s) : 0);
      porItem.set(m.servico_id, (porItem.get(m.servico_id) || 0) + Math.abs(m.quantidade) * valorUnit);
    }
    return curvaABC([...porItem.entries()].map(([id, valor]) => ({ servicoId: id, nome: servicoPorId.get(id)?.nome || `#${id}`, valor })));
  }, [dentroDoPeriodo, servicoPorId, custosMedios]);

  // Perdas e sobras: saídas que não são venda nem consumo de produção, por motivo
  const perdas = useMemo(() => {
    const porMotivo = new Map<string, { valor: number; qtd: number }>();
    for (const m of dentroDoPeriodo) {
      if (m.quantidade >= 0 || !m.motivo || !MOTIVOS_PERDA[m.motivo]) continue;
      const s = servicoPorId.get(m.servico_id);
      const valorUnit = m.valor_unitario ?? (s ? custoDe(s) : 0);
      const cur = porMotivo.get(m.motivo) || { valor: 0, qtd: 0 };
      cur.valor += Math.abs(m.quantidade) * valorUnit; cur.qtd += 1;
      porMotivo.set(m.motivo, cur);
    }
    return [...porMotivo.entries()].map(([motivo, v]) => ({ motivo, ...v })).sort((a, b) => b.valor - a.valor);
  }, [dentroDoPeriodo, servicoPorId, custosMedios]);

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

          <div className="bg-[#0F172A] border border-white/10 rounded-3xl overflow-hidden lg:col-span-2">
            <div className="p-4 border-b border-white/5 flex items-center justify-between gap-3 flex-wrap">
              <h3 className="font-black uppercase text-xs text-slate-300 tracking-widest">Curva ABC — valor consumido no período</h3>
              <div className="flex gap-3 text-[10px] font-black">
                {(['A', 'B', 'C'] as const).map(c => <span key={c} className={c === 'A' ? 'text-emerald-400' : c === 'B' ? 'text-amber-400' : 'text-slate-400'}>{c}: {abc.filter(x => x.classe === c).length} itens</span>)}
              </div>
            </div>
            {abc.length === 0 ? <p className="text-slate-500 text-xs text-center py-8">Sem consumo no período.</p> : (
              <div className="divide-y divide-white/5 max-h-[420px] overflow-y-auto">
                {abc.map(x => (
                  <div key={x.servicoId} className="flex items-center gap-3 px-4 py-2">
                    <span className={`w-6 h-6 rounded-md text-[10px] font-black flex items-center justify-center shrink-0 ${x.classe === 'A' ? 'bg-emerald-500/20 text-emerald-300' : x.classe === 'B' ? 'bg-amber-500/20 text-amber-300' : 'bg-white/10 text-slate-400'}`}>{x.classe}</span>
                    <p className="flex-1 min-w-0 text-white font-bold text-xs truncate">{x.nome}</p>
                    <span className="text-slate-500 text-[10px] w-14 text-right">{x.percentual.toFixed(1)}%</span>
                    <span className="text-slate-400 text-[10px] w-14 text-right">{x.acumulado.toFixed(0)}% acum.</span>
                    <span className="text-white font-black text-xs w-24 text-right tabular-nums">{fmtR$(x.valor)}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="px-4 py-3 border-t border-white/5 text-[10px] text-slate-500">A = os itens que somam ~80% do consumo (contar toda semana e nunca deixar faltar). B = próximos 15%. C = cauda longa (contagem menos frequente).</p>
          </div>

          <div className="bg-[#0F172A] border border-white/10 rounded-3xl overflow-hidden lg:col-span-2">
            <div className="p-4 border-b border-white/5"><h3 className="font-black uppercase text-xs text-slate-300 tracking-widest">Perdas e sobras no período</h3></div>
            {perdas.length === 0 ? <p className="text-slate-500 text-xs text-center py-8">Nenhuma perda, retrabalho ou amostra registrada. (Na Saída rápida, escolha o motivo pra aparecer aqui.)</p> : (
              <div className="divide-y divide-white/5">
                {perdas.map(x => (
                  <div key={x.motivo} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div><p className="text-white font-bold text-xs">{MOTIVOS_PERDA[x.motivo]}</p><p className="text-slate-600 text-[10px]">{x.qtd} saída(s)</p></div>
                    <span className="text-red-400 font-black text-xs">{fmtR$(x.valor)}</span>
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
