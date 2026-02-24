"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Lock, Mail, Loader2, ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push('/dashboard');
    } catch (err: any) {
      setError('E-mail ou senha incorretos.');
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
             Acesso Restrito
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          
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

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-[#22C55E] hover:bg-[#1da850] text-[#0B1120] font-black uppercase text-xs tracking-widest py-4 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 mt-4 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(34,197,94,0.3)]"
          >
            {loading ? <Loader2 className="animate-spin" size={18}/> : (
                <>Acessar Sistema <ArrowRight size={18} /></> 
            )}
          </button>
        </form>

        <p className="text-center text-[10px] text-slate-600 font-bold uppercase mt-8">
            Apenas para colaboradores autorizados.
        </p>

      </div>
    </div>
  );
}