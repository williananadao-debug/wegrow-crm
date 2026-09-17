import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { baseUrl, headerAuth, type FocusNfeAmbiente } from '@/lib/focusNfe';

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

// Confirmado com um teste real do time (payload de exemplo do próprio Focus NFe): o corpo
// que chega no webhook é raso — cnpj_emitente, ref, status, status_sefaz, mensagem_sefaz,
// chave_nfe, numero, serie, protocolo, caminho_xml_nota_fiscal, caminho_danfe. NÃO vem
// destinatário, valor nem data de emissão nesse nível — isso só aparece consultando de
// volta com ?completa=1 (dentro de requisicao_nota_fiscal). caminho_danfe/
// caminho_xml_nota_fiscal também vêm como path relativo ("/arquivos/..."), não URL
// completa — precisa prefixar com o domínio do Focus NFe.
async function buscarDetalhesCompletos(ref: string, token: string, ambiente: FocusNfeAmbiente) {
  try {
    const res = await fetch(`${baseUrl(ambiente)}/v2/nfe/${ref}?completa=1`, { headers: headerAuth(token) });
    if (!res.ok) return null;
    const json = await res.json();
    const req = json?.requisicao_nota_fiscal || {};
    return {
      valorTotal: primeiro(req.valor_total),
      nomeDestinatario: primeiro(req.nome_destinatario),
      cnpjDestinatario: primeiro(req.cnpj_destinatario, req.cpf_destinatario),
      dataEmissao: primeiro(req.data_emissao),
    };
  } catch (err) {
    console.error('[webhook/focus-nfe/emitida] falha ao consultar detalhes completos:', err);
    return null;
  }
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
  const { data: integracao } = await db.from('fiscal_integracoes')
    .select('empresa_id, token_producao, token_homologacao, ambiente_ativo')
    .eq('webhook_secret', secretRecebido).maybeSingle();
  if (!integracao) return NextResponse.json({ erro: 'Assinatura inválida.' }, { status: 401 });

  let payload: any;
  try { payload = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

  const status = primeiro(payload.status);
  const ref = primeiro(payload.ref);
  const autorizada = status === 'autorizado' || status === 'autorizada';

  // Nota emitida pela nossa própria integração (/api/pulse/fiscal/emitir-nf1|nf2) já tem
  // uma linha "processando" gravada na hora do POST, identificada pelo "ref". Casar por ref
  // primeiro (cobre inclusive erro/rejeição — sem isso a linha ficava "processando" pra
  // sempre, escondendo do usuário que a emissão falhou de verdade).
  const existentePorRef = ref
    ? (await db.from('fiscal_notas').select('id').eq('empresa_id', integracao.empresa_id).eq('ref_focus_nfe', ref).maybeSingle()).data
    : null;

  if (existentePorRef && !autorizada) {
    await db.from('fiscal_notas').update({
      status: 'erro_autorizacao',
      observacao: `Focus NFe recusou/rejeitou (status: ${status}). ${primeiro(payload.mensagem_sefaz, payload.mensagem) || ''}`.trim(),
    }).eq('id', existentePorRef.id);
    return NextResponse.json({ ok: true, atualizado: true, erro: true });
  }

  // Nota de terceiro (emitida fora da nossa integração) que não é autorizada não vira
  // registro em fiscal_notas ainda — evita linha "fantasma" pra nota que nunca saiu do papel.
  if (!existentePorRef && !autorizada) {
    return NextResponse.json({ ok: true, ignorado: true, status });
  }

  const ambiente: FocusNfeAmbiente = integracao.ambiente_ativo === 'producao' ? 'producao' : 'homologacao';
  const token = ambiente === 'producao' ? integracao.token_producao : integracao.token_homologacao;

  const chaveAcesso = primeiro(payload.chave_nfe, payload.chave_acesso, payload.chave);
  const numero = primeiro(payload.numero, payload.numero_nfe);
  const serie = primeiro(payload.serie);
  const caminhoDanfe = primeiro(payload.caminho_danfe);
  const caminhoXml = primeiro(payload.caminho_xml_nota_fiscal, payload.caminho_xml);
  const danfeUrl = caminhoDanfe ? `${baseUrl(ambiente)}${caminhoDanfe}` : null;
  const xmlUrl = caminhoXml ? `${baseUrl(ambiente)}${caminhoXml}` : null;

  // Valor/destinatário/data não vêm no corpo do webhook — busca numa segunda chamada só
  // se tiver ref e token (nota emitida fora do nosso token não teria ref que a gente
  // reconheça, mas o Focus NFe manda o ref dela mesmo assim; se falhar, a nota entra sem
  // esses dados em vez de travar o webhook inteiro).
  const detalhes = ref && token ? await buscarDetalhesCompletos(ref, token, ambiente) : null;

  const existentePorChave = !existentePorRef && chaveAcesso
    ? (await db.from('fiscal_notas').select('id').eq('empresa_id', integracao.empresa_id).eq('chave_acesso', chaveAcesso).maybeSingle()).data
    : null;
  const existente = existentePorRef || existentePorChave;
  if (existente) {
    // Reenvio do mesmo evento (Focus NFe faz retry) ou a nota amadureceu de
    // "processando" pra "autorizado" — atualiza o que muda em vez de duplicar linha.
    await db.from('fiscal_notas').update({
      status: 'autorizada', chave_acesso: chaveAcesso, numero, serie, danfe_url: danfeUrl, xml_url: xmlUrl,
      ...(detalhes?.valorTotal != null ? { valor_total: detalhes.valorTotal } : {}),
      ...(detalhes?.nomeDestinatario ? { nome_participante: detalhes.nomeDestinatario, cnpj_participante: detalhes.cnpjDestinatario } : {}),
      ...(detalhes?.dataEmissao ? { data_emissao: detalhes.dataEmissao } : {}),
    }).eq('id', existente.id);
    return NextResponse.json({ ok: true, atualizado: true });
  }

  await db.from('fiscal_notas').insert([{
    empresa_id: integracao.empresa_id,
    tipo: 'saida',
    chave_acesso: chaveAcesso,
    numero, serie,
    cnpj_participante: detalhes?.cnpjDestinatario ?? null,
    nome_participante: detalhes?.nomeDestinatario ?? null,
    valor_total: detalhes?.valorTotal ?? null,
    status: 'autorizada',
    origem: 'focus_nfe_emitida',
    data_emissao: detalhes?.dataEmissao ?? null,
    danfe_url: danfeUrl,
    xml_url: xmlUrl,
    itens_status: 'processado',
    observacao: `Payload bruto do webhook: ${JSON.stringify(payload).slice(0, 1800)}`,
  }]);

  return NextResponse.json({ ok: true });
}
