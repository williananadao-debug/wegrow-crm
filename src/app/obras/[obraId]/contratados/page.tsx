"use client";
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, HardHat, ArrowLeft, Plus, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useObrasAccess } from '../../useObrasAccess';
import { Obra, ObraContratado, fmtMoeda } from '../../shared';

export default function ContratadosObraPage() {
  const { obraId } = useParams<{ obraId: string }>();
  const { authLoading, perfil, temObras, isLideranca } = useObrasAccess();

  const [obra, setObra] = useState<Obra | null>(null);
  const [contratados, setContratados] = useState<ObraContratado[]>([]);
  const [loading, setLoading] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [nome, setNome] = useState('');
  const [documento, setDocumento] = useState('');
  const [tipoServico, setTipoServico] = useState('');
  const [valorContrato, setValorContrato] = useState('');

  const carregar = async () => {
    if (!perfil?.empresa_id || !obraId) return;
    setLoading(true);
    const [obraRes, contratadosRes] = await Promise.all([
      supabase.from('obras').select('*').eq('id', obraId).eq('empresa_id', perfil.empresa_id).single(),
      supabase.from('obra_contratados').select('*').eq('obra_id', obraId).order('created_at', { ascending: false }),
    ]);
    setObra(obraRes.data as Obra);
    setContratados((contratadosRes.data as ObraContratado[]) || []);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, [perfil?.empresa_id, obraId]);

  const salvar = async () => {
    if (!nome.trim() || !perfil?.empresa_id) return;
    setSalvando(true);
    await supabase.from('obra_contratados').insert([{
      obra_id: Number(obraId),
      empresa_id: perfil.empresa_id,
      nome: nome.trim(),
      documento: documento.trim() || null,
      tipo_servico: tipoServico.trim() || null,
      valor_contrato: valorContrato ? Number(valorContrato) : null,
    }]);
    setNome(''); setDocumento(''); setTipoServico(''); setValorContrato('');
    setMostrarForm(false);
    setSalvando(false);
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
          <h1 className="text-3xl font-black tracking-tighter uppercase italic text-orange-500">Contratados</h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Fornecedores e subempreiteiros da obra</p>
        </div>
        {isLideranca && (
          <button onClick={() => setMostrarForm(v => !v)} className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-400 text-[#0B1120] px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all">
            <Plus size={14} /> Novo Contratado
          </button>
        )}
      </div>

      {mostrarForm && (
        <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-5 mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Nome / Razão social *</label>
              <input value={nome} onChange={e => setNome(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-orange-500" />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">CPF/CNPJ</label>
              <input value={documento} onChange={e => setDocumento(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-orange-500" />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Tipo de serviço</label>
              <input value={tipoServico} onChange={e => setTipoServico(e.target.value)} placeholder="Ex: Elétrica, Alvenaria..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-orange-500" />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Valor do contrato</label>
              <input type="number" value={valorContrato} onChange={e => setValorContrato(e.target.value)} placeholder="0,00"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-orange-500" />
            </div>
          </div>
          <button onClick={salvar} disabled={salvando || !nome.trim()}
            className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-[#0B1120] px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all">
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Salvar Contratado
          </button>
        </div>
      )}

      {contratados.length === 0 ? (
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <Users size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-sm">Nenhum contratado cadastrado ainda.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {contratados.map(c => (
            <div key={c.id} className="bg-[#0F172A] border border-white/10 rounded-2xl p-5">
              <p className="font-black text-sm text-white">{c.nome}</p>
              {c.documento && <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">{c.documento}</p>}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                {c.tipo_servico && <span className="text-[10px] font-black uppercase text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2 py-1 rounded-full">{c.tipo_servico}</span>}
                {c.valor_contrato ? <span className="text-sm font-black text-[#22C55E]">{fmtMoeda(c.valor_contrato)}</span> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
