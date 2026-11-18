import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { hashToken } from '@/lib/rastreioApp';

export const dynamic = 'force-dynamic';

// Público: posição atual de UM veículo enquanto o link compartilhado valer. Nada de histórico,
// cliente, IMEI ou bloqueio — só o necessário para acompanhar no mapa.
export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get('t') || '';
  if (t.length < 20) return NextResponse.json({ error: 'Link inválido.' }, { status: 404 });
  const db = supabaseAdmin();
  const { data: c } = await db.from('rastreio_compartilhamentos').select('empresa_id, veiculo_id, expira_em, revogado_em')
    .eq('token_hash', hashToken(t)).maybeSingle();
  if (!c || c.revogado_em) return NextResponse.json({ error: 'Link inválido ou cancelado.' }, { status: 404 });
  if (new Date(c.expira_em).getTime() < Date.now()) return NextResponse.json({ error: 'Este link expirou.' }, { status: 410 });
  const [{ data: v }, { data: e }] = await Promise.all([
    db.from('rastreio_veiculos').select('placa, descricao, tipo, bloqueado, ultima_lat, ultima_lng, ultima_velocidade, ultimo_curso, ignicao, ultima_posicao_em, ultima_comunicacao_em')
      .eq('id', c.veiculo_id).eq('status', 'ativo').maybeSingle(),
    db.from('empresas').select('nome, logo_url, cor_primaria').eq('id', c.empresa_id).maybeSingle(),
  ]);
  if (!v) return NextResponse.json({ error: 'Veículo indisponível.' }, { status: 404 });
  return NextResponse.json({
    empresa: { nome: e?.nome || 'Rastreamento', logo: e?.logo_url || null, cor: e?.cor_primaria || '#38BDF8' },
    veiculo: v, expira: c.expira_em, restanteMin: Math.max(0, Math.round((new Date(c.expira_em).getTime() - Date.now()) / 60000)),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
