import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cancelarNota } from '@/lib/focusNfeEmissao';
import type { FocusNfeAmbiente } from '@/lib/focusNfe';
import { motivoRecusaNf } from '@/lib/fiscalMotivo';

export const dynamic = 'force-dynamic';

// Cancela uma NF-e emitida pelo sistema (tem ref_focus_nfe). SÓ DIRETOR.
// Regras: justificativa 15–255 caracteres (exigência da SEFAZ); NF1 com NF2 de remessa
// autorizada ligada a ela não pode ser cancelada antes da NF2. Prazo legal: 24h após a
// autorização — fora disso a SEFAZ recusa e o motivo volta pra tela.
export async function POST(req: Request) {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 });
  const { data: perfil } = await db.from('profiles').select('empresa_id, cargo, nome').eq('id', user.id).maybeSingle();
  if (!perfil?.empresa_id) return NextResponse.json({ error: 'Empresa não identificada.' }, { status: 403 });
  if (perfil.cargo !== 'diretor') return NextResponse.json({ error: 'Só a diretoria pode cancelar nota fiscal.' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const notaId = Number(body?.notaId);
  const justificativa = String(body?.justificativa || '').trim().replace(/\s+/g, ' ');
  if (!Number.isInteger(notaId) || notaId <= 0) return NextResponse.json({ error: 'Nota inválida.' }, { status: 400 });
  if (justificativa.length < 15 || justificativa.length > 255) {
    return NextResponse.json({ error: 'A justificativa precisa ter entre 15 e 255 caracteres (exigência da SEFAZ).' }, { status: 400 });
  }

  const { data: nota } = await db.from('fiscal_notas')
    .select('id, status, tipo, ref_focus_nfe, chave_acesso, chave_nf_referenciada, lead_id, observacao, numero')
    .eq('id', notaId).eq('empresa_id', perfil.empresa_id).maybeSingle();
  if (!nota) return NextResponse.json({ error: 'Nota não encontrada.' }, { status: 404 });
  if (nota.status === 'cancelada') return NextResponse.json({ error: 'Essa nota já está cancelada.' }, { status: 409 });
  if (nota.status !== 'autorizada') return NextResponse.json({ error: `Só dá pra cancelar nota autorizada (status atual: ${nota.status}).` }, { status: 409 });
  if (nota.tipo !== 'saida' || !nota.ref_focus_nfe) {
    return NextResponse.json({ error: 'Essa nota não foi emitida pelo sistema — cancele no mesmo lugar em que ela foi emitida (painel do Focus NFe ou emissor da SEFAZ).' }, { status: 400 });
  }

  // NF1 (entrega futura) com NF2 (remessa) autorizada referenciando ela: cancelar a NF2 antes.
  if (!nota.chave_nf_referenciada && nota.chave_acesso) {
    const { data: nf2 } = await db.from('fiscal_notas').select('id')
      .eq('empresa_id', perfil.empresa_id).eq('chave_nf_referenciada', nota.chave_acesso).eq('status', 'autorizada').limit(1).maybeSingle();
    if (nf2) return NextResponse.json({ error: 'Essa NF tem uma NF de remessa (NF2) ou complementar autorizada ligada a ela. Cancele essa nota primeiro.' }, { status: 409 });
  }

  const { data: integracao } = await db.from('fiscal_integracoes')
    .select('token_producao, token_homologacao, ambiente_ativo').eq('empresa_id', perfil.empresa_id).maybeSingle();
  if (!integracao) return NextResponse.json({ error: 'Integração com o Focus NFe não encontrada.' }, { status: 400 });
  const ambiente: FocusNfeAmbiente = integracao.ambiente_ativo === 'producao' ? 'producao' : 'homologacao';
  const tokenFocus = ambiente === 'producao' ? integracao.token_producao : integracao.token_homologacao;
  if (!tokenFocus) return NextResponse.json({ error: `Sem token de ${ambiente} configurado.` }, { status: 400 });

  const r = await cancelarNota(tokenFocus, ambiente, nota.ref_focus_nfe, justificativa);
  const statusFocus = String(r.corpo?.status || '');
  if (r.status >= 400 || (statusFocus && statusFocus !== 'cancelado')) {
    const motivo = motivoRecusaNf(JSON.stringify(r.corpo)) || `erro ${r.status}`;
    return NextResponse.json({ error: `A SEFAZ/Focus NFe não aceitou o cancelamento: ${motivo}` }, { status: 502 });
  }

  const registro = `Cancelada em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} por ${perfil.nome || 'diretor'}. Justificativa: ${justificativa}`;
  await db.from('fiscal_notas').update({
    status: 'cancelada',
    observacao: [nota.observacao, registro].filter(Boolean).join('\n'),
  }).eq('id', nota.id);

  return NextResponse.json({ ok: true, mensagem: r.corpo?.mensagem_sefaz || 'Nota cancelada.' });
}
