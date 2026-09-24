// Gera um código curto e único o bastante sem precisar consultar o banco antes (evita corrida
// entre itens de um mesmo lote/salvamento). Prefixo pelas 3 primeiras letras do nome (ou "PRD"
// sem nome ainda) + sufixo aleatório em base36 — legível o bastante pra reconhecer de relance,
// único o bastante pra nunca colidir num catálogo de centenas de itens.
// Compartilhado entre Configurações → Produtos e as duas telas de "Lançar Nota Fiscal"
// (foto/OCR e XML) — produto novo criado a partir de uma NF tem que nascer com SKU igual a
// um criado manualmente, não só quem passa pela tela de Configurações.
export function gerarSkuAutomatico(nome: string): string {
  const prefixo = (nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'PRD';
  const sufixo = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefixo}-${sufixo}`;
}
