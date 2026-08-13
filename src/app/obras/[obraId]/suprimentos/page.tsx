"use client";
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, HardHat, ArrowLeft, Plus, Boxes, Check, X, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useObrasAccess } from '../../useObrasAccess';
import { Obra, ObraEtapa, ObraRequisicao, REQUISICAO_STATUS_LABELS, REQUISICAO_STATUS_CORES, fmtData } from '../../shared';
import { ServicoConfig } from '@/app/pulse/shared';

export default function SuprimentosObraPage() {
  const { obraId } = useParams<{ obraId: string }>();
  const { authLoading, perfil, user, temObras, isLideranca } = useObrasAccess();

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
      empresa_id: perfil.empresa_id,
      obra_id: Number(obraId),
      etapa_id: etapaId ? Number(etapaId) : null,
      servico_id: Number(servicoId),
      quantidade: Number(quantidade),
      observacao: observacao.trim() || null,
      solicitado_por: user?.id || null,
    }]);
    setServicoId(''); setEtapaId(''); setQuantidade(''); setObservacao('');
    setMostrarForm(false);
    setSalvando(false);
    carregar();
  };

  // Não bloqueia aprovação com saldo insuficiente (obra que aguarda reposição é comum) —
  // só avisa. Decisão documentada no plano, reversível se preferir travar.
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
          <h1 className="text-3xl font-black tracking-tighter uppercase italic text-orange-500 flex items-center gap-3"><Boxes size={28} /> Suprimentos</h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Requisição de material do catálogo — aprovar dá baixa automática no estoque</p>
        </div>
        <button onClick={() => setMostrarForm(v => !v)} className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-400 text-[#0B1120] px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all">
          <Plus size={14} /> Solicitar Material
        </button>
      </div>

      {mostrarForm && (
        <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-5 mb-6 space-y-4">
          {servicos.length === 0 ? (
            <p className="text-slate-400 text-sm font-semibold">Nenhum produto no catálogo (Pulse) ainda — cadastre produtos em Pulse → Estoque antes de solicitar.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Produto *</label>
                  <select value={servicoId} onChange={e => setServicoId(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-orange-500">
                    <option className="bg-[#0F172A]" value="">Selecione...</option>
                    {servicos.map(s => <option key={s.id} className="bg-[#0F172A]" value={s.id}>{s.nome} (saldo: {s.estoque ?? 0})</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Quantidade *</label>
                  <input type="number" min={1} value={quantidade} onChange={e => setQuantidade(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-orange-500" />
                </div>
                {etapas.length > 0 && (
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Etapa (opcional)</label>
                    <select value={etapaId} onChange={e => setEtapaId(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-orange-500">
                      <option className="bg-[#0F172A]" value="">Sem etapa vinculada</option>
                      {etapas.map(e => <option key={e.id} className="bg-[#0F172A]" value={e.id}>{e.nome}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Observação</label>
                <input value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Ex: pra fundação, urgente..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-semibold outline-none focus:border-orange-500" />
              </div>
              <button onClick={solicitar} disabled={salvando || !servicoId || !quantidade}
                className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-[#0B1120] px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all">
                {salvando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Enviar Solicitação
              </button>
            </>
          )}
        </div>
      )}

      {requisicoes.length === 0 ? (
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <Boxes size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-sm">Nenhuma requisição de material ainda.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requisicoes.map(req => {
            const servico = servicosMap[req.servico_id];
            const saldoInsuficiente = req.status === 'solicitada' && servico && (servico.estoque ?? 0) < req.quantidade;
            return (
              <div key={req.id} className="bg-[#0F172A] border border-white/10 rounded-2xl p-5 flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-black text-sm text-white">{servico?.nome || 'Produto removido'}</p>
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${REQUISICAO_STATUS_CORES[req.status]}`}>
                      {REQUISICAO_STATUS_LABELS[req.status]}
                    </span>
                    {saldoInsuficiente && (
                      <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full border text-red-400 bg-red-500/10 border-red-500/20 flex items-center gap-1">
                        <AlertTriangle size={10} /> Saldo insuficiente
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 font-semibold mt-0.5">Quantidade: {req.quantidade} · Saldo atual: {servico?.estoque ?? '—'}</p>
                  {req.observacao && <p className="text-[10px] text-slate-500 font-bold mt-1">{req.observacao}</p>}
                  <p className="text-[10px] text-slate-600 font-bold uppercase mt-1">{fmtData(req.created_at)}</p>
                </div>
                {isLideranca && req.status === 'solicitada' && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => aprovar(req)} disabled={processando === req.id}
                      className="inline-flex items-center gap-1.5 bg-[#22C55E]/10 border border-[#22C55E]/30 text-[#22C55E] hover:bg-[#22C55E] hover:text-[#0B1120] px-3 py-2 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all disabled:opacity-50">
                      {processando === req.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Aprovar
                    </button>
                    <button onClick={() => rejeitar(req)} disabled={processando === req.id}
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
