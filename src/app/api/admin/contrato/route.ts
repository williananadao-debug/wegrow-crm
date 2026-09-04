import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { gerarContratoWegrowBuffer } from '@/lib/contract-wegrow-pdf';

export const dynamic = 'force-dynamic';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);
// Docuseal Cloud hospedado (api.docuseal.com) — não é o self-hosted do Railway, que no
// plano free bloqueia os endpoints de criar template via API (/templates/pdf retorna 404
// "available in Pro Edition"). O hospedado libera isso mesmo sem pagar.
const DOCUSEAL_URL = (process.env.DOCUSEAL_URL || '').replace(/\/$/, '');
const DOCUSEAL_TOKEN = process.env.DOCUSEAL_TOKEN || '';
const DOCUSEAL_SIGN_BASE = (process.env.DOCUSEAL_SIGN_BASE_URL || DOCUSEAL_URL).replace(/\/$/, '');

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

// POST — gera o PDF já com os dados do cliente preenchidos, cria o template no Docuseal
// com os campos de assinatura já posicionados e dispara o envio pra assinatura, tudo
// numa chamada só.
export async function POST(request: Request) {
  const admin = await verificarAdmin(request);
  if (!admin) return NextResponse.json({ erro: 'Acesso negado.' }, { status: 403 });
  if (!DOCUSEAL_URL || !DOCUSEAL_TOKEN)
    return NextResponse.json({ erro: 'Docuseal não configurado no servidor (DOCUSEAL_URL/DOCUSEAL_TOKEN).' }, { status: 500 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }

  const { empresa_id, cliente_razao, cliente_cnpj, cliente_endereco, valor_mensal, fidelidade_meses, dia_vencimento, data_inicio, signer_nome, signer_email } = body;
  if (!empresa_id || !cliente_razao || !cliente_cnpj || !cliente_endereco || !valor_mensal || !signer_nome || !signer_email) {
    return NextResponse.json({ erro: 'empresa_id, cliente_razao, cliente_cnpj, cliente_endereco, valor_mensal, signer_nome e signer_email são obrigatórios.' }, { status: 422 });
  }

  const db = supabaseAdmin();
  const { data: empresa } = await db.from('empresas').select('modulos').eq('id', empresa_id).single();

  let pdfBuffer: Buffer;
  let sigYFracContratada: number, sigYFracContratante: number, sigPageContratada: number, sigPageContratante: number;
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
      fidelidade_meses: Number(fidelidade_meses) || 0,
      dia_vencimento: Number(dia_vencimento) || 10,
      data_inicio: fmtData(data_inicio) || fmtData(new Date().toISOString()),
      data_assinatura: `${FORO_COMARCA}, ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}`,
      foro_comarca: FORO_COMARCA,
      canal_suporte: CANAL_SUPORTE,
      sla_resposta: SLA_RESPOSTA,
    });
    pdfBuffer = resultado.buffer;
    sigPageContratada = resultado.sigPageContratada;
    sigYFracContratada = resultado.sigYFracContratada;
    sigPageContratante = resultado.sigPageContratante;
    sigYFracContratante = resultado.sigYFracContratante;
  } catch (err: any) {
    console.error('[admin/contrato/pdf]', err);
    return NextResponse.json({ erro: 'Erro ao gerar PDF: ' + err.message }, { status: 500 });
  }

  // Cópia de backup no storage — não é o caminho principal (esse é via Docuseal, logo
  // abaixo), só um jeito de sempre ter o PDF acessível mesmo se o Docuseal ficar fora do
  // ar ou o admin precisar reenviar sem gerar tudo de novo.
  const path = `${empresa_id}/contrato.pdf`;
  await db.storage.from('wegrow-documentos').upload(path, pdfBuffer, { contentType: 'application/pdf', upsert: true });

  const templateRes = await fetch(`${DOCUSEAL_URL}/templates/pdf`, {
    method: 'POST',
    headers: { 'X-Auth-Token': DOCUSEAL_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `Contrato de serviço — ${cliente_razao}`,
      documents: [{
        name: 'contrato.pdf',
        file: pdfBuffer.toString('base64'),
        fields: [{
          name: 'Assinatura WeGrow',
          role: 'Contratada',
          type: 'signature',
          required: true,
          areas: [{ x: 0.08, y: sigYFracContratada, w: 0.28, h: 0.06, page: sigPageContratada }],
        }, {
          name: 'Assinatura Cliente',
          role: 'Contratante',
          type: 'signature',
          required: true,
          areas: [{ x: 0.64, y: sigYFracContratante, w: 0.28, h: 0.06, page: sigPageContratante }],
        }],
      }],
    }),
  });

  if (!templateRes.ok) {
    const txt = await templateRes.text();
    console.error('[admin/contrato/template]', templateRes.status, txt.slice(0, 300));
    return NextResponse.json({ erro: 'Erro ao criar template no Docuseal: ' + txt.slice(0, 200) }, { status: 502 });
  }

  const template = await templateRes.json();

  const submissionRes = await fetch(`${DOCUSEAL_URL}/submissions`, {
    method: 'POST',
    headers: { 'X-Auth-Token': DOCUSEAL_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template_id: template.id,
      send_email: true,
      order: 'preserved', // WeGrow assina primeiro, cliente só recebe o e-mail depois
      submitters: [
        { name: admin.user_metadata?.nome || admin.email, email: admin.email, role: 'Contratada', order: 0 },
        { name: signer_nome, email: signer_email, role: 'Contratante', order: 1 },
      ],
    }),
  });

  if (!submissionRes.ok) {
    const txt = await submissionRes.text();
    console.error('[admin/contrato/submission]', submissionRes.status, txt.slice(0, 300));
    return NextResponse.json({ erro: 'Erro ao enviar pra assinatura: ' + txt.slice(0, 200) }, { status: 502 });
  }

  const submitters: any[] = await submissionRes.json();
  const contratadaSubmitter = submitters.find((s: any) => s.role === 'Contratada') || submitters[0];
  const contratanteSubmitter = submitters.find((s: any) => s.role === 'Contratante') || submitters[1];
  const signUrl = contratanteSubmitter ? `${DOCUSEAL_SIGN_BASE}/s/${contratanteSubmitter.slug}` : null;
  // Link do próprio Willian (Contratada, order:0) — precisa ser devolvido e usado
  // explicitamente, senão ninguém nunca clica nele e o contrato fica esperando a
  // assinatura da WeGrow pra sempre enquanto o cliente já recebeu o link dele.
  const signUrlContratada = contratadaSubmitter ? `${DOCUSEAL_SIGN_BASE}/s/${contratadaSubmitter.slug}` : null;

  const { error: updateErr } = await db.from('clientes_wegrow').upsert({
    empresa_id,
    razao_social: cliente_razao,
    cnpj: cliente_cnpj,
    endereco: cliente_endereco,
    contrato_arquivo_path: path,
    contrato_template_id: String(template.id),
    contrato_submission_id: String(contratanteSubmitter?.submission_id ?? ''),
    contrato_status: 'enviado',
    contrato_signer_nome: signer_nome,
    contrato_signer_email: signer_email,
    contrato_sign_url: signUrl,
    contrato_enviado_em: new Date().toISOString(),
    contrato_assinado_em: null,
  }, { onConflict: 'empresa_id' });

  if (updateErr) return NextResponse.json({ erro: 'Enviado no Docuseal, mas falhou ao salvar status: ' + updateErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, sign_url: signUrl, sign_url_contratada: signUrlContratada });
}
