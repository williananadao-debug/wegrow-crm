"use client";
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Loader2, ArrowLeft, Plus, Users } from 'lucide-react';
import ArgusTopNav from '../../../ArgusTopNav';
import { Obra, ObraContratado, fmtMoeda } from '@/app/obras/shared';

export default function ArgusContratadosObraPage() {
  const { obraId } = useParams<{ obraId: string }>();
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  const isLideranca = perfil?.cargo === 'diretor' || perfil?.cargo === 'gerente';

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
      obra_id: Number(obraId), empresa_id: perfil.empresa_id, nome: nome.trim(),
      documento: documento.trim() || null, tipo_servico: tipoServico.trim() || null,
      valor_contrato: valorContrato ? Number(valorContrato) : null,
    }]);
    setNome(''); setDocumento(''); setTipoServico(''); setValorContrato('');
    setMostrarForm(false);
    setSalvando(false);
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
            <h1 className="text-2xl font-bold text-[#241c14]" style={{ fontFamily: 'var(--font-argus-serif)' }}>Contratados</h1>
            <p className="text-[#9a958a] text-xs font-bold uppercase tracking-wide mt-1">Fornecedores e subempreiteiros da obra</p>
          </div>
          {isLideranca && (
            <button onClick={() => setMostrarForm(v => !v)} className="inline-flex items-center gap-2 bg-[#d9861c] hover:bg-[#c47716] text-white px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all">
              <Plus size={14} /> Novo Contratado
            </button>
          )}
        </div>

        {mostrarForm && (
          <div className="bg-white border border-[#e5e0d5] rounded-2xl p-5 mb-6 space-y-4 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[12px] font-bold text-[#9a958a] uppercase tracking-wide mb-1.5 block">Nome / Razão social *</label>
                <input value={nome} onChange={e => setNome(e.target.value)}
                  className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-[#d9861c]" />
              </div>
              <div>
                <label className="text-[12px] font-bold text-[#9a958a] uppercase tracking-wide mb-1.5 block">CPF/CNPJ</label>
                <input value={documento} onChange={e => setDocumento(e.target.value)}
                  className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-[#d9861c]" />
              </div>
              <div>
                <label className="text-[12px] font-bold text-[#9a958a] uppercase tracking-wide mb-1.5 block">Tipo de serviço</label>
                <input value={tipoServico} onChange={e => setTipoServico(e.target.value)} placeholder="Ex: Elétrica, Alvenaria..."
                  className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-[#d9861c]" />
              </div>
              <div>
                <label className="text-[12px] font-bold text-[#9a958a] uppercase tracking-wide mb-1.5 block">Valor do contrato</label>
                <input type="number" value={valorContrato} onChange={e => setValorContrato(e.target.value)} placeholder="0,00"
                  className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-[#d9861c]" />
              </div>
            </div>
            <button onClick={salvar} disabled={salvando || !nome.trim()}
              className="inline-flex items-center gap-2 bg-[#d9861c] hover:bg-[#c47716] disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all">
              {salvando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Salvar Contratado
            </button>
          </div>
        )}

        {contratados.length === 0 ? (
          <div className="bg-white border border-[#e5e0d5] rounded-2xl p-10 text-center">
            <Users size={28} className="text-[#d9d5c8] mx-auto mb-3" />
            <p className="text-[#6b6862] font-semibold text-sm">Nenhum contratado cadastrado ainda.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {contratados.map(c => (
              <div key={c.id} className="bg-white border border-[#e5e0d5] rounded-2xl p-5 shadow-sm">
                <p className="font-bold text-sm text-[#241c14]">{c.nome}</p>
                {c.documento && <p className="text-[12px] text-[#9a958a] font-bold uppercase mt-0.5">{c.documento}</p>}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#f0ede6]">
                  {c.tipo_servico && <span className="text-[12px] font-bold uppercase text-[#d9861c] bg-[#fdf0d4] border border-[#f0d19a] px-2 py-1 rounded-full">{c.tipo_servico}</span>}
                  {c.valor_contrato ? <span className="text-sm font-bold text-[#1fa85a]">{fmtMoeda(c.valor_contrato)}</span> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
