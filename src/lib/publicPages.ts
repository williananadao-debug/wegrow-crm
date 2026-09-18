const PUBLIC_EXACT = ['/', '/login', '/portal', '/reset-password'];
const PUBLIC_PREFIXES = ['/solicitar', '/portal-cdl', '/proposta-cdl', '/carteirinha', '/p/'];

export function isPublicPage(pathname: string): boolean {
  return PUBLIC_EXACT.includes(pathname) || PUBLIC_PREFIXES.some(p => pathname.startsWith(p));
}

// Rotas AUTENTICADAS (gated por login + modulos.<x>) que ainda assim não usam o
// shell padrão (Navbar/Topbar navy+verde) — diferente de PUBLIC_*, que significa
// "sem autenticação". Argus (nav própria no topo, ArgusTopNav) e Advocacia (mesma
// ideia, AdvocaciaTopNav, paleta creme/dourado idêntica à do Argus) usam essa
// estrutura de aba no topo. /pulse/producao/painel é o wallboard de TV da fábrica —
// precisa da tela inteira, sem sidebar/topbar cortando espaço, pra ficar legível de
// longe num monitor fixo no chão de fábrica. Mantido separado de propósito pra não
// confundir os dois conceitos ("pular o menu" vs "pular login").
const SHELL_EXCLUDED_PREFIXES = ['/argus', '/advocacia', '/pulse/producao/painel'];

export function hasCustomShell(pathname: string): boolean {
  return SHELL_EXCLUDED_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'));
}

// Cargo "almoxarifado" só cuida de estoque/entrada-saída — só enxerga Estoque
// (e sub-rotas: movimentações, relatório, contagem, saída rápida) e Notas Fiscais.
// Aplicado em AuthContext (redireciona quem tentar entrar em qualquer outra rota
// direto pela URL) — o menu (navbar.tsx) só espelha isso visualmente.
const ALMOXARIFADO_ALLOWED_PREFIXES = ['/pulse/estoque', '/pulse/fiscal'];

export function almoxarifadoPodeAcessar(pathname: string): boolean {
  return ALMOXARIFADO_ALLOWED_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'));
}
