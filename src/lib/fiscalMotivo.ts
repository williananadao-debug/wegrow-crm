// Motivo legível de uma NF recusada. A rota de emissão grava em fiscal_notas.observacao o
// corpo cru da resposta do Focus NFe (JSON: { codigo, mensagem, erros: [{ codigo, mensagem,
// campo }] }) e o webhook grava "Focus NFe recusou/rejeitou (status: x). <mensagem_sefaz>".
// Antes a tela mostrava só "erro_autorizacao", sem dizer o que corrigir.
export function motivoRecusaNf(observacao: string | null | undefined): string | null {
  if (!observacao) return null;
  const t = observacao.trim();
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      const j = JSON.parse(t);
      const erros: { mensagem?: string; campo?: string }[] = Array.isArray(j?.erros) ? j.erros : Array.isArray(j) ? j : [];
      const partes = erros.map(e => [e.mensagem, e.campo ? `(campo: ${e.campo})` : ''].filter(Boolean).join(' ')).filter(Boolean);
      const principal = j?.mensagem_sefaz || j?.mensagem || '';
      const texto = [principal, ...partes].filter(Boolean).join(' · ');
      if (texto) return texto;
    } catch { /* não era JSON de verdade */ }
  }
  return t;
}

export const STATUS_NF_FALHA = ['erro_autorizacao', 'rejeitada', 'denegada'];
