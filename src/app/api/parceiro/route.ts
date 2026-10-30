import { NextResponse } from 'next/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin, criarEmpresaComDiretor, gerarLinkEntrarComo, resetarSenhaDiretor } from '@/lib/acessoEmpresa';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

type Parceiro = { id: string; nome: string; logo_url: string | null; comissao_pct: number };

// Quem chama é usuário de um parceiro (parceiro_usuarios.email) — ou admin da plataforma
// abrindo o portal de um parceiro específico (?parceiro_id=) pra ver o que eles veem.
async function parceiroDaRequisicao(request: Request, db: SupabaseClient): Promise<Parceiro | null> {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await db.auth.getUser(token);
  if (!user?.email) return null;

  const pedido = new URL(request.url).searchParams.get('parceiro_id');
  if (pedido && ADMIN_EMAILS.includes(user.email)) {
    const { data } = await db.from('parceiros').select('id, nome, logo_url, comissao_pct').eq('id', pedido).maybeSingle();
    return data as Parceiro | null;
  }

  const { data: vinculo } = await db.from('parceiro_usuarios')
    .select('parceiro:parceiro_id(id, nome, logo_url, comissao_pct, ativo)')
    .eq('email', user.email.toLowerCase()).limit(1).maybeSingle();
  const p = (vinculo as any)?.parceiro;
  if (!p || !p.ativo) return null;
  return { id: p.id, nome: p.nome, logo_url: p.logo_url, comissao_pct: Number(p.comissao_pct) };
}

// GET — carteira do parceiro: as rádios dele com uso (usuários ativos, leads, último acesso)
// e a mensalidade, pra calcular a comissão. Não devolve observação de faturamento (tem senha).
export async function GET(request: Request) {
  const db = supabaseAdmin();
  const parceiro = await parceiroDaRequisicao(request, db);
  if (!parceiro) return NextResponse.json({ erro: 'Acesso restrito a parceiros WeGrow.' }, { status: 403 });

  const { data: empresas } = await db.from('empresas')
    .select('id, nome, cnpj, plano, status, modulos, logo_url, cor_primaria, created_at, cancelado_em')
    .eq('parceiro_id', parceiro.id);
  const ids = (empresas || []).map(e => e.id);
  if (ids.length === 0) return NextResponse.json({ parceiro, empresas: [] });

  const ha7dias = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const [{ data: profiles }, { data: billings }, { data: leadsStats }, { data: authData }] = await Promise.all([
    db.from('profiles').select('id, nome, cargo, empresa_id').in('empresa_id', ids),
    db.from('clientes_wegrow').select('empresa_id, valor_mensal, proximo_vencimento, contato, whatsapp').in('empresa_id', ids),
    db.rpc('admin_leads_stats'),
    db.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const authMap = new Map((authData?.users || []).map(u => [u.id, u]));
  const billingMap = new Map((billings || []).map(b => [b.empresa_id, b]));
  const leadsMap = new Map<string, { total: number; mes: number }>(
    (leadsStats || []).map((s: any) => [s.empresa_id, { total: Number(s.leads_total), mes: Number(s.leads_mes) }])
  );

  const resultado = (empresas || []).map(e => {
    const equipe = (profiles || []).filter(p => p.empresa_id === e.id);
    const acessos = equipe.map(p => authMap.get(p.id)?.last_sign_in_at).filter(Boolean) as string[];
    const diretor = equipe.find(p => p.cargo === 'diretor') || equipe[0];
    const b = billingMap.get(e.id);
    const l = leadsMap.get(e.id);
    return {
      id: e.id,
      nome: e.nome,
      cnpj: e.cnpj,
      plano: e.plano,
      status: e.status,
      demo: !!e.modulos?.demo,
      logo_url: e.logo_url,
      cor_primaria: e.cor_primaria,
      created_at: e.created_at,
      cancelado_em: e.cancelado_em,
      total_usuarios: equipe.length,
      usuarios_ativos_7d: acessos.filter(a => new Date(a).getTime() >= ha7dias).length,
      ultimo_acesso: acessos.sort().at(-1) ?? null,
      leads_mes: l?.mes ?? 0,
      leads_total: l?.total ?? 0,
      diretor_nome: diretor?.nome ?? null,
      diretor_email: diretor ? authMap.get(diretor.id)?.email ?? null : null,
      valor_mensal: Number(b?.valor_mensal ?? 0),
      proximo_vencimento: b?.proximo_vencimento ?? null,
    };
  });

  return NextResponse.json({ parceiro, empresas: resultado });
}

// Anota a credencial gerada na observação de faturamento (só o God Mode lê) — a senha
// temporária só aparece uma vez na tela, isso garante que a WeGrow consiga recuperar.
async function anotarCredencial(db: SupabaseClient, empresaId: string, nota: string) {
  const { data: atual } = await db.from('clientes_wegrow').select('observacao').eq('empresa_id', empresaId).maybeSingle();
  const observacao = atual?.observacao ? `${atual.observacao}\n\n${nota}` : nota;
  await db.from('clientes_wegrow').upsert({ empresa_id: empresaId, observacao }, { onConflict: 'empresa_id' });
}

// POST { acao: 'criar', nome, cnpj, diretorNome, diretorEmail } — rádio nova em teste na carteira do parceiro
// POST { acao: 'entrar' | 'senha', empresa_id } — suporte: entrar como o diretor / gerar nova senha
export async function POST(request: Request) {
  const db = supabaseAdmin();
  const parceiro = await parceiroDaRequisicao(request, db);
  if (!parceiro) return NextResponse.json({ erro: 'Acesso restrito a parceiros WeGrow.' }, { status: 403 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }
  const hoje = new Date().toLocaleDateString('pt-BR');

  if (body.acao === 'criar') {
    const { nome, cnpj, diretorNome, diretorEmail } = body;
    if (!nome?.trim()) return NextResponse.json({ erro: 'Informe o nome da rádio.' }, { status: 422 });
    if (!diretorNome?.trim() || !diretorEmail?.trim()) return NextResponse.json({ erro: 'Nome e e-mail do responsável são obrigatórios.' }, { status: 422 });

    const r = await criarEmpresaComDiretor(db, {
      nome: nome.trim(), cnpj: cnpj?.trim() || null, status: 'trial',
      diretorNome: diretorNome.trim(), diretorEmail: diretorEmail.trim().toLowerCase(), parceiroId: parceiro.id,
    });
    if ('erro' in r) return NextResponse.json({ erro: r.erro }, { status: r.status });

    await db.from('empresas').update({ canal_origem: 'parceiro' }).eq('id', r.empresa.id);
    await anotarCredencial(db, r.empresa.id, `Criada pelo parceiro ${parceiro.nome} em ${hoje}. Login inicial: ${r.diretorEmail} · Senha temporária: ${r.senhaTemp}`);
    console.log(`[parceiro/criar] parceiro=${parceiro.nome} empresa=${r.empresa.id} nome=${nome}`);
    return NextResponse.json({ id: r.empresa.id, nome: r.empresa.nome, email: r.diretorEmail, senha: r.senhaTemp, emailErro: r.emailErro }, { status: 201 });
  }

  if (body.acao === 'entrar' || body.acao === 'senha') {
    const { empresa_id } = body;
    if (!empresa_id) return NextResponse.json({ erro: 'empresa_id obrigatório.' }, { status: 422 });
    const { data: emp } = await db.from('empresas').select('id, parceiro_id').eq('id', empresa_id).maybeSingle();
    if (!emp || emp.parceiro_id !== parceiro.id) return NextResponse.json({ erro: 'Essa rádio não está na sua carteira.' }, { status: 403 });

    if (body.acao === 'entrar') {
      const r = await gerarLinkEntrarComo(db, empresa_id);
      if ('erro' in r) return NextResponse.json({ erro: r.erro }, { status: r.status });
      console.log(`[parceiro/entrar-como] parceiro=${parceiro.nome} empresa=${empresa_id} email=${r.email}`);
      return NextResponse.json({ link: r.link });
    }

    const r = await resetarSenhaDiretor(db, empresa_id);
    if ('erro' in r) return NextResponse.json({ erro: r.erro }, { status: r.status });
    await anotarCredencial(db, empresa_id, `Senha resetada pelo parceiro ${parceiro.nome} em ${hoje}: ${r.email} · Nova senha: ${r.senha}`);
    console.log(`[parceiro/senha] parceiro=${parceiro.nome} empresa=${empresa_id}`);
    return NextResponse.json({ email: r.email, senha: r.senha });
  }

  return NextResponse.json({ erro: 'Ação inválida.' }, { status: 400 });
}
