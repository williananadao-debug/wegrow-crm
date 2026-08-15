"use client";
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';
import ArgusTopNav from '../ArgusTopNav';
import DashboardPage from '@/app/dashboard/page';
import { ArgusEdital, fmtMoeda, fmtMoedaCompacta } from '../shared';

const MESES_LABEL = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Componente-porta sem hooks próprios (mesmo motivo do Painel Geral: React exige a mesma
// sequência de hooks em toda renderização, então o "if" de vertical não pode ficar dentro
// de um componente que já usa hooks antes e depois do branch).
export default function ArgusDashboardWrapperPage() {
  const auth = useAuth() || {};
  const empresa = auth.empresa;
  if ((empresa?.modulos?.argus_vertical || 'licitacao') === 'veiculos') {
    return <ArgusDashboardVeiculos />;
  }
  return <ArgusDashboardLicitacao />;
}

// Veículos não tem reclamação de visual/insight ainda — continua reaproveitando o
// Dashboard padrão do CRM (mesma decisão original, ver histórico do módulo).
function ArgusDashboardVeiculos() {
  const auth = useAuth() || {};
  const empresa = auth.empresa;
  return (
    <div>
      <ArgusTopNav nomeEmpresa={empresa?.nome} />
      <div className="bg-[#0B1120] min-h-screen p-4 md:p-8">
        <DashboardPage />
      </div>
    </div>
  );
}

function Kpi({ titulo, valor, corBorda }: { titulo: string; valor: string; corBorda: string }) {
  return (
    <div className={`bg-white border border-[#e5e0d5] border-t-4 ${corBorda} rounded-2xl p-5 shadow-sm`}>
      <p className="text-[11px] font-bold text-[#9a958a] uppercase tracking-wide mb-2">{titulo}</p>
      <p className="text-2xl font-bold text-[#241c14]">{valor}</p>
    </div>
  );
}

function BarraProporcional({ label, valor, max, cor, sufixo }: { label: string; valor: number; max: number; cor: string; sufixo: string }) {
  const largura = max > 0 ? Math.max((valor / max) * 100, valor > 0 ? 3 : 0) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12px] font-bold text-[#241c14]">{label}</span>
        <span className="text-[12px] font-bold text-[#6b6862]">{sufixo}</span>
      </div>
      <div className="h-2.5 bg-[#f0ede6] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${cor}`} style={{ width: `${largura}%` }} />
      </div>
    </div>
  );
}

const STATUS_ORDEM: { status: ArgusEdital['status_interesse']; label: string; cor: string }[] = [
  { status: 'candidato', label: 'Candidato', cor: 'bg-[#c4c0b4]' },
  { status: 'acompanhando', label: 'Acompanhando', cor: 'bg-[#1d6fd9]' },
  { status: 'proposta_enviada', label: 'Proposta Enviada', cor: 'bg-[#d9861c]' },
  { status: 'ganho', label: 'Ganho', cor: 'bg-[#1fa85a]' },
  { status: 'perdido', label: 'Perdido', cor: 'bg-[#d63f3f]' },
  { status: 'arquivado', label: 'Arquivado', cor: 'bg-[#e5e0d5]' },
];

function ArgusDashboardLicitacao() {
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const empresa = auth.empresa;

  const [editais, setEditais] = useState<ArgusEdital[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!perfil?.empresa_id) return;
    supabase.from('argus_editais').select('*').eq('empresa_id', perfil.empresa_id).limit(1000)
      .then(({ data }) => { setEditais((data as ArgusEdital[]) || []); setLoading(false); });
  }, [perfil?.empresa_id]);

  if (loading) return <div><ArgusTopNav nomeEmpresa={empresa?.nome} /><div className="p-8 flex justify-center"><Loader2 size={22} className="animate-spin text-[#d9861c]" /></div></div>;

  const emDisputa = editais.filter(e => ['candidato', 'acompanhando', 'proposta_enviada'].includes(e.status_interesse));
  const valorEmDisputa = emDisputa.reduce((acc, e) => acc + Number(e.valor_estimado || 0), 0);
  const ganhos = editais.filter(e => e.status_interesse === 'ganho');
  const valorGanho = ganhos.reduce((acc, e) => acc + Number(e.valor_homologado || e.valor_proposto || e.valor_estimado || 0), 0);
  const perdidos = editais.filter(e => e.status_interesse === 'perdido');
  const finalizados = ganhos.length + perdidos.length;
  const taxaExito = finalizados > 0 ? Math.round((ganhos.length / finalizados) * 100) : 0;
  const ticketMedio = ganhos.length > 0 ? valorGanho / ganhos.length : 0;

  const porStatus = STATUS_ORDEM.map(s => ({
    ...s,
    qtd: editais.filter(e => e.status_interesse === s.status).length,
  }));
  const maxStatus = Math.max(...porStatus.map(s => s.qtd), 1);

  // Evolução mensal: quantos editais entraram no radar e quantos foram ganhos em cada um
  // dos últimos 6 meses. "Ganho no mês" usa updated_at como proxy de quando o status virou
  // ganho (não existe campo dedicado "data_ganho") — mesma aproximação já usada na tela de
  // Financeiro do Argus.
  const hoje = new Date();
  const ultimosMeses = Array.from({ length: 6 }, (_, i) => {
    const ref = new Date(hoje.getFullYear(), hoje.getMonth() - (5 - i), 1);
    const criados = editais.filter(e => {
      const d = new Date(e.created_at);
      return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
    }).length;
    const ganhosMes = editais.filter(e => {
      if (e.status_interesse !== 'ganho') return false;
      const d = new Date(e.updated_at);
      return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
    }).length;
    return { label: `${MESES_LABEL[ref.getMonth()]}`, criados, ganhos: ganhosMes };
  });
  const maxMes = Math.max(...ultimosMeses.map(m => Math.max(m.criados, m.ganhos)), 1);

  const porOrgao = Object.values(editais.reduce((acc: Record<string, { nome: string; valor: number }>, e) => {
    const nome = e.orgao || 'Sem órgão';
    if (!acc[nome]) acc[nome] = { nome, valor: 0 };
    acc[nome].valor += Number(e.valor_estimado || 0);
    return acc;
  }, {})).sort((a, b) => b.valor - a.valor).slice(0, 5);
  const maxOrgao = Math.max(...porOrgao.map(o => o.valor), 1);

  const porModalidade = Object.values(editais.reduce((acc: Record<string, { nome: string; qtd: number }>, e) => {
    const nome = e.modalidade || 'Não informada';
    if (!acc[nome]) acc[nome] = { nome, qtd: 0 };
    acc[nome].qtd += 1;
    return acc;
  }, {})).sort((a, b) => b.qtd - a.qtd).slice(0, 6);
  const maxModalidade = Math.max(...porModalidade.map(m => m.qtd), 1);

  return (
    <div>
      <ArgusTopNav nomeEmpresa={empresa?.nome} />
      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-[#241c14] mb-6" style={{ fontFamily: 'var(--font-argus-serif)' }}>Dashboard</h1>

        {editais.length === 0 ? (
          <div className="bg-white border border-[#e5e0d5] rounded-2xl p-10 text-center">
            <p className="text-[#6b6862] font-semibold text-sm">Nenhum edital acompanhado ainda — os gráficos aparecem assim que houver dado.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <Kpi titulo="Valor em disputa" valor={fmtMoedaCompacta(valorEmDisputa)} corBorda="border-t-[#1d6fd9]" />
              <Kpi titulo="Valor ganho (total)" valor={fmtMoedaCompacta(valorGanho)} corBorda="border-t-[#1fa85a]" />
              <Kpi titulo="Taxa de êxito" valor={`${taxaExito}%`} corBorda="border-t-[#d9861c]" />
              <Kpi titulo="Ticket médio (ganhos)" valor={fmtMoedaCompacta(ticketMedio)} corBorda="border-t-[#241c14]" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              <div className="bg-white border border-[#e5e0d5] rounded-2xl p-5">
                <p className="text-[12px] font-bold text-[#9a958a] uppercase tracking-wide mb-4">Funil por status</p>
                <div className="space-y-3">
                  {porStatus.map(s => (
                    <BarraProporcional key={s.status} label={s.label} valor={s.qtd} max={maxStatus} cor={s.cor} sufixo={`${s.qtd}`} />
                  ))}
                </div>
              </div>

              <div className="bg-white border border-[#e5e0d5] rounded-2xl p-5">
                <p className="text-[12px] font-bold text-[#9a958a] uppercase tracking-wide mb-4">Evolução mensal — editais no radar vs ganhos</p>
                <div className="flex items-end gap-3 h-36">
                  {ultimosMeses.map((m, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                      <div className="w-full flex items-end justify-center gap-1 h-28">
                        <div className="w-1/2 rounded-t-md bg-[#c9dcf7]" style={{ height: `${Math.max((m.criados / maxMes) * 100, m.criados > 0 ? 4 : 0)}%` }} title={`${m.criados} no radar`} />
                        <div className="w-1/2 rounded-t-md bg-[#1fa85a]" style={{ height: `${Math.max((m.ganhos / maxMes) * 100, m.ganhos > 0 ? 4 : 0)}%` }} title={`${m.ganhos} ganhos`} />
                      </div>
                      <span className="text-[10px] text-[#9a958a] font-bold uppercase">{m.label}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[#f0ede6]">
                  <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#6b6862]"><span className="w-2.5 h-2.5 rounded-sm bg-[#c9dcf7]" /> No radar</span>
                  <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#6b6862]"><span className="w-2.5 h-2.5 rounded-sm bg-[#1fa85a]" /> Ganhos</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white border border-[#e5e0d5] rounded-2xl p-5">
                <p className="text-[12px] font-bold text-[#9a958a] uppercase tracking-wide mb-4">Top órgãos por valor estimado</p>
                {porOrgao.length === 0 ? (
                  <p className="text-[13px] text-[#9a958a] font-semibold">Sem dados suficientes ainda.</p>
                ) : (
                  <div className="space-y-3">
                    {porOrgao.map(o => (
                      <BarraProporcional key={o.nome} label={o.nome} valor={o.valor} max={maxOrgao} cor="bg-[#d9861c]" sufixo={fmtMoeda(o.valor)} />
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white border border-[#e5e0d5] rounded-2xl p-5">
                <p className="text-[12px] font-bold text-[#9a958a] uppercase tracking-wide mb-4">Por modalidade</p>
                {porModalidade.length === 0 ? (
                  <p className="text-[13px] text-[#9a958a] font-semibold">Sem dados suficientes ainda.</p>
                ) : (
                  <div className="space-y-3">
                    {porModalidade.map(m => (
                      <BarraProporcional key={m.nome} label={m.nome} valor={m.qtd} max={maxModalidade} cor="bg-[#1d6fd9]" sufixo={`${m.qtd}`} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
