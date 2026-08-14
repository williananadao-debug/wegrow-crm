"use client";
import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Loader2, Percent, Save } from 'lucide-react';
import ArgusTopNav from '../ArgusTopNav';
import { fmtMoeda } from '../shared';

type LeadGanho = {
  id: number;
  empresa: string;
  valor_total: number;
  vendedor_nome: string | null;
  veiculo_referencia: string | null;
  created_at: string;
};

export default function ArgusComissoesPage() {
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  const isLideranca = perfil?.cargo === 'diretor' || perfil?.cargo === 'gerente';

  const [leads, setLeads] = useState<LeadGanho[]>([]);
  const [percentual, setPercentual] = useState('0');
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState('');

  const carregar = async () => {
    if (!perfil?.empresa_id) return;
    setLoading(true);
    const [{ data: leadsData }, { data: config }] = await Promise.all([
      supabase.from('leads').select('id, empresa, valor_total, vendedor_nome, veiculo_referencia, created_at')
        .eq('empresa_id', perfil.empresa_id).eq('status', 'ganho').order('created_at', { ascending: false }).limit(500),
      supabase.from('argus_comissao_config').select('percentual').eq('empresa_id', perfil.empresa_id).maybeSingle(),
    ]);
    setLeads((leadsData as LeadGanho[]) || []);
    setPercentual(config?.percentual?.toString() || '0');
    setLoading(false);
  };

  useEffect(() => { carregar(); }, [perfil?.empresa_id]);

  const salvarPercentual = async () => {
    if (!perfil?.empresa_id) return;
    setSalvando(true);
    const { error } = await supabase.from('argus_comissao_config').upsert([{
      empresa_id: perfil.empresa_id, percentual: Number(percentual) || 0, criado_por: perfil.id, updated_at: new Date().toISOString(),
    }], { onConflict: 'empresa_id' });
    setSalvando(false);
    setToast(error ? `Erro: ${error.message}` : 'Percentual salvo!');
    setTimeout(() => setToast(''), 4000);
  };

  const pct = Number(percentual) || 0;
  const totalVendido = leads.reduce((acc, l) => acc + Number(l.valor_total || 0), 0);
  const totalComissao = totalVendido * (pct / 100);

  const porVendedor = Object.values(leads.reduce((acc: Record<string, { nome: string; valor: number; qtd: number }>, l) => {
    const nome = l.vendedor_nome || 'Sem vendedor';
    if (!acc[nome]) acc[nome] = { nome, valor: 0, qtd: 0 };
    acc[nome].valor += Number(l.valor_total || 0);
    acc[nome].qtd += 1;
    return acc;
  }, {})).sort((a, b) => b.valor - a.valor);

  return (
    <div>
      <ArgusTopNav nomeEmpresa={empresa?.nome} />
    <div className="p-4 md:p-8 pb-20 text-white">
      <h1 className="text-3xl font-black tracking-tighter uppercase italic text-white flex items-center gap-3 mb-6">
        <Percent size={26} className="text-[#22C55E]" /> Comissões
      </h1>

      {isLideranca && (
        <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-5 mb-6 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Percentual de comissão (%)</label>
            <input type="number" step="0.1" value={percentual} onChange={e => setPercentual(e.target.value)} className="w-40 bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-sm font-bold text-white outline-none focus:border-[#22C55E]" />
          </div>
          <button onClick={salvarPercentual} disabled={salvando} className="bg-[#22C55E] hover:bg-[#1ea34e] disabled:opacity-50 text-[#0B1120] px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2">
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
          </button>
          {toast && <span className="text-xs font-bold text-slate-400">{toast}</span>}
        </div>
      )}

      {loading ? (
        <div className="p-8 flex justify-center"><Loader2 size={22} className="animate-spin text-[#22C55E]" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-5">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Total vendido</p>
              <p className="text-2xl font-black text-white">{fmtMoeda(totalVendido)}</p>
            </div>
            <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-5">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Taxa aplicada</p>
              <p className="text-2xl font-black text-white">{pct}%</p>
            </div>
            <div className="bg-[#22C55E]/10 border border-[#22C55E]/30 rounded-2xl p-5">
              <p className="text-[11px] font-bold text-[#22C55E] uppercase tracking-wide mb-1">Comissão total</p>
              <p className="text-2xl font-black text-[#22C55E]">{fmtMoeda(totalComissao)}</p>
            </div>
          </div>

          {porVendedor.length > 0 && (
            <div className="mb-6">
              <p className="text-[13px] font-bold text-slate-500 uppercase tracking-widest mb-3">Por vendedor</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {porVendedor.map(v => (
                  <div key={v.nome} className="bg-[#0B1120] border border-white/10 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-white">{v.nome}</p>
                      <p className="text-[12px] text-slate-500 font-semibold">{v.qtd} venda(s) · {fmtMoeda(v.valor)}</p>
                    </div>
                    <p className="text-lg font-black text-[#22C55E]">{fmtMoeda(v.valor * (pct / 100))}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[13px] font-bold text-slate-500 uppercase tracking-widest mb-3">Vendas</p>
          {leads.length === 0 ? (
            <div className="bg-[#0B1120] border border-white/10 rounded-2xl p-10 text-center">
              <p className="text-slate-500 font-semibold text-sm">Nenhuma venda ganha ainda.</p>
            </div>
          ) : (
            <div className="bg-[#0B1120] border border-white/10 rounded-2xl overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02]">
                    <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">Cliente</th>
                    <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">Veículo</th>
                    <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">Vendedor</th>
                    <th className="text-right px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">Valor</th>
                    <th className="text-right px-4 py-3 text-[11px] font-bold text-slate-500 uppercase">Comissão</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map(l => (
                    <tr key={l.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                      <td className="px-4 py-3 font-bold text-white">{l.empresa}</td>
                      <td className="px-4 py-3 text-slate-400">{l.veiculo_referencia || '—'}</td>
                      <td className="px-4 py-3 text-slate-400">{l.vendedor_nome || '—'}</td>
                      <td className="px-4 py-3 text-right font-bold text-white">{fmtMoeda(l.valor_total)}</td>
                      <td className="px-4 py-3 text-right font-bold text-[#22C55E]">{fmtMoeda(Number(l.valor_total || 0) * (pct / 100))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
    </div>
  );
}
