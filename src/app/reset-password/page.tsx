"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Lock, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [senha, setSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sessaoOk, setSessaoOk] = useState(false);
  const [verificando, setVerificando] = useState(true);

  useEffect(() => {
    // Supabase processa o token do hash automaticamente via onAuthStateChange
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setSessaoOk(true);
        setVerificando(false);
      }
    });

    // Verifica se já há sessão ativa (caso o evento já tenha disparado)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) { setSessaoOk(true); }
      setVerificando(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    if (senha.length < 6) { setErro('A senha deve ter pelo menos 6 caracteres.'); return; }
    if (senha !== confirmar) { setErro('As senhas não conferem.'); return; }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setLoading(false);

    if (error) {
      setErro(error.message);
    } else {
      setPronto(true);
      setTimeout(() => router.replace('/dashboard'), 2500);
    }
  };

  if (verificando) {
    return (
      <div className="min-h-screen bg-[#0B1120] flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-[#22C55E]"/>
      </div>
    );
  }

  if (!sessaoOk) {
    return (
      <div className="min-h-screen bg-[#0B1120] flex items-center justify-center p-4">
        <div className="bg-[#0F172A] border border-red-500/20 rounded-3xl p-8 max-w-md w-full text-center">
          <AlertCircle size={40} className="text-red-400 mx-auto mb-4"/>
          <h2 className="text-white font-black text-xl uppercase italic mb-2">Link inválido ou expirado</h2>
          <p className="text-slate-400 text-sm mb-6">Este link de redefinição não é mais válido. Peça ao administrador para enviar um novo.</p>
          <button onClick={() => router.replace('/login')} className="w-full bg-[#22C55E] text-[#0B1120] py-3 rounded-xl font-black uppercase text-xs tracking-widest">
            Voltar ao Login
          </button>
        </div>
      </div>
    );
  }

  if (pronto) {
    return (
      <div className="min-h-screen bg-[#0B1120] flex items-center justify-center p-4">
        <div className="bg-[#0F172A] border border-[#22C55E]/20 rounded-3xl p-8 max-w-md w-full text-center animate-in zoom-in-95 duration-300">
          <CheckCircle2 size={48} className="text-[#22C55E] mx-auto mb-4"/>
          <h2 className="text-white font-black text-xl uppercase italic mb-2">Senha definida!</h2>
          <p className="text-slate-400 text-sm">Redirecionando para o sistema...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#0F172A] border border-white/5 p-8 rounded-3xl shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#22C55E] to-transparent opacity-50"/>

        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-[#22C55E]/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Lock size={24} className="text-[#22C55E]"/>
          </div>
          <h1 className="text-2xl font-black text-white italic uppercase tracking-tighter mb-1">Criar nova senha</h1>
          <p className="text-slate-500 text-xs uppercase tracking-widest font-bold">WeGrow CRM</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-1 block">Nova senha</label>
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-[#22C55E] transition-colors" size={16}/>
              <input
                type={mostrarSenha ? 'text' : 'password'}
                value={senha}
                onChange={e => setSenha(e.target.value)}
                required
                minLength={6}
                placeholder="Mínimo 6 caracteres"
                className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 pl-12 pr-12 text-white text-sm font-medium outline-none focus:border-[#22C55E] transition-all placeholder:text-slate-600"
              />
              <button type="button" onClick={() => setMostrarSenha(v => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">
                {mostrarSenha ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-1 block">Confirmar senha</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16}/>
              <input
                type={mostrarSenha ? 'text' : 'password'}
                value={confirmar}
                onChange={e => setConfirmar(e.target.value)}
                required
                placeholder="Repita a senha"
                className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white text-sm font-medium outline-none focus:border-[#22C55E] transition-all placeholder:text-slate-600"
              />
            </div>
          </div>

          {erro && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold p-3 rounded-xl flex items-center gap-2">
              <AlertCircle size={14}/> {erro}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#22C55E] hover:bg-[#16A34A] text-[#0B1120] font-black uppercase text-xs tracking-widest py-4 rounded-2xl transition-all hover:scale-[1.02] flex items-center justify-center gap-2 mt-2 disabled:opacity-50 shadow-[0_0_20px_rgba(34,197,94,0.3)]"
          >
            {loading ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle2 size={16}/>}
            {loading ? 'Salvando...' : 'Definir Senha e Acessar'}
          </button>
        </form>
      </div>
    </div>
  );
}
