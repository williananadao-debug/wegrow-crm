import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { FocusNfeAmbiente } from '@/lib/focusNfe';
import {
  montarPayloadRemessaConserto, emitirNota,
  type EmitenteFiscal, type DestinatarioFiscal, type ItemFiscal, type ModalidadeFrete,
} from '@/lib/focusNfeEmissao';
import { motivoRecusaNf } from '@/lib/fiscalMotivo';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function soDigitos(v: unknown) { return String(v ?? '').replace(/\D/g, ''); }
function texto(v: unknown, max = 120) { return String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max); }

// POST — NF-e avulsa de remessa para conserto (ex.: peça enviada ao fabricante na garantia).
// Destinatário digitado na hora (oficina/fabricante não precisa estar em Clientes), itens
// livres. SÓ DIRETOR. Mesmo fluxo assíncrono das outras: grava "processando" e o webhook do
// Focus NFe atualiza pra autorizada/recusada (casa pelo ref, que não leva lead).
export async function POST(req: NextRequest) {
  const db = supabaseAdmin();

  const accessToken = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!accessToken) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  const { data: { user } } = await db.auth.getUser(accessToken);
  if (!user) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 });
  const { data: perfil } = await db.from('profiles').select('empresa_id, cargo').eq('id', user.id).maybeSingle();
  if (!perfil?.empresa_id) return NextResponse.json({ error: 'Empresa não identificada.' }, { status: 403 });
  if (perfil.cargo !== 'diretor') return NextResponse.json({ error: 'Só a diretoria pode emitir nota avulsa.' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const d = body?.destinatario || {};
  const destinatario: DestinatarioFiscal = {
    nome: texto(d.nome, 60), cnpjOuCpf: soDigitos(d.cnpj), ie: soDigitos(d.ie) || (/isent/i.test(String(d.ie || '')) ? 'ISENTO' : null),
    endereco: texto(d.endereco, 60), numero: texto(d.numero, 10) || null, bairro: texto(d.bairro, 60) || null,
    cep: soDigitos(d.cep) || null, municipio: texto(d.municipio, 60), uf: texto(d.uf, 2).toUpperCase(),
    telefone: soDigitos(d.telefone) || null, email: texto(d.email, 60) || null,
  };
  if (![11, 14].includes(destinatario.cnpjOuCpf.length)) return NextResponse.json({ error: 'CNPJ/CPF do destinatário inválido.' }, { status: 400 });
  if (!destinatario.nome || !destinatario.endereco || !destinatario.municipio || destinatario.uf.length !== 2) {
    return NextResponse.json({ error: 'Preencha nome, endereço, município e UF do destinatário.' }, { status: 400 });
  }

  const itens: ItemFiscal[] = (Array.isArray(body?.itens) ? body.itens : []).map((i: Record<string, unknown>) => ({
    descricao: texto(i.descricao, 120), ncm: soDigitos(i.ncm),
    quantidade: Number(i.quantidade), valorUnitario: Math.round(Number(i.valorUnitario) * 100) / 100,
  }));
  if (!itens.length) return NextResponse.json({ error: 'Inclua pelo menos um item.' }, { status: 400 });
  for (const [n, i] of itens.entries()) {
    if (!i.descricao) return NextResponse.json({ error: `Item ${n + 1}: falta a descrição.` }, { status: 400 });
    if (i.ncm.length !== 8) return NextResponse.json({ error: `Item ${n + 1}: NCM precisa ter 8 dígitos.` }, { status: 400 });
    if (!(i.quantidade > 0) || !(i.valorUnitario > 0)) return NextResponse.json({ error: `Item ${n + 1}: quantidade e valor precisam ser maiores que zero.` }, { status: 400 });
  }

  const chaveReferenciada = soDigitos(body?.chaveReferenciada) || null;
  if (chaveReferenciada && chaveReferenciada.length !== 44) {
    return NextResponse.json({ error: 'A chave da nota de compra precisa ter 44 dígitos (ou deixe em branco).' }, { status: 400 });
  }
  const observacao = texto(body?.observacao, 500) || null;
  const modalidadeFrete: ModalidadeFrete = [0, 1, 9].includes(Number(body?.modalidadeFrete)) ? Number(body.modalidadeFrete) as ModalidadeFrete : 9;

  const { data: integracao } = await db.from('fiscal_integracoes').select('*').eq('empresa_id', perfil.empresa_id).maybeSingle();
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

  // Clique duplo: remessa pro mesmo destinatário ainda processando → não emite outra.
  const { data: emAndamento } = await db.from('fiscal_notas').select('id')
    .eq('empresa_id', perfil.empresa_id).eq('cnpj_participante', destinatario.cnpjOuCpf).eq('status', 'processando')
    .like('ref_focus_nfe', 'nfrc%').limit(1).maybeSingle();
  if (emAndamento) return NextResponse.json({ error: 'Já tem uma remessa para esse destinatário sendo processada — aguarde o resultado.' }, { status: 409 });

  const payload = montarPayloadRemessaConserto({ emitente, destinatario, itens, chaveReferenciada, observacao, modalidadeFrete });
  const ref = `nfrc${Date.now()}`;
  const total = Number(itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0).toFixed(2));

  const { data: notaRascunho, error: erroInsert } = await db.from('fiscal_notas').insert([{
    empresa_id: perfil.empresa_id, tipo: 'saida', status: 'processando', origem: 'emissao_wegrow',
    ref_focus_nfe: ref, chave_nf_referenciada: chaveReferenciada, valor_total: total,
    cnpj_participante: destinatario.cnpjOuCpf, nome_participante: destinatario.nome,
    observacao: `Remessa para conserto (${itens.map(i => i.descricao).join('; ').slice(0, 150)}) — aguardando autorização da SEFAZ.`,
  }]).select('id').single();
  if (erroInsert) return NextResponse.json({ error: `Falha ao registrar nota localmente: ${erroInsert.message}` }, { status: 500 });

  try {
    const resultado = await emitirNota(token, ambiente, ref, payload);
    if (resultado.status >= 400) {
      await db.from('fiscal_notas').update({ status: 'erro_autorizacao', observacao: JSON.stringify(resultado.corpo) }).eq('id', notaRascunho.id);
      return NextResponse.json({ error: `Focus NFe recusou a emissão: ${motivoRecusaNf(JSON.stringify(resultado.corpo)) || 'sem detalhe'}`, detalhe: resultado.corpo }, { status: 502 });
    }
    return NextResponse.json({ ok: true, ref, notaId: notaRascunho.id, ambiente, status: resultado.corpo?.status || 'processando_autorizacao' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha ao emitir a remessa.';
    await db.from('fiscal_notas').update({ status: 'erro_autorizacao', observacao: msg }).eq('id', notaRascunho.id);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
