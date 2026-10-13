import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { hojeLocal } from '@/lib/vencimentosFinanceiros';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// A partir de quantos dias "aguardando início" a etapa vira alerta (mesmo corte do vermelho no card).
const DIAS_ALERTA = 3;

// Aviso diário (sino) de produção parada: etapa aguardando "Iniciar" há DIAS_ALERTA+ dias, desde a
// conclusão da etapa anterior (ou desde a criação). Vai pra diretoria/gerência de toda empresa com
// o Pulse ativo — uma notificação por pessoa por dia (chave prod-parada:<data>), só se houver algo.
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  }
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const hoje = hojeLocal();
  const agora = Date.now();
  const resultado = { empresas: 0, paradas: 0, avisos: 0, erros: [] as string[] };

  const { data: empresas, error } = await db.from('empresas').select('id, nome, modulos');
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  const comPulse = (empresas || []).filter(e => (e.modulos as Record<string, unknown> | null)?.pulse);

  for (const emp of comPulse) {
    resultado.empresas++;
    try {
      const etapas: string[] = (((emp.modulos as Record<string, unknown>)?.pulse_etapas_fabricacao as unknown[]) || [])
        .map(e => (typeof e === 'string' ? e : (e as { nome?: string })?.nome || '')).filter(Boolean);
      // '*' traz etapa_iniciada_em só se a migration rodou — sem a coluna, nada é tratado como parado.
      const { data: prods } = await db.from('pulse_producoes').select('*').eq('empresa_id', emp.id).eq('status', 'em_producao');
      const aguardando = (prods || []).filter(p => 'etapa_iniciada_em' in p && p.etapa_iniciada_em === null);
      if (aguardando.length === 0) continue;

      const { data: eventos } = await db.from('pulse_producao_eventos').select('producao_id, created_at')
        .in('producao_id', aguardando.map(p => p.id)).eq('tipo', 'etapa').order('created_at', { ascending: true });
      const ultimaConclusao: Record<number, string> = {};
      (eventos || []).forEach(e => { ultimaConclusao[e.producao_id] = e.created_at; });

      const paradas = aguardando
        .map(p => ({
          pedido: p.lead_id ? `LD-${String(p.lead_id).padStart(4, '0')}` : p.produto_final_nome,
          etapa: etapas[p.etapa_fabricacao_idx] || `etapa ${Number(p.etapa_fabricacao_idx) + 1}`,
          dias: Math.floor((agora - new Date(ultimaConclusao[p.id] || p.created_at).getTime()) / 86400000),
        }))
        .filter(p => p.dias >= DIAS_ALERTA)
        .sort((a, b) => b.dias - a.dias);
      if (paradas.length === 0) continue;
      resultado.paradas += paradas.length;

      const titulo = `🏭 Produção: ${paradas.length} etapa${paradas.length > 1 ? 's' : ''} parada${paradas.length > 1 ? 's' : ''} aguardando início`;
      const lista = paradas.slice(0, 6).map(p => `${p.pedido} (${p.etapa}) há ${p.dias} dias`).join('; ');
      const mensagem = `${lista}${paradas.length > 6 ? ` e mais ${paradas.length - 6}` : ''}. Peça pra fábrica clicar em "Iniciar" na tela de Produção.`;

      const { data: gestores } = await db.from('profiles').select('*').eq('empresa_id', emp.id).in('cargo', ['diretor', 'gerente']);
      const destinatarios = (gestores || []).filter((g: { desativado_em?: string | null }) => !g.desativado_em);
      if (destinatarios.length === 0) continue;
      const { data: inseridas, error: erroIns } = await db.from('notifications').upsert(
        destinatarios.map((g: { id: string }) => ({ user_id: g.id, titulo, mensagem, lida: false, chave: `prod-parada:${hoje}` })),
        { onConflict: 'user_id,chave', ignoreDuplicates: true },
      ).select('id');
      if (erroIns) resultado.erros.push(`${emp.nome}: ${erroIns.message}`);
      else resultado.avisos += inseridas?.length || 0;
    } catch (e) {
      resultado.erros.push(`${emp.nome}: ${e instanceof Error ? e.message : 'erro'}`);
    }
  }
  return NextResponse.json({ ok: true, hoje, ...resultado });
}
