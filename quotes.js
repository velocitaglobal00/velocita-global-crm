/* Orçamentos: empresas emissoras, catálogo (SKU, equipamentos, valores, impostos) e orçamentos prontos para imprimir.
   Os totais são sempre recalculados aqui, para o valor impresso nunca depender do navegador. */
'use strict';

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v) => { const n = Number(String(v == null ? '' : v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

// Imposto "por fora" (somado ao preço) ou "incluso" (já faz parte do preço).
function calcTotals(q) {
  const mode = q.taxMode === 'included' ? 'included' : 'add';
  let gross = 0; let itemDiscount = 0; let subtotal = 0; let tax = 0; let itemsTotal = 0;
  const lines = (q.items || []).map((it) => {
    const g = num(it.qty) * num(it.price); const d = g * clamp(num(it.discountPct), 0, 100) / 100; const net = g - d;
    const rate = clamp(num(it.taxPct), 0, 100) / 100;
    const t = mode === 'add' ? net * rate : net - net / (1 + rate);
    const total = mode === 'add' ? net + t : net;
    gross += g; itemDiscount += d; subtotal += net; tax += t; itemsTotal += total;
    return { gross: r2(g), discount: r2(d), net: r2(net), tax: r2(t), total: r2(total) };
  });
  const globalDiscount = itemsTotal * clamp(num(q.discountPct), 0, 100) / 100 + Math.max(0, num(q.discountValue));
  const freight = Math.max(0, num(q.freight));
  const total = Math.max(0, itemsTotal - globalDiscount) + freight;
  return { lines, gross: r2(gross), itemDiscount: r2(itemDiscount), subtotal: r2(subtotal), tax: r2(tax), itemsTotal: r2(itemsTotal), globalDiscount: r2(globalDiscount), freight: r2(freight), total: r2(total), taxMode: mode };
}

// Emissor inicial: só o que é público. Razão social, CNPJ e endereço ficam em branco para preencher na aba
// "Empresas emissoras" (e trocar quando a empresa virar LTDA, sem perder os orçamentos antigos).
const DEFAULT_ISSUER = () => ({
  id: 'iss-velocita', name: 'Velocita Global', legalName: '', regime: '', cnpj: '', ie: '', address: '', city: '', uf: '', cep: '',
  phone: '(16) 3362-4507', email: 'velocitaglobal@gmail.com', site: 'velocitaglobal.com.br', notes: ''
});
const DEFAULT_SETTINGS = () => ({
  issuers: [DEFAULT_ISSUER()],
  defaults: { validityDays: 15, payment: 'A combinar', delivery: 'A combinar', warranty: '', terms: 'Valores sujeitos a confirmação de estoque e prazo no fechamento do pedido.', taxMode: 'add' },
  counter: { year: 0, n: 0 }
});

function register(app, { db, requireAuth, newId }) {
  const adminLike = (u) => !!u && (u.role === 'matriz' || u.role === 'admin');
  const need = (req, res, next) => (adminLike(req.user) ? next() : res.status(403).json({ error: 'Somente administradores alteram as empresas emissoras.' }));
  const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const store = (data) => { if (!data.orcamentos) data.orcamentos = { settings: DEFAULT_SETTINGS(), catalog: [], quotes: [] }; const o = data.orcamentos; if (!o.settings) o.settings = DEFAULT_SETTINGS(); if (!o.catalog) o.catalog = []; if (!o.quotes) o.quotes = []; return o; };
  const authorName = (u) => (u && u.role !== 'matriz' ? u.name : 'Administração');

  // ---- configurações: empresas emissoras e padrões ----
  app.get('/api/quotes/settings', requireAuth, (req, res) => res.json(store(db.view()).settings));
  app.put('/api/quotes/settings', requireAuth, need, (req, res) => {
    const data = db.read(); const o = store(data); const b = req.body || {};
    if (Array.isArray(b.issuers)) {
      o.settings.issuers = b.issuers.slice(0, 20).map((i) => ({ id: str(i.id, 40) || newId('iss'), name: str(i.name, 80), legalName: str(i.legalName, 120), regime: str(i.regime, 30), cnpj: str(i.cnpj, 24), ie: str(i.ie, 24), address: str(i.address, 160), city: str(i.city, 60), uf: str(i.uf, 2).toUpperCase(), cep: str(i.cep, 12), phone: str(i.phone, 30), email: str(i.email, 80), site: str(i.site, 80), notes: str(i.notes, 300) })).filter((i) => i.name);
      if (!o.settings.issuers.length) o.settings.issuers = [DEFAULT_ISSUER()];
    }
    if (b.defaults) o.settings.defaults = { validityDays: clamp(Math.round(num(b.defaults.validityDays)) || 15, 1, 365), payment: str(b.defaults.payment, 300), delivery: str(b.defaults.delivery, 300), warranty: str(b.defaults.warranty, 300), terms: str(b.defaults.terms, 1200), taxMode: b.defaults.taxMode === 'included' ? 'included' : 'add' };
    db.write(data); res.json(o.settings);
  });

  // ---- catálogo ----
  const cleanProduct = (b) => ({ sku: str(b.sku, 40), name: str(b.name, 140), description: str(b.description, 600), unit: str(b.unit, 12) || 'un', price: r2(Math.max(0, num(b.price))), taxPct: r2(clamp(num(b.taxPct), 0, 100)), category: str(b.category, 40), active: b.active !== false });
  app.get('/api/quotes/catalog', requireAuth, (req, res) => res.json(store(db.view()).catalog));
  app.post('/api/quotes/catalog', requireAuth, (req, res) => {
    const data = db.read(); const o = store(data); const p = cleanProduct(req.body || {});
    if (!p.name) return res.status(400).json({ error: 'Informe o nome do produto ou equipamento.' });
    if (p.sku && o.catalog.some((x) => x.sku.toLowerCase() === p.sku.toLowerCase())) return res.status(409).json({ error: 'Já existe um item com esse SKU.' });
    const item = { id: newId('p'), ...p }; o.catalog.push(item); db.write(data); res.status(201).json(item);
  });
  app.post('/api/quotes/catalog/import', requireAuth, (req, res) => {
    const rows = Array.isArray((req.body || {}).rows) ? req.body.rows.slice(0, 3000) : [];
    const data = db.read(); const o = store(data); let created = 0; let updated = 0;
    for (const r of rows) {
      const p = cleanProduct(r); if (!p.name) continue;
      const ex = p.sku ? o.catalog.find((x) => x.sku.toLowerCase() === p.sku.toLowerCase()) : null;
      if (ex) { Object.assign(ex, p); updated++; } else { o.catalog.push({ id: newId('p'), ...p }); created++; }
    }
    db.write(data); res.json({ created, updated });
  });
  app.put('/api/quotes/catalog/:id', requireAuth, (req, res) => {
    const data = db.read(); const o = store(data); const it = o.catalog.find((x) => x.id === req.params.id);
    if (!it) return res.status(404).json({ error: 'Item não encontrado' });
    const p = cleanProduct({ ...it, ...req.body });
    if (p.sku && o.catalog.some((x) => x.id !== it.id && x.sku.toLowerCase() === p.sku.toLowerCase())) return res.status(409).json({ error: 'Já existe um item com esse SKU.' });
    Object.assign(it, p); db.write(data); res.json(it);
  });
  app.delete('/api/quotes/catalog/:id', requireAuth, (req, res) => {
    const data = db.read(); const o = store(data); o.catalog = o.catalog.filter((x) => x.id !== req.params.id); db.write(data); res.json({ ok: true });
  });

  // ---- orçamentos ----
  const clean = (b, settings) => {
    const issuer = settings.issuers.find((i) => i.id === b.issuerId) || settings.issuers[0];
    const c = b.customer || {};
    return {
      date: /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : today(),
      validUntil: /^\d{4}-\d{2}-\d{2}$/.test(b.validUntil || '') ? b.validUntil : '',
      status: ['rascunho', 'enviado', 'aprovado', 'recusado'].includes(b.status) ? b.status : 'rascunho',
      issuerId: issuer.id, issuer: { ...issuer },
      customer: { orgId: str(c.orgId, 40) || null, contactId: str(c.contactId, 40) || null, name: str(c.name, 140), doc: str(c.doc, 24), contactName: str(c.contactName, 100), email: str(c.email, 100), phone: str(c.phone, 30), address: str(c.address, 220) },
      items: (Array.isArray(b.items) ? b.items : []).slice(0, 300).map((it) => ({ sku: str(it.sku, 40), name: str(it.name, 160), description: str(it.description, 600), unit: str(it.unit, 12) || 'un', qty: Math.max(0, num(it.qty)), price: Math.max(0, num(it.price)), discountPct: clamp(num(it.discountPct), 0, 100), taxPct: clamp(num(it.taxPct), 0, 100) })).filter((it) => it.name || it.sku),
      taxMode: b.taxMode === 'included' ? 'included' : 'add', discountPct: clamp(num(b.discountPct), 0, 100), discountValue: Math.max(0, num(b.discountValue)), freight: Math.max(0, num(b.freight)),
      payment: str(b.payment, 300), delivery: str(b.delivery, 300), warranty: str(b.warranty, 300), notes: str(b.notes, 1500), terms: str(b.terms, 1500), dealId: str(b.dealId, 40) || null
    };
  };
  app.get('/api/quotes', requireAuth, (req, res) => {
    res.json(store(db.view()).quotes.map((q) => ({ id: q.id, number: q.number, date: q.date, status: q.status, customerName: q.customer.name, total: q.totals.total, issuerName: q.issuer.name, createdByName: q.createdByName, dealId: q.dealId, itemCount: q.items.length })).reverse());
  });
  app.get('/api/quotes/:id', requireAuth, (req, res) => {
    const q = store(db.view()).quotes.find((x) => x.id === req.params.id); if (!q) return res.status(404).json({ error: 'Orçamento não encontrado' }); res.json(q);
  });
  app.post('/api/quotes', requireAuth, (req, res) => {
    const data = db.read(); const o = store(data); const y = Number(today().slice(0, 4));
    if (o.settings.counter.year !== y) o.settings.counter = { year: y, n: 0 };
    o.settings.counter.n += 1;
    const q = { id: newId('q'), number: `ORC-${y}-${String(o.settings.counter.n).padStart(4, '0')}`, ...clean(req.body || {}, o.settings), createdBy: req.user && req.user.role !== 'matriz' ? req.user.id : null, createdByName: authorName(req.user), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    q.totals = calcTotals(q); o.quotes.push(q); db.write(data); res.status(201).json(q);
  });
  app.put('/api/quotes/:id', requireAuth, (req, res) => {
    const data = db.read(); const o = store(data); const q = o.quotes.find((x) => x.id === req.params.id); if (!q) return res.status(404).json({ error: 'Orçamento não encontrado' });
    Object.assign(q, clean({ ...q, ...req.body }, o.settings)); q.totals = calcTotals(q); q.updatedAt = new Date().toISOString(); db.write(data); res.json(q);
  });
  app.post('/api/quotes/:id/duplicate', requireAuth, (req, res) => {
    const data = db.read(); const o = store(data); const src = o.quotes.find((x) => x.id === req.params.id); if (!src) return res.status(404).json({ error: 'Orçamento não encontrado' });
    const y = Number(today().slice(0, 4)); if (o.settings.counter.year !== y) o.settings.counter = { year: y, n: 0 }; o.settings.counter.n += 1;
    const q = { ...JSON.parse(JSON.stringify(src)), id: newId('q'), number: `ORC-${y}-${String(o.settings.counter.n).padStart(4, '0')}`, date: today(), status: 'rascunho', createdBy: req.user && req.user.role !== 'matriz' ? req.user.id : null, createdByName: authorName(req.user), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    o.quotes.push(q); db.write(data); res.status(201).json(q);
  });
  app.delete('/api/quotes/:id', requireAuth, (req, res) => {
    const data = db.read(); const o = store(data); const q = o.quotes.find((x) => x.id === req.params.id); if (!q) return res.json({ ok: true });
    if (!adminLike(req.user) && q.createdBy !== req.user.id) return res.status(403).json({ error: 'Só quem criou o orçamento (ou um administrador) pode excluir.' });
    o.quotes = o.quotes.filter((x) => x.id !== req.params.id); db.write(data); res.json({ ok: true });
  });
}

module.exports = { register, calcTotals };
