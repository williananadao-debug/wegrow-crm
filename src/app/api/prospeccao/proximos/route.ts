import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/acessoEmpresa';
import { distanciaMetros, ehNegocioOsm, GRUPOS_GOOGLE, mesmoNegocio, normalizarNome, queryOverpass, segmentoDasTags, segmentoGoogle } from '@/lib/prospeccaoOsm';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type Lugar = {
  id: string; nome: string; lat: number; lng: number; segmento: string; endereco: string | null; bairro: string | null;
  cidade: string | null; telefone: string | null; site: string | null; instagram: string | null; horario: string | null;
};

// Cache por região (≈100 m) e raio: o vendedor abre o mapa várias vezes no mesmo lugar e o
// provedor de mapa é a parte lenta/paga. Vive enquanto a instância da função estiver quente.
const CACHE = new Map<string, { em: number; lugares: Lugar[] }>();
const CACHE_MS = 6 * 3600_000;

const OVERPASS = [
  'https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

// OpenStreetMap (grátis): pergunta aos espelhos ao mesmo tempo e usa o primeiro que responder.
async function lugaresOsm(lat: number, lng: number, raio: number): Promise<Lugar[]> {
  const query = queryOverpass(lat, lng, raio);
  const elementos: any[] = await Promise.any(OVERPASS.map(async url => {
    const r = await fetch(url, {
      method: 'POST', body: 'data=' + encodeURIComponent(query),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'WeGrow-CRM/1.0 (prospeccao)' },
      signal: AbortSignal.timeout(8000), // curto: se travar, o navegador tenta (plano B)
    });
    if (!r.ok) throw new Error(String(r.status));
    return (await r.json()).elements;
  }));
  return lugaresDeElementos(elementos);
}

// Elementos crus do Overpass (do servidor ou vindos do navegador do vendedor) → lugares
function lugaresDeElementos(elementos: any[]): Lugar[] {
  return elementos.filter(el => el?.tags?.name && ehNegocioOsm(el.tags)).map(el => {
    const t = el.tags;
    return {
      id: `osm:${el.type}/${el.id}`, nome: t.name, lat: el.lat ?? el.center?.lat, lng: el.lon ?? el.center?.lon,
      segmento: segmentoDasTags(t), endereco: [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(', ') || null,
      bairro: t['addr:suburb'] || null, cidade: t['addr:city'] || null, telefone: t.phone || t['contact:phone'] || null,
      site: t.website || t['contact:website'] || null, instagram: t['contact:instagram'] || null, horario: t.opening_hours || null,
    };
  }).filter(l => l.lat !== undefined);
}

// Google Places (pago, cobertura completa) quando GOOGLE_PLACES_API_KEY estiver configurada.
// Só campos do nível "Pro" (sem telefone/site) pra manter o custo baixo.
async function lugaresGoogle(lat: number, lng: number, raio: number, chave: string): Promise<Lugar[]> {
  const respostas = await Promise.all(GRUPOS_GOOGLE.map(async tipos => {
    const r = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': chave, 'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.primaryType,places.types,places.shortFormattedAddress' },
      body: JSON.stringify({ includedTypes: tipos, maxResultCount: 20, rankPreference: 'DISTANCE', languageCode: 'pt-BR', locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: raio } } }),
    });
    if (!r.ok) throw new Error(`Google Places ${r.status}`);
    return ((await r.json()).places || []) as any[];
  }));
  const vistos = new Set<string>();
  return respostas.flat().filter(p => !vistos.has(p.id) && vistos.add(p.id)).map(p => ({
    id: `g:${p.id}`, nome: p.displayName?.text || '', lat: p.location.latitude, lng: p.location.longitude,
    segmento: segmentoGoogle(p.primaryType, p.types), endereco: p.shortFormattedAddress || null, bairro: null, cidade: null,
    telefone: null, site: null, instagram: null, horario: null,
  })).filter(l => l.nome);
}

// Nomes da carteira pra casar com o mapa — só id/nomes/segmento, páginas em paralelo e cache
// curto por empresa (abrir o mapa de novo não refaz a busca).
const CACHE_CLIENTES = new Map<string, { em: number; lista: any[] }>();
async function nomesClientes(db: ReturnType<typeof supabaseAdmin>, empresaId: string): Promise<any[]> {
  const c = CACHE_CLIENTES.get(empresaId);
  if (c && Date.now() - c.em < 120_000) return c.lista;
  const lista: any[] = [];
  for (let de = 0; de < 40000; de += 4000) {
    const lote = await Promise.all([0, 1, 2, 3].map(i => db.from('clientes').select('id, nome_empresa, nome_fantasia, razao_social, segmento')
      .eq('empresa_id', empresaId).is('deleted_at', null).order('id').range(de + i * 1000, de + i * 1000 + 999)));
    let fim = false;
    for (const { data } of lote) { lista.push(...(data || [])); if (!data || data.length < 1000) { fim = true; break; } }
    if (fim) break;
  }
  CACHE_CLIENTES.set(empresaId, { em: Date.now(), lista });
  return lista;
}

// Geoapify (GEOAPIFY_API_KEY): os mesmos dados do OpenStreetMap, mas num serviço estável e com
// cota grátis diária (3.000 créditos/dia). As tags originais do OSM vêm em datasource.raw, então
// o segmento sai pela mesma regra do mapa aberto.
const CATEGORIAS_GEOAPIFY = 'commercial,catering,healthcare,service,office,education,accommodation,pet,rental';
async function lugaresGeoapify(lat: number, lng: number, raio: number, chave: string): Promise<Lugar[]> {
  const url = `https://api.geoapify.com/v2/places?categories=${CATEGORIAS_GEOAPIFY}&filter=circle:${lng},${lat},${Math.round(raio)}&bias=proximity:${lng},${lat}&limit=500&lang=pt&apiKey=${encodeURIComponent(chave)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`Geoapify ${r.status}`);
  const feats: any[] = (await r.json()).features || [];
  return feats.map(f => {
    const p = f.properties || {}, raw = p.datasource?.raw || {};
    const tags = { ...raw, name: p.name || raw.name };
    return {
      id: `geo:${p.place_id}`, nome: p.name || raw.name || '', lat: p.lat, lng: p.lon,
      segmento: segmentoDasTags(tags), endereco: [p.street, p.housenumber].filter(Boolean).join(', ') || null,
      bairro: p.suburb || p.district || null, cidade: p.city || null, telefone: p.contact?.phone || raw.phone || raw['contact:phone'] || null,
      site: p.website || raw.website || null, instagram: raw['contact:instagram'] || null, horario: p.opening_hours || raw.opening_hours || null,
    };
  }).filter(l => l.nome && l.lat !== undefined);
}

async function buscarLugares(lat: number, lng: number, raio: number): Promise<Lugar[]> {
  // Ordem: Google (pago) → Geoapify (cota grátis) → Overpass público
  const google = process.env.GOOGLE_PLACES_API_KEY, geo = process.env.GEOAPIFY_API_KEY;
  const id = `${google ? 'g' : geo ? 'y' : 'o'}|${lat.toFixed(3)}|${lng.toFixed(3)}|${raio}`;
  const c = CACHE.get(id);
  if (c && Date.now() - c.em < CACHE_MS) return c.lugares;
  let lugares: Lugar[] | null = null;
  if (google) { try { lugares = await lugaresGoogle(lat, lng, raio, google); } catch { /* tenta o próximo */ } }
  if (!lugares && geo) { try { lugares = await lugaresGeoapify(lat, lng, raio, geo); } catch { /* tenta o próximo */ } }
  if (!lugares) lugares = await lugaresOsm(lat, lng, raio);
  if (CACHE.size > 300) CACHE.delete(CACHE.keys().next().value!);
  CACHE.set(id, { em: Date.now(), lugares });
  return lugares;
}

// GET ?lat=&lng=&raio= (metros, 200–3000) → comércios em volta do vendedor, cada um marcado como
// cliente da carteira, já visitado ou novo, com segmento; mais as visitas registradas no raio que
// o OSM não conhece (o comércio existe na carteira mas não no mapa público).
export async function GET(request: Request) {
  return responder(request, null);
}

// POST { lat, lng, raio, elementos } — plano B: o servidor público do mapa às vezes recusa ou
// trava as consultas vindas da Vercel; aí o navegador do vendedor consulta o Overpass e manda os
// elementos pra cá só pra cruzar com a carteira.
export async function POST(request: Request) {
  let corpo: any;
  try { corpo = await request.json(); } catch { return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 }); }
  if (!Array.isArray(corpo?.elementos)) return NextResponse.json({ erro: 'Elementos obrigatórios.' }, { status: 422 });
  return responder(request, corpo);
}

async function responder(request: Request, corpo: { lat: number; lng: number; raio: number; elementos: any[] } | null) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });
  const db = supabaseAdmin();
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 });
  const { data: perfil } = await db.from('profiles').select('empresa_id').eq('id', user.id).single();
  if (!perfil?.empresa_id) return NextResponse.json({ erro: 'Usuário sem empresa.' }, { status: 403 });
  const empresaId = perfil.empresa_id;

  const q = new URL(request.url).searchParams;
  const lat = Number(corpo ? corpo.lat : q.get('lat')), lng = Number(corpo ? corpo.lng : q.get('lng'));
  const raio = Math.min(Math.max(Number(corpo ? corpo.raio : q.get('raio')) || 1000, 200), 3000);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ erro: 'Localização inválida.' }, { status: 400 });
  }

  // Caixa em volta do ponto pra filtrar as visitas no banco antes da distância exata
  const dLat = raio / 111320, dLng = raio / (111320 * Math.cos(lat * Math.PI / 180));

  let lugares: Lugar[];
  if (corpo) {
    lugares = lugaresDeElementos(corpo.elementos.slice(0, 1500));
  } else {
    try {
      lugares = await buscarLugares(lat, lng, raio);
    } catch {
      // Sem Google configurado, o navegador tenta o mapa aberto direto (plano B)
      return NextResponse.json({ erro: 'O serviço de mapa de comércios não respondeu agora. Tente de novo em 1 minuto ou diminua o raio.', osmNoNavegador: true }, { status: 503 });
    }
  }

  const [clientesTodos, { data: visitasRaio }] = await Promise.all([
    nomesClientes(db, empresaId),
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
  const comercios = lugares.map(l => {
    const chave = `${normalizarNome(l.nome)}|${Math.round(l.lat * 2000)}|${Math.round(l.lng * 2000)}`;
    if (vistos.has(chave)) return null;
    vistos.add(chave);
    const cliente = acharCliente(l.nome);
    const visita = ultimaVisita(l.nome, cliente?.id ?? null);
    return {
      osm_id: l.id, nome: l.nome,
      segmento: cliente?.segmento || l.segmento, segmento_osm: l.segmento,
      lat: l.lat, lng: l.lng, distancia_m: distanciaMetros(lat, lng, l.lat, l.lng),
      endereco: l.endereco, bairro: l.bairro, cidade: l.cidade, telefone: l.telefone, site: l.site, instagram: l.instagram, horario: l.horario,
      cliente: cliente ? { id: cliente.id, nome: cliente.nome_empresa, segmento: cliente.segmento || null } : null,
      ultima_visita: visita ? { id: visita.id, em: visita.created_at, lead_id: visita.lead_id } : null,
    };
  }).filter(c => c && c.distancia_m <= raio) as any[];

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
