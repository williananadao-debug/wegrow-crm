import * as Sentry from '@sentry/nextjs';

// Sem replay/sessão gravada de propósito — é monitoramento de erro, não analytics de
// comportamento, e replay tem custo de quota que não faz sentido gastar aqui.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
    // Operação cancelada pelo próprio navegador (saiu da página, trocou de aba, vídeo/requisição
    // interrompidos — comum no Safari do iPhone). Não é bug e não afeta o usuário: só ruído.
    // "reading 'waiting'": workbox-window (registro do service worker do PWA) quando o navegador
    // não devolve o registro — robô de pré-visualização de link (Chrome headless/Linux) abrindo o
    // link da apuração. A página funciona igual; só o cache offline não é instalado.
    // "sw.js load failed": Safari não conseguiu baixar o service worker (rede caiu/oscilou no
    // meio do registro). O arquivo existe em produção; o navegador tenta de novo na próxima visita.
    ignoreErrors: [/AbortError/, /The operation was aborted/, /The play\(\) request was interrupted/, /reading 'waiting'/, /sw\.js load failed/],
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
