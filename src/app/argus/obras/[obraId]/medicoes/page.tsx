"use client";
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Loader2, ArrowLeft, Plus, Receipt, Check, X } from 'lucide-react';
import ArgusTopNav from '../../../ArgusTopNav';
import { Obra, ObraContratado, Medicao, MEDICAO_STATUS_LABELS, fmtMoeda, fmtData, formatObraId } from '@/app/obras/shared';

const MEDICAO_STATUS_CORES_ARGUS: Record<Medicao['status'], string> = {
  rascunho: 'text-[#6b6862] bg-[#f0ede6] border-[#e5e0d5]',
  em_aprovacao: 'text-[#d9861c] bg-[#fdf0d4] border-[#f0d19a]',
  aprovada: 'text-[#1d6fd9] bg-[#e8f0fd] border-[#c9dcf7]',
  rejeitada: 'text-[#d63f3f] bg-[#fce8e8] border-[#f5c6c6]',
  paga: 'text-[#1fa85a] bg-[#d9f2e3] border-[#b8e6cb]',
};

export default function ArgusMedicoesObraPage() {
  const { obraId } = useParams<{ obraId: string }>();
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  const isLideranca = perfil?.cargo === 'diretor' || perfil?.cargo === 'gerente';

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

  const aprovar = async (medicao: Medicao) => {
    if (!perfil?.empresa_id) return;
    setProcessando(medicao.id);
    const contratado = contratadosMap[medicao.obra_contratado_id];
    const { data: lancamento, error: lancErro } = await supabase.from('lancamentos').insert([{
      titulo: `MEDIÇÃO ${medicao.numero_medicao} — ${formatObraId(medicao.obra_id)} — ${contratado?.nome || 'Contratado'}`,
      valor: medicao.valor_medido, tipo: 'saida', categoria: 'obra', status: 'pendente',
      data_vencimento: medicao.periodo_fim || new Date().toISOString().split('T')[0],
      empresa_id: perfil.empresa_id,
    }]).select().single();

    if (lancErro) { alert('Erro ao gerar lançamento: ' + lancErro.message); setProcessando(null); return; }

    await supabase.from('medicoes').update({
      status: 'aprovada', aprovado_por: auth.user?.id || null, aprovado_em: new Date().toISOString(), lancamento_id: lancamento.id,
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

  if (loading) return <div><ArgusTopNav nomeEmpresa={empresa?.nome} /><div className="p-8 flex justify-center"><Loader2 size={22} className="animate-spin text-[#d9861c]" /></div></div>;

  return (
    <div>
      <ArgusTopNav nomeEmpresa={empresa?.nome} />
      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <Link href={`/argus/obras/${obraId}`} className="inline-flex items-center gap-2 text-[#9a958a] hover:text-[#241c14] text-xs font-bold uppercase tracking-widest mb-6">
          <ArrowLeft size={14} /> Voltar pra {obra?.nome || 'obra'}
        </Link>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#241c14]" style={{ fontFamily: 'var(--font-argus-serif)' }}>Medições</h1>
            <p className="text-[#9a958a] text-xs font-bold uppercase tracking-wide mt-1">Aprovar gera um lançamento de saída — pagamento em si é manual</p>
          </div>
          <Link href={`/argus/obras/${obraId}/medicoes/nova`} className="inline-flex items-center gap-2 bg-[#d9861c] hover:bg-[#c47716] text-white px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all">
            <Plus size={14} /> Nova Medição
          </Link>
        </div>

        {medicoes.length === 0 ? (
          <div className="bg-white border border-[#e5e0d5] rounded-2xl p-10 text-center">
            <Receipt size={28} className="text-[#d9d5c8] mx-auto mb-3" />
            <p className="text-[#6b6862] font-semibold text-sm">Nenhuma medição registrada ainda.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {medicoes.map(m => {
              const contratado = contratadosMap[m.obra_contratado_id];
              return (
                <div key={m.id} className="bg-white border border-[#e5e0d5] rounded-2xl p-5 flex flex-col md:flex-row md:items-center gap-4 shadow-sm">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-sm text-[#241c14]">Medição #{m.numero_medicao}</p>
                      <span className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded-full border ${MEDICAO_STATUS_CORES_ARGUS[m.status]}`}>
                        {MEDICAO_STATUS_LABELS[m.status]}
                      </span>
                    </div>
                    <p className="text-xs text-[#6b6862] font-semibold mt-0.5">{contratado?.nome || 'Contratado removido'}</p>
                    <p className="text-[12px] text-[#9a958a] font-bold uppercase mt-1">
                      {fmtData(m.periodo_inicio)} — {fmtData(m.periodo_fim)}{m.percentual_periodo ? ` · ${m.percentual_periodo}% do período` : ''}
                    </p>
                  </div>
                  <p className="text-lg font-bold text-[#1fa85a] flex-shrink-0">{fmtMoeda(m.valor_medido)}</p>
                  {isLideranca && m.status === 'em_aprovacao' && (
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => aprovar(m)} disabled={processando === m.id}
                        className="inline-flex items-center gap-1.5 bg-[#d9f2e3] border border-[#b8e6cb] text-[#1fa85a] hover:bg-[#1fa85a] hover:text-white px-3 py-2 rounded-lg font-bold text-[12px] uppercase tracking-widest transition-all disabled:opacity-50">
                        {processando === m.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Aprovar
                      </button>
                      <button onClick={() => rejeitar(m)} disabled={processando === m.id}
                        className="inline-flex items-center gap-1.5 bg-[#fce8e8] border border-[#f5c6c6] text-[#d63f3f] hover:bg-[#d63f3f] hover:text-white px-3 py-2 rounded-lg font-bold text-[12px] uppercase tracking-widest transition-all disabled:opacity-50">
                        <X size={12} /> Rejeitar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
