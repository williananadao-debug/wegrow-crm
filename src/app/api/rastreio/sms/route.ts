import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { usuarioRastreio } from '@/lib/rastreio';
import { COMANDOS, textoComando, type ComandoAparelho } from '@/lib/rastreioAparelho';
import { enviarSms, smsConfigurado, textoSmsValido } from '@/lib/rastreioSms';

export const dynamic = 'force-dynamic';

// Comando por SMS para o chip do rastreador (instalação: APN, servidor; plano B sem internet).
//   {acao:'status'}                                  → envio de SMS está configurado?
//   {acao:'enviar', veiculoId, texto}                → texto livre (assistente de instalação)
//   {acao:'enviar', veiculoId, comando, params}      → mesmo comando da internet, por SMS
export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const u = await usuarioRastreio(db, req);
  if (!u) return NextResponse.json({ error: 'Sem acesso ao módulo Rastreio.' }, { status: 401 });
  const c = await req.json().catch(() => ({}));
  if (c.acao === 'status') return NextResponse.json({ configurado: smsConfigurado() });
  if (!['diretor', 'gerente'].includes(u.cargo || '')) return NextResponse.json({ error: 'Só diretor ou gerente configura o rastreador.' }, { status: 403 });

  const { data: v } = await db.from('rastreio_veiculos').select('id, empresa_id, placa, chip_numero')
    .eq('id', String(c.veiculoId || '')).eq('empresa_id', u.empresaId).maybeSingle();
  if (!v) return NextResponse.json({ error: 'Veículo não encontrado.' }, { status: 404 });
  if (!v.chip_numero) return NextResponse.json({ error: 'Cadastre o número do chip no veículo.' }, { status: 400 });

  let texto: string;
  try {
    texto = c.comando ? (String(c.comando) in COMANDOS ? textoComando(c.comando as ComandoAparelho, c.params || {}) : '') : String(c.texto || '').trim();
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  if (!texto || !textoSmsValido(texto)) return NextResponse.json({ error: 'Comando inválido para SMS.' }, { status: 400 });

  try {
    await enviarSms(v.chip_numero, texto);
    await db.from('rastreio_comandos').insert({
      empresa_id: v.empresa_id, veiculo_id: v.id, tipo: 'configurar', comando: texto, status: 'enviado', motivo: 'SMS para o chip',
      detalhe: 'Enviado por SMS. A resposta do aparelho aparece em Respostas do aparelho.', origem: 'painel', user_id: u.id, user_nome: u.nome,
    });
    return NextResponse.json({ ok: true, texto, mensagem: `SMS enviado para ${v.chip_numero}. A resposta chega em alguns segundos.` });
  } catch (e) {
    await db.from('rastreio_comandos').insert({
      empresa_id: v.empresa_id, veiculo_id: v.id, tipo: 'configurar', comando: texto, status: 'erro', motivo: 'SMS para o chip',
      detalhe: (e as Error).message, origem: 'painel', user_id: u.id, user_nome: u.nome,
    });
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
