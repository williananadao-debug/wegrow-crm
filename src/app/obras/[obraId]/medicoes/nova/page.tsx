"use client";
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, HardHat, ArrowLeft, Receipt } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useObrasAccess } from '../../../useObrasAccess';
import { ObraContratado, ObraEtapa, Medicao } from '../../../shared';

export default function NovaMedicaoPage() {
  const { obraId } = useParams<{ obraId: string }>();
  const router = useRouter();
  const { authLoading, perfil, temObras } = useObrasAccess();

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
      obra_id: Number(obraId),
      empresa_id: perfil.empresa_id,
      obra_contratado_id: Number(contratadoId),
      etapa_id: etapaId ? Number(etapaId) : null,
      numero_medicao: Number(numeroMedicao) || 1,
      periodo_inicio: periodoInicio || null,
      periodo_fim: periodoFim || null,
      valor_medido: Number(valorMedido),
      percentual_periodo: percentualPeriodo ? Number(percentualPeriodo) : null,
      status: 'em_aprovacao' as Medicao['status'],
    }]);
    setSalvando(false);
    if (error) { setErro(error.message); return; }
    router.push(`/obras/${obraId}/medicoes`);
  };

  if (authLoading || carregandoDados) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;

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

  if (contratados.length === 0) {
    return (
      <div className="p-4 md:p-8 pb-20 text-white max-w-2xl">
        <Link href={`/obras/${obraId}/medicoes`} className="inline-flex items-center gap-2 text-slate-500 hover:text-white text-xs font-black uppercase tracking-widest mb-6">
          <ArrowLeft size={14} /> Voltar
        </Link>
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <Receipt size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-sm mb-4">Cadastre um contratado antes de lançar uma medição.</p>
          <Link href={`/obras/${obraId}/contratados`} className="inline-flex items-center gap-2 bg-orange-500 text-[#0B1120] px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest">
            Ir pra Contratados
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 pb-20 text-white max-w-2xl">
      <Link href={`/obras/${obraId}/medicoes`} className="inline-flex items-center gap-2 text-slate-500 hover:text-white text-xs font-black uppercase tracking-widest mb-6">
        <ArrowLeft size={14} /> Voltar
      </Link>

      <h1 className="text-3xl font-black tracking-tighter uppercase italic text-orange-500 flex items-center gap-3 mb-1">
        <Receipt size={28} /> Nova Medição
      </h1>
      <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-6">Vai direto pra aprovação de um diretor/gerente</p>

      <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6 space-y-4">
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Contratado *</label>
          <select value={contratadoId} onChange={e => setContratadoId(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-orange-500">
            <option className="bg-[#0F172A]" value="">Selecione...</option>
            {contratados.map(c => <option key={c.id} className="bg-[#0F172A]" value={c.id}>{c.nome}</option>)}
          </select>
        </div>

        {etapas.length > 0 && (
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Etapa (opcional)</label>
            <select value={etapaId} onChange={e => setEtapaId(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-orange-500">
              <option className="bg-[#0F172A]" value="">Sem etapa vinculada</option>
              {etapas.map(e => <option key={e.id} className="bg-[#0F172A]" value={e.id}>{e.nome}</option>)}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Nº da medição</label>
            <input type="number" min={1} value={numeroMedicao} onChange={e => setNumeroMedicao(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-orange-500" />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Valor medido (R$) *</label>
            <input type="number" value={valorMedido} onChange={e => setValorMedido(e.target.value)} placeholder="0,00"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-orange-500" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Período — início</label>
            <input type="date" value={periodoInicio} onChange={e => setPeriodoInicio(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-orange-500" />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Período — fim</label>
            <input type="date" value={periodoFim} onChange={e => setPeriodoFim(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-orange-500" />
          </div>
        </div>

        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">% do período (opcional)</label>
          <input type="number" min={0} max={100} value={percentualPeriodo} onChange={e => setPercentualPeriodo(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-orange-500" />
        </div>

        {erro && <p className="text-red-400 text-xs font-bold">{erro}</p>}

        <button onClick={salvar} disabled={salvando}
          className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-[#0B1120] px-4 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2">
          {salvando ? <Loader2 size={14} className="animate-spin" /> : <Receipt size={14} />}
          {salvando ? 'Enviando...' : 'Enviar pra Aprovação'}
        </button>
      </div>
    </div>
  );
}
