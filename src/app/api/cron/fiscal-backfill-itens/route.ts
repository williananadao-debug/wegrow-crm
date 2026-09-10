import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { FocusNfeAmbiente } from '@/lib/focusNfe';
import { processarBackfillEmpresa } from '@/lib/focusNfeBackfill';

export const dynamic = 'force-dynamic';
export const maxDuration = 280;
// Orçamento total do cron inteiro (todas as empresas juntas) — sobra tempo pra responder
// antes da Vercel matar a função. Dividido entre empresas conforme processa.
const LIMITE_TOTAL_MS = 250_000;

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// GET — cron diário (ver vercel.json). A SEFAZ libera o XML completo de uma NF-e
// recebida de forma assíncrona — às vezes só horas ou dias depois do evento aparecer na
// listagem do Focus NFe. Um clique manual em "Buscar histórico completo" pega o que já
// está pronto na hora, mas o que ainda não ficou pronto fica esperando — esse cron tenta
// de novo sozinho todo dia, sem precisar ninguém lembrar. Roda pra toda empresa com
// integração Focus NFe ativa (token configurado) e CNPJ cadastrado.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const inicio = Date.now();
  const supabase = db();

  const { data: integracoes } = await supabase.from('fiscal_integracoes')
    .select('empresa_id, token_producao, token_homologacao, ambiente_ativo');

  const resultadosPorEmpresa: Record<string, unknown> = {};
  let empresasProcessadas = 0;

  for (const integracao of integracoes || []) {
    const restante = LIMITE_TOTAL_MS - (Date.now() - inicio);
    if (restante < 15_000) break; // não sobra tempo útil nem pra uma nota, para por aqui — próxima empresa fica pro cron de amanhã

    const ambiente: FocusNfeAmbiente = integracao.ambiente_ativo === 'producao' ? 'producao' : 'homologacao';
    const token = ambiente === 'producao' ? integracao.token_producao : integracao.token_homologacao;
    if (!token) continue;

    const { data: empresa } = await supabase.from('empresas').select('cnpj').eq('id', integracao.empresa_id).single();
    if (!empresa?.cnpj) continue;

    try {
      const resultado = await processarBackfillEmpresa({
        db: supabase, empresaId: integracao.empresa_id, cnpj: empresa.cnpj,
        token, ambiente, inicio: Date.now(), tempoLimiteMs: restante,
      });
      resultadosPorEmpresa[integracao.empresa_id] = resultado;
      empresasProcessadas++;
    } catch (err) {
      console.error('[cron/fiscal-backfill-itens] falha na empresa', integracao.empresa_id, err);
      resultadosPorEmpresa[integracao.empresa_id] = { erro: err instanceof Error ? err.message : 'falha desconhecida' };
    }
  }

  return NextResponse.json({ ok: true, empresasProcessadas, totalIntegracoes: (integracoes || []).length, resultadosPorEmpresa });
}
