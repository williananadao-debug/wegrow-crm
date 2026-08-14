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
      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-[#171717] flex items-center gap-2 mb-6" style={{ fontFamily: 'var(--font-argus-serif)' }}>
          <Percent size={22} className="text-[#171717]" /> Comissões
        </h1>

        {isLideranca && (
          <div className="bg-white border border-[#e0e0e0] rounded-2xl p-5 mb-6 flex flex-wrap items-end gap-3">
            <div>
              <label className="text-[11px] font-bold text-[#8a8a8a] uppercase tracking-wide block mb-1">Percentual de comissão (%)</label>
              <input type="number" step="0.1" value={percentual} onChange={e => setPercentual(e.target.value)} className="w-40 bg-[#f5f5f5] border border-[#e0e0e0] rounded-xl px-4 py-2.5 text-sm font-bold text-[#171717] outline-none focus:border-[#171717]" />
            </div>
            <button onClick={salvarPercentual} disabled={salvando} className="bg-[#171717] hover:bg-[#000] disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center gap-2">
              {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
            </button>
            {toast && <span className="text-xs font-bold text-[#5c5c5c]">{toast}</span>}
          </div>
        )}

        {loading ? (
          <div className="p-8 flex justify-center"><Loader2 size={22} className="animate-spin text-[#171717]" /></div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-white border border-[#e0e0e0] rounded-2xl p-5">
                <p className="text-[11px] font-bold text-[#8a8a8a] uppercase tracking-wide mb-1">Total vendido</p>
                <p className="text-2xl font-bold text-[#171717]">{fmtMoeda(totalVendido)}</p>
              </div>
              <div className="bg-white border border-[#e0e0e0] rounded-2xl p-5">
                <p className="text-[11px] font-bold text-[#8a8a8a] uppercase tracking-wide mb-1">Taxa aplicada</p>
                <p className="text-2xl font-bold text-[#171717]">{pct}%</p>
              </div>
              <div className="bg-[#171717] rounded-2xl p-5">
                <p className="text-[11px] font-bold text-white/60 uppercase tracking-wide mb-1">Comissão total</p>
                <p className="text-2xl font-bold text-white">{fmtMoeda(totalComissao)}</p>
              </div>
            </div>

            {porVendedor.length > 0 && (
              <div className="mb-6">
                <p className="text-[13px] font-bold text-[#8a8a8a] uppercase tracking-widest mb-3">Por vendedor</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {porVendedor.map(v => (
                    <div key={v.nome} className="bg-white border border-[#e0e0e0] rounded-xl p-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-[#171717]">{v.nome}</p>
                        <p className="text-[12px] text-[#8a8a8a] font-semibold">{v.qtd} venda(s) · {fmtMoeda(v.valor)}</p>
                      </div>
                      <p className="text-lg font-bold text-[#171717]">{fmtMoeda(v.valor * (pct / 100))}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[13px] font-bold text-[#8a8a8a] uppercase tracking-widest mb-3">Vendas</p>
            {leads.length === 0 ? (
              <div className="bg-white border border-[#e0e0e0] rounded-2xl p-10 text-center">
                <p className="text-[#5c5c5c] font-semibold text-sm">Nenhuma venda ganha ainda.</p>
              </div>
            ) : (
              <div className="bg-white border border-[#e0e0e0] rounded-2xl overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#e0e0e0] bg-[#f5f5f5]">
                      <th className="text-left px-4 py-3 text-[11px] font-bold text-[#8a8a8a] uppercase">Cliente</th>
                      <th className="text-left px-4 py-3 text-[11px] font-bold text-[#8a8a8a] uppercase">Veículo</th>
                      <th className="text-left px-4 py-3 text-[11px] font-bold text-[#8a8a8a] uppercase">Vendedor</th>
                      <th className="text-right px-4 py-3 text-[11px] font-bold text-[#8a8a8a] uppercase">Valor</th>
                      <th className="text-right px-4 py-3 text-[11px] font-bold text-[#8a8a8a] uppercase">Comissão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map(l => (
                      <tr key={l.id} className="border-b border-[#f0f0f0] last:border-0 hover:bg-[#fafafa]">
                        <td className="px-4 py-3 font-bold text-[#171717]">{l.empresa}</td>
                        <td className="px-4 py-3 text-[#5c5c5c]">{l.veiculo_referencia || '—'}</td>
                        <td className="px-4 py-3 text-[#5c5c5c]">{l.vendedor_nome || '—'}</td>
                        <td className="px-4 py-3 text-right font-bold text-[#171717]">{fmtMoeda(l.valor_total)}</td>
                        <td className="px-4 py-3 text-right font-bold text-[#171717]">{fmtMoeda(Number(l.valor_total || 0) * (pct / 100))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
