"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Loader2, HardHat, ArrowLeft } from 'lucide-react';
import ArgusTopNav from '../../ArgusTopNav';
import { Obra } from '@/app/obras/shared';

export default function NovaObraArgusPage() {
  const router = useRouter();
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const empresa = auth.empresa;

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
    router.push(`/argus/obras/${data.id}`);
  };

  return (
    <div>
      <ArgusTopNav nomeEmpresa={empresa?.nome} />
      <main className="max-w-[700px] mx-auto px-6 py-8">
        <Link href="/argus/obras" className="inline-flex items-center gap-2 text-[#9a958a] hover:text-[#241c14] text-xs font-bold uppercase tracking-widest mb-6">
          <ArrowLeft size={14} /> Voltar
        </Link>

        <h1 className="text-2xl font-bold text-[#241c14] flex items-center gap-2 mb-6" style={{ fontFamily: 'var(--font-argus-serif)' }}>
          <HardHat size={22} className="text-[#d9861c]" /> Nova Obra
        </h1>

        <div className="bg-white border border-[#e5e0d5] rounded-2xl p-6 space-y-4">
          <div>
            <label className="text-[10px] font-bold text-[#9a958a] uppercase tracking-wide mb-1.5 block">Nome da obra *</label>
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Edifício Aurora — Torre 1"
              className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-[#d9861c] transition-all" />
          </div>

          <div>
            <label className="text-[10px] font-bold text-[#9a958a] uppercase tracking-wide mb-1.5 block">Endereço</label>
            <input value={endereco} onChange={e => setEndereco(e.target.value)} placeholder="Rua, número, bairro, cidade"
              className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-[#d9861c] transition-all" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-[#9a958a] uppercase tracking-wide mb-1.5 block">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value as Obra['status'])}
                className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-[#d9861c] transition-all">
                <option value="planejamento">Planejamento</option>
                <option value="em_andamento">Em Andamento</option>
                <option value="concluida">Concluída</option>
                <option value="paralisada">Paralisada</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-[#9a958a] uppercase tracking-wide mb-1.5 block">Orçamento total (informativo)</label>
              <input type="number" value={valorOrcado} onChange={e => setValorOrcado(e.target.value)} placeholder="0,00"
                className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-[#d9861c] transition-all" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-[#9a958a] uppercase tracking-wide mb-1.5 block">Início</label>
              <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-[#d9861c] transition-all" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-[#9a958a] uppercase tracking-wide mb-1.5 block">Previsão de término</label>
              <input type="date" value={dataPrevistaFim} onChange={e => setDataPrevistaFim(e.target.value)}
                className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-xl px-4 py-3 text-sm font-semibold outline-none focus:border-[#d9861c] transition-all" />
            </div>
          </div>

          {erro && <p className="text-[#d63f3f] text-xs font-bold">{erro}</p>}

          <button onClick={salvar} disabled={salvando}
            className="w-full bg-[#d9861c] hover:bg-[#c47716] disabled:opacity-50 text-white px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2">
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <HardHat size={14} />}
            {salvando ? 'Salvando...' : 'Criar Obra'}
          </button>
        </div>
      </main>
    </div>
  );
}
