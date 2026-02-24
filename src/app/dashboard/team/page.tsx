"use client";
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Edit2, X, User as UserIcon, ShieldAlert, Building2, Trash2, Plus, Loader2 } from 'lucide-react';
import { Toast } from '@/components/Toast';

export default function TeamPage() {
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  
  // Apenas Diretor/Admin tem acesso total
  const isDirector = perfil?.cargo === 'diretor' || perfil?.email === 'admin@wegrow.com';

  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Estados do Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  
  // Campos do Formulário
  const [editNome, setEditNome] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCargo, setEditCargo] = useState('vendedor');
  const [editUnidade, setEditUnidade] = useState('');

  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    carregarEquipe();
  }, []);

  const carregarEquipe = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('profiles').select('*').order('nome');
      setMembers(data || []);
    } catch (error) {
      console.error("Erro ao carregar equipe:", error);
    } finally {
      setLoading(false);
    }
  };

  const abrirModalNovo = () => {
    setEditingUser(null);
    setEditNome('');
    setEditEmail('');
    setEditCargo('vendedor');
    setEditUnidade('');
    setIsModalOpen(true);
  };

  const abrirModalEdit = (membro: any) => {
    setEditingUser(membro);
    setEditNome(membro.nome || '');
    setEditEmail(membro.email || '');
    setEditCargo(membro.cargo || 'vendedor');
    setEditUnidade(membro.unidade || '');
    setIsModalOpen(true);
  };

  const excluirUsuario = async () => {
    if (!editingUser) return;
    const confirmacao = window.confirm(`Tem certeza que deseja EXCLUIR o usuário ${editingUser.nome}? Esta ação não pode ser desfeita.`);
    
    if (confirmacao) {
        setSaving(true);
        try {
            // Nota: Isso exclui do seu banco de dados, não exclui a autenticação do supabase auth (mas bloqueia o acesso ao sistema)
            const { error } = await supabase.from('profiles').delete().eq('id', editingUser.id);
            if (error) throw error;

            setToastMessage("Usuário excluído com sucesso! 🗑️");
            setShowToast(true);
            setIsModalOpen(false);
            carregarEquipe();
        } catch (error: any) {
            alert(`Erro ao excluir: ${error.message}`);
        } finally {
            setSaving(false);
        }
    }
  };

  const salvarEdicao = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (editingUser) {
          // ATUALIZAR USUÁRIO EXISTENTE
          const payload = {
              nome: editNome,
              cargo: editCargo,
              unidade: editUnidade,
          };
          const { error } = await supabase.from('profiles').update(payload).eq('id', editingUser.id);
          if (error) throw error;
          
          setToastMessage("Perfil atualizado com sucesso! ✅");
          setShowToast(true);
          setIsModalOpen(false);
          carregarEquipe();
      } else {
          // CRIAR NOVO USUÁRIO COM ACESSO COMPLETO
          // Usamos signUp sem deslogar o admin via API
          const { data, error } = await supabase.auth.signUp({
            email: editEmail,
            password: 'WeGrow@123', // Senha padrão corporativa
            options: {
                data: {
                    full_name: editNome, // A trigger SQL vai criar o profile sozinha!
                }
            }
          });

          if (error) {
              if (error.message.includes('already registered')) {
                  alert("Esse E-mail já está cadastrado no sistema!");
                  return;
              }
              throw error;
          }

          // Atualiza as permissões do perfil que o robô SQL acabou de criar
          if (data.user) {
              await supabase.from('profiles').update({
                  cargo: editCargo,
                  unidade: editUnidade
              }).eq('id', data.user.id);
          }

          setToastMessage("Acesso Criado! (Senha: WeGrow@123) 🎉");
          setShowToast(true);
          setIsModalOpen(false);
          carregarEquipe();
      }

    } catch (error: any) {
      console.error("Erro ao salvar:", error);
      alert(`Erro no banco de dados: ${error.message}`);
    } finally {
        setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 text-white min-h-screen bg-[#0B1120]">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-white/5 pb-6">
          <div>
              <h1 className="text-2xl md:text-3xl font-black uppercase italic text-white flex items-center gap-2">
                 <ShieldAlert className="text-[#22C55E]" size={28} /> Gestão de Equipe
              </h1>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">
                 Controle de Acessos e Unidades
              </p>
          </div>
          {isDirector && (
              <div className="flex items-center gap-3">
                  <span className="hidden md:inline-block bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/20 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest">
                      👑 Admin
                  </span>
                  <button onClick={abrirModalNovo} className="bg-[#22C55E] text-[#0B1120] px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_20px_rgba(34,197,94,0.3)] flex items-center gap-2">
                      <Plus size={16}/> Adicionar Membro
                  </button>
              </div>
          )}
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-40">
           <p className="text-slate-500 font-bold animate-pulse">Carregando acessos...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {members.map((m) => (
              <div key={m.id} className="bg-[#0F172A] border border-white/5 hover:border-white/10 p-5 rounded-3xl relative group shadow-xl transition-all flex flex-col h-full">
                
                {isDirector && (
                    <button 
                       onClick={() => abrirModalEdit(m)}
                       className="absolute top-4 right-4 p-2 bg-white/5 text-slate-400 rounded-full hover:bg-blue-600 hover:text-white transition-all z-10"
                       title="Editar Configurações"
                    >
                        <Edit2 size={14} />
                    </button>
                )}

                <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center font-black text-lg border-2 border-[#0B1120] shadow-lg flex-shrink-0">
                        {m.nome ? m.nome.charAt(0).toUpperCase() : <UserIcon size={20}/>}
                    </div>
                    <div className="overflow-hidden pr-6">
                        <p className="font-black text-lg uppercase tracking-tight truncate">{m.nome || 'Sem Nome'}</p>
                        <p className="text-[10px] text-slate-500 font-mono truncate">{m.email}</p>
                    </div>
                </div>
                
                <div className="mt-auto pt-4 border-t border-white/5 flex gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-1 rounded tracking-widest ${m.cargo === 'diretor' ? 'bg-orange-500/20 text-orange-500 border border-orange-500/30' : 'bg-blue-600/20 text-blue-400 border border-blue-500/30'}`}>
                        {m.cargo || 'vendedor'}
                    </span>
                    {m.unidade && (
                        <span className="inline-flex items-center gap-1 bg-white/5 text-slate-300 border border-white/10 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest">
                            <Building2 size={10}/> {m.unidade}
                        </span>
                    )}
                </div>

              </div>
          ))}
        </div>
      )}

      {/* MODAL DE CRIAÇÃO/EDIÇÃO */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
           <div className="bg-[#0B1120] border border-white/10 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
              
              <div className="flex justify-between items-center p-5 border-b border-white/10 bg-[#0F172A] flex-shrink-0">
                  <h2 className="text-lg font-black uppercase italic text-white flex items-center gap-2">
                      <Edit2 size={16} className="text-[#22C55E]"/> {editingUser ? 'Editar Acesso' : 'Novo Membro'}
                  </h2>
                  <button onClick={() => setIsModalOpen(false)} className="p-2 bg-white/5 rounded-full text-slate-500 hover:text-white transition-colors"><X size={16}/></button>
              </div>

              <div className="p-6 overflow-y-auto custom-scrollbar">
                
                {!editingUser && (
                    <div className="mb-4 bg-blue-600/10 border border-blue-500/30 p-3 rounded-xl">
                        <p className="text-[10px] text-blue-400 font-bold uppercase tracking-wide leading-relaxed">
                            Ao criar um acesso, o sistema enviará a permissão para este e-mail. A senha padrão gerada será: <br/>
                            <span className="font-mono text-white bg-blue-600/30 px-1 py-0.5 rounded text-xs">WeGrow@123</span>
                        </p>
                    </div>
                )}

                <form id="userForm" onSubmit={salvarEdicao} className="space-y-4">
                    
                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Nome Completo</label>
                        <input required placeholder="Ex: João Silva" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-all" value={editNome} onChange={e => setEditNome(e.target.value)} />
                    </div>

                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">E-mail de Acesso</label>
                        <input required type="email" disabled={!!editingUser} placeholder="joao@radio.com" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-all disabled:opacity-50 disabled:cursor-not-allowed" value={editEmail} onChange={e => setEditEmail(e.target.value)} />
                        {editingUser && <p className="text-[9px] text-slate-500 mt-1 ml-1">O e-mail não pode ser alterado por aqui.</p>}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Cargo</label>
                            <select className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-all cursor-pointer" value={editCargo} onChange={e => setEditCargo(e.target.value)}>
                                <option value="vendedor" className="bg-[#0F172A]">Vendedor</option>
                                <option value="produtor" className="bg-[#0F172A]">Produtor</option>
                                <option value="diretor" className="bg-[#0F172A]">Diretor (Admin)</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Unidade/Filial</label>
                            <input placeholder="Ex: Matriz" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-all uppercase" value={editUnidade} onChange={e => setEditUnidade(e.target.value)} />
                        </div>
                    </div>

                </form>
              </div>

              <div className="p-5 border-t border-white/10 bg-[#0F172A] flex flex-col gap-3 flex-shrink-0">
                  <button type="submit" form="userForm" disabled={saving} className="w-full bg-[#22C55E] text-[#0B1120] py-3.5 rounded-xl font-black uppercase text-xs tracking-widest hover:scale-[1.02] transition-transform shadow-[0_0_15px_rgba(34,197,94,0.2)] flex items-center justify-center gap-2 disabled:opacity-50">
                      {saving ? <Loader2 size={16} className="animate-spin"/> : 'Salvar Configurações'}
                  </button>
                  
                  {/* BOTÃO DE EXCLUIR SÓ APARECE SE ESTIVER EDITANDO ALGUÉM */}
                  {editingUser && (
                      <button type="button" onClick={excluirUsuario} disabled={saving} className="w-full bg-red-500/10 text-red-500 border border-red-500/20 py-3 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                          <Trash2 size={16}/> Apagar Usuário
                      </button>
                  )}
              </div>

           </div>
        </div>
      )}

      <Toast message={toastMessage} isVisible={showToast} onClose={() => setShowToast(false)} />
    </div>
  );
}