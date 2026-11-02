import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { distanciaMetros, mesmoNegocio, normalizarNome, queryOverpass, segmentoDasTags } from '@/lib/prospeccaoOsm';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

async function buscarOverpass(query: string) {
  for (const url of OVERPASS) {
    try {
      const r = await fetch(url, {
        method: 'POST', body: 'data=' + encodeURIComponent(query),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'WeGrow-CRM/1.0 (prospeccao)' },
        signal: AbortSignal.timeout(20000),
      });
      if (r.ok) return (await r.json()).elements as any[];
    } catch { /* tenta o próximo espelho */ }
  }
  throw new Error('Mapa de comércios indisponível agora. Tente de novo em instantes.');
}

// GET ?lat=&lng=&raio= (metros, 200–3000) → comércios em volta do vendedor, cada um marcado como
// cliente da carteira, já visitado ou novo, com segmento; mais as visitas registradas no raio que
// o OSM não conhece (o comércio existe na carteira mas não no mapa público).
export async function GET(request: Request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });
  const db = supabaseAdmin();
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });
  const { data: perfil } = await db.from('profiles').select('empresa_id').eq('id', user.id).single();
  if (!perfil?.empresa_id) return NextResponse.json({ erro: 'Usuário sem empresa.' }, { status: 403 });
  const empresaId = perfil.empresa_id;

  const q = new URL(request.url).searchParams;
  const lat = Number(q.get('lat')), lng = Number(q.get('lng'));
  const raio = Math.min(Math.max(Number(q.get('raio')) || 1000, 200), 3000);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ erro: 'Localização inválida.' }, { status: 400 });
  }

  // Caixa em volta do ponto pra filtrar as visitas no banco antes da distância exata
  const dLat = raio / 111320, dLng = raio / (111320 * Math.cos(lat * Math.PI / 180));

  let elementos: any[];
  try {
    elementos = await buscarOverpass(queryOverpass(lat, lng, raio));
  } catch (e: any) {
    return NextResponse.json({ erro: e.message }, { status: 502 });
  }

  const [clientesTodos, { data: visitasRaio }] = await Promise.all([
    (async () => {
      const todos: any[] = [];
      for (let de = 0; ; de += 1000) {
        const { data } = await db.from('clientes').select('id, nome_empresa, nome_fantasia, razao_social, segmento, cidade, telefone')
          .eq('empresa_id', empresaId).is('deleted_at', null).order('id').range(de, de + 999);
        todos.push(...(data || []));
        if (!data || data.length < 1000) return todos;
      }
    })(),
    db.from('visitas').select('id, empresa, cliente_id, lead_id, latitude, longitude, created_at, user_id')
      .eq('empresa_id', empresaId)
      .gte('latitude', lat - dLat).lte('latitude', lat + dLat)
      .gte('longitude', lng - dLng).lte('longitude', lng + dLng)
      .order('created_at', { ascending: false }).limit(500),
  ]);

  const clientes = clientesTodos.map(c => ({ ...c, nomes: [c.nome_empresa, c.nome_fantasia, c.razao_social].map(normalizarNome).filter(Boolean) }));
  const acharCliente = (nome: string) => {
    const n = normalizarNome(nome);
    return n ? clientes.find(c => c.nomes.some((x: string) => mesmoNegocio(n, x))) || null : null;
  };
  const visitas = (visitasRaio || []).filter(v => distanciaMetros(lat, lng, v.latitude, v.longitude) <= raio);
  const ultimaVisita = (nome: string, clienteId: number | null) => {
    const n = normalizarNome(nome);
    return visitas.find(v => (clienteId && v.cliente_id === clienteId) || mesmoNegocio(n, normalizarNome(v.empresa))) || null;
  };

  const vistos = new Set<string>();
  const comercios = elementos.map(el => {
    const t = el.tags || {};
    const pLat = el.lat ?? el.center?.lat, pLng = el.lon ?? el.center?.lon;
    if (!t.name || pLat === undefined) return null;
    const chave = `${normalizarNome(t.name)}|${Math.round(pLat * 2000)}|${Math.round(pLng * 2000)}`;
    if (vistos.has(chave)) return null;
    vistos.add(chave);
    const cliente = acharCliente(t.name);
    const visita = ultimaVisita(t.name, cliente?.id ?? null);
    const rua = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(', ');
    return {
      osm_id: `${el.type}/${el.id}`,
      nome: t.name as string,
      segmento: cliente?.segmento || segmentoDasTags(t),
      segmento_osm: segmentoDasTags(t),
      lat: pLat, lng: pLng,
      distancia_m: distanciaMetros(lat, lng, pLat, pLng),
      endereco: rua || null,
      bairro: t['addr:suburb'] || null,
      cidade: t['addr:city'] || null,
      telefone: t.phone || t['contact:phone'] || null,
      site: t.website || t['contact:website'] || null,
      instagram: t['contact:instagram'] || null,
      horario: t.opening_hours || null,
      cliente: cliente ? { id: cliente.id, nome: cliente.nome_empresa, segmento: cliente.segmento || null } : null,
      ultima_visita: visita ? { id: visita.id, em: visita.created_at, lead_id: visita.lead_id } : null,
    };
  }).filter(Boolean) as any[];

  // Status comercial dos clientes encontrados: anunciante ativo (contrato vigente), já comprou,
  // negociação aberta.
  const idsClientes = [...new Set(comercios.map(c => c.cliente?.id).filter(Boolean))];
  if (idsClientes.length) {
    const hoje = new Date().toISOString().substring(0, 10);
    const { data: leads } = await db.from('leads').select('client_id, status, valor_total, contrato_fim, fechado_em')
      .eq('empresa_id', empresaId).in('client_id', idsClientes);
    const porCliente: Record<number, any[]> = {};
    (leads || []).forEach(l => { (porCliente[l.client_id] ||= []).push(l); });
    comercios.forEach(c => {
      if (!c.cliente) return;
      const ls = porCliente[c.cliente.id] || [];
      const ganhos = ls.filter(l => l.status === 'ganho');
      c.cliente.situacao = ganhos.some(l => l.contrato_fim && l.contrato_fim >= hoje) ? 'anunciando'
        : ganhos.length ? 'ja_comprou' : ls.some(l => l.status === 'aberto') ? 'negociando' : 'cadastrado';
      c.cliente.total_comprado = ganhos.reduce((s, l) => s + Number(l.valor_total || 0), 0);
    });
  }

  // Visitas no raio cujo comércio não apareceu no OSM — mostra também, pra o mapa não esconder a carteira
  const visitasSoltas = visitas
    .filter(v => !comercios.some(c => (v.cliente_id && c.cliente?.id === v.cliente_id) || mesmoNegocio(normalizarNome(v.empresa), normalizarNome(c.nome))))
    .filter((v, i, arr) => arr.findIndex(x => normalizarNome(x.empresa) === normalizarNome(v.empresa)) === i)
    .map(v => ({ id: v.id, nome: v.empresa, lat: v.latitude, lng: v.longitude, em: v.created_at, cliente_id: v.cliente_id, lead_id: v.lead_id, distancia_m: distanciaMetros(lat, lng, v.latitude, v.longitude) }));

  comercios.sort((a, b) => a.distancia_m - b.distancia_m);
  return NextResponse.json({
    centro: { lat, lng }, raio,
    comercios,
    visitas: visitasSoltas,
    resumo: {
      total: comercios.length,
      clientes: comercios.filter(c => c.cliente).length,
      novos: comercios.filter(c => !c.cliente).length,
    },
  });
}
