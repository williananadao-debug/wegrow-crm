import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buscarRedesSociais } from '@/lib/demais-fm-api';

export const dynamic = 'force-dynamic';

// Endpoint ainda não existe no backend do Leo — enquanto isso, retorna 501 e o front cai
// pro valor manual (midia_metricas_mensais.redes_sociais_*) sem quebrar nada. Assim que o
// Leo subir o /redes-sociais real, isso liga sozinho.

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function verificarUsuario(request: Request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const db = supabaseAdmin();
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return null;
  const { data: perfil } = await db.from('profiles').select('empresa_id').eq('id', user.id).single();
  if (!perfil?.empresa_id) return null;
  return { user, empresa_id: perfil.empresa_id };
}

export async function GET(request: Request) {
  if (!process.env.DEMAIS_FM_API_BASE_URL || !process.env.DEMAIS_FM_API_KEY) {
    return NextResponse.json({ erro: 'DEMAIS_FM_API_BASE_URL/DEMAIS_FM_API_KEY não configuradas no servidor.' }, { status: 503 });
  }

  const auth = await verificarUsuario(request);
  if (!auth) return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  try {
    const dados = await buscarRedesSociais();
    return NextResponse.json(dados);
  } catch (err: any) {
    return NextResponse.json({ erro: `Endpoint de redes sociais ainda não disponível na API Demais FM: ${err.message}` }, { status: 501 });
  }
}
