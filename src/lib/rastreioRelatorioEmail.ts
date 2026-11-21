// Relatório por e-mail para o cliente final (semanal toda segunda / mensal todo dia 1), montado
// a partir do resumo diário. Sai pelo Resend com o nome do instalador no remetente.
import type { SupabaseClient } from '@supabase/supabase-js';
import { diaBR } from '@/lib/rastreioResumo';

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const fmtDia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const horas = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`);

type Linha = { veiculo_id: string; dia: string; km: number; minutos_movimento: number; viagens: number; velocidade_max: number; excessos: number };

export function periodoRelatorio(freq: 'semanal' | 'mensal') {
  const fim = diaBR(-1);
  if (freq === 'semanal') return { ini: diaBR(-7), fim, titulo: `Semana de ${fmtDia(diaBR(-7))} a ${fmtDia(fim)}` };
  const ini = `${fim.slice(0, 7)}-01`;
  const mes = new Date(`${ini}T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return { ini, fim, titulo: `Mês de ${mes}` };
}

export async function montarRelatorio(db: SupabaseClient, clienteId: string, freq: 'semanal' | 'mensal') {
  const { ini, fim, titulo } = periodoRelatorio(freq);
  const { data: vs } = await db.from('rastreio_veiculos').select('id, placa, descricao, limite_velocidade, odometro_km')
    .eq('cliente_id', clienteId).eq('status', 'ativo').order('placa');
  if (!vs?.length) return null;
  const { data: linhas } = await db.from('rastreio_resumo_diario')
    .select('veiculo_id, dia, km, minutos_movimento, viagens, velocidade_max, excessos')
    .in('veiculo_id', vs.map(v => v.id)).gte('dia', ini).lte('dia', fim).limit(5000);
  const { data: alarmes } = await db.from('rastreio_eventos').select('veiculo_id')
    .in('veiculo_id', vs.map(v => v.id)).eq('tipo', 'alarme')
    .gte('ocorrido_em', `${ini}T00:00:00-03:00`).lte('ocorrido_em', `${fim}T23:59:59-03:00`).limit(1000);

  const porVeic = vs.map(v => {
    const l = ((linhas || []) as Linha[]).filter(x => x.veiculo_id === v.id);
    return {
      placa: v.placa as string, descricao: (v.descricao as string | null) || '',
      km: l.reduce((s, x) => s + Number(x.km), 0), min: l.reduce((s, x) => s + x.minutos_movimento, 0),
      viagens: l.reduce((s, x) => s + x.viagens, 0), velMax: l.reduce((m, x) => Math.max(m, x.velocidade_max), 0),
      excessos: l.reduce((s, x) => s + x.excessos, 0), diasUso: l.filter(x => Number(x.km) >= 0.5).length,
      alarmes: (alarmes || []).filter(a => a.veiculo_id === v.id).length, odometro: Number(v.odometro_km || 0),
    };
  });
  return { titulo, ini, fim, veiculos: porVeic };
}

function html(empresa: { nome: string; cor: string }, nomeCliente: string, r: NonNullable<Awaited<ReturnType<typeof montarRelatorio>>>, appUrl: string) {
  const td = 'padding:10px 12px;border-bottom:1px solid #1e293b;font-size:13px;color:#e2e8f0';
  const linhas = r.veiculos.map(v => `
    <tr>
      <td style="${td}"><b>${esc(v.placa)}</b><br><span style="color:#94a3b8;font-size:12px">${esc(v.descricao)}</span></td>
      <td style="${td};text-align:right">${v.km.toFixed(1)} km</td>
      <td style="${td};text-align:right">${horas(v.min)}</td>
      <td style="${td};text-align:right">${v.viagens}</td>
      <td style="${td};text-align:right;${v.excessos ? 'color:#f87171' : ''}">${v.velMax} km/h${v.excessos ? `<br><span style="font-size:11px">${v.excessos} excesso(s)</span>` : ''}</td>
    </tr>`).join('');
  const totalKm = r.veiculos.reduce((s, v) => s + v.km, 0);
  const alarmes = r.veiculos.reduce((s, v) => s + v.alarmes, 0);
  return `<!DOCTYPE html><html lang="pt-br"><head><meta charset="UTF-8"></head>
<body style="margin:0;background:#0b1120;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0b1120;padding:32px 12px"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:100%;background:#0f172a;border:1px solid #1e293b;border-radius:16px;overflow:hidden">
  <tr><td style="background:${esc(empresa.cor)};padding:20px 28px;font-size:18px;font-weight:900;color:#0b1120">${esc(empresa.nome)} · Rastreamento</td></tr>
  <tr><td style="padding:24px 28px 8px">
    <p style="margin:0 0 4px;font-size:18px;font-weight:900;color:#fff">Olá, ${esc(nomeCliente.split(' ')[0])}!</p>
    <p style="margin:0 0 16px;font-size:14px;color:#94a3b8">Resumo dos seus veículos — ${esc(r.titulo)}.</p>
    <p style="margin:0 0 16px;font-size:14px;color:#e2e8f0">Total rodado: <b>${totalKm.toFixed(1)} km</b>${alarmes ? ` · <span style="color:#f87171"><b>${alarmes} alarme(s)</b> no período</span>` : ''}</p>
  </td></tr>
  <tr><td style="padding:0 16px 16px">
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      <tr style="color:#64748b;font-size:11px;text-transform:uppercase">
        <td style="padding:8px 12px">Veículo</td><td style="padding:8px 12px;text-align:right">Rodou</td><td style="padding:8px 12px;text-align:right">Em movimento</td><td style="padding:8px 12px;text-align:right">Viagens</td><td style="padding:8px 12px;text-align:right">Máxima</td>
      </tr>${linhas}
    </table>
  </td></tr>
  <tr><td style="padding:8px 28px 28px"><a href="${appUrl}/meu-rastreio" style="display:inline-block;background:${esc(empresa.cor)};color:#0b1120;text-decoration:none;font-weight:900;font-size:13px;padding:12px 20px;border-radius:10px">Abrir o app</a></td></tr>
</table>
<p style="color:#475569;font-size:11px;margin-top:12px">Para parar de receber, fale com ${esc(empresa.nome)}.</p>
</td></tr></table></body></html>`;
}

/** Envia o relatório de um cliente. Devolve o motivo quando não envia. */
export async function enviarRelatorioCliente(db: SupabaseClient, clienteId: string, freq: 'semanal' | 'mensal') {
  if (!process.env.RESEND_API_KEY) return 'RESEND_API_KEY não configurada';
  const { data: c } = await db.from('rastreio_clientes').select('nome, email, empresa_id, status').eq('id', clienteId).maybeSingle();
  if (!c?.email || c.status === 'cancelado') return 'cliente sem e-mail ou cancelado';
  const r = await montarRelatorio(db, clienteId, freq);
  if (!r) return 'cliente sem veículos';
  const { data: emp } = await db.from('empresas').select('nome, cor_primaria').eq('id', c.empresa_id).maybeSingle();
  const empresa = { nome: emp?.nome || 'Rastreamento', cor: emp?.cor_primaria || '#38BDF8' };
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const remetente = (process.env.RESEND_FROM_EMAIL || 'WeGrow <onboarding@resend.dev>').replace(/^[^<]*</, `${empresa.nome.replace(/[<>"]/g, '')} <`);
  const { error } = await resend.emails.send({
    from: remetente.includes('<') ? remetente : process.env.RESEND_FROM_EMAIL || 'WeGrow <onboarding@resend.dev>',
    to: [c.email], subject: `Relatório do rastreamento — ${r.titulo}`,
    html: html(empresa, c.nome, r, (process.env.NEXT_PUBLIC_APP_URL || 'https://www.wegrow.app.br').replace(/\/$/, '')),
  });
  return error ? `erro: ${error.message}` : null;
}

/** Cron diário: segunda = semanais; dia 1 = mensais. */
export async function rodarRelatoriosEmail(db: SupabaseClient) {
  const hoje = diaBR();
  const segunda = new Date(`${hoje}T12:00:00Z`).getUTCDay() === 1;
  const dia1 = hoje.endsWith('-01');
  const freqs = [...(segunda ? ['semanal'] : []), ...(dia1 ? ['mensal'] : [])] as ('semanal' | 'mensal')[];
  let enviados = 0;
  for (const f of freqs) {
    const { data: clientes } = await db.from('rastreio_clientes').select('id').eq('relatorio_email', f).neq('status', 'cancelado').not('email', 'is', null).limit(2000);
    for (const c of clientes || []) {
      const erro = await enviarRelatorioCliente(db, c.id, f).catch(e => (e as Error).message);
      if (!erro) enviados++; else console.error('[rastreio/relatorio-email]', c.id, erro);
    }
  }
  return { relatoriosEmail: enviados };
}
