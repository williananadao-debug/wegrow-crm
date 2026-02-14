"use client";
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { 
  UserPlus, Mail, Trash2, Loader2, X, ShieldAlert, 
  UserCheck, Shield, Briefcase 
} from 'lucide-react';

// --- INTERFACE PARA O TYPESCRIPT NÃO RECLAMAR ---
interface MembroEquipe {
  id: string;
  nome: string;
  email: string;
  cargo: 'diretor' | 'gerente' | 'vendedor';
  created_at?: string;
}

export default function TeamPage() {
  const { user, perfil } = useAuth();
  
  // Estados tipados corretamente
  const [loading, setLoading] = useState(true);
  const [equipe, setEquipe] = useState<MembroEquipe[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    nome: '',
    cargo: 'vendedor'
  });

  useEffect(() => {
    if (user && perfil) {
      fetchEquipe();
    }
  }, [user, perfil]);

  async function fetchEquipe() {
    setLoading(true);
    // Busca da tabela 'profiles' que criamos no SQL
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('nome', { ascending: true });
    
    if (data) setEquipe(data as MembroEquipe[]);
    setLoading(false);
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);

    // 1. Cria o usuário no Auth do Supabase
    // O Trigger do banco (handle_new_user) vai copiar automaticamente para a tabela 'profiles'
    const { data, error } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
      options: {
        data: {
          nome: formData.nome,
          cargo: formData.cargo
        }
      }
    });

    if (error) {
      alert("Erro ao criar usuário: " + error.message);
    } else {
      alert("Membro cadastrado com sucesso!");
      setIsModalOpen(false);
      setFormData({ email: '', password: '', nome: '', cargo: 'vendedor' });
      // Recarrega a lista para mostrar o novo membro
      fetchEquipe();
    }
    setCreating(false);
  }

  async function handleDeleteUser(id: string) {
    if (id === user?.id) return alert("Você não pode excluir a si mesmo!");
    if (!confirm("Tem certeza que deseja remover este membro da equipe?")) return;

    // Remove da tabela profiles (o acesso de login deve ser revogado no painel do Supabase Auth manualmente em casos reais, 
    // mas aqui removemos a visualização e permissões do sistema)
    const { error } = await supabase.from('profiles').delete().eq('id', id);
    
    if (!error) {
      setEquipe(prev => prev.filter(m => m.id !== id));
    } else {
      alert("Erro ao remover: " + error.message);
    }
  }

  // --- BLOQUEIO DE SEGURANÇA ---
  // Se não for Diretor ou Gerente, mostra tela de acesso negado
  if (perfil?.cargo !== 'diretor' && perfil?.cargo !== 'gerente') {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-4 animate-in fade-in">
        <div className="p-4 bg-red-500/10 rounded-full text-red-500">
            <ShieldAlert size={48} />
        </div>
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
        
        {/* Botão visível apenas para Diretor */}
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
                {/* Avatar com cor baseada no cargo */}
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
                </div>
              </div>

              <div className="flex items-center justify-between mt-2 pt-4 border-t border-white/5">
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-lg border flex items-center gap-1.5
                    ${membro.cargo === 'diretor' ? 'border-red-500/20 text-red-500 bg-red-500/5' : 
                      membro.cargo === 'gerente' ? 'border-purple-500/20 text-purple-400 bg-purple-500/5' : 
                      'border-[#22C55E]/20 text-[#22C55E] bg-[#22C55E]/5'}
                  `}>
                    {membro.cargo === 'diretor' && <Shield size={10} />}
                    {membro.cargo === 'gerente' && <Briefcase size={10} />}
                    {membro.cargo}
                  </span>
                </div>

                {/* Botão de Excluir (Só Diretor vê e não pode excluir a si mesmo) */}
                {perfil?.cargo === 'diretor' && membro.id !== user?.id && (
                  <button 
                    onClick={() => handleDeleteUser(membro.id)}
                    className="p-2 text-slate-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                    title="Remover acesso"
                  >
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
            
            <div className="mb-8">
              <h2 className="text-2xl font-black uppercase italic text-white tracking-tighter">Novo Acesso</h2>
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">Crie as credenciais da equipe</p>
            </div>
            
            <form onSubmit={handleCreateUser} className="space-y-5">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Nome Completo</label>
                <input 
                  className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-blue-500 transition-all" 
                  placeholder="Ex: João Silva"
                  value={formData.nome}
                  onChange={e => setFormData({...formData, nome: e.target.value})} 
                  required 
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2">E-mail Corporativo (Login)</label>
                <input 
                  className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-blue-500 transition-all" 
                  type="email"
                  placeholder="joao@empresa.com"
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})} 
                  required 
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Senha Provisória</label>
                <input 
                  className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-blue-500 transition-all" 
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={e => setFormData({...formData, password: e.target.value})} 
                  required 
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Nível de Acesso</label>
                <div className="relative">
                    <select 
                    className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm font-black uppercase outline-none focus:border-blue-500 appearance-none cursor-pointer"
                    value={formData.cargo}
                    onChange={e => setFormData({...formData, cargo: e.target.value})}
                    >
                    <option value="vendedor" className="bg-[#0B1120]">Vendedor (Acesso Padrão)</option>
                    <option value="gerente" className="bg-[#0B1120]">Gerente (Vê Equipe)</option>
                    <option value="diretor" className="bg-[#0B1120]">Diretor (Acesso Total)</option>
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">▼</div>
                </div>
              </div>

              <button 
                type="submit" 
                disabled={creating}
                className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black uppercase text-xs tracking-[0.2em] hover:bg-blue-500 transition-all shadow-lg mt-4 flex justify-center items-center gap-2"
              >
                {creating ? <Loader2 className="animate-spin" size={18} /> : (
                  <> <UserCheck size={18} /> Confirmar Cadastro </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}