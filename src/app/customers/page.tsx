"use client";
import { useState, useEffect, useRef } from 'react';
import { 
  Users, Search, Plus, Edit2, Trash2, 
  Phone, FileText, X, History, CheckCircle2, XCircle, 
  Loader2, ChevronDown, Building2, User, Upload, Hash, MapPin, Mail, Zap
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';

type Cliente = {
  id: number; nome_empresa: string; telefone: string; email?: string; cnpj?: string;
  inscricao_estadual?: string; cep?: string; endereco?: string; numero?: string;            
  estado?: string; cidade?: string; bairro?: string; status: 'ativo' | 'inativo';
  user_id?: string; empresa_id?: string; created_at: string;
};

type Unit = { id: string; nome: string; cidade: string; estado?: string; };
type Vendedor = { id: string; nome: string; };
type VendaHistorico = { id: number; created_at: string; valor_total: number; status: string; itens: any[]; };

const ITEMS_PER_PAGE = 20;
const formatId = (id: number, prefix: string) => `${prefix}-${String(id).padStart(4, '0')}`;

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

  const [isSearchingCnpj, setIsSearchingCnpj] = useState(false);
  const [formData, setFormData] = useState({
    nome_empresa: '', telefone: '', email: '', cnpj: '',
    inscricao_estadual: '', cep: '', endereco: '', numero: '',
    cidade: '', bairro: '', estado: '', status: 'ativo', user_id: '' 
  });

  const searchTimeout = useRef<NodeJS.Timeout | null>(null);
  const isDirector = perfil?.cargo === 'diretor' || perfil?.email === 'admin@wegrow.com';

  useEffect(() => {
    async function fetchSellers() {
      const { data } = await supabase.from('profiles').select('id, nome'); 
      if (data) setVendedores(data as any);
    }
    fetchSellers();
  }, []);

  useEffect(() => { if (user && perfil) resetAndFetch(); }, [user, perfil, statusFilter]);

  useEffect(() => {
    if (!user) return;
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => resetAndFetch(), 500);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [busca]);

  const resetAndFetch = () => { setPage(0); setHasMore(true); setClientes([]); fetchClientes(0, true); };

  const fetchClientes = async (pageIndex: number, isNewSearch = false) => {
    if (pageIndex === 0) setLoading(true); else setLoadingMore(true);
    try {
        const from = pageIndex * ITEMS_PER_PAGE;
        const to = from + ITEMS_PER_PAGE - 1;
        let query = supabase.from('clientes').select('*', { count: 'exact' }).order('nome_empresa', { ascending: true }).range(from, to);
        if (statusFilter !== 'todos') query = query.eq('status', statusFilter);
        if (busca.trim()) query = query.or(`nome_empresa.ilike.%${busca}%,cnpj.ilike.%${busca}%,cidade.ilike.%${busca}%,bairro.ilike.%${busca}%,email.ilike.%${busca}%`);

        const { data, count, error } = await query;
        if (error) throw error;
        if (data) {
            setClientes(prev => isNewSearch ? (data as any) : [...prev, ...(data as any)]);
            setTotalCount(count || 0);
            if (data.length < ITEMS_PER_PAGE) setHasMore(false);
        }
    } catch (error) { console.error(error); } finally { setLoading(false); setLoadingMore(false); }
  };

  const loadMore = () => { const nextPage = page + 1; setPage(nextPage); fetchClientes(nextPage, false); };

  const fetchHistorico = async (clientId: number) => {
    const { data } = await supabase.from('leads').select('id, created_at, valor_total, status').eq('client_id', clientId).order('created_at', { ascending: false });
    if (data) setHistoricoVendas(data as any);
  };

  const fetchUnidades = async (clientId: number) => {
    const { data } = await supabase.from('units').select('*').eq('customer_id', clientId);
    if (data) setUnidades(data);
  };

  const handleCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value.replace(/\D/g, '').substring(0, 14);
    let masked = v;
    if (v.length > 12) masked = v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    else if (v.length > 8) masked = v.replace(/(\d{2})(\d{3})(\d{3})(\d{1,4})/, '$1.$2.$3/$4');
    else if (v.length > 5) masked = v.replace(/(\d{2})(\d{3})(\d{1,3})/, '$1.$2.$3');
    else if (v.length > 2) masked = v.replace(/(\d{2})(\d{1,3})/, '$1.$2');
    setFormData({ ...formData, cnpj: masked });
  };

  // 👇 MOTOR HÍBRIDO DEFINITIVO (Plano A + Plano B) 👇
  const buscarDadosCNPJ = async () => {
    const cnpj = formData.cnpj.replace(/\D/g, '');
    if (cnpj.length !== 14) return alert("⚠️ Digite os 14 números do CNPJ.");

    setIsSearchingCnpj(true);
    try {
        // 🚀 PLANO A: Tenta a API CNPJ.ws (Com Inscrição Estadual)
        const res1 = await fetch(`https://publica.cnpj.ws/cnpj/${cnpj}`);
        
        if (res1.ok) {
            const data = await res1.json();
            const est = data.estabelecimento;
            const inscricao = est.inscricoes_estaduais && est.inscricoes_estaduais.length > 0 ? est.inscricoes_estaduais[0].inscricao_estadual : "ISENTO";
            const ruaFormatada = `${est.tipo_logradouro || ''} ${est.logradouro || ''}`.trim();

            setFormData(prev => ({
                ...prev,
                nome_empresa: est.nome_fantasia || data.razao_social || prev.nome_empresa,
                cep: est.cep || prev.cep || "",
                endereco: ruaFormatada || prev.endereco || "",
                numero: est.numero || prev.numero || "",
                bairro: est.bairro || prev.bairro || "",
                cidade: est.cidade?.nome || prev.cidade || "",
                estado: est.estado?.sigla || prev.estado || "",
                inscricao_estadual: inscricao
            }));

            if (!est.logradouro && !est.cep) {
                alert("ℹ️ A Receita ocultou o endereço desta empresa (comum em MEI devido à LGPD). Preencha manualmente.");
            }
            setIsSearchingCnpj(false);
            return; // Sucesso no Plano A! Encerra aqui.
        }

        // 🛡️ PLANO B: Se a primeira falhou (limite de uso), usa a BrasilAPI (infinita, mas sem IE)
        const res2 = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
        
        if (res2.ok) {
            const data2 = await res2.json();
            setFormData(prev => ({
                ...prev,
                nome_empresa: data2.nome_fantasia || data2.razao_social || prev.nome_empresa,
                cep: data2.cep || prev.cep || "",
                endereco: data2.logradouro || prev.endereco || "",
                numero: data2.numero || prev.numero || "",
                bairro: data2.bairro || prev.bairro || "",
                cidade: data2.municipio || prev.cidade || "",
                estado: data2.uf || prev.estado || "",
                // Mantém o campo Inscrição Estadual intocado (vazio ou o que já estava)
            }));

            console.warn("Plano B ativado (BrasilAPI). Inscrição Estadual precisará ser manual.");

            if (!data2.logradouro && !data2.cep) {
                alert("ℹ️ A Receita ocultou o endereço desta empresa (comum em MEI devido à LGPD). Preencha manualmente.");
            }
            setIsSearchingCnpj(false);
            return; // Sucesso no Plano B! Encerra aqui.
        }

        // ❌ Se as duas APIs falharem:
        throw new Error("CNPJ não encontrado nas bases da Receita Federal. Verifique o número digitado.");

    } catch (err: any) {
        alert("❌ Erro na busca: " + err.message);
    } finally {
        setIsSearchingCnpj(false);
    }
  };

  const handleOpenModal = (cliente?: Cliente) => {
    if (cliente) {
      setEditingId(cliente.id);
      setFormData({
        nome_empresa: cliente.nome_empresa, telefone: cliente.telefone || '', email: cliente.email || '',
        cnpj: cliente.cnpj || '', inscricao_estadual: cliente.inscricao_estadual || '', cep: cliente.cep || '',
        endereco: cliente.endereco || '', numero: cliente.numero || '', cidade: cliente.cidade || '', 
        bairro: cliente.bairro || '', estado: cliente.estado || '', status: cliente.status || 'ativo' as any,
        user_id: cliente.user_id || ''
      });
      fetchHistorico(cliente.id); fetchUnidades(cliente.id); setActiveTab('dados');
    } else {
      setEditingId(null);
      setFormData({ 
        nome_empresa: '', telefone: '', email: '', cnpj: '', inscricao_estadual: '', cep: '', endereco: '', numero: '', 
        cidade: '', bairro: '', estado: '', status: 'ativo', user_id: isDirector ? '' : (user?.id || '') 
      });
      setHistoricoVendas([]); setUnidades([]); setActiveTab('dados');
    }
    setIsModalOpen(true);
  };

  const handleSaveCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome_empresa) return alert("Nome é obrigatório");
    
    // Formata o payload sem travar o vendedor
    const payload = { ...formData, empresa_id: perfil?.empresa_id };
    
    // Se for um novo cliente e o vendedor não for selecionado, assume o usuário logado
    if (!editingId && !payload.user_id) {
        payload.user_id = user?.id;
    } else if (payload.user_id === "") {
        payload.user_id = null as any; // Permite ficar sem dono
    }

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
            alert("Cliente salvo com sucesso!");
        }
      }
      if (editingId) setIsModalOpen(false);
    } catch (error: any) { alert("Erro ao salvar: " + error.message); }
  };

  const handleSaveUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId || !newUnit.nome) return;
    const { data, error } = await supabase.from('units').insert([{ customer_id: editingId, nome: newUnit.nome, cidade: newUnit.cidade, estado: newUnit.estado }]).select();
    if (!error && data) { setUnidades(prev => [...prev, data[0]]); setNewUnit({ nome: '', cidade: '', estado: '' }); }
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

  return (
    <div className="h-full flex flex-col pb-4 animate-in fade-in duration-500">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6 px-2">
        <div>
          <h1 className="text-3xl font-black text-white uppercase italic tracking-tighter">Carteira de Clientes</h1>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{totalCount} Empresas encontradas</p>
        </div>
        <div className="flex gap-2">
            <button className="bg-white/5 border border-white/10 text-slate-300 px-4 py-3 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2">
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
            placeholder="Buscar por nome, CNPJ, Cidade..."
            value={busca} onChange={e => setBusca(e.target.value)}
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
                            <h3 className="text-white font-black text-sm uppercase tracking-wide flex items-center gap-2">
                                {cliente.nome_empresa}
                                <span className="text-[9px] bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded tracking-widest flex items-center gap-0.5">
                                    <Hash size={10}/> {formatId(cliente.id, 'CL')}
                                </span>
                            </h3>
                            <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500 font-bold uppercase mt-1.5">
                                {(cliente.cidade || cliente.bairro) && (
                                    <span className="flex items-center gap-1 bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">
                                        <MapPin size={10}/> {[cliente.cidade, cliente.bairro].filter(Boolean).join(' - ')}
                                    </span>
                                )}
                                {cliente.telefone && <span className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded"><Phone size={10}/> {cliente.telefone}</span>}
                                {cliente.cnpj && <span className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded"><FileText size={10}/> {cliente.cnpj}</span>}
                                {cliente.user_id && (
                                    <span className="flex items-center gap-1 bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded border border-blue-500/20">
                                        <User size={10}/> {vendedores.find(v => v.id === cliente.user_id)?.nome || 'Vendedor'}
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
            
            <h2 className="text-2xl font-black uppercase italic tracking-tighter text-white mb-6 flex items-center gap-2">
                {editingId ? 'Gerenciar Cliente' : 'Novo Cadastro'}
                {editingId && <span className="text-purple-400 bg-purple-500/10 px-2 py-1 rounded text-xl">#{formatId(editingId, 'CL')}</span>}
            </h2>

            <div className="flex gap-2 mb-6 border-b border-white/10 overflow-x-auto">
               <button onClick={() => setActiveTab('dados')} className={`pb-3 px-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${activeTab === 'dados' ? 'border-[#22C55E] text-[#22C55E]' : 'border-transparent text-slate-500 hover:text-white'}`}>Dados Cadastrais</button>
               {editingId && (
                   <>
                   <button onClick={() => setActiveTab('unidades')} className={`pb-3 px-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'unidades' ? 'border-purple-500 text-purple-500' : 'border-transparent text-slate-500 hover:text-white'}`}><Building2 size={14}/> Filiais ({unidades.length})</button>
                   <button onClick={() => setActiveTab('historico')} className={`pb-3 px-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'historico' ? 'border-blue-500 text-blue-500' : 'border-transparent text-slate-500 hover:text-white'}`}><History size={14}/> Histórico</button>
                   </>
               )}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                
                {activeTab === 'dados' && (
                <form onSubmit={handleSaveCliente} className="space-y-6 pb-2">
                    
                    {/* BUSCA CNPJ CLEAN */}
                    <div className="bg-white/5 border border-white/10 p-4 rounded-2xl space-y-4">
                        <h3 className="text-[10px] font-black uppercase text-blue-400 flex items-center gap-2"><Zap size={14} /> Busca Inteligente</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                            <div className="flex-1">
                                <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 block">CNPJ</label>
                                <div className="relative">
                                    <input 
                                        className="w-full bg-[#0B1120] border border-white/10 rounded-xl pl-4 pr-12 py-3 text-white text-sm font-bold outline-none focus:border-blue-500 transition-all" 
                                        value={formData.cnpj} 
                                        onChange={handleCnpjChange} 
                                        placeholder="00.000.000/0000-00" 
                                    />
                                    <button 
                                        type="button" 
                                        onClick={buscarDadosCNPJ} 
                                        disabled={isSearchingCnpj} 
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 p-2 rounded-lg transition-all flex items-center justify-center"
                                        title="Buscar Dados"
                                    >
                                        {isSearchingCnpj ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 block">Inscrição Estadual</label>
                                <input className="w-full bg-[#0B1120] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" value={formData.inscricao_estadual} onChange={e => setFormData({...formData, inscricao_estadual: e.target.value})} placeholder="ISENTO ou número" />
                            </div>
                        </div>
                    </div>

                    {/* DADOS */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 block">Razão Social / Nome *</label>
                            <input className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] uppercase" value={formData.nome_empresa} onChange={e => setFormData({...formData, nome_empresa: e.target.value})} required />
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 block">Telefone</label>
                            <input className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" value={formData.telefone} onChange={e => setFormData({...formData, telefone: e.target.value})} />
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 block">E-mail</label>
                            <input type="email" className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                        </div>
                    </div>

                    {/* ENDEREÇO */}
                    <div className="bg-white/5 border border-white/10 p-4 rounded-2xl space-y-4">
                        <h3 className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-2"><MapPin size={14}/> Endereço</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 block">CEP</label>
                                <input className="w-full bg-[#0B1120] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" value={formData.cep} onChange={e => setFormData({...formData, cep: e.target.value})} />
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 block">Rua/Av</label>
                                <input className="w-full bg-[#0B1120] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] uppercase" value={formData.endereco} onChange={e => setFormData({...formData, endereco: e.target.value})} />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 block">Número</label>
                                <input className="w-full bg-[#0B1120] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] uppercase" value={formData.numero} onChange={e => setFormData({...formData, numero: e.target.value})} />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 block">Bairro</label>
                                <input className="w-full bg-[#0B1120] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] uppercase" value={formData.bairro} onChange={e => setFormData({...formData, bairro: e.target.value})} />
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 block">Cidade / UF</label>
                                <div className="flex gap-2">
                                    <input className="w-full bg-[#0B1120] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] uppercase" value={formData.cidade} onChange={e => setFormData({...formData, cidade: e.target.value})} />
                                    <input className="w-16 bg-[#0B1120] border border-white/10 rounded-xl px-2 py-3 text-white text-sm font-bold outline-none text-center focus:border-[#22C55E] uppercase" value={formData.estado} onChange={e => setFormData({...formData, estado: e.target.value})} maxLength={2} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 block">Status</label>
                            <select className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as any})}>
                                <option value="ativo" className="bg-[#0B1120]">Ativo</option>
                                <option value="inativo" className="bg-[#0B1120]">Inativo</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-1 block">Vendedor (Dono)</label>
                            <select className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" value={formData.user_id} onChange={e => setFormData({...formData, user_id: e.target.value})}>
                                <option value="" className="bg-[#0B1120]">Sem Vendedor (Geral)</option>
                                {vendedores.map(v => <option key={v.id} value={v.id} className="bg-[#0B1120]">{v.nome}</option>)}
                            </select>
                        </div>
                    </div>

                    <button type="submit" className="w-full bg-[#22C55E] text-[#0F172A] py-4 rounded-2xl font-black uppercase text-xs tracking-widest hover:scale-[1.02] transition-all shadow-lg mt-4">
                        {editingId ? 'Salvar Alterações' : 'Criar Cliente'}
                    </button>
                </form>
                )}

                {/* UNIDADES E HISTÓRICO */}
                {activeTab === 'unidades' && (
                    <div className="space-y-6">
                        <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                            <form onSubmit={handleSaveUnit} className="flex flex-col md:flex-row gap-3">
                                <input className="flex-1 bg-[#0B1120] border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-purple-500" placeholder="Nova Filial (Nome)" value={newUnit.nome} onChange={e => setNewUnit({...newUnit, nome: e.target.value})} required/>
                                <input className="w-32 bg-[#0B1120] border border-white/10 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-purple-500" placeholder="Cidade" value={newUnit.cidade} onChange={e => setNewUnit({...newUnit, cidade: e.target.value})}/>
                                <button type="submit" className="bg-purple-600 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase hover:bg-purple-500 transition-colors">Add</button>
                            </form>
                        </div>
                        <div className="space-y-2">
                            {unidades.map(unit => (
                                <div key={unit.id} className="flex justify-between items-center bg-white/[0.02] p-3 rounded-xl border border-white/5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center"><Building2 size={16}/></div>
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
                            <span className="text-[10px] text-slate-500 font-black uppercase mb-1">{new Date(venda.created_at).toLocaleDateString('pt-BR')}</span>
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded uppercase bg-blue-500/20 text-blue-500 w-fit">{venda.status}</span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-sm font-black text-white">R$ {venda.valor_total.toLocaleString('pt-BR')}</span>
                            <span className="text-[8px] text-slate-500 font-mono mt-1">Ref: {formatId(venda.id, 'LD')}</span>
                        </div>
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