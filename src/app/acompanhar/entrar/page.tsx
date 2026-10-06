"use client";
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, LogIn, AlertCircle } from 'lucide-react';

// Página do link do e-mail. O login só acontece no clique (POST), não ao abrir o link —
// antivírus de e-mail abrem links sozinhos e gastariam o link de uso único.
function Entrar() {
  const token = useSearchParams().get('t') || '';
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState<string | null>(token ? null : 'Link incompleto. Peça um novo link de acesso.');

  const entrar = async () => {
    setEntrando(true); setErro(null);
    try {
      const res = await fetch('/api/portal-cliente/validar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.erro || 'Não foi possível entrar.');
      window.location.replace('/acompanhar');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível entrar.');
      setEntrando(false);
    }
  };

  return (
    <div className="min-h-dvh bg-slate-100 text-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 w-full max-w-sm text-center">
        <h1 className="text-lg font-black">Portal do Cliente</h1>
        <p className="text-sm text-slate-500 mt-1 mb-6">Acompanhe produção, pagamentos e contrato do seu pedido.</p>
        {erro ? (
          <>
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3 flex items-start gap-2 text-left mb-4">
              <AlertCircle size={16} className="shrink-0 mt-0.5" /> {erro}
            </div>
            <a href="/acompanhar" className="inline-block text-sm font-bold text-slate-700 underline">Pedir um novo link</a>
          </>
        ) : (
          <button onClick={entrar} disabled={entrando} className="w-full bg-slate-900 hover:bg-slate-700 disabled:opacity-60 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2">
            {entrando ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />} {entrando ? 'Entrando...' : 'Entrar no portal'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={null}><Entrar /></Suspense>;
}
