import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { montarPacotesOpec } from '@/lib/opecPacotes';
import { validarPacotes } from '@/lib/opecValidacao';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

// GET — roda a MESMA montagem que a OPEC recebe em /api/opec (sem precisar do token de
// integração) e valida o resultado contra o gabarito. Só admin WeGrow.
export async function GET(request: Request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  const { data: { user } } = token ? await db().auth.getUser(token) : { data: { user: null } };
  if (!user || !ADMIN_EMAILS.includes(user.email || '')) return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  const sp = new URL(request.url).searchParams;
  const empresa = sp.get('empresa');
  if (!empresa || !UUID_REGEX.test(empresa)) return NextResponse.json({ erro: 'Informe a empresa (UUID).' }, { status: 400 });

  try {
    const pacotes = await montarPacotesOpec(db(), {
      codigoEmissora: empresa, status: sp.get('status') || 'entregue',
      dataInicial: sp.get('data_inicial'), dataFinal: sp.get('data_final'),
      idJob: sp.get('id'), numeroContrato: sp.get('numero_contrato'),
    });
    const { resumo, contratos } = validarPacotes(pacotes);
    return NextResponse.json({ resumo, contratos, pacotes });
  } catch (e: any) {
    console.error('[admin/opec-validacao]', e);
    return NextResponse.json({ erro: e?.message || 'Erro ao montar os pacotes.' }, { status: 500 });
  }
}
