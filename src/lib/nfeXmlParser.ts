// Parser de XML de NF-e — schema fixo (padrão nacional SEFAZ), por isso regex resolve sem
// precisar de lib de XML. Usado em dois lugares: captura automática via Focus NFe
// (src/lib/focusNfe.ts reexporta extrairItensXmlNfe daqui) e upload manual de XML pelo
// usuário em /pulse/fiscal (LancarNotaFiscalModal) — mesmo parser, duas origens de arquivo.

export type ItemXmlNfe = { descricao: string; ncm: string | null; quantidade: number; valor_unitario: number };

const campoUnico = (bloco: string, tag: string) => bloco.match(new RegExp(`<${tag}>([^<]*)<\\/${tag}>`))?.[1] ?? null;

// Cada <det> tem um <prod> com os campos que interessam: xProd (descrição), NCM,
// qCom (quantidade), vUnCom (valor unitário).
export function extrairItensXmlNfe(xml: string): ItemXmlNfe[] {
  const itens: ItemXmlNfe[] = [];
  const detsMatch = xml.match(/<det\b[^>]*>[\s\S]*?<\/det>/g) || [];
  for (const det of detsMatch) {
    const prodMatch = det.match(/<prod>([\s\S]*?)<\/prod>/);
    if (!prodMatch) continue;
    const prod = prodMatch[1];
    const descricao = campoUnico(prod, 'xProd');
    if (!descricao) continue;
    const quantidade = Number(campoUnico(prod, 'qCom')) || 0;
    const valorUnitario = Number(campoUnico(prod, 'vUnCom')) || 0;
    if (quantidade <= 0) continue;
    itens.push({ descricao, ncm: campoUnico(prod, 'NCM'), quantidade, valor_unitario: valorUnitario });
  }
  return itens;
}

export type CabecalhoXmlNfe = {
  chaveAcesso: string | null;
  numero: string | null;
  serie: string | null;
  dataEmissao: string | null; // YYYY-MM-DD
  nomeEmitente: string | null;
  cnpjEmitente: string | null;
  nomeDestinatario: string | null;
  cnpjDestinatario: string | null;
  valorTotal: number | null;
};

// Chave de acesso não vem num campo próprio no XML da própria nota (só em eventos de
// consulta) — mora no atributo Id="NFe<44 dígitos>" da tag <infNFe>. dhEmi vem em
// ISO com timezone (2026-06-11T09:27:16-03:00); corta só a data.
export function extrairCabecalhoXmlNfe(xml: string): CabecalhoXmlNfe {
  const chaveMatch = xml.match(/Id="NFe(\d{44})"/);
  const ideMatch = xml.match(/<ide>([\s\S]*?)<\/ide>/);
  const emitMatch = xml.match(/<emit>([\s\S]*?)<\/emit>/);
  const destMatch = xml.match(/<dest>([\s\S]*?)<\/dest>/);
  const totalMatch = xml.match(/<ICMSTot>([\s\S]*?)<\/ICMSTot>/);

  const ide = ideMatch?.[1] ?? '';
  const emit = emitMatch?.[1] ?? '';
  const dest = destMatch?.[1] ?? '';
  const total = totalMatch?.[1] ?? '';

  const dhEmi = campoUnico(ide, 'dhEmi') || campoUnico(ide, 'dEmi');
  const valorTotalTexto = campoUnico(total, 'vNF');

  return {
    chaveAcesso: chaveMatch?.[1] ?? null,
    numero: campoUnico(ide, 'nNF'),
    serie: campoUnico(ide, 'serie'),
    dataEmissao: dhEmi ? dhEmi.slice(0, 10) : null,
    nomeEmitente: campoUnico(emit, 'xNome'),
    cnpjEmitente: campoUnico(emit, 'CNPJ'),
    nomeDestinatario: campoUnico(dest, 'xNome'),
    cnpjDestinatario: campoUnico(dest, 'CNPJ'),
    valorTotal: valorTotalTexto ? Number(valorTotalTexto) : null,
  };
}
