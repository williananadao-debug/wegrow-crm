import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { FocusNfeAmbiente } from '@/lib/focusNfe';
import { montarPayloadNF1, emitirNota, type EmitenteFiscal, type DestinatarioFiscal, type ItemFiscal } from '@/lib/focusNfeEmissao';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// POST { leadId } — emite a NF1 (CFOP 5922, simples faturamento, valor cheio) de uma venda
// fechada no Pulse. Fila assíncrona no Focus NFe — o resultado final (autorizado/erro) chega
// depois pelo webhook /api/webhooks/focus-nfe/emitida, que atualiza esse mesmo registro.
export async function POST(req: NextRequest) {
  const db = supabaseAdmin();

  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!accessToken) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const { data: { user }, error: authError } = await db.auth.getUser(accessToken);
  if (authError || !user) return NextResponse.json({ error: 'Token inválido.' }, { status: 401 });

  const { data: perfil } = await db.from('profiles').select('empresa_id, cargo').eq('id', user.id).single();
  if (!perfil?.empresa_id) return NextResponse.json({ error: 'Empresa não identificada.' }, { status: 400 });
  if (perfil.cargo !== 'diretor' && perfil.cargo !== 'gerente') {
    return NextResponse.json({ error: 'Só diretor ou gerente pode emitir NF.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const leadId = body?.leadId;
  if (!leadId) return NextResponse.json({ error: 'leadId é obrigatório.' }, { status: 422 });

  const { data: lead } = await db.from('leads').select('id, empresa, telefone, cnpj, valor_total, itens, client_id, empresa_id')
    .eq('id', leadId).eq('empresa_id', perfil.empresa_id).single();
  if (!lead) return NextResponse.json({ error: 'Venda não encontrada.' }, { status: 404 });

  const { data: jaEmitida } = await db.from('fiscal_notas').select('id, status')
    .eq('lead_id', leadId).eq('origem', 'emissao_wegrow').eq('tipo', 'saida').is('chave_nf_referenciada', null)
    .maybeSingle();
  if (jaEmitida) return NextResponse.json({ error: `Já existe uma NF1 (${jaEmitida.status}) pra essa venda.` }, { status: 409 });

  const { data: cliente } = lead.client_id
    ? await db.from('clientes').select('nome_empresa, cnpj, endereco, numero, bairro, cep, cidade, estado, telefone, email').eq('id', lead.client_id).single()
    : { data: null };
  if (!cliente) return NextResponse.json({ error: 'Cliente da venda não tem cadastro completo (endereço/cidade/estado) — complete em Clientes antes de emitir.' }, { status: 400 });
  if (!cliente.endereco || !cliente.cidade || !cliente.estado || !cliente.cnpj) {
    return NextResponse.json({ error: 'Cliente sem CNPJ/CPF, endereço, cidade ou estado cadastrados — complete o cadastro em Clientes antes de emitir a NF.' }, { status: 400 });
  }

  const { data: integracao } = await db.from('fiscal_integracoes')
    .select('token_producao, token_homologacao, ambiente_ativo, ie, im, endereco, numero, bairro, cep, municipio, codigo_municipio, uf, telefone, email, regime_tributario')
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

  const itensLead = (Array.isArray(lead.itens) ? lead.itens : []) as { servico: string; quantidade: number; precoUnitario: number; servicoId?: number }[];
  if (itensLead.length === 0) return NextResponse.json({ error: 'Venda sem itens.' }, { status: 400 });

  const nomesServicos = itensLead.map(i => i.servico);
  const { data: servicos } = await db.from('servicos').select('nome, ncm').eq('empresa_id', perfil.empresa_id).in('nome', nomesServicos);
  const ncmPorNome = new Map((servicos || []).map(s => [s.nome, s.ncm]));

  const semNcm = itensLead.filter(i => !ncmPorNome.get(i.servico));
  if (semNcm.length > 0) {
    return NextResponse.json({ error: `Produto(s) sem NCM cadastrado: ${semNcm.map(i => i.servico).join(', ')}. Cadastre o NCM em Configurações antes de emitir.` }, { status: 400 });
  }

  const itens: ItemFiscal[] = itensLead.map(i => ({
    descricao: i.servico, ncm: ncmPorNome.get(i.servico)!, quantidade: i.quantidade, valorUnitario: i.precoUnitario,
  }));

  const emitente: EmitenteFiscal = {
    cnpj: empresa.cnpj, nome: empresa.nome, ie: integracao.ie, im: integracao.im,
    endereco: integracao.endereco, numero: integracao.numero || 'S/N', bairro: integracao.bairro || '',
    cep: integracao.cep || '', municipio: integracao.municipio || '', codigoMunicipio: integracao.codigo_municipio,
    uf: integracao.uf || '', telefone: integracao.telefone, email: integracao.email, regimeTributario: integracao.regime_tributario,
  };
  const destinatario: DestinatarioFiscal = {
    nome: cliente.nome_empresa, cnpjOuCpf: cliente.cnpj, endereco: cliente.endereco, numero: cliente.numero,
    bairro: cliente.bairro, cep: cliente.cep, municipio: cliente.cidade, uf: cliente.estado,
    telefone: cliente.telefone, email: cliente.email,
  };

  const payload = montarPayloadNF1({ emitente, destinatario, itens });
  const ref = `venda${leadId}nf1${Date.now()}`;

  const { data: notaRascunho, error: erroInsert } = await db.from('fiscal_notas').insert([{
    empresa_id: perfil.empresa_id, tipo: 'saida', status: 'processando', origem: 'emissao_wegrow',
    lead_id: leadId, ref_focus_nfe: ref, valor_total: lead.valor_total,
    cnpj_participante: soDigitos(cliente.cnpj), nome_participante: cliente.nome_empresa,
    observacao: 'NF1 (simples faturamento, entrega futura) — aguardando autorização da SEFAZ.',
  }]).select('id').single();
  if (erroInsert) return NextResponse.json({ error: `Falha ao registrar nota localmente: ${erroInsert.message}` }, { status: 500 });

  try {
    const resultado = await emitirNota(token, ambiente, ref, payload);
    if (resultado.status >= 400) {
      await db.from('fiscal_notas').update({ status: 'erro_autorizacao', observacao: JSON.stringify(resultado.corpo) }).eq('id', notaRascunho.id);
      return NextResponse.json({ error: 'Focus NFe recusou a emissão.', detalhe: resultado.corpo }, { status: 502 });
    }
    return NextResponse.json({ ok: true, ref, notaId: notaRascunho.id, status: resultado.corpo?.status || 'processando_autorizacao' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha ao emitir a NF1.';
    await db.from('fiscal_notas').update({ status: 'erro_autorizacao', observacao: msg }).eq('id', notaRascunho.id);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

function soDigitos(v: string) { return (v || '').replace(/\D/g, ''); }
