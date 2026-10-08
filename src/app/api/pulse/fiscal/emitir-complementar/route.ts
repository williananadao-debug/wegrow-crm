import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { FocusNfeAmbiente } from '@/lib/focusNfe';
import { montarPayloadComplementar, emitirNota, type EmitenteFiscal, type DestinatarioFiscal } from '@/lib/focusNfeEmissao';
import { motivoRecusaNf, ehNfComplementar } from '@/lib/fiscalMotivo';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function soDigitos(v: string | null | undefined) { return (v || '').replace(/\D/g, ''); }

// POST { notaId, valor, motivo, cfop, ncm } — emite NF-e complementar de VALOR (finalidade 2)
// de uma nota de saída já autorizada (inclusive as lançadas na mão / emitidas fora do sistema,
// ex.: NF 49 da Trailer Travel), levando só a diferença. SÓ DIRETOR. Mesmo fluxo assíncrono da
// NF1/NF2: grava "processando" e o webhook do Focus NFe atualiza pra autorizada/recusada.
export async function POST(req: NextRequest) {
  const db = supabaseAdmin();

  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!accessToken) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const { data: { user } } = await db.auth.getUser(accessToken);
  if (!user) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 });
  const { data: perfil } = await db.from('profiles').select('empresa_id, cargo').eq('id', user.id).maybeSingle();
  if (!perfil?.empresa_id) return NextResponse.json({ error: 'Empresa não identificada.' }, { status: 403 });
  if (perfil.cargo !== 'diretor') return NextResponse.json({ error: 'Só a diretoria pode emitir NF complementar.' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const notaId = Number(body?.notaId);
  const valor = Math.round(Number(body?.valor) * 100) / 100;
  const motivo = String(body?.motivo || '').trim().replace(/\s+/g, ' ');
  const cfop = soDigitos(body?.cfop);
  const ncm = soDigitos(body?.ncm);
  if (!Number.isInteger(notaId) || notaId <= 0) return NextResponse.json({ error: 'Nota inválida.' }, { status: 400 });
  if (!(valor > 0)) return NextResponse.json({ error: 'Informe o valor da diferença (maior que zero).' }, { status: 400 });
  if (motivo.length < 5) return NextResponse.json({ error: 'Descreva o motivo do complemento.' }, { status: 400 });
  if (cfop.length !== 4) return NextResponse.json({ error: 'CFOP inválido (4 dígitos, o mesmo da nota original).' }, { status: 400 });
  if (ncm.length !== 8) return NextResponse.json({ error: 'NCM inválido (8 dígitos).' }, { status: 400 });

  const { data: origem } = await db.from('fiscal_notas')
    .select('id, tipo, status, chave_acesso, numero, serie, lead_id, cnpj_participante, nome_participante, ref_focus_nfe')
    .eq('id', notaId).eq('empresa_id', perfil.empresa_id).maybeSingle();
  if (!origem) return NextResponse.json({ error: 'Nota não encontrada.' }, { status: 404 });
  if (origem.tipo !== 'saida' || origem.status !== 'autorizada') {
    return NextResponse.json({ error: 'Só dá pra complementar nota de saída autorizada.' }, { status: 409 });
  }
  if (ehNfComplementar(origem.ref_focus_nfe)) {
    return NextResponse.json({ error: 'Essa já é uma NF complementar — complemente a nota original.' }, { status: 409 });
  }
  const chaveOrigem = soDigitos(origem.chave_acesso);
  if (chaveOrigem.length !== 44) return NextResponse.json({ error: 'A nota original não tem a chave de acesso (44 dígitos) registrada.' }, { status: 400 });
  const numeroOrigem = origem.numero || String(parseInt(chaveOrigem.slice(25, 34), 10));

  // Destinatário = cliente da nota original: pela venda ligada, senão pelo CNPJ da nota.
  const colunasCliente = 'nome_empresa, cnpj, inscricao_estadual, endereco, numero, bairro, cep, cidade, estado, telefone, email';
  let cliente: { nome_empresa: string; cnpj: string; inscricao_estadual: string | null; endereco: string; numero: string | null; bairro: string | null; cep: string | null; cidade: string; estado: string; telefone: string | null; email: string | null } | null = null;
  if (origem.lead_id) {
    const { data: lead } = await db.from('leads').select('client_id').eq('id', origem.lead_id).eq('empresa_id', perfil.empresa_id).maybeSingle();
    if (lead?.client_id) cliente = (await db.from('clientes').select(colunasCliente).eq('id', lead.client_id).maybeSingle()).data;
  }
  if (!cliente && origem.cnpj_participante) {
    const doc = soDigitos(origem.cnpj_participante);
    const { data: candidatos } = await db.from('clientes').select(colunasCliente).eq('empresa_id', perfil.empresa_id).not('cnpj', 'is', null);
    cliente = (candidatos || []).find(c => soDigitos(c.cnpj) === doc) || null;
  }
  if (!cliente) return NextResponse.json({ error: 'Não achei o cadastro do cliente dessa nota (pela venda nem pelo CNPJ) — cadastre em Clientes antes.' }, { status: 400 });
  if (!cliente.endereco || !cliente.cidade || !cliente.estado || !cliente.cnpj) {
    return NextResponse.json({ error: 'Cliente sem CNPJ/CPF, endereço, cidade ou estado cadastrados — complete o cadastro em Clientes antes de emitir.' }, { status: 400 });
  }

  // Complementar pendente/autorizada da mesma nota → evita emitir duas vezes no clique duplo.
  const { data: emAndamento } = await db.from('fiscal_notas').select('id')
    .eq('empresa_id', perfil.empresa_id).eq('chave_nf_referenciada', origem.chave_acesso).eq('status', 'processando')
    .ilike('ref_focus_nfe', '%comp%').limit(1).maybeSingle();
  if (emAndamento) return NextResponse.json({ error: 'Já tem uma NF complementar dessa nota sendo processada — aguarde o resultado.' }, { status: 409 });

  const { data: integracao } = await db.from('fiscal_integracoes')
    .select('*') // '*' pra trazer aliquota_simples mesmo antes da migration
    .eq('empresa_id', perfil.empresa_id).maybeSingle();
  if (!integracao) return NextResponse.json({ error: 'Integração com o Focus NFe ainda não foi ativada.' }, { status: 400 });
  if (!integracao.ie || !integracao.endereco || !integracao.codigo_municipio) {
    return NextResponse.json({ error: 'Dados fiscais do emitente incompletos (IE/endereço/código do município) — configure antes de emitir.' }, { status: 400 });
  }
  const ambiente: FocusNfeAmbiente = integracao.ambiente_ativo === 'producao' ? 'producao' : 'homologacao';
  const token = ambiente === 'producao' ? integracao.token_producao : integracao.token_homologacao;
  if (!token) return NextResponse.json({ error: `Sem token de ${ambiente} configurado.` }, { status: 400 });

  const { data: empresa } = await db.from('empresas').select('nome, cnpj').eq('id', perfil.empresa_id).single();
  if (!empresa?.cnpj) return NextResponse.json({ error: 'Empresa sem CNPJ cadastrado.' }, { status: 400 });

  const emitente: EmitenteFiscal = {
    cnpj: empresa.cnpj, nome: empresa.nome, ie: integracao.ie, im: integracao.im,
    endereco: integracao.endereco, numero: integracao.numero || 'S/N', bairro: integracao.bairro || '',
    cep: integracao.cep || '', municipio: integracao.municipio || '', codigoMunicipio: integracao.codigo_municipio,
    uf: integracao.uf || '', telefone: integracao.telefone, email: integracao.email, regimeTributario: integracao.regime_tributario,
  };
  const destinatario: DestinatarioFiscal = {
    nome: cliente.nome_empresa, cnpjOuCpf: cliente.cnpj, endereco: cliente.endereco, numero: cliente.numero,
    bairro: cliente.bairro, cep: cliente.cep, municipio: cliente.cidade, uf: cliente.estado,
    telefone: cliente.telefone, email: cliente.email, ie: cliente.inscricao_estadual,
  };
  const aliquotaSimples = integracao.aliquota_simples != null ? Number(integracao.aliquota_simples) : null;

  const descricao = `Complemento de valor ref. NF ${numeroOrigem} - ${motivo}`.slice(0, 120);
  let payload;
  try { payload = montarPayloadComplementar({ emitente, destinatario, chaveOrigem, cfop, descricao, ncm, valor, aliquotaSimples }); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha ao montar a NF.' }, { status: 400 }); }
  const ref = `nf${origem.id}comp${Date.now()}`;

  const { data: notaRascunho, error: erroInsert } = await db.from('fiscal_notas').insert([{
    empresa_id: perfil.empresa_id, tipo: 'saida', status: 'processando', origem: 'emissao_wegrow',
    lead_id: origem.lead_id, ref_focus_nfe: ref, chave_nf_referenciada: origem.chave_acesso, valor_total: valor,
    cnpj_participante: soDigitos(cliente.cnpj), nome_participante: cliente.nome_empresa,
    observacao: `NF complementar de valor da NF ${numeroOrigem} (${motivo}) — aguardando autorização da SEFAZ.`,
  }]).select('id').single();
  if (erroInsert) return NextResponse.json({ error: `Falha ao registrar nota localmente: ${erroInsert.message}` }, { status: 500 });

  try {
    const resultado = await emitirNota(token, ambiente, ref, payload);
    if (resultado.status >= 400) {
      await db.from('fiscal_notas').update({ status: 'erro_autorizacao', observacao: JSON.stringify(resultado.corpo) }).eq('id', notaRascunho.id);
      return NextResponse.json({ error: `Focus NFe recusou a emissão: ${motivoRecusaNf(JSON.stringify(resultado.corpo)) || 'sem detalhe'}`, detalhe: resultado.corpo }, { status: 502 });
    }
    return NextResponse.json({ ok: true, ref, notaId: notaRascunho.id, status: resultado.corpo?.status || 'processando_autorizacao' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha ao emitir a NF complementar.';
    await db.from('fiscal_notas').update({ status: 'erro_autorizacao', observacao: msg }).eq('id', notaRascunho.id);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
