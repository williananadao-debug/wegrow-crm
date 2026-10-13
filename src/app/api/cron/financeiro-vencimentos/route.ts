import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resumirVencimentos, temAlgo, textoLado, hojeLocal, DIAS_AVISO_VENCIMENTO } from '@/lib/vencimentosFinanceiros';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Aviso diário (sino) de contas vencidas e vencendo nos próximos dias — pra diretoria de toda
// empresa com o módulo Financeiro ativo. Uma notificação por pessoa por dia (chave fin:<data>),
// só quando há algo a avisar. Contas a pagar/receber (lancamentos) + boletos das vendas.
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  }
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const hoje = hojeLocal();
  const resultado = { empresas: 0, avisos: 0, erros: [] as string[] };

  const { data: empresas, error } = await db.from('empresas').select('id, nome, modulos');
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  const comFinanceiro = (empresas || []).filter(e => (e.modulos as Record<string, unknown> | null)?.financeiro);

  for (const emp of comFinanceiro) {
    resultado.empresas++;
    try {
      const [lanc, leads, diretores] = await Promise.all([
        db.from('lancamentos').select('tipo, valor, status, data_vencimento').eq('empresa_id', emp.id).neq('status', 'pago'),
        db.from('leads').select('cobrancas_manuais').eq('empresa_id', emp.id).eq('status', 'ganho').not('cobrancas_manuais', 'is', null).limit(1000),
        db.from('profiles').select('*').eq('empresa_id', emp.id).eq('cargo', 'diretor'),
      ]);
      const cobrancas = (leads.data || []).flatMap(l => (Array.isArray(l.cobrancas_manuais) ? l.cobrancas_manuais : []));
      const resumo = resumirVencimentos({
        pagar: (lanc.data || []).filter(l => l.tipo === 'saida'),
        receber: (lanc.data || []).filter(l => l.tipo === 'entrada'),
        cobrancas, hoje,
      });
      if (!temAlgo(resumo)) continue;

      const vencidas = resumo.pagar.vencidas.qtd + resumo.receber.vencidas.qtd;
      const titulo = vencidas
        ? `💰 Financeiro: ${vencidas} conta${vencidas > 1 ? 's' : ''} vencida${vencidas > 1 ? 's' : ''}`
        : `💰 Financeiro: contas vencendo nos próximos ${DIAS_AVISO_VENCIMENTO} dias`;
      const linhas = [
        textoLado(resumo.pagar) && `A pagar: ${textoLado(resumo.pagar)}.`,
        textoLado(resumo.receber) && `A receber: ${textoLado(resumo.receber)}.`,
      ].filter(Boolean).join(' ');

      // Desativado não recebe aviso (coluna pode não existir ainda — '*' acima).
      const destinatarios = (diretores.data || []).filter((p: { desativado_em?: string | null }) => !p.desativado_em);
      if (destinatarios.length === 0) continue;
      const { data: inseridas, error: erroIns } = await db.from('notifications').upsert(
        destinatarios.map((p: { id: string }) => ({ user_id: p.id, titulo, mensagem: `${linhas} Veja em Financeiro.`, lida: false, chave: `fin:${hoje}` })),
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
