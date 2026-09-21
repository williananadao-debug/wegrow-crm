import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { calcularAlertasReposicao, MovimentoConsumo, ProdutoParaReposicao } from '@/lib/estoqueInteligente';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function notificarReposicao(
  supabase: ReturnType<typeof db>, empresaId: string, alertas: ReturnType<typeof calcularAlertasReposicao>
) {
  if (!process.env.RESEND_API_KEY || alertas.length === 0) return;
  const { data: destinatarios } = await supabase.from('profiles').select('email').eq('empresa_id', empresaId).in('cargo', ['diretor', 'gerente']);
  const emails = (destinatarios || []).map((d: { email: string | null }) => d.email).filter(Boolean) as string[];
  if (emails.length === 0) return;

  const linhas = alertas.slice(0, 20).map(a => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #1e293b">
        <p style="margin:0;font-size:13px;font-weight:700;color:#fff">${a.nome}</p>
        <p style="margin:2px 0 0;font-size:10px;color:#64748b">${a.estoqueAtual} em estoque · consumindo ~${a.consumoDiario.toFixed(1)}/dia</p>
      </td>
      <td style="padding:10px 14px;border-bottom:1px solid #1e293b;text-align:right">
        <p style="margin:0;font-size:15px;font-weight:900;color:${a.diasRestantes <= a.limiarDias / 2 ? '#ef4444' : '#f59e0b'}">${Math.max(0, Math.floor(a.diasRestantes))}d</p>
      </td>
    </tr>`).join('');

  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'WeGrow <onboarding@resend.dev>',
    to: emails,
    subject: `📦 Reposição: ${alertas.length} produto(s) vão zerar em breve`,
    html: `
<!DOCTYPE html>
<html lang="pt-br"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0b1120;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b1120;padding:40px 20px"><tr><td align="center">
    <table width="480" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:16px;overflow:hidden;border:1px solid #1e293b;max-width:100%">
      <tr><td style="background:#a855f7;padding:20px 28px"><span style="font-size:18px;font-weight:900;font-style:italic;color:#fff">📦 REPOSIÇÃO DE ESTOQUE</span></td></tr>
      <tr><td style="padding:28px">
        <p style="margin:0 0 16px;font-size:14px;color:#fff">Pelo ritmo de consumo dos últimos 30 dias, esses produtos vão zerar antes do prazo de reposição:</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b1120;border-radius:12px;border:1px solid #1e293b;margin-bottom:20px;overflow:hidden">
          ${linhas}
        </table>
        ${alertas.length > 20 ? `<p style="margin:0 0 16px;font-size:11px;color:#64748b">+ ${alertas.length - 20} outro(s) produto(s) — veja a lista completa no sistema.</p>` : ''}
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://www.wegrow.app.br'}/pulse/estoque" style="display:inline-block;background:#a855f7;color:#fff;font-weight:900;font-size:13px;text-transform:uppercase;padding:14px 28px;border-radius:10px;text-decoration:none">Ver estoque</a>
      </td></tr>
      <tr><td style="padding:16px 28px;border-top:1px solid #1e293b"><p style="margin:0;font-size:10px;color:#334155;text-align:center">WeGrow · Pulse · Reposição inteligente</p></td></tr>
    </table>
  </td></tr></table>
</body></html>`,
  });
}

// GET — cron diário (ver vercel.json). Pra cada empresa com o módulo Pulse ativo, calcula
// o ritmo de consumo real dos últimos 30 dias por produto e avisa quem vai zerar antes do
// próprio prazo de reposição (prazo_fabricacao_dias do produto, ou 14 dias padrão) — não
// é o mesmo alerta reativo de "cruzou o mínimo fixo" (esse já existe, dispara na hora via
// alertarEstoqueBaixoSeCruzou). Esse aqui é preditivo: avisa ANTES de faltar de verdade.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const supabase = db();
  const { data: empresas } = await supabase.from('empresas').select('id, modulos');
  const empresasPulse = (empresas || []).filter((e: { modulos: Record<string, unknown> | null }) => e.modulos?.pulse);

  const desde = new Date(Date.now() - 30 * 86400000).toISOString();
  let empresasComAlerta = 0, totalAlertas = 0;

  for (const empresa of empresasPulse) {
    const [{ data: servicos }, { data: movimentos }] = await Promise.all([
      supabase.from('servicos').select('id, nome, estoque, prazo_fabricacao_dias, prazo_reposicao_dias').eq('empresa_id', empresa.id).not('estoque', 'is', null),
      supabase.from('estoque_movimentacoes').select('servico_id, quantidade, created_at').eq('empresa_id', empresa.id).lt('quantidade', 0).gte('created_at', desde),
    ]);

    const alertas = calcularAlertasReposicao(
      (servicos || []) as ProdutoParaReposicao[],
      (movimentos || []) as MovimentoConsumo[]
    );
    if (alertas.length > 0) {
      empresasComAlerta++;
      totalAlertas += alertas.length;
      try {
        await notificarReposicao(supabase, empresa.id, alertas);
      } catch (err) {
        console.error('[cron/estoque-reposicao] falha ao notificar empresa', empresa.id, err);
      }
    }
  }

  return NextResponse.json({ ok: true, empresasAnalisadas: empresasPulse.length, empresasComAlerta, totalAlertas });
}
