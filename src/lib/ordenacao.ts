// Ordem alfabética "de gente": ignora acento e maiúscula/minúscula (Ácido = acido) e trata
// número como número (Chapa 2 vem antes de Chapa 10). O order('nome') do banco não faz isso —
// depende da collation e coloca acentuados/maiúsculas fora do lugar.
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

export const compararNome = (a: { nome?: string | null }, b: { nome?: string | null }) =>
  collator.compare(a.nome || '', b.nome || '');

export const ordenarPorNome = <T extends { nome?: string | null }>(lista: T[]): T[] => [...lista].sort(compararNome);
