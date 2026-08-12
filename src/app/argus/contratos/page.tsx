"use client";
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Loader2, FileSignature, Plus } from 'lucide-react';
import ArgusTopNav from '../ArgusTopNav';
import { ArgusContrato, ArgusEdital, fmtMoeda, fmtData } from '../shared';

const STATUS_CORES: Record<ArgusContrato['status'], string> = {
  ativo: 'text-[#1fa85a] bg-[#d9f2e3] border-[#b8e6cb]',
  encerrado: 'text-[#6b6862] bg-[#f0ede6] border-[#e5e0d5]',
  rescindido: 'text-[#d63f3f] bg-[#fce8e8] border-[#f5c6c6]',
};

export default function ArgusContratosPage() {
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  const isLideranca = perfil?.cargo === 'diretor' || perfil?.cargo === 'gerente';

  const [contratos, setContratos] = useState<ArgusContrato[]>([]);
  const [editaisGanhos, setEditaisGanhos] = useState<ArgusEdital[]>([]);
  const [loading, setLoading] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [editalId, setEditalId] = useState('');
  const [orgao, setOrgao] = useState('');
  const [objeto, setObjeto] = useState('');
  const [valorContrato, setValorContrato] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

  const carregar = async () => {
    if (!perfil?.empresa_id) return;
    setLoading(true);
    const [contratosRes, editaisRes] = await Promise.all([
      supabase.from('argus_contratos').select('*').eq('empresa_id', perfil.empresa_id).order('created_at', { ascending: false }),
      supabase.from('argus_editais').select('*').eq('empresa_id', perfil.empresa_id).eq('status_interesse', 'ganho'),
    ]);
    setContratos((contratosRes.data as ArgusContrato[]) || []);
    setEditaisGanhos((editaisRes.data as ArgusEdital[]) || []);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, [perfil?.empresa_id]);

  const selecionarEdital = (id: string) => {
    setEditalId(id);
    const edital = editaisGanhos.find(e => String(e.id) === id);
    if (edital) {
      setOrgao(edital.orgao || '');
      setObjeto(edital.objeto || '');
      setValorContrato(String(edital.valor_homologado || edital.valor_proposto || ''));
    }
  };

  const salvar = async () => {
    if (!orgao.trim() || !perfil?.empresa_id) return;
    setSalvando(true);
    await supabase.from('argus_contratos').insert([{
      empresa_id: perfil.empresa_id,
      edital_id: editalId ? Number(editalId) : null,
      orgao: orgao.trim(),
      objeto: objeto.trim() || null,
      valor_contrato: valorContrato ? Number(valorContrato) : null,
      data_inicio: dataInicio || null,
      data_fim: dataFim || null,
    }]);
    setEditalId(''); setOrgao(''); setObjeto(''); setValorContrato(''); setDataInicio(''); setDataFim('');
    setMostrarForm(false);
    setSalvando(false);
    carregar();
  };

  const atualizarStatus = async (id: number, status: ArgusContrato['status']) => {
    setContratos(prev => prev.map(c => c.id === id ? { ...c, status } : c));
    await supabase.from('argus_contratos').update({ status }).eq('id', id);
  };

  if (loading) return <div><ArgusTopNav nomeEmpresa={empresa?.nome} /><div className="p-8 flex justify-center"><Loader2 size={22} className="animate-spin text-[#d9861c]" /></div></div>;

  return (
    <div>
      <ArgusTopNav nomeEmpresa={empresa?.nome} />
      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-[#241c14]" style={{ fontFamily: 'var(--font-argus-serif)' }}>Contratos</h1>
          {isLideranca && (
            <button onClick={() => setMostrarForm(v => !v)} className="inline-flex items-center gap-2 bg-[#d9861c] hover:bg-[#c47716] text-white px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all">
              <Plus size={14} /> Novo Contrato
            </button>
          )}
        </div>

        {mostrarForm && (
          <div className="bg-white border border-[#e5e0d5] rounded-2xl p-5 mb-6 space-y-3">
            {editaisGanhos.length > 0 && (
              <div>
                <label className="text-[11px] font-bold text-[#9a958a] uppercase tracking-wide mb-1 block">A partir de um edital ganho (opcional)</label>
                <select value={editalId} onChange={e => selecionarEdital(e.target.value)} className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-lg px-3 py-2 text-sm font-semibold outline-none focus:border-[#d9861c]">
                  <option value="">Nenhum — preencher manualmente</option>
                  {editaisGanhos.map(e => <option key={e.id} value={e.id}>{e.orgao} — {e.objeto?.slice(0, 60)}</option>)}
                </select>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-[#9a958a] uppercase tracking-wide mb-1 block">Órgão *</label>
                <input value={orgao} onChange={e => setOrgao(e.target.value)} className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-lg px-3 py-2 text-sm font-semibold outline-none focus:border-[#d9861c]" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-[#9a958a] uppercase tracking-wide mb-1 block">Valor do contrato</label>
                <input type="number" value={valorContrato} onChange={e => setValorContrato(e.target.value)} className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-lg px-3 py-2 text-sm font-semibold outline-none focus:border-[#d9861c]" />
              </div>
              <div className="md:col-span-2">
                <label className="text-[11px] font-bold text-[#9a958a] uppercase tracking-wide mb-1 block">Objeto</label>
                <input value={objeto} onChange={e => setObjeto(e.target.value)} className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-lg px-3 py-2 text-sm font-semibold outline-none focus:border-[#d9861c]" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-[#9a958a] uppercase tracking-wide mb-1 block">Início</label>
                <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-lg px-3 py-2 text-sm font-semibold outline-none focus:border-[#d9861c]" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-[#9a958a] uppercase tracking-wide mb-1 block">Fim</label>
                <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-lg px-3 py-2 text-sm font-semibold outline-none focus:border-[#d9861c]" />
              </div>
            </div>
            <button onClick={salvar} disabled={salvando || !orgao.trim()} className="inline-flex items-center gap-2 bg-[#241c14] hover:bg-[#3a2e20] disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all">
              {salvando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Salvar
            </button>
          </div>
        )}

        {contratos.length === 0 ? (
          <div className="bg-white border border-[#e5e0d5] rounded-2xl p-10 text-center">
            <FileSignature size={28} className="text-[#d9d5c8] mx-auto mb-3" />
            <p className="text-[#6b6862] font-semibold text-sm">Nenhum contrato cadastrado ainda.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {contratos.map(c => (
              <div key={c.id} className="bg-white border border-[#e5e0d5] rounded-2xl p-5">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm font-bold text-[#241c14]">{c.orgao}</p>
                  <select value={c.status} disabled={!isLideranca} onChange={e => atualizarStatus(c.id, e.target.value as ArgusContrato['status'])}
                    className={`text-[11px] font-bold uppercase px-2 py-1 rounded-full border outline-none flex-shrink-0 ${STATUS_CORES[c.status]}`}>
                    <option value="ativo">Ativo</option>
                    <option value="encerrado">Encerrado</option>
                    <option value="rescindido">Rescindido</option>
                  </select>
                </div>
                {c.objeto && <p className="text-[13px] text-[#6b6862] mb-3">{c.objeto}</p>}
                <div className="flex items-center justify-between pt-2 border-t border-[#f0ede6] text-[12px] font-semibold text-[#9a958a]">
                  <span>{fmtData(c.data_inicio)} — {fmtData(c.data_fim)}</span>
                  {c.valor_contrato ? <span className="text-sm font-bold text-[#241c14]">{fmtMoeda(c.valor_contrato)}</span> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
