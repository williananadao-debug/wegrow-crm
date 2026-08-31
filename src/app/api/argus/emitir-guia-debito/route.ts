import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// "DETRAN / SC / Guias de Débitos" (Infosimples) — baixa a guia de pagamento (boleto) de
// cada débito em aberto do veículo, retornando um link (guia_pdf_url) por débito. Mesmo
// princípio de credencial do endpoint de consulta: login do DETRAN-SC fica só em env var
// do servidor, nunca persistido no banco. A própria fonte (DETRAN-SC) impõe limite diário
// de downloads por login — ver aviso no README antes de automatizar em lote.
const GUIA_URL = process.env.INFOSIMPLES_GUIA_URL || '';
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

    if (!GUIA_URL || !CONSULTA_TOKEN) {
      return NextResponse.json({
        erro: 'Emissão de guia de débito não configurada. Contrate a API "DETRAN / SC / Guias de Débitos" na Infosimples e defina INFOSIMPLES_GUIA_URL e INFOSIMPLES_TOKEN nas variáveis de ambiente do servidor.',
        naoConfigurado: true,
      }, { status: 501 });
    }
    if (!renavam) {
      return NextResponse.json({ erro: 'Renavam é obrigatório — edite a venda em Vendas e preencha o Renavam do veículo.' }, { status: 422 });
    }
    if (!DETRAN_LOGIN_CPF || !DETRAN_LOGIN_SENHA) {
      return NextResponse.json({
        erro: 'Login do DETRAN-SC não configurado no servidor (DETRAN_SC_LOGIN_CPF/DETRAN_SC_LOGIN_SENHA).',
        naoConfigurado: true,
      }, { status: 501 });
    }

    const res = await fetch(GUIA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: CONSULTA_TOKEN, placa, renavam, login_cpf: DETRAN_LOGIN_CPF, login_senha: DETRAN_LOGIN_SENHA }),
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error('[emitir-guia-debito]', res.status, txt.slice(0, 300));
      return NextResponse.json({ erro: 'Provedor retornou erro: ' + txt.slice(0, 200) }, { status: 502 });
    }

    const dados = await res.json();
    return NextResponse.json({ ok: true, dados });
  } catch (err: any) {
    console.error('[emitir-guia-debito/unhandled]', err);
    return NextResponse.json({ erro: 'Erro interno: ' + (err?.message || String(err)) }, { status: 500 });
  }
}
