"use client";
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Loader2, Factory, Hammer, CheckCircle2, PackageCheck, AlertTriangle, TrendingUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { usePulseAccess } from '../../usePulseAccess';
import { etapasFabricacaoDe } from '../../shared';

type StatusProducao = 'em_producao' | 'concluida' | 'entregue';
type Producao = {
  id: number; lead_id?: number | null; produto_final_nome: string; quantidade_produzida: number; status: StatusProducao;
  previsao_entrega: string | null; etapa_fabricacao_idx: number; created_at: string;
};
type EventoEntrega = { producao_id: number; created_at: string };

const REFRESH_MS = 45000;

// Wallboard de TV pro chão de fábrica — sem sidebar/topbar (ver hasCustomShell em
// publicPages.ts), sem nenhum valor monetário (isso é assunto de Financeiro/Vendas, não
// de quadro de produtividade), fonte grande pra ler de longe, atualiza sozinho. Mostra o
// que interessa pra operação: quanto tá em cada etapa (gargalo LEAN), atrasos, e quanto
// foi entregue no período — não IDs de venda nem preço de nada.
export default function PainelProducaoPage() {
  const { authLoading, temPulse, perfil, empresa } = usePulseAccess();
  const ETAPAS_FABRICACAO = useMemo(() => etapasFabricacaoDe(empresa?.modulos), [empresa?.modulos]);

  const [producoes, setProducoes] = useState<Producao[]>([]);
  const [entregas, setEntregas] = useState<EventoEntrega[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientePorLead, setClientePorLead] = useState<Record<number, string>>({});
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [agora, setAgora] = useState(() => new Date());

  const carregar = useCallback(async () => {
    if (!perfil?.empresa_id) return;
    const desde30d = new Date(); desde30d.setDate(desde30d.getDate() - 30);
    const [{ data: producoesData }, { data: entregasData }] = await Promise.all([
      supabase.from('pulse_producoes')
        .select('id, lead_id, produto_final_nome, quantidade_produzida, status, previsao_entrega, etapa_fabricacao_idx, created_at')
        .neq('status', 'entregue').order('created_at', { ascending: false }).limit(200),
      supabase.from('pulse_producao_eventos')
        .select('producao_id, created_at').eq('tipo', 'status').ilike('texto', '%Entregue%')
        .gte('created_at', desde30d.toISOString()),
    ]);
    if (producoesData) setProducoes(producoesData as Producao[]);
    // nome do cliente dono de cada projeto (só o nome — sem valor nem ID de venda, que o painel de TV não mostra)
    const leadIds = [...new Set((producoesData || []).map((p: any) => p.lead_id).filter((x: any): x is number => !!x))];
    if (leadIds.length > 0) {
      const { data: leadsData } = await supabase.from('leads').select('id, empresa').in('id', leadIds);
      setClientePorLead(Object.fromEntries((leadsData || []).map((l: any) => [l.id, l.empresa])));
    }
    if (entregasData) setEntregas(entregasData as EventoEntrega[]);
    setAtualizadoEm(new Date());
    setLoading(false);
  }, [perfil?.empresa_id]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    const id = setInterval(carregar, REFRESH_MS);
    return () => clearInterval(id);
  }, [carregar]);
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const emProducao = producoes.filter(p => p.status === 'em_producao');
  const aguardandoEntrega = producoes.filter(p => p.status === 'concluida');
  const atrasadas = producoes.filter(p => p.previsao_entrega && new Date(p.previsao_entrega) < agora);

  const inicioHoje = new Date(agora); inicioHoje.setHours(0, 0, 0, 0);
  const inicioSemana = new Date(agora); inicioSemana.setDate(inicioSemana.getDate() - 7);
  const entreguesHoje = entregas.filter(e => new Date(e.created_at) >= inicioHoje).length;
  const entreguesSemana = entregas.filter(e => new Date(e.created_at) >= inicioSemana).length;
  const entreguesMes = entregas.length;

  const porEtapa = ETAPAS_FABRICACAO.map((nome, idx) => ({
    nome, quantidade: emProducao.filter(p => p.etapa_fabricacao_idx === idx).length,
  }));
  const maxEtapa = Math.max(1, ...porEtapa.map(e => e.quantidade));

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#0B1120] flex items-center justify-center">
        <Loader2 size={40} className="animate-spin text-slate-600" />
      </div>
    );
  }

  if (!temPulse) {
    return (
      <div className="min-h-screen bg-[#0B1120] flex items-center justify-center text-center p-8">
        <p className="text-slate-500 font-bold text-sm">O módulo Pulse não está ativo pra sua empresa ainda.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B1120] text-white p-8 md:p-12">
      <header className="flex items-center justify-between mb-10">
        <div className="flex items-center gap-4">
          <Factory size={44} className="text-[var(--cor-primaria)]" />
          <div>
            <h1 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter text-[var(--cor-primaria)]">Produtividade da Fábrica</h1>
            <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mt-1">{empresa?.nome || 'WeGrow'}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-3xl font-black tabular-nums">{agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
          <p className="text-slate-600 text-xs font-bold uppercase mt-1">{agora.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</p>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
        <div className="bg-[#0F172A] border border-amber-500/20 rounded-3xl p-6">
          <p className="text-amber-400 text-xs font-black uppercase tracking-widest flex items-center gap-1.5"><Hammer size={13} /> Em produção</p>
          <p className="text-6xl font-black text-white mt-2">{emProducao.length}</p>
        </div>
        <div className="bg-[#0F172A] border border-blue-500/20 rounded-3xl p-6">
          <p className="text-blue-400 text-xs font-black uppercase tracking-widest flex items-center gap-1.5"><CheckCircle2 size={13} /> Aguardando entrega</p>
          <p className="text-6xl font-black text-white mt-2">{aguardandoEntrega.length}</p>
        </div>
        <div className={`bg-[#0F172A] border rounded-3xl p-6 ${atrasadas.length > 0 ? 'border-red-500/40' : 'border-white/10'}`}>
          <p className={`text-xs font-black uppercase tracking-widest flex items-center gap-1.5 ${atrasadas.length > 0 ? 'text-red-400' : 'text-slate-500'}`}><AlertTriangle size={13} /> Atrasadas</p>
          <p className={`text-6xl font-black mt-2 ${atrasadas.length > 0 ? 'text-red-400' : 'text-white'}`}>{atrasadas.length}</p>
        </div>
        <div className="bg-[#0F172A] border border-[rgb(var(--cor-primaria-rgb)/30%)] rounded-3xl p-6">
          <p className="text-[var(--cor-primaria)] text-xs font-black uppercase tracking-widest flex items-center gap-1.5"><PackageCheck size={13} /> Entregues hoje</p>
          <p className="text-6xl font-black text-white mt-2">{entreguesHoje}</p>
        </div>
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6">
          <p className="text-slate-400 text-xs font-black uppercase tracking-widest flex items-center gap-1.5"><TrendingUp size={13} /> 7 dias / 30 dias</p>
          <p className="text-4xl font-black text-white mt-2">{entreguesSemana} <span className="text-slate-600 text-xl">/ {entreguesMes}</span></p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-7">
          <p className="text-slate-300 text-sm font-black uppercase tracking-widest mb-5">Onde está o gargalo agora</p>
          {porEtapa.every(e => e.quantidade === 0) ? (
            <p className="text-slate-600 text-sm font-bold py-8 text-center">Nada em produção no momento.</p>
          ) : (
            <div className="space-y-4">
              {porEtapa.map(e => (
                <div key={e.nome}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-white text-sm font-bold uppercase">{e.nome}</span>
                    <span className="text-amber-400 font-black text-lg">{e.quantidade}</span>
                  </div>
                  <div className="h-3 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${(e.quantidade / maxEtapa) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-7">
          <p className="text-slate-300 text-sm font-black uppercase tracking-widest mb-5">
            {atrasadas.length > 0 ? 'Atenção — prazo estourado' : 'Tudo dentro do prazo'}
          </p>
          {atrasadas.length === 0 ? (
            <p className="text-slate-600 text-sm font-bold py-8 text-center">Nenhuma produção atrasada agora. 🎉</p>
          ) : (
            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {atrasadas.map(p => (
                <div key={p.id} className="flex items-center justify-between gap-3 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3">
                  <div className="min-w-0">
                    {p.lead_id && clientePorLead[p.lead_id] && <p className="text-[var(--cor-primaria)] font-black text-xs uppercase tracking-wide truncate">{clientePorLead[p.lead_id]}</p>}
                    <p className="text-white font-bold text-sm truncate">{p.produto_final_nome} × {p.quantidade_produzida}</p>
                    <p className="text-red-300 text-xs font-bold">{p.status === 'em_producao' ? ETAPAS_FABRICACAO[p.etapa_fabricacao_idx] : 'Aguardando entrega'}</p>
                  </div>
                  <span className="text-red-400 font-black text-xs shrink-0">
                    prazo {new Date(p.previsao_entrega!).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {atualizadoEm && (
        <p className="text-slate-700 text-[10px] font-bold uppercase tracking-widest text-center mt-8">
          Atualizado às {atualizadoEm.toLocaleTimeString('pt-BR')} — atualiza sozinho a cada {REFRESH_MS / 1000}s
        </p>
      )}
    </div>
  );
}
