"use client";
import { useState, useEffect, useCallback, useMemo } from 'react';
import { ListChecks, Loader2, User, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import AdvocaciaTopNav from '../AdvocaciaTopNav';
import {
  AdvocaciaTarefa, PRIORIDADE_TAREFA_LABELS, PRIORIDADE_TAREFA_CORES,
  STATUS_TAREFA_LABELS, STATUS_TAREFA_CORES, fmtData,
} from '../shared';

type PerfilOpcao = { id: string; nome: string };
type TarefaComProcesso = AdvocaciaTarefa & {
  advocacia_processos: { cliente_nome: string; numero_processo: string | null; lead_id: number | null } | null;
};

// "Minhas tarefas" — visão cruzando todos os processos de um advogado, o que Prazos não
// permitia (sem responsável próprio). Toggle "Toda a equipe" mostra tudo, sem restrição de
// cargo — RLS já limita à mesma empresa, aqui é só um filtro de conveniência.
export default function AdvocaciaTarefasPage() {
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  const nomeEmpresa = empresa?.nome;

  const [tarefas, setTarefas] = useState<TarefaComProcesso[]>([]);
  const [advogados, setAdvogados] = useState<PerfilOpcao[]>([]);
  const [loading, setLoading] = useState(true);
  const [verEquipe, setVerEquipe] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState<'todas' | AdvocaciaTarefa['status']>('todas');

  const carregar = useCallback(async () => {
    if (!perfil?.empresa_id) return;
    setLoading(true);
    const [{ data: tarefasData }, { data: perfisData }] = await Promise.all([
      supabase.from('advocacia_tarefas')
        .select('id, processo_id, titulo, descricao, responsavel_id, prioridade, status, data_prevista, concluida_em, created_at, advocacia_processos(cliente_nome, numero_processo, lead_id)')
        .eq('empresa_id', perfil.empresa_id)
        .order('data_prevista', { ascending: true, nullsFirst: false }),
      supabase.from('profiles').select('id, nome').eq('empresa_id', perfil.empresa_id),
    ]);
    setTarefas((tarefasData as any) || []);
    setAdvogados((perfisData as PerfilOpcao[]) || []);
    setLoading(false);
  }, [perfil?.empresa_id]);

  useEffect(() => { carregar(); }, [carregar]);

  const nomeResponsavel = (id?: string | null) => advogados.find(a => a.id === id)?.nome || '—';

  const mudarStatus = async (id: number, status: AdvocaciaTarefa['status']) => {
    const concluida_em = status === 'concluida' ? new Date().toISOString() : null;
    setTarefas(prev => prev.map(t => t.id === id ? { ...t, status, concluida_em } : t));
    await supabase.from('advocacia_tarefas').update({ status, concluida_em }).eq('id', id);
  };

  const hoje = new Date().toISOString().substring(0, 10);
  const filtradas = useMemo(() => {
    return tarefas
      .filter(t => verEquipe || t.responsavel_id === perfil?.id)
      .filter(t => filtroStatus === 'todas' || t.status === filtroStatus);
  }, [tarefas, verEquipe, filtroStatus, perfil?.id]);

  const pendentesCount = tarefas.filter(t => (verEquipe || t.responsavel_id === perfil?.id) && t.status !== 'concluida').length;
  const atrasadasCount = tarefas.filter(t => (verEquipe || t.responsavel_id === perfil?.id) && t.status !== 'concluida' && t.data_prevista && t.data_prevista < hoje).length;

  return (
    <div>
      <AdvocaciaTopNav nomeEmpresa={nomeEmpresa} />
      <div className="max-w-[1100px] mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-[22px] font-bold text-[#241c14] flex items-center gap-2" style={{ fontFamily: 'var(--font-advocacia-serif)' }}>
              <ListChecks size={22} className="text-[#d9861c]" /> {verEquipe ? 'Tarefas da equipe' : 'Minhas tarefas'}
            </h1>
            <p className="text-[13px] text-[#6b6862] mt-1">{pendentesCount} pendente(s) · {atrasadasCount} atrasada(s)</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setVerEquipe(v => !v)}
              className="flex items-center gap-2 border border-[#e5e0d5] hover:border-[#d9861c] bg-white px-3.5 py-2 rounded-lg text-[13px] font-semibold text-[#241c14] transition-all">
              {verEquipe ? <Users size={14} /> : <User size={14} />} {verEquipe ? 'Toda a equipe' : 'Só as minhas'}
            </button>
            <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as any)}
              className="border border-[#e5e0d5] rounded-lg px-3 py-2 text-[13px] bg-white focus:outline-none focus:border-[#d9861c]">
              <option value="todas">Todos os status</option>
              {Object.entries(STATUS_TAREFA_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-[#d9861c]" /></div>
        ) : filtradas.length === 0 ? (
          <div className="bg-white border border-[#e5e0d5] rounded-2xl p-10 text-center">
            <ListChecks size={28} className="text-[#d9861c] mx-auto mb-3" />
            <p className="text-[#6b6862] text-[13px] font-semibold">Nenhuma tarefa por aqui — adicione tarefas direto na tela de um processo.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtradas.map(t => {
              const atrasada = t.status !== 'concluida' && t.data_prevista && t.data_prevista < hoje;
              return (
                <div key={t.id} className="flex items-center gap-3 bg-white border border-[#e5e0d5] rounded-xl px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className={`text-[14px] font-semibold truncate ${t.status === 'concluida' ? 'line-through text-[#9a958a]' : 'text-[#241c14]'}`}>{t.titulo}</p>
                    <p className="text-[12px] text-[#9a958a] mt-0.5 truncate">
                      {t.advocacia_processos?.cliente_nome || 'Processo'}{t.advocacia_processos?.numero_processo ? ` · ${t.advocacia_processos.numero_processo}` : ''}
                      {verEquipe ? ` · ${nomeResponsavel(t.responsavel_id)}` : ''}
                    </p>
                  </div>
                  {t.data_prevista && (
                    <span className={`text-[11px] font-semibold flex-shrink-0 ${atrasada ? 'text-[#d13b3b]' : 'text-[#6b6862]'}`}>{fmtData(t.data_prevista)}</span>
                  )}
                  <span className={`text-[9px] font-bold uppercase px-2 py-1 rounded-full border flex-shrink-0 ${PRIORIDADE_TAREFA_CORES[t.prioridade]}`}>{PRIORIDADE_TAREFA_LABELS[t.prioridade]}</span>
                  <select value={t.status} onChange={e => mudarStatus(t.id, e.target.value as AdvocaciaTarefa['status'])}
                    className={`text-[10px] font-bold uppercase px-2 py-1.5 rounded-lg border flex-shrink-0 outline-none ${STATUS_TAREFA_CORES[t.status]}`}>
                    {Object.entries(STATUS_TAREFA_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
