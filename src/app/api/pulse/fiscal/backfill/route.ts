import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { listarNfesRecebidas, manifestarCiencia, capturarItensDaNota, aguardar, FocusNfeAmbiente } from '@/lib/focusNfe';

export const dynamic = 'force-dynamic';
export const maxDuration = 280; // teto real do plano é o que manda, isso só declara a intenção — o corte de tempo (LIMITE_MS) abaixo é o que garante resposta antes do function timeout

// Focus NFe libera ~100 chamadas/min — cada nota pendente de item usa até 2 (manifestar
// + baixar XML). Sem esperar entre chamadas, um histórico de centenas de notas estoura o
// rate limit em segundos e a maioria falha silenciosamente (voltando 429). 650ms entre
// CADA chamada HTTP ao Focus NFe mantém uns 90/min, com folga.
const ESPERA_ENTRE_CHAMADAS_MS = 650;
// Corta o processamento bem antes do timeout real da função (280s declarados acima) —
// sobra tempo pra responder com o que já foi feito em vez de a Vercel matar a função no
// meio e o cliente nunca saber se funcionou.
const LIMITE_MS = 240_000;

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// POST — puxa TODO o histórico de NF-e recebidas contra o CNPJ da empresa na SEFAZ (via
// Focus NFe), não só o que chegar por webhook daqui pra frente. Pensado pra rodar uma
// vez, logo depois de ativar a integração (ver supabase/scripts/ativar_focus_nfe_*), mas
// é seguro rodar várias vezes: nota que já existe (por chave_acesso) não duplica, nota
// que ficou sem item é tentada de novo, e se o rate limit ou o tempo da função cortar no
// meio, basta clicar de novo — continua de onde parou.
//
// Só cria fiscal_notas (+ itens pendentes de revisão) pro histórico — NÃO cria lançamento
// financeiro (contas a pagar) pra nota antiga, diferente do webhook (que cria pra nota
// nova, essa sim é conta a pagar real). Nota de 6 meses atrás quase certamente já foi
// paga; criar "pendente" em massa pra 500+ notas históricas inflaria o financeiro com
// dívida fictícia. Fica só como registro fiscal até alguém decidir reconciliar à mão.
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

  let notasHistorico;
  try {
    notasHistorico = await listarNfesRecebidas(token, ambiente, empresa.cnpj);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha ao consultar o histórico no Focus NFe.';
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // Notas que já temos registradas (por chave) — evita duplicar, e identifica quais
  // ficaram sem item pra tentar de novo. Se a rodada anterior (antes desse fix) criou
  // duplicata pra alguma chave, o Map só guarda uma — o resto fica órfão no banco; não
  // é limpo aqui automaticamente, precisa de um DELETE manual pontual se acontecer.
  const { data: existentes } = await db.from('fiscal_notas')
    .select('id, chave_acesso, itens_status')
    .eq('empresa_id', perfil.empresa_id)
    .not('chave_acesso', 'is', null);
  const porChave = new Map((existentes || []).map(n => [n.chave_acesso as string, n]));

  let notasNovas = 0, notasComItens = 0, notasSemItensRetentadas = 0, falhas = 0, rateLimitado = false;
  let processadas = 0;

  for (const notaHistorico of notasHistorico) {
    const chave = notaHistorico.chave_nfe;
    if (!chave) continue;

    if (Date.now() - inicio > LIMITE_MS) break; // fica pro próximo clique — evita a função ser matada no meio sem responder nada

    try {
      let notaId: number;
      const jaExiste = porChave.get(chave);

      if (jaExiste) {
        if (jaExiste.itens_status !== 'sem_itens') continue; // já tem item ou já foi processada, nada a fazer
        notaId = jaExiste.id;
        notasSemItensRetentadas++;
      } else {
        const status = notaHistorico.situacao === 'cancelada' ? 'cancelada' : notaHistorico.situacao === 'autorizada' ? 'autorizada' : 'pendente';
        const { data: criada } = await db.from('fiscal_notas').insert([{
          empresa_id: perfil.empresa_id,
          tipo: 'entrada',
          chave_acesso: chave,
          cnpj_participante: notaHistorico.documento_emitente,
          nome_participante: notaHistorico.nome_emitente,
          valor_total: notaHistorico.valor_total ? Number(notaHistorico.valor_total) : null,
          status,
          origem: 'manifestacao_focus_nfe',
          data_emissao: notaHistorico.data_emissao ? notaHistorico.data_emissao.slice(0, 10) : null,
          observacao: 'Capturada no backfill de histórico (nota anterior à ativação do webhook).',
        }]).select('id').single();
        if (!criada) { falhas++; continue; }
        notaId = criada.id;
        porChave.set(chave, { id: notaId, chave_acesso: chave, itens_status: 'sem_itens' });
        notasNovas++;
      }

      // nfe_completa=false: SEFAZ ainda não liberou o XML — nem tenta, só volta vazio.
      // Fica 'sem_itens' e o próximo backfill tenta de novo (o evento mais recente da
      // mesma chave, já filtrado em listarNfesRecebidas, eventualmente vem completo).
      if (notaHistorico.nfe_completa === false) continue;

      await manifestarCiencia(token, ambiente, chave);
      await aguardar(ESPERA_ENTRE_CHAMADAS_MS);
      const resultado = await capturarItensDaNota(db, notaId, perfil.empresa_id, token, ambiente, chave);
      if (resultado.rateLimited) { rateLimitado = true; break; } // Focus NFe já tá recusando — parar agora, o resto fica pro próximo clique
      if (resultado.itensGravados > 0) notasComItens++;
      processadas++;
      await aguardar(ESPERA_ENTRE_CHAMADAS_MS);
    } catch (err) {
      console.error('[pulse/fiscal/backfill] falha numa nota do histórico:', chave, err);
      falhas++;
    }
  }

  const restantes = notasHistorico.filter(n => {
    const existente = porChave.get(n.chave_nfe);
    return !existente || existente.itens_status === 'sem_itens';
  }).length - processadas;

  return NextResponse.json({
    ok: true,
    totalNoHistorico: notasHistorico.length,
    notasNovas,
    notasComItens,
    notasSemItensRetentadas,
    falhas,
    rateLimitado,
    parcial: rateLimitado || restantes > 0,
    restantesEstimado: Math.max(0, restantes),
  });
}
