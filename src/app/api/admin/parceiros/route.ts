import { NextResponse } from 'next/server';
import { registrarAuditoria } from '@/lib/auditoria';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { reaplicarSplitCarteira } from '@/lib/cobrancaWegrow';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

async function verificarAdmin(request: Request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await supabaseAdmin().auth.getUser(token);
  if (!user || !ADMIN_EMAILS.includes(user.email || '')) return null;
  return user;
}

// GET — parceiros com os e-mails que acessam o portal e o tamanho da carteira de cada um.
export async function GET(request: Request) {
  if (!await verificarAdmin(request))
    return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  const db = supabaseAdmin();
  const [{ data: parceiros, error }, { data: usuarios }, { data: empresas }] = await Promise.all([
    db.from('parceiros').select('*').order('created_at'),
    db.from('parceiro_usuarios').select('parceiro_id, email').order('created_at'),
    db.from('empresas').select('id, status, modulos, parceiro_id').not('parceiro_id', 'is', null),
  ]);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  return NextResponse.json((parceiros || []).map(p => {
    const carteira = (empresas || []).filter(e => e.parceiro_id === p.id && !e.modulos?.demo);
    return {
      ...p,
      comissao_pct: Number(p.comissao_pct),
      usuarios: (usuarios || []).filter(u => u.parceiro_id === p.id).map(u => u.email),
      radios_ativas: carteira.filter(e => e.status === 'ativa').length,
      radios_teste: carteira.filter(e => e.status === 'trial').length,
    };
  }));
}

// POST { acao: 'criar', nome, comissao_pct }
//      { acao: 'atualizar', id, nome?, comissao_pct?, ativo?, logo_url?, asaas_wallet_id?, split_base?,
//                          marca_produto?, marca_slug?, marca_ativa? }
//      { acao: 'logo_marca', id, imagemBase64, extensao }   → logo do produto do parceiro (marca dupla)
//      { acao: 'add_usuario' | 'remover_usuario', id, email }
export async function POST(request: Request) {
  const admin = await verificarAdmin(request);
  if (!admin)
    return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }
  const db = supabaseAdmin();

  if (body.acao === 'criar') {
    if (!body.nome?.trim()) return NextResponse.json({ erro: 'Nome obrigatório.' }, { status: 422 });
    const { data, error } = await db.from('parceiros')
      .insert({ nome: body.nome.trim(), comissao_pct: Number(body.comissao_pct ?? 40) }).select().single();
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  }

  if (!body.id) return NextResponse.json({ erro: 'id obrigatório.' }, { status: 422 });

  if (body.acao === 'atualizar') {
    const patch: Record<string, any> = {};
    for (const campo of ['nome', 'comissao_pct', 'ativo', 'logo_url', 'asaas_wallet_id', 'split_base', 'marca_produto', 'marca_slug', 'marca_ativa']) if (campo in body) patch[campo] = body[campo];
    if ('asaas_wallet_id' in patch) patch.asaas_wallet_id = String(patch.asaas_wallet_id || '').trim() || null;
    if ('marca_produto' in patch) patch.marca_produto = String(patch.marca_produto || '').trim() || null;
    if ('marca_slug' in patch) {
      patch.marca_slug = String(patch.marca_slug || '').trim().toLowerCase() || null;
      if (patch.marca_slug && !/^[a-z0-9-]{2,40}$/.test(patch.marca_slug)) return NextResponse.json({ erro: 'O endereço só aceita letras minúsculas, números e hífen (ex.: manager).' }, { status: 422 });
    }
    if (patch.marca_ativa === true) {
      const { data: atual } = await db.from('parceiros').select('*').eq('id', body.id).maybeSingle();
      if (!(patch.marca_produto ?? atual?.marca_produto) || !(patch.marca_slug ?? atual?.marca_slug)) {
        return NextResponse.json({ erro: 'Preencha o nome do produto e o endereço antes de ligar a marca.' }, { status: 422 });
      }
    }
    if ('split_base' in patch && !['bruto', 'liquido'].includes(patch.split_base)) return NextResponse.json({ erro: 'Base do split inválida.' }, { status: 422 });
    if ('comissao_pct' in patch) {
      const pct = Number(patch.comissao_pct);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) return NextResponse.json({ erro: 'Comissão precisa estar entre 0 e 100%.' }, { status: 422 });
      patch.comissao_pct = pct;
    }
    const { error } = await db.from('parceiros').update(patch).eq('id', body.id);
    if (error) return NextResponse.json({ erro: error.code === '23505' ? 'Esse endereço já é usado por outro parceiro.' : error.message }, { status: 500 });
    await registrarAuditoria(db, { ator: admin.email, acao: 'parceiro.alterar', parceiroId: body.id, detalhe: patch });
    // Comissão, carteira, base ou pausa mudaram → as assinaturas da carteira passam a dividir do jeito novo
    if (['comissao_pct', 'asaas_wallet_id', 'split_base', 'ativo'].some(c => c in patch) && process.env.ASAAS_API_KEY) {
      const r = await reaplicarSplitCarteira(db, body.id);
      return NextResponse.json({ ok: true, assinaturas_atualizadas: r.atualizadas, erros: r.erros });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.acao === 'logo_marca') {
    const { imagemBase64, extensao } = body;
    if (!imagemBase64) return NextResponse.json({ erro: 'Imagem obrigatória.' }, { status: 422 });
    const buffer = Buffer.from(String(imagemBase64).replace(/^data:image\/[\w+.-]+;base64,/, ''), 'base64');
    if (buffer.length > 2 * 1024 * 1024) return NextResponse.json({ erro: 'Logo maior que 2 MB.' }, { status: 422 });
    const ext = String(extensao || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const path = `parceiros/${body.id}/${Date.now()}.${ext}`;
    const contentType = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    const { error: upErr } = await db.storage.from('empresa-logos').upload(path, buffer, { contentType, upsert: false });
    if (upErr) return NextResponse.json({ erro: upErr.message }, { status: 500 });
    const { data: urlData } = db.storage.from('empresa-logos').getPublicUrl(path);
    const { error } = await db.from('parceiros').update({ marca_logo_url: urlData.publicUrl }).eq('id', body.id);
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    await registrarAuditoria(db, { ator: admin.email, acao: 'parceiro.logo_marca', parceiroId: body.id });
    return NextResponse.json({ ok: true, logoUrl: urlData.publicUrl });
  }

  const email = String(body.email || '').trim().toLowerCase();
  if (!email.includes('@')) return NextResponse.json({ erro: 'E-mail inválido.' }, { status: 422 });

  if (body.acao === 'add_usuario') {
    const { error } = await db.from('parceiro_usuarios').upsert({ parceiro_id: body.id, email }, { onConflict: 'parceiro_id,email' });
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    await registrarAuditoria(db, { ator: admin.email, acao: 'parceiro.usuarios', parceiroId: body.id, detalhe: { adicionou: email } });
    return NextResponse.json({ ok: true });
  }

  if (body.acao === 'remover_usuario') {
    const { error } = await db.from('parceiro_usuarios').delete().eq('parceiro_id', body.id).eq('email', email);
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    await registrarAuditoria(db, { ator: admin.email, acao: 'parceiro.usuarios', parceiroId: body.id, detalhe: { removeu: email } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ erro: 'Ação inválida.' }, { status: 400 });
}
