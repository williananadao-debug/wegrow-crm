import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { gerarContratoBuffer } from '@/lib/contract-radio-pdf';

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
// Para Docuseal Cloud: DOCUSEAL_SIGN_BASE_URL=https://docuseal.com (API fica em api.docuseal.com)
// Para self-hosted: deixar em branco (usa o mesmo DOCUSEAL_URL)
const DOCUSEAL_SIGN_BASE = (process.env.DOCUSEAL_SIGN_BASE_URL || DOCUSEAL_URL).replace(/\/$/, '');

export async function POST(req: Request) {
  try {
    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

    const { empresa_id, deal, signers } = body;
    if (!empresa_id || !deal || !signers?.length) {
      return NextResponse.json({ erro: 'Campos obrigatórios: empresa_id, deal, signers.' }, { status: 422 });
    }

    if (!DOCUSEAL_URL || !DOCUSEAL_TOKEN) {
      return NextResponse.json({ erro: 'Docuseal não configurado no servidor. Defina DOCUSEAL_URL e DOCUSEAL_TOKEN.' }, { status: 500 });
    }


    const supabase = db();

    const [{ data: empresa, error: empErr }, { data: unidades }] = await Promise.all([
      supabase.from('empresas').select('modulos').eq('id', empresa_id).single(),
      supabase.from('unidades').select('nome, razao_social, cnpj, endereco, cidade').eq('empresa_id', empresa_id),
    ]);

    if (empErr) return NextResponse.json({ erro: 'Erro ao buscar empresa: ' + empErr!.message }, { status: 500 });
    if (!empresa?.modulos?.assinatura) {
      return NextResponse.json({ erro: 'Add-on de Assinatura Digital não habilitado para esta empresa.' }, { status: 403 });
    }

    const unidadeMatch = unidades?.find((u: any) => u.nome === deal.unidade) || unidades?.[0];
    const emissora = {
      razao: unidadeMatch?.razao_social || '',
      cnpj: unidadeMatch?.cnpj || '',
      endereco: unidadeMatch?.endereco || '',
      nome: unidadeMatch?.nome || '',
    };

    // Gera PDF do contrato
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await gerarContratoBuffer({
        protocolo: String(deal.id || '').padStart(6, '0'),
        emissora_razao: emissora.razao,
        emissora_cnpj: emissora.cnpj,
        emissora_endereco: emissora.endereco,
        emissora_nome: emissora.nome,
        cliente: deal.empresa || signers[0]?.name || '',
        cnpj: deal.cnpj || '',
        inscricao_estadual: deal.inscricao_estadual || '',
        telefone: deal.telefone || '',
        cidade: deal.cidade || '',
        contrato_inicio: deal.contrato_inicio || '',
        contrato_fim: deal.contrato_fim || '',
        itens: deal.itens || [],
        desconto: deal.desconto || 0,
        valor_total: deal.valor_total || 0,
        parcelas: deal.parcelas || '',
        vencimento: deal.vencimento || '',
      });
    } catch (err: any) {
      console.error('[docuseal/pdf]', err);
      return NextResponse.json({ erro: 'Erro ao gerar PDF: ' + err.message }, { status: 500 });
    }

    // 1. Cria template no Docuseal com o PDF gerado
    const templateRes = await fetch(`${DOCUSEAL_URL}/templates/pdf`, {
      method: 'POST',
      headers: { 'X-Auth-Token': DOCUSEAL_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Contrato — ${deal.empresa || 'Cliente'} (#${String(deal.id).padStart(4, '0')})`,
        documents: [{ name: 'contrato.pdf', type: 'application/pdf', content: pdfBuffer.toString('base64') }],
      }),
    });

    if (!templateRes.ok) {
      const txt = await templateRes.text();
      console.error('[docuseal/template]', templateRes.status, txt.slice(0, 300));
      return NextResponse.json({ erro: `[URL:${DOCUSEAL_URL}] ${txt.slice(0, 200)}` }, { status: 502 });
    }

    const template = await templateRes.json();
    const templateId = template.id;

    // 2. Cria submissão (envio para assinatura)
    const submissionRes = await fetch(`${DOCUSEAL_URL}/submissions`, {
      method: 'POST',
      headers: { 'X-Auth-Token': DOCUSEAL_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template_id: templateId,
        send_email: false,
        submitters: signers.map((s: any) => ({
          name: s.name,
          email: s.email || `noreply+${Date.now()}@wegrow.com.br`,
          role: 'Signer',
          ...(s.phone ? { phone: s.phone.replace(/\D/g, '') } : {}),
        })),
      }),
    });

    if (!submissionRes.ok) {
      const txt = await submissionRes.text();
      console.error('[docuseal/submission]', submissionRes.status, txt.slice(0, 300));
      return NextResponse.json({ erro: 'Erro ao criar submissão no Docuseal: ' + txt.slice(0, 200) }, { status: 502 });
    }

    const submitters: any[] = await submissionRes.json();
    const first = submitters[0];
    const signUrl = `${DOCUSEAL_SIGN_BASE}/s/${first.slug}`;

    return NextResponse.json({
      ok: true,
      submission_id: String(first.submission_id),
      sign_url: signUrl,
    });

  } catch (err: any) {
    console.error('[docuseal/unhandled]', err);
    return NextResponse.json({ erro: 'Erro interno: ' + (err?.message || String(err)) }, { status: 500 });
  }
}
