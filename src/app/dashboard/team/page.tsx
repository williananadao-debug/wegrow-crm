"use client";
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Users, Mail, Edit2, Trash2, Search, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Toast } from '@/components/Toast';

export default function TeamPage() {
  const { perfil } = useAuth();
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  
  // Verifica se é Diretor
  const isDirector = perfil?.cargo === 'diretor' || perfil?.email === 'admin@wegrow.com';

  useEffect(() => {
    fetchTeam();
  }, []);

  async function fetchTeam() {
    setLoading(true);
    try {
      // MODO SIMPLIFICADO: Busca apenas os perfis (sem join com units por enquanto)
      const { data, error } = await supabase
        .from('profiles')
        .select('*') 
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
    if (!confirm("Remover este membro?")) return;
    try {
      const { error } = await supabase.from('profiles').delete().eq('id', id);
      if (error) throw error;
      setMembers(prev => prev.filter(m => m.id !== id));
      setToastMessage("Membro removido.");
      setShowToast(true);
    } catch (error: any) {
      alert("Erro: " + error.message);
    }
  };

  const handlePromote = async (id: string, currentCargo: string) => {
      if(!isDirector) return;
      const novoCargo = currentCargo === 'vendedor' ? 'gerente' : 'vendedor';
      const { error } = await supabase.from('profiles').update({ cargo: novoCargo }).eq('id', id);
      if(!error) {
          fetchTeam();
          setToastMessage(`Cargo alterado para ${novoCargo}`);
          setShowToast(true);
      }
  };

  const filteredMembers = members.filter(m => 
    m.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 pb-24 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase italic text-white flex items-center gap-2">
            <Users className="text-[#22C55E]" /> Gestão de Equipe
          </h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">
            {members.length} Membros
          </p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
             <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16}/>
                <input 
                    type="text" 
                    placeholder="Buscar..." 
                    className="w-full bg-[#0B1120] border border-white/10 rounded-xl py-2 pl-10 pr-4 text-white text-sm outline-none focus:border-[#22C55E]"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
             </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#22C55E]" size={40}/></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMembers.map((member) => (
            <div key={member.id} className="bg-white/[0.02] border border-white/5 p-5 rounded-3xl relative group hover:border-white/10 transition-all">
                <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-lg font-black text-white border border-white/10">
                            {member.nome?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <div>
                            <h3 className="text-white font-bold">{member.nome}</h3>
                            <span className="text-[10px] font-black uppercase text-[#22C55E]">{member.cargo || 'Vendedor'}</span>
                        </div>
                    </div>
                    {isDirector && (
                        <div className="flex gap-1">
                            <button onClick={() => handlePromote(member.id, member.cargo)} className="p-2 hover:bg-white/10 rounded-lg text-slate-500 hover:text-white"><Edit2 size={16}/></button>
                            <button onClick={() => handleDelete(member.id)} className="p-2 hover:bg-red-500/10 rounded-lg text-slate-500 hover:text-red-500"><Trash2 size={16}/></button>
                        </div>
                    )}
                </div>
                <div className="space-y-2 text-xs text-slate-400">
                    <div className="flex items-center gap-2 bg-[#0B1120]/50 p-2 rounded-lg"><Mail size={14}/> {member.email}</div>
                </div>
            </div>
          ))}
        </div>
      )}
      <Toast message={toastMessage} isVisible={showToast} onClose={() => setShowToast(false)} />
    </div>
  );
}