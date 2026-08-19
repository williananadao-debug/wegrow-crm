"use client";
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, X, Loader2, DollarSign, AlertTriangle, TrendingUp, CheckCircle2, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import AdvocaciaTopNav from '../AdvocaciaTopNav';
import { fmtMoeda, fmtMoedaCompacta, fmtData, TIPO_HONORARIO_LABELS } from '../shared';

type Processo = {
  id: number;
  cliente_nome: string;
  area_juridica: string;
  advogado_responsavel_id: string | null;
  tipo_honorario: 'fixo' | 'recorrente' | 'exito' | 'hora';
  status: string;
};

type Lancamento = {
  id: number;
  titulo: string;
  valor: number;
  tipo: 'entrada' | 'saida';
  status: 'pendente' | 'pago';
  data_vencimento: string;
  data_pagamento: string | null;
  processo_id: number | null;
};

type PerfilOpcao = { id: string; nome: string };

const MESES_LABEL = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export default function AdvocaciaFinanceiroPage() {
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  const nomeEmpresa = empresa?.nome;

  const [processos, setProcessos] = useState<Processo[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [advogados, setAdvogados] = useState<PerfilOpcao[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ processo_id: '', titulo: '', valor: '', data_vencimento: new Date().toISOString().slice(0, 10), recorrente: false });

  const carregar = useCallback(async () => {
    if (!perfil?.empresa_id) return;
    setLoading(true);
    const [{ data: procData }, { data: lancData }, { data: perfisData }] = await Promise.all([
      supabase.from('advocacia_processos').select('id, cliente_nome, area_juridica, advogado_responsavel_id, tipo_honorario, status').eq('empresa_id', perfil.empresa_id),
      supabase.from('lancamentos').select('id, titulo, valor, tipo, status, data_vencimento, data_pagamento, processo_id').eq('empresa_id', perfil.empresa_id).not('processo_id', 'is', null).order('data_vencimento', { ascending: false }),
      supabase.from('profiles').select('id, nome').eq('empresa_id', perfil.empresa_id),
    ]);
    setProcessos((procData as Processo[]) || []);
    setLancamentos((lancData as Lancamento[]) || []);
    setAdvogados((perfisData as PerfilOpcao[]) || []);
    setLoading(false);
  }, [perfil?.empresa_id]);

  useEffect(() => { carregar(); }, [carregar]);

  const processoPorId = useMemo(() => new Map(processos.map(p => [p.id, p])), [processos]);
  const nomeAdvogado = (id?: string | null) => advogados.find(a => a.id === id)?.nome || 'Sem responsável';
  const hoje = new Date().toISOString().slice(0, 10);

  const honorarios = useMemo(() => lancamentos.filter(l => l.tipo === 'entrada'), [lancamentos]);
  const contasAReceber = useMemo(() => honorarios.filter(l => l.status === 'pendente'), [honorarios]);
  const inadimplentes = useMemo(() => contasAReceber.filter(l => l.data_vencimento < hoje), [contasAReceber, hoje]);
  const recebidos = useMemo(() => honorarios.filter(l => l.status === 'pago'), [honorarios]);

  const totalAReceber = contasAReceber.reduce((s, l) => s + Number(l.valor || 0), 0);
  const totalInadimplente = inadimplentes.reduce((s, l) => s + Number(l.valor || 0), 0);
  const totalRecebidoMes = recebidos.filter(l => (l.data_pagamento || '').slice(0, 7) === hoje.slice(0, 7)).reduce((s, l) => s + Number(l.valor || 0), 0);

  const fluxoCaixa = useMemo(() => {
    const hojeD = new Date();
    const meses: { label: string; total: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hojeD.getFullYear(), hojeD.getMonth() - i, 1);
      const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const total = recebidos.filter(l => (l.data_pagamento || '').slice(0, 7) === chave).reduce((s, l) => s + Number(l.valor || 0), 0);
      meses.push({ label: `${MESES_LABEL[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`, total });
    }
    return meses;
  }, [recebidos]);
  const maxFluxo = Math.max(1, ...fluxoCaixa.map(m => m.total));

  const faturamentoPorAdvogado = useMemo(() => {
    const mapa = new Map<string, number>();
    recebidos.forEach(l => {
      const proc = l.processo_id ? processoPorId.get(l.processo_id) : null;
      const chave = nomeAdvogado(proc?.advogado_responsavel_id);
      mapa.set(chave, (mapa.get(chave) || 0) + Number(l.valor || 0));
    });
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  }, [recebidos, processoPorId, advogados]);

  const faturamentoPorArea = useMemo(() => {
    const mapa = new Map<string, number>();
    recebidos.forEach(l => {
      const proc = l.processo_id ? processoPorId.get(l.processo_id) : null;
      const chave = proc?.area_juridica || 'Outro';
      mapa.set(chave, (mapa.get(chave) || 0) + Number(l.valor || 0));
    });
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  }, [recebidos, processoPorId]);

  const ltvPorCliente = useMemo(() => {
    const mapa = new Map<string, number>();
    recebidos.forEach(l => {
      const proc = l.processo_id ? processoPorId.get(l.processo_id) : null;
      const chave = proc?.cliente_nome || 'Sem cliente';
      mapa.set(chave, (mapa.get(chave) || 0) + Number(l.valor || 0));
    });
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [recebidos, processoPorId]);

  const marcarPago = async (id: number) => {
    await supabase.from('lancamentos').update({ status: 'pago', data_pagamento: hoje }).eq('id', id);
    carregar();
  };

  const salvarHonorario = async () => {
    if (!form.processo_id || !form.titulo.trim() || !perfil?.empresa_id) return;
    setSalvando(true);
    await supabase.from('lancamentos').insert([{
      empresa_id: perfil.empresa_id,
      processo_id: Number(form.processo_id),
      titulo: form.titulo.trim(),
      valor: Number(form.valor) || 0,
      tipo: 'entrada',
      categoria: 'Honorário',
      status: 'pendente',
      data_vencimento: form.data_vencimento,
      recorrente: form.recorrente,
    }]);
    setSalvando(false);
    setModalAberto(false);
    setForm({ processo_id: '', titulo: '', valor: '', data_vencimento: new Date().toISOString().slice(0, 10), recorrente: false });
    carregar();
  };

  return (
    <div>
      <AdvocaciaTopNav nomeEmpresa={nomeEmpresa} />
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[22px] font-bold text-[#241c14]" style={{ fontFamily: 'var(--font-advocacia-serif)' }}>Financeiro</h1>
            <p className="text-[13px] text-[#6b6862] mt-1">Honorários, contas a receber e faturamento por advogado e área.</p>
          </div>
          <button onClick={() => setModalAberto(true)} className="flex items-center gap-2 bg-[#241c14] hover:bg-[#3a2c1c] text-white px-4 py-2.5 rounded-lg text-[14px] font-semibold transition-all">
            <Plus size={16} /> Novo honorário
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-[#d9861c]" /></div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-white border border-[#e5e0d5] rounded-2xl p-5">
                <p className="text-[11px] font-bold uppercase text-[#9a958a] flex items-center gap-1.5"><TrendingUp size={12} /> Recebido este mês</p>
                <p className="text-[24px] font-bold text-[#241c14] mt-1 font-mono">{fmtMoeda(totalRecebidoMes)}</p>
              </div>
              <div className="bg-white border border-[#e5e0d5] rounded-2xl p-5">
                <p className="text-[11px] font-bold uppercase text-[#9a958a] flex items-center gap-1.5"><Clock size={12} /> Contas a receber</p>
                <p className="text-[24px] font-bold text-[#241c14] mt-1 font-mono">{fmtMoeda(totalAReceber)}</p>
                <p className="text-[11px] text-[#9a958a] mt-0.5">{contasAReceber.length} lançamento(s)</p>
              </div>
              <div className="bg-white border border-[#f5c6c6] rounded-2xl p-5">
                <p className="text-[11px] font-bold uppercase text-[#d63f3f] flex items-center gap-1.5"><AlertTriangle size={12} /> Inadimplência</p>
                <p className="text-[24px] font-bold text-[#d63f3f] mt-1 font-mono">{fmtMoeda(totalInadimplente)}</p>
                <p className="text-[11px] text-[#9a958a] mt-0.5">{inadimplentes.length} vencido(s)</p>
              </div>
            </div>

            <div className="bg-white border border-[#e5e0d5] rounded-2xl p-5 mb-6">
              <p className="text-[13px] font-bold text-[#241c14] mb-4">Fluxo de caixa — últimos 6 meses</p>
              <div className="flex items-end gap-3 h-32">
                {fluxoCaixa.map(m => (
                  <div key={m.label} className="flex-1 flex flex-col items-center justify-end gap-1.5">
                    <span className="text-[10px] font-mono text-[#6b6862]">{fmtMoedaCompacta(m.total)}</span>
                    <div className="w-full bg-[#fdf0d4] rounded-t-md" style={{ height: `${Math.max(4, (m.total / maxFluxo) * 90)}px` }} />
                    <span className="text-[10px] text-[#9a958a]">{m.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-white border border-[#e5e0d5] rounded-2xl p-5">
                <p className="text-[12px] font-bold uppercase text-[#9a958a] mb-3">Faturamento por advogado</p>
                <div className="space-y-2">
                  {faturamentoPorAdvogado.length === 0 && <p className="text-[12px] text-[#9a958a]">Sem dados ainda.</p>}
                  {faturamentoPorAdvogado.map(([nome, total]) => (
                    <div key={nome} className="flex items-center justify-between text-[13px]">
                      <span className="text-[#241c14]">{nome}</span>
                      <span className="font-mono font-semibold text-[#d9861c]">{fmtMoeda(total)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white border border-[#e5e0d5] rounded-2xl p-5">
                <p className="text-[12px] font-bold uppercase text-[#9a958a] mb-3">Faturamento por área jurídica</p>
                <div className="space-y-2">
                  {faturamentoPorArea.length === 0 && <p className="text-[12px] text-[#9a958a]">Sem dados ainda.</p>}
                  {faturamentoPorArea.map(([area, total]) => (
                    <div key={area} className="flex items-center justify-between text-[13px]">
                      <span className="text-[#241c14]">{area}</span>
                      <span className="font-mono font-semibold text-[#d9861c]">{fmtMoeda(total)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white border border-[#e5e0d5] rounded-2xl p-5">
                <p className="text-[12px] font-bold uppercase text-[#9a958a] mb-3">LTV por cliente (top 8)</p>
                <div className="space-y-2">
                  {ltvPorCliente.length === 0 && <p className="text-[12px] text-[#9a958a]">Sem dados ainda.</p>}
                  {ltvPorCliente.map(([cliente, total]) => (
                    <div key={cliente} className="flex items-center justify-between text-[13px]">
                      <span className="text-[#241c14] truncate">{cliente}</span>
                      <span className="font-mono font-semibold text-[#d9861c] flex-shrink-0 ml-2">{fmtMoeda(total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white border border-[#e5e0d5] rounded-2xl overflow-hidden">
              <p className="text-[13px] font-bold text-[#241c14] px-5 pt-5 pb-3">Honorários</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-[#e5e0d5] text-left text-[11px] uppercase text-[#9a958a]">
                      <th className="px-5 py-2 font-semibold">Cliente</th>
                      <th className="px-5 py-2 font-semibold">Título</th>
                      <th className="px-5 py-2 font-semibold text-right">Valor</th>
                      <th className="px-5 py-2 font-semibold">Vencimento</th>
                      <th className="px-5 py-2 font-semibold">Status</th>
                      <th className="px-5 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {honorarios.map(l => {
                      const proc = l.processo_id ? processoPorId.get(l.processo_id) : null;
                      const vencido = l.status === 'pendente' && l.data_vencimento < hoje;
                      return (
                        <tr key={l.id} className="border-b border-[#f0ede6] last:border-0">
                          <td className="px-5 py-2.5 text-[#241c14] font-medium">{proc?.cliente_nome || '—'}</td>
                          <td className="px-5 py-2.5 text-[#6b6862]">{l.titulo}</td>
                          <td className="px-5 py-2.5 text-right font-mono">{fmtMoeda(l.valor)}</td>
                          <td className={`px-5 py-2.5 ${vencido ? 'text-[#d63f3f] font-semibold' : 'text-[#6b6862]'}`}>{fmtData(l.data_vencimento)}</td>
                          <td className="px-5 py-2.5">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${l.status === 'pago' ? 'bg-[#d9f2e3] text-[#1fa85a]' : vencido ? 'bg-[#fce8e8] text-[#d63f3f]' : 'bg-[#fdf0d4] text-[#d9861c]'}`}>
                              {l.status === 'pago' ? 'Pago' : vencido ? 'Vencido' : 'Pendente'}
                            </span>
                          </td>
                          <td className="px-5 py-2.5 text-right">
                            {l.status === 'pendente' && (
                              <button onClick={() => marcarPago(l.id)} className="text-[11px] font-semibold text-[#1fa85a] hover:underline flex items-center gap-1 ml-auto">
                                <CheckCircle2 size={12} /> Marcar pago
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {honorarios.length === 0 && (
                      <tr><td colSpan={6} className="px-5 py-8 text-center text-[#9a958a] text-[13px]">Nenhum honorário lançado ainda.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {modalAberto && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setModalAberto(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[16px] font-bold text-[#241c14] flex items-center gap-2"><DollarSign size={16} className="text-[#d9861c]" /> Novo honorário</h2>
              <button onClick={() => setModalAberto(false)} className="text-[#9a958a] hover:text-[#241c14]"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold uppercase text-[#9a958a]">Processo / cliente</label>
                <select value={form.processo_id} onChange={e => setForm(f => ({ ...f, processo_id: e.target.value }))}
                  className="w-full mt-1 border border-[#e5e0d5] rounded-lg px-3 py-2 text-[14px] focus:outline-none focus:border-[#d9861c] bg-white">
                  <option value="">Selecione...</option>
                  {processos.map(p => <option key={p.id} value={p.id}>{p.cliente_nome} — {TIPO_HONORARIO_LABELS[p.tipo_honorario]}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase text-[#9a958a]">Título</label>
                <input value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                  className="w-full mt-1 border border-[#e5e0d5] rounded-lg px-3 py-2 text-[14px] focus:outline-none focus:border-[#d9861c]" placeholder="Ex: Honorário mensal — Ago/26" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold uppercase text-[#9a958a]">Valor</label>
                  <input type="number" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
                    className="w-full mt-1 border border-[#e5e0d5] rounded-lg px-3 py-2 text-[14px] focus:outline-none focus:border-[#d9861c]" placeholder="0,00" />
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase text-[#9a958a]">Vencimento</label>
                  <input type="date" value={form.data_vencimento} onChange={e => setForm(f => ({ ...f, data_vencimento: e.target.value }))}
                    className="w-full mt-1 border border-[#e5e0d5] rounded-lg px-3 py-2 text-[14px] focus:outline-none focus:border-[#d9861c]" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-[13px] text-[#6b6862]">
                <input type="checkbox" checked={form.recorrente} onChange={e => setForm(f => ({ ...f, recorrente: e.target.checked }))} />
                Recorrente (repete todo mês)
              </label>
            </div>
            <button onClick={salvarHonorario} disabled={salvando || !form.processo_id || !form.titulo.trim()}
              className="w-full mt-5 bg-[#d9861c] hover:bg-[#c47818] disabled:opacity-50 text-white py-2.5 rounded-lg text-[14px] font-semibold transition-all flex items-center justify-center gap-2">
              {salvando ? <Loader2 size={16} className="animate-spin" /> : 'Lançar honorário'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
