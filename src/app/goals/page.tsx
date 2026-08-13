"use client";
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useUnidades } from '@/lib/useUnidades';
import {
  Target, Users, RefreshCcw, AlertTriangle, CheckCircle2,
  User as UserIcon, Loader2, Calendar, TrendingUp, Zap, Mail, Building2
} from 'lucide-react';
import { SkeletonPage, SkeletonBox } from '@/components/Skeleton';
import { Toast } from '@/components/Toast';

const fmtMilhar = (v: number) => (v ? Math.round(v).toLocaleString('pt-BR') : '');
const parseMilhar = (v: string) => Number(v.replace(/\D/g, '')) || 0;

export default function GoalsPage() {
  const auth = useAuth() || {};
  const user = auth.user;
  const perfil = auth.perfil;
  type Vendedor = { id: string; nome: string };
  type MetaMensal = { mes: number; valor_objetivo: number };
  type ComparativoRow = { id: string; nome: string; meta: number; realizado: number; perc: number };
  const [loading, setLoading] = useState(true);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [vendedorSelecionado, setVendedorSelecionado] = useState<string>('global');
  
  // NAVEGAÇÃO DE PERÍODO
  const [anoFiltro, setAnoFiltro] = useState(new Date().getFullYear());
  const [mesAtualVisual] = useState(new Date().getMonth() + 1);
  
  const [metaAno, setMetaAno] = useState(0);
  const [metasMensais, setMetasMensais] = useState<MetaMensal[]>([]);
  const [realizadoAno, setRealizadoAno] = useState(0);
  const [realizadoMensalMap, setRealizadoMensalMap] = useState<Record<number, number>>({});

  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [comparativo, setComparativo] = useState<ComparativoRow[]>([]);
  const [enviandoRelatorio, setEnviandoRelatorio] = useState(false);

  const [produtosMes, setProdutosMes] = useState<{ nome: string; qtd: number; valor: number; valorMesAnterior: number }[]>([]);
  const [metasProduto, setMetasProduto] = useState<Record<string, number>>({});
  const [editandoMetaProduto, setEditandoMetaProduto] = useState<string | null>(null);

  const { unidades } = useUnidades(perfil?.empresa_id);
  const [unidadeSelecionadaMeta, setUnidadeSelecionadaMeta] = useState<string>('');
  const [loadingUnidade, setLoadingUnidade] = useState(true);
  const [metaAnoUnidade, setMetaAnoUnidade] = useState(0);
  const [metasMensaisUnidade, setMetasMensaisUnidade] = useState<MetaMensal[]>([]);
  const [realizadoAnoUnidade, setRealizadoAnoUnidade] = useState(0);
  const [realizadoMensalMapUnidade, setRealizadoMensalMapUnidade] = useState<Record<number, number>>({});

  const isDirector = perfil?.cargo === 'diretor';

  useEffect(() => {
    if (user) {
      fetchVendedores();
      // Vendedor comum só vê a própria meta
      if (!isDirector) setVendedorSelecionado(user.id);
    }
  }, [user, perfil]);

  useEffect(() => {
    if (user && vendedorSelecionado) fetchMetasERealizado();
  }, [vendedorSelecionado, anoFiltro]);

  useEffect(() => {
    if (vendedores.length > 0) fetchComparativo();
  }, [vendedores]);

  useEffect(() => {
    if (perfil?.empresa_id) { fetchProdutosMes(); }
  }, [perfil?.empresa_id, vendedorSelecionado]);

  useEffect(() => {
    if (unidades.length === 0 || unidadeSelecionadaMeta) return;
    const salva = localStorage.getItem('wegrow_unidade_meta_selecionada');
    const aindaExiste = salva && unidades.some(u => u.nome === salva);
    setUnidadeSelecionadaMeta(aindaExiste ? salva! : unidades[0].nome);
  }, [unidades]);

  const selecionarUnidadeMeta = (nome: string) => {
    setUnidadeSelecionadaMeta(nome);
    localStorage.setItem('wegrow_unidade_meta_selecionada', nome);
  };

  useEffect(() => {
    if (perfil?.empresa_id && unidadeSelecionadaMeta) fetchMetasERealizadoUnidade();
  }, [perfil?.empresa_id, unidadeSelecionadaMeta, anoFiltro]);

  async function fetchVendedores() {
    let query = supabase.from('profiles').select('id, nome').neq('cargo', 'diretor');
    if (perfil?.empresa_id) query = query.eq('empresa_id', perfil.empresa_id);
    const { data } = await query;
    setVendedores(data || []);
  }

  async function fetchMetasERealizado() {
    setLoading(true);
    try {
      const targetUser = vendedorSelecionado === 'global' ? null : vendedorSelecionado;

      let metaQuery = supabase.from('metas').select('*').eq('ano', anoFiltro).eq('tipo', 'faturamento');
      if (targetUser) metaQuery = metaQuery.eq('user_id', targetUser);
      else metaQuery = metaQuery.is('user_id', null);

      const { data: metasData } = await metaQuery;
      const metasMensaisData = metasData?.filter(m => m.mes !== null) || [];
      const metaAnualSalva = metasData?.find(m => m.mes === null)?.valor_objetivo || 0;
      const somaMeses = metasMensaisData.reduce((acc, m) => acc + Number(m.valor_objetivo || 0), 0);
      // Se nunca definiu uma meta do ano manualmente (nem via "distribuir igualmente"), mostra
      // a soma dos meses já preenchidos em vez de ficar zerado.
      setMetaAno(metaAnualSalva > 0 ? metaAnualSalva : somaMeses);
      setMetasMensais(metasMensaisData);

      let vendasQuery = supabase.from('leads')
        .select('valor_total, created_at')
        .eq('status', 'ganho')
        .gte('created_at', `${anoFiltro}-01-01`)
        .lte('created_at', `${anoFiltro}-12-31`);

      if (targetUser) vendasQuery = vendasQuery.eq('user_id', targetUser);

      const { data: vendas } = await vendasQuery;
      
      const totalAno = vendas?.reduce((acc, v) => acc + Number(v.valor_total), 0) || 0;
      setRealizadoAno(totalAno);

      const mensalMap: Record<number, number> = {};
      vendas?.forEach(v => {
        const mesVenda = new Date(v.created_at).getMonth() + 1;
        mensalMap[mesVenda] = (mensalMap[mesVenda] || 0) + Number(v.valor_total);
      });
      setRealizadoMensalMap(mensalMap);
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchComparativo() {
    if (!isDirector || !perfil?.empresa_id) return;
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth() + 1;

    const [{ data: metasData }, { data: vendasData }] = await Promise.all([
      supabase.from('metas').select('user_id, valor_objetivo').eq('ano', ano).eq('mes', mes).eq('empresa_id', perfil.empresa_id),
      supabase.from('leads').select('user_id, valor_total').eq('status', 'ganho').eq('empresa_id', perfil.empresa_id)
        .gte('created_at', `${ano}-${String(mes).padStart(2,'0')}-01`)
        .lte('created_at', `${ano}-${String(mes).padStart(2,'0')}-31`)
        .limit(2000),
    ]);

    const metaMap: Record<string, number> = {};
    (metasData || []).forEach(m => { if (m.user_id) metaMap[m.user_id] = m.valor_objetivo; });

    const realizadoMap: Record<string, number> = {};
    (vendasData || []).forEach(v => { if (v.user_id) realizadoMap[v.user_id] = (realizadoMap[v.user_id] || 0) + Number(v.valor_total); });

    const rows = vendedores.map(v => ({
      id: v.id,
      nome: v.nome,
      meta: metaMap[v.id] || 0,
      realizado: realizadoMap[v.id] || 0,
      perc: metaMap[v.id] > 0 ? (realizadoMap[v.id] || 0) / metaMap[v.id] * 100 : 0,
    })).sort((a, b) => b.perc - a.perc);

    setComparativo(rows);
  }

  async function fetchProdutosMes() {
    if (!perfil?.empresa_id) return;
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth() + 1;
    const mesPad = String(mes).padStart(2, '0');
    const mesAnterior = mes === 1 ? 12 : mes - 1;
    const anoAnterior = mes === 1 ? ano - 1 : ano;
    const mesAntPad = String(mesAnterior).padStart(2, '0');
    const anoAntStr = String(anoAnterior);

    const targetUser = vendedorSelecionado === 'global' ? null : vendedorSelecionado;

    let q1 = supabase.from('leads').select('itens, valor_total')
      .eq('status', 'ganho').eq('empresa_id', perfil.empresa_id)
      .gte('created_at', `${ano}-${mesPad}-01`).lte('created_at', `${ano}-${mesPad}-31`).limit(2000);
    if (targetUser) q1 = q1.eq('user_id', targetUser);

    let q2 = supabase.from('leads').select('itens')
      .eq('status', 'ganho').eq('empresa_id', perfil.empresa_id)
      .gte('created_at', `${anoAntStr}-${mesAntPad}-01`).lte('created_at', `${anoAntStr}-${mesAntPad}-31`).limit(2000);
    if (targetUser) q2 = q2.eq('user_id', targetUser);

    const [{ data: mesAtualData }, { data: mesAntData }] = await Promise.all([q1, q2]);

    const agg: Record<string, { qtd: number; valor: number; valorMesAnterior: number }> = {};
    (mesAtualData || []).forEach((l: any) => {
      if (!Array.isArray(l.itens)) return;
      l.itens.forEach((item: any) => {
        if (!item.servico) return;
        if (!agg[item.servico]) agg[item.servico] = { qtd: 0, valor: 0, valorMesAnterior: 0 };
        agg[item.servico].qtd += Number(item.quantidade) || 1;
        agg[item.servico].valor += Number(item.precoUnitario || 0) * (Number(item.quantidade) || 1);
      });
    });
    (mesAntData || []).forEach((l: any) => {
      if (!Array.isArray(l.itens)) return;
      l.itens.forEach((item: any) => {
        if (!item.servico) return;
        if (!agg[item.servico]) agg[item.servico] = { qtd: 0, valor: 0, valorMesAnterior: 0 };
        agg[item.servico].valorMesAnterior += Number(item.precoUnitario || 0) * (Number(item.quantidade) || 1);
      });
    });

    // Fetch saved product goals
    const { data: metasProdData } = await supabase.from('metas')
      .select('produto, valor_objetivo').eq('empresa_id', perfil.empresa_id)
      .eq('ano', ano).eq('mes', mes).not('produto', 'is', null);
    const mpMap: Record<string, number> = {};
    (metasProdData || []).forEach((m: any) => { if (m.produto) mpMap[m.produto] = m.valor_objetivo; });
    setMetasProduto(mpMap);

    const rows = Object.entries(agg)
      .map(([nome, v]) => ({ nome, ...v }))
      .sort((a, b) => b.valor - a.valor);
    setProdutosMes(rows);
  }

  async function fetchMetasERealizadoUnidade() {
    if (!perfil?.empresa_id || !unidadeSelecionadaMeta) return;
    setLoadingUnidade(true);
    try {
      const [{ data: metasData }, { data: vendas }] = await Promise.all([
        supabase.from('metas').select('mes, valor_objetivo')
          .eq('empresa_id', perfil.empresa_id).eq('tipo', 'unidade')
          .eq('unidade', unidadeSelecionadaMeta).eq('ano', anoFiltro),
        supabase.from('leads').select('valor_total, created_at')
          .eq('status', 'ganho').eq('empresa_id', perfil.empresa_id).eq('unidade', unidadeSelecionadaMeta)
          .gte('created_at', `${anoFiltro}-01-01`).lte('created_at', `${anoFiltro}-12-31`),
      ]);

      // mes=0 é o sentinela usado pra "meta do ano" (evita índice com NULL/expressão, que o
      // upsert do Supabase não consegue casar via onConflict).
      const metasMensaisDaUnidade = metasData?.filter(m => m.mes !== 0) || [];
      const metaAnualSalva = metasData?.find(m => m.mes === 0)?.valor_objetivo || 0;
      const somaMeses = metasMensaisDaUnidade.reduce((acc, m) => acc + Number(m.valor_objetivo || 0), 0);
      // Se nunca definiu uma meta do ano manualmente (nem via "distribuir igualmente"), mostra
      // a soma dos meses já preenchidos em vez de ficar zerado.
      setMetaAnoUnidade(metaAnualSalva > 0 ? metaAnualSalva : somaMeses);
      setMetasMensaisUnidade(metasMensaisDaUnidade);

      const totalAno = vendas?.reduce((acc, v) => acc + Number(v.valor_total), 0) || 0;
      setRealizadoAnoUnidade(totalAno);

      const mensalMap: Record<number, number> = {};
      vendas?.forEach(v => {
        const mesVenda = new Date(v.created_at).getMonth() + 1;
        mensalMap[mesVenda] = (mensalMap[mesVenda] || 0) + Number(v.valor_total);
      });
      setRealizadoMensalMapUnidade(mensalMap);
    } finally {
      setLoadingUnidade(false);
    }
  }

  const handleUpdateMetaUnidade = async (mes: number | null, valor: number) => {
    if (!isDirector || !perfil?.empresa_id || !unidadeSelecionadaMeta) return;
    const { error } = await supabase.from('metas').upsert({
      unidade: unidadeSelecionadaMeta,
      empresa_id: perfil.empresa_id,
      ano: anoFiltro,
      mes: mes ?? 0, // 0 = sentinela pra "meta do ano" (ver fetchMetasERealizadoUnidade)
      valor_objetivo: Number(valor),
      tipo: 'unidade',
      user_id: null,
      produto: null,
    }, { onConflict: 'user_id,ano,mes,produto,unidade' });
    if (!error) {
      setToastMessage('Meta salva com sucesso! 🚀');
      setShowToast(true);
      fetchMetasERealizadoUnidade();
    } else {
      setToastMessage(`Erro ao salvar meta: ${error.message}`);
      setShowToast(true);
    }
  };

  const distribuirMetaAnoUnidade = async () => {
    if (!metaAnoUnidade || metaAnoUnidade <= 0 || !unidadeSelecionadaMeta) return;
    if (!confirm(`Dividir R$ ${metaAnoUnidade.toLocaleString('pt-BR')} igualmente entre os 12 meses de ${unidadeSelecionadaMeta}?`)) return;

    const valorMensal = metaAnoUnidade / 12;
    const novasMetas = Array.from({ length: 12 }).map((_, i) => ({
      unidade: unidadeSelecionadaMeta,
      empresa_id: perfil?.empresa_id,
      ano: anoFiltro,
      mes: i + 1,
      valor_objetivo: valorMensal,
      tipo: 'unidade',
      user_id: null,
      produto: null,
    }));

    await supabase.from('metas').upsert(novasMetas, { onConflict: 'user_id,ano,mes,produto,unidade' });
    setToastMessage('Meta anual distribuída!');
    setShowToast(true);
    fetchMetasERealizadoUnidade();
  };

  const handleUpdateMetaProduto = async (produto: string, valor: number) => {
    if (!isDirector || !perfil?.empresa_id) return;
    const hoje = new Date();
    const targetUser = vendedorSelecionado === 'global' ? null : vendedorSelecionado;
    await supabase.from('metas').upsert({
      user_id: targetUser,
      empresa_id: perfil.empresa_id,
      ano: hoje.getFullYear(),
      mes: hoje.getMonth() + 1,
      valor_objetivo: valor,
      tipo: 'produto',
      produto,
      unidade: null,
    }, { onConflict: 'user_id,ano,mes,produto,unidade' });
    setMetasProduto(prev => ({ ...prev, [produto]: valor }));
    setEditandoMetaProduto(null);
    setToastMessage(`Meta de "${produto}" salva!`);
    setShowToast(true);
  };

  const handleUpdateMeta = async (mes: number | null, valor: number) => {
    if (!isDirector) return;
    const targetUser = vendedorSelecionado === 'global' ? null : vendedorSelecionado;

    const { error } = await supabase.from('metas').upsert({
      user_id: targetUser, 
      empresa_id: perfil?.empresa_id, // 👈 CARIMBO SAAS
      ano: anoFiltro,
      mes: mes,
      valor_objetivo: Number(valor),
      tipo: 'faturamento',
      produto: null,
      unidade: null,
    }, { onConflict: 'user_id,ano,mes,produto,unidade' });

    if (!error) {
      setToastMessage("Meta salva com sucesso! 🚀");
      setShowToast(true);
      fetchMetasERealizado(); 
    } else {
      console.error("Erro ao salvar:", error.message);
      alert(`Erro no banco: ${error.message}`);
    }
  };

  const distribuirMetaAno = async () => {
    if (!metaAno || metaAno <= 0) return;
    if (!confirm(`Dividir R$ ${metaAno.toLocaleString('pt-BR')} igualmente entre os 12 meses?`)) return;

    const targetUser = vendedorSelecionado === 'global' ? null : vendedorSelecionado;
    const valorMensal = metaAno / 12;
    const novasMetas = Array.from({ length: 12 }).map((_, i) => ({
      user_id: targetUser,
      empresa_id: perfil?.empresa_id, // 👈 CARIMBO SAAS
      ano: anoFiltro,
      mes: i + 1,
      valor_objetivo: valorMensal,
      tipo: 'faturamento',
      produto: null,
      unidade: null,
    }));

    await supabase.from('metas').upsert(novasMetas, { onConflict: 'user_id,ano,mes,produto,unidade' });
    setToastMessage("Meta anual distribuída!");
    setShowToast(true);
    fetchMetasERealizado();
  };

  const percentAno = metaAno > 0 ? (realizadoAno / metaAno) * 100 : 0;
  const percentAnoUnidade = metaAnoUnidade > 0 ? (realizadoAnoUnidade / metaAnoUnidade) * 100 : 0;

  // Ritmo do mês atual
  const hoje = new Date();
  const mesAtual = hoje.getMonth() + 1;
  const anoAtual = hoje.getFullYear();
  const metaMesAtual = metasMensais.find(m => m.mes === mesAtual)?.valor_objetivo || 0;
  const realizadoMesAtual = realizadoMensalMap[mesAtual] || 0;
  const diasNoMes = new Date(anoAtual, mesAtual, 0).getDate();
  const diaAtual = hoje.getDate();
  const esperadoAteHoje = metaMesAtual > 0 ? (metaMesAtual / diasNoMes) * diaAtual : 0;
  const ritmoOk = realizadoMesAtual >= esperadoAteHoje;
  const deltaRitmo = Math.abs(esperadoAteHoje - realizadoMesAtual);
  const projecaoFechamento = diaAtual > 0 ? Math.round((realizadoMesAtual / diaAtual) * diasNoMes) : 0;

  const enviarRelatorioEmail = async () => {
    if (!user?.email) { setToastMessage('Seu perfil não tem e-mail cadastrado.'); setShowToast(true); return; }
    setEnviandoRelatorio(true);
    try {
      const escopo = vendedorSelecionado === 'global' ? 'Global Empresa' : `Foco: ${vendedores.find(v => v.id === vendedorSelecionado)?.nome || ''}`;
      const nomeMes = new Date(0, mesAtual - 1).toLocaleString('pt-BR', { month: 'long' });
      const res = await fetch('/api/email/relatorio-metas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          escopo,
          periodo: `Ano Fiscal ${anoFiltro}`,
          metaAno, realizadoAno, percentAno,
          metaMesAtual, realizadoMesAtual, esperadoAteHoje, ritmoOk, deltaRitmo, projecaoFechamento,
          diaAtual, diasNoMes, nomeMes,
          ranking: isDirector ? comparativo : [],
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.ok) {
        setToastMessage(`📧 Relatório enviado pra ${user.email}!`);
      } else {
        setToastMessage(j.erro || 'Erro ao enviar relatório.');
      }
    } catch {
      setToastMessage('Erro ao enviar relatório.');
    } finally {
      setEnviandoRelatorio(false);
      setShowToast(true);
    }
  };

  return (
    <div className="p-6 space-y-8 pb-20 animate-in fade-in duration-500">
      
      {/* SELETORES SUPERIORES */}
      <div className="flex flex-col md:flex-row justify-between gap-4">
          {/* Seletor de Perfil (Só Diretor) */}
          {isDirector && (
            <div className="flex overflow-x-auto gap-2 pb-2 custom-scrollbar flex-1">
              <button onClick={() => setVendedorSelecionado('global')} className={`px-6 py-2 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border ${vendedorSelecionado === 'global' ? 'bg-white text-black' : 'bg-white/5 text-slate-500 hover:border-white/20'}`}>Global Empresa</button>
              {vendedores.map(v => (
                <button key={v.id} onClick={() => setVendedorSelecionado(v.id)} className={`px-6 py-2 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border flex items-center gap-2 ${vendedorSelecionado === v.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white/5 text-slate-500 hover:border-white/20'}`}><UserIcon size={12} /> {v.nome}</button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3">
            {/* Seletor de Ano */}
            <div className="flex items-center bg-[#0B1120] border border-white/10 rounded-2xl px-4 py-2 gap-3">
                <Calendar size={16} className="text-slate-500"/>
                <select className="bg-transparent text-white font-black text-[10px] outline-none cursor-pointer uppercase" value={anoFiltro} onChange={(e) => setAnoFiltro(Number(e.target.value))}>
                    {[2024, 2025, 2026, 2027].map(a => <option key={a} value={a} className="bg-[#0B1120]">{a}</option>)}
                </select>
            </div>

            {/* Enviar Relatório por E-mail */}
            <button
              onClick={enviarRelatorioEmail}
              disabled={enviandoRelatorio}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all"
            >
              {enviandoRelatorio ? <Loader2 size={14} className="animate-spin"/> : <Mail size={14}/>}
              {enviandoRelatorio ? 'Enviando...' : 'Relatório por E-mail'}
            </button>
          </div>
      </div>

      {/* HEADER DINÂMICO */}
      <div className="bg-[#0B1120] border border-white/10 rounded-[40px] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#22C55E]/10 rounded-full blur-3xl -mr-20 -mt-20" />
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
          <div>
            <h1 className="text-3xl font-black text-white uppercase italic tracking-tighter">
              {vendedorSelecionado === 'global' ? 'Planejamento Global' : `Foco: ${vendedores.find(v => v.id === vendedorSelecionado)?.nome}`}
            </h1>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">Ano Fiscal {anoFiltro}</p>
          </div>

          <div className="flex flex-col items-end">
            <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Definir Meta do Ano</p>
            <div className="flex items-center gap-3">
              {isDirector && (
                <button onClick={distribuirMetaAno} className="p-2 bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600 hover:text-white transition-all"><RefreshCcw size={16}/></button>
              )}
              <div className="flex items-center bg-white/5 border border-white/10 rounded-xl px-4 py-2 focus-within:border-[#22C55E]">
                <span className="text-slate-500 font-bold mr-2 text-sm">R$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  className="bg-transparent text-2xl font-black text-white text-right outline-none w-40"
                  value={fmtMilhar(metaAno)}
                  onChange={(e) => setMetaAno(parseMilhar(e.target.value))}
                  onBlur={(e) => handleUpdateMeta(null, parseMilhar(e.target.value))}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  disabled={!isDirector}
                />
              </div>
            </div>
          </div>
        </div>

        {/* PROGRESSO ANUAL */}
        <div className="mt-10">
          <div className="flex justify-between items-end mb-2">
            <span className="text-xs font-black text-white uppercase italic">Atingimento Acumulado</span>
            <span className={`text-2xl font-black ${percentAno >= 100 ? 'text-[#22C55E]' : 'text-blue-500'}`}>{Math.round(percentAno)}%</span>
          </div>
          <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden border border-white/5 p-0.5">
            <div className={`h-full transition-all duration-1000 rounded-full ${percentAno >= 100 ? 'bg-[#22C55E]' : 'bg-blue-600'}`} style={{ width: `${Math.min(percentAno, 100)}%` }} />
          </div>
          <div className="flex justify-between mt-3 text-[10px] font-bold uppercase">
             <div><span className="text-slate-500">Realizado:</span> <span className="text-white ml-1">R$ {realizadoAno.toLocaleString('pt-BR')}</span></div>
             <div><span className="text-slate-500">Falta para Meta:</span> <span className="text-red-400 ml-1">R$ {Math.max(0, metaAno - realizadoAno).toLocaleString('pt-BR')}</span></div>
          </div>
        </div>

        {/* ALERTA DE RITMO */}
        {metaMesAtual > 0 && anoFiltro === anoAtual && (
          <div className={`mt-6 flex items-center gap-4 p-4 rounded-2xl border ${ritmoOk ? 'bg-[#22C55E]/10 border-[#22C55E]/30' : 'bg-orange-500/10 border-orange-500/30 animate-pulse'}`}>
            {ritmoOk
              ? <CheckCircle2 size={24} className="text-[#22C55E] flex-shrink-0" />
              : <AlertTriangle size={24} className="text-orange-400 flex-shrink-0" />}
            <div>
              <p className={`text-xs font-black uppercase tracking-widest ${ritmoOk ? 'text-[#22C55E]' : 'text-orange-400'}`}>
                {ritmoOk ? 'Ritmo no Verde' : 'Abaixo do Ritmo Esperado'}
              </p>
              <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                Dia {diaAtual}/{diasNoMes} — Esperado: <span className="text-white">R$ {Math.round(esperadoAteHoje).toLocaleString('pt-BR')}</span>
                {' · '}{ritmoOk ? 'Adiantado' : 'Faltam'} <span className={ritmoOk ? 'text-[#22C55E]' : 'text-orange-400'}>R$ {Math.round(deltaRitmo).toLocaleString('pt-BR')}</span> {ritmoOk ? 'acima do ritmo' : 'para atingir o ritmo'}
              </p>
              {projecaoFechamento > 0 && (
                <p className="text-[10px] text-slate-500 font-bold mt-1">
                  Projeção de fechamento: <span className={projecaoFechamento >= metaMesAtual ? 'text-[#22C55E]' : 'text-orange-400'}>R$ {projecaoFechamento.toLocaleString('pt-BR')}</span>
                  {metaMesAtual > 0 && <span className="ml-1 text-slate-600">({Math.round((projecaoFechamento / metaMesAtual) * 100)}% da meta)</span>}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* GRADE MENSAL */}
      {loading ? (
        <SkeletonPage />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(mes => {
              const mMeta = metasMensais.find(m => m.mes === mes)?.valor_objetivo || 0;
              const mReal = realizadoMensalMap[mes] || 0;
              const mPerc = mMeta > 0 ? (mReal / mMeta) * 100 : 0;
              const active = mes === mesAtualVisual && anoFiltro === new Date().getFullYear();

              return (
                <div key={mes} className={`bg-[#0B1120] border ${active ? 'border-blue-500/50 shadow-xl shadow-blue-500/5' : 'border-white/5'} p-5 rounded-[24px] hover:border-white/20 transition-all flex flex-col group`}>
                  <div className="flex justify-between mb-6">
                    <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black uppercase ${active ? 'bg-blue-600 text-white' : 'bg-white/5 text-slate-400'}`}>
                      {new Date(0, mes - 1).toLocaleString('pt-BR', { month: 'short' })}
                    </span>
                    {mPerc >= 100 && <div className="bg-[#22C55E]/20 text-[#22C55E] text-[8px] font-black px-2 py-1 rounded-full uppercase">Meta Batida 🏆</div>}
                  </div>

                  <div className="space-y-4">
                    <div>
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Meta Mensal</p>
                      <div className="flex items-center gap-1 border-b border-white/5 focus-within:border-blue-500 transition-all">
                        <span className="text-slate-600 text-xs font-bold">R$</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          className="bg-transparent text-lg font-black text-white outline-none py-1 w-full"
                          defaultValue={fmtMilhar(mMeta)}
                          onChange={(e) => { e.currentTarget.value = fmtMilhar(parseMilhar(e.currentTarget.value)); }}
                          onBlur={(e) => handleUpdateMeta(mes, parseMilhar(e.target.value))}
                          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                          disabled={!isDirector}
                        />
                      </div>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Realizado</p>
                      <p className="text-sm font-black text-[#22C55E]">R$ {mReal.toLocaleString('pt-BR')}</p>
                    </div>
                    
                    {/* Progress bar mensal */}
                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mt-2">
                      <div className={`h-full transition-all duration-700 ${mPerc >= 100 ? 'bg-[#22C55E]' : 'bg-blue-500'}`} style={{ width: `${Math.min(mPerc, 100)}%` }} />
                    </div>
                  </div>
                </div>
              )
            })}
        </div>
      )}

      {/* METAS POR UNIDADE */}
      {unidades.length > 0 && (
        <div className="bg-[#0B1120] border border-white/10 rounded-[40px] p-8 shadow-2xl">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-6">
            <div>
              <h2 className="text-lg font-black text-white uppercase italic tracking-tighter flex items-center gap-2">
                <Building2 size={20} className="text-orange-400"/> Metas por Unidade
              </h2>
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">Ano Fiscal {anoFiltro} — {unidadeSelecionadaMeta}</p>
            </div>

            <div className="flex flex-col items-end">
              <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Meta do Ano</p>
              <div className="flex items-center gap-3">
                {isDirector && (
                  <button onClick={distribuirMetaAnoUnidade} className="p-2 bg-orange-600/20 text-orange-400 rounded-lg hover:bg-orange-600 hover:text-white transition-all"><RefreshCcw size={16}/></button>
                )}
                <div className="flex items-center bg-white/5 border border-white/10 rounded-xl px-4 py-2 focus-within:border-orange-500">
                  <span className="text-slate-500 font-bold mr-2 text-sm">R$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="bg-transparent text-xl font-black text-white text-right outline-none w-32"
                    value={fmtMilhar(metaAnoUnidade)}
                    onChange={(e) => setMetaAnoUnidade(parseMilhar(e.target.value))}
                    onBlur={(e) => handleUpdateMetaUnidade(null, parseMilhar(e.target.value))}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    disabled={!isDirector}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Seletor de Unidade */}
          <div className="flex overflow-x-auto gap-2 pb-2 custom-scrollbar mb-6">
            {unidades.map(u => (
              <button key={u.id} onClick={() => selecionarUnidadeMeta(u.nome)} className={`px-5 py-2 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border flex-shrink-0 ${unidadeSelecionadaMeta === u.nome ? 'bg-orange-500 text-white border-orange-500' : 'bg-white/5 text-slate-500 hover:border-white/20'}`}>
                {u.nome}
              </button>
            ))}
          </div>

          {/* Progresso Anual */}
          <div className="mb-8">
            <div className="flex justify-between items-end mb-2">
              <span className="text-xs font-black text-white uppercase italic">Atingimento Acumulado</span>
              <span className={`text-xl font-black ${percentAnoUnidade >= 100 ? 'text-[#22C55E]' : 'text-orange-400'}`}>{Math.round(percentAnoUnidade)}%</span>
            </div>
            <div className="w-full h-2.5 bg-white/5 rounded-full overflow-hidden border border-white/5 p-0.5">
              <div className={`h-full transition-all duration-1000 rounded-full ${percentAnoUnidade >= 100 ? 'bg-[#22C55E]' : 'bg-orange-500'}`} style={{ width: `${Math.min(percentAnoUnidade, 100)}%` }} />
            </div>
            <div className="flex justify-between mt-2 text-[10px] font-bold uppercase">
              <div><span className="text-slate-500">Realizado:</span> <span className="text-white ml-1">R$ {realizadoAnoUnidade.toLocaleString('pt-BR')}</span></div>
              <div><span className="text-slate-500">Falta para Meta:</span> <span className="text-red-400 ml-1">R$ {Math.max(0, metaAnoUnidade - realizadoAnoUnidade).toLocaleString('pt-BR')}</span></div>
            </div>
          </div>

          {/* Grade Mensal por Unidade */}
          {loadingUnidade ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 12 }).map((_, i) => <SkeletonBox key={i} className="h-48" />)}
            </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(mes => {
              const mMeta = metasMensaisUnidade.find(m => m.mes === mes)?.valor_objetivo || 0;
              const mReal = realizadoMensalMapUnidade[mes] || 0;
              const mPerc = mMeta > 0 ? (mReal / mMeta) * 100 : 0;
              const active = mes === mesAtualVisual && anoFiltro === new Date().getFullYear();

              return (
                <div key={mes} className={`bg-white/[0.02] border ${active ? 'border-orange-500/50 shadow-xl shadow-orange-500/5' : 'border-white/5'} p-5 rounded-[24px] hover:border-white/20 transition-all flex flex-col group`}>
                  <div className="flex justify-between mb-6">
                    <span className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black uppercase ${active ? 'bg-orange-600 text-white' : 'bg-white/5 text-slate-400'}`}>
                      {new Date(0, mes - 1).toLocaleString('pt-BR', { month: 'short' })}
                    </span>
                    {mPerc >= 100 && <div className="bg-[#22C55E]/20 text-[#22C55E] text-[8px] font-black px-2 py-1 rounded-full uppercase">Meta Batida 🏆</div>}
                  </div>

                  <div className="space-y-4">
                    <div>
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Meta Mensal</p>
                      <div className="flex items-center gap-1 border-b border-white/5 focus-within:border-orange-500 transition-all">
                        <span className="text-slate-600 text-xs font-bold">R$</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          className="bg-transparent text-lg font-black text-white outline-none py-1 w-full"
                          defaultValue={fmtMilhar(mMeta)}
                          onChange={(e) => { e.currentTarget.value = fmtMilhar(parseMilhar(e.currentTarget.value)); }}
                          onBlur={(e) => handleUpdateMetaUnidade(mes, parseMilhar(e.target.value))}
                          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                          disabled={!isDirector}
                        />
                      </div>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Realizado</p>
                      <p className="text-sm font-black text-[#22C55E]">R$ {mReal.toLocaleString('pt-BR')}</p>
                    </div>

                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mt-2">
                      <div className={`h-full transition-all duration-700 ${mPerc >= 100 ? 'bg-[#22C55E]' : 'bg-orange-500'}`} style={{ width: `${Math.min(mPerc, 100)}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>
      )}

      {/* COMPARATIVO DE VENDEDORES */}
      {isDirector && comparativo.length > 0 && (
        <div className="bg-[#0B1120] border border-white/10 rounded-[32px] p-6 shadow-xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 bg-purple-500/20 rounded-xl flex items-center justify-center"><Zap size={18} className="text-purple-400"/></div>
            <div>
              <h2 className="text-sm font-black text-white uppercase italic tracking-tighter">Ranking do Mês</h2>
              <p className="text-[10px] text-slate-500 font-bold uppercase">{new Date(0, mesAtual - 1).toLocaleString('pt-BR', { month: 'long' })} {anoAtual}</p>
            </div>
          </div>
          <div className="space-y-4">
            {comparativo.map((v, i) => (
              <div key={v.id} className="flex items-center gap-4">
                <span className={`w-6 text-center text-[10px] font-black ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-orange-600' : 'text-slate-600'}`}>#{i + 1}</span>
                <div className="w-28 flex-shrink-0">
                  <p className="text-[10px] font-black text-white uppercase truncate">{v.nome}</p>
                  <p className="text-[9px] text-slate-500">R$ {Math.round(v.realizado).toLocaleString('pt-BR')} / {Math.round(v.meta).toLocaleString('pt-BR')}</p>
                </div>
                <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${v.perc >= 100 ? 'bg-[#22C55E]' : v.perc >= 60 ? 'bg-blue-500' : 'bg-orange-500'}`}
                    style={{ width: `${Math.min(v.perc, 100)}%` }}
                  />
                </div>
                <span className={`w-14 text-right text-xs font-black ${v.perc >= 100 ? 'text-[#22C55E]' : v.perc >= 60 ? 'text-blue-400' : 'text-orange-400'}`}>{Math.round(v.perc)}%</span>
                {!v.meta && <span className="text-[8px] text-slate-600 font-bold uppercase">Sem meta</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* METAS POR PRODUTO */}
      {produtosMes.length > 0 && (
        <div className="bg-[#0B1120] border border-white/10 rounded-[32px] p-6 shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-500/20 rounded-xl flex items-center justify-center"><TrendingUp size={18} className="text-blue-400"/></div>
              <div>
                <h2 className="text-sm font-black text-white uppercase italic tracking-tighter">Desempenho por Produto</h2>
                <p className="text-[10px] text-slate-500 font-bold uppercase">
                  {new Date(0, new Date().getMonth()).toLocaleString('pt-BR', { month: 'long' })} {new Date().getFullYear()}
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            {produtosMes.slice(0, 10).map(prod => {
              const meta = metasProduto[prod.nome] || 0;
              const perc = meta > 0 ? Math.min((prod.valor / meta) * 100, 100) : 0;
              const tendencia = prod.valorMesAnterior > 0
                ? ((prod.valor - prod.valorMesAnterior) / prod.valorMesAnterior) * 100
                : null;
              const isEditing = editandoMetaProduto === prod.nome;

              return (
                <div key={prod.nome} className="bg-white/[0.02] border border-white/5 rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-black text-xs uppercase truncate">{prod.nome}</p>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="text-[9px] text-slate-500 font-bold">{prod.qtd}x vendido</span>
                        <span className="text-[9px] text-[#22C55E] font-black">R$ {prod.valor.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>
                        {tendencia !== null && (
                          <span className={`text-[9px] font-black ${tendencia >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {tendencia >= 0 ? '▲' : '▼'} {Math.abs(tendencia).toFixed(0)}% vs mês ant.
                          </span>
                        )}
                      </div>
                    </div>
                    {isDirector && (
                      isEditing ? (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <input
                            type="text"
                            inputMode="numeric"
                            autoFocus
                            defaultValue={fmtMilhar(meta)}
                            className="w-28 bg-[#0B1120] border border-blue-500 rounded-lg px-2 py-1 text-white text-xs font-bold outline-none"
                            onChange={(e) => { e.currentTarget.value = fmtMilhar(parseMilhar(e.currentTarget.value)); }}
                            onBlur={(e) => handleUpdateMetaProduto(prod.nome, parseMilhar(e.target.value))}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateMetaProduto(prod.nome, parseMilhar((e.target as HTMLInputElement).value)); if (e.key === 'Escape') setEditandoMetaProduto(null); }}
                          />
                        </div>
                      ) : (
                        <button onClick={() => setEditandoMetaProduto(prod.nome)} className="text-[9px] font-black text-slate-600 hover:text-blue-400 transition-colors flex-shrink-0 uppercase">
                          {meta > 0 ? `Meta: R$ ${meta.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}` : '+ Meta'}
                        </button>
                      )
                    )}
                  </div>
                  {meta > 0 && (
                    <div>
                      <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-700 ${perc >= 100 ? 'bg-[#22C55E]' : perc >= 60 ? 'bg-blue-500' : 'bg-orange-500'}`} style={{ width: `${perc}%` }} />
                      </div>
                      <p className="text-[9px] text-slate-600 mt-0.5 font-bold">{Math.round(perc)}% da meta mensal</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Toast message={toastMessage} isVisible={showToast} onClose={() => setShowToast(false)} />
    </div>
  );
}