"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, HardHat, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useObrasAccess } from '../useObrasAccess';
import { Obra } from '../shared';

export default function NovaObraPage() {
  const router = useRouter();
  const { authLoading, perfil, temObras } = useObrasAccess();

  const [nome, setNome] = useState('');
  const [endereco, setEndereco] = useState('');
  const [status, setStatus] = useState<Obra['status']>('planejamento');
  const [dataInicio, setDataInicio] = useState('');
  const [dataPrevistaFim, setDataPrevistaFim] = useState('');
  const [valorOrcado, setValorOrcado] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const salvar = async () => {
    if (!nome.trim()) { setErro('Informe o nome da obra.'); return; }
    if (!perfil?.empresa_id) return;
    setSalvando(true);
    setErro(null);
    const { data, error } = await supabase.from('obras').insert([{
      nome: nome.trim(),
      endereco: endereco.trim() || null,
      status,
      data_inicio: dataInicio || null,
      data_prevista_fim: dataPrevistaFim || null,
      valor_orcado_total: valorOrcado ? Number(valorOrcado) : null,
      empresa_id: perfil.empresa_id,
    }]).select().single();
    setSalvando(false);
    if (error) { setErro(error.message); return; }
    router.push(`/obras/${data.id}`);
  };

  if (authLoading) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;

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
    <div className="p-4 md:p-8 pb-20 text-white max-w-2xl">
      <Link href="/obras" className="inline-flex items-center gap-2 text-slate-500 hover:text-white text-xs font-black uppercase tracking-widest mb-6">
        <ArrowLeft size={14} /> Voltar
      </Link>

      <h1 className="text-3xl font-black tracking-tighter uppercase italic text-orange-500 flex items-center gap-3 mb-6">
        <HardHat size={28} /> Nova Obra
      </h1>

      <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-6 space-y-4">
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Nome da obra *</label>
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Edifício Aurora — Torre 1"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-orange-500 transition-all" />
        </div>

        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Endereço</label>
          <input value={endereco} onChange={e => setEndereco(e.target.value)} placeholder="Rua, número, bairro, cidade"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-orange-500 transition-all" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value as Obra['status'])}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-orange-500 transition-all">
              <option className="bg-[#0F172A]" value="planejamento">Planejamento</option>
              <option className="bg-[#0F172A]" value="em_andamento">Em Andamento</option>
              <option className="bg-[#0F172A]" value="concluida">Concluída</option>
              <option className="bg-[#0F172A]" value="paralisada">Paralisada</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Orçamento total (informativo)</label>
            <input type="number" value={valorOrcado} onChange={e => setValorOrcado(e.target.value)} placeholder="0,00"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-orange-500 transition-all" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Início</label>
            <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-orange-500 transition-all" />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Previsão de término</label>
            <input type="date" value={dataPrevistaFim} onChange={e => setDataPrevistaFim(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-orange-500 transition-all" />
          </div>
        </div>

        {erro && <p className="text-red-400 text-xs font-bold">{erro}</p>}

        <button onClick={salvar} disabled={salvando}
          className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-[#0B1120] px-4 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2">
          {salvando ? <Loader2 size={14} className="animate-spin" /> : <HardHat size={14} />}
          {salvando ? 'Salvando...' : 'Criar Obra'}
        </button>
      </div>
    </div>
  );
}
