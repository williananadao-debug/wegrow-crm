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

// Consulta Overpass enxuta: um filtro só por chave (shop/office/amenity/...), o recorte fino de
// amenity fica no segmentoDasTags. Bem mais leve que um bloco por tipo.
export function queryOverpass(lat: number, lng: number, raio: number): string {
  return `[out:json][timeout:12];nwr[name][~"^(shop|office|craft|healthcare|amenity|leisure|tourism)$"~"."](around:${Math.round(raio)},${lat},${lng});out center tags 500;`;
}

// amenity que não é comércio (banco de praça, lixeira, estacionamento...) — fica de fora do mapa
const AMENITY_NEGOCIO = new Set(['restaurant', 'fast_food', 'cafe', 'bar', 'pub', 'nightclub', 'pharmacy', 'clinic', 'dentist', 'doctors', 'veterinary', 'hospital', 'school', 'college', 'university', 'language_school', 'driving_school', 'car_wash', 'fuel', 'bank', 'ice_cream', 'food_court', 'townhall', 'community_centre', 'marketplace', 'car_rental']);
export function ehNegocioOsm(t: Tags): boolean {
  if (t.amenity) return AMENITY_NEGOCIO.has(t.amenity);
  if (t.leisure) return ['fitness_centre', 'sports_centre'].includes(t.leisure);
  if (t.tourism) return ['hotel', 'motel', 'guest_house'].includes(t.tourism);
  return true;
}

// Google Places (New) — tipos agrupados por chamada (cada chamada devolve no máximo 20 lugares)
export const GRUPOS_GOOGLE: string[][] = [
  ['supermarket', 'grocery_store', 'convenience_store', 'butcher_shop', 'bakery', 'market'],
  ['restaurant', 'cafe', 'bar', 'meal_takeaway', 'ice_cream_shop', 'pizza_restaurant'],
  ['pharmacy', 'drugstore', 'dentist', 'doctor', 'hospital', 'medical_lab', 'physiotherapist', 'gym', 'beauty_salon', 'hair_salon'],
  ['clothing_store', 'shoe_store', 'jewelry_store', 'furniture_store', 'home_goods_store', 'electronics_store', 'book_store', 'pet_store', 'store'],
  ['car_dealer', 'car_repair', 'auto_parts_store', 'gas_station', 'car_wash', 'hardware_store', 'home_improvement_store'],
  ['accounting', 'lawyer', 'insurance_agency', 'real_estate_agency', 'travel_agency', 'school', 'university', 'veterinary_care', 'hotel', 'bank'],
];
const POR_TIPO_GOOGLE: Record<string, string> = {
  supermarket: 'Supermercado / Mercado', grocery_store: 'Supermercado / Mercado', convenience_store: 'Supermercado / Mercado', butcher_shop: 'Supermercado / Mercado', market: 'Supermercado / Mercado',
  bakery: 'Padaria / Confeitaria', restaurant: 'Restaurante / Lanchonete', cafe: 'Restaurante / Lanchonete', meal_takeaway: 'Restaurante / Lanchonete', ice_cream_shop: 'Restaurante / Lanchonete', pizza_restaurant: 'Restaurante / Lanchonete',
  bar: 'Bar / Casa Noturna', pharmacy: 'Farmácia / Drogaria', drugstore: 'Farmácia / Drogaria', dentist: 'Clínica Médica / Odontológica', doctor: 'Clínica Médica / Odontológica', physiotherapist: 'Clínica Médica / Odontológica',
  hospital: 'Hospital / Laboratório', medical_lab: 'Hospital / Laboratório', gym: 'Academia / Estética / Bem-estar', beauty_salon: 'Academia / Estética / Bem-estar', hair_salon: 'Academia / Estética / Bem-estar',
  clothing_store: 'Loja de Roupas / Vestuário', shoe_store: 'Loja de Roupas / Vestuário', jewelry_store: 'Loja de Roupas / Vestuário', furniture_store: 'Loja de Móveis e Decoração', home_goods_store: 'Loja de Móveis e Decoração',
  electronics_store: 'Loja de Móveis e Decoração', book_store: 'Papelaria / Livraria', pet_store: 'Petshop', veterinary_care: 'Petshop', car_dealer: 'Concessionária / Loja de Veículos', car_repair: 'Oficina Mecânica / Auto Center',
  car_wash: 'Oficina Mecânica / Auto Center', auto_parts_store: 'Autopeças', gas_station: 'Autopeças', hardware_store: 'Construção Civil / Materiais de Construção', home_improvement_store: 'Construção Civil / Materiais de Construção',
  accounting: 'Contabilidade', lawyer: 'Advocacia / Jurídico', insurance_agency: 'Consultoria', real_estate_agency: 'Consultoria', travel_agency: 'Consultoria', bank: 'Consultoria',
  school: 'Educação / Escola / Curso', university: 'Educação / Escola / Curso',
};
export function segmentoGoogle(primario: string | undefined, tipos: string[] = []): string {
  for (const t of [primario, ...tipos]) if (t && POR_TIPO_GOOGLE[t]) return POR_TIPO_GOOGLE[t];
  return primario ? `Outro (${primario.replace(/_/g, ' ')})` : 'Outro';
}

// Foursquare: segmento pelo nome da categoria (em inglês, padrão da API)
const POR_CATEGORIA_FSQ: [RegExp, string][] = [
  [/supermarket|grocery|convenience|butcher|market|warehouse store/i, 'Supermercado / Mercado'],
  [/pharmacy|drugstore/i, 'Farmácia / Drogaria'],
  [/bakery|pastry|dessert|candy|confection/i, 'Padaria / Confeitaria'],
  [/\bbar\b|\bpub\b|brewery|night ?club|lounge/i, 'Bar / Casa Noturna'],
  [/restaurant|food|café|cafe|coffee|pizza|burger|snack|diner|steakhouse|churrasc|ice cream|juice/i, 'Restaurante / Lanchonete'],
  [/dentist|doctor|medical|clinic|physio|optic|optometr/i, 'Clínica Médica / Odontológica'],
  [/hospital|laborator/i, 'Hospital / Laboratório'],
  [/gym|fitness|yoga|pilates|spa|salon|barber|beauty|nail|cosmetic/i, 'Academia / Estética / Bem-estar'],
  [/clothing|apparel|shoe|boutique|jewelry|accessor|fashion|lingerie/i, 'Loja de Roupas / Vestuário'],
  [/furniture|home|decor|appliance|electronics|mattress|bed /i, 'Loja de Móveis e Decoração'],
  [/book|stationery|office supply|paper/i, 'Papelaria / Livraria'],
  [/pet|veterinar/i, 'Petshop'],
  [/car dealer|automotive dealer|motorcycle dealer|dealership/i, 'Concessionária / Loja de Veículos'],
  [/auto ?parts|tire/i, 'Autopeças'],
  [/car wash|auto(motive)? (repair|service)|mechanic|oil change|gas station|fuel/i, 'Oficina Mecânica / Auto Center'],
  [/hardware|building|construction|lumber|paint|home improvement/i, 'Construção Civil / Materiais de Construção'],
  [/accountant|accounting/i, 'Contabilidade'],
  [/lawyer|law |legal|attorney/i, 'Advocacia / Jurídico'],
  [/software|technology|computer|it services|internet/i, 'Tecnologia / Software'],
  [/advertising|marketing|media agency|print shop/i, 'Marketing / Publicidade'],
  [/school|college|university|education|language|driving school|tutor/i, 'Educação / Escola / Curso'],
  [/farm|agricultur|feed store|garden/i, 'Agropecuária / Agronegócio'],
  [/cooperative/i, 'Cooperativa Agrícola'],
  [/shipping|logistics|moving|freight|courier/i, 'Transportadora / Logística'],
  [/government|city hall|association|union|non-?profit/i, 'Órgão Público / Associação / Sindicato'],
  [/bank|insurance|real estate|financial|consult/i, 'Consultoria'],
];
const NAO_NEGOCIO_FSQ = /park|plaza|neighborhood|residential|road|street|bridge|bus (stop|station)|river|lake|mountain|church|temple|cemetery|playground|monument|field|trail|beach|city|town|village|state|country/i;
export function segmentoFoursquare(categorias: string[]): string | null {
  if (!categorias.length) return 'Outro';
  if (categorias.every(c => NAO_NEGOCIO_FSQ.test(c))) return null; // não é comércio
  for (const c of categorias) for (const [re, seg] of POR_CATEGORIA_FSQ) if (re.test(c)) return seg;
  return `Outro (${categorias[0]})`;
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
