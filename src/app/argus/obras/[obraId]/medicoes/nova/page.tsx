"use client";
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Loader2, ArrowLeft, Receipt } from 'lucide-react';
import ArgusTopNav from '../../../../ArgusTopNav';
import { ObraContratado, ObraEtapa, Medicao } from '@/app/obras/shared';

export default function ArgusNovaMedicaoPage() {
  const { obraId } = useParams<{ obraId: string }>();
  const router = useRouter();
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const empresa = auth.empresa;

  const [contratados, setContratados] = useState<ObraContratado[]>([]);
  const [etapas, setEtapas] = useState<ObraEtapa[]>([]);
  const [carregandoDados, setCarregandoDados] = useState(true);

  const [contratadoId, setContratadoId] = useState('');
  const [etapaId, setEtapaId] = useState('');
  const [numeroMedicao, setNumeroMedicao] = useState('1');
  const [periodoInicio, setPeriodoInicio] = useState('');
  const [periodoFim, setPeriodoFim] = useState('');
  const [valorMedido, setValorMedido] = useState('');
  const [percentualPeriodo, setPercentualPeriodo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!perfil?.empresa_id || !obraId) return;
    Promise.all([
      supabase.from('obra_contratados').select('*').eq('obra_id', obraId).order('nome', { ascending: true }),
      supabase.from('obra_etapas').select('*').eq('obra_id', obraId).order('ordem', { ascending: true }),
    ]).then(([contratadosRes, etapasRes]) => {
      setContratados((contratadosRes.data as ObraContratado[]) || []);
      setEtapas((etapasRes.data as ObraEtapa[]) || []);
      setCarregandoDados(false);
    });
  }, [perfil?.empresa_id, obraId]);

  const salvar = async () => {
    if (!contratadoId) { setErro('Selecione o contratado.'); return; }
    if (!valorMedido || Number(valorMedido) <= 0) { setErro('Informe o valor medido.'); return; }
    if (!perfil?.empresa_id) return;
    setSalvando(true);
    setErro(null);
    const { error } = await supabase.from('medicoes').insert([{
      obra_id: Number(obraId), empresa_id: perfil.empresa_id, obra_contratado_id: Number(contratadoId),
      etapa_id: etapaId ? Number(etapaId) : null, numero_medicao: Number(numeroMedicao) || 1,
      periodo_inicio: periodoInicio || null, periodo_fim: periodoFim || null,
      valor_medido: Number(valorMedido), percentual_periodo: percentualPeriodo ? Number(percentualPeriodo) : null,
      status: 'em_aprovacao' as Medicao['status'],
    }]);
    setSalvando(false);
    if (error) { setErro(error.message); return; }
    router.push(`/argus/obras/${obraId}/medicoes`);
  };

  if (carregandoDados) return <div><ArgusTopNav nomeEmpresa={empresa?.nome} /><div className="p-8 flex justify-center"><Loader2 size={22} className="animate-spin text-[#d9861c]" /></div></div>;

  if (contratados.length === 0) {
    return (
      <div>
        <ArgusTopNav nomeEmpresa={empresa?.nome} />
        <div className="max-w-[700px] mx-auto px-6 py-8">
          <Link href={`/argus/obras/${obraId}/medicoes`} className="inline-flex items-center gap-2 text-[#9a958a] hover:text-[#241c14] text-xs font-bold uppercase tracking-widest mb-6">
            <ArrowLeft size={14} /> Voltar
          </Link>
          <div className="bg-white border border-[#e5e0d5] rounded-2xl p-10 text-center">
            <Receipt size={28} className="text-[#d9d5c8] mx-auto mb-3" />
            <p className="text-[#6b6862] font-semibold text-sm mb-4">Cadastre um contratado antes de lançar uma medição.</p>
            <Link href={`/argus/obras/${obraId}/contratados`} className="inline-flex items-center gap-2 bg-[#d9861c] text-white px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest">
              Ir pra Contratados
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <ArgusTopNav nomeEmpresa={empresa?.nome} />
      <main className="max-w-[700px] mx-auto px-6 py-8">
        <Link href={`/argus/obras/${obraId}/medicoes`} className="inline-flex items-center gap-2 text-[#9a958a] hover:text-[#241c14] text-xs font-bold uppercase tracking-widest mb-6">
          <ArrowLeft size={14} /> Voltar
        </Link>

        <h1 className="text-2xl font-bold text-[#241c14] flex items-center gap-2 mb-1" style={{ fontFamily: 'var(--font-argus-serif)' }}>
          <Receipt size={22} className="text-[#d9861c]" /> Nova Medição
        </h1>
        <p className="text-[#9a958a] text-xs font-bold uppercase tracking-wide mb-6">Vai direto pra aprovação de um diretor/gerente</p>

        <div className="bg-white border border-[#e5e0d5] rounded-2xl p-6 space-y-4">
          <div>
            <label className="text-[12px] font-bold text-[#9a958a] uppercase tracking-wide mb-1.5 block">Contratado *</label>
            <select value={contratadoId} onChange={e => setContratadoId(e.target.value)}
              className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-[#d9861c]">
              <option value="">Selecione...</option>
              {contratados.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>

          {etapas.length > 0 && (
            <div>
              <label className="text-[12px] font-bold text-[#9a958a] uppercase tracking-wide mb-1.5 block">Etapa (opcional)</label>
              <select value={etapaId} onChange={e => setEtapaId(e.target.value)}
                className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-[#d9861c]">
                <option value="">Sem etapa vinculada</option>
                {etapas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-bold text-[#9a958a] uppercase tracking-wide mb-1.5 block">Nº da medição</label>
              <input type="number" min={1} value={numeroMedicao} onChange={e => setNumeroMedicao(e.target.value)}
                className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-[#d9861c]" />
            </div>
            <div>
              <label className="text-[12px] font-bold text-[#9a958a] uppercase tracking-wide mb-1.5 block">Valor medido (R$) *</label>
              <input type="number" value={valorMedido} onChange={e => setValorMedido(e.target.value)} placeholder="0,00"
                className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-[#d9861c]" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-bold text-[#9a958a] uppercase tracking-wide mb-1.5 block">Período — início</label>
              <input type="date" value={periodoInicio} onChange={e => setPeriodoInicio(e.target.value)}
                className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-[#d9861c]" />
            </div>
            <div>
              <label className="text-[12px] font-bold text-[#9a958a] uppercase tracking-wide mb-1.5 block">Período — fim</label>
              <input type="date" value={periodoFim} onChange={e => setPeriodoFim(e.target.value)}
                className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-[#d9861c]" />
            </div>
          </div>

          <div>
            <label className="text-[12px] font-bold text-[#9a958a] uppercase tracking-wide mb-1.5 block">% do período (opcional)</label>
            <input type="number" min={0} max={100} value={percentualPeriodo} onChange={e => setPercentualPeriodo(e.target.value)}
              className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-[#d9861c]" />
          </div>

          {erro && <p className="text-[#d63f3f] text-xs font-bold">{erro}</p>}

          <button onClick={salvar} disabled={salvando}
            className="w-full bg-[#d9861c] hover:bg-[#c47716] disabled:opacity-50 text-white px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2">
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Receipt size={14} />}
            {salvando ? 'Enviando...' : 'Enviar pra Aprovação'}
          </button>
        </div>
      </main>
    </div>
  );
}
