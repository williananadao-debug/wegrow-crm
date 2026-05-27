import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
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
};

export default withPWA(nextConfig);