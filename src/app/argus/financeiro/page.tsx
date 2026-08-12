"use client";
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Loader2, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import ArgusTopNav from '../ArgusTopNav';
import { ArgusEdital, fmtMoeda, fmtData } from '../shared';

type Lancamento = { id: number; titulo: string; valor: number; tipo: string; status: string; data_vencimento: string | null; edital_id: number | null };

export default function ArgusFinanceiroPage() {
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const empresa = auth.empresa;

  const [editais, setEditais] = useState<ArgusEdital[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!perfil?.empresa_id) return;
    Promise.all([
      supabase.from('argus_editais').select('*').eq('empresa_id', perfil.empresa_id),
      supabase.from('lancamentos').select('id, titulo, valor, tipo, status, data_vencimento, edital_id').eq('empresa_id', perfil.empresa_id).not('edital_id', 'is', null),
    ]).then(([editaisRes, lancRes]) => {
      setEditais((editaisRes.data as ArgusEdital[]) || []);
      setLancamentos((lancRes.data as Lancamento[]) || []);
      setLoading(false);
    });
  }, [perfil?.empresa_id]);

  const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
  const ganhosNoMes = editais.filter(e => e.status_interesse === 'ganho' && new Date(e.updated_at) >= inicioMes);
  const receitaMes = ganhosNoMes.reduce((acc, e) => acc + Number(e.valor_homologado || e.valor_proposto || 0), 0);

  const finalizados = editais.filter(e => ['ganho', 'perdido'].includes(e.status_interesse));
  const ganhos = editais.filter(e => e.status_interesse === 'ganho');
  const taxaExito = finalizados.length > 0 ? Math.round((ganhos.length / finalizados.length) * 100) : 0;

  const emDisputa = editais.filter(e => ['candidato', 'acompanhando', 'proposta_enviada'].includes(e.status_interesse));
  const valorEmDisputa = emDisputa.reduce((acc, e) => acc + Number(e.valor_estimado || 0), 0);

  const hoje = new Date().toISOString().split('T')[0];
  const pagamentosAtraso = lancamentos.filter(l => l.status === 'pendente' && l.data_vencimento && l.data_vencimento < hoje);
  const valorAtraso = pagamentosAtraso.reduce((acc, l) => acc + Number(l.valor || 0), 0);

  if (loading) return <div><ArgusTopNav nomeEmpresa={empresa?.nome} /><div className="p-8 flex justify-center"><Loader2 size={22} className="animate-spin text-[#d9861c]" /></div></div>;

  return (
    <div>
      <ArgusTopNav nomeEmpresa={empresa?.nome} />
      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-[#241c14] mb-6" style={{ fontFamily: 'var(--font-argus-serif)' }}>Financeiro</h1>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Kpi titulo="Receita · este mês" valor={fmtMoeda(receitaMes)} corBorda="border-t-[#d9861c]" />
          <Kpi titulo="Taxa de êxito" valor={`${taxaExito}%`} corBorda="border-t-[#1fa85a]" />
          <Kpi titulo="Valor em disputa" valor={fmtMoeda(valorEmDisputa)} corBorda="border-t-[#1d6fd9]" />
          <Kpi titulo="Pagamentos em atraso" valor={fmtMoeda(valorAtraso)} corBorda="border-t-[#d63f3f]" alerta={pagamentosAtraso.length > 0} />
        </div>

        <div className="bg-white border border-[#e5e0d5] rounded-2xl p-5">
          <p className="text-[12px] font-bold text-[#9a958a] uppercase tracking-wide mb-3">Lançamentos vinculados a editais</p>
          {lancamentos.length === 0 ? (
            <p className="text-[13px] text-[#9a958a] font-semibold">Nenhum lançamento financeiro vinculado a edital ainda — medições/pagamentos aparecem aqui quando lançados no módulo Financeiro com o edital marcado.</p>
          ) : (
            <div className="space-y-2">
              {lancamentos.map(l => (
                <div key={l.id} className="flex items-center justify-between gap-3 py-2 border-b border-[#f0ede6] last:border-0">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#241c14] truncate">{l.titulo}</p>
                    <p className="text-[12px] text-[#9a958a] font-semibold">Vencimento: {fmtData(l.data_vencimento)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {l.tipo === 'entrada' ? <TrendingUp size={13} className="text-[#1fa85a]" /> : <TrendingDown size={13} className="text-[#d63f3f]" />}
                    <span className="text-xs font-bold text-[#241c14]">{fmtMoeda(l.valor)}</span>
                    {l.status === 'pendente' && l.data_vencimento && l.data_vencimento < hoje && <AlertCircle size={13} className="text-[#d63f3f]" />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Kpi({ titulo, valor, corBorda, alerta }: { titulo: string; valor: string; corBorda: string; alerta?: boolean }) {
  return (
    <div className={`bg-white border border-[#e5e0d5] border-t-4 ${corBorda} rounded-2xl p-5 shadow-sm`}>
      <p className="text-[11px] font-bold text-[#9a958a] uppercase tracking-wide mb-2">{titulo}</p>
      <p className={`text-2xl font-bold ${alerta ? 'text-[#d63f3f]' : 'text-[#241c14]'}`}>{valor}</p>
    </div>
  );
}
