"use client";
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AlertTriangle, Lock, X, LogOut, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/contexts/AuthContext';

type Pendencia = { bloqueado: boolean; atraso: { total: number; desde: string; url: string | null; quantidade: number } | null; demoExpirada?: boolean };

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '').split(',').map(e => e.trim());
const CHAVE = 'wg_pendencia';
const VALIDADE_MS = 10 * 60 * 1000;
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Mensalidade WeGrow da empresa: aviso de atraso pro diretor/gerente e, quando a régua de
// cobrança suspende o acesso (lib/cobrancaWegrow), a tela de pendência pra toda a equipe.
// Consulta /api/conta/pendencia no máximo a cada 10 min por aba; a liberação após o
// pagamento é automática (webhook do Asaas).
export default function PendenciaCobranca() {
  const pathname = usePathname();
  const { user, perfil, signOut } = useAuth() || {};
  // Cache da aba (sessionStorage) lido uma vez na montagem; só vale se for do mesmo usuário
  const [registro, setRegistro] = useState<{ userId: string; em: number; dados: Pendencia } | null>(() => {
    try { return JSON.parse(sessionStorage.getItem(CHAVE) || 'null'); } catch { return null; }
  });
  const [fechado, setFechado] = useState(false);

  const isAdmin = !!user && ADMIN_EMAILS.includes(user.email || '');
  const ignorar = !user || isAdmin || pathname.startsWith('/admin') || pathname.startsWith('/parceiro');

  const valido = !!registro && !!user && registro.userId === user.id;

  useEffect(() => {
    if (ignorar) return;
    if (registro && registro.userId === user.id && Date.now() - registro.em < VALIDADE_MS) return;
    let vivo = true;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.access_token) return;
      const res = await fetch('/api/conta/pendencia', { headers: { Authorization: `Bearer ${session.access_token}` } }).catch(() => null);
      const dados: Pendencia | null = res?.ok ? await res.json().catch(() => null) : null;
      if (!vivo || !dados) return;
      const novo = { userId: user.id, em: Date.now(), dados };
      setRegistro(novo);
      try { sessionStorage.setItem(CHAVE, JSON.stringify(novo)); } catch { /* sem cache */ }
    });
    return () => { vivo = false; };
  }, [ignorar, user?.id, pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const pendencia = valido ? registro!.dados : null;
  if (ignorar || !pendencia) return null;
  const decide = perfil?.cargo === 'diretor' || perfil?.cargo === 'gerente';

  // Demo com validade vencida (data definida em /admin/demos)
  if (pendencia.demoExpirada) {
    return (
      <div className="fixed inset-0 z-[200] bg-[#0B1120]/95 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#0F172A] border border-white/10 rounded-3xl p-8 text-center">
          <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center"><Lock className="text-purple-300" size={24}/></div>
          <h2 className="text-xl font-semibold text-white">Demonstração encerrada</h2>
          <p className="text-sm text-slate-400 mt-2 leading-relaxed">O período deste acesso de demonstração terminou. Para continuar usando o WeGrow, fale com a equipe WeGrow.</p>
          <div className="mt-6 flex flex-col gap-2">
            <button onClick={signOut} className="inline-flex items-center justify-center gap-2 text-sm text-slate-300 hover:text-white py-2"><LogOut size={14}/> Sair</button>
          </div>
        </div>
      </div>
    );
  }

  if (pendencia.bloqueado) {
    return (
      <div className="fixed inset-0 z-[200] bg-[#0B1120]/95 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#0F172A] border border-white/10 rounded-3xl p-8 text-center">
          <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center"><Lock className="text-red-400" size={24}/></div>
          <h2 className="text-xl font-semibold text-white">Acesso suspenso</h2>
          <p className="text-sm text-slate-400 mt-2 leading-relaxed">
            {decide
              ? 'A mensalidade do WeGrow está em aberto e o acesso da equipe foi suspenso. Seus dados estão guardados: o acesso volta sozinho poucos minutos depois da confirmação do pagamento.'
              : 'O acesso da sua empresa ao WeGrow está temporariamente suspenso por uma pendência financeira. Fale com o responsável pela conta.'}
          </p>
          {decide && pendencia.atraso && (
            <div className="mt-5 bg-black/20 border border-white/5 rounded-2xl p-4">
              <p className="text-xs text-slate-500">Em aberto desde {pendencia.atraso.desde.split('-').reverse().join('/')}</p>
              <p className="text-2xl font-semibold text-white tabular-nums mt-1">{brl(pendencia.atraso.total)}</p>
            </div>
          )}
          <div className="mt-6 flex flex-col gap-2">
            {decide && pendencia.atraso?.url && (
              <a href={pendencia.atraso.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 bg-[#22C55E] text-[#0B1120] px-4 py-3 rounded-xl text-sm font-semibold">
                <ExternalLink size={15}/> Pagar agora
              </a>
            )}
            <button onClick={() => { try { sessionStorage.removeItem(CHAVE); } catch { /* nada */ } window.location.reload(); }} className="text-sm text-slate-300 hover:text-white py-2">Já paguei — verificar de novo</button>
            <button onClick={signOut} className="inline-flex items-center justify-center gap-2 text-xs text-slate-500 hover:text-slate-300 py-1"><LogOut size={12}/> Sair</button>
          </div>
        </div>
      </div>
    );
  }

  if (pendencia.atraso && decide && !fechado) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[150] w-[calc(100%-2rem)] max-w-xl bg-[#1a0f12] border border-red-500/30 rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3">
        <AlertTriangle size={18} className="text-red-400 shrink-0"/>
        <p className="text-sm text-slate-200 flex-1 min-w-0">
          Mensalidade do WeGrow em atraso desde {pendencia.atraso.desde.split('-').reverse().join('/')} ({brl(pendencia.atraso.total)}).
        </p>
        {pendencia.atraso.url && (
          <a href={pendencia.atraso.url} target="_blank" rel="noopener noreferrer" className="shrink-0 bg-[#22C55E] text-[#0B1120] px-3 py-1.5 rounded-lg text-xs font-semibold">Pagar</a>
        )}
        <button onClick={() => setFechado(true)} className="shrink-0 p-1 text-slate-500 hover:text-white" title="Fechar"><X size={14}/></button>
      </div>
    );
  }
  return null;
}
