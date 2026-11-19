import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { COOKIE_APP, obterSessaoApp, opcoesCookie } from '@/lib/rastreioApp';

export const dynamic = 'force-dynamic';

const COLS = 'id, placa, descricao, tipo, tem_bloqueio, bloqueado, ultima_lat, ultima_lng, ultima_velocidade, ultimo_curso, ignicao, bateria_externa, ultima_posicao_em, ultima_comunicacao_em';

// Tudo que a tela inicial do app precisa: marca do instalador, cliente, veículos e alertas.
export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  const cookie = req.cookies.get(COOKIE_APP)?.value;
  const s = await obterSessaoApp(db, cookie);
  if (!s) return NextResponse.json({ error: 'sem_sessao' }, { status: 401 });

  const [{ data: empresa }, { data: cliente }, { data: veiculos }] = await Promise.all([
    db.from('empresas').select('nome, logo_url, cor_primaria').eq('id', s.empresaId).maybeSingle(),
    db.from('rastreio_clientes').select('nome, status, app_pin_hash').eq('id', s.clienteId).maybeSingle(),
    db.from('rastreio_veiculos').select(COLS).eq('cliente_id', s.clienteId).eq('empresa_id', s.empresaId).eq('status', 'ativo').order('placa'),
  ]);
  const ids = (veiculos || []).map(v => v.id);
  const { data: alertas } = ids.length
    ? await db.from('rastreio_eventos').select('id, veiculo_id, tipo, mensagem, lat, lng, ocorrido_em')
        .in('veiculo_id', ids).neq('tipo', 'online').order('ocorrido_em', { ascending: false }).limit(30)
    : { data: [] };

  // Mensalidades em aberto (para o botão "Pagar"): vencidas e a que vence nos próximos 10 dias.
  const limite = new Date(Date.now() + 10 * 86400_000).toISOString().slice(0, 10);
  const { data: cobrancas } = await db.from('rastreio_cobrancas').select('id, valor, vencimento, status, invoice_url')
    .eq('cliente_id', s.clienteId).in('status', ['PENDING', 'OVERDUE']).lte('vencimento', limite).order('vencimento').limit(3);

  const r = NextResponse.json({
    empresa: { nome: empresa?.nome || 'Rastreamento', logo: empresa?.logo_url || null, cor: empresa?.cor_primaria || '#38BDF8' },
    cliente: { nome: cliente?.nome || '', suspenso: cliente?.status === 'suspenso', temPin: Boolean(cliente?.app_pin_hash) },
    veiculos: veiculos || [],
    alertas: alertas || [],
    cobrancas: cobrancas || [],
  });
  if (cookie) r.cookies.set(COOKIE_APP, cookie, opcoesCookie()); // empurra o vencimento do cookie
  return r;
}
