import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { gerarContratoTrailerBuffer } from '@/lib/contract-trailer-pdf';

export const dynamic = 'force-dynamic';

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

const DOCUSEAL_URL = (process.env.DOCUSEAL_URL || '').replace(/\/$/, '');
const DOCUSEAL_TOKEN = process.env.DOCUSEAL_TOKEN || '';
const DOCUSEAL_SIGN_BASE = (process.env.DOCUSEAL_SIGN_BASE_URL || DOCUSEAL_URL).replace(/\/$/, '');

// Mesmo fluxo de /api/docuseal (contrato de rádio), adaptado pra venda de produto sob
// encomenda do Pulse (ex: Trailer Travel) — gera o PDF com contract-trailer-pdf.ts em vez
// do gerador de contrato de veiculação, e grava o resultado nas MESMAS colunas
// docuseal_* de leads que o fluxo de /deals já usa (o webhook em
// /api/docuseal/webhook já procura por essas colunas independente da origem).
export async function POST(req: Request) {
  try {
    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

    const { empresa_id, venda, signers, consultor } = body;
    if (!empresa_id || !venda || !signers?.length) {
      return NextResponse.json({ erro: 'Campos obrigatórios: empresa_id, venda, signers.' }, { status: 422 });
    }
    if (!consultor?.nome || !consultor?.email) {
      return NextResponse.json({ erro: 'Vendedor (nome/e-mail) é obrigatório — ele assina primeiro que o cliente.' }, { status: 422 });
    }
    if (!DOCUSEAL_URL || !DOCUSEAL_TOKEN) {
      return NextResponse.json({ erro: 'Docuseal não configurado no servidor. Defina DOCUSEAL_URL e DOCUSEAL_TOKEN.' }, { status: 500 });
    }

    const supabase = db();

    const [{ data: empresa, error: empErr }, { data: unidades }] = await Promise.all([
      supabase.from('empresas').select('modulos').eq('id', empresa_id).single(),
      supabase.from('unidades').select('nome, razao_social, cnpj, endereco, cidade, estado').eq('empresa_id', empresa_id),
    ]);
    if (empErr) return NextResponse.json({ erro: 'Erro ao buscar empresa: ' + empErr!.message }, { status: 500 });
    if (!empresa?.modulos?.assinatura) {
      return NextResponse.json({ erro: 'Add-on de Assinatura Digital não habilitado para esta empresa.' }, { status: 403 });
    }

    const unidadeMatch = unidades?.find((u: any) => u.nome === venda.unidade) || unidades?.[0];
    const vendedora = {
      razao: unidadeMatch?.razao_social || '', cnpj: unidadeMatch?.cnpj || '', endereco: unidadeMatch?.endereco || '',
      nome: unidadeMatch?.nome || '', cidade: unidadeMatch?.cidade || '', estado: unidadeMatch?.estado || '',
    };

    let pdfBuffer: Buffer, sigPage: number, sigYFrac: number;
    try {
      const resultado = await gerarContratoTrailerBuffer({
        protocolo: String(venda.id || '').padStart(6, '0'),
        vendedora_razao: vendedora.razao, vendedora_cnpj: vendedora.cnpj, vendedora_endereco: vendedora.endereco,
        vendedora_nome: vendedora.nome, vendedora_cidade: vendedora.cidade, vendedora_estado: vendedora.estado,
        cliente: venda.empresa || signers[0]?.name || '',
        cliente_razao_social: venda.razao_social || '',
        cnpj: venda.cnpj || '', endereco: venda.endereco || '', telefone: venda.telefone || '', cidade: venda.cidade || '',
        itens: venda.itens || [],
        desconto: venda.desconto || 0, valor_total: venda.valor_total || 0,
        parcelas: venda.parcelas || '1', vencimento: venda.vencimento || '',
        vencimentos_datas: Array.isArray(venda.vencimentos_datas) ? venda.vencimentos_datas : undefined,
        forma_pagamento: venda.forma_pagamento || undefined,
        valor_entrada: Number(venda.valor_entrada) > 0 ? Number(venda.valor_entrada) : undefined,
        forma_pagamento_entrada: venda.forma_pagamento_entrada || undefined,
        parcelas_detalhe: Array.isArray(venda.parcelas_detalhe) && venda.parcelas_detalhe.length > 0 ? venda.parcelas_detalhe : undefined,
        prazoFabricacaoDias: venda.prazoFabricacaoDias ?? null,
        observacao: venda.observacao || '',
      });
      pdfBuffer = resultado.buffer; sigPage = resultado.sigPage; sigYFrac = resultado.sigYFrac;
    } catch (err: any) {
      console.error('[docuseal/pulse/pdf]', err);
      return NextResponse.json({ erro: 'Erro ao gerar PDF: ' + err.message }, { status: 500 });
    }

    const templateRes = await fetch(`${DOCUSEAL_URL}/templates/pdf`, {
      method: 'POST',
      headers: { 'X-Auth-Token': DOCUSEAL_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Contrato de Venda — ${venda.empresa || 'Cliente'} (#${String(venda.id).padStart(4, '0')})`,
        documents: [{
          name: 'contrato.pdf',
          file: pdfBuffer.toString('base64'),
          fields: [{
            name: 'Assinatura Vendedor', role: 'Vendedor', type: 'signature', required: true,
            areas: [{ x: 0.62, y: sigYFrac, w: 0.30, h: 0.08, page: sigPage }],
          }, {
            name: 'Assinatura Comprador', role: 'Comprador', type: 'signature', required: true,
            areas: [{ x: 0.08, y: sigYFrac, w: 0.30, h: 0.08, page: sigPage }],
          }],
        }],
      }),
    });
    if (!templateRes.ok) {
      const txt = await templateRes.text();
      console.error('[docuseal/pulse/template]', templateRes.status, txt.slice(0, 300));
      return NextResponse.json({ erro: 'Erro ao criar template no Docuseal: ' + txt.slice(0, 200) }, { status: 502 });
    }
    const template = await templateRes.json();

    const submissionRes = await fetch(`${DOCUSEAL_URL}/submissions`, {
      method: 'POST',
      headers: { 'X-Auth-Token': DOCUSEAL_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template_id: template.id,
        send_email: true,
        order: 'preserved',
        submitters: [
          { name: consultor.nome, email: consultor.email, role: 'Vendedor', order: 0 },
          ...signers.map((s: any) => ({
            name: s.name, email: s.email || `noreply+${Date.now()}@wegrow.com.br`, role: 'Comprador', order: 1,
            ...(s.phone ? { phone: '+55' + s.phone.replace(/\D/g, '').replace(/^55/, '') } : {}),
          })),
        ],
      }),
    });
    if (!submissionRes.ok) {
      const txt = await submissionRes.text();
      console.error('[docuseal/pulse/submission]', submissionRes.status, txt.slice(0, 300));
      return NextResponse.json({ erro: 'Erro ao criar submissão no Docuseal: ' + txt.slice(0, 200) }, { status: 502 });
    }
    const submitters: any[] = await submissionRes.json();
    const vendedorSubmitter = submitters.find((s: any) => s.role === 'Vendedor') || submitters[0];
    const compradorSubmitter = submitters.find((s: any) => s.role === 'Comprador') || submitters[1];

    if (venda.id) {
      await supabase.from('leads').update({
        docuseal_submission_id: String(vendedorSubmitter.submission_id),
        docuseal_consultor_sign_url: `${DOCUSEAL_SIGN_BASE}/s/${vendedorSubmitter.slug}`,
        docuseal_sign_url: compradorSubmitter ? `${DOCUSEAL_SIGN_BASE}/s/${compradorSubmitter.slug}` : null,
      }).eq('id', venda.id);
    }

    return NextResponse.json({
      ok: true,
      submission_id: String(vendedorSubmitter.submission_id),
      consultor_sign_url: `${DOCUSEAL_SIGN_BASE}/s/${vendedorSubmitter.slug}`,
      sign_url: compradorSubmitter ? `${DOCUSEAL_SIGN_BASE}/s/${compradorSubmitter.slug}` : null,
    });
  } catch (err: any) {
    console.error('[docuseal/pulse/unhandled]', err);
    return NextResponse.json({ erro: 'Erro interno: ' + (err?.message || String(err)) }, { status: 500 });
  }
}
