import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { asaasWegrow, ambienteAsaasWegrow, carregarConfigNf, emitirNfWegrow, sincronizarNfWegrow, sincronizarPendentesNfWegrow } from '@/lib/nfWegrow';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

async function verificarAdmin(request: Request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await supabaseAdmin().auth.getUser(token);
  if (!user || !ADMIN_EMAILS.includes(user.email || '')) return null;
  return user;
}

// GET — modelo da nota, situação fiscal da conta Asaas da WeGrow e as notas emitidas.
// Aproveita pra puxar do Asaas o andamento das notas que ainda estão processando.
export async function GET(request: Request) {
  if (!await verificarAdmin(request)) return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });
  const db = supabaseAdmin();

  await sincronizarPendentesNfWegrow(db).catch(err => console.error('[admin/nota-fiscal] sync', err));

  let fiscal: { configurado: boolean; detalhe?: string; dados?: any } = { configurado: false };
  try {
    const info = await asaasWegrow('GET', '/fiscalInfo/');
    fiscal = { configurado: !!info?.municipalInscription || !!info?.email || !!info?.simplesNacional, dados: { email: info?.email, simplesNacional: info?.simplesNacional, inscricaoMunicipal: info?.municipalInscription } };
  } catch (err: any) {
    fiscal = { configurado: false, detalhe: err.message };
  }

  const [config, { data: notas }, { data: empresas }] = await Promise.all([
    carregarConfigNf(db),
    db.from('wegrow_notas_fiscais').select('*').order('created_at', { ascending: false }).limit(100),
    db.from('empresas').select('id, nome, logo_url'),
  ]);
  const nomes = new Map((empresas || []).map(e => [e.id, e]));

  return NextResponse.json({
    config,
    fiscal,
    ambiente: ambienteAsaasWegrow(),
    notas: (notas || []).map(n => ({ ...n, empresa_nome: nomes.get(n.empresa_id)?.nome || '—', empresa_logo: nomes.get(n.empresa_id)?.logo_url || null })),
  });
}

// POST { acao: 'salvar', ...campos }       — modelo da nota
//      { acao: 'servicos', q }              — busca o serviço municipal na lista do Asaas
//      { acao: 'emitir', empresa_id, competencia? }
//      { acao: 'sincronizar' | 'reenviar', id }
export async function POST(request: Request) {
  if (!await verificarAdmin(request)) return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }
  const db = supabaseAdmin();

  if (body.acao === 'salvar') {
    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const c of ['ativo', 'municipal_service_id', 'municipal_service_code', 'municipal_service_name', 'descricao', 'observacoes', 'iss', 'retain_iss', 'enviar_email']) {
      if (c in body) patch[c] = body[c];
    }
    if ('descricao' in patch && !String(patch.descricao || '').trim()) return NextResponse.json({ erro: 'A descrição do serviço não pode ficar vazia.' }, { status: 422 });
    const { error } = await db.from('wegrow_nfse_config').update(patch).eq('id', 1);
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.acao === 'servicos') {
    try {
      const r = await asaasWegrow('GET', `/invoices/municipalServices?description=${encodeURIComponent(body.q || '')}`);
      return NextResponse.json({ servicos: (r.data || []).map((s: any) => ({ id: s.id, codigo: s.code ?? s.codigo ?? '', nome: s.description ?? s.name ?? '' })) });
    } catch (err: any) {
      return NextResponse.json({ erro: 'Asaas: ' + err.message }, { status: 502 });
    }
  }

  if (body.acao === 'emitir') {
    if (!body.empresa_id) return NextResponse.json({ erro: 'empresa_id obrigatório.' }, { status: 422 });
    const r = await emitirNfWegrow(db, { empresaId: body.empresa_id, competencia: body.competencia, origem: body.origem === 'pagamento_recebido' ? 'pagamento_recebido' : 'manual' });
    if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 422 });
    return NextResponse.json({ ok: true, nota: r.nota, jaExistia: !!r.jaExistia });
  }

  if (body.acao === 'sincronizar' || body.acao === 'reenviar') {
    const { data: nota } = await db.from('wegrow_notas_fiscais').select('*').eq('id', body.id).maybeSingle();
    if (!nota?.asaas_invoice_id) return NextResponse.json({ erro: 'Nota não encontrada no Asaas.' }, { status: 404 });
    if (body.acao === 'reenviar') {
      const { data: billing } = await db.from('clientes_wegrow').select('email_financeiro, contrato_signer_email').eq('empresa_id', nota.empresa_id).maybeSingle();
      const para = billing?.email_financeiro || billing?.contrato_signer_email || nota.email_para;
      await db.from('wegrow_notas_fiscais').update({ email_enviado_em: null, email_para: para }).eq('id', nota.id);
      nota.email_enviado_em = null; nota.email_para = para;
    }
    try {
      const atualizada = await sincronizarNfWegrow(db, nota);
      return NextResponse.json({ ok: true, nota: atualizada });
    } catch (err: any) {
      return NextResponse.json({ erro: 'Asaas: ' + err.message }, { status: 502 });
    }
  }

  return NextResponse.json({ erro: 'Ação inválida.' }, { status: 400 });
}
