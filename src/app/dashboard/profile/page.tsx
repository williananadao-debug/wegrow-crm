"use client";
import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Lock, ShieldCheck, KeyRound, Loader2, Camera, Upload } from 'lucide-react';
import { Toast } from '@/components/Toast';

export default function ProfilePage() {
  const { user, perfil } = useAuth();
  
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [loadingSenha, setLoadingSenha] = useState(false);
  const [loadingFoto, setLoadingFoto] = useState(false);
  
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // 👇 FUNÇÃO NOVA: UPLOAD DA FOTO DE PERFIL 👇
  const handleUploadFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
      try {
          if (!e.target.files || e.target.files.length === 0) return;
          const file = e.target.files[0];
          
          setLoadingFoto(true);

          // Cria um nome único para a foto (ex: id-do-usuario-123456789.jpg)
          const fileExt = file.name.split('.').pop();
          const fileName = `${user.id}-${Date.now()}.${fileExt}`;

          // 1. Faz o upload para a pasta 'avatars' no Supabase Storage
          const { error: uploadError } = await supabase.storage
              .from('avatars')
              .upload(fileName, file);

          if (uploadError) throw uploadError;

          // 2. Pega o Link Público da foto
          const { data: { publicUrl } } = supabase.storage
              .from('avatars')
              .getPublicUrl(fileName);

          // 3. Salva o Link no Perfil do Vendedor
          const { error: updateError } = await supabase
              .from('profiles')
              .update({ avatar_url: publicUrl })
              .eq('id', user.id);

          if (updateError) throw updateError;

          setToastMessage("📸 Foto atualizada! Atualize a página (F5) para ver as mudanças.");
          setShowToast(true);
          
      } catch (error: any) {
          setToastMessage(`❌ Erro ao enviar foto: ${error.message}`);
          setShowToast(true);
      } finally {
          setLoadingFoto(false);
      }
  };

  const atualizarSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (novaSenha.length < 6) {
        setToastMessage("⚠️ A nova senha deve ter pelo menos 6 caracteres.");
        setShowToast(true);
        return;
    }

    if (novaSenha !== confirmarSenha) {
        setToastMessage("⚠️ As senhas não coincidem!");
        setShowToast(true);
        return;
    }

    setLoadingSenha(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: novaSenha
      });

      if (error) throw error;

      setToastMessage("✅ Senha atualizada com sucesso! 🔒");
      setShowToast(true);
      setNovaSenha('');
      setConfirmarSenha('');
      
    } catch (error: any) {
      setToastMessage(`❌ Erro ao atualizar: ${error.message}`);
      setShowToast(true);
    } finally {
      setLoadingSenha(false);
    }
  };

  return (
    <div className="p-4 md:p-8 bg-[#0B1120] min-h-screen text-white animate-in fade-in duration-700">
      
      <div className="mb-8">
        <h1 className="text-3xl font-black uppercase italic tracking-tighter flex items-center gap-3">
          <ShieldCheck className="text-[#22C55E]" size={32}/> Segurança & Perfil
        </h1>
        <p className="text-slate-500 text-xs font-bold uppercase tracking-[0.2em] mt-1">Gerencie suas credenciais de acesso</p>
      </div>

      <div className="max-w-2xl bg-[#0F172A] border border-white/10 rounded-[40px] p-8 shadow-2xl relative overflow-hidden">
        
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#22C55E]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

        <div className="flex flex-col md:flex-row md:items-center gap-6 mb-8 border-b border-white/5 pb-8 relative z-10">
            
            {/* 👇 ÁREA DA FOTO COM BOTÃO DE UPLOAD 👇 */}
            <div className="relative group w-24 h-24 rounded-2xl bg-gradient-to-br from-[#22C55E] to-emerald-800 flex items-center justify-center font-black text-3xl text-[#0F172A] overflow-hidden border-2 border-white/10 shadow-xl flex-shrink-0">
                {loadingFoto ? (
                    <Loader2 className="animate-spin text-white" size={24}/>
                ) : perfil?.avatar_url ? (
                    <img src={perfil.avatar_url} alt="Foto de Perfil" className="w-full h-full object-cover" />
                ) : (
                    <span className="uppercase">{perfil?.nome?.charAt(0) || 'U'}</span>
                )}
                
                {/* Sobreposição escura ao passar o mouse */}
                <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center cursor-pointer transition-opacity backdrop-blur-sm">
                    <Camera size={20} className="text-white mb-1"/>
                    <span className="text-[8px] font-black uppercase tracking-widest text-white">Alterar</span>
                    <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={handleUploadFoto}
                        disabled={loadingFoto}
                    />
                </label>
            </div>

            <div>
                <h2 className="text-2xl font-black text-white uppercase italic tracking-tight">{perfil?.nome || 'Usuário'}</h2>
                <p className="text-slate-400 text-sm font-medium">{user?.email}</p>
                <div className="mt-2 inline-block bg-[#22C55E]/10 border border-[#22C55E]/20 px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest text-[#22C55E]">
                    {perfil?.cargo || 'Membro da Equipe'}
                </div>
            </div>
        </div>

        <form onSubmit={atualizarSenha} className="space-y-6 relative z-10">
            <div>
                <h3 className="text-sm font-black uppercase text-slate-300 mb-4 flex items-center gap-2">
                    <KeyRound size={16} className="text-[#22C55E]"/> Alterar Senha de Acesso
                </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-2 block">Nova Senha</label>
                    <div className="relative">
                        <Lock className="absolute left-4 top-4 text-slate-500" size={16}/>
                        <input 
                            type="password" 
                            className="w-full bg-black/40 border border-white/10 rounded-2xl pl-11 pr-4 py-3.5 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-colors"
                            placeholder="Mínimo 6 caracteres"
                            value={novaSenha}
                            onChange={e => setNovaSenha(e.target.value)}
                            required
                        />
                    </div>
                </div>
                <div>
                    <label className="text-[10px] font-black uppercase text-slate-500 ml-2 mb-2 block">Confirmar Nova Senha</label>
                    <div className="relative">
                        <Lock className="absolute left-4 top-4 text-slate-500" size={16}/>
                        <input 
                            type="password" 
                            className="w-full bg-black/40 border border-white/10 rounded-2xl pl-11 pr-4 py-3.5 text-white text-sm font-bold outline-none focus:border-[#22C55E] transition-colors"
                            placeholder="Repita a senha"
                            value={confirmarSenha}
                            onChange={e => setConfirmarSenha(e.target.value)}
                            required
                        />
                    </div>
                </div>
            </div>

            <button 
                type="submit" 
                disabled={loadingSenha || !novaSenha || !confirmarSenha}
                className="w-full bg-[#22C55E] text-[#0F172A] py-4 rounded-2xl font-black uppercase text-xs tracking-[0.2em] hover:scale-[1.02] transition-all shadow-[0_0_20px_rgba(34,197,94,0.2)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-4"
            >
                {loadingSenha ? <Loader2 size={18} className="animate-spin"/> : <><ShieldCheck size={18}/> Salvar Nova Senha</>}
            </button>
        </form>
      </div>

      <Toast message={toastMessage} isVisible={showToast} onClose={() => setShowToast(false)} />
    </div>
  );
}