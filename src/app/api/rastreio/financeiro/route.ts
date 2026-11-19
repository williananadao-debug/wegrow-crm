import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { usuarioRastreio } from '@/lib/rastreio';
import {
  carregarConfig, integracaoAsaas, conectarAsaas, salvarAssinatura, cancelarAssinatura, sincronizarEmpresa,
} from '@/lib/rastreioCobranca';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Financeiro do Rastreio (painel do instalador). Leitura de cobranças/clientes é direto pelo
// Supabase (RLS); aqui ficam as ações que falam com o Asaas ou mexem em configuração.
export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const u = await usuarioRastreio(db, req);
  if (!u) return NextResponse.json({ error: 'Sem acesso ao módulo Rastreio.' }, { status: 401 });
  const corpo = await req.json().catch(() => ({}));
  const acao = String(corpo.acao || '');
  const gestor = u.cargo === 'diretor' || u.cargo === 'gerente';

  try {
    if (acao === 'status') {
      const [cfg, ig] = await Promise.all([carregarConfig(db, u.empresaId), integracaoAsaas(db, u.empresaId)]);
      const { webhook_token, ...config } = cfg;
      return NextResponse.json({
        conectado: Boolean(ig), ambiente: ig?.amb || null, webhook: Boolean(webhook_token), config,
        splitAtivo: Boolean(process.env.WEGROW_ASAAS_WALLET_ID) && cfg.taxa_wegrow_pct > 0, podeGerir: gestor, ehDiretor: u.cargo === 'diretor',
      });
    }
    if (!gestor) return NextResponse.json({ error: 'Só diretor ou gerente mexe no financeiro.' }, { status: 403 });

    if (acao === 'conectar') {
      if (u.cargo !== 'diretor') return NextResponse.json({ error: 'Só o diretor conecta a conta Asaas.' }, { status: 403 });
      const chave = String(corpo.apiKey || '').trim();
      if (chave.length < 20) return NextResponse.json({ error: 'Cole a chave de API do Asaas.' }, { status: 400 });
      const r = await conectarAsaas(db, u.empresaId, chave, corpo.ambiente === 'sandbox' ? 'sandbox' : 'producao');
      return NextResponse.json({ ok: true, ...r });
    }
    if (acao === 'assinatura') {
      const r = await salvarAssinatura(db, u.empresaId, String(corpo.clienteId || ''), { forma: corpo.forma });
      return NextResponse.json({ ok: true, ...r });
    }
    if (acao === 'cancelar') {
      await cancelarAssinatura(db, u.empresaId, String(corpo.clienteId || ''));
      return NextResponse.json({ ok: true });
    }
    if (acao === 'sincronizar') {
      return NextResponse.json({ ok: true, ...(await sincronizarEmpresa(db, u.empresaId)) });
    }
    if (acao === 'config') {
      const n = (x: unknown, min: number, max: number, padrao: number) => {
        const v = Number(x); return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : padrao;
      };
      const c = corpo.config || {};
      await db.from('rastreio_cobranca_config').upsert({
        empresa_id: u.empresaId,
        dias_suspensao: Math.round(n(c.dias_suspensao, 0, 120, 10)),
        multa_pct: n(c.multa_pct, 0, 2, 2),          // CDC: multa máx. 2%
        juros_mes_pct: n(c.juros_mes_pct, 0, 1, 1),  // juros de mora máx. 1% a.m.
        nfse_automatica: Boolean(c.nfse_automatica),
        nfse_servico_codigo: String(c.nfse_servico_codigo || '').trim().slice(0, 30) || null,
        nfse_servico_descricao: String(c.nfse_servico_descricao || '').trim().slice(0, 200) || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'empresa_id' });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
