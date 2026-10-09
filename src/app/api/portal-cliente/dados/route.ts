import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE_SESSAO, dbAdmin, obterSessao, opcoesCookieSessao, planoPagamento, portalAtivo } from '@/lib/portal-cliente';

export const dynamic = 'force-dynamic';

// Mesma regra de etapasFabricacaoDe (pulse/shared.ts), sem importar aquele arquivo — ele
// puxa o client Supabase do navegador e isto aqui roda no servidor.
function etapasFabricacaoDe(modulos: Record<string, unknown> | null | undefined): string[] {
  const custom = modulos?.pulse_etapas_fabricacao;
  if (!Array.isArray(custom) || custom.length === 0) return ['Corte', 'Solda/Estrutura', 'Pintura', 'Montagem/Acabamento'];
  return custom.map((e: string | { nome: string }) => typeof e === 'string' ? e : e.nome);
}

const STATUS_PRODUCAO: Record<string, string> = { em_producao: 'Em produção', concluida: 'Pronto', entregue: 'Entregue' };

// Tudo que o cliente vê no portal, montado no servidor e filtrado pela sessão. Só sai daqui
// o que é dele (client_id + empresa_id da sessão) — nada de custo, margem, comentário interno
// da produção ou dado de outro cliente.
export async function GET() {
  const db = dbAdmin();
  const valorCookie = (await cookies()).get(COOKIE_SESSAO)?.value;
  const sessao = await obterSessao(db, valorCookie);
  if (!sessao) return NextResponse.json({ erro: 'Sessão expirada.' }, { status: 401 });

  const [{ data: empresa }, { data: cliente }] = await Promise.all([
    db.from('empresas').select('nome, logo_url, cor_primaria, modulos').eq('id', sessao.empresa_id).maybeSingle(),
    db.from('clientes').select('nome_empresa').eq('id', sessao.cliente_id).eq('empresa_id', sessao.empresa_id).maybeSingle(),
  ]);
  if (!empresa || !portalAtivo(empresa.modulos) || !cliente) return NextResponse.json({ erro: 'Portal indisponível.' }, { status: 403 });

  const { data: leads } = await db.from('leads')
    .select('id, valor_total, itens, created_at, fechado_em, valor_entrada, parcelas, vencimento, vencimentos_datas, parcelas_detalhe, cobrancas_manuais, parcelas_pagas, docuseal_assinado, docuseal_sign_url, docuseal_arquivos, contrato_manual_arquivos, contrato_manual_url')
    .eq('empresa_id', sessao.empresa_id).eq('client_id', sessao.cliente_id).eq('status', 'ganho')
    .order('created_at', { ascending: false }).limit(20);

  const ids = (leads || []).map(l => l.id);
  const { data: producoes } = ids.length
    ? await db.from('pulse_producoes').select('id, lead_id, produto_final_nome, status, etapa_fabricacao_idx, previsao_entrega, created_at')
        .eq('empresa_id', sessao.empresa_id).in('lead_id', ids).order('created_at', { ascending: true })
    : { data: [] };
  const prodIds = (producoes || []).map(p => p.id);
  const { data: eventos } = prodIds.length
    // '*' traz foto_status sem quebrar antes da migration (sem a coluna, nenhuma foto passa).
    ? await db.from('pulse_producao_eventos').select('*')
        .in('producao_id', prodIds).order('created_at', { ascending: false }).limit(500)
    : { data: [] };

  const etapas = etapasFabricacaoDe(empresa.modulos);

  const pedidos = (leads || []).map(l => {
    const itens = (Array.isArray(l.itens) ? l.itens : []).map((i: { servico?: string; quantidade?: number }) => ({ nome: i.servico || 'Item', quantidade: Number(i.quantidade) || 1 }));
    const prods = (producoes || []).filter(p => p.lead_id === l.id).map(p => {
      // Foto só vai pro cliente depois de aprovada pela gestão (diretor/gerente) — as demais
      // ficam fora; o evento de etapa continua aparecendo, só sem a foto.
      const evs = (eventos || []).filter(e => e.producao_id === p.id)
        .map(e => ({ ...e, foto_url: e.foto_url && e.foto_status === 'aprovada' ? e.foto_url : null }))
        .filter(e => e.tipo !== 'anexo' || e.foto_url);
      return {
        id: p.id, produto: p.produto_final_nome,
        status: p.status, statusLabel: STATUS_PRODUCAO[p.status] || p.status,
        etapaAtual: Math.min(Math.max(0, p.etapa_fabricacao_idx || 0), Math.max(0, etapas.length - 1)),
        previsaoEntrega: p.previsao_entrega, iniciadaEm: p.created_at,
        // Comentário da equipe é interno — mostra só a foto dele, não o texto.
        linhaDoTempo: evs.filter(e => e.tipo !== 'comentario' || e.foto_url).map(e => ({
          tipo: e.tipo, texto: e.tipo === 'comentario' ? null : e.texto, foto: e.foto_url, em: e.created_at,
        })),
        fotos: evs.filter(e => e.foto_url).map(e => ({ url: e.foto_url as string, em: e.created_at })),
      };
    });

    const arquivosAssinados = Array.isArray(l.docuseal_arquivos) ? l.docuseal_arquivos : [];
    const arquivosManuais = Array.isArray(l.contrato_manual_arquivos) && l.contrato_manual_arquivos.length > 0
      ? l.contrato_manual_arquivos
      : l.contrato_manual_url ? [{ nome: 'Contrato assinado', path: l.contrato_manual_url }] : [];
    const contrato = {
      assinado: Boolean(l.docuseal_assinado) || arquivosManuais.length > 0,
      linkAssinatura: !l.docuseal_assinado && arquivosManuais.length === 0 ? (l.docuseal_sign_url || null) : null,
      arquivos: [
        ...arquivosAssinados.map((a: { nome: string }, i: number) => ({ nome: a.nome.replace(/_/g, ' ').replace(/\.pdf$/i, ''), url: `/api/portal-cliente/arquivo?lead=${l.id}&tipo=docuseal&i=${i}` })),
        ...arquivosManuais.map((a: { nome: string }, i: number) => ({ nome: a.nome, url: `/api/portal-cliente/arquivo?lead=${l.id}&tipo=manual&i=${i}` })),
      ],
    };

    const parcelas = planoPagamento(l);
    return {
      id: l.id, fechadoEm: l.fechado_em || l.created_at, valorTotal: Number(l.valor_total) || 0, itens,
      producoes: prods, contrato, parcelas,
      totalPago: parcelas.filter(p => p.pago).reduce((s, p) => s + p.valor, 0),
    };
  });

  const res = NextResponse.json({
    empresa: { nome: empresa.nome, logo: empresa.logo_url, cor: empresa.cor_primaria || '#22C55E' },
    cliente: { nome: cliente.nome_empresa },
    etapas, pedidos,
  });
  // Renova o cookie a cada acesso (sessão deslizante de 90 dias — o banco é renovado em obterSessao).
  if (valorCookie) res.cookies.set(COOKIE_SESSAO, valorCookie, opcoesCookieSessao());
  return res;
}
