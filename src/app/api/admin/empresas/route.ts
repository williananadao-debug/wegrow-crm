import { NextResponse } from 'next/server';
import { supabaseAdmin, criarEmpresaComDiretor } from '@/lib/acessoEmpresa';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

async function verificarAdmin(request: Request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await supabaseAdmin().auth.getUser(token);
  if (!user || !ADMIN_EMAILS.includes(user.email || '')) return null;
  return user;
}

// GET — lista todos os tenants reais (de profiles) mesclados com metadados de empresas
export async function GET(request: Request) {
  if (!await verificarAdmin(request))
    return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  const db = supabaseAdmin();

  const [{ data: profiles, error: errProfiles }, { data: empresasData, error: errEmpresas }] = await Promise.all([
    db.from('profiles').select('empresa_id, nome, cargo, email').not('empresa_id', 'is', null),
    db.from('empresas').select('*'),
  ]);

  if (errProfiles) console.error('[admin/empresas] profiles error:', errProfiles);
  if (errEmpresas) console.error('[admin/empresas] empresas error:', errEmpresas);

  // Agrupa por empresa_id — fonte da verdade são os profiles
  const tenantMap = new Map<string, { diretor: string; total: number }>();
  for (const p of profiles || []) {
    if (!p.empresa_id) continue;
    const atual = tenantMap.get(p.empresa_id) || { diretor: '', total: 0 };
    atual.total++;
    if (p.cargo === 'diretor' && !atual.diretor) atual.diretor = p.nome || p.email || '';
    tenantMap.set(p.empresa_id, atual);
  }

  const empMap = new Map((empresasData || []).map(e => [e.id, e]));

  const resultado = Array.from(tenantMap.entries()).map(([id, t]) => {
    const emp = empMap.get(id);
    return {
      id,
      nome: emp?.nome || t.diretor || id,
      cnpj: emp?.cnpj || null,
      plano: emp?.plano || 'essencial',
      status: emp?.status || 'trial',
      modulos: emp?.modulos || {},
      logo_url: emp?.logo_url || null,
      cor_primaria: emp?.cor_primaria || null,
      created_at: emp?.created_at || null,
      canal_origem: emp?.canal_origem || null,
      parceiro_id: emp?.parceiro_id || null,
      cancelado_em: emp?.cancelado_em || null,
      total_usuarios: t.total,
      configurado: !!emp,
    };
  });

  return NextResponse.json(resultado);
}

// POST — cria empresa nova + primeiro diretor (lógica em lib/acessoEmpresa, compartilhada
// com o Portal do Parceiro). Diretor obrigatório: sem um profile a empresa nunca aparece
// na lista deste admin (GET acima monta a partir de profiles).
export async function POST(request: Request) {
  if (!await verificarAdmin(request))
    return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

  const { nome, cnpj, plano, status, modulos, diretorNome, diretorEmail, parceiro_id } = body;
  if (!nome) return NextResponse.json({ erro: 'Nome obrigatório.' }, { status: 422 });
  if (!diretorNome || !diretorEmail) {
    return NextResponse.json({ erro: 'Nome e e-mail do diretor são obrigatórios — sem um usuário, a empresa não aparece em lugar nenhum do admin.' }, { status: 422 });
  }

  const r = await criarEmpresaComDiretor(supabaseAdmin(), { nome, cnpj, plano, status, modulos, diretorNome, diretorEmail, parceiroId: parceiro_id || null });
  if ('erro' in r) return NextResponse.json({ erro: r.erro, ...(r.empresa ? { empresa: r.empresa } : {}) }, { status: r.status });
  return NextResponse.json({ ...r.empresa, diretorEmail: r.diretorEmail, senhaTemp: r.senhaTemp, emailErro: r.emailErro }, { status: 201 });
}

// PATCH — upsert por id (cria registro na tabela empresas se ainda não existir para esse tenant)
export async function PATCH(request: Request) {
  if (!await verificarAdmin(request))
    return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

  const { id, ...campos } = body;
  if (!id) return NextResponse.json({ erro: 'ID obrigatório.' }, { status: 422 });

  // Upsert direto via service role (ignora RLS), não mais a RPC admin_upsert_empresa —
  // ela só existia no banco, não versionada em migration nenhuma, e nome/plano/status às
  // vezes não salvavam sem erro nenhum aparecer (bug opaco, impossível de debugar sem ver
  // o corpo da função). Só entra no patch a chave que realmente veio no corpo, pra nunca
  // zerar um campo que o chamador não mandou (ex: AbaGeral não manda cnpj).
  const CAMPOS_PERMITIDOS = ['nome', 'cnpj', 'plano', 'status', 'modulos', 'canal_origem', 'cancelado_em', 'cor_primaria', 'parceiro_id'];
  const patch: Record<string, any> = {};
  for (const campo of CAMPOS_PERMITIDOS) {
    if (campo in campos) patch[campo] = campos[campo] ?? null;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true });

  const db = supabaseAdmin();
  const { data: existente } = await db.from('empresas').select('id').eq('id', id).maybeSingle();

  if (existente) {
    // Caso comum: linha já existe — UPDATE simples, só toca nas colunas que vieram no
    // corpo. Nunca passa pelo caminho de INSERT do upsert, então nunca esbarra em NOT
    // NULL de coluna que essa chamada específica não mandou (ex: "nome" quando só se quis
    // trocar "modulos").
    const { data, error } = await db.from('empresas').update(patch).eq('id', id).select().single();
    if (error) {
      console.error('[admin/empresas] PATCH (update) error:', error);
      return NextResponse.json({ erro: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  }

  // Linha ainda não existe (profile com empresa_id órfão, sem registro em "empresas" —
  // cenário que a antiga RPC também cobria). Aqui sim é INSERT de verdade, então precisa
  // de nome — sem ele o banco rejeita (NOT NULL), e sem esse aviso o erro cru do Postgres
  // não deixa claro o motivo.
  if (!patch.nome) {
    return NextResponse.json({ erro: 'Essa empresa ainda não tem registro criado — informe o nome antes de editar outro campo (abre a aba Geral e salva o nome primeiro).' }, { status: 422 });
  }
  const { data, error } = await db.from('empresas').insert({
    id,
    nome: patch.nome,
    cnpj: patch.cnpj ?? null,
    plano: patch.plano ?? 'essencial',
    status: patch.status ?? 'trial',
    modulos: patch.modulos ?? {},
    ...('canal_origem' in patch ? { canal_origem: patch.canal_origem } : {}),
    ...('cancelado_em' in patch ? { cancelado_em: patch.cancelado_em } : {}),
  }).select().single();

  if (error) {
    console.error('[admin/empresas] PATCH (insert) error:', error);
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
