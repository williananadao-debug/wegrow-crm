// Casamento de item de nota (texto livre do fornecedor/nosso XML) com o catálogo de
// produtos da empresa. Usado tanto na leitura de nota por foto (NotaFiscalModal) quanto
// na leitura automática de XML do Focus NFe — mesma lógica, duas origens de item.

export type ProdutoCasavel = { id: number; nome: string };

const normalizar = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

export function acharServicoParecido(descricao: string, servicos: ProdutoCasavel[]): number | null {
  const alvo = normalizar(descricao);
  if (!alvo) return null;
  const exato = servicos.find(s => normalizar(s.nome) === alvo);
  if (exato) return exato.id;
  const parcial = servicos.find(s => normalizar(s.nome).includes(alvo) || alvo.includes(normalizar(s.nome)));
  return parcial ? parcial.id : null;
}
