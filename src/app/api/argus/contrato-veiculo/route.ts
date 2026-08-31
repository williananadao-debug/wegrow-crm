import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { gerarContratoVeiculoBuffer } from '@/lib/contract-veiculo-pdf';

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

// Emite o contrato de compra e venda de um veículo já vendido (lead com status='ganho')
// e manda pra assinatura digital via Docuseal — mesmo fluxo/env vars já usados em
// src/app/api/docuseal/route.ts pro contrato de rádio (consultor da loja assina
// primeiro, comprador assina depois).
export async function POST(req: Request) {
  try {
    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

    const { empresa_id, lead_id, comprador_email, comprador_documento, comprador_endereco, forma_pagamento, consultor } = body;
    if (!empresa_id || !lead_id) return NextResponse.json({ erro: 'Campos obrigatórios: empresa_id, lead_id.' }, { status: 422 });
    if (!consultor?.nome || !consultor?.email) {
      return NextResponse.json({ erro: 'Consultor da loja (nome/e-mail) é obrigatório — ele assina primeiro que o comprador.' }, { status: 422 });
    }
    if (!comprador_email) return NextResponse.json({ erro: 'E-mail do comprador é obrigatório pra receber o link de assinatura.' }, { status: 422 });

    if (!DOCUSEAL_URL || !DOCUSEAL_TOKEN) {
      return NextResponse.json({ erro: 'Docuseal não configurado no servidor. Defina DOCUSEAL_URL e DOCUSEAL_TOKEN.' }, { status: 500 });
    }

    const supabase = db();

    const [{ data: empresa, error: empErr }, { data: unidades }, { data: lead, error: leadErr }] = await Promise.all([
      supabase.from('empresas').select('modulos, nome').eq('id', empresa_id).single(),
      supabase.from('unidades').select('nome, razao_social, cnpj, endereco, cidade, estado').eq('empresa_id', empresa_id),
      supabase.from('leads').select('id, empresa, valor_total, status, veiculo_referencia, veiculo_placa, veiculo_data_venda, telefone, cidade')
        .eq('id', lead_id).eq('empresa_id', empresa_id).single(),
    ]);

    if (empErr) return NextResponse.json({ erro: 'Erro ao buscar empresa: ' + empErr.message }, { status: 500 });
    if (!empresa?.modulos?.assinatura) {
      return NextResponse.json({ erro: 'Add-on de Assinatura Digital não habilitado para esta empresa.' }, { status: 403 });
    }
    if (leadErr || !lead) return NextResponse.json({ erro: 'Venda não encontrada.' }, { status: 404 });
    if (lead.status !== 'ganho') return NextResponse.json({ erro: 'Só é possível emitir contrato pra uma venda já ganha.' }, { status: 422 });

    const unidade = unidades?.[0];
    const loja = {
      razao: unidade?.razao_social || empresa.nome || '',
      cnpj: unidade?.cnpj || '',
      endereco: unidade?.endereco || '',
      nome: unidade?.nome || empresa.nome || '',
      cidade: unidade?.cidade || '',
      estado: unidade?.estado || '',
    };

    let pdfBuffer: Buffer;
    let sigPage: number;
    let sigYFrac: number;
    try {
      const resultado = await gerarContratoVeiculoBuffer({
        protocolo: String(lead.id).padStart(6, '0'),
        loja_razao: loja.razao, loja_cnpj: loja.cnpj, loja_endereco: loja.endereco,
        loja_nome: loja.nome, loja_cidade: loja.cidade, loja_estado: loja.estado,
        comprador_nome: lead.empresa || '',
        comprador_documento: comprador_documento || '',
        comprador_endereco: comprador_endereco || '',
        comprador_telefone: lead.telefone || '',
        comprador_cidade: lead.cidade || '',
        veiculo_referencia: lead.veiculo_referencia || '',
        veiculo_placa: lead.veiculo_placa || '',
        valor_total: lead.valor_total || 0,
        forma_pagamento: forma_pagamento || '',
        data_venda: lead.veiculo_data_venda || new Date().toISOString().slice(0, 10),
      });
      pdfBuffer = resultado.buffer;
      sigPage = resultado.sigPage;
      sigYFrac = resultado.sigYFrac;
    } catch (err: any) {
      console.error('[contrato-veiculo/pdf]', err);
      return NextResponse.json({ erro: 'Erro ao gerar PDF: ' + err.message }, { status: 500 });
    }

    const templateRes = await fetch(`${DOCUSEAL_URL}/templates/pdf`, {
      method: 'POST',
      headers: { 'X-Auth-Token': DOCUSEAL_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Contrato de veículo — ${lead.empresa || 'Cliente'} (#${String(lead.id).padStart(4, '0')})`,
        documents: [{
          name: 'contrato.pdf',
          file: pdfBuffer.toString('base64'),
          fields: [{
            name: 'Assinatura Loja',
            role: 'Loja',
            type: 'signature',
            required: true,
            areas: [{ x: 0.62, y: sigYFrac, w: 0.30, h: 0.08, page: sigPage }],
          }, {
            name: 'Assinatura Comprador',
            role: 'Comprador',
            type: 'signature',
            required: true,
            areas: [{ x: 0.08, y: sigYFrac, w: 0.30, h: 0.08, page: sigPage }],
          }],
        }],
      }),
    });

    if (!templateRes.ok) {
      const txt = await templateRes.text();
      console.error('[contrato-veiculo/template]', templateRes.status, txt.slice(0, 300));
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
          { name: consultor.nome, email: consultor.email, role: 'Loja', order: 0 },
          { name: lead.empresa || 'Comprador', email: comprador_email, role: 'Comprador', order: 1 },
        ],
      }),
    });

    if (!submissionRes.ok) {
      const txt = await submissionRes.text();
      console.error('[contrato-veiculo/submission]', submissionRes.status, txt.slice(0, 300));
      return NextResponse.json({ erro: 'Erro ao criar submissão no Docuseal: ' + txt.slice(0, 200) }, { status: 502 });
    }

    const submitters: any[] = await submissionRes.json();
    const lojaSubmitter = submitters.find((s: any) => s.role === 'Loja') || submitters[0];
    const compradorSubmitter = submitters.find((s: any) => s.role === 'Comprador') || submitters[1];

    return NextResponse.json({
      ok: true,
      loja_sign_url: `${DOCUSEAL_SIGN_BASE}/s/${lojaSubmitter.slug}`,
      comprador_sign_url: compradorSubmitter ? `${DOCUSEAL_SIGN_BASE}/s/${compradorSubmitter.slug}` : null,
    });
  } catch (err: any) {
    console.error('[contrato-veiculo/unhandled]', err);
    return NextResponse.json({ erro: 'Erro interno: ' + (err?.message || String(err)) }, { status: 500 });
  }
}
