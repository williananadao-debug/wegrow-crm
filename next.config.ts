import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  // cacheOnFrontEndNav + aggressiveFrontEndNavCaching desligados: cacheavam CSS/JS a cada
  // navegação client-side, o que combinado com deploys frequentes deixava abas antigas com
  // uma mistura de bundle antigo (cache) + backend novo, causando tela quebrada/travada
  // depois de navegar (ex: login → dashboard). Voltando ao padrão da lib (false).
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development", // Fica invisível enquanto você programa
  workboxOptions: {
    disableDevLogs: true,
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
};

export default withPWA(nextConfig);