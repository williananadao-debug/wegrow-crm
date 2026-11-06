import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';

export const dynamic = 'force-dynamic';

// Pendência da mensalidade WeGrow da empresa de quem está logado: acesso suspenso pela régua
// de cobrança e/ou mensalidade em atraso (com o link pra pagar). Lida pelo aviso/tela de
// pendência do app (components/PendenciaCobranca). Sem pendência (ou antes da migration
// 20261102100000 rodar) devolve tudo vazio — nunca bloqueia por erro.
// Também avisa quando a empresa é demo com validade vencida (modulos.demo_expira_em, YYYY-MM-DD,
// definida em /admin/demos): a demo vale até o fim desse dia, no horário de Brasília.
export async function GET(request: Request) {
  const vazio = { bloqueado: false, atraso: null, demoExpirada: false };
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json(vazio);
  const db = supabaseAdmin();
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return NextResponse.json(vazio);

  const { data: perfil } = await db.from('profiles').select('empresa_id').eq('id', user.id).maybeSingle();
  if (!perfil?.empresa_id) return NextResponse.json(vazio);

  const [{ data: empresa, error: e1 }, { data: abertos, error: e2 }] = await Promise.all([
    db.from('empresas').select('bloqueio_cobranca_em, modulos').eq('id', perfil.empresa_id).maybeSingle(),
    db.from('wegrow_pagamentos').select('valor, vencimento, invoice_url').eq('empresa_id', perfil.empresa_id).eq('status', 'OVERDUE').order('vencimento').limit(5),
  ]);
  if (e1 || e2) return NextResponse.json(vazio);

  const atraso = abertos && abertos.length > 0
    ? { total: abertos.reduce((s, p) => s + Number(p.valor || 0), 0), desde: abertos[0].vencimento, url: abertos[0].invoice_url, quantidade: abertos.length }
    : null;
  const expiraEm: string | undefined = empresa?.modulos?.demo ? empresa.modulos.demo_expira_em : undefined;
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const demoExpirada = !!expiraEm && /^\d{4}-\d{2}-\d{2}$/.test(expiraEm) && expiraEm < hoje;
  return NextResponse.json({ bloqueado: !!empresa?.bloqueio_cobranca_em, atraso, demoExpirada });
}
