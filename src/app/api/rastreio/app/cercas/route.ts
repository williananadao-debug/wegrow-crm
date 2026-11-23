import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { COOKIE_APP, obterSessaoApp, soVeiculosDaSessao, veiculoLiberado } from '@/lib/rastreioApp';

export const dynamic = 'force-dynamic';

const MAX_POR_VEICULO = 10;
const COLS = 'id, veiculo_id, nome, lat, lng, raio_m, ativo, dentro, tipo, poligono';

// App do cliente → cercas virtuais dos veículos dele (avisa quando entra/sai, mesmo motor do painel).
export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  const s = await obterSessaoApp(db, req.cookies.get(COOKIE_APP)?.value);
  if (!s) return NextResponse.json({ error: 'sem_sessao' }, { status: 401 });
  const { data: vs } = await soVeiculosDaSessao(db.from('rastreio_veiculos').select('id').eq('status', 'ativo'), s);
  const ids = (vs || []).map(v => v.id);
  const { data } = ids.length ? await db.from('rastreio_cercas').select(COLS).in('veiculo_id', ids).order('created_at') : { data: [] };
  return NextResponse.json({ cercas: data || [] });
}

export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  const s = await obterSessaoApp(db, req.cookies.get(COOKIE_APP)?.value);
  if (!s) return NextResponse.json({ error: 'sem_sessao' }, { status: 401 });
  const corpo = await req.json().catch(() => ({}));
  const acao = String(corpo.acao || '');

  if (acao === 'criar') {
    const veiculoId = String(corpo.veiculoId || '');
    if (!veiculoLiberado(s, veiculoId)) return NextResponse.json({ error: 'Veículo não encontrado.' }, { status: 404 });
    const { data: v } = await db.from('rastreio_veiculos').select('id, empresa_id').eq('id', veiculoId).eq('cliente_id', s.clienteId).eq('status', 'ativo').maybeSingle();
    if (!v) return NextResponse.json({ error: 'Veículo não encontrado.' }, { status: 404 });
    const nome = String(corpo.nome || '').trim().slice(0, 60);
    const lat = Number(corpo.lat), lng = Number(corpo.lng), raio = Math.round(Number(corpo.raio));
    if (!nome) return NextResponse.json({ error: 'Dê um nome para a cerca (ex.: Casa, Trabalho).' }, { status: 400 });
    if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180) || (lat === 0 && lng === 0)) return NextResponse.json({ error: 'Escolha o ponto no mapa.' }, { status: 400 });
    if (!(raio >= 50 && raio <= 50000)) return NextResponse.json({ error: 'Raio entre 50 m e 50 km.' }, { status: 400 });
    const { count } = await db.from('rastreio_cercas').select('id', { count: 'exact', head: true }).eq('veiculo_id', v.id);
    if ((count || 0) >= MAX_POR_VEICULO) return NextResponse.json({ error: `Limite de ${MAX_POR_VEICULO} cercas por veículo.` }, { status: 400 });
    const linha = { empresa_id: v.empresa_id, veiculo_id: v.id, nome, tipo: 'circulo', lat, lng, raio_m: raio, ativo: true };
    let { error } = await db.from('rastreio_cercas').insert({ ...linha, criada_pelo_cliente: true });
    if (error) ({ error } = await db.from('rastreio_cercas').insert(linha)); // antes da migration
    if (error) return NextResponse.json({ error: 'Não deu para salvar a cerca.' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (acao === 'alternar' || acao === 'excluir') {
    const { data: c } = await db.from('rastreio_cercas').select('id, veiculo_id, ativo').eq('id', String(corpo.id || '')).maybeSingle();
    const { data: v } = c ? await db.from('rastreio_veiculos').select('id').eq('id', c.veiculo_id).eq('cliente_id', s.clienteId).maybeSingle() : { data: null };
    if (!c || !v || !veiculoLiberado(s, c.veiculo_id)) return NextResponse.json({ error: 'Cerca não encontrada.' }, { status: 404 });
    if (acao === 'excluir') await db.from('rastreio_cercas').delete().eq('id', c.id);
    else await db.from('rastreio_cercas').update({ ativo: !c.ativo, dentro: null }).eq('id', c.id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
}
