import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';

export const dynamic = 'force-dynamic';

// Público (tela de login): marca dupla de um parceiro pelo slug — /entrar/manager mostra
// "WeGrow for Manager". Só devolve nome e logo, e só de marca ativa.
export async function GET(request: Request) {
  const slug = (new URL(request.url).searchParams.get('slug') || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) return NextResponse.json({ marca: null });
  const { data, error } = await supabaseAdmin().from('parceiros').select('*').eq('marca_slug', slug).limit(1).maybeSingle();
  if (error || !data?.marca_ativa || !data.ativo) return NextResponse.json({ marca: null });
  return NextResponse.json(
    { marca: { slug: data.marca_slug, produto: data.marca_produto, logo_url: data.marca_logo_url, parceiro: data.nome } },
    { headers: { 'Cache-Control': 'public, max-age=300' } },
  );
}
