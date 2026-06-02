import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('token') !== process.env.TOKEN_INTEGRACAO_OPEC) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [
    { data: empresas },
    { data: profiles },
    { data: leads },
    { data: visitas },
    { data: jobs },
    { data: clientes },
    { data: lancamentos },
  ] = await Promise.all([
    admin.from('empresas').select('id, nome, created_at, modulos'),
    admin.from('profiles').select('id, nome, cargo, empresa_id, created_at'),
    admin.from('leads').select('id, empresa, etapa, status, valor_total, desconto, created_at, user_id, empresa_id, unidade, tipo, origem'),
    admin.from('visitas').select('id, empresa, user_id, created_at, localizacao_url, empresa_id'),
    admin.from('jobs').select('id, titulo, stage, prioridade, created_at, empresa_id, cliente'),
    admin.from('clientes').select('id, nome_empresa, status, created_at, empresa_id, status_risco'),
    admin.from('lancamentos').select('id, titulo, valor, tipo, status, created_at, empresa_id'),
  ]);

  return NextResponse.json({ empresas, profiles, leads, visitas, jobs, clientes, lancamentos });
}
