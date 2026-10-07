// Acha o NCM de cada item da venda no catálogo (servicos) pra emissão de NF.
//
// O item da venda guarda o NOME como texto (snapshot), que nem sempre é igual ao do catálogo:
// venda importada ("Diamond House" × catálogo "DIAMOND HOUSE 7.5") e venda com opcionais
// ("Travel Journey 350 (Ar-condicionado, TV)"). Antes a busca era por nome exato e a NF
// falhava com "sem NCM" mesmo com o NCM cadastrado (Trailer Travel, 07/10/2026).
// Nunca chuta: se nomes parecidos levam a NCMs diferentes, devolve o problema pra corrigir.

export type ServicoNcm = { id: number; nome: string; ncm: string | null };
export type ItemNcm = { servico: string; servicoId?: number | null };

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
// "Nome (opcional A, opcional B)" → "Nome"
const semOpcionais = (s: string) => s.replace(/\s*\([^)]*\)\s*$/, '').trim();

export function resolverNcmItens(itens: ItemNcm[], servicos: ServicoNcm[]): { ncms: string[]; problemas: string[] } {
  const ncms: string[] = [];
  const problemas: string[] = [];
  const catalogo = servicos.map(s => ({ ...s, n: norm(s.nome) }));

  itens.forEach((item, i) => {
    let candidatos: typeof catalogo = [];
    if (item.servicoId) candidatos = catalogo.filter(s => s.id === item.servicoId);

    const completo = norm(item.servico || '');
    const base = norm(semOpcionais(item.servico || ''));
    const niveis: ((s: (typeof catalogo)[number]) => boolean)[] = [
      s => s.n === completo,
      s => s.n === base,
      s => !!base && (s.n.startsWith(base) || base.startsWith(s.n)),
      s => !!base && base.length >= 4 && (s.n.includes(base) || base.includes(s.n)),
    ];
    for (const nivel of niveis) {
      if (candidatos.length) break;
      candidatos = catalogo.filter(s => s.n && nivel(s));
    }

    if (candidatos.length === 0) {
      problemas.push(`"${item.servico}" não foi encontrado no catálogo de produtos — confira o nome do produto em Estoque.`);
      ncms[i] = '';
      return;
    }
    const comNcm = candidatos.filter(s => (s.ncm || '').replace(/\D/g, '').length >= 8);
    const distintos = [...new Set(comNcm.map(s => (s.ncm as string).replace(/\D/g, '')))];
    if (distintos.length === 1) { ncms[i] = distintos[0]; return; }
    if (distintos.length === 0) {
      problemas.push(`O produto ${candidatos.map(s => `"${s.nome}"`).join(' / ')} está sem NCM (8 dígitos) no catálogo.`);
    } else {
      problemas.push(`"${item.servico}" pode ser ${comNcm.map(s => `"${s.nome}" (NCM ${s.ncm})`).join(' ou ')} — os NCMs são diferentes; ajuste o nome do item na venda pra ficar igual ao do catálogo.`);
    }
    ncms[i] = '';
  });

  return { ncms, problemas };
}
