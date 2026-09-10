import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { manifestarCiencia, capturarItensDaNota, criarLancamentoNotaEntrada, FocusNfeAmbiente } from '@/lib/focusNfe';

export const dynamic = 'force-dynamic';

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// Payload exato do Focus NFe pra "nfe_recebida" não está documentado publicamente de
// forma completa (a doc é uma SPA que não expõe o schema em texto simples) — os nomes de
// campo abaixo são os mais prováveis com base em como o evento "nfe" (emissão) se
// comporta, com fallbacks pra variações. Sempre logamos o payload cru também, pra ajustar
// sem perder dado se o formato real vier diferente na primeira chamada de verdade.
function primeiro(...valores: any[]) {
  return valores.find(v => v !== undefined && v !== null && v !== '') ?? null;
}

// POST — Focus NFe chama isso sempre que detecta uma NF-e emitida contra o CNPJ da
// empresa (nota de compra que um fornecedor emitiu pra Trailer Travel). É a "captação
// automática de entrada" prometida ao cliente — sem isso, cada nota tinha que ser lançada
// na mão (XML baixado do e-mail, ou consulta manual na Receita).
export async function POST(request: Request) {
  const secretRecebido = request.headers.get('x-webhook-secret');
  if (!secretRecebido) return NextResponse.json({ erro: 'Sem assinatura.' }, { status: 401 });

  const db = supabaseAdmin();
  const { data: integracao } = await db.from('fiscal_integracoes').select('empresa_id').eq('webhook_secret', secretRecebido).maybeSingle();
  if (!integracao) return NextResponse.json({ erro: 'Assinatura inválida.' }, { status: 401 });

  let payload: any;
  try { payload = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

  const chaveAcesso = primeiro(payload.chave_nfe, payload.chave_acesso, payload.chave);
  const cnpjEmitente = primeiro(payload.cnpj_emitente, payload.cnpj);
  const nomeEmitente = primeiro(payload.nome_emitente, payload.razao_social_emitente, payload.nome);
  const numero = primeiro(payload.numero, payload.numero_nfe);
  const serie = primeiro(payload.serie);
  const valorTotal = primeiro(payload.valor_total, payload.valor_nota, payload.valor);
  const dataEmissao = primeiro(payload.data_emissao, payload.data);

  // Evita duplicar se o Focus NFe reenviar o mesmo evento (eles fazem retry em caso de
  // falha de resposta) — chave de acesso é única por natureza da NF-e.
  if (chaveAcesso) {
    const { data: existente } = await db.from('fiscal_notas').select('id').eq('empresa_id', integracao.empresa_id).eq('chave_acesso', chaveAcesso).maybeSingle();
    if (existente) return NextResponse.json({ ok: true, duplicado: true });
  }

  const { data: notaCriada } = await db.from('fiscal_notas').insert([{
    empresa_id: integracao.empresa_id,
    tipo: 'entrada',
    chave_acesso: chaveAcesso,
    numero, serie,
    cnpj_participante: cnpjEmitente,
    nome_participante: nomeEmitente,
    valor_total: valorTotal,
    status: 'autorizada',
    origem: 'manifestacao_focus_nfe',
    data_emissao: dataEmissao,
    observacao: `Payload bruto do webhook (conferir mapeamento de campos na primeira nota real): ${JSON.stringify(payload).slice(0, 1800)}`,
  }]).select('id').single();

  // Nota capturada automática também é conta a pagar de verdade — sem isso ela só
  // aparecia em /pulse/fiscal, nunca em Financeiro (diferente da nota lançada na mão por
  // foto, que sempre criou o lançamento junto).
  if (notaCriada && valorTotal) {
    await criarLancamentoNotaEntrada(db, {
      empresaId: integracao.empresa_id, notaId: notaCriada.id, valorTotal,
      nomeParticipante: nomeEmitente, cnpjParticipante: cnpjEmitente,
      numero, serie, chaveAcesso, dataEmissao,
    });
  }

  // "Ciência da operação" precisa acontecer logo (a SEFAZ cobra isso dentro de um prazo)
  // — as etapas seguintes (confirmação depois de conferir a mercadoria física, ou
  // desconhecimento se a nota não for da empresa) ficam pra ação manual do almoxarifado,
  // não dá pra confirmar recebimento de mercadoria que ainda não chegou.
  if (chaveAcesso && notaCriada) {
    const { data: integracaoCompleta } = await db.from('fiscal_integracoes').select('token_producao, token_homologacao, ambiente_ativo').eq('empresa_id', integracao.empresa_id).single();
    const ambiente: FocusNfeAmbiente = integracaoCompleta?.ambiente_ativo === 'producao' ? 'producao' : 'homologacao';
    const token = ambiente === 'producao' ? integracaoCompleta?.token_producao : integracaoCompleta?.token_homologacao;
    if (token) {
      try {
        await manifestarCiencia(token, ambiente, chaveAcesso);
        // Buscar itens é best-effort logo em seguida: às vezes a SEFAZ ainda não liberou
        // o XML completo no instante exato da manifestação. Se falhar aqui, a nota fica
        // 'sem_itens' e o backfill (que roda por baixo dos panos de novo) pega ela depois
        // junto com o resto do histórico — não trava o registro da nota por causa disso.
        await capturarItensDaNota(db, notaCriada.id, integracao.empresa_id, token, ambiente, chaveAcesso);
      } catch (err) {
        console.error('[webhook/focus-nfe/recebida] falha ao manifestar/buscar itens:', err);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
