const PUBLIC_EXACT = ['/', '/login', '/portal', '/reset-password'];
// /acompanhar = Portal do Cliente (login próprio por link no e-mail, não usa a sessão da equipe).
const PUBLIC_PREFIXES = ['/solicitar', '/portal-cdl', '/proposta-cdl', '/carteirinha', '/p/', '/acompanhar'];

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

// Cargos restritos: só enxergam algumas telas do Pulse. Aplicado em AuthContext
// (redireciona quem tentar entrar em outra rota direto pela URL) — o menu (navbar.tsx) só
// espelha isso visualmente.
// - almoxarifado: Estoque (e sub-rotas: movimentações, relatório, contagem, saída rápida) e
//   Notas Fiscais.
// - producao (chão de fábrica, ex.: Trailer Travel): Produção (inclui o painel de TV) e a
//   Saída Rápida do estoque (dar baixa de material) — sem a lista do estoque (preço/custo),
//   vendas, clientes, financeiro nem notas.
const ROTAS_CARGO_RESTRITO: Record<string, string[]> = {
  almoxarifado: ['/pulse/estoque', '/pulse/fiscal'],
  producao: ['/pulse/producao', '/pulse/estoque/saida-rapida'],
};

export function ehCargoRestrito(cargo: string | null | undefined): boolean {
  return !!cargo && cargo in ROTAS_CARGO_RESTRITO;
}

export function cargoPodeAcessar(cargo: string | null | undefined, pathname: string): boolean {
  if (!ehCargoRestrito(cargo)) return true;
  return ROTAS_CARGO_RESTRITO[cargo!].some(p => pathname === p || pathname.startsWith(p + '/'));
}

// Primeira tela do cargo restrito (pra onde vai quem cai numa rota proibida).
export function rotaInicialCargo(cargo: string): string {
  return ROTAS_CARGO_RESTRITO[cargo]?.[0] || '/dashboard';
}
