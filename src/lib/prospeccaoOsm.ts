// Prospecção ao redor (Visitas → "Prospectar ao redor"): comércios em volta do vendedor vindos do
// OpenStreetMap (Overpass, gratuito e sem chave) cruzados com a carteira de clientes da empresa.
// O segmento sai das tags do OSM e já usa os mesmos nomes do cadastro de clientes
// (SEGMENTOS_GRUPOS em customers/page.tsx), pra o "Cadastrar" gravar um segmento que o resto do
// CRM entende.

type Tags = Record<string, string | undefined>;

const POR_TAG: [string, Record<string, string>][] = [
  ['shop', {
    supermarket: 'Supermercado / Mercado', convenience: 'Supermercado / Mercado', greengrocer: 'Supermercado / Mercado',
    butcher: 'Supermercado / Mercado', wholesale: 'Supermercado / Mercado', general: 'Supermercado / Mercado',
    chemist: 'Farmácia / Drogaria', pharmacy: 'Farmácia / Drogaria', cosmetics: 'Farmácia / Drogaria',
    clothes: 'Loja de Roupas / Vestuário', shoes: 'Loja de Roupas / Vestuário', boutique: 'Loja de Roupas / Vestuário',
    fashion_accessories: 'Loja de Roupas / Vestuário', bag: 'Loja de Roupas / Vestuário', jewelry: 'Loja de Roupas / Vestuário',
    furniture: 'Loja de Móveis e Decoração', interior_decoration: 'Loja de Móveis e Decoração', bed: 'Loja de Móveis e Decoração',
    houseware: 'Loja de Móveis e Decoração', appliance: 'Loja de Móveis e Decoração', electronics: 'Loja de Móveis e Decoração',
    stationery: 'Papelaria / Livraria', books: 'Papelaria / Livraria', copyshop: 'Papelaria / Livraria',
    pet: 'Petshop', car: 'Concessionária / Loja de Veículos', motorcycle: 'Concessionária / Loja de Veículos',
    car_parts: 'Autopeças', tyres: 'Autopeças', car_repair: 'Oficina Mecânica / Auto Center',
    bakery: 'Padaria / Confeitaria', pastry: 'Padaria / Confeitaria', confectionery: 'Padaria / Confeitaria',
    hardware: 'Construção Civil / Materiais de Construção', doityourself: 'Construção Civil / Materiais de Construção',
    paint: 'Construção Civil / Materiais de Construção', trade: 'Construção Civil / Materiais de Construção',
    agrarian: 'Agropecuária / Agronegócio', farm: 'Agropecuária / Agronegócio', garden_centre: 'Agropecuária / Agronegócio',
    optician: 'Clínica Médica / Odontológica', hairdresser: 'Academia / Estética / Bem-estar', beauty: 'Academia / Estética / Bem-estar',
  }],
  ['amenity', {
    restaurant: 'Restaurante / Lanchonete', fast_food: 'Restaurante / Lanchonete', cafe: 'Restaurante / Lanchonete',
    food_court: 'Restaurante / Lanchonete', ice_cream: 'Restaurante / Lanchonete',
    bar: 'Bar / Casa Noturna', pub: 'Bar / Casa Noturna', nightclub: 'Bar / Casa Noturna',
    pharmacy: 'Farmácia / Drogaria', clinic: 'Clínica Médica / Odontológica', dentist: 'Clínica Médica / Odontológica',
    doctors: 'Clínica Médica / Odontológica', veterinary: 'Petshop', hospital: 'Hospital / Laboratório',
    school: 'Educação / Escola / Curso', college: 'Educação / Escola / Curso', university: 'Educação / Escola / Curso',
    language_school: 'Educação / Escola / Curso', driving_school: 'Educação / Escola / Curso', kindergarten: 'Educação / Escola / Curso',
    car_wash: 'Oficina Mecânica / Auto Center', fuel: 'Autopeças',
    bank: 'Consultoria', townhall: 'Órgão Público / Associação / Sindicato', community_centre: 'Órgão Público / Associação / Sindicato',
  }],
  ['office', {
    accountant: 'Contabilidade', lawyer: 'Advocacia / Jurídico', it: 'Tecnologia / Software', software: 'Tecnologia / Software',
    advertising_agency: 'Marketing / Publicidade', consulting: 'Consultoria', estate_agent: 'Consultoria', insurance: 'Consultoria',
    association: 'Órgão Público / Associação / Sindicato', government: 'Órgão Público / Associação / Sindicato',
    cooperative: 'Cooperativa Agrícola', logistics: 'Transportadora / Logística', company: 'Consultoria',
  }],
  ['craft', {
    carpenter: 'Indústria Madeireira / Moveleira', metal_construction: 'Indústria Metalúrgica / Metal-Mecânica',
    tailor: 'Indústria Têxtil / Confecção', dressmaker: 'Indústria Têxtil / Confecção', bakery: 'Padaria / Confeitaria',
  }],
  ['leisure', { fitness_centre: 'Academia / Estética / Bem-estar', sports_centre: 'Academia / Estética / Bem-estar' }],
  ['healthcare', { laboratory: 'Hospital / Laboratório', clinic: 'Clínica Médica / Odontológica', dentist: 'Clínica Médica / Odontológica' }],
];

// Segmento do CRM a partir das tags do OSM; sem correspondência fica o tipo cru (ex.: "shop: florist").
export function segmentoDasTags(tags: Tags): string {
  for (const [chave, mapa] of POR_TAG) {
    const v = tags[chave];
    if (v && mapa[v]) return mapa[v];
  }
  for (const chave of ['shop', 'amenity', 'office', 'craft', 'leisure', 'healthcare', 'tourism']) {
    if (tags[chave]) return `Outro (${tags[chave]!.replace(/_/g, ' ')})`;
  }
  return 'Outro';
}

// Consulta Overpass: tudo que tem nome e cara de negócio num raio (m) em volta do ponto.
export function queryOverpass(lat: number, lng: number, raio: number): string {
  const around = `(around:${Math.round(raio)},${lat},${lng})`;
  const filtros = [
    'shop', 'office', 'craft', 'healthcare',
    'amenity~"^(restaurant|fast_food|cafe|bar|pub|nightclub|pharmacy|clinic|dentist|doctors|veterinary|hospital|school|college|university|language_school|driving_school|car_wash|fuel|bank|ice_cream|food_court)$"',
    'leisure~"^(fitness_centre|sports_centre)$"', 'tourism~"^(hotel|motel|guest_house)$"',
  ];
  const partes = filtros.flatMap(f => [`node[name][${f}]${around};`, `way[name][${f}]${around};`]);
  return `[out:json][timeout:25];(${partes.join('')});out center tags 400;`;
}

// Nome comparável: sem acento, sem pontuação e sem sufixos societários/palavras genéricas.
const GENERICAS = new Set(['ltda', 'me', 'epp', 'eireli', 'sa', 'cia', 'comercio', 'de', 'da', 'do', 'das', 'dos', 'e', 'loja', 'the']);
export function normalizarNome(t: string | null | undefined): string {
  return (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(p => p && !GENERICAS.has(p)).join(' ');
}

// Mesmo negócio? Igual, ou um nome contém o outro inteiro (ex.: "farmacia vida" × "farmacia vida saude").
export function mesmoNegocio(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [curto, longo] = a.length <= b.length ? [a, b] : [b, a];
  return curto.length >= 5 && (` ${longo} `).includes(` ${curto} `);
}

export function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}
