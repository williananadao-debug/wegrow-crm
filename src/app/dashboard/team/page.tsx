"use client";
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Edit2, X, Target, TrendingUp, User as UserIcon, Medal } from 'lucide-react';
import { Toast } from '@/components/Toast';

export default function TeamPage() {
  const auth = useAuth() || {};
  const currentUser = auth.user;
  const perfil = auth.perfil;
  
  // Verifica se é o chefão
  const isDirector = perfil?.cargo === 'diretor' || perfil?.email === 'admin@wegrow.com';

  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Estados do Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [editNome, setEditNome] = useState('');
  const [editCargo, setEditCargo] = useState('');
  const [editMeta, setEditMeta] = useState<number>(0);

  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);

  // Pega o mês e ano atual para as metas
  const dataAtual = new Date();
  const mesAtual = dataAtual.getMonth() + 1;
  const anoAtual = dataAtual.getFullYear();

  useEffect(() => {
    carregarEquipe();
  }, []);

  const carregarEquipe = async () => {
    setLoading(true);
    try {
      // 1. Pega todo mundo
      const { data: profiles } = await supabase.from('profiles').select('*').order('nome');
      
      // 2. Pega as metas do mês atual de todo mundo
      const { data: metas } = await supabase
        .from('metas')
        .select('*')
        .eq('mes', mesAtual)
        .eq('ano', anoAtual);

      // 3. Pega as vendas GANHAS do mês atual para calcular a barrinha
      const primeiroDia = new Date(anoAtual, mesAtual - 1, 1).toISOString();
      const ultimoDia = new Date(anoAtual, mesAtual, 0, 23, 59, 59).toISOString();
      
      const { data: vendas } = await supabase
        .from('leads')
        .select('user_id, valor_total')
        .eq('status', 'ganho')
        .gte('created_at', primeiroDia)
        .lte('created_at', ultimoDia);

      // 4. Junta tudo num objeto só para cada membro
      const equipeCompleta = (profiles || []).map((p) => {
        const userMeta = metas?.find(m => m.user_id === p.id)?.valor_objetivo || 0;
        const userVendas = vendas?.filter(v => v.user_id === p.id) || [];
        const userRealizado = userVendas.reduce((acc, curr) => acc + (Number(curr.valor_total) || 0), 0);
        
        return {
          ...p,
          metaMes: userMeta,
          realizadoMes: userRealizado
        };
      });

      setMembers(equipeCompleta);
    } catch (error) {
      console.error("Erro ao carregar equipe:", error);
    } finally {
      setLoading(false);
    }
  };

  const abrirModalEdit = (membro: any) => {
    setEditingUser(membro);
    setEditNome(membro.nome);
    setEditCargo(membro.cargo || 'vendedor');
    setEditMeta(membro.metaMes || 0);
    setIsModalOpen(true);
  };

  const salvarEdicao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    try {
      // 1. Atualiza Nome e Cargo no Perfil
      await supabase.from('profiles').update({
        nome: editNome,
        cargo: editCargo
      }).eq('id', editingUser.id);

      // 2. Atualiza ou Cria a Meta do Mês para esse usuário
      // Primeiro checa se já existe uma meta pra ele neste mês
      const { data: metaExistente } = await supabase.from('metas')
        .select('id')
        .eq('user_id', editingUser.id)
        .eq('mes', mesAtual)
        .eq('ano', anoAtual)
        .single();

      if (metaExistente) {
        await supabase.from('metas').update({ valor_objetivo: editMeta }).eq('id', metaExistente.id);
      } else {
        await supabase.from('metas').insert([{
          user_id: editingUser.id,
          mes: mesAtual,
          ano: anoAtual,
          valor_objetivo: editMeta
        }]);
      }

      setToastMessage("Usuário e Meta atualizados com sucesso! 🚀");
      setShowToast(true);
      setIsModalOpen(false);
      carregarEquipe(); // Recarrega os dados para atualizar as barrinhas

    } catch (error) {
      console.error("Erro ao salvar usuário:", error);
      alert("Erro ao salvar. Verifique se a tabela 'metas' está correta.");
    }
  };

  return (
    <div className="p-4 md:p-6 text-white min-h-screen bg-[#0B1120]">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-white/5 pb-6">
          <div>
              <h1 className="text-2xl md:text-3xl font-black uppercase italic text-white flex items-center gap-2">
                 <Medal className="text-[#22C55E]" size={28} /> Gestão de Equipe
              </h1>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">
                 Metas e Desempenho (Mês Atual)
              </p>
          </div>
          {isDirector && (
              <span className="bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/20 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest">
                  👑 Visão de Diretor Ativada
              </span>
          )}
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-40">
           <p className="text-slate-500 font-bold animate-pulse">Carregando dados da equipe...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {members.map((m) => {
            const percent = m.metaMes > 0 ? Math.min((m.realizadoMes / m.metaMes) * 100, 100) : 0;
            const isBateuMeta = percent >= 100;

            return (
              <div key={m.id} className="bg-[#0F172A] border border-white/5 hover:border-white/10 p-5 rounded-3xl relative group shadow-xl transition-all">
                
                {/* Botão de Edição (Só Diretor Vê) */}
                {isDirector && (
                    <button 
                       onClick={() => abrirModalEdit(m)}
                       className="absolute top-4 right-4 p-2 bg-white/5 text-slate-400 rounded-full opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:bg-blue-600 hover:text-white transition-all"
                       title="Editar Usuário e Meta"
                    >
                        <Edit2 size={14} />
                    </button>
                )}

                <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center font-black text-lg border-2 border-[#0B1120] shadow-lg">
                        {m.nome ? m.nome.charAt(0).toUpperCase() : <UserIcon size={20}/>}
                    </div>
                    <div>
                        <p className="font-black text-lg uppercase tracking-tight">{m.nome}</p>
                        <p className="text-[10px] text-slate-500 font-mono">{m.email}</p>
                    </div>
                </div>
                
                <span className={`inline-block text-[9px] font-black uppercase px-2 py-1 rounded mb-4 tracking-widest ${m.cargo === 'diretor' ? 'bg-orange-500/20 text-orange-500' : 'bg-white/10 text-slate-300'}`}>
                    {m.cargo || 'Sem Cargo'}
                </span>

                {/* AREA DE METAS (Gamificação) */}
                <div className="bg-black/20 rounded-2xl p-4 border border-white/5 mt-auto">
                    <div className="flex justify-between text-[10px] font-black uppercase text-slate-400 mb-1">
                        <span className="flex items-center gap-1"><Target size={12}/> Meta</span>
                        <span>Realizado</span>
                    </div>
                    <div className="flex justify-between items-end mb-2">
                        <span className="text-sm font-black text-white">R$ {m.metaMes.toLocaleString('pt-BR')}</span>
                        <span className={`text-lg font-black italic ${isBateuMeta ? 'text-[#22C55E]' : 'text-blue-400'}`}>
                            R$ {m.realizadoMes.toLocaleString('pt-BR')}
                        </span>
                    </div>
                    
                    {/* BARRINHA DE PROGRESSO */}
                    <div className="w-full bg-white/5 rounded-full h-2.5 overflow-hidden border border-white/5 relative">
                        <div 
                            className={`h-full rounded-full transition-all duration-1000 ${isBateuMeta ? 'bg-[#22C55E] shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-gradient-to-r from-blue-600 to-purple-500'}`} 
                            style={{ width: `${percent}%` }}
                        ></div>
                    </div>
                    <div className="flex justify-between mt-1 text-[9px] font-bold text-slate-500">
                        <span>{percent.toFixed(1)}% atingido</span>
                        {isBateuMeta && <span className="text-[#22C55E]">META BATIDA! 🚀</span>}
                    </div>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* MODAL DE EDIÇÃO DE USUÁRIO E META */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
           <div className="bg-[#0B1120] border border-white/10 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
              
              <div className="flex justify-between items-center p-5 border-b border-white/10 bg-[#0F172A]">
                  <h2 className="text-lg font-black uppercase italic text-white flex items-center gap-2">
                      <Edit2 size={16} className="text-[#22C55E]"/> Configurar Perfil
                  </h2>
                  <button onClick={() => setIsModalOpen(false)} className="p-2 bg-white/5 rounded-full text-slate-500 hover:text-white transition-colors"><X size={16}/></button>
              </div>

              <div className="p-6">
                <form id="userForm" onSubmit={salvarEdicao} className="space-y-4">
                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Nome do Usuário</label>
                        <input required className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-all" value={editNome} onChange={e => setEditNome(e.target.value)} />
                    </div>

                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Cargo no Sistema</label>
                        <select className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-all cursor-pointer" value={editCargo} onChange={e => setEditCargo(e.target.value)}>
                            <option value="vendedor" className="bg-[#0F172A]">Vendedor</option>
                            <option value="produtor" className="bg-[#0F172A]">Produtor</option>
                            <option value="diretor" className="bg-[#0F172A]">Diretor (Acesso Total)</option>
                        </select>
                    </div>

                    <div className="pt-4 mt-2 border-t border-white/5">
                        <label className="text-[10px] font-black uppercase text-[#22C55E] ml-1 mb-1 flex items-center gap-1"><Target size={12}/> Meta Individual (Mês Atual)</label>
                        <p className="text-[10px] text-slate-500 mb-2 ml-1">Defina quanto este vendedor precisa vender em R$ neste mês.</p>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">R$</span>
                            <input type="number" required className="w-full bg-[#0F172A] border border-[#22C55E]/30 rounded-xl pl-10 pr-4 py-3 text-[#22C55E] text-lg font-black outline-none focus:border-[#22C55E] focus:shadow-[0_0_15px_rgba(34,197,94,0.2)] transition-all" value={editMeta || ''} onChange={e => setEditMeta(Number(e.target.value))} />
                        </div>
                    </div>
                </form>
              </div>

              <div className="p-5 border-t border-white/10 bg-[#0F172A]">
                  <button type="submit" form="userForm" className="w-full bg-[#22C55E] text-[#0B1120] py-4 rounded-xl font-black uppercase text-xs tracking-widest hover:scale-[1.02] transition-transform shadow-[0_0_20px_rgba(34,197,94,0.2)]">
                      Salvar Configurações
                  </button>
              </div>

           </div>
        </div>
      )}

      <Toast message={toastMessage} isVisible={showToast} onClose={() => setShowToast(false)} />
    </div>
  );
}