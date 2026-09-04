import * as Sentry from '@sentry/nextjs';

// Captura erro server-side (rotas de API, crons, RSC) e edge — sem isso, uma falha
// num cron às 3h da manhã só existia no log da Vercel, invisível até um cliente
// reclamar (foi exatamente assim que o bug do Kanban da Simoni foi descoberto).
export async function register() {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 0.1,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
    });
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 0.1,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
