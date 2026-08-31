import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Consulta de multas/débitos por placa não tem API pública/gratuita confiável no Brasil —
// cada DETRAN estadual expõe dados diferentes, e os provedores de mercado (Infosimples,
// Celcoin, etc.) cobram por consulta e exigem conta própria. Este endpoint é um proxy fino:
// se INFOSIMPLES_CONSULTA_URL/INFOSIMPLES_TOKEN não estiverem configurados no servidor,
// retorna um erro claro em vez de fingir sucesso — ver README da integração antes de
// habilitar em produção (precisa contratar plano no provedor escolhido e configurar as
// env vars com a URL exata do endpoint do estado/plano contratado).
const CONSULTA_URL = process.env.INFOSIMPLES_CONSULTA_URL || '';
const CONSULTA_TOKEN = process.env.INFOSIMPLES_TOKEN || '';

export async function POST(req: Request) {
  try {
    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

    const placa = String(body?.placa || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (!placa || !body?.empresa_id) return NextResponse.json({ erro: 'Placa e empresa_id são obrigatórios.' }, { status: 422 });

    if (!CONSULTA_URL || !CONSULTA_TOKEN) {
      return NextResponse.json({
        erro: 'Consulta de multas/débitos não configurada. Contrate um provedor (ex: Infosimples, Celcoin) e defina INFOSIMPLES_CONSULTA_URL e INFOSIMPLES_TOKEN nas variáveis de ambiente do servidor.',
        naoConfigurado: true,
      }, { status: 501 });
    }

    const res = await fetch(CONSULTA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: CONSULTA_TOKEN, placa }),
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error('[consulta-placa]', res.status, txt.slice(0, 300));
      return NextResponse.json({ erro: 'Provedor de consulta retornou erro: ' + txt.slice(0, 200) }, { status: 502 });
    }

    const dados = await res.json();
    return NextResponse.json({ ok: true, dados });
  } catch (err: any) {
    console.error('[consulta-placa/unhandled]', err);
    return NextResponse.json({ erro: 'Erro interno: ' + (err?.message || String(err)) }, { status: 500 });
  }
}
