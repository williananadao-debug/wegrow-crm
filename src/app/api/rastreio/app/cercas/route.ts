import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { COOKIE_APP, obterSessaoApp, soVeiculosDaSessao, veiculoLiberado } from '@/lib/rastreioApp';
import { distanciaMetros } from '@/lib/rastreio';

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
    if (!nome) return NextResponse.json({ error: 'Dê um nome para a cerca (ex.: Casa, Trabalho).' }, { status: 400 });
    const valido = (la: number, ln: number) => Math.abs(la) <= 90 && Math.abs(ln) <= 180 && !(la === 0 && ln === 0);
    let lat = Number(corpo.lat), lng = Number(corpo.lng), raio = Math.round(Number(corpo.raio));
    let poligono: [number, number][] | null = null;
    if (corpo.tipo === 'poligono') {
      // Área desenhada: centro = média dos pontos; raio = até o ponto mais longe (filtro rápido)
      const pts = (Array.isArray(corpo.pontos) ? corpo.pontos : []).slice(0, 40)
        .map((p: unknown) => (Array.isArray(p) ? [Number(p[0]), Number(p[1])] : [NaN, NaN]) as [number, number])
        .filter(([la, ln]: [number, number]) => valido(la, ln));
      if (pts.length < 3) return NextResponse.json({ error: 'Marque pelo menos 3 pontos no mapa.' }, { status: 400 });
      poligono = pts;
      lat = pts.reduce((s: number, p: [number, number]) => s + p[0], 0) / pts.length;
      lng = pts.reduce((s: number, p: [number, number]) => s + p[1], 0) / pts.length;
      raio = Math.max(50, Math.ceil(Math.max(...pts.map((p: [number, number]) => distanciaMetros(lat, lng, p[0], p[1])))) + 10);
      if (raio > 50000) return NextResponse.json({ error: 'Área grande demais (máx. 50 km).' }, { status: 400 });
    } else {
      if (!valido(lat, lng)) return NextResponse.json({ error: 'Escolha o ponto no mapa.' }, { status: 400 });
      if (!(raio >= 50 && raio <= 50000)) return NextResponse.json({ error: 'Raio entre 50 m e 50 km.' }, { status: 400 });
    }
    const { count } = await db.from('rastreio_cercas').select('id', { count: 'exact', head: true }).eq('veiculo_id', v.id);
    if ((count || 0) >= MAX_POR_VEICULO) return NextResponse.json({ error: `Limite de ${MAX_POR_VEICULO} cercas por veículo.` }, { status: 400 });
    const linha = { empresa_id: v.empresa_id, veiculo_id: v.id, nome, tipo: poligono ? 'poligono' : 'circulo', poligono, lat, lng, raio_m: raio, ativo: true };
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
