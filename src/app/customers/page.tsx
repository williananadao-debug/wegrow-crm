"use client";
import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Users, Search, Plus, Filter, Edit2, Trash2, 
  Phone, FileText, X, History, CheckCircle2, XCircle, Loader2, ChevronDown
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';

// Tipos
type Cliente = {
  id: number;
  nome_empresa: string;
  telefone: string;
  email?: string;
  cnpj?: string;
  status: 'ativo' | 'inativo';
  created_at: string;
};

type VendaHistorico = {
  id: number;
  created_at: string;
  valor_total: number;
  status: string;
  itens: any[];
};

const ITEMS_PER_PAGE = 20;

export default function CustomersPage() {
  const { user } = useAuth();
  
  // Estados de Dados
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  // Filtros
  const [busca, setBusca] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'ativo' | 'inativo'>('ativo');
  
  // Modal e Edição
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'dados' | 'historico'>('dados');
  const [historicoVendas, setHistoricoVendas] = useState<VendaHistorico[]>([]);

  const [formData, setFormData] = useState({
    nome_empresa: '',
    telefone: '',
    email: '',
    cnpj: '',
    status: 'ativo'
  });

  // Ref para o Debounce da busca
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  // 1. Carregamento Inicial e Reset de Filtros
  useEffect(() => {
    if (user) {
        resetAndFetch();
    }
  }, [user, statusFilter]); // Recarrega se mudar o filtro de status

  // 2. Efeito de Busca com Debounce (Espera digitar para buscar)
  useEffect(() => {
    if (!user) return;
    
    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    searchTimeout.current = setTimeout(() => {
        resetAndFetch();
    }, 500); // 500ms de delay

    return () => {
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [busca]);

  const resetAndFetch = () => {
      setPage(0);
      setHasMore(true);
      setClientes([]); // Limpa a lista visualmente para dar feedback de busca
      fetchClientes(0, true);
  };

  // 3. Função "Turbo" de Busca no Banco
  const fetchClientes = async (pageIndex: number, isNewSearch = false) => {
    if (pageIndex === 0) setLoading(true);
    else setLoadingMore(true);

    try {
        const from = pageIndex * ITEMS_PER_PAGE;
        const to = from + ITEMS_PER_PAGE - 1;

        let query = supabase
            .from('clientes')
            .select('*', { count: 'exact' })
            .order('nome_empresa', { ascending: true })
            .range(from, to);

        // Aplica Filtro de Status
        if (statusFilter !== 'todos') {
            query = query.eq('status', statusFilter);
        }

        // Aplica Busca Textual (Server-Side)
        if (busca.trim()) {
            // Busca por nome OU cnpj
            query = query.or(`nome_empresa.ilike.%${busca}%,cnpj.ilike.%${busca}%`);
        }

        const { data, count, error } = await query;

        if (error) throw error;

        if (data) {
            setClientes(prev => isNewSearch ? (data as any) : [...prev, ...(data as any)]);
            setTotalCount(count || 0);
            // Se vier menos itens que o limite, acabou a lista
            if (data.length < ITEMS_PER_PAGE) {
                setHasMore(false);
            }
        }
    } catch (error) {
        console.error("Erro ao buscar clientes:", error);
    } finally {
        setLoading(false);
        setLoadingMore(false);
    }
  };

  const loadMore = () => {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchClientes(nextPage, false);
  };

  // Carregar Histórico
  const fetchHistorico = async (clientId: number) => {
    const { data } = await supabase
      .from('leads')
      .select('id, created_at, valor_total, status, itens')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
      
    if (data) setHistoricoVendas(data);
  };

  // Abrir Modal
  const handleOpenModal = (cliente?: Cliente) => {
    if (cliente) {
      setEditingId(cliente.id);
      setFormData({
        nome_empresa: cliente.nome_empresa,
        telefone: cliente.telefone || '',
        email: cliente.email || '',
        cnpj: cliente.cnpj || '',
        status: cliente.status || 'ativo'
      });
      fetchHistorico(cliente.id);
      setActiveTab('dados');
    } else {
      setEditingId(null);
      setFormData({ nome_empresa: '', telefone: '', email: '', cnpj: '', status: 'ativo' });
      setHistoricoVendas([]);
      setActiveTab('dados');
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome_empresa) return alert("Nome é obrigatório");

    const payload = { ...formData, user_id: user?.id };

    if (editingId) {
      await supabase.from('clientes').update(payload).eq('id', editingId);
      // Atualiza localmente para não precisar refazer o fetch
      setClientes(prev => prev.map(c => c.id === editingId ? { ...c, ...payload } as any : c));
    } else {
      const { data, error } = await supabase.from('clientes').insert([payload]).select();
      if (!error && data) {
          setClientes(prev => [data[0] as any, ...prev]);
          setTotalCount(prev => prev + 1);
      }
    }
    setIsModalOpen(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Excluir cliente e todo seu histórico?")) return;
    const { error } = await supabase.from('clientes').delete().eq('id', id);
    if (!error) {
        setClientes(prev => prev.filter(c => c.id !== id));
        setTotalCount(prev => prev - 1);
    }
  };

  return (
    <div className="h-full flex flex-col pb-4 animate-in fade-in duration-500">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6 px-2">
        <div>
          <h1 className="text-3xl font-black text-white uppercase italic tracking-tighter">Carteira de Clientes</h1>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">
            {totalCount} Empresas encontradas
          </p>
        </div>
        <button onClick={() => handleOpenModal()} className="bg-[#22C55E] text-[#0F172A] px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-105 transition-all flex items-center gap-2 shadow-[0_10px_30px_rgba(34,197,94,0.2)]">
          <Plus size={18} strokeWidth={3} /> Novo Cliente
        </button>
      </div>

      {/* BARRA DE FILTROS OTIMIZADA */}
      <div className="bg-[#0B1120] border border-white/10 p-4 rounded-[24px] mb-6 flex flex-col md:flex-row gap-4 items-center shadow-xl">
        <div className="flex-1 relative w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <input 
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-white text-sm focus:border-[#22C55E] outline-none placeholder:text-slate-600 transition-all"
            placeholder="Buscar por nome ou CNPJ..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
        </div>
        
        <div className="flex gap-2 bg-white/5 p-1 rounded-xl">
            <button onClick={() => setStatusFilter('ativo')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${statusFilter === 'ativo' ? 'bg-[#22C55E] text-[#0F172A]' : 'text-slate-500 hover:text-white'}`}>Ativos</button>
            <button onClick={() => setStatusFilter('inativo')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${statusFilter === 'inativo' ? 'bg-red-500 text-white' : 'text-slate-500 hover:text-white'}`}>Inativos</button>
            <button onClick={() => setStatusFilter('todos')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${statusFilter === 'todos' ? 'bg-white text-black' : 'text-slate-500 hover:text-white'}`}>Todos</button>
        </div>
      </div>

      {/* LISTA DE CLIENTES VIRTUALIZADA (PAGINADA) */}
      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2 pb-10">
        
        {loading && clientes.length === 0 ? (
            <div className="text-center py-20 text-slate-500 flex flex-col items-center">
                <Loader2 className="animate-spin mb-4" size={32}/>
                <p className="text-xs font-bold uppercase">Buscando na base de dados...</p>
            </div>
        ) : (
            <>
                {clientes.map(cliente => (
                <div key={cliente.id} className="bg-white/[0.02] border border-white/5 p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between hover:border-white/10 transition-all group relative overflow-hidden">
                    
                    {/* Status Indicator */}
                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${cliente.status === 'ativo' ? 'bg-[#22C55E]' : 'bg-red-500'}`}></div>

                    <div className="flex items-center gap-5 pl-3">
                    <div className="w-12 h-12 bg-blue-600/10 text-blue-400 rounded-2xl flex items-center justify-center font-black text-xl uppercase shadow-inner flex-shrink-0">
                        {cliente.nome_empresa.charAt(0)}
                    </div>
                    <div>
                        <h3 className="text-white font-black text-sm uppercase tracking-wide">{cliente.nome_empresa}</h3>
                        <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500 font-bold uppercase mt-1">
                        {cliente.telefone && <span className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded"><Phone size={10}/> {cliente.telefone}</span>}
                        {cliente.cnpj && <span className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded"><FileText size={10}/> {cliente.cnpj}</span>}
                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded ${cliente.status === 'ativo' ? 'text-[#22C55E] bg-[#22C55E]/10' : 'text-red-500 bg-red-500/10'}`}>
                            {cliente.status === 'ativo' ? <CheckCircle2 size={10}/> : <XCircle size={10}/>} {cliente.status}
                        </span>
                        </div>
                    </div>
                    </div>

                    <div className="flex items-center gap-2 mt-4 md:mt-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleOpenModal(cliente)} className="flex items-center gap-2 px-3 py-2 bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl text-[10px] font-bold uppercase transition-colors">
                        <Edit2 size={14} /> Editar / Ver
                    </button>
                    <button onClick={() => handleDelete(cliente.id)} className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-colors">
                        <Trash2 size={14} />
                    </button>
                    </div>
                </div>
                ))}

                {/* Botão Carregar Mais / Loading Indicator */}
                <div className="py-4 text-center">
                    {loadingMore ? (
                        <div className="flex items-center justify-center gap-2 text-slate-500 text-xs font-bold uppercase">
                            <Loader2 className="animate-spin" size={16}/> Carregando mais empresas...
                        </div>
                    ) : hasMore && clientes.length > 0 ? (
                        <button 
                            onClick={loadMore}
                            className="bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 mx-auto"
                        >
                            <ChevronDown size={14}/> Carregar Mais
                        </button>
                    ) : clientes.length > 0 ? (
                        <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">Fim da lista</p>
                    ) : (
                         <div className="text-center py-10 opacity-50">
                            <Users size={48} className="mx-auto mb-4 text-slate-600"/>
                            <p className="text-sm font-bold text-slate-500 uppercase">Nenhum cliente encontrado</p>
                        </div>
                    )}
                </div>
            </>
        )}
      </div>

      {/* MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-[#0B1120] border border-white/10 p-8 rounded-[40px] w-full max-w-2xl shadow-2xl relative max-h-[90vh] overflow-hidden flex flex-col">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-6 right-6 text-slate-500 hover:text-white"><X size={20}/></button>
            
            <h2 className="text-2xl font-black uppercase italic tracking-tighter text-white mb-6">
                {editingId ? 'Gerenciar Cliente' : 'Novo Cadastro'}
            </h2>

            {/* ABAS DE NAVEGAÇÃO */}
            <div className="flex gap-2 mb-6 border-b border-white/10">
               <button onClick={() => setActiveTab('dados')} className={`pb-3 px-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === 'dados' ? 'border-[#22C55E] text-[#22C55E]' : 'border-transparent text-slate-500 hover:text-white'}`}>
                   Dados Cadastrais
               </button>
               {editingId && (
                   <button onClick={() => setActiveTab('historico')} className={`pb-3 px-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all flex items-center gap-2 ${activeTab === 'historico' ? 'border-blue-500 text-blue-500' : 'border-transparent text-slate-500 hover:text-white'}`}>
                       <History size={14}/> Histórico ({historicoVendas.length})
                   </button>
               )}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                {activeTab === 'dados' ? (
                <form onSubmit={handleSave} className="space-y-5 pb-2">
                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Nome Fantasia *</label>
                        <input className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-colors" value={formData.nome_empresa} onChange={e => setFormData({...formData, nome_empresa: e.target.value})} required placeholder="Ex: Padaria Central"/>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Telefone / WhatsApp</label>
                            <input className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" value={formData.telefone} onChange={e => setFormData({...formData, telefone: e.target.value})} placeholder="(00) 00000-0000"/>
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2">CNPJ / CPF</label>
                            <input className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" value={formData.cnpj} onChange={e => setFormData({...formData, cnpj: e.target.value})} placeholder="00.000.000/0001-00"/>
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Email Financeiro</label>
                        <input className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} type="email" placeholder="financeiro@empresa.com"/>
                    </div>

                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Status do Contrato</label>
                        <select className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] appearance-none" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as any})}>
                            <option value="ativo" className="bg-[#0B1120]">Ativo</option>
                            <option value="inativo" className="bg-[#0B1120]">Inativo / Cancelado</option>
                        </select>
                    </div>

                    <button type="submit" className="w-full bg-[#22C55E] text-[#0F172A] py-4 rounded-2xl font-black uppercase text-xs tracking-widest hover:scale-[1.02] transition-all shadow-lg mt-4">
                        Salvar Ficha do Cliente
                    </button>
                </form>
                ) : (
                <div className="space-y-3 pb-2">
                    {historicoVendas.map(venda => (
                    <div key={venda.id} className="flex justify-between items-center bg-white/[0.03] p-4 rounded-xl border border-white/5 hover:bg-white/[0.05] transition-colors">
                        <div className="flex flex-col">
                            <span className="text-[10px] text-slate-500 font-black uppercase mb-1">
                                {new Date(venda.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                            </span>
                            <div className="flex gap-2">
                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase ${venda.status === 'ganho' ? 'bg-green-500/20 text-green-500' : venda.status === 'perdido' ? 'bg-red-500/20 text-red-500' : 'bg-blue-500/20 text-blue-500'}`}>
                                    {venda.status}
                                </span>
                                <span className="text-[10px] text-slate-400 font-bold uppercase">{Array.isArray(venda.itens) ? venda.itens.length : 0} Serviços</span>
                            </div>
                        </div>
                        <span className="text-lg font-black text-white">R$ {venda.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    ))}
                    {historicoVendas.length === 0 && (
                        <div className="text-center py-10 opacity-50">
                            <History size={32} className="mx-auto mb-2 text-slate-600"/>
                            <p className="text-xs font-bold text-slate-500 uppercase">Nenhuma negociação registrada.</p>
                        </div>
                    )}
                </div>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}