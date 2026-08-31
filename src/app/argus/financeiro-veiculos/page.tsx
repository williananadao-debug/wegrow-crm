"use client";
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Loader2, DollarSign, Search, ChevronDown, ChevronUp, Plus, Trash2, Printer, Save, Receipt, FileSignature } from 'lucide-react';
import ArgusTopNav from '../ArgusTopNav';
import DocumentosVeiculoPanel from '../DocumentosVeiculoPanel';
import { fmtMoeda, fmtMoedaCompacta, fmtData } from '../shared';

type LeadVeiculo = {
  id: number;
  empresa: string;
  valor_total: number;
  status: string;
  etapa: number;
  veiculo_referencia: string | null;
  veiculo_placa: string | null;
  veiculo_fipe_valor: number | null;
  veiculo_valor_compra: number | null;
  veiculo_data_compra: string | null;
  veiculo_data_venda: string | null;
  vendedor_nome: string | null;
  email: string | null;
  created_at: string;
};

type CustoItem = {
  id: number;
  lead_id: number;
  descricao: string;
  valor: number;
  data: string;
};

const MESES_LABEL = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export default function ArgusFinanceiroVeiculosPage() {
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  const empresa = auth.empresa;
  const user = auth.user;

  const [leads, setLeads] = useState<LeadVeiculo[]>([]);
  const [custos, setCustos] = useState<CustoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [expandido, setExpandido] = useState<number | null>(null);
  const [editando, setEditando] = useState<Record<number, Partial<LeadVeiculo>>>({});
  const [salvandoId, setSalvandoId] = useState<number | null>(null);
  const [novoCusto, setNovoCusto] = useState<Record<number, { descricao: string; valor: string; data: string }>>({});
  const [consultandoPlaca, setConsultandoPlaca] = useState<number | null>(null);
  const [resultadoPlaca, setResultadoPlaca] = useState<Record<number, { erro?: string; naoConfigurado?: boolean; dados?: any }>>({});
  const [emitindoContrato, setEmitindoContrato] = useState<number | null>(null);
  const [resultadoContrato, setResultadoContrato] = useState<Record<number, { erro?: string; loja_sign_url?: string; comprador_sign_url?: string }>>({});

  const carregar = useCallback(async () => {
    if (!perfil?.empresa_id) return;
    setLoading(true);
    const [{ data: leadsData }, { data: custosData }] = await Promise.all([
      supabase.from('leads')
        .select('id, empresa, valor_total, status, etapa, veiculo_referencia, veiculo_placa, veiculo_fipe_valor, veiculo_valor_compra, veiculo_data_compra, veiculo_data_venda, vendedor_nome, email, created_at')
        .eq('empresa_id', perfil.empresa_id)
        .not('veiculo_placa', 'is', null)
        .order('created_at', { ascending: false }),
      supabase.from('leads_veiculo_custos').select('id, lead_id, descricao, valor, data').eq('empresa_id', perfil.empresa_id),
    ]);
    setLeads((leadsData as LeadVeiculo[]) || []);
    setCustos((custosData as CustoItem[]) || []);
    setLoading(false);
  }, [perfil?.empresa_id]);

  useEffect(() => { carregar(); }, [carregar]);

  const custosPorLead = useMemo(() => {
    const map: Record<number, CustoItem[]> = {};
    for (const c of custos) {
      if (!map[c.lead_id]) map[c.lead_id] = [];
      map[c.lead_id].push(c);
    }
    return map;
  }, [custos]);

  const totalCustos = useCallback((leadId: number) => (custosPorLead[leadId] || []).reduce((s, c) => s + Number(c.valor || 0), 0), [custosPorLead]);

  const calc = useCallback((l: LeadVeiculo) => {
    const custosLead = totalCustos(l.id);
    const compra = Number(l.veiculo_valor_compra || 0);
    const fipe = l.veiculo_fipe_valor != null ? Number(l.veiculo_fipe_valor) : null;
    const margemFipe = fipe != null ? fipe - compra : null;
    const margemAtual = margemFipe != null ? margemFipe - custosLead : null;
    const vendido = l.status === 'ganho';
    const lucroLiquido = vendido ? Number(l.valor_total || 0) - compra - custosLead : null;
    return { custosLead, margemFipe, margemAtual, lucroLiquido, vendido };
  }, [totalCustos]);

  const hoje = new Date();
  const mesRef = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;

  const emEstoque = leads.filter(l => l.status !== 'ganho' && l.status !== 'perdido');
  const totalInvestidoEstoque = emEstoque.reduce((s, l) => s + Number(l.veiculo_valor_compra || 0) + totalCustos(l.id), 0);

  const vendidosMes = leads.filter(l => (l.veiculo_data_venda || '').slice(0, 7) === mesRef);
  const faturamentoMes = vendidosMes.reduce((s, l) => s + Number(l.valor_total || 0), 0);
  const lucroMes = vendidosMes.reduce((s, l) => s + (calc(l).lucroLiquido || 0), 0);

  const historico6meses = useMemo(() => {
    const meses: { label: string; bruto: number; lucro: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const doMes = leads.filter(l => (l.veiculo_data_venda || '').slice(0, 7) === chave);
      const bruto = doMes.reduce((s, l) => s + Number(l.valor_total || 0), 0);
      const lucro = doMes.reduce((s, l) => s + (calc(l).lucroLiquido || 0), 0);
      meses.push({ label: `${MESES_LABEL[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`, bruto, lucro });
    }
    return meses;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, custos]);
  const maxHistorico = Math.max(1, ...historico6meses.map(m => Math.max(m.bruto, m.lucro)));

  const filtrados = leads.filter(l => {
    if (!busca.trim()) return true;
    const alvo = busca.toLowerCase();
    return (
      l.empresa?.toLowerCase().includes(alvo) ||
      l.veiculo_placa?.toLowerCase().includes(alvo) ||
      l.veiculo_referencia?.toLowerCase().includes(alvo) ||
      l.vendedor_nome?.toLowerCase().includes(alvo)
    );
  });

  const statusLabel = (l: LeadVeiculo) => l.status === 'ganho' ? 'Vendido' : l.status === 'perdido' ? 'Perdido' : 'Em estoque';
  const statusCor = (l: LeadVeiculo) => l.status === 'ganho' ? 'text-[#1fa85a] bg-[#d9f2e3] border-[#1fa85a]/20' : l.status === 'perdido' ? 'text-red-600 bg-red-50 border-red-200' : 'text-[#1d6fd9] bg-[#e8f0fd] border-[#1d6fd9]/20';

  const iniciarEdicao = (l: LeadVeiculo) => {
    setEditando(prev => ({ ...prev, [l.id]: {
      veiculo_placa: l.veiculo_placa || '',
      veiculo_fipe_valor: l.veiculo_fipe_valor,
      veiculo_valor_compra: l.veiculo_valor_compra,
      veiculo_data_compra: l.veiculo_data_compra,
      veiculo_data_venda: l.veiculo_data_venda,
    } }));
  };

  const salvarEdicao = async (leadId: number) => {
    const dados = editando[leadId];
    if (!dados) return;
    setSalvandoId(leadId);
    const { error } = await supabase.from('leads').update(dados).eq('id', leadId);
    if (!error) {
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, ...dados } as LeadVeiculo : l));
      setEditando(prev => { const cp = { ...prev }; delete cp[leadId]; return cp; });
    }
    setSalvandoId(null);
  };

  const adicionarCusto = async (leadId: number) => {
    const form = novoCusto[leadId];
    if (!form?.descricao || !form?.valor || !perfil?.empresa_id) return;
    const { data, error } = await supabase.from('leads_veiculo_custos').insert([{
      lead_id: leadId, empresa_id: perfil.empresa_id, descricao: form.descricao,
      valor: Number(form.valor), data: form.data || new Date().toISOString().slice(0, 10), criado_por: perfil.id,
    }]).select('id, lead_id, descricao, valor, data').single();
    if (!error && data) {
      setCustos(prev => [...prev, data as CustoItem]);
      setNovoCusto(prev => ({ ...prev, [leadId]: { descricao: '', valor: '', data: '' } }));
    }
  };

  const excluirCusto = async (custoId: number) => {
    const { error } = await supabase.from('leads_veiculo_custos').delete().eq('id', custoId);
    if (!error) setCustos(prev => prev.filter(c => c.id !== custoId));
  };

  const consultarPlaca = async (l: LeadVeiculo) => {
    if (!l.veiculo_placa || !perfil?.empresa_id) return;
    setConsultandoPlaca(l.id);
    try {
      const res = await fetch('/api/argus/consulta-placa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa_id: perfil.empresa_id, placa: l.veiculo_placa }),
      });
      const json = await res.json();
      setResultadoPlaca(prev => ({ ...prev, [l.id]: res.ok ? { dados: json.dados } : { erro: json.erro, naoConfigurado: json.naoConfigurado } }));
    } catch (err: any) {
      setResultadoPlaca(prev => ({ ...prev, [l.id]: { erro: err?.message || 'Erro ao consultar.' } }));
    }
    setConsultandoPlaca(null);
  };

  const emitirContrato = async (l: LeadVeiculo) => {
    if (!perfil?.empresa_id) return;
    if (!l.email) {
      setResultadoContrato(prev => ({ ...prev, [l.id]: { erro: 'Esse cliente não tem e-mail cadastrado — edite a venda em Vendas e adicione o e-mail antes de emitir o contrato.' } }));
      return;
    }
    setEmitindoContrato(l.id);
    try {
      const res = await fetch('/api/argus/contrato-veiculo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresa_id: perfil.empresa_id,
          lead_id: l.id,
          comprador_email: l.email,
          consultor: { nome: perfil?.nome || '', email: user?.email || '' },
        }),
      });
      const json = await res.json();
      setResultadoContrato(prev => ({ ...prev, [l.id]: res.ok ? { loja_sign_url: json.loja_sign_url, comprador_sign_url: json.comprador_sign_url } : { erro: json.erro } }));
    } catch (err: any) {
      setResultadoContrato(prev => ({ ...prev, [l.id]: { erro: err?.message || 'Erro ao emitir contrato.' } }));
    }
    setEmitindoContrato(null);
  };

  const imprimirHistorico = (l: LeadVeiculo) => {
    const info = calc(l);
    const itens = custosPorLead[l.id] || [];
    const win = window.open('', '_blank', 'width=800,height=900');
    if (!win) return;
    win.document.write(`
      <html><head><title>Histórico — ${l.veiculo_placa || l.veiculo_referencia || 'Veículo'}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 32px; color: #171717; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        p.sub { color: #666; font-size: 13px; margin-top: 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { text-align: left; padding: 8px; border-bottom: 1px solid #e0e0e0; font-size: 13px; }
        th { color: #888; text-transform: uppercase; font-size: 11px; }
        .kpis { display: flex; gap: 24px; margin-top: 20px; }
        .kpi { border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px 16px; }
        .kpi p:first-child { font-size: 11px; color: #888; text-transform: uppercase; margin: 0 0 4px; }
        .kpi p:last-child { font-size: 18px; font-weight: bold; margin: 0; }
      </style></head><body>
        <h1>${l.veiculo_referencia || l.empresa}</h1>
        <p class="sub">Placa: ${l.veiculo_placa || '—'} · Vendedor: ${l.vendedor_nome || '—'} · Status: ${statusLabel(l)}</p>
        <div class="kpis">
          <div class="kpi"><p>FIPE na compra</p><p>${fmtMoeda(l.veiculo_fipe_valor)}</p></div>
          <div class="kpi"><p>Valor de compra</p><p>${fmtMoeda(l.veiculo_valor_compra)}</p></div>
          <div class="kpi"><p>Total de custos</p><p>${fmtMoeda(info.custosLead)}</p></div>
          <div class="kpi"><p>${info.vendido ? 'Lucro líquido' : 'Margem atual'}</p><p>${fmtMoeda(info.vendido ? info.lucroLiquido : info.margemAtual)}</p></div>
        </div>
        <table><thead><tr><th>Custo</th><th>Data</th><th style="text-align:right">Valor</th></tr></thead>
        <tbody>${itens.map(i => `<tr><td>${i.descricao}</td><td>${fmtData(i.data)}</td><td style="text-align:right">${fmtMoeda(i.valor)}</td></tr>`).join('') || '<tr><td colspan="3">Nenhum custo registrado.</td></tr>'}</tbody>
        </table>
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  const emitirReciboVenda = (l: LeadVeiculo) => {
    const win = window.open('', '_blank', 'width=800,height=900');
    if (!win) return;
    win.document.write(`
      <html><head><title>Recibo de venda — ${l.veiculo_placa || l.veiculo_referencia || 'Veículo'}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; color: #171717; }
        h1 { font-size: 18px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 30px; }
        .linha { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e0e0e0; font-size: 14px; }
        .linha span:first-child { color: #666; }
        .linha span:last-child { font-weight: bold; }
        .total { display: flex; justify-content: space-between; padding: 16px 0; margin-top: 10px; font-size: 18px; font-weight: bold; border-top: 2px solid #171717; }
        .assinaturas { display: flex; justify-content: space-between; margin-top: 90px; }
        .assinaturas div { width: 45%; border-top: 1px solid #171717; text-align: center; padding-top: 8px; font-size: 12px; color: #666; }
      </style></head><body>
        <h1>Recibo de venda de veículo</h1>
        <div class="linha"><span>Comprador</span><span>${l.empresa}</span></div>
        <div class="linha"><span>Veículo</span><span>${l.veiculo_referencia || '—'}</span></div>
        <div class="linha"><span>Placa</span><span>${l.veiculo_placa || '—'}</span></div>
        <div class="linha"><span>Vendedor</span><span>${l.vendedor_nome || '—'}</span></div>
        <div class="linha"><span>Data da venda</span><span>${fmtData(l.veiculo_data_venda)}</span></div>
        <div class="total"><span>Valor</span><span>${fmtMoeda(l.valor_total)}</span></div>
        <div class="assinaturas">
          <div>Vendedor</div>
          <div>Comprador</div>
        </div>
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  return (
    <div>
      <ArgusTopNav nomeEmpresa={empresa?.nome} />
      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-[#171717] flex items-center gap-2 mb-6" style={{ fontFamily: 'var(--font-argus-serif)' }}>
          <DollarSign size={22} className="text-[#171717]" /> Gestão Financeira
        </h1>

        {loading ? (
          <div className="p-8 flex justify-center"><Loader2 size={22} className="animate-spin text-[#171717]" /></div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-white border border-[#e0e0e0] rounded-2xl p-5">
                <p className="text-[11px] font-bold text-[#8a8a8a] uppercase tracking-wide mb-1">Em estoque</p>
                <p className="text-2xl font-bold text-[#171717]">{emEstoque.length}</p>
                <p className="text-[12px] text-[#8a8a8a] font-semibold mt-1">{fmtMoeda(totalInvestidoEstoque)} investido</p>
              </div>
              <div className="bg-white border border-[#e0e0e0] rounded-2xl p-5">
                <p className="text-[11px] font-bold text-[#8a8a8a] uppercase tracking-wide mb-1">Vendido este mês</p>
                <p className="text-2xl font-bold text-[#171717]">{fmtMoeda(faturamentoMes)}</p>
                <p className="text-[12px] text-[#8a8a8a] font-semibold mt-1">{vendidosMes.length} veículo(s)</p>
              </div>
              <div className="bg-[#171717] rounded-2xl p-5">
                <p className="text-[11px] font-bold text-white/60 uppercase tracking-wide mb-1">Lucro líquido este mês</p>
                <p className="text-2xl font-bold text-white">{fmtMoeda(lucroMes)}</p>
              </div>
            </div>

            <div className="bg-white border border-[#e0e0e0] rounded-2xl p-5 mb-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[13px] font-bold text-[#171717]">Faturamento x lucro líquido — últimos 6 meses</p>
                <div className="flex items-center gap-3 text-[11px] font-semibold text-[#8a8a8a]">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#d9d9d9] inline-block" /> Bruto</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#1fa85a] inline-block" /> Lucro líquido</span>
                </div>
              </div>
              <div className="flex items-end gap-4 h-32">
                {historico6meses.map(m => (
                  <div key={m.label} className="flex-1 flex flex-col items-center justify-end gap-1.5">
                    <div className="flex items-end gap-1 h-24">
                      <div className="w-4 bg-[#d9d9d9] rounded-t-sm" style={{ height: `${Math.max(2, (m.bruto / maxHistorico) * 90)}px` }} title={fmtMoeda(m.bruto)} />
                      <div className="w-4 bg-[#1fa85a] rounded-t-sm" style={{ height: `${Math.max(2, (m.lucro / maxHistorico) * 90)}px` }} title={fmtMoeda(m.lucro)} />
                    </div>
                    <span className="text-[10px] text-[#9a958a]">{m.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center bg-white border border-[#e0e0e0] rounded-xl px-3 py-2 gap-2 mb-4 max-w-md">
              <Search size={14} className="text-[#8a8a8a]" />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por placa, veículo, cliente ou vendedor..." className="flex-1 outline-none text-sm text-[#171717] bg-transparent" />
            </div>

            {filtrados.length === 0 ? (
              <div className="bg-white border border-[#e0e0e0] rounded-2xl p-10 text-center">
                <p className="text-[#5c5c5c] font-semibold text-sm">Nenhum veículo encontrado.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtrados.map(l => {
                  const info = calc(l);
                  const aberto = expandido === l.id;
                  const emEdicao = editando[l.id];
                  const itens = custosPorLead[l.id] || [];
                  const form = novoCusto[l.id] || { descricao: '', valor: '', data: '' };
                  return (
                    <div key={l.id} className="bg-white border border-[#e0e0e0] rounded-2xl overflow-hidden">
                      <button onClick={() => setExpandido(aberto ? null : l.id)} className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-[#171717] truncate">{l.veiculo_referencia || l.empresa}</p>
                          <p className="text-[12px] text-[#8a8a8a] font-semibold truncate">{l.veiculo_placa || 'sem placa'} · {l.vendedor_nome || 'sem vendedor'} · {l.empresa}</p>
                        </div>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border flex-shrink-0 ${statusCor(l)}`}>{statusLabel(l)}</span>
                        <div className="text-right flex-shrink-0 w-32">
                          <p className={`text-sm font-bold ${(info.vendido ? info.lucroLiquido : info.margemAtual) != null && (info.vendido ? info.lucroLiquido! : info.margemAtual!) >= 0 ? 'text-[#1fa85a]' : 'text-red-600'}`}>
                            {(info.vendido ? info.lucroLiquido : info.margemAtual) != null ? fmtMoeda(info.vendido ? info.lucroLiquido : info.margemAtual) : '—'}
                          </p>
                          <p className="text-[10px] text-[#8a8a8a] font-semibold">{info.vendido ? 'lucro líquido' : 'margem atual'}</p>
                        </div>
                        {aberto ? <ChevronUp size={16} className="text-[#8a8a8a] flex-shrink-0" /> : <ChevronDown size={16} className="text-[#8a8a8a] flex-shrink-0" />}
                      </button>

                      {aberto && (
                        <div className="border-t border-[#e0e0e0] px-5 py-4 space-y-4">
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] font-bold uppercase text-[#8a8a8a]">Dados de compra e venda</p>
                            <div className="flex items-center gap-2">
                              {emEdicao ? (
                                <button onClick={() => salvarEdicao(l.id)} disabled={salvandoId === l.id} className="flex items-center gap-1.5 bg-[#171717] hover:bg-black disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide">
                                  {salvandoId === l.id ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Salvar
                                </button>
                              ) : (
                                <button onClick={() => iniciarEdicao(l)} className="text-xs font-bold text-[#171717] uppercase tracking-wide">Editar</button>
                              )}
                              <button onClick={() => imprimirHistorico(l)} className="flex items-center gap-1.5 text-xs font-bold text-[#5c5c5c] uppercase tracking-wide">
                                <Printer size={12} /> Imprimir histórico
                              </button>
                              {l.status === 'ganho' && (
                                <button onClick={() => emitirReciboVenda(l)} className="flex items-center gap-1.5 text-xs font-bold text-[#5c5c5c] uppercase tracking-wide">
                                  <Receipt size={12} /> Recibo de venda
                                </button>
                              )}
                              {l.status === 'ganho' && (
                                <button onClick={() => emitirContrato(l)} disabled={emitindoContrato === l.id} className="flex items-center gap-1.5 text-xs font-bold text-[#5c5c5c] uppercase tracking-wide disabled:opacity-50">
                                  {emitindoContrato === l.id ? <Loader2 size={12} className="animate-spin" /> : <FileSignature size={12} />} Emitir contrato
                                </button>
                              )}
                              {l.veiculo_placa && (
                                <button onClick={() => consultarPlaca(l)} disabled={consultandoPlaca === l.id} className="flex items-center gap-1.5 text-xs font-bold text-[#5c5c5c] uppercase tracking-wide disabled:opacity-50">
                                  {consultandoPlaca === l.id ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />} Multas/débitos
                                </button>
                              )}
                            </div>
                          </div>

                          {resultadoPlaca[l.id] && (
                            resultadoPlaca[l.id].naoConfigurado ? (
                              <p className="text-[11px] font-semibold text-[#a8630f] bg-[#fdf3e7] border border-[#d9861c]/30 rounded-lg px-3 py-2">{resultadoPlaca[l.id].erro}</p>
                            ) : resultadoPlaca[l.id].erro ? (
                              <p className="text-[11px] font-semibold text-red-600">{resultadoPlaca[l.id].erro}</p>
                            ) : (
                              <pre className="bg-[#f5f5f5] border border-[#e0e0e0] rounded-lg p-3 overflow-x-auto text-[11px] text-[#171717]">{JSON.stringify(resultadoPlaca[l.id].dados, null, 2)}</pre>
                            )
                          )}

                          {resultadoContrato[l.id] && (
                            resultadoContrato[l.id].erro ? (
                              <p className="text-[11px] font-semibold text-red-600">{resultadoContrato[l.id].erro}</p>
                            ) : (
                              <div className="bg-[#f5f5f5] border border-[#e0e0e0] rounded-lg p-3 text-[11px] space-y-1">
                                <p className="font-bold text-[#171717]">Contrato enviado pra assinatura!</p>
                                {resultadoContrato[l.id].loja_sign_url && <p><a href={resultadoContrato[l.id].loja_sign_url} target="_blank" rel="noreferrer" className="text-[#1d6fd9] underline">Link de assinatura da loja</a></p>}
                                {resultadoContrato[l.id].comprador_sign_url && <p><a href={resultadoContrato[l.id].comprador_sign_url} target="_blank" rel="noreferrer" className="text-[#1d6fd9] underline">Link de assinatura do comprador</a></p>}
                              </div>
                            )
                          )}

                          {emEdicao ? (
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                              <div>
                                <label className="text-[10px] font-bold text-[#8a8a8a] uppercase block mb-1">Placa</label>
                                <input value={emEdicao.veiculo_placa || ''} onChange={e => setEditando(prev => ({ ...prev, [l.id]: { ...prev[l.id], veiculo_placa: e.target.value } }))} className="w-full bg-[#f5f5f5] border border-[#e0e0e0] rounded-lg px-2.5 py-2 text-sm text-[#171717] outline-none focus:border-[#171717]" />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-[#8a8a8a] uppercase block mb-1">FIPE (compra)</label>
                                <input type="number" value={emEdicao.veiculo_fipe_valor ?? ''} onChange={e => setEditando(prev => ({ ...prev, [l.id]: { ...prev[l.id], veiculo_fipe_valor: e.target.value === '' ? null : Number(e.target.value) } }))} className="w-full bg-[#f5f5f5] border border-[#e0e0e0] rounded-lg px-2.5 py-2 text-sm text-[#171717] outline-none focus:border-[#171717]" />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-[#8a8a8a] uppercase block mb-1">Valor de compra</label>
                                <input type="number" value={emEdicao.veiculo_valor_compra ?? ''} onChange={e => setEditando(prev => ({ ...prev, [l.id]: { ...prev[l.id], veiculo_valor_compra: e.target.value === '' ? null : Number(e.target.value) } }))} className="w-full bg-[#f5f5f5] border border-[#e0e0e0] rounded-lg px-2.5 py-2 text-sm text-[#171717] outline-none focus:border-[#171717]" />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-[#8a8a8a] uppercase block mb-1">Data de compra</label>
                                <input type="date" value={emEdicao.veiculo_data_compra || ''} onChange={e => setEditando(prev => ({ ...prev, [l.id]: { ...prev[l.id], veiculo_data_compra: e.target.value || null } }))} className="w-full bg-[#f5f5f5] border border-[#e0e0e0] rounded-lg px-2.5 py-2 text-sm text-[#171717] outline-none focus:border-[#171717]" />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-[#8a8a8a] uppercase block mb-1">Data de venda</label>
                                <input type="date" value={emEdicao.veiculo_data_venda || ''} onChange={e => setEditando(prev => ({ ...prev, [l.id]: { ...prev[l.id], veiculo_data_venda: e.target.value || null } }))} className="w-full bg-[#f5f5f5] border border-[#e0e0e0] rounded-lg px-2.5 py-2 text-sm text-[#171717] outline-none focus:border-[#171717]" />
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                              <div><p className="text-[10px] font-bold text-[#8a8a8a] uppercase">Placa</p><p className="font-semibold text-[#171717]">{l.veiculo_placa || '—'}</p></div>
                              <div><p className="text-[10px] font-bold text-[#8a8a8a] uppercase">FIPE (compra)</p><p className="font-semibold text-[#171717]">{fmtMoeda(l.veiculo_fipe_valor)}</p></div>
                              <div><p className="text-[10px] font-bold text-[#8a8a8a] uppercase">Valor de compra</p><p className="font-semibold text-[#171717]">{fmtMoeda(l.veiculo_valor_compra)}</p></div>
                              <div><p className="text-[10px] font-bold text-[#8a8a8a] uppercase">Data de compra</p><p className="font-semibold text-[#171717]">{fmtData(l.veiculo_data_compra)}</p></div>
                              <div><p className="text-[10px] font-bold text-[#8a8a8a] uppercase">Data de venda</p><p className="font-semibold text-[#171717]">{fmtData(l.veiculo_data_venda)}</p></div>
                            </div>
                          )}

                          <div>
                            <p className="text-[11px] font-bold uppercase text-[#8a8a8a] mb-2">Custos de preparação</p>
                            {itens.length > 0 && (
                              <div className="space-y-1.5 mb-3">
                                {itens.map(c => (
                                  <div key={c.id} className="flex items-center justify-between bg-[#f5f5f5] border border-[#e0e0e0] rounded-lg px-3 py-2 text-sm">
                                    <span className="text-[#171717] font-semibold">{c.descricao}</span>
                                    <div className="flex items-center gap-3">
                                      <span className="text-[#8a8a8a] text-[12px]">{fmtData(c.data)}</span>
                                      <span className="font-bold text-[#171717]">{fmtMoeda(c.valor)}</span>
                                      <button onClick={() => excluirCusto(c.id)} className="text-red-500 hover:text-red-700"><Trash2 size={13} /></button>
                                    </div>
                                  </div>
                                ))}
                                <div className="flex items-center justify-between px-3 py-1 text-[12px] font-bold text-[#8a8a8a]">
                                  <span>Total de custos</span><span>{fmtMoeda(info.custosLead)}</span>
                                </div>
                              </div>
                            )}
                            <div className="flex flex-wrap items-end gap-2">
                              <div className="flex-1 min-w-[160px]">
                                <input value={form.descricao} onChange={e => setNovoCusto(prev => ({ ...prev, [l.id]: { ...form, descricao: e.target.value } }))} placeholder="Descrição (ex: pintura, pneu...)" className="w-full bg-[#f5f5f5] border border-[#e0e0e0] rounded-lg px-2.5 py-2 text-sm text-[#171717] outline-none focus:border-[#171717]" />
                              </div>
                              <input type="number" value={form.valor} onChange={e => setNovoCusto(prev => ({ ...prev, [l.id]: { ...form, valor: e.target.value } }))} placeholder="Valor" className="w-28 bg-[#f5f5f5] border border-[#e0e0e0] rounded-lg px-2.5 py-2 text-sm text-[#171717] outline-none focus:border-[#171717]" />
                              <input type="date" value={form.data} onChange={e => setNovoCusto(prev => ({ ...prev, [l.id]: { ...form, data: e.target.value } }))} className="bg-[#f5f5f5] border border-[#e0e0e0] rounded-lg px-2.5 py-2 text-sm text-[#171717] outline-none focus:border-[#171717]" />
                              <button onClick={() => adicionarCusto(l.id)} className="flex items-center gap-1.5 bg-[#171717] hover:bg-black text-white px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide">
                                <Plus size={13} /> Adicionar
                              </button>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-[#f0f0f0]">
                            <DocumentosVeiculoPanel leadId={l.id} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
