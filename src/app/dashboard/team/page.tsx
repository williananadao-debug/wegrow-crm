"use client";
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { 
  UserPlus, Mail, Trash2, Loader2, X, ShieldAlert, 
  UserCheck, Shield, Briefcase, Building2, MapPin 
} from 'lucide-react';

// Tipagem
interface Unidade {
  id: string;
  nome: string;
}

interface MembroEquipe {
  id: string;
  nome: string;
  email: string;
  cargo: 'diretor' | 'gerente' | 'vendedor';
  unidade_id?: string;
  units?: Unidade; // Relacionamento trazido pelo Supabase
}

export default function TeamPage() {
  const { user, perfil } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [equipe, setEquipe] = useState<MembroEquipe[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]); // Lista para o dropdown
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    nome: '',
    cargo: 'vendedor',
    unidade_id: '' // Novo campo
  });

  useEffect(() => {
    if (user && perfil) {
      fetchData();
    }
  }, [user, perfil]);

  async function fetchData() {
    setLoading(true);
    
    // 1. Busca Equipe com o nome da Unidade
    const { data: teamData } = await supabase
      .from('profiles')
      .select('*, units(nome)') // Join com tabela units
      .order('nome', { ascending: true });
    
    if (teamData) setEquipe(teamData as any);

    // 2. Busca Unidades para o Select
    const { data: unitsData } = await supabase
      .from('units')
      .select('id, nome')
      .order('nome');
      
    if (unitsData) setUnidades(unitsData);
    
    setLoading(false);
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.unidade_id) return alert("Selecione uma unidade/filial!");
    
    setCreating(true);

    // Cria no Auth e passa os metadados (incluindo unidade_id)
    // O Trigger SQL vai pegar esses dados e salvar na tabela profiles
    const { data, error } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
      options: {
        data: {
          nome: formData.nome,
          cargo: formData.cargo,
          unidade_id: formData.unidade_id 
        }
      }
    });

    if (error) {
      alert("Erro: " + error.message);
    } else {
      alert("Membro cadastrado com sucesso!");
      setIsModalOpen(false);
      setFormData({ email: '', password: '', nome: '', cargo: 'vendedor', unidade_id: '' });
      // Pequeno delay para dar tempo do Trigger rodar no banco
      setTimeout(() => fetchData(), 1000);
    }
    setCreating(false);
  }

  async function handleDeleteUser(id: string) {
    if (id === user?.id) return alert("Você não pode excluir a si mesmo!");
    if (!confirm("Tem certeza que deseja remover este membro da equipe?")) return;

    const { error } = await supabase.from('profiles').delete().eq('id', id);
    
    if (!error) {
      setEquipe(prev => prev.filter(m => m.id !== id));
    } else {
      alert("Erro ao remover: " + error.message);
    }
  }

  // Bloqueio de Segurança
  if (perfil?.cargo !== 'diretor' && perfil?.cargo !== 'gerente') {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-4 animate-in fade-in">
        <div className="p-4 bg-red-500/10 rounded-full text-red-500"><ShieldAlert size={48} /></div>
        <div className="text-center">
            <h2 className="text-white font-bold text-lg">Acesso Restrito</h2>
            <p className="text-[10px] font-black uppercase tracking-widest mt-1">Área exclusiva da Direção</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500 pb-10">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8 px-2">
        <div>
          <h1 className="text-3xl font-black text-white uppercase italic tracking-tighter">Gestão de Equipe</h1>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">
            {equipe.length} Membros Ativos
          </p>
        </div>
        
        {perfil?.cargo === 'diretor' && (
          <button 
            onClick={() => setIsModalOpen(true)} 
            className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-105 transition-all flex items-center gap-2 shadow-[0_10px_20px_rgba(37,99,235,0.2)]"
          >
            <UserPlus size={18} strokeWidth={3} /> Novo Membro
          </button>
        )}
      </div>

      {/* LISTA DE CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto pr-2 custom-scrollbar">
        {loading && equipe.length === 0 ? (
          <div className="col-span-full py-20 flex flex-col items-center gap-2 text-slate-500">
              <Loader2 className="animate-spin text-blue-500" size={32} />
              <p className="text-xs uppercase font-bold">Carregando equipe...</p>
          </div>
        ) : (
          equipe.map((membro) => (
            <div key={membro.id} className="bg-white/[0.02] border border-white/5 p-6 rounded-[32px] flex flex-col gap-4 group hover:border-white/10 transition-all relative overflow-hidden">
              
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl shadow-inner
                  ${membro.cargo === 'diretor' ? 'bg-red-500/10 text-red-500' : 
                    membro.cargo === 'gerente' ? 'bg-purple-500/10 text-purple-400' : 'bg-[#22C55E]/10 text-[#22C55E]'}
                `}>
                  {membro.nome?.charAt(0).toUpperCase()}
                </div>
                
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-black text-sm uppercase truncate tracking-tight">{membro.nome}</h3>
                  <div className="flex items-center gap-1.5 text-slate-500 mt-0.5">
                    <Mail size={12} />
                    <p className="text-[10px] font-medium truncate">{membro.email}</p>
                  </div>
                  {/* Mostra a Unidade no Card */}
                  <div className="flex items-center gap-1.5 text-slate-400 mt-1">
                    <MapPin size={10} />
                    <p className="text-[9px] font-bold uppercase truncate">
                        {membro.units?.nome || 'Sem Unidade'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between mt-2 pt-4 border-t border-white/5">
                <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-lg border flex items-center gap-1.5
                  ${membro.cargo === 'diretor' ? 'border-red-500/20 text-red-500 bg-red-500/5' : 
                    membro.cargo === 'gerente' ? 'border-purple-500/20 text-purple-400 bg-purple-500/5' : 
                    'border-[#22C55E]/20 text-[#22C55E] bg-[#22C55E]/5'}
                `}>
                  {membro.cargo === 'diretor' && <Shield size={10} />}
                  {membro.cargo === 'gerente' && <Briefcase size={10} />}
                  {membro.cargo}
                </span>

                {perfil?.cargo === 'diretor' && membro.id !== user?.id && (
                  <button onClick={() => handleDeleteUser(membro.id)} className="p-2 text-slate-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* MODAL DE CADASTRO */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-[#0B1120] border border-white/10 p-8 rounded-[40px] w-full max-w-md shadow-2xl relative">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-6 right-6 text-slate-500 hover:text-white transition-colors">
              <X size={20}/>
            </button>
            
            <div className="mb-6">
              <h2 className="text-2xl font-black uppercase italic text-white tracking-tighter">Novo Acesso</h2>
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">Credenciais da Equipe</p>
            </div>
            
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Nome Completo</label>
                <input className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-blue-500" placeholder="Ex: João Silva" value={formData.nome} onChange={e => setFormData({...formData, nome: e.target.value})} required />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2">E-mail Corporativo</label>
                <input className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-blue-500" type="email" placeholder="joao@empresa.com" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} required />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Senha Provisória</label>
                <input className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-blue-500" type="password" placeholder="••••••••" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} required />
              </div>

              <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Nível de Acesso</label>
                    <div className="relative">
                        <select className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-3 text-white text-xs font-black uppercase outline-none focus:border-blue-500 appearance-none" value={formData.cargo} onChange={e => setFormData({...formData, cargo: e.target.value})}>
                        <option value="vendedor" className="bg-[#0B1120]">Vendedor</option>
                        <option value="gerente" className="bg-[#0B1120]">Gerente</option>
                        <option value="diretor" className="bg-[#0B1120]">Diretor</option>
                        </select>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Unidade / Filial</label>
                    <div className="relative">
                        <select className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-3 text-white text-xs font-black uppercase outline-none focus:border-blue-500 appearance-none" value={formData.unidade_id} onChange={e => setFormData({...formData, unidade_id: e.target.value})} required>
                            <option value="" className="bg-[#0B1120]">Selecione...</option>
                            {unidades.map(u => (
                                <option key={u.id} value={u.id} className="bg-[#0B1120]">{u.nome}</option>
                            ))}
                        </select>
                        <Building2 size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none"/>
                    </div>
                  </div>
              </div>

              <button type="submit" disabled={creating} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black uppercase text-xs tracking-[0.2em] hover:bg-blue-500 transition-all shadow-lg mt-4 flex justify-center items-center gap-2">
                {creating ? <Loader2 className="animate-spin" size={18} /> : <><UserCheck size={18} /> Confirmar Cadastro</>}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}