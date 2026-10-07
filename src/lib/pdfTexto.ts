// Limpa texto livre (descrição colada do Word/WhatsApp, observações) antes de escrever no PDF.
//
// Os contratos usam as fontes padrão do PDFKit (Helvetica), que só desenham o conjunto
// WinAnsi (ASCII + acentos latinos + alguns símbolos como • – — “ ”). Marcador de lista do
// Word (U+F0B7, do símbolo "Symbol"), setas, ✔, emoji etc. ficam fora disso e o PDFKit
// embaralha o texto que vem DEPOIS deles ("•”`reios elétricos" no lugar de "• Freios
// elétricos" — contrato LD-3230 da Trailer Travel, 07/10/2026).

// Caracteres extras (fora de Latin-1) que existem na codificação WinAnsi.
const WINANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

// Marcadores/símbolos comuns em texto colado → equivalente que a fonte desenha.
const TROCAS: Record<string, string> = {
  '': '•', '': '•', '': '•', '': '•', '': '•', '': '•',
  '▪': '•', '▫': '•', '●': '•', '○': '•', '◦': '•', '■': '•', '□': '•',
  '‣': '•', '⁃': '•', '∙': '•', '‧': '•', '·': '•',
  '➢': '•', '➤': '•', '➔': '•', '→': '-', '⇒': '-', '►': '•', '▶': '•',
  '✓': '•', '✔': '•', '✅': '•', '☑': '•', '☒': '•', '✗': '•', '✘': '•',
  '‐': '-', '‑': '-', '‒': '-', '―': '—', '−': '-',
  '‘': '‘', '’': '’', '“': '“', '”': '”', '′': "'", '″': '"',
  ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ', '\t': ' ',
  '≤': '<=', '≥': '>=', '≈': '~',
};

export function textoParaPdf(t: string | null | undefined): string {
  if (!t) return '';
  let s = String(t).normalize('NFC').replace(/\r\n?/g, '\n');
  let out = '';
  for (const ch of s) {
    const troca = TROCAS[ch];
    if (troca !== undefined) { out += troca; continue; }
    const cp = ch.codePointAt(0)!;
    if (ch === '\n' || (cp >= 0x20 && cp <= 0x7E) || (cp >= 0xA0 && cp <= 0xFF) || WINANSI_EXTRA.has(ch)) { out += ch; continue; }
    // Resto (emoji, seletor de variação, caractere invisível, símbolo desconhecido): descarta —
    // mas se for o "marcador" no começo da linha (ex: "🔌 Energia solar"), vira "•".
    if (/\p{Extended_Pictographic}|\p{So}/u.test(ch) && /(^|\n)[ ]*$/.test(out)) out += '•';
  }
  s = out
    .replace(/[ ]+([;:,.!?])/g, '$1') // espaço órfão antes de pontuação (emoji removido no fim)
    .replace(/•\s*•/g, '•')          // "▪ •" virando "• •"
    .replace(/[ ]{2,}/g, ' ')        // espaços repetidos (de tabs)
    .replace(/^[ ]+/gm, '')          // recuo no começo da linha
    .replace(/•(?=\S)/g, '• ');      // "•Freios" → "• Freios"
  return s;
}
