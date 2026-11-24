// SMS para o chip do rastreador (configuração na instalação e plano B sem internet).
// Provedor: httpSMS (httpsms.com) — um celular Android com chip comum vira a "ponte": a
// plataforma manda pela API dele e as respostas do rastreador voltam pelo webhook.
//   HTTPSMS_API_KEY   chave da conta httpSMS
//   HTTPSMS_FROM      número do celular-ponte, com DDI (+5547...)
//   SMS_WEBHOOK_TOKEN segredo que vai na URL do webhook (?token=...)
// Atenção: chip M2M às vezes não recebe SMS de chip comum (só da plataforma da operadora).

export function smsConfigurado() {
  return Boolean(process.env.HTTPSMS_API_KEY && process.env.HTTPSMS_FROM);
}

/** "(47) 99999-0000" → "+5547999990000" */
export function numeroE164(n: string | null | undefined) {
  const d = String(n || '').replace(/\D/g, '');
  if (d.length < 10) return null;
  return `+${d.startsWith('55') && d.length >= 12 ? d : `55${d}`}`;
}

/** Texto de SMS aceito: comando de rastreador (letras, números e , . # : _ - espaço), até 160. */
export function textoSmsValido(t: string) {
  return /^[A-Za-z0-9,.#:_\-* ]{2,160}$/.test(t);
}

export async function enviarSms(para: string, texto: string) {
  if (!smsConfigurado()) throw new Error('Envio de SMS não configurado (celular-ponte httpSMS).');
  const to = numeroE164(para);
  if (!to) throw new Error('Número do chip inválido.');
  const r = await fetch('https://api.httpsms.com/v1/messages/send', {
    method: 'POST',
    headers: { 'x-api-key': process.env.HTTPSMS_API_KEY!, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ from: process.env.HTTPSMS_FROM, to, content: texto }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`httpSMS ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return true;
}
