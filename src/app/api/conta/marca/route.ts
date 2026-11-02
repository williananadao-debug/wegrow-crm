import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';

export const dynamic = 'force-dynamic';

// Marca dupla da empresa de quem está logado: empresa da carteira de um parceiro com marca
// ativa → { produto: 'Manager', logo_url, slug }. Lida pelo selo do menu (components/SeloMarca).
export async function GET(request: Request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ marca: null });
  const db = supabaseAdmin();
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return NextResponse.json({ marca: null });

  const { data: perfil } = await db.from('profiles').select('empresa_id').eq('id', user.id).maybeSingle();
  if (!perfil?.empresa_id) return NextResponse.json({ marca: null });
  const { data: empresa } = await db.from('empresas').select('parceiro_id').eq('id', perfil.empresa_id).maybeSingle();
  if (!empresa?.parceiro_id) return NextResponse.json({ marca: null });
  const { data: p, error } = await db.from('parceiros').select('*').eq('id', empresa.parceiro_id).maybeSingle();
  if (error || !p?.marca_ativa || !p.ativo) return NextResponse.json({ marca: null });
  return NextResponse.json({ marca: { slug: p.marca_slug, produto: p.marca_produto, logo_url: p.marca_logo_url, parceiro: p.nome } });
}
