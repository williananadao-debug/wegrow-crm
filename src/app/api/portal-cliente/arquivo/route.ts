import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE_SESSAO, dbAdmin, obterSessao } from '@/lib/portal-cliente';

export const dynamic = 'force-dynamic';

// Download do contrato: o bucket "contratos-assinados" é privado — confere que a venda é do
// cliente da sessão e devolve um link assinado de curta duração. O caminho do arquivo nunca
// vem da URL (só o índice), então não dá pra pedir arquivo de outra venda trocando o path.
export async function GET(req: Request) {
  const db = dbAdmin();
  const sessao = await obterSessao(db, (await cookies()).get(COOKIE_SESSAO)?.value);
  if (!sessao) return NextResponse.json({ erro: 'Sessão expirada.' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const leadId = Number(searchParams.get('lead'));
  const tipo = searchParams.get('tipo');
  const i = Number(searchParams.get('i'));
  if (!Number.isInteger(leadId) || !Number.isInteger(i) || i < 0 || (tipo !== 'docuseal' && tipo !== 'manual')) {
    return NextResponse.json({ erro: 'Arquivo inválido.' }, { status: 400 });
  }

  const { data: lead } = await db.from('leads')
    .select('docuseal_arquivos, contrato_manual_arquivos, contrato_manual_url')
    .eq('id', leadId).eq('empresa_id', sessao.empresa_id).eq('client_id', sessao.cliente_id).eq('status', 'ganho')
    .maybeSingle();
  if (!lead) return NextResponse.json({ erro: 'Arquivo não encontrado.' }, { status: 404 });

  const lista: { path: string }[] = tipo === 'docuseal'
    ? (Array.isArray(lead.docuseal_arquivos) ? lead.docuseal_arquivos : [])
    : (Array.isArray(lead.contrato_manual_arquivos) && lead.contrato_manual_arquivos.length > 0
        ? lead.contrato_manual_arquivos
        : lead.contrato_manual_url ? [{ path: lead.contrato_manual_url }] : []);
  const path = lista[i]?.path;
  if (!path) return NextResponse.json({ erro: 'Arquivo não encontrado.' }, { status: 404 });

  const { data, error } = await db.storage.from('contratos-assinados').createSignedUrl(path, 300);
  if (error || !data?.signedUrl) return NextResponse.json({ erro: 'Não foi possível abrir o arquivo.' }, { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
