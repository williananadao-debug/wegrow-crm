import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { gerarContratoWegrowBuffer } from '@/lib/contract-wegrow-pdf';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);
// Só usada aqui pra devolver o link de onde subir o PDF manualmente — a criação de
// template via API é bloqueada no plano free do Docuseal self-hosted (ver comentário
// mais abaixo, no upload pro storage).
const DOCUSEAL_URL = (process.env.DOCUSEAL_URL || '').replace(/\/$/, '');

// Dados fixos da WeGrow como CONTRATADA — confirmados via consulta de CNPJ em 2026-08-17.
// Mudam raramente (endereço, regime); se mudar, é só editar aqui, não tem UI pra isso.
const WEGROW = {
  razao: 'Willian da Silva Anadão Tecnologia da Informação LTDA',
  cnpj: '66.660.599/0001-06',
  endereco: 'Rua Visconde do Rio Branco, 1488, Conj. 909, Centro, Curitiba/PR — CEP 80420-210',
  banco: 'Banco C6 S.A.',
};
const FORO_COMARCA = 'Curitiba/PR';
const CANAL_SUPORTE = 'WhatsApp';
const SLA_RESPOSTA = '24h úteis';

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function verificarAdmin(request: Request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const db = supabaseAdmin();
  const { data: { user } } = await db.auth.getUser(token);
  if (!user || !ADMIN_EMAILS.includes(user.email || '')) return null;
  return user;
}

function fmtData(d: string) {
  if (!d) return '';
  try { return new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('pt-BR'); } catch { return d; }
}

function nomesModulos(modulos: Record<string, any> | null | undefined) {
  const LABELS: Record<string, string> = {
    deals: 'Deals', pulse: 'Pulse', reports: 'Relatórios', midia: 'Mídia',
    financeiro: 'Financeiro', obras: 'Obras', argus: 'Argus', assinatura: 'Assinatura Digital',
  };
  if (!modulos) return 'a definir';
  const ativos = Object.entries(modulos).filter(([, v]) => v).map(([k]) => LABELS[k] || k);
  return ativos.length > 0 ? ativos.join(', ') : 'a definir';
}

// POST — gera o PDF já com os dados do cliente preenchidos e guarda num bucket privado.
// Não envia pro Docuseal automaticamente (ver comentário no upload, mais abaixo) — o
// admin baixa o PDF gerado e sobe manualmente no painel do Docuseal.
export async function POST(request: Request) {
  const admin = await verificarAdmin(request);
  if (!admin) return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

  const { empresa_id, cliente_razao, cliente_cnpj, cliente_endereco, valor_mensal, dia_vencimento, data_inicio, signer_nome, signer_email } = body;
  if (!empresa_id || !cliente_razao || !cliente_cnpj || !cliente_endereco || !valor_mensal || !signer_nome || !signer_email) {
    return NextResponse.json({ erro: 'empresa_id, cliente_razao, cliente_cnpj, cliente_endereco, valor_mensal, signer_nome e signer_email são obrigatórios.' }, { status: 422 });
  }

  const db = supabaseAdmin();
  const { data: empresa } = await db.from('empresas').select('modulos').eq('id', empresa_id).single();

  let pdfBuffer: Buffer;
  try {
    const resultado = await gerarContratoWegrowBuffer({
      contratada_razao: WEGROW.razao,
      contratada_cnpj: WEGROW.cnpj,
      contratada_endereco: WEGROW.endereco,
      contratada_banco: WEGROW.banco,
      cliente_razao,
      cliente_cnpj,
      cliente_endereco,
      modulos: nomesModulos(empresa?.modulos),
      valor_mensal: Number(valor_mensal),
      dia_vencimento: Number(dia_vencimento) || 10,
      data_inicio: fmtData(data_inicio) || fmtData(new Date().toISOString()),
      data_assinatura: `${FORO_COMARCA}, ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}`,
      foro_comarca: FORO_COMARCA,
      canal_suporte: CANAL_SUPORTE,
      sla_resposta: SLA_RESPOSTA,
    });
    pdfBuffer = resultado.buffer;
  } catch (err: any) {
    console.error('[admin/contrato/pdf]', err);
    return NextResponse.json({ erro: 'Erro ao gerar PDF: ' + err.message }, { status: 500 });
  }

  // O Docuseal self-hosted (plano free) bloqueia os endpoints de criar template via API
  // (/templates/pdf e /templates/html retornam 404 "available in Pro Edition") — só a
  // interface web permite criar template. Por isso o PDF é gerado aqui e guardado num
  // bucket privado pro admin baixar e subir manualmente no painel do Docuseal, em vez de
  // criar+enviar a submission automaticamente como o fluxo tentava antes.
  const path = `${empresa_id}/contrato.pdf`;
  const { error: uploadErr } = await db.storage.from('wegrow-documentos').upload(path, pdfBuffer, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (uploadErr) return NextResponse.json({ erro: 'PDF gerado, mas falhou ao salvar no storage: ' + uploadErr.message }, { status: 500 });

  const { error: updateErr } = await db.from('clientes_wegrow').upsert({
    empresa_id,
    razao_social: cliente_razao,
    cnpj: cliente_cnpj,
    endereco: cliente_endereco,
    contrato_arquivo_path: path,
    contrato_status: 'gerado',
    contrato_signer_nome: signer_nome,
    contrato_signer_email: signer_email,
  }, { onConflict: 'empresa_id' });

  if (updateErr) return NextResponse.json({ erro: 'PDF salvo, mas falhou ao atualizar status: ' + updateErr.message }, { status: 500 });

  const { data: signed } = await db.storage.from('wegrow-documentos').createSignedUrl(path, 60 * 30);
  return NextResponse.json({ ok: true, download_url: signed?.signedUrl ?? null, docuseal_url: DOCUSEAL_URL });
}
