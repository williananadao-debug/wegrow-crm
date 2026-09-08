import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function primeiro(...valores: any[]) {
  return valores.find(v => v !== undefined && v !== null && v !== '') ?? null;
}

// POST — Focus NFe chama isso quando uma NF-e que NÓS emitimos (saída/venda) muda de
// status na SEFAZ (autorizada, rejeitada, cancelada). A emissão em si (POST /v2/nfe) ainda
// não está implementada — depende do NCM/CFOP de cada modelo de trailer, que só a
// contabilidade da Trailer Travel pode fornecer (ver nota na migration/decisão de
// 2026-09-08). Esse receptor já fica pronto pra quando a emissão entrar no ar.
export async function POST(request: Request) {
  const secretRecebido = request.headers.get('x-webhook-secret');
  if (!secretRecebido) return NextResponse.json({ erro: 'Sem assinatura.' }, { status: 401 });

  const db = supabaseAdmin();
  const { data: integracao } = await db.from('fiscal_integracoes').select('empresa_id').eq('webhook_secret', secretRecebido).maybeSingle();
  if (!integracao) return NextResponse.json({ erro: 'Assinatura inválida.' }, { status: 401 });

  let payload: any;
  try { payload = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

  const chaveAcesso = primeiro(payload.chave_nfe, payload.chave_acesso);
  const statusBruto = primeiro(payload.status);
  const status = statusBruto === 'autorizado' ? 'autorizada' : statusBruto === 'cancelado' ? 'cancelada' : statusBruto === 'erro_autorizacao' || statusBruto === 'rejeitado' ? 'rejeitada' : 'pendente';
  const ref = primeiro(payload.ref); // referência que nosso lado passa na emissão — usaremos pra achar a linha certa quando a emissão existir

  console.log('[webhook/focus-nfe/emitida]', { empresa_id: integracao.empresa_id, chaveAcesso, status, ref, statusBruto });

  // Sem emissão implementada ainda, não existe linha em fiscal_notas pra casar esse
  // evento — só registra pra não perder o histórico enquanto isso não entra no ar.
  if (chaveAcesso) {
    const { data: existente } = await db.from('fiscal_notas').select('id').eq('empresa_id', integracao.empresa_id).eq('chave_acesso', chaveAcesso).maybeSingle();
    if (existente) {
      await db.from('fiscal_notas').update({ status }).eq('id', existente.id);
    } else {
      await db.from('fiscal_notas').insert([{
        empresa_id: integracao.empresa_id, tipo: 'saida', chave_acesso: chaveAcesso, status,
        origem: 'emissao_focus_nfe', numero: primeiro(payload.numero), serie: primeiro(payload.serie),
        observacao: `Webhook recebido antes da emissão estar implementada no nosso lado — payload: ${JSON.stringify(payload).slice(0, 1800)}`,
      }]);
    }
  }

  return NextResponse.json({ ok: true });
}
