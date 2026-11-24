import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { usuarioRastreio, executarComando } from '@/lib/rastreio';
import { abrirOcorrencia, anotarOcorrencia, encerrarOcorrencia } from '@/lib/rastreioOcorrencia';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Central de ocorrências pelo painel: abrir (com bloqueio opcional), anotar e encerrar.
export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const u = await usuarioRastreio(db, req);
  if (!u) return NextResponse.json({ error: 'Sem acesso ao módulo Rastreio.' }, { status: 401 });
  const c = await req.json().catch(() => ({}));
  const autor = { userId: u.id, nome: u.nome };
  try {
    if (c.acao === 'abrir') {
      const r = await abrirOcorrencia(db, {
        empresaId: u.empresaId, veiculoId: String(c.veiculoId || ''), tipo: String(c.tipo || 'roubo'),
        descricao: String(c.descricao || ''), bo: String(c.bo || ''), origem: 'painel', autor,
      });
      let bloqueio: string | null = null;
      if (c.bloquear && ['diretor', 'gerente'].includes(u.cargo || '')) {
        const b = await executarComando(db, { veiculoId: String(c.veiculoId), empresaId: u.empresaId, tipo: 'bloquear', motivo: `Ocorrência #${r.id}`, autor: { ...autor, origem: 'painel' } });
        bloqueio = b.ok ? b.mensagem : `Bloqueio não enviado: ${b.erro}`;
        await anotarOcorrencia(db, u.empresaId, r.id, bloqueio, 'sistema');
      }
      return NextResponse.json({ ok: true, ...r, bloqueio });
    }
    if (c.acao === 'anotar') {
      if (!String(c.texto || '').trim() && !c.bo) return NextResponse.json({ error: 'Escreva a anotação.' }, { status: 400 });
      await anotarOcorrencia(db, u.empresaId, Number(c.id), String(c.texto || (c.bo ? `B.O. registrado: ${c.bo}` : '')), u.nome, { bo: c.bo ? String(c.bo) : undefined });
      return NextResponse.json({ ok: true });
    }
    if (c.acao === 'encerrar') {
      await encerrarOcorrencia(db, u.empresaId, Number(c.id), c.status === 'recuperado' ? 'recuperado' : 'encerrada', autor, String(c.obs || '') || undefined);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
