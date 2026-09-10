"use client";
import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Loader2, Activity, Receipt, Search, X, Filter, FileText, FileCode2, Copy, Check, TrendingUp, TrendingDown, Boxes, History, ListChecks } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { usePulseAccess } from '../usePulseAccess';
import { ServicoConfig } from '../shared';
import RevisarItensNotaModal from '@/components/RevisarItensNotaModal';

type NotaFiscal = {
  id: number; tipo: 'entrada' | 'saida'; chave_acesso: string | null;
  numero: string | null; serie: string | null;
  cnpj_participante: string | null; nome_participante: string | null;
  valor_total: number | null; status: string;
  xml_url: string | null; danfe_url: string | null;
  data_emissao: string | null; origem: string; observacao: string | null;
  itens_status: 'sem_itens' | 'pendente_revisao' | 'processado';
  created_at: string;
};

const STATUS_LABEL: Record<string, { label: string; cor: string }> = {
  autorizada: { label: 'Autorizada', cor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  pendente:   { label: 'Pendente',   cor: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  cancelada:  { label: 'Cancelada',  cor: 'text-slate-400 bg-white/5 border-white/10' },
  rejeitada:  { label: 'Rejeitada',  cor: 'text-red-400 bg-red-500/10 border-red-500/20' },
};

// A origem explica pro usuário por que a nota apareceu sozinha na tela — nota capturada
// pelo Focus NFe chega sem ninguém digitar nada (MD-e), a manual veio da foto lida no
// Estoque. Sem isso o cliente estranha ver nota que ele não lançou.
const ORIGEM_LABEL: Record<string, string> = {
  manifestacao_focus_nfe: 'Capturada automática',
  emissao_focus_nfe: 'Emitida pelo sistema',
  manual: 'Lançada na mão',
};

const PERIODOS = [
  { id: '30d', label: '30 dias' }, { id: '90d', label: '90 dias' }, { id: '12m', label: '12 meses' }, { id: 'tudo', label: 'Tudo' },
] as const;

const DIAS_PERIODO: Record<string, number> = { '30d': 30, '90d': 90, '12m': 365 };

const formatCnpj = (v: string | null) => {
  const d = (v || '').replace(/\D/g, '');
  if (d.length !== 14) return v || '';
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
};

export default function FiscalPage() {
  const { authLoading, temPulse, perfil, isLideranca, user } = usePulseAccess();

  const [notas, setNotas] = useState<NotaFiscal[]>([]);
  const [servicos, setServicos] = useState<ServicoConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'entrada' | 'saida'>('todos');
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');
  const [filtroPeriodo, setFiltroPeriodo] = useState<typeof PERIODOS[number]['id']>('90d');
  const [busca, setBusca] = useState('');
  const [chaveCopiada, setChaveCopiada] = useState<number | null>(null);
  const [notaEmRevisao, setNotaEmRevisao] = useState<NotaFiscal | null>(null);
  const [buscandoHistorico, setBuscandoHistorico] = useState(false);
  const [resultadoHistorico, setResultadoHistorico] = useState<string | null>(null);
  // "Agora" travado num state em vez de Date.now() dentro do useMemo — chamar função
  // impura no render é proibido pela regra de pureza do React. A tela não fica aberta
  // por dias, então fixar na montagem é suficiente pro corte de período.
  const [agora] = useState(() => Date.now());

  const carregar = useCallback(() => {
    if (!perfil?.empresa_id) return;
    setLoading(true);
    Promise.all([
      supabase.from('fiscal_notas').select('*').eq('empresa_id', perfil.empresa_id)
        .order('data_emissao', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1000),
      supabase.from('servicos').select('*').eq('empresa_id', perfil.empresa_id).order('nome'),
    ]).then(([resNotas, resServicos]) => {
      if (resNotas.data) setNotas(resNotas.data as NotaFiscal[]);
      if (resServicos.data) setServicos(resServicos.data as ServicoConfig[]);
      setLoading(false);
    });
  }, [perfil?.empresa_id]);

  useEffect(() => { carregar(); }, [carregar]);

  const buscarHistoricoCompleto = async () => {
    setBuscandoHistorico(true); setResultadoHistorico(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');
      const res = await fetch('/api/pulse/fiscal/backfill', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao buscar histórico.');
      const partes = [
        `${json.notasNovas} nota(s) nova(s) encontrada(s) no histórico`,
        `${json.notasComItens} com itens lidos do XML`,
      ];
      if (json.falhas) partes.push(`${json.falhas} falharam`);
      let msg = partes.join(', ') + '.';
      if (json.rateLimitado) msg += ' Parou por excesso de chamada ao Focus NFe (rate limit) — clique em "Buscar histórico completo" de novo pra continuar de onde parou.';
      else if (json.parcial) msg += ` Ainda restam ~${json.restantesEstimado} nota(s) pra processar — clique de novo pra continuar.`;
      setResultadoHistorico(msg);
      carregar();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'falha ao buscar histórico.';
      setResultadoHistorico(`Erro: ${msg}`);
    } finally {
      setBuscandoHistorico(false);
    }
  };

  const filtradas = useMemo(() => {
    const limite = filtroPeriodo === 'tudo' || !agora ? null : agora - DIAS_PERIODO[filtroPeriodo] * 86400000;
    return notas.filter(n => {
      // data_emissao pode vir vazia (webhook sem o campo) — nesses casos vale o created_at,
      // senão a nota sumiria de qualquer filtro de período que não fosse "Tudo".
      const referencia = new Date(n.data_emissao || n.created_at).getTime();
      if (limite && referencia < limite) return false;
      if (filtroTipo !== 'todos' && n.tipo !== filtroTipo) return false;
      if (filtroStatus !== 'todos' && n.status !== filtroStatus) return false;
      if (busca.trim()) {
        const alvo = busca.trim().toLowerCase();
        const campos = [n.nome_participante, n.cnpj_participante, n.numero, n.chave_acesso].map(c => (c || '').toLowerCase());
        if (!campos.some(c => c.includes(alvo))) return false;
      }
      return true;
    });
  }, [notas, filtroTipo, filtroStatus, filtroPeriodo, busca, agora]);

  const totais = useMemo(() => {
    const validas = filtradas.filter(n => n.status !== 'cancelada' && n.status !== 'rejeitada');
    const entradas = validas.filter(n => n.tipo === 'entrada');
    const saidas = validas.filter(n => n.tipo === 'saida');
    const soma = (lista: NotaFiscal[]) => lista.reduce((s, n) => s + (n.valor_total || 0), 0);
    return {
      qtdEntradas: entradas.length, valorEntradas: soma(entradas),
      qtdSaidas: saidas.length, valorSaidas: soma(saidas),
      pendentes: filtradas.filter(n => n.status === 'pendente').length,
    };
  }, [filtradas]);

  const copiarChave = (nota: NotaFiscal) => {
    if (!nota.chave_acesso) return;
    navigator.clipboard.writeText(nota.chave_acesso);
    setChaveCopiada(nota.id);
    setTimeout(() => setChaveCopiada(null), 1500);
  };

  if (authLoading) return <div className="p-8 flex justify-center"><Loader2 size={24} className="animate-spin text-slate-600" /></div>;

  if (!temPulse) {
    return (
      <div className="p-4 md:p-8 pb-20 text-white">
        <div className="bg-[#0F172A] border border-white/10 rounded-3xl p-10 text-center">
          <Activity size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-sm">O módulo Pulse não está ativo pra sua empresa ainda.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 pb-20 text-white">
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tighter uppercase italic text-[var(--cor-primaria)] flex items-center gap-3">
            <Receipt size={32} /> Notas Fiscais
          </h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Entradas capturadas na SEFAZ e saídas emitidas</p>
        </div>
        <div className="flex flex-wrap gap-2 self-start md:self-auto">
          {isLideranca && (
            <button onClick={buscarHistoricoCompleto} disabled={buscandoHistorico} className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 disabled:opacity-50 border border-white/10 text-slate-300 hover:text-white px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all">
              {buscandoHistorico ? <Loader2 size={14} className="animate-spin" /> : <History size={14} />}
              {buscandoHistorico ? 'Buscando...' : 'Buscar histórico completo'}
            </button>
          )}
          <Link href="/pulse/estoque" className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all">
            <Boxes size={14} /> Lançar nota por foto
          </Link>
        </div>
      </header>

      {resultadoHistorico && (
        <div className={`mb-4 rounded-xl p-3 text-xs font-bold ${resultadoHistorico.startsWith('Erro') ? 'bg-red-500/10 border border-red-500/20 text-red-400' : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'}`}>
          {resultadoHistorico}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><TrendingDown size={10} /> Notas de entrada</p>
          <p className="text-xl font-black text-purple-400 mt-1">{totais.qtdEntradas}</p>
        </div>
        <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Valor comprado</p>
          <p className="text-xl font-black text-white mt-1">R$ {totais.valorEntradas.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
        </div>
        <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><TrendingUp size={10} /> Notas de saída</p>
          <p className="text-xl font-black text-orange-400 mt-1">{totais.qtdSaidas}</p>
        </div>
        <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Valor faturado</p>
          <p className="text-xl font-black text-[var(--cor-primaria)] mt-1">R$ {totais.valorSaidas.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
        </div>
      </div>

      <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-4 mb-4 space-y-3">
        <div className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-xl px-3 py-2.5">
          <Search size={14} className="text-slate-500 flex-shrink-0" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por fornecedor/cliente, CNPJ, número ou chave de acesso..." className="flex-1 bg-transparent outline-none text-white text-sm" />
          {busca && <button onClick={() => setBusca('')} className="text-slate-500 hover:text-white"><X size={14} /></button>}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1"><Filter size={11} /> Filtros:</span>
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value as 'todos' | 'entrada' | 'saida')} className="bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-[var(--cor-primaria)]">
            <option value="todos" className="bg-[#0B1120]">Entrada e saída</option>
            <option value="entrada" className="bg-[#0B1120]">Só entrada (compras)</option>
            <option value="saida" className="bg-[#0B1120]">Só saída (vendas)</option>
          </select>
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className="bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-[var(--cor-primaria)]">
            <option value="todos" className="bg-[#0B1120]">Todos os status</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k} className="bg-[#0B1120]">{v.label}</option>)}
          </select>
          <div className="flex gap-1 bg-black/30 border border-white/10 rounded-lg p-1">
            {PERIODOS.map(p => (
              <button key={p.id} onClick={() => setFiltroPeriodo(p.id)} className={`px-2.5 py-1 rounded text-[10px] font-black uppercase transition-all ${filtroPeriodo === p.id ? 'bg-[var(--cor-primaria)] text-[#0B1120]' : 'text-slate-400 hover:text-white'}`}>
                {p.label}
              </button>
            ))}
          </div>
          {totais.pendentes > 0 && (
            <span className="text-[10px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded uppercase tracking-widest">
              {totais.pendentes} aguardando SEFAZ
            </span>
          )}
        </div>
      </div>

      <div className="bg-[#0F172A] border border-white/10 rounded-3xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={20} className="animate-spin text-slate-600" /></div>
        ) : filtradas.length === 0 ? (
          <div className="p-14 text-center">
            <Receipt size={28} className="text-slate-600 mx-auto mb-2" />
            <p className="text-slate-500 text-sm font-bold">Nenhuma nota fiscal nesse filtro.</p>
            <p className="text-slate-600 text-xs mt-1">As notas de compra aparecem sozinhas assim que a SEFAZ avisar o Focus NFe.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filtradas.map(n => {
              const status = STATUS_LABEL[n.status] || { label: n.status, cor: 'text-slate-400 bg-white/5 border-white/10' };
              const entrada = n.tipo === 'entrada';
              return (
                <div key={n.id} className="flex items-start gap-3 p-4">
                  <span className={`shrink-0 text-[8px] font-black px-2 py-1 rounded border uppercase tracking-widest ${entrada ? 'text-purple-400 bg-purple-500/10 border-purple-500/20' : 'text-orange-400 bg-orange-500/10 border-orange-500/20'}`}>
                    {entrada ? 'Entrada' : 'Saída'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-white font-bold text-sm truncate">{n.nome_participante || (entrada ? 'Fornecedor não identificado' : 'Cliente não identificado')}</p>
                      <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border uppercase ${status.cor}`}>{status.label}</span>
                      <span className="text-[8px] font-black bg-white/5 text-slate-500 px-1.5 py-0.5 rounded uppercase">{ORIGEM_LABEL[n.origem] || n.origem}</span>
                      {n.itens_status === 'pendente_revisao' && (
                        <button onClick={() => setNotaEmRevisao(n)} className="inline-flex items-center gap-1 text-[8px] font-black px-1.5 py-0.5 rounded border uppercase bg-purple-500/10 border-purple-500/20 text-purple-300 hover:bg-purple-500/20 transition-colors">
                          <ListChecks size={9} /> Revisar itens
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5 text-[10px] text-slate-500">
                      {n.numero && <span className="text-slate-400 font-bold">NF {n.numero}{n.serie ? `/${n.serie}` : ''}</span>}
                      {n.cnpj_participante && <span>{formatCnpj(n.cnpj_participante)}</span>}
                      {n.chave_acesso && (
                        <button onClick={() => copiarChave(n)} className="inline-flex items-center gap-1 hover:text-white transition-colors font-mono" title={n.chave_acesso}>
                          {chaveCopiada === n.id ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                          {chaveCopiada === n.id ? 'copiada' : `...${n.chave_acesso.slice(-8)}`}
                        </button>
                      )}
                    </div>
                    {(n.danfe_url || n.xml_url) && (
                      <div className="flex items-center gap-2 mt-1.5">
                        {n.danfe_url && (
                          <a href={n.danfe_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-2 py-1 rounded-lg transition-all">
                            <FileText size={10} /> DANFE
                          </a>
                        )}
                        {n.xml_url && (
                          <a href={n.xml_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-2 py-1 rounded-lg transition-all">
                            <FileCode2 size={10} /> XML
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-black text-sm ${entrada ? 'text-purple-400' : 'text-[var(--cor-primaria)]'}`}>
                      {n.valor_total != null ? `R$ ${n.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                    </p>
                    <p className="text-slate-600 text-[10px] mt-0.5">
                      {new Date(n.data_emissao || n.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {!loading && notas.length >= 1000 && (
        <p className="text-slate-600 text-[10px] text-center mt-3">Mostrando as 1000 notas mais recentes — refine os filtros pra achar algo mais antigo.</p>
      )}

      <RevisarItensNotaModal
        aberto={!!notaEmRevisao}
        onFechar={() => setNotaEmRevisao(null)}
        notaId={notaEmRevisao?.id ?? null}
        notaLabel={notaEmRevisao ? `${notaEmRevisao.nome_participante || 'Fornecedor'}${notaEmRevisao.numero ? ` — NF ${notaEmRevisao.numero}` : ''}` : ''}
        servicos={servicos}
        empresaId={perfil?.empresa_id}
        userId={user?.id}
        onConcluido={carregar}
      />
    </div>
  );
}
