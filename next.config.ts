import withPWAInit from "@ducanh2912/next-pwa";
import { withSentryConfig } from "@sentry/nextjs/config";

const withPWA = withPWAInit({
  dest: "public",
  // cacheOnFrontEndNav + aggressiveFrontEndNavCaching desligados: cacheavam CSS/JS a cada
  // navegação client-side, o que combinado com deploys frequentes deixava abas antigas com
  // uma mistura de bundle antigo (cache) + backend novo, causando tela quebrada/travada
  // depois de navegar (ex: login → dashboard). Voltando ao padrão da lib (false).
  reloadOnOnline: true,
  // Malha do mapa da eleição (1,4 MB) só baixa quem abre /eleicao — fora do precache do app.
  publicExcludes: ['!noprecache/**/*', '!eleicao/**/*'],
  disable: process.env.NODE_ENV === "development", // Fica invisível enquanto você programa
  // Dados nunca passam pelo cache do service worker: a regra padrão da lib ("NetworkFirst" com
  // 10 s de timeout) guardava as respostas do Supabase e da nossa /api e, com rede lenta, mostrava
  // dado velho como se fosse atual — além de dobrar cada requisição no navegador. As regras
  // abaixo vêm antes das padrão (que seguem valendo pra JS, CSS, imagens e páginas).
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [
      // Mesmo cacheName das regras padrão "apis" e "cross-origin" = substitui as duas.
      // Nossa /api: sempre da rede, nada guardado.
      { urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/api/"), handler: "NetworkOnly", method: "GET", options: { cacheName: "apis" } },
      // Outros domínios (CDN, fontes, mapas) seguem com cache; o Supabase fica de fora do
      // service worker — a requisição vai direto, sem cache e sem passar duas vezes.
      { urlPattern: ({ url, sameOrigin }) => !sameOrigin && !url.hostname.endsWith(".supabase.co"), handler: "NetworkFirst", options: { cacheName: "cross-origin", expiration: { maxEntries: 32, maxAgeSeconds: 3600 }, networkTimeoutSeconds: 10 } },
    ],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['groq-sdk', 'pdfkit', 'fontkit', 'linebreak', 'unicode-properties', 'restructure'],
  images: {
    remotePatterns: [
      { protocol: 'https' as const, hostname: 'dzlahpfdgjaqecikkqye.supabase.co' },
    ],
  },
  // docs/max/template-proposta.pptx é lido via fs.readFileSync em runtime (não é import),
  // o tracer automático do Next não enxerga esse acesso — sem isso o arquivo não vai pro
  // bundle da function e o fs.readFileSync quebra em produção (funciona local só por acaso,
  // porque o repo inteiro tá em disco).
  outputFileTracingIncludes: {
    '/api/max/proposta': ['./docs/max/template-proposta.pptx'],
  },
  // Endereço próprio do painel da apuração: qualquer domínio que comece com apuracao,
  // eleicao ou eleicoes (ex: apuracao-demaisfm.vercel.app, apontado pra este projeto) abre em /eleicao.
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/', has: [{ type: 'host' as const, value: '(?:apuracao|eleicao|eleicoes)[a-z0-9-]*\\..+' }], destination: '/eleicao' },
      ],
    };
  },
};

// Sem org/project/authToken de propósito — sem SENTRY_AUTH_TOKEN configurado, o upload
// de source maps é pulado (só um aviso no build, não quebra), o SDK continua capturando
// erro normalmente. Se um dia quiser stack trace com código-fonte real no Sentry em vez
// de minificado, gera um auth token em sentry.io → Settings → Auth Tokens e adiciona aqui.
export default withSentryConfig(withPWA(nextConfig), {
  silent: true,
});