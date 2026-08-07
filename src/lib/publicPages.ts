const PUBLIC_EXACT = ['/', '/login', '/portal', '/reset-password'];
const PUBLIC_PREFIXES = ['/solicitar', '/portal-cdl', '/proposta-cdl', '/carteirinha', '/p/'];

export function isPublicPage(pathname: string): boolean {
  return PUBLIC_EXACT.includes(pathname) || PUBLIC_PREFIXES.some(p => pathname.startsWith(p));
}
