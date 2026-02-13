"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Lock, Mail, Loader2, ArrowRight, UserPlus, User } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true); // Controla se é Login ou Cadastro
  
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (isLogin) {
        // --- FLUXO DE LOGIN ---
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push('/dashboard');
      } else {
        // --- FLUXO DE CADASTRO ---
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: nome, // Envia o nome para o nosso Robô SQL usar
            },
          },
        });
        if (error) throw error;
        
        setSuccess("Conta criada com sucesso! Redirecionando...");
        // Pequeno delay para ler a mensagem antes de entrar
        setTimeout(() => {
            router.push('/dashboard');
        }, 1500);
      }
    } catch (err: any) {
      setError(isLogin ? 'E-mail ou senha incorretos.' : 'Erro ao criar conta. Tente outra senha.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white/[0.02] border border-white/5 p-8 rounded-[32px] shadow-2xl backdrop-blur-sm relative overflow-hidden">
        
        {/* EFEITO DE FUNDO */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#22C55E] to-transparent opacity-50"></div>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter mb-2">Wegrow CRM</h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-[0.3em]">
            {isLogin ? 'Acesso Restrito' : 'Novo Colaborador'}
          </p>
        </div>

        {/* ABAS DE NAVEGAÇÃO */}
        <div className="flex bg-[#0F172A] p-1 rounded-xl mb-6 border border-white/5">
            <button 
                onClick={() => { setIsLogin(true); setError(null); }}
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${isLogin ? 'bg-[#22C55E] text-[#0B1120]' : 'text-slate-500 hover:text-white'}`}
            >
                Entrar
            </button>
            <button 
                onClick={() => { setIsLogin(false); setError(null); }}
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${!isLogin ? 'bg-[#22C55E] text-[#0B1120]' : 'text-slate-500 hover:text-white'}`}
            >
                Criar Conta
            </button>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          
          {/* CAMPO NOME (SÓ APARECE NO CADASTRO) */}
          {!isLogin && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-4 duration-300">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Nome Completo</label>
                <div className="relative group">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-[#22C55E] transition-colors" size={18} />
                  <input 
                    type="text" 
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="w-full bg-[#0F172A] border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white text-sm font-medium outline-none focus:border-[#22C55E] transition-all placeholder:text-slate-600"
                    placeholder="Ex: João da Silva"
                    required={!isLogin}
                  />
                </div>
              </div>
          )}

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">E-mail Corporativo</label>
            <div className="relative group">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-[#22C55E] transition-colors" size={18} />
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#0F172A] border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white text-sm font-medium outline-none focus:border-[#22C55E] transition-all placeholder:text-slate-600"
                placeholder="nome@wegrow.com"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Senha de Acesso</label>
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-[#22C55E] transition-colors" size={18} />
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#0F172A] border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white text-sm font-medium outline-none focus:border-[#22C55E] transition-all placeholder:text-slate-600"
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold p-3 rounded-xl text-center">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-bold p-3 rounded-xl text-center">
              {success}
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-[#22C55E] hover:bg-[#1da850] text-[#0B1120] font-black uppercase text-xs tracking-widest py-4 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="animate-spin" size={18}/> : (
                isLogin ? <>Acessar Painel <ArrowRight size={18} /></> : <>Cadastrar <UserPlus size={18} /></>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}