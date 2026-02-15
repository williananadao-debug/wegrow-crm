"use client";
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { 
  UserPlus, Mail, Trash2, Loader2, X, ShieldAlert, 
  UserCheck, Shield, Briefcase, Building2, MapPin, Edit2, Plus 
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
  units?: Unidade;
}

export default function TeamPage() {
  const { user, perfil } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [equipe, setEquipe] = useState<MembroEquipe[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Controle de Nova Unidade
  const [isNewUnitMode, setIsNewUnitMode] = useState(false);
  const [newUnitName, setNewUnitName] = useState('');

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    nome: '',
    cargo: 'vendedor',
    unidade_id: ''
  });

  useEffect(() => {
    if (user && perfil) {
      fetchData();
    }
  }, [user, perfil]);

  async function fetchData() {
    setLoading(true);
    // Busca membros
    const { data: teamData } = await supabase.from('profiles').select('*, units(nome)').order('nome');
    if (teamData) setEquipe(teamData as any);

    // Busca unidades
    const { data: unitsData } = await supabase.from('units').select('id, nome').order('nome');
    if (unitsData) setUnidades(unitsData);
    
    setLoading(false);
  }

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormData({ email: '', password: '', nome: '', cargo: 'vendedor', unidade_id: '' });
    setIsNewUnitMode(false);
    setNewUnitName('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (membro: MembroEquipe) => {
    setEditingId(membro.id);
    setFormData({
        email: membro.email || '',
        password: '',
        nome: membro.nome || '',
        cargo: membro.cargo || 'vendedor',
        unidade_id: membro.unidade_id || ''
    });
    setIsNewUnitMode(false);
    setIsModalOpen(true);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setProcessing(true);

    let finalUnidadeId = formData.unidade_id;

    // 1. SE FOR MODO NOVA UNIDADE: CRIA PRIMEIRO
    if (isNewUnitMode) {
        if (!newUnitName.trim()) {
            alert("Digite o nome da nova unidade!");
            setProcessing(false);
            return;
        }
        
        // Cria a unidade no banco
        const { data: unitData, error: unitError } = await supabase
            .from('units')
            .insert([{ nome: newUnitName, cidade: 'Sede', estado: 'SP' }]) // Valores padrão para simplificar
            .select()
            .single();

        if (unitError || !unitData) {
            alert("Erro ao criar unidade: " + unitError?.message);
            setProcessing(false);
            return;
        }
        finalUnidadeId = unitData.id;
    } else {
        if (!finalUnidadeId) {
            alert("Selecione uma unidade ou crie uma nova!");
            setProcessing(false);
            return;
        }
    }

    // 2. CRIA OU EDITA O USUÁRIO COM O ID DA UNIDADE
    if (editingId) {
        // EDIÇÃO
        const { error } = await supabase.from('profiles').update({
            nome: formData.nome,
            cargo: formData.cargo,
            unidade_id: finalUnidadeId
        }).eq('id', editingId);

        if (!error) {
            alert("Atualizado com sucesso!");
            setIsModalOpen(false);
            fetchData();
        } else {
            alert("Erro ao atualizar: " + error.message);
        }
    } else {
        // CRIAÇÃO
        const { error } = await supabase.auth.signUp({
            email: formData.email,
            password: formData.password,
            options: {
                data: {
                    nome: formData.nome,
                    cargo: formData.cargo,
                    unidade_id: finalUnidadeId 
                }
            }
        });

        if (!error) {
            alert("Usuário criado com sucesso!");
            setIsModalOpen(false);
            setTimeout(() => fetchData(), 1500); // Tempo extra para o trigger
        } else {
            alert("Erro ao criar usuário: " + error.message);
        }
    }
    setProcessing(false);
  }

  async function handleDeleteUser(id: string) {
    if (id === user?.id) return alert("Você não pode excluir a si mesmo!");
    if (!confirm("Tem certeza que deseja remover este membro?")) return;
    const { error } = await supabase.from('profiles').delete().eq('id', id);
    if (!error) setEquipe(prev => prev.filter(m => m.id !== id));
  }

  if (perfil?.cargo !== 'diretor' && perfil?.cargo !== 'gerente') {
    return <div className="h-full flex items-center justify-center text-slate-500 uppercase font-bold text-xs">Acesso Restrito</div>;
  }

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500 pb-10">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8 px-2">
        <div>
          <h1 className="text-3xl font-black text-white uppercase italic tracking-tighter">Gestão de Equipe</h1>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{equipe.length} Membros Ativos</p>
        </div>
        
        {perfil?.cargo === 'diretor' && (
          <button onClick={handleOpenCreate} className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-105 transition-all flex items-center gap-2 shadow-lg">
            <UserPlus size={18} strokeWidth={3} /> Novo Membro
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto pr-2 custom-scrollbar">
        {loading && <Loader2 className="animate-spin text-blue-500 mx-auto" size={32} />}
        
        {equipe.map((membro) => (
            <div key={membro.id} className="bg-white/[0.02] border border-white/5 p-6 rounded-[32px] flex flex-col gap-4 hover:border-white/10 transition-all">
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl shadow-inner ${membro.cargo === 'diretor' ? 'bg-red-500/10 text-red-500' : membro.cargo === 'gerente' ? 'bg-purple-500/10 text-purple-400' : 'bg-[#22C55E]/10 text-[#22C55E]'}`}>
                  {membro.nome?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-black text-sm uppercase truncate">{membro.nome}</h3>
                  <div className="flex items-center gap-1.5 text-slate-500 mt-0.5">
                    <Mail size={12} /><p className="text-[10px] font-medium truncate">{membro.email}</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-400 mt-1">
                    <MapPin size={10} /><p className="text-[9px] font-bold uppercase truncate">{membro.units?.nome || 'Sem Unidade'}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between mt-2 pt-4 border-t border-white/5">
                <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-lg border flex items-center gap-1.5 ${membro.cargo === 'diretor' ? 'border-red-500/20 text-red-500' : membro.cargo === 'gerente' ? 'border-purple-500/20 text-purple-400' : 'border-[#22C55E]/20 text-[#22C55E]'}`}>
                  {membro.cargo === 'diretor' ? <Shield size={10} /> : membro.cargo === 'gerente' ? <Briefcase size={10} /> : <UserCheck size={10} />}
                  {membro.cargo}
                </span>

                {perfil?.cargo === 'diretor' && (
                  <div className="flex gap-2">
                      <button onClick={() => handleOpenEdit(membro)} className="p-2 text-slate-500 hover:text-white hover:bg-white/10 rounded-lg transition-all"><Edit2 size={16} /></button>
                      {membro.id !== user?.id && <button onClick={() => handleDeleteUser(membro.id)} className="p-2 text-slate-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"><Trash2 size={16} /></button>}
                  </div>
                )}
              </div>
            </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-[#0B1120] border border-white/10 p-8 rounded-[40px] w-full max-w-md shadow-2xl relative">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-6 right-6 text-slate-500 hover:text-white"><X size={20}/></button>
            
            <div className="mb-6">
              <h2 className="text-2xl font-black uppercase italic text-white tracking-tighter">{editingId ? 'Editar Acesso' : 'Novo Acesso'}</h2>
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">Gerencie as credenciais</p>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Nome Completo</label>
                <input className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-blue-500" value={formData.nome} onChange={e => setFormData({...formData, nome: e.target.value})} required />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-500 ml-2">E-mail (Login)</label>
                <input disabled={!!editingId} className={`w-full bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-blue-500 ${editingId ? 'opacity-50' : ''}`} type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} required />
              </div>

              {!editingId && (
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Senha Provisória</label>
                    <input className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-blue-500" type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} required />
                  </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-500 ml-2">Nível de Acesso</label>
                    <div className="relative">
                        <select className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-3 text-white text-xs font-black uppercase outline-none focus:border-blue-500 appearance-none" value={formData.cargo} onChange={e => setFormData({...formData, cargo: e.target.value as any})}>
                            <option value="vendedor" className="bg-[#0B1120]">Vendedor</option>
                            <option value="gerente" className="bg-[#0B1120]">Gerente</option>
                            <option value="diretor" className="bg-[#0B1120]">Diretor</option>
                        </select>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-500 ml-2 flex justify-between">
                        Unidade / Filial
                        <button type="button" onClick={() => setIsNewUnitMode(!isNewUnitMode)} className="text-blue-400 hover:text-white flex items-center gap-1">
                            {isNewUnitMode ? 'Selecionar' : '+ Nova'}
                        </button>
                    </label>
                    
                    {isNewUnitMode ? (
                        <input 
                            className="w-full bg-blue-500/10 border border-blue-500/30 rounded-2xl px-4 py-3 text-white text-xs font-bold outline-none focus:border-blue-500 placeholder:text-blue-300/50 animate-in fade-in"
                            placeholder="Nome da Nova Unidade..."
                            value={newUnitName}
                            onChange={e => setNewUnitName(e.target.value)}
                            autoFocus
                        />
                    ) : (
                        <div className="relative">
                            <select className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-3 text-white text-xs font-black uppercase outline-none focus:border-blue-500 appearance-none" value={formData.unidade_id} onChange={e => setFormData({...formData, unidade_id: e.target.value})}>
                                <option value="">Selecione...</option>
                                {unidades.map(u => <option key={u.id} value={u.id} className="bg-[#0B1120]">{u.nome}</option>)}
                            </select>
                            <Building2 size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none"/>
                        </div>
                    )}
                  </div>
              </div>

              <button type="submit" disabled={processing} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black uppercase text-xs tracking-[0.2em] hover:bg-blue-500 transition-all shadow-lg mt-4 flex justify-center items-center gap-2">
                {processing ? <Loader2 className="animate-spin" size={18} /> : <><UserCheck size={18} /> {isNewUnitMode ? 'Criar Unidade & Usuário' : editingId ? 'Salvar Alterações' : 'Confirmar Cadastro'}</>}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}