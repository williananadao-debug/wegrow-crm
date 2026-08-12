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

async function verificarUsuario(request: Request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const db = supabaseAdmin();
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return null;
  const { data: perfil } = await db.from('profiles').select('empresa_id, cargo').eq('id', user.id).single();
  if (!perfil?.empresa_id) return null;
  return { user, empresa_id: perfil.empresa_id, cargo: perfil.cargo };
}

// Salva um resultado de busca do PNCP como candidato em argus_editais.
// Dedup por (empresa_id, numero_controle_pncp) via índice único da migration —
// upsert garante que buscar/salvar de novo o mesmo edital não duplica linha.
export async function POST(request: Request) {
  const auth = await verificarUsuario(request);
  if (!auth) return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });
  if (!['diretor', 'gerente'].includes(auth.cargo || '')) {
    return NextResponse.json({ erro: 'Só diretor/gerente pode salvar editais.' }, { status: 403 });
  }

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

  const item = body.item;
  if (!item?.numeroControlePNCP) return NextResponse.json({ erro: 'Item do PNCP inválido.' }, { status: 422 });

  const db = supabaseAdmin();
  const { data, error } = await db.from('argus_editais').upsert([{
    empresa_id: auth.empresa_id,
    origem: 'pncp',
    numero_controle_pncp: item.numeroControlePNCP,
    numero_processo: item.processo || null,
    orgao: item.orgaoEntidade?.razaoSocial || null,
    modalidade: item.modalidadeNome || null,
    objeto: item.objetoCompra || null,
    uf: item.unidadeOrgao?.ufSigla || null,
    municipio: item.unidadeOrgao?.municipioNome || null,
    status_interesse: 'candidato',
    estagio_processo: item.situacaoCompraNome || null,
    valor_estimado: item.valorTotalEstimado ?? null,
    valor_homologado: item.valorTotalHomologado ?? null,
    data_sessao: item.dataAberturaProposta || null,
    data_encerramento_proposta: item.dataEncerramentoProposta || null,
    link_pncp: item.linkProcessoEletronico || null,
    raw_payload: item,
    updated_at: new Date().toISOString(),
  }], { onConflict: 'empresa_id,numero_controle_pncp' }).select().single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
