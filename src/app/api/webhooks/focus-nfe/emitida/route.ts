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

// POST — Focus NFe chama isso pra qualquer NF-e (evento "nfe") ligada ao CNPJ da empresa
// ficar autorizada, seja ela emitida pela nossa própria integração (fluxo de "entrega
// futura" do Pulse) ou emitida direto no painel do Focus NFe pela empresa (ex: Trailer
// Travel já emite algumas notas assim, sem passar pelo WeGrow) — sem esse webhook, essas
// notas de saída nunca apareciam em /pulse/fiscal, só as de entrada capturadas pelo
// webhook "recebida". Precisa cadastrar o gatilho (event: "nfe") no Focus NFe apontando
// pra essa URL — ver instruções do time.
export async function POST(request: Request) {
  const secretRecebido = request.headers.get('x-webhook-secret');
  if (!secretRecebido) return NextResponse.json({ erro: 'Sem assinatura.' }, { status: 401 });

  const db = supabaseAdmin();
  const { data: integracao } = await db.from('fiscal_integracoes').select('empresa_id').eq('webhook_secret', secretRecebido).maybeSingle();
  if (!integracao) return NextResponse.json({ erro: 'Assinatura inválida.' }, { status: 401 });

  let payload: any;
  try { payload = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

  // Só nos interessa nota autorizada — rejeitada/cancelada/em processamento não vira
  // registro em fiscal_notas ainda (evita linha "fantasma" pra nota que nunca saiu do papel).
  const status = primeiro(payload.status);
  if (status && status !== 'autorizado' && status !== 'autorizada') {
    return NextResponse.json({ ok: true, ignorado: true, status });
  }

  const chaveAcesso = primeiro(payload.chave_nfe, payload.chave_acesso, payload.chave);
  const cnpjDestinatario = primeiro(payload.cnpj_destinatario, payload.cpf_destinatario);
  const nomeDestinatario = primeiro(payload.nome_destinatario, payload.razao_social_destinatario);
  const numero = primeiro(payload.numero, payload.numero_nfe);
  const serie = primeiro(payload.serie);
  const valorTotal = primeiro(payload.valor_total, payload.valor_nota, payload.valor);
  const dataEmissao = primeiro(payload.data_emissao, payload.data);
  const danfeUrl = primeiro(payload.caminho_danfe, payload.url_danfe);
  const xmlUrl = primeiro(payload.caminho_xml_nota_fiscal, payload.caminho_xml, payload.url_xml);

  if (chaveAcesso) {
    const { data: existente } = await db.from('fiscal_notas').select('id').eq('empresa_id', integracao.empresa_id).eq('chave_acesso', chaveAcesso).maybeSingle();
    if (existente) {
      // Reenvio do mesmo evento (Focus NFe faz retry) ou a nota amadureceu de
      // "processando" pra "autorizado" — atualiza o que muda (link do DANFE/XML só fica
      // disponível depois de autorizada) em vez de duplicar linha.
      await db.from('fiscal_notas').update({ status: 'autorizada', danfe_url: danfeUrl, xml_url: xmlUrl }).eq('id', existente.id);
      return NextResponse.json({ ok: true, atualizado: true });
    }
  }

  await db.from('fiscal_notas').insert([{
    empresa_id: integracao.empresa_id,
    tipo: 'saida',
    chave_acesso: chaveAcesso,
    numero, serie,
    cnpj_participante: cnpjDestinatario,
    nome_participante: nomeDestinatario,
    valor_total: valorTotal,
    status: 'autorizada',
    origem: 'focus_nfe_emitida',
    data_emissao: dataEmissao,
    danfe_url: danfeUrl,
    xml_url: xmlUrl,
    itens_status: 'processado',
    observacao: `Payload bruto do webhook (conferir mapeamento de campos na primeira nota real): ${JSON.stringify(payload).slice(0, 1800)}`,
  }]);

  return NextResponse.json({ ok: true });
}
