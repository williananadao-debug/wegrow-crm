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

export async function POST(req: Request) {
  try {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

  const { empresa_id, deal, signers } = body;
  if (!empresa_id || !signers?.length) {
    return NextResponse.json({ erro: 'Campos obrigatórios: empresa_id, signers.' }, { status: 422 });
  }

  const supabase = db();

  const [{ data: empresa, error: empErr }, { data: unidades }] = await Promise.all([
    supabase.from('empresas').select('modulos').eq('id', empresa_id).single(),
    supabase.from('unidades').select('nome, razao_social, cnpj, endereco, cidade').eq('empresa_id', empresa_id),
  ]);

  if (empErr) {
    console.error('[zapsign/supabase]', empErr);
    return NextResponse.json({ erro: 'Erro ao buscar dados da empresa: ' + empErr.message }, { status: 500 });
  }

  const apiToken = empresa?.modulos?.zapsign_token;
  if (!apiToken) {
    return NextResponse.json({ erro: 'Token ZapSign não configurado. Configure em Admin → cliente → ZapSign.' }, { status: 400 });
  }

  // Dados da emissora (unidade que corresponde ao deal, ou a primeira)
  const unidadeMatch = unidades?.find((u: any) => u.nome === deal?.unidade) || unidades?.[0];
  const emissora = {
    razao: unidadeMatch?.razao_social || 'Demais FM',
    cnpj: unidadeMatch?.cnpj || '',
    endereco: unidadeMatch?.endereco || '',
    nome: unidadeMatch?.nome || 'Demais FM',
  };

  // Gera PDF completo com todos os dados
  let pdfBase64: string;
  try {
    const buffer = await gerarContratoBuffer({
      protocolo: deal?.id ? String(deal.id).padStart(6, '0') : '000000',
      emissora_razao: emissora.razao,
      emissora_cnpj: emissora.cnpj,
      emissora_endereco: emissora.endereco,
      emissora_nome: emissora.nome,
      cliente: deal?.empresa || signers[0]?.name || '',
      cnpj: deal?.cnpj || '',
      inscricao_estadual: deal?.inscricao_estadual || '',
      telefone: deal?.telefone || '',
      cidade: deal?.cidade || '',
      contrato_inicio: deal?.contrato_inicio || '',
      contrato_fim: deal?.contrato_fim || '',
      itens: deal?.itens || [],
      desconto: deal?.desconto || 0,
      valor_total: deal?.valor_total || 0,
      parcelas: deal?.parcelas || '',
      vencimento: deal?.vencimento || '',
    });
    pdfBase64 = buffer.toString('base64');
  } catch (err: any) {
    console.error('[zapsign/pdf]', err);
    return NextResponse.json({ erro: 'Erro ao gerar PDF do contrato: ' + err.message }, { status: 500 });
  }

  const docName = deal?.empresa ? `Contrato — ${deal.empresa}` : 'Contrato WeGrow';

  const zapRes = await fetch('https://api.zapsign.com.br/api/v1/docs/', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: docName,
      base64_pdf: pdfBase64,
      signers: signers.map((s: any) => {
        const phoneDigits = s.phone ? s.phone.replace(/\D/g, '') : '';
        const phoneNumber = phoneDigits.startsWith('55') ? phoneDigits.slice(2) : phoneDigits;
        return {
          name: s.name,
          email: s.email || undefined,
          phone_country: phoneDigits ? '55' : undefined,
          phone_number: phoneNumber || undefined,
          send_automatic_email: Boolean(s.email),
          send_automatic_whatsapp: Boolean(phoneDigits && !s.email),
        };
      }),
    }),
  });

  const zapData = await zapRes.json();
  if (!zapRes.ok) {
    console.error('[zapsign]', zapData);
    return NextResponse.json({ erro: zapData?.detail || 'Erro ao criar documento no ZapSign.' }, { status: 502 });
  }

  const link = zapData.signers?.[0]?.sign_url ?? null;
  return NextResponse.json({ ok: true, doc_token: zapData.token, sign_url: link, open_id: zapData.open_id });

  } catch (err: any) {
    console.error('[zapsign/unhandled]', err);
    return NextResponse.json({ erro: 'Erro interno: ' + (err?.message || String(err)) }, { status: 500 });
  }
}
