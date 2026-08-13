"use client";
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Loader2, ArrowLeft, Plus, Boxes, Check, X, AlertTriangle } from 'lucide-react';
import ArgusTopNav from '../../../ArgusTopNav';
import { Obra, ObraEtapa, ObraRequisicao, REQUISICAO_STATUS_LABELS, fmtData } from '@/app/obras/shared';
import { ServicoConfig } from '@/app/pulse/shared';

const REQUISICAO_STATUS_CORES_ARGUS: Record<ObraRequisicao['status'], string> = {
  solicitada: 'text-[#d9861c] bg-[#fdf0d4] border-[#f0d19a]',
  aprovada: 'text-[#1d6fd9] bg-[#e8f0fd] border-[#c9dcf7]',
  rejeitada: 'text-[#d63f3f] bg-[#fce8e8] border-[#f5c6c6]',
  atendida: 'text-[#1fa85a] bg-[#d9f2e3] border-[#b8e6cb]',
};

export default function ArgusSuprimentosObraPage() {
  const { obraId } = useParams<{ obraId: string }>();
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  const user = auth.user;
  const isLideranca = perfil?.cargo === 'diretor' || perfil?.cargo === 'gerente';

  const [obra, setObra] = useState<Obra | null>(null);
  const [requisicoes, setRequisicoes] = useState<ObraRequisicao[]>([]);
  const [servicos, setServicos] = useState<ServicoConfig[]>([]);
  const [etapas, setEtapas] = useState<ObraEtapa[]>([]);
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState<number | null>(null);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [servicoId, setServicoId] = useState('');
  const [etapaId, setEtapaId] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    if (!perfil?.empresa_id || !obraId) return;
    setLoading(true);
    const [obraRes, reqRes, servicosRes, etapasRes] = await Promise.all([
      supabase.from('obras').select('*').eq('id', obraId).eq('empresa_id', perfil.empresa_id).single(),
      supabase.from('obra_requisicoes').select('*').eq('obra_id', obraId).order('created_at', { ascending: false }),
      supabase.from('servicos').select('*').eq('empresa_id', perfil.empresa_id).order('nome', { ascending: true }),
      supabase.from('obra_etapas').select('*').eq('obra_id', obraId).order('ordem', { ascending: true }),
    ]);
    setObra(obraRes.data as Obra);
    setRequisicoes((reqRes.data as ObraRequisicao[]) || []);
    setServicos((servicosRes.data as ServicoConfig[]) || []);
    setEtapas((etapasRes.data as ObraEtapa[]) || []);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, [perfil?.empresa_id, obraId]);

  const servicosMap = Object.fromEntries(servicos.map(s => [s.id, s]));

  const solicitar = async () => {
    if (!servicoId || !quantidade || Number(quantidade) <= 0 || !perfil?.empresa_id) return;
    setSalvando(true);
    await supabase.from('obra_requisicoes').insert([{
      empresa_id: perfil.empresa_id, obra_id: Number(obraId),
      etapa_id: etapaId ? Number(etapaId) : null, servico_id: Number(servicoId),
      quantidade: Number(quantidade), observacao: observacao.trim() || null,
      solicitado_por: user?.id || null,
    }]);
    setServicoId(''); setEtapaId(''); setQuantidade(''); setObservacao('');
    setMostrarForm(false);
    setSalvando(false);
    carregar();
  };

  const aprovar = async (req: ObraRequisicao) => {
    setProcessando(req.id);
    const servico = servicosMap[req.servico_id];
    const estoqueAtual = servico?.estoque || 0;
    const novoEstoque = Math.max(0, estoqueAtual - req.quantidade);

    await supabase.from('servicos').update({ estoque: novoEstoque }).eq('id', req.servico_id);
    await supabase.from('estoque_movimentacoes').insert([{
      empresa_id: perfil?.empresa_id, servico_id: req.servico_id, quantidade: -req.quantidade,
      tipo: 'requisicao_obra', observacao: `Obra #${obraId}${req.observacao ? ' — ' + req.observacao : ''}`,
      user_id: user?.id,
    }]);
    await supabase.from('obra_requisicoes').update({
      status: 'aprovada', aprovado_por: user?.id || null, aprovado_em: new Date().toISOString(),
    }).eq('id', req.id);

    setProcessando(null);
    carregar();
  };

  const rejeitar = async (req: ObraRequisicao) => {
    setProcessando(req.id);
    await supabase.from('obra_requisicoes').update({ status: 'rejeitada' }).eq('id', req.id);
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
            <h1 className="text-2xl font-bold text-[#241c14] flex items-center gap-2" style={{ fontFamily: 'var(--font-argus-serif)' }}><Boxes size={22} className="text-[#d9861c]" /> Suprimentos</h1>
            <p className="text-[#9a958a] text-xs font-bold uppercase tracking-wide mt-1">Requisição de material — aprovar dá baixa automática no estoque</p>
          </div>
          <button onClick={() => setMostrarForm(v => !v)} className="inline-flex items-center gap-2 bg-[#d9861c] hover:bg-[#c47716] text-white px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all">
            <Plus size={14} /> Solicitar Material
          </button>
        </div>

        {mostrarForm && (
          <div className="bg-white border border-[#e5e0d5] rounded-2xl p-5 mb-6 space-y-4 shadow-sm">
            {servicos.length === 0 ? (
              <p className="text-[#6b6862] text-sm font-semibold">Nenhum produto no catálogo (Pulse) ainda — cadastre produtos em Pulse → Estoque antes de solicitar.</p>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-[#9a958a] uppercase tracking-wide mb-1.5 block">Produto *</label>
                    <select value={servicoId} onChange={e => setServicoId(e.target.value)}
                      className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-[#d9861c]">
                      <option value="">Selecione...</option>
                      {servicos.map(s => <option key={s.id} value={s.id}>{s.nome} (saldo: {s.estoque ?? 0})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-[#9a958a] uppercase tracking-wide mb-1.5 block">Quantidade *</label>
                    <input type="number" min={1} value={quantidade} onChange={e => setQuantidade(e.target.value)}
                      className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-[#d9861c]" />
                  </div>
                  {etapas.length > 0 && (
                    <div>
                      <label className="text-[10px] font-bold text-[#9a958a] uppercase tracking-wide mb-1.5 block">Etapa (opcional)</label>
                      <select value={etapaId} onChange={e => setEtapaId(e.target.value)}
                        className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-[#d9861c]">
                        <option value="">Sem etapa vinculada</option>
                        {etapas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                      </select>
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-[10px] font-bold text-[#9a958a] uppercase tracking-wide mb-1.5 block">Observação</label>
                  <input value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Ex: pra fundação, urgente..."
                    className="w-full bg-[#faf7f2] border border-[#e5e0d5] rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-[#d9861c]" />
                </div>
                <button onClick={solicitar} disabled={salvando || !servicoId || !quantidade}
                  className="inline-flex items-center gap-2 bg-[#d9861c] hover:bg-[#c47716] disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all">
                  {salvando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Enviar Solicitação
                </button>
              </>
            )}
          </div>
        )}

        {requisicoes.length === 0 ? (
          <div className="bg-white border border-[#e5e0d5] rounded-2xl p-10 text-center">
            <Boxes size={28} className="text-[#d9d5c8] mx-auto mb-3" />
            <p className="text-[#6b6862] font-semibold text-sm">Nenhuma requisição de material ainda.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requisicoes.map(req => {
              const servico = servicosMap[req.servico_id];
              const saldoInsuficiente = req.status === 'solicitada' && servico && (servico.estoque ?? 0) < req.quantidade;
              return (
                <div key={req.id} className="bg-white border border-[#e5e0d5] rounded-2xl p-5 flex flex-col md:flex-row md:items-center gap-4 shadow-sm">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-sm text-[#241c14]">{servico?.nome || 'Produto removido'}</p>
                      <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${REQUISICAO_STATUS_CORES_ARGUS[req.status]}`}>
                        {REQUISICAO_STATUS_LABELS[req.status]}
                      </span>
                      {saldoInsuficiente && (
                        <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border text-[#d63f3f] bg-[#fce8e8] border-[#f5c6c6] flex items-center gap-1">
                          <AlertTriangle size={10} /> Saldo insuficiente
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#6b6862] font-semibold mt-0.5">Quantidade: {req.quantidade} · Saldo atual: {servico?.estoque ?? '—'}</p>
                    {req.observacao && <p className="text-[10px] text-[#9a958a] font-semibold mt-1">{req.observacao}</p>}
                    <p className="text-[10px] text-[#9a958a] font-bold uppercase mt-1">{fmtData(req.created_at)}</p>
                  </div>
                  {isLideranca && req.status === 'solicitada' && (
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => aprovar(req)} disabled={processando === req.id}
                        className="inline-flex items-center gap-1.5 bg-[#d9f2e3] border border-[#b8e6cb] text-[#1fa85a] hover:bg-[#1fa85a] hover:text-white px-3 py-2 rounded-lg font-bold text-[10px] uppercase tracking-widest transition-all disabled:opacity-50">
                        {processando === req.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Aprovar
                      </button>
                      <button onClick={() => rejeitar(req)} disabled={processando === req.id}
                        className="inline-flex items-center gap-1.5 bg-[#fce8e8] border border-[#f5c6c6] text-[#d63f3f] hover:bg-[#d63f3f] hover:text-white px-3 py-2 rounded-lg font-bold text-[10px] uppercase tracking-widest transition-all disabled:opacity-50">
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
