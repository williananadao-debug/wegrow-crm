"use client";
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, HardHat, ArrowLeft, Plus, Receipt, Check, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useObrasAccess } from '../../useObrasAccess';
import { Obra, ObraContratado, Medicao, MEDICAO_STATUS_LABELS, MEDICAO_STATUS_CORES, fmtMoeda, fmtData, formatObraId } from '../../shared';

export default function MedicoesObraPage() {
  const { obraId } = useParams<{ obraId: string }>();
  const auth = useAuth() || {};
  const { authLoading, perfil, temObras, isLideranca } = useObrasAccess();

  const [obra, setObra] = useState<Obra | null>(null);
  const [medicoes, setMedicoes] = useState<Medicao[]>([]);
  const [contratadosMap, setContratadosMap] = useState<Record<number, ObraContratado>>({});
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState<number | null>(null);

  const carregar = async () => {
    if (!perfil?.empresa_id || !obraId) return;
    setLoading(true);
    const [obraRes, medicoesRes, contratadosRes] = await Promise.all([
      supabase.from('obras').select('*').eq('id', obraId).eq('empresa_id', perfil.empresa_id).single(),
      supabase.from('medicoes').select('*').eq('obra_id', obraId).order('created_at', { ascending: false }),
      supabase.from('obra_contratados').select('*').eq('obra_id', obraId),
    ]);
    setObra(obraRes.data as Obra);
    setMedicoes((medicoesRes.data as Medicao[]) || []);
    const map: Record<number, ObraContratado> = {};
    ((contratadosRes.data as ObraContratado[]) || []).forEach(c => { map[c.id] = c; });
    setContratadosMap(map);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, [perfil?.empresa_id, obraId]);

  // Medição aprovada gera só um lançamento de controle (saída, pendente) — o Asaas do
  // WeGrow hoje só cobra cliente, não paga fornecedor, então o pagamento em si continua
  // manual fora do sistema. Ver plano em C:\Users\willi\.claude\plans\cozy-percolating-snail.md
  const aprovar = async (medicao: Medicao) => {
    if (!perfil?.empresa_id) return;
    setProcessando(medicao.id);
    const contratado = contratadosMap[medicao.obra_contratado_id];
    const { data: lancamento, error: lancErro } = await supabase.from('lancamentos').insert([{
      titulo: `MEDIÇÃO ${medicao.numero_medicao} — ${formatObraId(medicao.obra_id)} — ${contratado?.nome || 'Contratado'}`,
      valor: medicao.valor_medido,
      tipo: 'saida',
      categoria: 'obra',
      status: 'pendente',
      data_vencimento: medicao.periodo_fim || new Date().toISOString().split('T')[0],
      empresa_id: perfil.empresa_id,
    }]).select().single();

    if (lancErro) { alert('Erro ao gerar lançamento: ' + lancErro.message); setProcessando(null); return; }

    await supabase.from('medicoes').update({
      status: 'aprovada',
      aprovado_por: auth.user?.id || null,
      aprovado_em: new Date().toISOString(),
      lancamento_id: lancamento.id,
    }).eq('id', medicao.id);

    setProcessando(null);
    carregar();
  };

  const rejeitar = async (medicao: Medicao) => {
    setProcessando(medicao.id);
    await supabase.from('medicoes').update({ status: 'rejeitada' }).eq('id', medicao.id);
    setProcessando(null);
    carregar();
  };

  if (authLoading || loading) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;

  if (!temObras) {
    return (
      <div className="p-4 md:p-8 pb-20 text-white">
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <HardHat size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-sm">O módulo Obras não está ativo pra sua empresa ainda.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 pb-20 text-white">
      <Link href={`/obras/${obraId}`} className="inline-flex items-center gap-2 text-slate-500 hover:text-white text-xs font-black uppercase tracking-widest mb-6">
        <ArrowLeft size={14} /> Voltar pra {obra?.nome || 'obra'}
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black tracking-tighter uppercase italic text-orange-500">Medições</h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Aprovar gera um lançamento de saída — pagamento em si é manual</p>
        </div>
        <Link href={`/obras/${obraId}/medicoes/nova`} className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-400 text-[#0B1120] px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all">
          <Plus size={14} /> Nova Medição
        </Link>
      </div>

      {medicoes.length === 0 ? (
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <Receipt size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-sm">Nenhuma medição registrada ainda.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {medicoes.map(m => {
            const contratado = contratadosMap[m.obra_contratado_id];
            return (
              <div key={m.id} className="bg-[#0F172A] border border-white/10 rounded-2xl p-5 flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-black text-sm text-white">Medição #{m.numero_medicao}</p>
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${MEDICAO_STATUS_CORES[m.status]}`}>
                      {MEDICAO_STATUS_LABELS[m.status]}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-semibold mt-0.5">{contratado?.nome || 'Contratado removido'}</p>
                  <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">
                    {fmtData(m.periodo_inicio)} — {fmtData(m.periodo_fim)}
                    {m.percentual_periodo ? ` · ${m.percentual_periodo}% do período` : ''}
                  </p>
                </div>
                <p className="text-lg font-black text-[#22C55E] flex-shrink-0">{fmtMoeda(m.valor_medido)}</p>
                {isLideranca && m.status === 'em_aprovacao' && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => aprovar(m)} disabled={processando === m.id}
                      className="inline-flex items-center gap-1.5 bg-[#22C55E]/10 border border-[#22C55E]/30 text-[#22C55E] hover:bg-[#22C55E] hover:text-[#0B1120] px-3 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all disabled:opacity-50">
                      {processando === m.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Aprovar
                    </button>
                    <button onClick={() => rejeitar(m)} disabled={processando === m.id}
                      className="inline-flex items-center gap-1.5 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white px-3 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all disabled:opacity-50">
                      <X size={12} /> Rejeitar
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
