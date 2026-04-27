"use client";
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Edit2, X, ShieldAlert, Plus, Loader2, Fingerprint, TrendingUp, KeyRound } from 'lucide-react';
import { Toast } from '@/components/Toast';
import { useUnidades } from '@/lib/useUnidades';

export default function TeamPage() {
  const auth = useAuth() || {};
  const perfil = auth.perfil;
  
  const isDirector = perfil?.cargo === 'diretor';
  const { unidades } = useUnidades(perfil?.empresa_id);

  const [members, setMembers] = useState<any[]>([]);
  const [perfStats, setPerfStats] = useState<Record<string, { leads: number; ganhos: number; faturamento: number }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  
  const [editNome, setEditNome] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCargo, setEditCargo] = useState('vendedor');
  const [editUnidade, setEditUnidade] = useState('');
  const [editCpf, setEditCpf] = useState(''); // 👇 NOVO ESTADO PARA O CPF

  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [resetandoSenha, setResetandoSenha] = useState(false);

  useEffect(() => {
    carregarEquipe();
  }, []);

  // Função para aplicar máscara de CPF (000.000.000-00)
  const aplicarMascaraCPF = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');
  };

  const carregarEquipe = async () => {
    setLoading(true);
    try {
      const agora = new Date();
      const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString();

      let query = supabase.from('profiles').select('id, nome, email, cargo, unidade, empresa_id, cpf').order('nome');
      if (perfil?.empresa_id) query = query.eq('empresa_id', perfil.empresa_id);

      let leadsQuery = supabase
        .from('leads')
        .select('user_id, status, valor_total')
        .gte('created_at', inicioMes);
      if (perfil?.empresa_id) leadsQuery = leadsQuery.eq('empresa_id', perfil.empresa_id);

      const [{ data: membersData }, { data: leadsData }] = await Promise.all([query, leadsQuery]);

      setMembers(membersData || []);

      const stats: Record<string, { leads: number; ganhos: number; faturamento: number }> = {};
      for (const lead of leadsData || []) {
        if (!lead.user_id) continue;
        if (!stats[lead.user_id]) stats[lead.user_id] = { leads: 0, ganhos: 0, faturamento: 0 };
        stats[lead.user_id].leads++;
        if (lead.status === 'ganho') {
          stats[lead.user_id].ganhos++;
          stats[lead.user_id].faturamento += lead.valor_total || 0;
        }
      }
      setPerfStats(stats);
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
    setEditCpf('');
    setIsModalOpen(true);
  };

  const abrirModalEdit = (membro: any) => {
    setEditingUser(membro);
    setEditNome(membro.nome || '');
    setEditEmail(membro.email || '');
    setEditCargo(membro.cargo || 'vendedor');
    setEditUnidade(membro.unidade || '');
    setEditCpf(membro.cpf || '');
    setIsModalOpen(true);
  };

  const salvarEdicao = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const payload = {
          nome: editNome,
          cargo: editCargo,
          unidade: editUnidade,
          cpf: editCpf,
      };

      if (editingUser) {
          const { error } = await supabase.from('profiles').update(payload).eq('id', editingUser.id);
          if (error) throw error;
          setToastMessage("Perfil atualizado! ✅");
          setShowToast(true);
      } else {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) throw new Error('Sessão expirada. Faça login novamente.');

          const res = await fetch('/api/team/invite', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ ...payload, email: editEmail }),
          });

          const json = await res.json();
          if (!res.ok) throw new Error(json.erro || 'Erro ao criar acesso.');

          setToastMessage(json.aviso ? `Acesso criado. ${json.aviso}` : "Acesso criado! Convite enviado por e-mail. 🎉");
          setShowToast(true);
      }
      setIsModalOpen(false);
      carregarEquipe();
    } catch (error: any) {
      alert(`Erro: ${error.message}`);
    } finally {
        setSaving(false);
    }
  };

  const resetarSenha = async () => {
    if (!editingUser?.email) return;
    setResetandoSenha(true);
    const { error } = await supabase.auth.resetPasswordForEmail(editingUser.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetandoSenha(false);
    if (error) {
      alert(`Erro: ${error.message}`);
    } else {
      setToastMessage(`E-mail de redefinição enviado para ${editingUser.email} ✅`);
      setShowToast(true);
    }
  };

  const excluirUsuario = async () => {
    if (!editingUser) return;
    if (confirm(`Excluir ${editingUser.nome}?`)) {
        setSaving(true);
        try {
            const { error } = await supabase.from('profiles').delete().eq('id', editingUser.id);
            if (error) throw error;
            setIsModalOpen(false);
            carregarEquipe();
        } catch (error: any) { alert(error.message); } 
        finally { setSaving(false); }
    }
  };

  return (
    <div className="p-4 md:p-6 text-white">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-white/5 pb-6">
          <div>
              <h1 className="text-2xl md:text-3xl font-black uppercase italic text-white flex items-center gap-2">
                 <ShieldAlert className="text-[#22C55E]" size={28} /> Gestão de Equipe
              </h1>
          </div>
          {isDirector && (
              <button onClick={abrirModalNovo} className="bg-[#22C55E] text-[#0B1120] px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_20px_rgba(34,197,94,0.3)] flex items-center gap-2">
                  <Plus size={16}/> Adicionar Membro
              </button>
          )}
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-40 animate-pulse text-slate-500 font-bold">Carregando...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {members.map((m) => {
            const s = perfStats[m.id];
            const taxa = s && s.leads > 0 ? Math.round((s.ganhos / s.leads) * 100) : 0;
            return (
              <div key={m.id} className="bg-[#0F172A] border border-white/5 p-5 rounded-3xl relative shadow-xl flex flex-col h-full">
                {isDirector && (
                    <button onClick={() => abrirModalEdit(m)} className="absolute top-4 right-4 p-2 bg-white/5 text-slate-400 rounded-full hover:bg-blue-600 hover:text-white transition-all z-10"><Edit2 size={14} /></button>
                )}
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center font-black text-lg border-2 border-[#0B1120]">{m.nome?.charAt(0).toUpperCase()}</div>
                    <div className="overflow-hidden">
                        <p className="font-black text-lg uppercase truncate">{m.nome || 'Sem Nome'}</p>
                        <p className="text-[9px] text-slate-500 font-mono truncate">{m.cpf || 'CPF NÃO CADASTRADO'}</p>
                    </div>
                </div>

                <div className="bg-[#0B1120] border border-white/5 rounded-2xl p-3 mb-4">
                  <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-1 mb-2"><TrendingUp size={9}/> Performance — mês atual</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-lg font-black text-white">{s?.leads ?? 0}</p>
                      <p className="text-[8px] text-slate-500 uppercase font-bold">Leads</p>
                    </div>
                    <div>
                      <p className="text-lg font-black text-[#22C55E]">{s?.ganhos ?? 0}</p>
                      <p className="text-[8px] text-slate-500 uppercase font-bold">Ganhos</p>
                    </div>
                    <div>
                      <p className="text-lg font-black text-orange-400">{taxa}%</p>
                      <p className="text-[8px] text-slate-500 uppercase font-bold">Conv.</p>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-white/5">
                    <p className="text-[10px] font-black text-white text-center">
                      R$ {(s?.faturamento ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                    </p>
                    <p className="text-[8px] text-slate-500 uppercase font-bold text-center">Faturamento</p>
                  </div>
                </div>

                <div className="mt-auto pt-4 border-t border-white/5 flex gap-2 flex-wrap">
                    <span className="bg-blue-600/20 text-blue-400 border border-blue-500/30 text-[9px] font-black uppercase px-2 py-1 rounded">{m.cargo}</span>
                    <span className="bg-white/5 text-slate-300 border border-white/10 px-2 py-1 rounded text-[9px] font-black uppercase">{m.unidade}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
           <div className="bg-[#0B1120] border border-white/10 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="flex justify-between items-center p-5 border-b border-white/10 bg-[#0F172A]">
                  <h2 className="text-lg font-black uppercase italic text-white flex items-center gap-2">
                      <Edit2 size={16} className="text-[#22C55E]"/> {editingUser ? 'Editar Acesso' : 'Novo Membro'}
                  </h2>
                  <button onClick={() => setIsModalOpen(false)} className="p-2 bg-white/5 rounded-full text-slate-500 hover:text-white"><X size={16}/></button>
              </div>

              <div className="p-6 overflow-y-auto">
                <form id="userForm" onSubmit={salvarEdicao} className="space-y-4">
                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Nome Completo</label>
                        <input required className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" value={editNome} onChange={e => setEditNome(e.target.value)} />
                    </div>

                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">CPF do Vendedor</label>
                        <div className="relative">
                            <Fingerprint size={16} className="absolute left-4 top-3.5 text-slate-500" />
                            <input 
                                required 
                                placeholder="000.000.000-00" 
                                className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-white text-sm font-bold outline-none focus:border-[#22C55E]" 
                                value={editCpf} 
                                onChange={e => setEditCpf(aplicarMascaraCPF(e.target.value))} 
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">E-mail de Acesso</label>
                        <input required type="email" disabled={!!editingUser} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-bold disabled:opacity-50" value={editEmail} onChange={e => setEditEmail(e.target.value)} />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Cargo</label>
                            <select className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm font-bold" value={editCargo} onChange={e => setEditCargo(e.target.value)}>
                                <option value="vendedor">Vendedor</option>
                                <option value="gerente">Gerente</option>
                                <option value="diretor">Diretor (Admin)</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase text-slate-500 ml-1 mb-1 block">Unidade/Filial</label>
                            <select className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm font-bold" value={editUnidade} onChange={e => setEditUnidade(e.target.value)}>
                                <option value="">SELECIONE...</option>
                                {unidades.map(u => (
                                  <option key={u.id} value={u.nome}>{u.nome}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </form>
              </div>

              <div className="p-5 border-t border-white/10 bg-[#0F172A] flex flex-col gap-3">
                  <button type="submit" form="userForm" disabled={saving} className="w-full bg-[#22C55E] text-[#0B1120] py-3.5 rounded-xl font-black uppercase text-xs tracking-widest hover:scale-[1.02] transition-transform flex items-center justify-center gap-2">
                      {saving ? <Loader2 size={16} className="animate-spin"/> : 'Salvar Configurações'}
                  </button>
                  {editingUser && (
                      <button
                        type="button"
                        onClick={resetarSenha}
                        disabled={resetandoSenha}
                        className="w-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 py-3 rounded-xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 hover:bg-yellow-500/20 transition-all disabled:opacity-50"
                      >
                        {resetandoSenha ? <Loader2 size={14} className="animate-spin"/> : <KeyRound size={14}/>}
                        {resetandoSenha ? 'Enviando...' : 'Resetar Senha'}
                      </button>
                  )}
                  {editingUser && (
                      <button type="button" onClick={excluirUsuario} className="w-full bg-red-500/10 text-red-500 border border-red-500/20 py-3 rounded-xl font-black uppercase text-xs">Apagar Usuário</button>
                  )}
              </div>
           </div>
        </div>
      )}
      <Toast message={toastMessage} isVisible={showToast} onClose={() => setShowToast(false)} />
    </div>
  );
}