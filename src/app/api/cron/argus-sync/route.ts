import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { buscarContratacoesPncp, filtrarPorPalavrasChave, formatarDataPncp, detalharContratacaoPncp } from '@/lib/pncp';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

const MAX_PAGINAS_POR_FILTRO = 3; // conservador — PNCP não expõe rate-limit, então não arrisca
const CONCORRENCIA_EMPRESAS = 3; // processa N empresas em paralelo — mantém o mesmo volume de chamadas ao PNCP, só sobrepõe a espera de rede em vez de somar tudo serialmente

// Processa a lista em lotes de `tamanho`, aguardando cada lote terminar antes do
// próximo — evita tanto o teto de 120s (que serial puro estoura com empresas
// suficientes) quanto um burst descontrolado no PNCP (que paralelismo total causaria).
async function emLotes<T>(itens: T[], tamanho: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < itens.length; i += tamanho) {
    await Promise.allSettled(itens.slice(i, i + tamanho).map(fn));
  }
}

async function notificarNovosCandidatos(supabase: ReturnType<typeof db>, empresaId: string, qtd: number) {
  if (!process.env.RESEND_API_KEY || qtd === 0) return;
  const { data: destinatarios } = await supabase.from('profiles').select('email').eq('empresa_id', empresaId).in('cargo', ['diretor', 'gerente']);
  const emails = (destinatarios || []).map((d: any) => d.email).filter(Boolean);
  if (emails.length === 0) return;
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'WeGrow <onboarding@resend.dev>',
    to: emails,
    subject: `📡 Argus: ${qtd} novo(s) edital(is) encontrado(s) no PNCP`,
    html: `
<!DOCTYPE html>
<html lang="pt-br"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#faf7f2;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px"><tr><td align="center">
    <table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e0d5;max-width:100%">
      <tr><td style="background:#d9861c;padding:20px 28px"><span style="font-size:18px;font-weight:900;color:#fff">📡 ARGUS</span></td></tr>
      <tr><td style="padding:28px">
        <p style="margin:0 0 16px;font-size:16px;color:#241c14">Encontramos <strong>${qtd} novo(s) edital(is)</strong> no PNCP que batem com seus critérios de busca salvos.</p>
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://www.wegrow.app.br'}/argus/licitacoes" style="display:inline-block;background:#d9861c;color:#fff;font-weight:900;font-size:13px;text-transform:uppercase;padding:14px 28px;border-radius:10px;text-decoration:none">Ver editais</a>
      </td></tr>
      <tr><td style="padding:16px 28px;border-top:1px solid #e5e0d5"><p style="margin:0;font-size:10px;color:#6b6862;text-align:center">WeGrow Argus · Sincronização automática com o PNCP</p></td></tr>
    </table>
  </td></tr></table>
</body></html>`,
  });
}

// Roda 1x por dia (ver vercel.json). Duas passadas por empresa com modulos.argus
// ativo: (1) descoberta — busca no PNCP por cada filtro salvo e grava candidatos
// novos; (2) acompanhamento — reconsulta editais já em andamento pra detectar
// mudança de status. Ver plano em C:\Users\willi\.claude\plans\cozy-percolating-snail.md
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  }

  const supabase = db();
  const resultado: any[] = [];

  const { data: empresas } = await supabase.from('empresas').select('id, modulos');
  const empresasArgus = (empresas || []).filter((e: any) => e.modulos?.argus === true);

  const processarEmpresa = async (empresa: any) => {
    const empresaId = empresa.id;
    let novosCandidatos = 0;

    // ── 1) Descoberta ──────────────────────────────────────────────
    const { data: filtros } = await supabase.from('argus_filtros_busca').select('*').eq('empresa_id', empresaId).eq('ativo', true);
    const hoje = new Date();
    const inicio = new Date(hoje); inicio.setDate(inicio.getDate() - 30);

    for (const filtro of filtros || []) {
      try {
        const encontrados: any[] = [];
        let pagina = 1;
        let paginasRestantes = 1;
        while (paginasRestantes > 0 && pagina <= MAX_PAGINAS_POR_FILTRO) {
          const r = await buscarContratacoesPncp({
            dataInicial: formatarDataPncp(inicio),
            dataFinal: formatarDataPncp(hoje),
            modalidade: filtro.modalidade || 6,
            uf: filtro.uf,
            pagina,
          });
          encontrados.push(...r.data);
          paginasRestantes = r.paginasRestantes;
          pagina++;
        }
        const filtrados = filtrarPorPalavrasChave(encontrados, filtro.palavras_chave);
        if (filtrados.length === 0) continue;

        // Checagem de duplicata em lote (1 query pro filtro inteiro) em vez de
        // 1 select + 1 insert por item — o que antes escalava linear com o
        // número de resultados do PNCP, agora é O(1) round-trip por filtro.
        const numeros = filtrados.map(item => item.numeroControlePNCP);
        const { data: existentes } = await supabase.from('argus_editais')
          .select('numero_controle_pncp').eq('empresa_id', empresaId).in('numero_controle_pncp', numeros);
        const jaExistem = new Set((existentes || []).map((e: any) => e.numero_controle_pncp));
        const novos = filtrados.filter(item => !jaExistem.has(item.numeroControlePNCP));
        if (novos.length === 0) continue;

        await supabase.from('argus_editais').insert(novos.map(item => ({
          empresa_id: empresaId,
          origem: 'pncp',
          numero_controle_pncp: item.numeroControlePNCP,
          numero_processo: item.processo || null,
          orgao: item.orgaoEntidade?.razaoSocial || null,
          modalidade: item.modalidadeNome || null,
          objeto: item.objetoCompra || null,
          uf: item.unidadeOrgao?.ufSigla || null,
          municipio: item.unidadeOrgao?.municipioNome || null,
          status_interesse: 'candidato',
          estagio_processo: item.situacaoCompraNome || null,
          valor_estimado: item.valorTotalEstimado ?? null,
          valor_homologado: item.valorTotalHomologado ?? null,
          data_sessao: item.dataAberturaProposta || null,
          data_encerramento_proposta: item.dataEncerramentoProposta || null,
          link_pncp: item.linkProcessoEletronico || null,
          raw_payload: item,
        })));
        novosCandidatos += novos.length;
      } catch (err: any) {
        console.error(`[Argus Sync] Erro na descoberta (empresa ${empresaId}, filtro ${filtro.id}):`, err.message);
      }
    }

    if (novosCandidatos > 0) {
      await notificarNovosCandidatos(supabase, empresaId, novosCandidatos);
    }

    // ── 2) Acompanhamento de status ─────────────────────────────────
    const { data: emAndamento } = await supabase.from('argus_editais')
      .select('*').eq('empresa_id', empresaId).in('status_interesse', ['acompanhando', 'proposta_enviada'])
      .not('numero_controle_pncp', 'is', null);

    let statusAtualizados = 0;
    for (const edital of emAndamento || []) {
      try {
        const detalhe = await detalharContratacaoPncp(edital.numero_controle_pncp);
        if (!detalhe) continue;
        const statusMudou = detalhe.situacaoCompraNome && detalhe.situacaoCompraNome !== edital.estagio_processo;
        if (!statusMudou) continue;

        await supabase.from('argus_editais').update({
          estagio_processo: detalhe.situacaoCompraNome,
          valor_homologado: detalhe.valorTotalHomologado ?? edital.valor_homologado,
          updated_at: new Date().toISOString(),
        }).eq('id', edital.id);

        await supabase.from('argus_edital_eventos').insert([{
          empresa_id: empresaId,
          edital_id: edital.id,
          titulo: 'Status atualizado no PNCP',
          descricao: `${edital.estagio_processo || 'Sem status anterior'} → ${detalhe.situacaoCompraNome}`,
        }]);
        statusAtualizados++;
      } catch (err: any) {
        console.error(`[Argus Sync] Erro no acompanhamento (edital ${edital.id}):`, err.message);
      }
    }

    resultado.push({ empresa_id: empresaId, novos_candidatos: novosCandidatos, status_atualizados: statusAtualizados });
  };

  await emLotes(empresasArgus, CONCORRENCIA_EMPRESAS, processarEmpresa);

  return NextResponse.json({ ok: true, empresas_processadas: empresasArgus.length, resultado });
}
