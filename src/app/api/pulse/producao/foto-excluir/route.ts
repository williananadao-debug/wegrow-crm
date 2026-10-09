import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// POST { eventoId } — apaga a foto de um evento da produção (e o arquivo no storage).
// Quem pode: diretor/gerente (qualquer foto) ou quem enviou, enquanto ela não foi aprovada
// pro cliente. Evento só de foto ("anexo") some inteiro; em etapa/comentário sai só a foto e
// o registro do texto continua na linha do tempo.
export async function POST(req: Request) {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 });
  const { data: perfil } = await db.from('profiles').select('empresa_id, cargo').eq('id', user.id).maybeSingle();
  if (!perfil?.empresa_id) return NextResponse.json({ error: 'Empresa não identificada.' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const eventoId = Number(body?.eventoId);
  if (!Number.isInteger(eventoId) || eventoId <= 0) return NextResponse.json({ error: 'Foto inválida.' }, { status: 400 });

  const { data: evento } = await db.from('pulse_producao_eventos').select('*').eq('id', eventoId).maybeSingle();
  if (!evento?.foto_url) return NextResponse.json({ error: 'Foto não encontrada.' }, { status: 404 });
  const { data: prod } = await db.from('pulse_producoes').select('id').eq('id', evento.producao_id).eq('empresa_id', perfil.empresa_id).maybeSingle();
  if (!prod) return NextResponse.json({ error: 'Foto não encontrada.' }, { status: 404 });

  const gestao = ['diretor', 'gerente'].includes(perfil.cargo);
  const autorPendente = evento.user_id === user.id && evento.foto_status !== 'aprovada';
  if (!gestao && !autorPendente) {
    return NextResponse.json({ error: evento.user_id === user.id ? 'Foto já aprovada pro cliente — só a gestão pode apagar.' : 'Só a gestão ou quem enviou a foto pode apagar.' }, { status: 403 });
  }

  const { error } = evento.tipo === 'anexo'
    ? await db.from('pulse_producao_eventos').delete().eq('id', eventoId)
    : await db.from('pulse_producao_eventos').update({ foto_url: null }).eq('id', eventoId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Arquivo no bucket público "produtos": .../storage/v1/object/public/produtos/<path>
  const marcador = '/storage/v1/object/public/produtos/';
  const pos = String(evento.foto_url).indexOf(marcador);
  if (pos >= 0) {
    const path = decodeURIComponent(String(evento.foto_url).slice(pos + marcador.length).split('?')[0]);
    await db.storage.from('produtos').remove([path]).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
