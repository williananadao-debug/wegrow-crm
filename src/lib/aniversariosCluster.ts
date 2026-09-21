// Alertas de aniversário de município respeitando o CLUSTER de atendimento de cada vendedor
// (Demais FM Comercial). Regra de quem recebe o alerta de uma cidade:
//   • diretor  → todas as cidades
//   • gerente/vendedor com cidades marcadas explicitamente (midia_cluster_vendedor_cidades)
//       → só essas cidades
//   • gerente/vendedor SEM marcação → as cidades da(s) praça(s) da própria unidade
//       (profiles.unidade, ex: "DEMAIS FM 104,7" → praça 104.7)
// Lógica pura, usada pelo cron (servidor) e pela tela de clusters (prévia) — assim o que a
// tela mostra é exatamente o que o cron vai disparar.

export type CidadeAniversario = { id: number; municipio: string; praca: string | null; dia: number; mes: number; ano_emancipacao?: number | null };
export type PerfilCluster = { id: string; nome?: string | null; cargo?: string | null; unidade?: string | null };
export type VinculoCluster = { vendedor_id: string; aniversario_id: number };

export const DIAS_ALERTA_PADRAO = [30, 15, 7, 0];

const PRACAS_CONHECIDAS = ['101.1', '104.7', '107.9'];

// "DEMAIS FM 104,7" / "104.7 / 101.1" → ['104.7', ...]
export function pracasDoTexto(texto: string | null | undefined): string[] {
  const t = String(texto || '').replace(/,/g, '.');
  return PRACAS_CONHECIDAS.filter(p => t.includes(p));
}

export function possuiClusterExplicito(perfilId: string, vinculos: VinculoCluster[]): boolean {
  return vinculos.some(v => v.vendedor_id === perfilId);
}

export function cidadesDoPerfil(perfil: PerfilCluster, cidades: CidadeAniversario[], vinculos: VinculoCluster[]): CidadeAniversario[] {
  if (perfil.cargo === 'diretor') return cidades;
  const meus = new Set(vinculos.filter(v => v.vendedor_id === perfil.id).map(v => v.aniversario_id));
  if (meus.size > 0) return cidades.filter(c => meus.has(c.id));
  const pracas = pracasDoTexto(perfil.unidade);
  if (pracas.length === 0) return [];
  return cidades.filter(c => pracasDoTexto(c.praca).some(p => pracas.includes(p)));
}

// Dias até a próxima ocorrência (0 = hoje), independente de horário.
export function diasAte(dia: number, mes: number, hoje = new Date()): number {
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  let alvo = new Date(hoje.getFullYear(), mes - 1, dia);
  if (alvo < base) alvo = new Date(hoje.getFullYear() + 1, mes - 1, dia);
  return Math.round((alvo.getTime() - base.getTime()) / 86400000);
}

// "Faixa" do alerta: o MENOR limite configurado que ainda cobre os dias restantes. Ex: limites
// [30,15,7,0] e faltam 28 dias → faixa 30; faltam 14 → 15; hoje → 0. Cada faixa dispara uma
// vez por ocorrência; se o cron pular um dia, a faixa seguinte ainda é pega (não depende de
// cair exatamente no dia do limite).
export function faixaDeAlerta(dias: number, limites: number[]): number | null {
  const ordenados = [...new Set(limites)].sort((a, b) => a - b);
  return ordenados.find(l => dias <= l) ?? null;
}

export function anoDaOcorrencia(dia: number, mes: number, hoje = new Date()): number {
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return new Date(hoje.getFullYear(), mes - 1, dia) < base ? hoje.getFullYear() + 1 : hoje.getFullYear();
}

export function idadeNaOcorrencia(ano_emancipacao: number | null | undefined, anoOcorrencia: number): number | null {
  return ano_emancipacao ? anoOcorrencia - ano_emancipacao : null;
}

export function textoPrazo(dias: number): string {
  return dias === 0 ? 'HOJE' : dias === 1 ? 'amanhã' : `em ${dias} dias`;
}
