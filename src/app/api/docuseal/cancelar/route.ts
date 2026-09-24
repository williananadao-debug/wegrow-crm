import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

const DOCUSEAL_URL = (process.env.DOCUSEAL_URL || '').replace(/\/$/, '');
const DOCUSEAL_TOKEN = process.env.DOCUSEAL_TOKEN || '';

// Botão manual "Cancelar contrato" (tela de detalhes da venda no Pulse) — arquiva a
// submissão ativa no Docuseal (invalida o(s) link(s) de assinatura) sem esperar que alguém
// regenere um contrato novo. Usado, por exemplo, quando um contrato saiu com dado errado e
// o vendedor quer tirar o link do ar antes mesmo de gerar a versão corrigida.
export async function POST(req: Request) {
  try {
    const supabaseAdmin = db();

    const accessToken = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!accessToken) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });
    const { data: { user: solicitante }, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
    if (authError || !solicitante) return NextResponse.json({ erro: 'Token inválido.' }, { status: 401 });

    const { data: perfil } = await supabaseAdmin.from('profiles').select('empresa_id').eq('id', solicitante.id).single();
    if (!perfil?.empresa_id) return NextResponse.json({ erro: 'Empresa não identificada.' }, { status: 400 });

    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }
    const leadId = body?.lead_id;
    if (!leadId) return NextResponse.json({ erro: 'lead_id é obrigatório.' }, { status: 422 });

    const { data: lead, error: leadErr } = await supabaseAdmin
      .from('leads')
      .select('id, empresa_id, docuseal_submission_id')
      .eq('id', leadId)
      .single();
    if (leadErr || !lead) return NextResponse.json({ erro: 'Venda não encontrada.' }, { status: 404 });
    // Nunca confia em empresa_id vindo do corpo — só o que a própria venda já tem, cruzado
    // com a empresa do usuário autenticado (mesma checagem de tenant usada em ia/estrategia).
    if (lead.empresa_id !== perfil.empresa_id) return NextResponse.json({ erro: 'Sem permissão.' }, { status: 403 });

    if (!lead.docuseal_submission_id) {
      return NextResponse.json({ erro: 'Essa venda não tem contrato ativo pra cancelar.' }, { status: 422 });
    }

    if (DOCUSEAL_URL && DOCUSEAL_TOKEN) {
      try {
        const res = await fetch(`${DOCUSEAL_URL}/submissions/${lead.docuseal_submission_id}`, {
          method: 'DELETE',
          headers: { 'X-Auth-Token': DOCUSEAL_TOKEN },
        });
        // 404 = já não existe mais no Docuseal (ex: cancelado por lá direto) — segue normal,
        // só falha de verdade se o Docuseal respondeu com erro real.
        if (!res.ok && res.status !== 404) {
          const txt = await res.text();
          console.error('[docuseal/cancelar]', res.status, txt.slice(0, 300));
          return NextResponse.json({ erro: 'Erro ao cancelar no Docuseal: ' + txt.slice(0, 200) }, { status: 502 });
        }
      } catch (err: any) {
        console.error('[docuseal/cancelar]', err.message);
        return NextResponse.json({ erro: 'Erro ao contatar o Docuseal: ' + err.message }, { status: 502 });
      }
    }

    await supabaseAdmin.from('leads').update({
      docuseal_submission_id: null,
      docuseal_sign_url: null,
      docuseal_consultor_sign_url: null,
      docuseal_consultor_assinado: false,
      docuseal_assinado: false,
      docuseal_cancelado_em: new Date().toISOString(),
    }).eq('id', leadId);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[docuseal/cancelar/unhandled]', err);
    return NextResponse.json({ erro: 'Erro interno: ' + (err?.message || String(err)) }, { status: 500 });
  }
}
