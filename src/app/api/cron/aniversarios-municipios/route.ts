import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processarAlertasAniversario } from '@/lib/aniversariosAlertas';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

// GET — cron diário (ver vercel.json). Pra cada empresa com o módulo Demais FM Comercial,
// avisa (sino de notificações) quem atende cada cidade que o aniversário do município está
// chegando, respeitando o CLUSTER de cada vendedor (ver lib/aniversariosCluster). Cada faixa
// de antecedência (padrão 30/15/7 dias e no dia) dispara UMA vez por cidade e por ano —
// deduplicado pela chave da notificação, então rodar o cron de novo não repete aviso.
// A lógica fica em lib/aniversariosAlertas (a mesma do botão "Enviar alertas agora").
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const supabase = db();
  const { data: empresas, error } = await supabase.from('empresas').select('id, modulos');
  if (error) {
    console.error('[cron/aniversarios-municipios] empresas:', error.message);
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
  const comMidia = (empresas || []).filter(e => (e.modulos as Record<string, unknown> | null)?.midia);

  const diagnosticos = [];
  for (const empresa of comMidia) {
    const d = await processarAlertasAniversario(supabase, empresa, { simular: false });
    if (d.erros.length) console.error('[cron/aniversarios-municipios]', empresa.id, d.erros.join(' | '));
    diagnosticos.push({ empresa: empresa.id, cidadesNoPrazo: d.cidadesNoPrazo.length, notificacoesNovas: d.notificacoesNovas, jaAvisadas: d.jaAvisadas, erros: d.erros });
  }

  return NextResponse.json({
    ok: true, empresas: comMidia.length,
    notificacoesCriadas: diagnosticos.reduce((s, d) => s + d.notificacoesNovas, 0),
    diagnosticos,
  });
}
