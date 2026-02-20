"use client";
import { useState, useEffect, useRef } from 'react';
import { 
  Users, Search, Plus, Edit2, Trash2, 
  Phone, FileText, X, History, CheckCircle2, XCircle, 
  Loader2, ChevronDown, Building2, User, Upload 
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';

// --- TIPOS ---
type Cliente = {
  id: number;
  nome_empresa: string;
  telefone: string;
  email?: string;
  cnpj?: string;
  status: 'ativo' | 'inativo';
  user_id?: string; 
  created_at: string;
};

type Unit = {
  id: string;
  nome: string;
  cidade: string;
  estado?: string;
};

type Vendedor = {
  id: string;
  nome: string;
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
  const auth = useAuth() || {};
const user = auth.user;
const perfil = auth.perfil;
  
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const [busca, setBusca] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'ativo' | 'inativo'>('ativo');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'dados' | 'unidades' | 'historico'>('dados');
  
  const [historicoVendas, setHistoricoVendas] = useState<VendaHistorico[]>([]);
  const [unidades, setUnidades] = useState<Unit[]>([]);
  const [newUnit, setNewUnit] = useState({ nome: '', cidade: '', estado: '' });

  const [formData, setFormData] = useState({
    nome_empresa: '',
    telefone: '',
    email: '',
    cnpj: '',
    status: 'ativo',
    user_id: '' 
  });

  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  // Verifica permissão
  const isDirector = perfil?.cargo === 'diretor' || perfil?.email === 'admin@wegrow.com';

  useEffect(() => {
    async function fetchSellers() {
      const { data, error } = await supabase.from('profiles').select('id, nome'); 
      if (data) setVendedores(data as any);
    }
    fetchSellers();
  }, []);

  useEffect(() => {
    if (user && perfil) resetAndFetch();
  }, [user, perfil, statusFilter]);

  useEffect(() => {
    if (!user) return;
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => resetAndFetch(), 500);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [busca]);

  const resetAndFetch = () => {
      setPage(0);
      setHasMore(true);
      setClientes([]); 
      fetchClientes(0, true);
  };

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

        // A TRAVA DE PRIVACIDADE FOI REMOVIDA DAQUI! 
        // Agora o banco traz todos os clientes, não importa quem é o usuário logado.

        if (statusFilter !== 'todos') query = query.eq('status', statusFilter);
        
        if (busca.trim()) {
            query = query.or(`nome_empresa.ilike.%${busca}%,cnpj.ilike.%${busca}%`);
        }

        const { data, count, error } = await query;
        if (error) throw error;

        if (data) {
            setClientes(prev => isNewSearch ? (data as any) : [...prev, ...(data as any)]);
            setTotalCount(count || 0);
            if (data.length < ITEMS_PER_PAGE) setHasMore(false);
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

  const fetchHistorico = async (clientId: number) => {
    const { data } = await supabase
      .from('leads')
      .select('id, created_at, valor_total, status, itens')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    if (data) setHistoricoVendas(data);
  };

  const fetchUnidades = async (clientId: number) => {
    const { data } = await supabase
      .from('units')
      .select('*')
      .eq('customer_id', clientId);
    if (data) setUnidades(data);
  };

  const handleOpenModal = (cliente?: Cliente) => {
    if (cliente) {
      setEditingId(cliente.id);
      setFormData({
        nome_empresa: cliente.nome_empresa,
        telefone: cliente.telefone || '',
        email: cliente.email || '',
        cnpj: cliente.cnpj || '',
        status: cliente.status || 'ativo' as any,
        user_id: cliente.user_id || ''
      });
      fetchHistorico(cliente.id);
      fetchUnidades(cliente.id);
      setActiveTab('dados');
    } else {
      setEditingId(null);
      setFormData({ 
        nome_empresa: '', 
        telefone: '', 
        email: '', 
        cnpj: '', 
        status: 'ativo', 
        user_id: isDirector ? '' : (user?.id || '') 
      });
      setHistoricoVendas([]);
      setUnidades([]);
      setActiveTab('dados');
    }
    setIsModalOpen(true);
  };

  const handleSaveCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome_empresa) return alert("Nome é obrigatório");

    const payload = { ...formData };
    if (!payload.user_id) payload.user_id = user?.id;

    try {
      if (editingId) {
        const { error } = await supabase.from('clientes').update(payload).eq('id', editingId);
        if (error) throw error;
        resetAndFetch();
      } else {
        const { data, error } = await supabase.from('clientes').insert([payload]).select();
        if (error) throw error;
        if (data) {
            setEditingId(data[0].id);
            resetAndFetch();
            alert("Cliente criado! Agora você pode adicionar filiais.");
        }
      }
      if (editingId) setIsModalOpen(false);
    } catch (error: any) {
      alert("Erro ao salvar: " + error.message);
    }
  };

  const handleSaveUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    if (!newUnit.nome) return alert("Nome da unidade é obrigatório");

    const { data, error } = await supabase.from('units').insert([{
        customer_id: editingId,
        nome: newUnit.nome,
        cidade: newUnit.cidade,
        estado: newUnit.estado
    }]).select();

    if (!error && data) {
        setUnidades(prev => [...prev, data[0]]);
        setNewUnit({ nome: '', cidade: '', estado: '' });
    }
  };

  const handleDeleteUnit = async (unitId: string) => {
      if(!confirm("Remover esta unidade?")) return;
      const { error } = await supabase.from('units').delete().eq('id', unitId);
      if(!error) setUnidades(prev => prev.filter(u => u.id !== unitId));
  };

  const handleDeleteCliente = async (id: number) => {
    if (!confirm("Excluir cliente e todo seu histórico?")) return;
    const { error } = await supabase.from('clientes').delete().eq('id', id);
    if (!error) resetAndFetch();
  };

  const handleImport = () => {
    alert("Funcionalidade de importação CSV em desenvolvimento!");
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
        <div className="flex gap-2">
            <button onClick={handleImport} className="bg-white/5 border border-white/10 text-slate-300 px-4 py-3 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2">
                <Upload size={16} /> Importar
            </button>
            <button onClick={() => handleOpenModal()} className="bg-[#22C55E] text-[#0F172A] px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-105 transition-all flex items-center gap-2 shadow-[0_10px_30px_rgba(34,197,94,0.2)]">
                <Plus size={18} strokeWidth={3} /> Novo Cliente
            </button>
        </div>
      </div>

      {/* BARRA DE FILTROS */}
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

      {/* LISTA DE CLIENTES */}
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
                                {cliente.user_id && (
                                    <span className="flex items-center gap-1 bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded border border-purple-500/20">
                                        <User size={10}/> 
                                        {vendedores.find(v => v.id === cliente.user_id)?.nome || 'Vendedor'}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 mt-4 md:mt-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleOpenModal(cliente)} className="flex items-center gap-2 px-3 py-2 bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl text-[10px] font-bold uppercase transition-colors">
                            <Edit2 size={14} /> Editar
                        </button>
                        <button onClick={() => handleDeleteCliente(cliente.id)} className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-colors">
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>
                ))}
                
                <div className="py-4 text-center">
                    {loadingMore ? (
                        <div className="flex items-center justify-center gap-2 text-slate-500 text-xs font-bold uppercase"><Loader2 className="animate-spin" size={16}/></div>
                    ) : hasMore && clientes.length > 0 ? (
                        <button onClick={loadMore} className="bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 mx-auto">
                            <ChevronDown size={14}/> Carregar Mais
                        </button>
                    ) : null}
                </div>
            </>
        )}
      </div>

      {/* MODAL PRINCIPAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-[#0B1120] border border-white/10 p-8 rounded-[40px] w-full max-w-2xl shadow-2xl relative max-h-[90vh] overflow-hidden flex flex-col">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-6 right-6 text-slate-500 hover:text-white"><X size={20}/></button>
            
            <h2 className="text-2xl font-black uppercase italic tracking-tighter text-white mb-6">
                {editingId ? 'Gerenciar Cliente' : 'Novo Cadastro'}
            </h2>

            {/* ABAS */}
            <div className="flex gap-2 mb-6 border-b border-white/10 overflow-x-auto">
               <button onClick={() => setActiveTab('dados')} className={`pb-3 px-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${activeTab === 'dados' ? 'border-[#22C55E] text-[#22C55E]' : 'border-transparent text-slate-500 hover:text-white'}`}>
                    Dados Cadastrais
               </button>
               {editingId && (
                   <>
                   <button onClick={() => setActiveTab('unidades')} className={`pb-3 px-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'unidades' ? 'border-purple-500 text-purple-500' : 'border-transparent text-slate-500 hover:text-white'}`}>
                        <Building2 size={14}/> Filiais / Unidades ({unidades.length})
                   </button>
                   <button onClick={() => setActiveTab('historico')} className={`pb-3 px-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'historico' ? 'border-blue-500 text-blue-500' : 'border-transparent text-slate-500 hover:text-white'}`}>
                        <History size={14}/> Histórico
                   </button>
                   </>
               )}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                
                {activeTab === 'dados' && (
                <form onSubmit={handleSaveCliente} className="space-y-5 pb-2">
                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Nome Fantasia *</label>
                        <input className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-colors" value={formData.nome_empresa} onChange={e => setFormData({...formData, nome_empresa: e.target.value})} required placeholder="Ex: Nome da Empresa"/>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Telefone</label>
                            <input className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" value={formData.telefone} onChange={e => setFormData({...formData, telefone: e.target.value})} placeholder="(00) 00000-0000"/>
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2">CNPJ</label>
                            <input className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" value={formData.cnpj} onChange={e => setFormData({...formData, cnpj: e.target.value})} placeholder="CNPJ"/>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Status</label>
                            <select className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as any})}>
                                <option value="ativo" className="bg-[#0B1120]">Ativo</option>
                                <option value="inativo" className="bg-[#0B1120]">Inativo</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Responsável (Dono da Conta)</label>
                            <select 
                                className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" 
                                value={formData.user_id} 
                                onChange={e => setFormData({...formData, user_id: e.target.value})}
                                disabled={!isDirector} 
                            >
                                <option value="" className="bg-[#0B1120]">Selecione...</option>
                                {vendedores.map(v => (
                                    <option key={v.id} value={v.id} className="bg-[#0B1120]">{v.nome}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <button type="submit" className="w-full bg-[#22C55E] text-[#0F172A] py-4 rounded-2xl font-black uppercase text-xs tracking-widest hover:scale-[1.02] transition-all shadow-lg mt-4">
                        {editingId ? 'Salvar Alterações' : 'Criar Cliente'}
                    </button>
                </form>
                )}

                {activeTab === 'unidades' && (
                    <div className="space-y-6">
                        <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                            <h4 className="text-xs font-black uppercase text-white mb-3 flex items-center gap-2"><Plus size={14}/> Nova Filial</h4>
                            <form onSubmit={handleSaveUnit} className="flex flex-col md:flex-row gap-3">
                                <input className="flex-1 bg-[#0B1120] border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-purple-500" placeholder="Nome" value={newUnit.nome} onChange={e => setNewUnit({...newUnit, nome: e.target.value})} required/>
                                <input className="w-32 bg-[#0B1120] border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-purple-500" placeholder="Cidade" value={newUnit.cidade} onChange={e => setNewUnit({...newUnit, cidade: e.target.value})}/>
                                <button type="submit" className="bg-purple-600 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase hover:bg-purple-500 transition-colors">Adicionar</button>
                            </form>
                        </div>

                        <div className="space-y-2">
                            {unidades.map(unit => (
                                <div key={unit.id} className="flex justify-between items-center bg-white/[0.02] p-3 rounded-xl border border-white/5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
                                            <Building2 size={16}/>
                                        </div>
                                        <div>
                                            <div className="text-white text-sm font-bold">{unit.nome}</div>
                                            <div className="text-slate-500 text-[10px] uppercase">{unit.cidade || 'Sem local'}</div>
                                        </div>
                                    </div>
                                    <button onClick={() => handleDeleteUnit(unit.id)} className="text-slate-600 hover:text-red-500 p-2"><Trash2 size={14}/></button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'historico' && (
                <div className="space-y-3 pb-2">
                    {historicoVendas.map(venda => (
                    <div key={venda.id} className="flex justify-between items-center bg-white/[0.03] p-4 rounded-xl border border-white/5">
                        <div className="flex flex-col">
                            <span className="text-[10px] text-slate-500 font-black uppercase mb-1">
                                {new Date(venda.created_at).toLocaleDateString('pt-BR')}
                            </span>
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded uppercase bg-blue-500/20 text-blue-500 w-fit">{venda.status}</span>
                        </div>
                        <span className="text-sm font-black text-white">R$ {venda.valor_total.toLocaleString('pt-BR')}</span>
                    </div>
                    ))}
                    {historicoVendas.length === 0 && (
                         <div className="text-center py-10 opacity-50"><History size={32} className="mx-auto mb-2 text-slate-600"/><p className="text-xs font-bold text-slate-500 uppercase">Sem histórico.</p></div>
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