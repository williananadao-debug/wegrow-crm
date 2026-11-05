import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE_SESSAO, dbAdmin, obterSessao, opcoesCookieSessao, planoPagamento, portalAtivo } from '@/lib/portal-cliente';

export const dynamic = 'force-dynamic';

// Mesma regra de etapasFabricacaoDe (pulse/shared.ts), sem importar aquele arquivo — ele
// puxa o client Supabase do navegador e isto aqui roda no servidor.
type EtapaConfig = { nome: string; prazoDias: number | null; checklist: string[] };
function etapasFabricacaoDe(modulos: Record<string, unknown> | null | undefined): EtapaConfig[] {
  const custom = modulos?.pulse_etapas_fabricacao;
  if (!Array.isArray(custom) || custom.length === 0) {
    return ['Corte', 'Solda/Estrutura', 'Pintura', 'Montagem/Acabamento'].map(nome => ({ nome, prazoDias: null, checklist: [] }));
  }
  return custom.map((e: string | { nome: string; prazoDias?: number | null; checklist?: string[] | null }) => typeof e === 'string'
    ? { nome: e, prazoDias: null, checklist: [] }
    : { nome: e.nome, prazoDias: e.prazoDias != null && e.prazoDias > 0 ? Number(e.prazoDias) : null, checklist: Array.isArray(e.checklist) ? e.checklist : [] });
}

const STATUS_PRODUCAO: Record<string, string> = { em_producao: 'Em produção', concluida: 'Pronto', entregue: 'Entregue' };
const DIA = 86400000;
const somaDias = (iso: string, dias: number) => new Date(new Date(iso).getTime() + dias * DIA).toISOString();

// Início e fim reais de cada etapa a partir do histórico — mesma leitura do cronograma
// interno (pulse/producao): "Etapa iniciada/concluída/retornada".
function temposDasEtapas(evs: { texto: string | null; created_at: string }[]) {
  const t: Record<string, { inicio?: string; fim?: string }> = {};
  for (const ev of evs) {
    const texto = ev.texto || '';
    let m = texto.match(/^Etapa iniciada: (.+?)\.(?:\s|$)/);
    if (m) { t[m[1]] = { inicio: ev.created_at }; continue; }
    m = texto.match(/^Etapa concluída: (.+?)\.(?:\s|$)/);
    if (m) { t[m[1]] = { ...t[m[1]], fim: ev.created_at }; continue; }
    m = texto.match(/^Etapa retornada: (.+?) → (.+?)\.(?:\s|$)/);
    if (m) { t[m[1]] = {}; t[m[2]] = { inicio: ev.created_at }; }
  }
  return t;
}

// Retorno de etapa é correção interna da fábrica, e o tempo de espera é métrica da equipe:
// nenhum dos dois vai pro cliente.
const textoParaCliente = (texto: string | null) => {
  if (!texto || /^Etapa retornada:/.test(texto)) return null;
  return texto.replace(/\s*Ficou \d+ dia\(s\) aguardando início\./, '');
};

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
    // '*' traz etapa_iniciada_em e checklist_feito sem depender da lista de colunas
    ? await db.from('pulse_producoes').select('*')
        .eq('empresa_id', sessao.empresa_id).in('lead_id', ids).order('created_at', { ascending: true })
    : { data: [] };
  const prodIds = (producoes || []).map(p => p.id);
  const { data: eventos } = prodIds.length
    // '*' traz foto_status sem quebrar antes da migration (sem a coluna, nenhuma foto passa).
    ? await db.from('pulse_producao_eventos').select('*')
        .in('producao_id', prodIds).order('created_at', { ascending: false }).limit(500)
    : { data: [] };
  // Histórico completo de etapas (em ordem) para o cronograma — o de cima é só o recente.
  const { data: eventosEtapa } = prodIds.length
    ? await db.from('pulse_producao_eventos').select('producao_id, texto, created_at')
        .in('producao_id', prodIds).in('tipo', ['status', 'etapa']).order('created_at', { ascending: true }).limit(3000)
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
      const idx = Math.min(Math.max(0, p.etapa_fabricacao_idx || 0), Math.max(0, etapas.length - 1));
      const emProducao = p.status === 'em_producao';
      const t = temposDasEtapas((eventosEtapa || []).filter(e => e.producao_id === p.id));
      // A etapa atual só conta como iniciada depois do "Iniciar etapa" no chão de fábrica
      const atualIniciada = emProducao && Boolean(p.etapa_iniciada_em);
      if (atualIniciada && etapas[idx]) t[etapas[idx].nome] = { ...t[etapas[idx].nome], inicio: t[etapas[idx].nome]?.inicio || p.etapa_iniciada_em };
      const comecou = !emProducao || idx > 0 || atualIniciada;
      // A primeira vez que a 1ª etapa foi iniciada — um retorno até ela depois não muda o início
      const primeiroInicio = (eventosEtapa || []).find(e => e.producao_id === p.id && etapas[0] && (e.texto || '').startsWith(`Etapa iniciada: ${etapas[0].nome}.`));
      const inicioProducao = comecou ? (primeiroInicio?.created_at || t[etapas[0]?.nome]?.inicio || null) : null;

      // Previsto: de trás pra frente a partir da previsão de entrega, com o prazo em dias de cada
      // etapa (Configurações → Etapas de Produção). Sem entrega ou sem prazo em alguma etapa
      // que falta, não inventa data.
      const previsto: { inicio: string | null; fim: string | null }[] = etapas.map(() => ({ inicio: null, fim: null }));
      if (emProducao && p.previsao_entrega && etapas.slice(idx).every(e => e.prazoDias)) {
        let fim = new Date(String(p.previsao_entrega).substring(0, 10) + 'T12:00:00').toISOString();
        for (let i = etapas.length - 1; i >= idx; i--) {
          const inicio = somaDias(fim, -(etapas[i].prazoDias as number));
          previsto[i] = { inicio, fim };
          fim = inicio;
        }
      }

      const marcados = (p.checklist_feito && typeof p.checklist_feito === 'object' ? p.checklist_feito : {}) as Record<string, Record<string, unknown>>;
      const cronograma = etapas.map((e, i) => {
        const real = t[e.nome] || {};
        const situacao = !emProducao || i < idx ? 'concluida' : i === idx ? (atualIniciada ? 'andamento' : 'aguardando') : 'futura';
        const inicio = situacao === 'concluida' || situacao === 'andamento' ? real.inicio || null : null;
        return {
          nome: e.nome, situacao, inicio,
          fim: situacao === 'concluida' ? real.fim || null : null,
          // Prazo da etapa em andamento: início real + prazo; senão, o fim previsto pela entrega
          prazo: situacao === 'andamento' ? (inicio && e.prazoDias ? somaDias(inicio, e.prazoDias) : previsto[i].fim) : null,
          inicioPrevisto: situacao === 'aguardando' || situacao === 'futura' ? previsto[i].inicio : null,
          fimPrevisto: situacao === 'aguardando' || situacao === 'futura' ? previsto[i].fim : null,
          subprocessos: situacao === 'andamento' ? e.checklist.map(item => ({ nome: item, feito: Boolean(marcados[e.nome]?.[item]) })) : [],
        };
      });

      return {
        id: p.id, produto: p.produto_final_nome,
        status: emProducao && !comecou ? 'aguardando' : p.status,
        statusLabel: emProducao && !comecou ? 'Aguardando início' : STATUS_PRODUCAO[p.status] || p.status,
        etapaAtual: idx,
        previsaoEntrega: p.previsao_entrega, inicioProducao, cronograma,
        // Comentário da equipe é interno — mostra só a foto dele, não o texto.
        linhaDoTempo: evs.filter(e => e.tipo !== 'comentario' || e.foto_url)
          .filter(e => !/^Etapa retornada:/.test(e.texto || ''))
          .map(e => ({ tipo: e.tipo, texto: e.tipo === 'comentario' ? null : textoParaCliente(e.texto), foto: e.foto_url, em: e.created_at })),
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
    etapas: etapas.map(e => e.nome), pedidos,
  });
  // Renova o cookie a cada acesso (sessão deslizante de 90 dias — o banco é renovado em obterSessao).
  if (valorCookie) res.cookies.set(COOKIE_SESSAO, valorCookie, opcoesCookieSessao());
  return res;
}
