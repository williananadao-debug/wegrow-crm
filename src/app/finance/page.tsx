"use client";
import { useState, useEffect, useMemo } from 'react';
import { 
  Plus, TrendingUp, TrendingDown, DollarSign, 
  ArrowUpCircle, ArrowDownCircle, Trash2, CheckCircle, XCircle, Clock, Calendar, Loader2, ChevronDown
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';

type Lancamento = {
  id: number;
  titulo: string;
  valor: number;
  tipo: 'entrada' | 'saida';
  categoria: string;
  status: 'pago' | 'pendente';
  data_vencimento: string;
};

const ITEMS_PER_PAGE = 20;

export default function FinancePage() {
  const { user } = useAuth();
  
  // Estados de Dados
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [resumoMensal, setResumoMensal] = useState({ entradas: 0, saidas: 0, saldo: 0 });
  
  // Estados de Controle e UI
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'entrada' | 'saida'>('todos');
  
  // Mês Selecionado (YYYY-MM)
  const [mesSelecionado, setMesSelecionado] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  
  const [formData, setFormData] = useState({
    titulo: '',
    valor: '',
    tipo: 'entrada',
    categoria: 'vendas',
    status: 'pago',
    data_vencimento: new Date().toISOString().split('T')[0]
  });

  // Recarregar quando muda o mês ou usuário
  useEffect(() => {
    if (user) {
        resetAndFetch();
    }
  }, [user, mesSelecionado]);

  const resetAndFetch = () => {
      setPage(0);
      setHasMore(true);
      setLancamentos([]); 
      fetchDadosFinanceiros(0, true);
  };

  // --- BUSCA DADOS NO SUPABASE ---
  const fetchDadosFinanceiros = async (pageIndex: number, isNewSearch = false) => {
    if (pageIndex === 0) setLoading(true);
    else setLoadingMore(true);

    try {
        const [ano, mes] = mesSelecionado.split('-').map(Number);
        const inicioMes = new Date(ano, mes - 1, 1).toISOString();
        const fimMes = new Date(ano, mes, 0, 23, 59, 59).toISOString();

        const from = pageIndex * ITEMS_PER_PAGE;
        const to = from + ITEMS_PER_PAGE - 1;

        // QUERY 1: Lista
        const listQuery = supabase
            .from('lancamentos')
            .select('*')
            .gte('data_vencimento', inicioMes)
            .lte('data_vencimento', fimMes)
            .order('data_vencimento', { ascending: false })
            .range(from, to);

        // QUERY 2: Totais (Só na primeira carga)
        const totalsPromise = isNewSearch ? supabase
            .from('lancamentos')
            .select('valor, tipo, status')
            .gte('data_vencimento', inicioMes)
            .lte('data_vencimento', fimMes) 
            : Promise.resolve({ data: null, error: null });

        const [listRes, totalsRes] = await Promise.all([listQuery, totalsPromise]);

        if (listRes.error) throw listRes.error;

        if (listRes.data) {
            setLancamentos(prev => isNewSearch ? (listRes.data as any) : [...prev, ...(listRes.data as any)]);
            if (listRes.data.length < ITEMS_PER_PAGE) setHasMore(false);
        }

        if (totalsRes.data) {
            const entradas = totalsRes.data
                .filter((l: any) => l.tipo === 'entrada' && l.status === 'pago')
                .reduce((acc: number, l: any) => acc + Number(l.valor), 0);
            
            const saidas = totalsRes.data
                .filter((l: any) => l.tipo === 'saida' && l.status === 'pago')
                .reduce((acc: number, l: any) => acc + Number(l.valor), 0);

            setResumoMensal({ entradas, saidas, saldo: entradas - saidas });
        }

    } catch (error) {
        console.error("Erro financeiro:", error);
    } finally {
        setLoading(false);
        setLoadingMore(false);
    }
  };

  const loadMore = () => {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchDadosFinanceiros(nextPage, false);
  };

  // --- NOVA FUNÇÃO: MUDAR STATUS (PAGO/PENDENTE) ---
  const toggleStatus = async (id: number, currentStatus: string, tipo: string, valor: number) => {
    const newStatus = currentStatus === 'pago' ? 'pendente' : 'pago';
    
    // Atualiza Visualmente (Optimistic)
    setLancamentos(prev => prev.map(l => l.id === id ? { ...l, status: newStatus as any } : l));

    // Atualiza Totais Visualmente
    if (newStatus === 'pago') {
        setResumoMensal(prev => ({
            entradas: tipo === 'entrada' ? prev.entradas + valor : prev.entradas,
            saidas: tipo === 'saida' ? prev.saidas + valor : prev.saidas,
            saldo: prev.saldo + (tipo === 'entrada' ? valor : -valor)
        }));
    } else {
        setResumoMensal(prev => ({
            entradas: tipo === 'entrada' ? prev.entradas - valor : prev.entradas,
            saidas: tipo === 'saida' ? prev.saidas - valor : prev.saidas,
            saldo: prev.saldo - (tipo === 'entrada' ? valor : -valor)
        }));
    }

    // Salva no Banco
    await supabase.from('lancamentos').update({ status: newStatus }).eq('id', id);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.titulo || !formData.valor) return alert("Preencha campos");

    const payload = { ...formData, valor: parseFloat(formData.valor), user_id: user?.id };
    const isSameMonth = payload.data_vencimento.startsWith(mesSelecionado);

    const { data, error } = await supabase.from('lancamentos').insert([payload]).select();
    
    if (!error && data) {
      if(isSameMonth) {
          setLancamentos(prev => [data[0], ...prev]);
          if (payload.status === 'pago') {
              setResumoMensal(prev => ({
                  entradas: payload.tipo === 'entrada' ? prev.entradas + payload.valor : prev.entradas,
                  saidas: payload.tipo === 'saida' ? prev.saidas + payload.valor : prev.saidas,
                  saldo: prev.saldo + (payload.tipo === 'entrada' ? payload.valor : -payload.valor)
              }));
          }
      } else {
          alert("Lançamento salvo no mês de referência!");
      }
      setIsModalOpen(false);
      setFormData({ titulo: '', valor: '', tipo: 'entrada', categoria: 'vendas', status: 'pago', data_vencimento: new Date().toISOString().split('T')[0] });
    }
  };

  const handleDelete = async (id: number) => {
    if(!confirm("Apagar lançamento?")) return;
    const itemDeletado = lancamentos.find(l => l.id === id);
    setLancamentos(prev => prev.filter(l => l.id !== id));
    
    if (itemDeletado && itemDeletado.status === 'pago') {
        setResumoMensal(prev => ({
            entradas: itemDeletado.tipo === 'entrada' ? prev.entradas - itemDeletado.valor : prev.entradas,
            saidas: itemDeletado.tipo === 'saida' ? prev.saidas - itemDeletado.valor : prev.saidas,
            saldo: prev.saldo - (itemDeletado.tipo === 'entrada' ? itemDeletado.valor : -itemDeletado.valor)
        }));
    }
    await supabase.from('lancamentos').delete().eq('id', id);
  };

  const listaFiltrada = useMemo(() => {
      return lancamentos.filter(l => filtroTipo === 'todos' ? true : l.tipo === filtroTipo);
  }, [lancamentos, filtroTipo]);

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500 text-white">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 p-4">
        <div>
          <h1 className="text-4xl font-black tracking-tighter uppercase italic">Fluxo de Caixa</h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-[0.2em] mt-1">Gestão Financeira</p>
        </div>
        <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-2xl">
                <Calendar size={14} className="text-blue-500" />
                <input type="month" value={mesSelecionado} onChange={(e) => setMesSelecionado(e.target.value)} className="bg-transparent border-none outline-none text-[10px] font-black uppercase tracking-widest text-white cursor-pointer"/>
            </div>
            <button onClick={() => setIsModalOpen(true)} className="bg-[#22C55E] text-[#0F172A] px-6 py-2 rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-105 transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(34,197,94,0.2)]"><Plus size={20} strokeWidth={3} /> Novo</button>
        </div>
      </div>

      {/* CARDS DE RESUMO */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 px-4">
        <div className="bg-[#0B1120] border border-white/10 p-6 rounded-[32px] relative overflow-hidden">
            <div className={`absolute top-0 right-0 p-6 opacity-10 ${resumoMensal.saldo >= 0 ? 'text-[#22C55E]' : 'text-red-500'}`}><DollarSign size={64} /></div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Saldo em Caixa</p>
            <h2 className={`text-4xl font-black tracking-tight ${resumoMensal.saldo >= 0 ? 'text-[#22C55E]' : 'text-red-500'}`}>R$ {resumoMensal.saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
        </div>
        <div className="bg-[#0B1120] border border-white/10 p-6 rounded-[32px] relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 text-blue-500 opacity-10"><ArrowUpCircle size={64} /></div>
            <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Total Recebido</p>
            <h2 className="text-3xl font-black text-white tracking-tight">R$ {resumoMensal.entradas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
        </div>
        <div className="bg-[#0B1120] border border-white/10 p-6 rounded-[32px] relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 text-red-500 opacity-10"><ArrowDownCircle size={64} /></div>
            <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Total Pago</p>
            <h2 className="text-3xl font-black text-white tracking-tight">R$ {resumoMensal.saidas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h2>
        </div>
      </div>

      {/* LISTA */}
      <div className="bg-[#0B1120] border border-white/5 rounded-[32px] overflow-hidden shadow-2xl p-6 mx-4">
        <div className="flex gap-4 mb-6 overflow-x-auto pb-2">
            <button onClick={() => setFiltroTipo('todos')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filtroTipo === 'todos' ? 'bg-white text-black' : 'bg-white/5 text-slate-500'}`}>Todos</button>
            <button onClick={() => setFiltroTipo('entrada')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filtroTipo === 'entrada' ? 'bg-[#22C55E] text-[#0F172A]' : 'bg-white/5 text-slate-500'}`}>Entradas</button>
            <button onClick={() => setFiltroTipo('saida')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filtroTipo === 'saida' ? 'bg-red-500 text-white' : 'bg-white/5 text-slate-500'}`}>Saídas</button>
        </div>

        <div className="space-y-3">
            {loading && lancamentos.length === 0 ? (
                 <div className="text-center py-10 opacity-50"><Loader2 className="animate-spin mx-auto mb-2"/> Carregando...</div>
            ) : (
                listaFiltrada.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-2xl hover:border-white/10 transition-all group">
                    <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.tipo === 'entrada' ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'bg-red-500/10 text-red-500'}`}>{item.tipo === 'entrada' ? <TrendingUp size={20} /> : <TrendingDown size={20} />}</div>
                        <div>
                            <h3 className="text-white font-bold text-sm uppercase">{item.titulo}</h3>
                            <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase mt-0.5">
                                <span className="bg-white/5 px-1.5 py-0.5 rounded">{item.categoria}</span>
                                <span>• {new Date(item.data_vencimento).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}</span>
                            </div>
                        </div>
                    </div>
                    <div className="text-right flex items-center gap-6">
                        <div>
                            <p className={`font-black text-lg ${item.tipo === 'entrada' ? 'text-[#22C55E]' : 'text-red-500'}`}>{item.tipo === 'saida' ? '- ' : '+ '}R$ {item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            
                            {/* BOTÃO DE STATUS INTERATIVO */}
                            <button 
                                onClick={() => toggleStatus(item.id, item.status, item.tipo, item.valor)}
                                className="ml-auto text-[9px] font-bold uppercase tracking-widest flex items-center gap-1 hover:opacity-80 transition-opacity"
                            >
                                {item.status === 'pago' ? (
                                    <span className="text-green-500 flex items-center gap-1"><CheckCircle size={10}/> Pago</span>
                                ) : (
                                    <span className="text-yellow-500 flex items-center gap-1"><Clock size={10}/> Pendente</span>
                                )}
                            </button>
                        </div>
                        <button onClick={() => handleDelete(item.id)} className="p-2 text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={16} /></button>
                    </div>
                </div>
            )))}
            
            {listaFiltrada.length === 0 && !loading && <p className="text-center text-slate-600 text-xs font-bold uppercase py-10">Nenhum lançamento encontrado.</p>}

            {hasMore && !loading && lancamentos.length > 0 && (
                <div className="py-4 text-center">
                    <button onClick={loadMore} disabled={loadingMore} className="bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 mx-auto disabled:opacity-50">
                        {loadingMore ? <Loader2 className="animate-spin" size={14}/> : <ChevronDown size={14}/>} 
                        {loadingMore ? 'Carregando...' : 'Carregar Mais'}
                    </button>
                </div>
            )}
        </div>
      </div>

      {/* MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#0B1120] border border-white/10 p-8 rounded-[40px] w-full max-w-md shadow-2xl relative">
                <button onClick={() => setIsModalOpen(false)} className="absolute top-6 right-6 text-slate-500 hover:text-white"><XCircle size={24}/></button>
                <h2 className="text-2xl font-black uppercase italic tracking-tighter text-white mb-6">Novo Lançamento</h2>
                <form onSubmit={handleSave} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <button type="button" onClick={() => setFormData({...formData, tipo: 'entrada'})} className={`py-4 rounded-xl font-black uppercase text-xs tracking-widest border transition-all ${formData.tipo === 'entrada' ? 'bg-[#22C55E] text-[#0F172A] border-[#22C55E]' : 'bg-transparent text-slate-500 border-white/10 hover:border-[#22C55E]'}`}>Entrada</button>
                        <button type="button" onClick={() => setFormData({...formData, tipo: 'saida'})} className={`py-4 rounded-xl font-black uppercase text-xs tracking-widest border transition-all ${formData.tipo === 'saida' ? 'bg-red-500 text-white border-red-500' : 'bg-transparent text-slate-500 border-white/10 hover:border-red-500'}`}>Saída</button>
                    </div>
                    <div><label className="text-[10px] font-black uppercase text-slate-500 ml-2">Descrição</label><input className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-blue-500" placeholder="Ex: Pagamento Cliente X" value={formData.titulo} onChange={e => setFormData({...formData, titulo: e.target.value})} autoFocus required /></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="text-[10px] font-black uppercase text-slate-500 ml-2">Valor (R$)</label><input type="number" step="0.01" className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-blue-500" placeholder="0.00" value={formData.valor} onChange={e => setFormData({...formData, valor: e.target.value})} required /></div>
                        <div><label className="text-[10px] font-black uppercase text-slate-500 ml-2">Vencimento</label><input type="date" className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-blue-500" value={formData.data_vencimento} onChange={e => setFormData({...formData, data_vencimento: e.target.value})} required /></div>
                    </div>
                    <button type="submit" className="w-full bg-white text-[#0F172A] py-4 rounded-2xl font-black uppercase text-xs tracking-widest hover:scale-[1.02] transition-all mt-2">Confirmar Lançamento</button>
                </form>
            </div>
        </div>
      )}
    </div>
  );
}