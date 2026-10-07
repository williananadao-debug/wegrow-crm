import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processarAlertasAniversario } from '@/lib/aniversariosAlertas';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST — botão da aba Aniversários (só diretor). { simular: true } mostra quem receberia cada
// alerta hoje e qualquer problema; { simular: false } envia agora (mesmo envio do cron diário,
// com a mesma deduplicação — clicar de novo não repete aviso).
export async function POST(req: Request) {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return NextResponse.json({ erro: 'Sessão inválida.' }, { status: 401 });
  const { data: perfil } = await db.from('profiles').select('empresa_id, cargo').eq('id', user.id).maybeSingle();
  if (!perfil?.empresa_id || perfil.cargo !== 'diretor') return NextResponse.json({ erro: 'Só diretor pode verificar ou enviar os alertas.' }, { status: 403 });

  const { data: empresa } = await db.from('empresas').select('id, modulos').eq('id', perfil.empresa_id).maybeSingle();
  if (!empresa || !(empresa.modulos as Record<string, unknown> | null)?.midia) {
    return NextResponse.json({ erro: 'Módulo Demais FM Comercial não está ativo.' }, { status: 403 });
  }

  let simular = true;
  try { simular = (await req.json())?.simular !== false; } catch { /* padrão: simular */ }
  const diagnostico = await processarAlertasAniversario(db, empresa, { simular });
  return NextResponse.json({ simulacao: simular, diagnostico });
}
