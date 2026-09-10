import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { listarNfesRecebidas, manifestarCiencia, capturarItensDaNota, FocusNfeAmbiente } from '@/lib/focusNfe';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // histórico inteiro pode ter muita nota — cada uma faz 2-3 chamadas pro Focus NFe

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// POST — puxa TODO o histórico de NF-e recebidas contra o CNPJ da empresa na SEFAZ
// (via Focus NFe), não só o que chegar por webhook daqui pra frente. Pensado pra rodar
// uma vez, logo depois de ativar a integração (ver supabase/scripts/ativar_focus_nfe_*),
// mas é seguro rodar de novo: nota que já existe (por chave_acesso) não duplica, e nota
// que ficou sem item também é tentada de novo (webhook pode ter chegado antes da SEFAZ
// liberar o XML completo).
export async function POST(req: NextRequest) {
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
  // ficaram sem item pra tentar de novo.
  const { data: existentes } = await db.from('fiscal_notas')
    .select('id, chave_acesso, itens_status')
    .eq('empresa_id', perfil.empresa_id)
    .not('chave_acesso', 'is', null);
  const porChave = new Map((existentes || []).map(n => [n.chave_acesso as string, n]));

  let notasNovas = 0, notasComItens = 0, notasSemItensAindaTentativa = 0, falhas = 0;

  for (const notaHistorico of notasHistorico) {
    const chave = notaHistorico.chave_nfe;
    if (!chave) continue;
    try {
      let notaId: number;
      const jaExiste = porChave.get(chave);

      if (jaExiste) {
        if (jaExiste.itens_status !== 'sem_itens') continue; // já tem item ou já foi processada, nada a fazer
        notaId = jaExiste.id;
        notasSemItensAindaTentativa++;
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
        notasNovas++;
      }

      // Só dá pra baixar o XML completo depois de manifestar ciência — se a lista já
      // veio com manifestacao_destinatario preenchida, a nota já foi manifestada
      // (provavelmente pelo próprio webhook); senão manifesta agora.
      if (!notaHistorico.manifestacao_destinatario) {
        await manifestarCiencia(token, ambiente, chave);
      }
      const qtdItens = await capturarItensDaNota(db, notaId, perfil.empresa_id, token, ambiente, chave);
      if (qtdItens > 0) notasComItens++;
    } catch (err) {
      console.error('[pulse/fiscal/backfill] falha numa nota do histórico:', chave, err);
      falhas++;
    }
  }

  return NextResponse.json({
    ok: true,
    totalNoHistorico: notasHistorico.length,
    notasNovas,
    notasComItens,
    notasSemItensRetentadas: notasSemItensAindaTentativa,
    falhas,
  });
}
