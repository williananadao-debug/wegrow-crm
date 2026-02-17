"use client";
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Users, Mail, MapPin, Shield, Edit2, Trash2, 
  Plus, Search, Loader2 
} from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Toast } from '@/components/Toast';

export default function TeamPage() {
  const { perfil } = useAuth(); // Pega quem está logado
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Estados para Modal e Toast
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  
  // Verifica se é Diretor (para poder editar/excluir)
  const isDirector = perfil?.cargo === 'diretor' || perfil?.email === 'admin@wegrow.com';

  useEffect(() => {
    fetchTeam();
  }, []);

  async function fetchTeam() {
    setLoading(true);
    try {
      // --- CORREÇÃO: Busca na tabela 'profiles' em vez de 'perfis' ---
      const { data, error } = await supabase
        .from('profiles')
        .select(`
            *,
            units ( nome )
        `)
        .order('nome');

      if (error) throw error;
      setMembers(data || []);
    } catch (error) {
      console.error("Erro ao buscar equipe:", error);
    } finally {
      setLoading(false);
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja remover este membro?")) return;

    try {
      // Deleta da tabela profiles
      const { error } = await supabase.from('profiles').delete().eq('id', id);
      
      if (error) throw error;

      setMembers(prev => prev.filter(m => m.id !== id));
      setToastMessage("Membro removido com sucesso.");
      setShowToast(true);
    } catch (error: any) {
      alert("Erro ao excluir: " + error.message);
    }
  };

  const handlePromote = async (id: string, currentCargo: string) => {
      if(!isDirector) return;
      const novoCargo = currentCargo === 'vendedor' ? 'gerente' : 'vendedor';
      
      const { error } = await supabase
        .from('profiles')
        .update({ cargo: novoCargo })
        .eq('id', id);

      if(!error) {
          fetchTeam(); // Recarrega a lista
          setToastMessage(`Cargo alterado para ${novoCargo}`);
          setShowToast(true);
      }
  };

  // Filtro de busca
  const filteredMembers = members.filter(m => 
    m.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 pb-24 animate-in fade-in duration-500">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase italic text-white flex items-center gap-2">
            <Users className="text-[#22C55E]" /> Gestão de Equipe
          </h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">
            {members.length} Membros Ativos
          </p>
        </div>

        <div className="flex gap-2 w-full md:w-auto">
             <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16}/>
                <input 
                    type="text" 
                    placeholder="Buscar membro..." 
                    className="w-full bg-[#0B1120] border border-white/10 rounded-xl py-2 pl-10 pr-4 text-white text-sm outline-none focus:border-[#22C55E]"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
             </div>
             {/* Botão Novo Membro (Pode ser implementado depois o modal de convite) */}
             <button className="bg-[#22C55E] text-[#0F172A] px-4 py-2 rounded-xl font-black text-xs uppercase hover:scale-105 transition-all flex items-center gap-2">
                <Plus size={16}/> <span className="hidden md:inline">Novo</span>
             </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-[#22C55E]" size={40}/>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMembers.map((member) => (
            <div key={member.id} className="bg-white/[0.02] border border-white/5 p-5 rounded-3xl hover:border-white/10 transition-all group relative overflow-hidden">
                
                {/* Efeito de brilho no hover */}
                <div className="absolute top-0 right-0 p-20 bg-[#22C55E]/5 rounded-full blur-3xl -mr-10 -mt-10 opacity-0 group-hover:opacity-100 transition-opacity"></div>

                <div className="relative z-10 flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center text-lg font-black text-white border border-white/10">
                            {member.nome?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <div>
                            <h3 className="text-white font-bold leading-tight">{member.nome}</h3>
                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${
                                member.cargo === 'diretor' 
                                ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' 
                                : member.cargo === 'gerente'
                                ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                : 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/20'
                            }`}>
                                {member.cargo || 'Vendedor'}
                            </span>
                        </div>
                    </div>
                    
                    {isDirector && (
                        <div className="flex gap-1">
                            <button 
                                onClick={() => handlePromote(member.id, member.cargo)}
                                className="p-2 hover:bg-white/10 rounded-lg text-slate-500 hover:text-white transition-colors" 
                                title="Alterar Cargo"
                            >
                                <Edit2 size={16}/>
                            </button>
                            <button 
                                onClick={() => handleDelete(member.id)}
                                className="p-2 hover:bg-red-500/10 rounded-lg text-slate-500 hover:text-red-500 transition-colors"
                                title="Remover Membro"
                            >
                                <Trash2 size={16}/>
                            </button>
                        </div>
                    )}
                </div>

                <div className="space-y-2 relative z-10">
                    <div className="flex items-center gap-2 text-xs text-slate-400 bg-[#0B1120]/50 p-2 rounded-lg">
                        <Mail size={14} className="text-slate-500"/>
                        <span className="truncate">{member.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400 bg-[#0B1120]/50 p-2 rounded-lg">
                        <MapPin size={14} className="text-slate-500"/>
                        <span className="truncate">{member.units?.nome || 'Matriz / Sem Unidade'}</span>
                    </div>
                </div>

            </div>
          ))}

          {filteredMembers.length === 0 && (
             <div className="col-span-full text-center py-10 text-slate-500">
                Nenhum membro encontrado.
             </div>
          )}
        </div>
      )}

      <Toast 
        message={toastMessage} 
        isVisible={showToast} 
        onClose={() => setShowToast(false)} 
      />

    </div>
  );
}