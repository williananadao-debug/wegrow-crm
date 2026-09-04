"use client";
import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

// Substitui o layout raiz inteiro quando um erro de renderização escapa de todo
// error.tsx local — por isso precisa das próprias tags <html>/<body>. Sem esse
// arquivo, erro de render no App Router nunca chegava no Sentry (só erro de rota/API).
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pt-br">
      <body style={{ margin: 0, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0B1120', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <p style={{ fontSize: 14, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#ef4444', marginBottom: 12 }}>Algo deu errado</p>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>O erro já foi registrado. Tenta recarregar a página.</p>
          <button
            onClick={() => reset()}
            style={{ background: '#22C55E', color: '#0B1120', border: 'none', padding: '12px 24px', borderRadius: 10, fontWeight: 900, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer' }}
          >
            Tentar de novo
          </button>
        </div>
      </body>
    </html>
  );
}
