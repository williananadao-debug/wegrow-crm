import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { FocusNfeAmbiente } from '@/lib/focusNfe';
import { processarBackfillSaida } from '@/lib/focusNfeBackupSaida';

export const dynamic = 'force-dynamic';
export const maxDuration = 280;

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// POST — puxa o histórico de NF-e de SAÍDA (emitidas pela própria empresa) via backup
// mensal do Focus NFe — não existe endpoint de "listar minhas notas emitidas", então isso
// é o único jeito de trazer nota antiga pro sistema (webhook só pega daqui pra frente, ver
// /api/webhooks/focus-nfe/emitida). Espelha /api/pulse/fiscal/backfill (entrada), mesma
// autenticação e alçada.
export async function POST(req: NextRequest) {
  const db = supabaseAdmin();

  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!accessToken) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const { data: { user }, error: authError } = await db.auth.getUser(accessToken);
  if (authError || !user) return NextResponse.json({ error: 'Token inválido.' }, { status: 401 });

  const { data: perfil } = await db.from('profiles').select('empresa_id, cargo').eq('id', user.id).single();
  if (!perfil?.empresa_id) return NextResponse.json({ error: 'Empresa não identificada.' }, { status: 400 });
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
    const resultado = await processarBackfillSaida({
      db, empresaId: perfil.empresa_id, cnpjEmpresa: empresa.cnpj, token, ambiente,
    });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha ao consultar o histórico de saída no Focus NFe.';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
