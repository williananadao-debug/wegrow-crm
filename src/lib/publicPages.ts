const PUBLIC_EXACT = ['/', '/login', '/portal', '/reset-password'];
const PUBLIC_PREFIXES = ['/solicitar', '/portal-cdl', '/proposta-cdl', '/carteirinha', '/p/'];

export function isPublicPage(pathname: string): boolean {
  return PUBLIC_EXACT.includes(pathname) || PUBLIC_PREFIXES.some(p => pathname.startsWith(p));
}

// Rotas AUTENTICADAS (gated por login + modulos.<x>) que ainda assim não usam o
// shell padrão (Navbar/Topbar navy+verde) — diferente de PUBLIC_*, que significa
// "sem autenticação". Hoje só o Argus (visual próprio dourado/claro, sub-marca
// dentro do WeGrow) — mas só na vertical "licitação" (ex: Foscarini), que pediu
// identidade visual própria. A vertical "veículos" (ex: GB Motors) usa o shell
// padrão do WeGrow, sem visual bespoke. Mantido separado de propósito pra não
// confundir os dois conceitos ("pular o menu" vs "pular login").
const SHELL_EXCLUDED_PREFIXES = ['/argus'];

export function hasCustomShell(pathname: string, argusVertical?: string): boolean {
  const dentroDoArgus = SHELL_EXCLUDED_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'));
  if (!dentroDoArgus) return false;
  return (argusVertical || 'licitacao') !== 'veiculos';
}
