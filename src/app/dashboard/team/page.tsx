"use client";
import { useState, useEffect } from 'react';
import { 
  ShieldCheck, User, Mail, Search, 
  Briefcase, Mic2, DollarSign, LayoutDashboard, CheckCircle2, Loader2, AlertCircle
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';

type Membro = {
  id: string;
  nome: string;
  email: string;
  cargo: 'diretor' | 'gerente' | 'vendedor' | 'locutor' | 'financeiro' | 'visitante';
  filial_id?: number;
  created_at: string;
};

// Configuração visual dos cargos
const CARGOS = {
  diretor: { label: 'Diretor', color: 'text-purple-400 border-purple-400/20 bg-purple-400/10', icon: <ShieldCheck size={12}/> },
  gerente: { label: 'Gerente', color: 'text-blue-400 border-blue-400/20 bg-blue-400/10', icon: <LayoutDashboard size={12}/> },
  vendedor: { label: 'Executivo (Vendas)', color: 'text-[#22C55E] border-[#22C55E]/20 bg-[#22C55E]/10', icon: <Briefcase size={12}/> },
  locutor: { label: 'Locutor / Produtor', color: 'text-orange-400 border-orange-400/20 bg-orange-400/10', icon: <Mic2 size={12}/> },
  financeiro: { label: 'Financeiro', color: 'text-yellow-400 border-yellow-400/20 bg-yellow-400/10', icon: <DollarSign size={12}/> },
  visitante: { label: 'Visitante (Sem Acesso)', color: 'text-slate-500 border-slate-500/20 bg-slate-500/10', icon: <User size={12}/> },
};

export default function TeamPage() {
  const { user } = useAuth();
  const [membros, setMembros] = useState<Membro[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    if (user) fetchTeam();
  }, [user]);

  const fetchTeam = async () => {
    setLoading(true);
    // Busca todos os perfis
    const { data } = await supabase.from('perfis').select('*').order('nome', { ascending: true });
    if (data) setMembros(data as any);
    setLoading(false);
  };

  const atualizarCargo = async (id: string, novoCargo: string) => {
    setUpdatingId(id);
    
    // Atualização Otimista (Muda na hora na tela)
    const backup = [...membros];
    setMembros(prev => prev.map(m => m.id === id ? { ...m, cargo: novoCargo as any } : m));

    // Salva no banco
    const { error } = await supabase.from('perfis').update({ cargo: novoCargo }).eq('id', id);
    
    if (error) {
        alert("Erro ao atualizar cargo: " + error.message);
        setMembros(backup); // Reverte se der erro
    }
    setUpdatingId(null);
  };

  const filteredMembros = membros.filter(m => 
    (m.nome?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
    (m.email?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-white uppercase italic">Minha Equipe</h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-[0.2em] mt-1">Gestão de Acessos e Funções</p>
        </div>
      </div>

      {/* SEARCH */}
      <div className="bg-[#0B1120] border border-white/10 p-2 rounded-2xl flex items-center gap-3 focus-within:border-[#22C55E]/50 transition-colors shadow-lg">
        <div className="p-3 bg-white/5 rounded-xl text-slate-400"><Search size={20} /></div>
        <input 
            type="text" 
            placeholder="Buscar colaborador por nome ou email..." 
            className="flex-1 bg-transparent text-white font-bold outline-none placeholder:text-slate-600 uppercase text-sm w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* GRID DE MEMBROS */}
      {loading ? (
          <div className="text-center py-20 flex flex-col items-center text-slate-500">
              <Loader2 className="animate-spin mb-2" size={32}/>
              <span className="text-xs font-bold uppercase">Carregando equipe...</span>
          </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredMembros.map((membro) => {
            // Garante fallback seguro
            const cargoKey = membro.cargo || 'visitante';
            const estiloCargo = CARGOS[cargoKey] || CARGOS['visitante'];
            
            return (
                <div key={membro.id} className="bg-[#0B1120] border border-white/5 p-6 rounded-[32px] group hover:border-white/10 transition-all relative flex flex-col h-full shadow-xl hover:shadow-2xl">
                    
                    <div className="flex items-start justify-between mb-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-lg font-black text-white uppercase flex-shrink-0">
                                {membro.nome ? membro.nome.charAt(0) : '?'}
                            </div>
                            <div className="overflow-hidden">
                                <h3 className="text-white font-bold text-sm uppercase truncate">{membro.nome || 'Sem Nome'}</h3>
                                <div className="flex items-center gap-1 text-[10px] text-slate-500 font-medium truncate">
                                    <Mail size={10} /> {membro.email}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* SELETOR DE CARGO */}
                    <div className="space-y-2 mt-auto">
                        <label className="text-[9px] font-black uppercase text-slate-500 ml-1">Definir Função</label>
                        <div className="relative">
                            <div className={`absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none ${updatingId === membro.id ? 'opacity-50' : ''}`}>
                                {estiloCargo.icon}
                            </div>
                            <select 
                                className={`w-full appearance-none rounded-xl py-3 pl-10 pr-8 text-[10px] font-black uppercase border outline-none cursor-pointer transition-all ${estiloCargo.color} bg-opacity-5 hover:bg-opacity-10 disabled:opacity-50`}
                                value={cargoKey}
                                onChange={(e) => atualizarCargo(membro.id, e.target.value)}
                                disabled={updatingId === membro.id}
                            >
                                {Object.entries(CARGOS).map(([key, config]) => (
                                    <option key={key} value={key} className="bg-[#0B1120] text-slate-300">
                                        {config.label}
                                    </option>
                                ))}
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                                {updatingId === membro.id ? <Loader2 size={12} className="animate-spin"/> : '▼'}
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-white/5 flex justify-between items-center">
                        <span className="text-[9px] text-slate-600 font-mono uppercase">
                            ID: {membro.id.substring(0, 8)}
                        </span>
                        <div className="flex items-center gap-1 text-[#22C55E] text-[9px] font-black uppercase opacity-0 group-hover:opacity-100 transition-opacity">
                            <CheckCircle2 size={10} /> Ativo
                        </div>
                    </div>

                </div>
            );
        })}
      </div>
      )}

      {filteredMembros.length === 0 && !loading && (
          <div className="text-center py-20 text-slate-500 flex flex-col items-center">
              <AlertCircle size={32} className="mb-2 opacity-50"/>
              <p className="text-sm font-bold uppercase">Nenhum membro encontrado.</p>
          </div>
      )}

      {/* DICA DE FLUXO */}
      <div className="bg-blue-900/10 border border-blue-500/20 p-6 rounded-[24px] flex items-start gap-4">
          <div className="p-3 bg-blue-500/20 text-blue-400 rounded-xl flex-shrink-0">
              <User size={20} />
          </div>
          <div>
              <h4 className="text-blue-400 font-black uppercase text-sm mb-1">Como adicionar alguém?</h4>
              <p className="text-slate-400 text-xs leading-relaxed">
                  Peça para seu funcionário criar uma conta (Sign Up) na tela de login. 
                  Ele aparecerá aqui automaticamente como <strong>Visitante</strong>. 
                  Basta você entrar nesta tela e mudar o cargo dele para <strong>Vendedor</strong> ou <strong>Locutor</strong> para liberar os acessos.
              </p>
          </div>
      </div>

    </div>
  );
}