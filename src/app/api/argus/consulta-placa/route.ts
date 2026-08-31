import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Consulta de multas/débitos por placa não tem API pública/gratuita confiável no Brasil —
// cada DETRAN estadual expõe dados diferentes, e os provedores de mercado (Infosimples,
// Celcoin, etc.) cobram por consulta e exigem conta própria. Este endpoint é um proxy fino:
// se INFOSIMPLES_CONSULTA_URL/INFOSIMPLES_TOKEN não estiverem configurados no servidor,
// retorna um erro claro em vez de fingir sucesso.
//
// DETRAN/SC (produto "Veículo Extrato" da Infosimples) exige, além de placa+renavam, o
// login do próprio portal do DETRAN-SC (CPF+senha) ou um certificado digital — não é só um
// token de API. Por isso login_cpf/login_senha ficam em env vars do servidor (nunca no
// banco, nunca vindos do navegador) — mesmo princípio de nunca persistir credencial de
// terceiro em texto puro na aplicação.
const CONSULTA_URL = process.env.INFOSIMPLES_CONSULTA_URL || '';
const CONSULTA_TOKEN = process.env.INFOSIMPLES_TOKEN || '';
const DETRAN_LOGIN_CPF = process.env.DETRAN_SC_LOGIN_CPF || '';
const DETRAN_LOGIN_SENHA = process.env.DETRAN_SC_LOGIN_SENHA || '';

export async function POST(req: Request) {
  try {
    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

    const placa = String(body?.placa || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const renavam = String(body?.renavam || '').replace(/\D/g, '');
    if (!placa || !body?.empresa_id) return NextResponse.json({ erro: 'Placa e empresa_id são obrigatórios.' }, { status: 422 });

    if (!CONSULTA_URL || !CONSULTA_TOKEN) {
      return NextResponse.json({
        erro: 'Consulta de multas/débitos não configurada. Contrate a API "DETRAN / SC / Veículo (Extrato)" na Infosimples e defina INFOSIMPLES_CONSULTA_URL e INFOSIMPLES_TOKEN nas variáveis de ambiente do servidor.',
        naoConfigurado: true,
      }, { status: 501 });
    }
    if (!renavam) {
      return NextResponse.json({ erro: 'Renavam é obrigatório pra essa consulta no DETRAN-SC — edite a venda em Vendas e preencha o Renavam do veículo.' }, { status: 422 });
    }
    if (!DETRAN_LOGIN_CPF || !DETRAN_LOGIN_SENHA) {
      return NextResponse.json({
        erro: 'Login do DETRAN-SC não configurado no servidor (DETRAN_SC_LOGIN_CPF/DETRAN_SC_LOGIN_SENHA) — a Infosimples usa o login do próprio portal do DETRAN, não só um token de API.',
        naoConfigurado: true,
      }, { status: 501 });
    }

    const res = await fetch(CONSULTA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: CONSULTA_TOKEN, placa, renavam, login_cpf: DETRAN_LOGIN_CPF, login_senha: DETRAN_LOGIN_SENHA }),
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
