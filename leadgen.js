/* ============================================================================
   Gerador de Leads — Velocita Global CRM

   Busca empresas REAIS (nunca inventa dados) por país, estado e cidade, pontua
   cada uma pelo potencial de fechamento e guarda tudo em data.leadgen.
   Quando o time registra o resultado do contato, o lead sobe sozinho para
   Empresas, Leads (contatos) e Pipeline (negócio).

   Fontes de dados:
   - Google Places API (New): telefone, site, nota e número de avaliações.
     Só liga se existir a variável de ambiente GOOGLE_PLACES_API_KEY.
   - OpenStreetMap (Overpass + Nominatim): gratuito e sem chave, mas com
     cobertura limitada de telefone/site e SEM nota nem avaliações.

   Reclame Aqui não tem API pública (e raspar o site viola os termos dele),
   então cada lead traz um link de busca e um campo para a nota ser digitada
   pelo time; essa nota entra na pontuação.
   ========================================================================= */
'use strict';

const UFS = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo',
  GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba',
  PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul',
  RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins'
};

// Principais cidades de cada estado: quando só o estado é informado, a busca passa por elas
// (girando a ordem a cada dia, para não repetir sempre as mesmas empresas).
const CITIES = {
  AC: ['Rio Branco', 'Cruzeiro do Sul'], AL: ['Maceió', 'Arapiraca'], AP: ['Macapá', 'Santana'], AM: ['Manaus', 'Parintins'],
  BA: ['Salvador', 'Feira de Santana', 'Vitória da Conquista', 'Camaçari', 'Ilhéus'], CE: ['Fortaleza', 'Caucaia', 'Juazeiro do Norte', 'Sobral'],
  DF: ['Brasília', 'Taguatinga', 'Ceilândia'], ES: ['Vitória', 'Vila Velha', 'Serra', 'Cariacica'],
  GO: ['Goiânia', 'Aparecida de Goiânia', 'Anápolis', 'Rio Verde'], MA: ['São Luís', 'Imperatriz', 'Timon'],
  MT: ['Cuiabá', 'Várzea Grande', 'Rondonópolis', 'Sinop'], MS: ['Campo Grande', 'Dourados', 'Três Lagoas'],
  MG: ['Belo Horizonte', 'Uberlândia', 'Contagem', 'Juiz de Fora', 'Betim', 'Montes Claros', 'Uberaba'],
  PA: ['Belém', 'Ananindeua', 'Santarém', 'Marabá'], PB: ['João Pessoa', 'Campina Grande'],
  PR: ['Curitiba', 'Londrina', 'Maringá', 'Ponta Grossa', 'Cascavel', 'São José dos Pinhais'],
  PE: ['Recife', 'Jaboatão dos Guararapes', 'Olinda', 'Caruaru', 'Petrolina'], PI: ['Teresina', 'Parnaíba'],
  RJ: ['Rio de Janeiro', 'Niterói', 'Duque de Caxias', 'Nova Iguaçu', 'Campos dos Goytacazes', 'Petrópolis'],
  RN: ['Natal', 'Mossoró', 'Parnamirim'], RS: ['Porto Alegre', 'Caxias do Sul', 'Canoas', 'Pelotas', 'Santa Maria', 'Novo Hamburgo'],
  RO: ['Porto Velho', 'Ji-Paraná'], RR: ['Boa Vista'], SC: ['Joinville', 'Florianópolis', 'Blumenau', 'Itajaí', 'Chapecó', 'Criciúma'],
  SP: ['São Paulo', 'Campinas', 'Ribeirão Preto', 'Guarulhos', 'Santos', 'São José do Rio Preto', 'Sorocaba', 'Osasco', 'Araraquara', 'São Carlos', 'Franca', 'Bauru'],
  SE: ['Aracaju', 'Nossa Senhora do Socorro'], TO: ['Palmas', 'Araguaína']
};

// Segmentos que combinam com o que a Velocita vende (marketplaces, anúncios, IA, e-commerce para quem tem produto físico).
const SEGMENTS = {
  fabricantes: { label: 'Fabricantes e indústrias', terms: ['fábrica', 'indústria', 'fabricante'], fit: 22, osm: ['["man_made"="works"]', '["industrial"]', '["craft"]'] },
  atacado: { label: 'Atacado e distribuidores', terms: ['atacadista', 'distribuidora', 'atacado'], fit: 22, osm: ['["shop"="wholesale"]', '["office"="company"]["name"~"distribuidora|atacad",i]'] },
  importadoras: { label: 'Importadoras', terms: ['importadora'], fit: 20, osm: ['["office"="company"]["name"~"import",i]'] },
  lojas: {
    label: 'Lojas com produto físico', fit: 12,
    terms: ['loja de utilidades domésticas', 'loja de ferramentas', 'loja de cosméticos', 'loja de eletrônicos', 'loja de autopeças', 'loja de brinquedos', 'pet shop', 'loja de móveis'],
    osm: ['["shop"~"^(hardware|electronics|cosmetics|toys|car_parts|pet|furniture|houseware|doityourself)$"]']
  }
};
const NAME_HINTS = /distribuidora|atacad|ind[uú]stria|f[aá]brica|importadora|comercial|com[eé]rcio|fabricante|ltda|eireli/i;

// ---------- utilidades ----------
const digits = (s) => String(s || '').replace(/\D/g, '');
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function normPhone(raw, country) {
  let d = digits(raw);
  if (!d) return { phone: '', whatsapp: false };
  if ((country || 'BR') === 'BR') {
    if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
    d = d.replace(/^0+/, '');
    if (d.length < 10 || d.length > 11) return { phone: String(raw).trim(), whatsapp: false };
    const ddd = d.slice(0, 2); const num = d.slice(2);
    const fmt = num.length === 9 ? `${num.slice(0, 5)}-${num.slice(5)}` : `${num.slice(0, 4)}-${num.slice(4)}`;
    return { phone: `(${ddd}) ${fmt}`, whatsapp: num.length === 9 && num[0] === '9' };
  }
  return { phone: String(raw).trim(), whatsapp: false };
}

function haversineKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 6371; const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat); const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}


// Leitura rápida dos comentários do Google (até 5 mais relevantes): elogios x reclamações.
const NEG = /golpe|enganou|engana|fraude|n[aã]o entregou|nunca entreg|p[eé]ssim|horr[ií]vel|descaso|n[aã]o recomendo|calote|atraso|demora|mau atendimento|desrespeit|n[aã]o resolveu|reclama/i;
const POS = /excelente|[oó]timo|[oó]tima|recomendo|r[aá]pido|atencioso|qualidade|pontual|confi[aá]vel|perfeito|parab[eé]ns/i;
function reviewSentiment(list) {
  let pos = 0; let neg = 0;
  (list || []).forEach((r) => { const t = r.text || ''; if (NEG.test(t) || (r.stars && r.stars <= 2)) neg++; else if (POS.test(t) || r.stars >= 4) pos++; });
  return { pos, neg };
}

/**
 * Pontuação de 0 a 100 = chance de virar negócio para a Velocita.
 *  - Contato (até 28): telefone, WhatsApp (celular), site, e-mail
 *  - Reputação (até 30): nota e número de avaliações (quem tem cliente satisfeito e vende, compra serviço de vender mais)
 *  - Perfil (até 30): tipo de empresa e sinais no nome (indústria, distribuidora, importadora...)
 *  - Sinais extras: empresa em operação (+5), sem site (+4, espaço para vender site/app), Reclame Aqui digitado pelo time (+8 / -8)
 */
function scoreLead(l) {
  const why = []; let s = 0;
  if (l.phone) { s += 14; why.push('tem telefone'); }
  if (l.whatsapp) { s += 6; why.push('celular/WhatsApp'); }
  if (l.website) { s += 6; why.push('tem site'); }
  if (l.email) { s += 2; why.push('tem e-mail'); }
  const r = Number(l.rating) || 0; const n = Number(l.reviews) || 0;
  if (r) {
    if (r >= 4.5) { s += 14; why.push(`nota ${r}`); } else if (r >= 4.0) { s += 11; why.push(`nota ${r}`); } else if (r >= 3.5) s += 6; else if (r >= 3) s += 2; else { s -= 14; why.push(`nota baixa ${r}`); }
    if (n >= 200) { s += 16; why.push(`${n} avaliações`); } else if (n >= 50) { s += 12; why.push(`${n} avaliações`); } else if (n >= 20) s += 8; else if (n >= 5) s += 4;
  }
  const sen = reviewSentiment(l.reviewsText);
  if (sen.neg >= 2) { s -= 10; why.push('comentários citam problemas'); } else if (sen.pos >= 3 && sen.neg === 0) { s += 4; why.push('comentários elogiam'); }
  const seg = SEGMENTS[l.segment];
  if (seg) { s += seg.fit; why.push(seg.label.toLowerCase()); }
  if (NAME_HINTS.test(l.name || '')) s += 4;
  if (!l.status_business || l.status_business === 'OPERATIONAL') s += 5;
  const w = l.web || null;
  if (w && w.marketplaces && w.marketplaces.length) { s += 10; why.push('já vende em marketplace (' + w.marketplaces.join(', ') + '): conhece o canal'); }
  else if (l.website && w) { s += 8; why.push('tem site mas não aparece em marketplace: espaço para expandir'); }
  if (w && w.ecommerce) { s += 3; why.push('loja virtual própria'); }
  if (!l.website && l.phone) { s += 5; why.push('sem site (oportunidade de site/app)'); }
  const ra = l.ra && Number(l.ra.nota);
  if (l.ra && l.ra.nota !== '' && l.ra.nota != null && !Number.isNaN(ra)) {
    if (ra >= 7) { s += 8; why.push(`Reclame Aqui ${ra}`); } else if (ra >= 5) s += 3; else { s -= 8; why.push(`Reclame Aqui baixo ${ra}`); }
  }
  s = clamp(Math.round(s), 0, 100);
  return { score: s, tier: s >= 70 ? 'quente' : s >= 50 ? 'morno' : 'frio', reasons: why, pitch: buildPitch(l) };
}


// Argumento de abordagem sugerido: o que dizer a esta empresa, conforme o que se sabe dela.
function buildPitch(l) {
  const w = l.web || {}; const seg = l.segment; const out = [];
  if (w.marketplaces && w.marketplaces.length) out.push(`Já vende em ${w.marketplaces.join(', ')}: não precisa explicar o canal. Fale do diferencial: tecnologia própria com IA para calibrar anúncio e acompanhamento de perto, sem o custo de uma agência tradicional.`);
  else if (l.website) out.push('Tem site, mas não aparece nos marketplaces: mostre que dá para vender em Mercado Livre, Shopee, Amazon e TikTok Shop sem mexer no estoque, que continua com ela.');
  else out.push('Sem site próprio: abra falando de vender em vários canais ao mesmo tempo e de ter site e aplicativo integrados ao mesmo estoque.');
  if (seg === 'fabricantes' || seg === 'importadoras') out.push('Perfil de fornecedor: o produto fica no galpão dela; a Velocita cuida de cadastro, anúncio, etiqueta de envio e acompanhamento.');
  if (seg === 'atacado') out.push('Distribuidor: abrir canal de venda ao consumidor final sem conflito com a carteira de revendedores.');
  if ((l.reviews || 0) >= 50 && (l.rating || 0) >= 4) out.push(`Clientes aprovam (${String(l.rating).replace('.', ',')} com ${l.reviews} avaliações): a demanda existe, falta escala.`);
  const sn = reviewSentiment(l.reviewsText);
  if (sn.neg >= 2) out.push('Comentários no Google citam problemas (atendimento/entrega): ofereça acompanhamento e organização como diferencial.');
  if (l.ra && l.ra.nota !== '' && Number(l.ra.nota) < 5) out.push('Atenção: nota baixa no Reclame Aqui. Priorize atendimento e reputação na conversa.');
  return out.join(' ');
}

// Olha o site da empresa: já vende em marketplace? tem loja virtual? acha e-mail e Instagram.
const MARKETS = [['mercadolivre.com', 'Mercado Livre'], ['mercadolibre.com', 'Mercado Livre'], ['shopee.com', 'Shopee'], ['amazon.com', 'Amazon'], ['tiktok.com/@', 'TikTok'], ['magazineluiza', 'Magalu'], ['americanas.com', 'Americanas'], ['casasbahia', 'Casas Bahia']];
function safeUrl(u) {
  try {
    const url = new URL(/^https?:/i.test(u) ? u : 'https://' + u);
    const h = url.hostname.toLowerCase();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(h) || /^(localhost|.*\.local|.*\.internal)$/.test(h) || /^\d+\.\d+\.\d+\.\d+$/.test(h)) return null;
    return url.toString();
  } catch (e) { return null; }
}
async function scanSite(rawUrl) {
  const url = safeUrl(rawUrl); if (!url) return null;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
  try {
    const res = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VelocitaCRM-LeadGen/1.0)', Accept: 'text/html' } });
    if (!res.ok || !/html/i.test(res.headers.get('content-type') || '')) return null;
    const html = (await res.text()).slice(0, 400000).toLowerCase();
    const marketplaces = [...new Set(MARKETS.filter(([k]) => html.includes(k)).map(([, n]) => n))];
    const ecommerce = /add[-_ ]to[-_ ]cart|adicionar ao carrinho|carrinho de compras|\/checkout|woocommerce|nuvemshop|tray\.com|vtex|loja integrada|shopify/.test(html);
    const em = /mailto:([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/.exec(html) || /([a-z0-9._%+-]+@[a-z0-9-]+\.(?:com\.br|com|net|ind\.br|org))/.exec(html);
    const ig = /instagram\.com\/([a-z0-9._]{2,30})/.exec(html);
    return { marketplaces, ecommerce, email: em ? em[1] : '', instagram: ig && !/^(p|reel|explore)$/.test(ig[1]) ? ig[1] : '' };
  } catch (e) { return null; } finally { clearTimeout(t); }
}
async function scanMany(leads, budgetMs) {
  const end = Date.now() + budgetMs; let i = 0;
  const worker = async () => { while (i < leads.length && Date.now() < end) { const l = leads[i++]; if (!l.website) continue; const r = await scanSite(l.website); if (r) { l.web = { marketplaces: r.marketplaces, ecommerce: r.ecommerce, instagram: r.instagram }; if (!l.email && r.email) l.email = r.email; } } };
  await Promise.all(Array.from({ length: 8 }, worker));
}

function dedupeKeys(l) {
  const keys = [];
  const d = digits(l.phone); if (d.length >= 10) keys.push('p:' + d.slice(-10));
  if (l.placeId) keys.push('g:' + l.placeId);
  keys.push('n:' + norm(l.name) + '|' + norm(l.city));
  return keys;
}

// ---------- provedores ----------
const UA = 'VelocitaCRM-LeadGen/1.0';
async function fetchJson(url, opts = {}, timeoutMs = 25000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctl.signal });
    if (!res.ok) { const body = await res.text().catch(() => ''); const e = new Error(`HTTP ${res.status} ${body.slice(0, 160)}`); e.status = res.status; throw e; }
    return await res.json();
  } finally { clearTimeout(t); }
}

let lastNominatim = 0;
async function geocode(q, country) {
  const wait = lastNominatim + 1100 - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatim = Date.now();
  const u = new URL('https://nominatim.openstreetmap.org/search');
  u.searchParams.set('q', q); u.searchParams.set('format', 'jsonv2'); u.searchParams.set('addressdetails', '1'); u.searchParams.set('limit', '6');
  if (country) u.searchParams.set('countrycodes', country.toLowerCase());
  u.searchParams.set('accept-language', 'pt-BR');
  const arr = await fetchJson(u.toString(), { headers: { 'User-Agent': UA } });
  return arr.map((p) => {
    const a = p.address || {};
    return {
      label: p.display_name, lat: Number(p.lat), lon: Number(p.lon),
      city: a.city || a.town || a.village || a.municipality || '', uf: (a['ISO3166-2-lvl4'] || '').split('-')[1] || '',
      state: a.state || '', country: (a.country_code || '').toUpperCase()
    };
  });
}

function parseCityUf(address, fallback) {
  const m = /,\s*([^,]+?)\s*-\s*([A-Z]{2})(?:,|\s*$)/.exec(address || '');
  return m ? { city: m[1].trim(), uf: m[2] } : fallback;
}

async function googleSearch({ key, textQuery, bias, pageLimit = 3, country, take }) {
  const out = []; let token = null;
  for (let page = 0; page < pageLimit; page++) {
    if (take && !take()) { const e = new Error('LIMITE_DIARIO'); e.limit = true; throw e; }
    const body = { textQuery, languageCode: 'pt-BR', pageSize: 20 };
    if (country) body.regionCode = country;
    if (bias) body.locationBias = { circle: { center: { latitude: bias.lat, longitude: bias.lon }, radius: Math.min(50000, bias.radiusM || 50000) } };
    if (token) body.pageToken = token;
    const j = await fetchJson('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.businessStatus,places.types,places.googleMapsUri,places.reviews,nextPageToken'
      },
      body: JSON.stringify(body)
    });
    for (const p of j.places || []) out.push(p);
    token = j.nextPageToken; if (!token) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  return out;
}

function mapGoogle(p, ctx) {
  const where = parseCityUf(p.formattedAddress, { city: ctx.city || '', uf: ctx.uf || '' });
  const ph = normPhone(p.nationalPhoneNumber || p.internationalPhoneNumber, ctx.country);
  return {
    name: (p.displayName && p.displayName.text) || '', address: p.formattedAddress || '', city: where.city, uf: where.uf, country: ctx.country,
    lat: p.location ? p.location.latitude : null, lon: p.location ? p.location.longitude : null,
    phone: ph.phone, whatsapp: ph.whatsapp, website: p.websiteUri || '', email: '',
    rating: p.rating || 0, reviews: p.userRatingCount || 0, mapsUrl: p.googleMapsUri || '', source: 'google', placeId: p.id,
    status_business: p.businessStatus || 'OPERATIONAL', types: (p.types || []).slice(0, 4), segment: ctx.segment,
    reviewsText: (p.reviews || []).slice(0, 5).map((r) => ({ stars: r.rating || 0, text: String((r.text && r.text.text) || (r.originalText && r.originalText.text) || '').slice(0, 260), when: r.relativePublishTimeDescription || '' })).filter((r) => r.text)
  };
}

const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
async function overpass(query) {
  let last;
  for (const url of OVERPASS) {
    try {
      return await fetchJson(url, { method: 'POST', headers: { 'User-Agent': UA, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query) }, 60000);
    } catch (e) { last = e; }
  }
  throw last || new Error('Overpass indisponível');
}

async function osmSearch({ segKey, center, radiusM, uf, country }) {
  const seg = SEGMENTS[segKey]; const parts = [];
  const scope = center ? `(around:${Math.round(radiusM || 30000)},${center.lat},${center.lon})` : null;
  const area = !center && uf && country === 'BR' ? `area["ISO3166-2"="BR-${uf}"]->.a;` : '';
  for (const f of seg.osm) {
    if (scope) parts.push(`nwr${scope}${f}["name"]["phone"];nwr${scope}${f}["name"]["contact:phone"];nwr${scope}${f}["name"]["website"];`);
    else if (area) parts.push(`nwr(area.a)${f}["name"]["phone"];nwr(area.a)${f}["name"]["contact:phone"];`);
  }
  if (!parts.length) return [];
  const j = await overpass(`[out:json][timeout:50];${area}(${parts.join('')});out tags center 250;`);
  return (j.elements || []).map((e) => {
    const t = e.tags || {}; const c = e.center || { lat: e.lat, lon: e.lon };
    const ph = normPhone(t.phone || t['contact:phone'] || t['contact:mobile'], country);
    return {
      name: t.name, address: [t['addr:street'], t['addr:housenumber'], t['addr:suburb']].filter(Boolean).join(', '),
      city: t['addr:city'] || '', uf: uf || '', country, lat: c.lat, lon: c.lon, phone: ph.phone, whatsapp: ph.whatsapp,
      website: t.website || t['contact:website'] || '', email: t.email || t['contact:email'] || '', rating: 0, reviews: 0,
      mapsUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`, source: 'osm', placeId: `osm:${e.type}/${e.id}`, status_business: 'OPERATIONAL', types: [], segment: segKey
    };
  });
}


// Limite de buscas no Google: o Google dá cerca de 1.000 buscas grátis por mês nesta faixa. O teto mensal (padrão 1.000)
// é dividido pelos dias que faltam no mês, assim o gerador nunca gasta tudo logo no começo.
function budgetInfo(lg, todayStr) {
  const month = todayStr.slice(0, 7);
  const u = lg.usage && lg.usage.month === month ? lg.usage : { month, requests: 0, days: {} };
  const cap = Number(lg.settings.monthlyCap) || 1000;
  const [y, m, d] = todayStr.split('-').map(Number);
  const daysLeft = new Date(y, m, 0).getDate() - d + 1;
  const usedToday = u.days[todayStr] || 0; const usedBefore = u.requests - usedToday;
  const allowance = Math.max(0, Math.min(Math.floor((cap - usedBefore) / daysLeft), cap - usedBefore));
  return { cap, used: u.requests, usedToday, daysLeft, allowanceToday: allowance, remainingToday: Math.max(0, Math.min(allowance - usedToday, cap - u.requests)) };
}

// ---------- registro das rotas ----------
function register(app, { db, requireAuth, newId, logHistory }) {
  const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const store = (data) => {
    if (!data.leadgen) data.leadgen = { items: [], settings: { dailyTarget: 100 } };
    if (!data.leadgen.settings) data.leadgen.settings = { dailyTarget: 100 };
    return data.leadgen;
  };
  const jobs = new Map();

  app.get('/api/leadgen/config', requireAuth, (req, res) => {
    const lg = store(db.read());
    const d = today();
    res.json({
      google: !!process.env.GOOGLE_PLACES_API_KEY, ufs: UFS, cities: CITIES,
      segments: Object.fromEntries(Object.entries(SEGMENTS).map(([k, v]) => [k, v.label])),
      dailyTarget: lg.settings.dailyTarget || 100, generatedToday: lg.items.filter((i) => i.genDate === d).length,
      budget: budgetInfo(lg, d), canEditBudget: !!req.user && ['matriz', 'admin'].includes(req.user.role)
    });
  });

  app.get('/api/leadgen/geocode', requireAuth, async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 3) return res.json([]);
    try { res.json(await geocode(q, String(req.query.country || '').slice(0, 2))); } catch (e) { res.status(502).json({ error: 'Busca de lugares indisponível agora: ' + e.message }); }
  });

  app.get('/api/leadgen/items', requireAuth, (req, res) => {
    res.json(store(db.read()).items);
  });

  app.put('/api/leadgen/settings', requireAuth, (req, res) => {
    const data = db.read(); const lg = store(data);
    if (req.body.monthlyCap !== undefined) {
      if (!req.user || !['matriz', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Somente administradores.' });
      lg.settings.monthlyCap = clamp(Number(req.body.monthlyCap) || 1000, 50, 100000);
    }
    if (req.body.dailyTarget !== undefined) lg.settings.dailyTarget = clamp(Number(req.body.dailyTarget) || 100, 10, 1000);
    db.write(data); res.json(lg.settings);
  });

  // ---- busca (roda em segundo plano; o painel consulta o andamento) ----
  app.post('/api/leadgen/search', requireAuth, (req, res) => {
    const b = req.body || {};
    const country = String(b.country || 'BR').toUpperCase().slice(0, 2);
    const uf = String(b.uf || '').toUpperCase();
    const city = String(b.city || '').trim();
    if (!city && !(country === 'BR' && UFS[uf])) return res.status(400).json({ error: 'Escolha um estado (ou digite uma cidade).' });
    const segs = (Array.isArray(b.segments) && b.segments.length ? b.segments : Object.keys(SEGMENTS)).filter((s) => SEGMENTS[s]);
    const job = {
      id: newId('job'), status: 'rodando', msg: 'Começando...', found: 0, added: 0, startedAt: Date.now(), errors: [],
      p: {
        country, uf, city, segs, custom: String(b.term || '').trim().slice(0, 80),
        limit: clamp(Number(b.limit) || 100, 10, 300), minRating: Number(b.minRating) || 0, minReviews: Number(b.minReviews) || 0,
        needPhone: b.needPhone !== false, needSite: !!b.needSite, radiusKm: Number(b.radiusKm) || 0,
        center: b.center && Number.isFinite(Number(b.center.lat)) ? { lat: Number(b.center.lat), lon: Number(b.center.lon) } : null,
        attendantId: b.attendantId || null
      }
    };
    jobs.set(job.id, job);
    if (jobs.size > 30) jobs.delete(jobs.keys().next().value);
    runJob(job).catch((e) => { job.status = 'erro'; job.msg = e.message; });
    res.status(202).json({ jobId: job.id });
  });

  app.get('/api/leadgen/jobs/:id', requireAuth, (req, res) => {
    const j = jobs.get(req.params.id);
    if (!j) return res.status(404).json({ error: 'Busca não encontrada' });
    res.json({ status: j.status, msg: j.msg, found: j.found, added: j.added, errors: j.errors.slice(0, 5) });
  });

  async function runJob(job) {
    const p = job.p; const key = process.env.GOOGLE_PLACES_API_KEY;
    const data0 = db.read();
    const known = new Set();
    data0.contacts.forEach((c) => { const d = digits(c.phone); if (d.length >= 10) known.add('p:' + d.slice(-10)); });
    data0.organizations.forEach((o) => { const d = digits(o.phone); if (d.length >= 10) known.add('p:' + d.slice(-10)); known.add('n:' + norm(o.name) + '|'); });
    store(data0).items.forEach((i) => dedupeKeys(i).forEach((k) => known.add(k)));

    // cidades a percorrer
    let cities = [];
    if (p.city) cities = [{ city: p.city, uf: p.uf }];
    else {
      const list = CITIES[p.uf] || [];
      const off = new Date().getDate() % Math.max(1, list.length);
      cities = list.slice(off).concat(list.slice(0, off)).map((c) => ({ city: c, uf: p.uf }));
    }
    let center = p.center;
    if (!center && p.city) { try { const g = await geocode(`${p.city}${p.uf ? ', ' + p.uf : ''}`, p.country); if (g[0]) center = { lat: g[0].lat, lon: g[0].lon }; } catch (e) { /* segue sem centro */ } }

    const bud0 = budgetInfo(store(data0), today());
    let remaining = key ? bud0.remainingToday : Infinity; let usedNow = 0; let limited = false;
    const takeReq = () => { if (remaining <= 0) return false; remaining--; usedNow++; return true; };
    if (key && remaining <= 0) { job.status = 'ok'; job.msg = `Limite de buscas no Google de hoje atingido (${bud0.usedToday} de ${bud0.allowanceToday}). Ele libera de novo amanhã, com o saldo do mês dividido pelos dias que faltam.`; return; }
    const found = [];
    const take = (raw, ctx) => {
      if (!raw.name) return;
      if (/CLOSED/.test(raw.status_business || '')) return;
      const lead = { ...raw };
      if (p.needPhone && !lead.phone) return;
      if (p.needSite && !lead.website) return;
      if (p.minRating && lead.source === 'google' && lead.rating < p.minRating) return;
      if (p.minReviews && lead.source === 'google' && lead.reviews < p.minReviews) return;
      if (p.radiusKm && center) { const d = haversineKm(center, lead); if (d != null && d > p.radiusKm) return; }
      const keys = dedupeKeys(lead);
      if (keys.some((k) => known.has(k))) return;
      keys.forEach((k) => known.add(k));
      found.push(lead); job.found = found.length;
    };

    const terms = (seg) => (p.custom ? [p.custom] : SEGMENTS[seg].terms);
    outer:
    for (const c of cities) {
      for (const seg of p.segs) {
        if (found.length >= p.limit) break outer;
        job.msg = `Buscando ${SEGMENTS[seg].label.toLowerCase()} em ${c.city}${c.uf ? '/' + c.uf : ''}... (${found.length} encontrados)`;
        try {
          if (key) {
            for (const term of terms(seg)) {
              if (found.length >= p.limit) break;
              const q = `${term} em ${c.city}${c.uf ? ', ' + c.uf : ''}, ${p.country === 'BR' ? 'Brasil' : p.country}`;
              const bias = center && p.city ? { lat: center.lat, lon: center.lon, radiusM: (p.radiusKm || 50) * 1000 } : null;
              const places = await googleSearch({ key, textQuery: q, bias, country: p.country, take: takeReq });
              places.forEach((pl) => take(mapGoogle(pl, { city: c.city, uf: c.uf, country: p.country, segment: seg })));
              if (p.custom) break;
            }
          } else {
            const cc = p.city ? center : null;
            const rows = await osmSearch({ segKey: seg, center: cc, radiusM: (p.radiusKm || 30) * 1000, uf: c.uf, country: p.country });
            rows.forEach((r) => { if (!r.city) r.city = c.city; take(r); });
            if (!p.city) break; // OSM por estado inteiro já cobre todas as cidades de uma vez
          }
        } catch (e) { if (e.limit) { limited = true; break outer; } job.errors.push(`${c.city}/${seg}: ${e.message}`); }
      }
      if (!key && !p.city) break;
    }

    // olha o site das empresas (já vende em marketplace? e-mail?) e só então pontua
    job.msg = `Analisando os sites de ${found.length} empresas...`;
    await scanMany(found, 80000);
    found.forEach((l) => Object.assign(l, scoreLead(l)));
    found.sort((a, b) => b.score - a.score);
    const picked = found.slice(0, p.limit);
    const data = db.read(); const lg = store(data); const d = today();
    for (const l of picked) {
      lg.items.push({
        id: newId('lg'), ...l, status: 'novo', notes: '', ra: { nota: '', url: '' },
        createdAt: new Date().toISOString(), genDate: d, orgId: null, contactId: null, dealId: null, outcome: null
      });
    }
    if (lg.items.length > 6000) { // limpeza: remove os mais antigos que nunca foram trabalhados
      const keep = lg.items.filter((i) => i.status !== 'novo'); const fresh = lg.items.filter((i) => i.status === 'novo').slice(-4000);
      lg.items = keep.concat(fresh);
    }
    if (usedNow) {
      const mth = d.slice(0, 7); if (!lg.usage || lg.usage.month !== mth) lg.usage = { month: mth, requests: 0, days: {} };
      lg.usage.requests += usedNow; lg.usage.days[d] = (lg.usage.days[d] || 0) + usedNow;
    }
    logHistory(data, 'lead', 'leadgen', p.attendantId, 'created', `Gerador de leads: ${picked.length} novos (${p.city || UFS[p.uf] || p.country})`);
    db.write(data);
    job.added = picked.length;
    job.status = 'ok';
    job.limited = limited;
    job.msg = (limited ? 'Parei porque o limite diário de buscas no Google acabou (o saldo do mês é dividido pelos dias que faltam). ' : '') + (picked.length
      ? `${picked.length} leads novos adicionados${key ? '' : ' (fonte gratuita OpenStreetMap: cobertura limitada, sem notas/avaliações)'}.`
      : (job.errors.length ? `Nenhum lead novo. Problema na fonte: ${job.errors[0]}` : 'Nenhum lead novo com esses filtros (tudo já estava no CRM ou foi filtrado).'));
  }

  // ---- edição manual (Reclame Aqui, notas) ----
  app.put('/api/leadgen/items/:id', requireAuth, (req, res) => {
    const data = db.read(); const it = store(data).items.find((i) => i.id === req.params.id);
    if (!it) return res.status(404).json({ error: 'Lead não encontrado' });
    if (req.body.ra) it.ra = { nota: req.body.ra.nota === '' ? '' : clamp(Number(req.body.ra.nota) || 0, 0, 10), url: String(req.body.ra.url || '').slice(0, 300) };
    if (typeof req.body.notes === 'string') it.notes = req.body.notes.slice(0, 2000);
    if (req.body.status === 'descartado') it.status = 'descartado';
    Object.assign(it, scoreLead(it));
    db.write(data); res.json(it);
  });

  app.delete('/api/leadgen/items/:id', requireAuth, (req, res) => {
    const data = db.read(); const lg = store(data);
    lg.items = lg.items.filter((i) => i.id !== req.params.id);
    db.write(data); res.json({ ok: true });
  });

  // ---- resultado do contato → empresa + lead + negócio no pipeline ----
  const OUTCOMES = {
    interessado: { label: 'Falou e tem interesse', stage: 'Qualificação', lost: false, status: 'qualificado' },
    reuniao: { label: 'Reunião marcada', stage: 'Reunião', lost: false, status: 'qualificado' },
    sem_resposta: { label: 'Não atendeu / sem resposta', stage: 'Prospecção', lost: false, status: 'sem_resposta' },
    retornar: { label: 'Pediu para retornar depois', stage: 'Prospecção', lost: false, status: 'em_contato' },
    sem_interesse: { label: 'Sem interesse', stage: 'Prospecção', lost: true, status: 'sem_interesse' },
    numero_errado: { label: 'Número errado / outra empresa', stage: 'Prospecção', lost: true, status: 'sem_interesse' },
    contato_errado: { label: 'Não é o contato certo', stage: 'Prospecção', lost: true, status: 'sem_interesse' }
  };

  app.post('/api/leadgen/items/:id/outcome', requireAuth, (req, res) => {
    const data = db.read(); const lg = store(data);
    const it = lg.items.find((i) => i.id === req.params.id);
    const oc = OUTCOMES[req.body.result];
    if (!it) return res.status(404).json({ error: 'Lead não encontrado' });
    if (!oc) return res.status(400).json({ error: 'Resultado inválido' });
    const attendantId = req.body.attendantId || null; const note = String(req.body.note || '').slice(0, 1000);
    const now = new Date().toISOString();

    let org = it.orgId && data.organizations.find((o) => o.id === it.orgId);
    if (!org) org = data.organizations.find((o) => norm(o.name) === norm(it.name));
    if (!org) {
      org = { id: newId('org'), name: it.name, cnpj: '', razaoSocial: '', setor: (SEGMENTS[it.segment] || {}).label || '', phone: it.phone, mobile: it.whatsapp ? it.phone : '', address: it.address, notes: `Origem: Gerador de Leads (${it.source}).`, tags: [], ownerId: attendantId, extraInfo: [] };
      data.organizations.push(org); logHistory(data, 'org', org.id, attendantId, 'created', 'Empresa criada pelo Gerador de Leads');
    }
    let contact = it.contactId && data.contacts.find((c) => c.id === it.contactId);
    if (!contact) {
      contact = {
        id: newId('c'), name: it.name, email: it.email || '', phone: it.phone || '', orgId: org.id, notes: it.address ? `Endereço: ${it.address}` : '', categories: [], tags: [], ownerId: attendantId,
        extraInfo: it.website ? [{ id: newId('x'), label: 'Site', value: it.website }] : [], source: { channel: 'gerador-leads', campaign: `${it.city || ''}${it.uf ? '/' + it.uf : ''}` },
        channels: { whatsapp: it.whatsapp ? it.phone : '', facebookPsid: '', instagramId: '' }
      };
      data.contacts.push(contact); logHistory(data, 'lead', contact.id, attendantId, 'created', 'Lead criado pelo Gerador de Leads');
    }
    const stages = data.stages.slice().sort((a, b) => a.order - b.order);
    const stage = stages.find((s) => norm(s.name) === norm(oc.stage)) || stages[0];
    let deal = it.dealId && data.deals.find((d) => d.id === it.dealId);
    if (!deal) {
      deal = {
        id: newId('d'), title: `${it.name}${it.city ? ' · ' + it.city : ''}`, value: 0, currency: 'BRL', supplyCost: 0, marketingCost: 0, personId: contact.id, orgId: org.id,
        stage: stage.id, ownerId: attendantId || (data.users[0] && data.users[0].id) || null, closeDate: null, platform: null, tags: [], extraInfo: [], status: 'open', createdAt: now,
        stageHistory: [{ stageId: stage.id, enteredAt: now, exitedAt: null }], origin: 'gerador-leads'
      };
      data.deals.push(deal);
    } else if (deal.stage !== stage.id && deal.status === 'open') {
      const open = (deal.stageHistory || []).find((h) => !h.exitedAt); if (open) open.exitedAt = now;
      (deal.stageHistory = deal.stageHistory || []).push({ stageId: stage.id, enteredAt: now, exitedAt: null }); deal.stage = stage.id;
    }
    if (oc.lost) { deal.status = 'lost'; deal.lostReason = `${oc.label}${note ? ': ' + note : ''}`; } else if (deal.status === 'lost') { deal.status = 'open'; delete deal.lostReason; }

    data.activities.push({
      id: newId('a'), leadId: contact.id, dealId: deal.id, type: 'call', text: `Gerador de Leads: ${oc.label}${note ? ' — ' + note : ''}`, date: now, done: true,
      attendantId, attendantName: (data.users.find((u) => u.id === attendantId) || {}).name || null
    });
    it.orgId = org.id; it.contactId = contact.id; it.dealId = deal.id; it.status = oc.status;
    it.outcome = { result: req.body.result, label: oc.label, note, at: now, by: attendantId };
    logHistory(data, 'deal', deal.id, attendantId, 'updated', `Contato pelo Gerador de Leads: ${oc.label}`);
    db.write(data);
    res.json({ item: it, orgId: org.id, contactId: contact.id, dealId: deal.id, stage: stage.name, lost: oc.lost });
  });

  app.get('/api/leadgen/export.csv', requireAuth, (req, res) => {
    const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const rows = store(db.read()).items;
    const head = ['Empresa', 'Cidade', 'UF', 'Telefone', 'WhatsApp', 'Site', 'E-mail', 'Nota', 'Avaliações', 'Pontuação', 'Temperatura', 'Segmento', 'Status', 'Endereço', 'Mapa'];
    const lines = [head.map(esc).join(';')].concat(rows.map((i) => [i.name, i.city, i.uf, i.phone, i.whatsapp ? 'sim' : '', i.website, i.email, i.rating || '', i.reviews || '', i.score, i.tier, (SEGMENTS[i.segment] || {}).label || '', i.status, i.address, i.mapsUrl].map(esc).join(';')));
    res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', 'attachment; filename="leads-velocita.csv"').send('﻿' + lines.join('\r\n'));
  });
}

module.exports = { register, _t: { budgetInfo, reviewSentiment, scanSite, safeUrl, buildPitch, scoreLead, normPhone, haversineKm, dedupeKeys, mapGoogle, parseCityUf, SEGMENTS, UFS, CITIES } };
