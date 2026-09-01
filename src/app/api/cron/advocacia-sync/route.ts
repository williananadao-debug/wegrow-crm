import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// Mesma API Pública do DataJud (CNJ) usada em /api/advocacia/sincronizar-andamentos —
// gratuita, cobre todos os tribunais, sem conta própria da empresa.
const DATAJUD_API_KEY = process.env.DATAJUD_API_KEY || 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';
const DATAJUD_BASE = 'https://api-publica.datajud.cnj.jus.br';
const MAX_PROCESSOS_POR_EXECUCAO = 200; // conservador — DataJud não expõe rate-limit documentado

type NovoAndamento = { processoId: number; clienteNome: string; numeroProcesso: string; nome: string; dataHora: string };

async function sincronizarProcesso(
  supabase: ReturnType<typeof db>,
  empresaId: string,
  processo: { id: number; numero_processo: string; tribunal: string; cliente_nome: string }
): Promise<NovoAndamento[]> {
  const numeroLimpo = processo.numero_processo.replace(/\D/g, '');
  const res = await fetch(`${DATAJUD_BASE}/api_publica_${processo.tribunal}/_search`, {
    method: 'POST',
    headers: { 'Authorization': `APIKey ${DATAJUD_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { match: { numeroProcesso: numeroLimpo } } }),
  });
  if (!res.ok) throw new Error(`DataJud HTTP ${res.status}`);

  const resultado = await res.json();
  const hit = resultado?.hits?.hits?.[0]?._source;
  if (!hit) return [];

  const movimentos: { codigo?: number; nome: string; dataHora: string }[] = hit.movimentos || [];
  const payload = movimentos
    .filter(m => m?.nome && m?.dataHora)
    .map(m => ({ empresa_id: empresaId, processo_id: processo.id, codigo: m.codigo ?? null, nome: m.nome, data_hora: m.dataHora }));

  await supabase.from('advocacia_processos').update({ ultima_sincronizacao: new Date().toISOString() }).eq('id', processo.id);
  if (payload.length === 0) return [];

  const { data: inseridos } = await supabase.from('advocacia_andamentos')
    .upsert(payload, { onConflict: 'processo_id,codigo,data_hora', ignoreDuplicates: true })
    .select('nome, data_hora');
  if (!inseridos || inseridos.length === 0) return [];

  return inseridos.map(a => ({
    processoId: processo.id, clienteNome: processo.cliente_nome, numeroProcesso: processo.numero_processo,
    nome: a.nome, dataHora: a.data_hora,
  }));
}

async function notificarAdvogado(email: string, itens: NovoAndamento[]) {
  if (!process.env.RESEND_API_KEY) return;
  const resend = new Resend(process.env.RESEND_API_KEY);
  const linhas = itens.map(i =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid #e5e0d5"><p style="margin:0;font-size:13px;color:#241c14"><strong>${i.clienteNome}</strong> — ${i.numeroProcesso}</p><p style="margin:4px 0 0;font-size:12px;color:#6b6862">${i.nome} · ${new Date(i.dataHora).toLocaleDateString('pt-BR')}</p></td></tr>`
  ).join('');
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'WeGrow <onboarding@resend.dev>',
    to: [email],
    subject: `⚖️ ${itens.length} andamento(s) processual(is) novo(s)`,
    html: `
<!DOCTYPE html>
<html lang="pt-br"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#faf7f2;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px"><tr><td align="center">
    <table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e0d5;max-width:100%">
      <tr><td style="background:#1e293b;padding:20px 28px"><span style="font-size:18px;font-weight:900;color:#fff">⚖️ ADVOCACIA</span></td></tr>
      <tr><td style="padding:28px">
        <p style="margin:0 0 16px;font-size:14px;color:#241c14">Movimentação nova detectada nos processos sob sua responsabilidade:</p>
        <table width="100%" cellpadding="0" cellspacing="0">${linhas}</table>
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://www.wegrow.app.br'}/advocacia/processos" style="display:inline-block;margin-top:20px;background:#1e293b;color:#fff;font-weight:900;font-size:13px;text-transform:uppercase;padding:14px 28px;border-radius:10px;text-decoration:none">Ver processos</a>
      </td></tr>
      <tr><td style="padding:16px 28px;border-top:1px solid #e5e0d5"><p style="margin:0;font-size:10px;color:#6b6862;text-align:center">WeGrow Advocacia · Sincronização automática com o DataJud (CNJ)</p></td></tr>
    </table>
  </td></tr></table>
</body></html>`,
  });
}

// Roda 1x por dia (ver vercel.json) — "push de movimentação processual" automático,
// sem depender de alguém clicar em "sincronizar" processo por processo (era o único
// jeito antes, via /api/advocacia/sincronizar-andamentos). Detecta andamento novo e
// avisa o advogado responsável por e-mail; sem responsável, avisa diretor/gerente.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  }

  const supabase = db();
  const resultado: any[] = [];
  let processosRestantes = MAX_PROCESSOS_POR_EXECUCAO;

  const { data: empresas } = await supabase.from('empresas').select('id, modulos');
  const empresasAdvocacia = (empresas || []).filter((e: any) => e.modulos?.advocacia === true);

  for (const empresa of empresasAdvocacia) {
    if (processosRestantes <= 0) break;
    const empresaId = empresa.id;

    const { data: processos } = await supabase.from('advocacia_processos')
      .select('id, numero_processo, tribunal, cliente_nome, advogado_responsavel_id')
      .eq('empresa_id', empresaId).eq('status', 'ativo')
      .not('numero_processo', 'is', null).not('tribunal', 'is', null)
      .limit(processosRestantes);

    const porAdvogado = new Map<string, NovoAndamento[]>();
    let sincronizados = 0, comErro = 0, novosAndamentos = 0;

    for (const processo of processos || []) {
      processosRestantes--;
      sincronizados++;
      try {
        const novos = await sincronizarProcesso(supabase, empresaId, processo as any);
        if (novos.length === 0) continue;
        novosAndamentos += novos.length;
        const chave = processo.advogado_responsavel_id || '__sem_responsavel__';
        porAdvogado.set(chave, [...(porAdvogado.get(chave) || []), ...novos]);
      } catch (err: any) {
        comErro++;
        console.error(`[Advocacia Sync] Erro no processo ${processo.id} (empresa ${empresaId}):`, err.message);
      }
    }

    // Notifica cada advogado responsável; sem responsável cadastrado, cai pro diretor/gerente.
    if (porAdvogado.size > 0) {
      const { data: perfis } = await supabase.from('profiles').select('id, email, cargo').eq('empresa_id', empresaId);
      const emailPorId = new Map((perfis || []).map((p: any) => [p.id, p.email]));
      const emailsLideranca = (perfis || []).filter((p: any) => ['diretor', 'gerente'].includes(p.cargo)).map((p: any) => p.email).filter(Boolean);

      for (const [advogadoId, itens] of porAdvogado.entries()) {
        if (advogadoId === '__sem_responsavel__') {
          for (const email of emailsLideranca) await notificarAdvogado(email, itens);
        } else {
          const email = emailPorId.get(advogadoId);
          if (email) await notificarAdvogado(email, itens);
        }
      }
    }

    resultado.push({ empresa_id: empresaId, processos_sincronizados: sincronizados, com_erro: comErro, novos_andamentos: novosAndamentos });
  }

  return NextResponse.json({ ok: true, empresas_processadas: empresasAdvocacia.length, resultado });
}
