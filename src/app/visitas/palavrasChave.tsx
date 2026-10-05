import type { ReactNode } from 'react';

// Busca por palavra-chave ignora acento e caixa ("negociação" acha "negociacao").
export function normalizarTexto(t: string) {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function parsePalavrasChave(entrada: string) {
  return Array.from(new Set(entrada.split(/[,;\n]/).map(p => p.trim()).filter(p => p.length >= 2)));
}

export function textoBuscavel(v: { observacao?: string; empresa: string; cidade?: string }) {
  return normalizarTexto(`${v.observacao || ''} ${v.empresa} ${v.cidade || ''}`);
}

function escaparRegex(t: string) {
  return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Destaca as palavras-chave na observação. Casa no texto sem acento e recorta o original
// pelos mesmos índices — só vale quando tirar acento não muda o tamanho (texto em NFC
// normal, que é o caso de quase tudo digitado); senão mostra sem destaque.
export function destacar(texto: string, palavras: string[], classeMarca = 'bg-amber-400/25 text-amber-200 rounded px-0.5') {
  if (palavras.length === 0) return texto;
  const norm = normalizarTexto(texto);
  if (norm.length !== texto.length) return texto;
  const re = new RegExp(palavras.map(p => escaparRegex(normalizarTexto(p))).join('|'), 'g');
  const partes: ReactNode[] = [];
  let ultimo = 0;
  for (const m of norm.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > ultimo) partes.push(texto.slice(ultimo, i));
    partes.push(<mark key={i} className={classeMarca}>{texto.slice(i, i + m[0].length)}</mark>);
    ultimo = i + m[0].length;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return partes;
}
