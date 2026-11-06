"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { paraEmailDeLogin } from '@/lib/loginSemEmail';
import { Lock, Mail, Loader2, ArrowRight } from 'lucide-react';
import LoginMarcaParceiro from '@/components/LoginMarcaParceiro';

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '').split(',').map(e => e.trim());

export default function LoginPage() {
  const router = useRouter();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Marca dupla do parceiro (ex.: "WeGrow for Manager"): vem de /entrar/<slug> (?marca=) ou da
  // última vez que a pessoa entrou por ela neste aparelho.
  const [marca, setMarca] = useState<{ produto: string; logo_url: string | null; parceiro: string } | null>(null);

  useEffect(() => {
    let slug = new URLSearchParams(window.location.search).get('marca');
    try {
      if (slug) localStorage.setItem('wg_marca_login', slug);
      else slug = localStorage.getItem('wg_marca_login');
    } catch { /* sem storage */ }
    if (!slug) return;
    let vivo = true;
    fetch(`/api/marca?slug=${encodeURIComponent(slug)}`)
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (vivo && j?.marca) setMarca(j.marca); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Autofill no mobile às vezes preenche o input sem disparar o onChange do React,
    // deixando o state desatualizado. Lê direto do form no submit para não depender disso.
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    // Acesso da fábrica não tem e-mail: login curto ("helton.travel") vira o e-mail interno.
    const emailValue = paraEmailDeLogin((formData.get('email') as string) || email);
    const passwordValue = (formData.get('password') as string) || password;

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: emailValue,
          password: passwordValue,
        });
        if (error) throw error;

        // Admin da plataforma pousa direto no God Mode — não faz sentido passar
        // pelo dashboard de tenant pra depois navegar manualmente até lá.
        if (ADMIN_EMAILS.includes(emailValue)) {
          router.push('/admin');
          return;
        }

        // Empresa com o módulo Argus ativo abre direto nele — ele tem shell/tema
        // próprios e não faz sentido pousar no /dashboard padrão pra depois
        // precisar navegar manualmente. Busca direto do banco (não do
        // AuthContext) porque logo após o login o contexto ainda não teve
        // tempo de carregar o perfil/empresa.
        const { data: perfil } = await supabase.from('profiles')
          .select('empresa:empresa_id(modulos)').eq('id', data.user!.id).single();
        const modulos = (perfil?.empresa as any)?.modulos || {};
        router.push(modulos.argus ? '/argus' : '/dashboard');
    } catch (err: any) {
      // Usuário desativado pelo diretor (ban no Supabase Auth): mensagem própria em vez de "senha errada".
      setError(/banned/i.test(err?.message || '') ? 'Seu acesso foi desativado. Fale com o diretor da sua empresa.' : 'E-mail ou senha incorretos.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Na tela da marca dupla o formulário é mais sóbrio: rótulos normais, sem ícones nem brilho
  const sobrio = !!marca;
  const rotulo = sobrio ? 'block text-[13px] font-medium text-[#A1A1AA] mb-2' : 'text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2';
  const campo = sobrio
    ? 'w-full h-12 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 text-[15px] text-white outline-none focus:border-white/30 focus:bg-white/[0.06] transition-colors placeholder:text-[#52525B]'
    : 'w-full bg-[#0F172A] border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white text-sm font-medium outline-none focus:border-[#22C55E] transition-all placeholder:text-slate-600';
  const formulario = (
        <form onSubmit={handleAuth} className={sobrio ? 'space-y-5' : 'space-y-4'}>
          <div className={sobrio ? '' : 'space-y-2'}>
            <label htmlFor="login-email" className={rotulo}>E-mail ou login</label>
            <div className="relative group">
              {!sobrio && <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-[#22C55E] transition-colors" size={18} />}
              <input
                id="login-email"
                type="text"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                name="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={campo}
                placeholder={sobrio ? 'nome@emissora.com.br' : 'nome@empresa.com ou login'}
                required
              />
            </div>
          </div>

          <div className={sobrio ? '' : 'space-y-2'}>
            <label htmlFor="login-senha" className={rotulo}>{sobrio ? 'Senha' : 'Senha de Acesso'}</label>
            <div className="relative group">
              {!sobrio && <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-[#22C55E] transition-colors" size={18} />}
              <input
                id="login-senha"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={campo}
                placeholder={sobrio ? '' : '••••••••'}
                required
                minLength={6}
              />
            </div>
          </div>

          {error && (
            <div className={sobrio ? 'text-[13px] text-[#F87171]' : 'bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold p-3 rounded-xl text-center'}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={sobrio
              ? 'w-full h-12 rounded-xl bg-[#22C55E] hover:bg-[#2BD468] active:bg-[#1DB954] text-[#04130A] text-[15px] font-semibold transition-colors flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed'
              : 'w-full bg-[#22C55E] hover:bg-[#1da850] text-[#0B1120] font-black uppercase text-xs tracking-widest py-4 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 mt-4 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(34,197,94,0.3)]'}
          >
            {loading ? <Loader2 className="animate-spin" size={18}/> : sobrio ? 'Entrar' : (
                <>Acessar Sistema <ArrowRight size={18} /></>
            )}
          </button>
        </form>
  );

  // Marca dupla do parceiro: tela de campanha (components/LoginMarcaParceiro)
  if (marca) return <LoginMarcaParceiro marca={marca}>{formulario}</LoginMarcaParceiro>;

  return (
    <div className="min-h-screen bg-[#0B1120] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white/[0.02] border border-white/5 p-8 rounded-[32px] shadow-2xl backdrop-blur-sm relative overflow-hidden">
        
        {/* EFEITO DE FUNDO */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#22C55E] to-transparent opacity-50"></div>

          <div className="text-center mb-8">
            <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter mb-2">WeGrow</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-[0.3em]">
               Acesso Restrito
            </p>
          </div>


        {formulario}

        <p className="text-center text-[10px] text-slate-600 font-bold uppercase mt-8">
            Apenas para colaboradores autorizados.
        </p>

      </div>
    </div>
  );
}