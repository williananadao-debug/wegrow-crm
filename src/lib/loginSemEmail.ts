// Acesso sem e-mail (funcionário de fábrica): o Supabase Auth exige e-mail, então o login curto
// vira um e-mail interno que nunca recebe mensagem. Ex.: "helton.travel" →
// "helton.travel@acesso.wegrow.app.br". Criado em Minha Equipe → "Criar acessos da fábrica".
export const DOMINIO_ACESSO_INTERNO = 'acesso.wegrow.app.br';

export function paraEmailDeLogin(entrada: string): string {
  const v = entrada.trim().toLowerCase();
  return v && !v.includes('@') ? `${v}@${DOMINIO_ACESSO_INTERNO}` : v;
}

export function loginCurto(email: string | null | undefined): string | null {
  const e = (email || '').toLowerCase();
  return e.endsWith('@' + DOMINIO_ACESSO_INTERNO) ? e.slice(0, -(DOMINIO_ACESSO_INTERNO.length + 1)) : null;
}

// "Fábio" → "fabio"; só letras/números.
export function slugLogin(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
