export const CDL = {
  nome:         process.env.NEXT_PUBLIC_CDL_NOME          ?? 'CDL de Taio',
  sub:          process.env.NEXT_PUBLIC_CDL_SUB           ?? 'Câmara de Dirigentes Lojistas',
  nomeCompleto: process.env.NEXT_PUBLIC_CDL_NOME_COMPLETO ?? 'Câmara de Dirigentes Lojistas de Taio',
  regiao:       process.env.NEXT_PUBLIC_CDL_REGIAO        ?? 'Alto Vale do Itajaí',
  email:        process.env.NEXT_PUBLIC_CDL_EMAIL         ?? 'portal@wegrow.app.br',
  portalUrl:    process.env.NEXT_PUBLIC_APP_URL
                  ? `${process.env.NEXT_PUBLIC_APP_URL}/portal-cdl/associado`
                  : 'https://wegrow.app.br/portal-cdl/associado',
} as const;
