import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buscarContratacoesPncp, filtrarPorPalavrasChave, formatarDataPncp } from '@/lib/pncp';

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

const MAX_PAGINAS = 5; // busca ao vivo dentro do request — conservador de propósito, sem rate-limit exposto pelo PNCP

// Busca ao vivo no PNCP (só preview — não grava nada). O usuário escolhe quais
// resultados salvar como candidato via /api/argus/pncp/salvar.
export async function POST(request: Request) {
  const auth = await verificarUsuario(request);
  if (!auth) return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

  const { uf, modalidade, palavras_chave, dias } = body;
  if (!modalidade) return NextResponse.json({ erro: 'Modalidade é obrigatória (a API do PNCP exige esse filtro).' }, { status: 422 });

  const hoje = new Date();
  const inicio = new Date(hoje);
  inicio.setDate(inicio.getDate() - Number(dias || 30));

  try {
    const encontrados: any[] = [];
    let pagina = 1;
    let paginasRestantes = 1;
    while (paginasRestantes > 0 && pagina <= MAX_PAGINAS) {
      const resultado = await buscarContratacoesPncp({
        dataInicial: formatarDataPncp(inicio),
        dataFinal: formatarDataPncp(hoje),
        modalidade: Number(modalidade),
        uf: uf || null,
        pagina,
        tamanhoPagina: 50,
      });
      encontrados.push(...resultado.data);
      paginasRestantes = resultado.paginasRestantes;
      pagina++;
    }

    const filtrados = filtrarPorPalavrasChave(encontrados, palavras_chave);
    return NextResponse.json({ resultados: filtrados, total_antes_do_filtro: encontrados.length });
  } catch (err: any) {
    console.error('[Argus PNCP buscar] Erro:', err);
    return NextResponse.json({ erro: err.message || 'Erro ao consultar o PNCP.' }, { status: 502 });
  }
}
