import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { FocusNfeAmbiente } from '@/lib/focusNfe';
import { processarBackfillEmpresa } from '@/lib/focusNfeBackfill';

export const dynamic = 'force-dynamic';
export const maxDuration = 280; // teto real do plano é o que manda, isso só declara a intenção — o corte de tempo (LIMITE_MS) abaixo é o que garante resposta antes do function timeout
const LIMITE_MS = 240_000; // sobra tempo pra responder com o que já foi feito em vez de a Vercel matar a função no meio

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// POST — puxa TODO o histórico de NF-e recebidas contra o CNPJ da empresa na SEFAZ (via
// Focus NFe), não só o que chegar por webhook daqui pra frente. Pensado pra rodar logo
// depois de ativar a integração (ver supabase/scripts/ativar_focus_nfe_*), mas é seguro
// rodar várias vezes: nota que já existe (por chave_acesso) não duplica, nota que ficou
// sem item é tentada de novo, e se o rate limit ou o tempo da função cortar no meio,
// basta clicar de novo — continua de onde parou. Existe também um cron diário
// (/api/cron/fiscal-backfill-itens) que faz esse retry sozinho, sem precisar clicar.
//
// Cria fiscal_notas + lançamento (conta a pagar 'pendente') pra toda nota nova, inclusive
// histórico — quem cuida do financeiro marca como paga na mão as que já foram quitadas.
export async function POST(req: NextRequest) {
  const inicio = Date.now();
  const db = supabaseAdmin();

  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!accessToken) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const { data: { user }, error: authError } = await db.auth.getUser(accessToken);
  if (authError || !user) return NextResponse.json({ error: 'Token inválido.' }, { status: 401 });

  const { data: perfil } = await db.from('profiles').select('empresa_id, cargo').eq('id', user.id).single();
  if (!perfil?.empresa_id) return NextResponse.json({ error: 'Empresa não identificada.' }, { status: 400 });
  // Backfill dispara chamada real pra SEFAZ (via Focus NFe) e mexe potencialmente em
  // muita nota de uma vez — mesma alçada de quem configura a integração, não é ação de
  // vendedor comum.
  if (perfil.cargo !== 'diretor' && perfil.cargo !== 'gerente') {
    return NextResponse.json({ error: 'Só diretor ou gerente pode buscar o histórico.' }, { status: 403 });
  }

  const { data: empresa } = await db.from('empresas').select('cnpj').eq('id', perfil.empresa_id).single();
  if (!empresa?.cnpj) return NextResponse.json({ error: 'Empresa sem CNPJ cadastrado.' }, { status: 400 });

  const { data: integracao } = await db.from('fiscal_integracoes')
    .select('token_producao, token_homologacao, ambiente_ativo')
    .eq('empresa_id', perfil.empresa_id).maybeSingle();
  if (!integracao) return NextResponse.json({ error: 'Integração com o Focus NFe ainda não foi ativada pra essa empresa.' }, { status: 400 });
  const ambiente: FocusNfeAmbiente = integracao.ambiente_ativo === 'producao' ? 'producao' : 'homologacao';
  const token = ambiente === 'producao' ? integracao.token_producao : integracao.token_homologacao;
  if (!token) return NextResponse.json({ error: `Sem token de ${ambiente} configurado.` }, { status: 400 });

  try {
    const resultado = await processarBackfillEmpresa({
      db, empresaId: perfil.empresa_id, cnpj: empresa.cnpj, token, ambiente, inicio, tempoLimiteMs: LIMITE_MS,
    });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha ao consultar o histórico no Focus NFe.';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
