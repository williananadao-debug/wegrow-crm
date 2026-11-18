"use client";
import { useEffect, useState } from 'react';
import { Loader2, Navigation } from 'lucide-react';

// Link do convite (WhatsApp): /meu-rastreio/entrar?t=<token> → vira sessão e abre o app.
export default function EntrarRastreioPage() {
  const [erro, setErro] = useState('');

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('t') || '';
    fetch('/api/rastreio/app/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t }) })
      .then(async r => {
        if (r.ok) { window.location.replace('/meu-rastreio'); return; }
        const j = await r.json().catch(() => ({}));
        setErro(j.error || 'Não foi possível entrar.');
      })
      .catch(() => setErro('Sem conexão. Tente de novo.'));
  }, []);

  return (
    <main className="min-h-[100dvh] bg-[#0B1120] text-white flex flex-col items-center justify-center p-6 text-center gap-4">
      <Navigation size={40} className="text-sky-400" />
      {erro ? (
        <>
          <h1 className="text-xl font-black">Não deu para entrar</h1>
          <p className="text-slate-300 text-sm max-w-xs">{erro}</p>
        </>
      ) : (
        <>
          <Loader2 size={28} className="animate-spin text-slate-400" />
          <p className="text-slate-300 text-sm">Abrindo seu rastreamento…</p>
        </>
      )}
    </main>
  );
}
