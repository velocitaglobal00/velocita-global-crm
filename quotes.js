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
  let gross = 0; let itemDiscount = 0; let subtotal = 0; let tax = 0; let itemsTotal = 0; let materialCost = 0;
  const lines = (q.items || []).map((it) => {
    const g = num(it.qty) * num(it.price); const d = g * clamp(num(it.discountPct), 0, 100) / 100; const net = g - d;
    const rate = clamp(num(it.taxPct), 0, 100) / 100;
    const t = mode === 'add' ? net * rate : net - net / (1 + rate);
    const total = mode === 'add' ? net + t : net;
    gross += g; itemDiscount += d; subtotal += net; tax += t; itemsTotal += total; materialCost += num(it.qty) * Math.max(0, num(it.cost));
    return { gross: r2(g), discount: r2(d), net: r2(net), tax: r2(t), total: r2(total) };
  });
  const globalDiscount = itemsTotal * clamp(num(q.discountPct), 0, 100) / 100 + Math.max(0, num(q.discountValue));
  const freight = Math.max(0, num(q.freight));
  const total = Math.max(0, itemsTotal - globalDiscount) + freight;
  // Sobra = o que entra (sem o imposto) menos o que foi gasto comprando o material pedido pelo cliente.
  materialCost += Math.max(0, num(q.materialExtra));
  const revenueNet = total - tax; const profit = revenueNet - materialCost;
  return { lines, gross: r2(gross), itemDiscount: r2(itemDiscount), subtotal: r2(subtotal), tax: r2(tax), itemsTotal: r2(itemsTotal), globalDiscount: r2(globalDiscount), freight: r2(freight), total: r2(total), taxMode: mode,
    materialCost: r2(materialCost), revenueNet: r2(revenueNet), profit: r2(profit), marginPct: revenueNet > 0 ? r2((profit / revenueNet) * 100) : 0 };
}

// Pagamento: lista de recebimentos (data, valor, observação). O status sai da conta, nunca é digitado.
function payInfo(q) {
  const list = Array.isArray(q.pay && q.pay.payments) ? q.pay.payments : [];
  const received = r2(list.reduce((a, x) => a + Math.max(0, num(x.amount)), 0));
  const total = (q.totals && q.totals.total) || 0;
  const status = received <= 0 ? 'pendente' : received >= total - 0.005 ? 'pago' : 'parcial';
  return { received, remaining: r2(Math.max(0, total - received)), status };
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
  const cleanProduct = (b) => ({ sku: str(b.sku, 40), name: str(b.name, 140), description: str(b.description, 600), unit: str(b.unit, 12) || 'un', price: r2(Math.max(0, num(b.price))), marketPrice: r2(Math.max(0, num(b.marketPrice))), marketNote: str(b.marketNote, 160), cost: r2(Math.max(0, num(b.cost))), taxPct: r2(clamp(num(b.taxPct), 0, 100)), category: str(b.category, 40), active: b.active !== false });
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


  // ---- financeiro (BI): caixa, a pagar e a receber preenchidos pela diretoria + o que vem dos orçamentos ----
  const needAdmin = (req, res, next) => (adminLike(req.user) ? next() : res.status(403).json({ error: 'Os números financeiros são só da administração.' }));
  const fin = (data) => { if (!data.finance) data.finance = { cash: { value: 0, note: '', updatedAt: null }, payables: [], receivables: [] }; return data.finance; };
  // um orçamento conta como venda real se foi enviado/aprovado OU se já recebeu algum valor (mesmo que ainda esteja como rascunho)
  const counts = (q) => q.status !== 'recusado' && (q.status !== 'rascunho' || payInfo(q).received > 0);
  const dealPays = (d) => (Array.isArray(d.payments) ? d.payments : num(d.paidAmount) > 0 ? [{ id: 'pg-antigo', date: '', amount: r2(num(d.paidAmount)), note: 'Valor informado antes (sem data)', fileId: '', fileName: '' }] : []);
  function financeSummary(data) {
    const o = store(data); const month = today().slice(0, 7); const f = fin(data);
    let quoted = 0, received = 0, receivedMonth = 0, toReceive = 0, toReceiveMonth = 0, cost = 0, costPaid = 0, profit = 0, profitReceived = 0, drafts = 0;
    for (const q of o.quotes) {
      if (q.status === 'recusado') continue; const pi = payInfo(q); const t = q.totals || {};
      for (const x of (q.pay && q.pay.payments) || []) if ((x.date || '').startsWith(month)) receivedMonth += num(x.amount);
      if (!counts(q)) { drafts += t.total || 0; continue; }
      quoted += t.total || 0; received += pi.received; toReceive += pi.remaining; cost += t.materialCost || 0; costPaid += Math.min(num(q.materialPaid), t.materialCost || 0); profit += t.profit || 0;
      if (t.total > 0) profitReceived += (t.profit || 0) * Math.min(1, pi.received / t.total);
      if (pi.remaining > 0 && (q.validUntil || q.date || '').startsWith(month)) toReceiveMonth += pi.remaining;
    }
    const materialToPay = r2(Math.max(0, cost - costPaid));
    const manualRecv = f.receivables.filter((x) => !x.received); const manualReceivedMonth = f.receivables.filter((x) => x.received && (x.receivedDate || '').startsWith(month)).reduce((a, x) => a + num(x.value), 0);
    const manualToReceive = manualRecv.reduce((a, x) => a + num(x.value), 0); const payOpenManual = f.payables.filter((x) => !x.paid).reduce((a, x) => a + num(x.value), 0);
    // Pipeline: pago = o que entrou pelos orçamentos ligados ao negócio + o que foi lançado no próprio negócio
    const byDeal = {}; o.quotes.filter((q) => q.dealId && q.status !== 'recusado').forEach((q) => { (byDeal[q.dealId] = byDeal[q.dealId] || []).push(q); });
    const stageName = (id) => ((data.stages || []).find((st) => st.id === id) || {}).name || ''; let dealPaidMonth = 0;
    const dl = (data.deals || []).filter((d) => d.status !== 'lost').map((d) => {
      const qs = byDeal[d.id] || []; const qPaid = qs.reduce((a, q) => a + payInfo(q).received, 0); const qTotal = qs.reduce((a, q) => a + ((q.totals || {}).total || 0), 0);
      const pays = dealPays(d); const dPaid = pays.reduce((a, x) => a + num(x.amount), 0); pays.forEach((x) => { if ((x.date || '').startsWith(month)) dealPaidMonth += num(x.amount); });
      const value = Math.max(num(d.value), qTotal); const paid = r2(qPaid + dPaid);
      return { id: d.id, title: d.title, stage: stageName(d.stage), status: d.status, value: r2(value), paid, paidQuotes: r2(qPaid), paidDeal: r2(dPaid), remaining: r2(Math.max(0, value - paid)), quotes: qs.map((q) => q.number) };
    });
    const pipeline = { deals: dl.length, value: r2(dl.reduce((a, x) => a + x.value, 0)), paid: r2(dl.reduce((a, x) => a + x.paid, 0)), remaining: r2(dl.reduce((a, x) => a + x.remaining, 0)), list: dl.filter((x) => x.paid > 0 || x.value > 0).sort((a, b) => b.remaining - a.remaining).slice(0, 40) };
    const goal = Number((data.settings && data.settings.monthlyGoal) || 0); const recMonth = r2(receivedMonth + manualReceivedMonth + dealPaidMonth);
    const payOpen = payOpenManual + materialToPay;
    return { pipeline, month, goal, receivedMonth: recMonth, missingToGoal: r2(Math.max(0, goal - recMonth)), goalPct: goal > 0 ? Math.min(100, r2((recMonth / goal) * 100)) : 0,
      quotes: { quoted: r2(quoted), received: r2(received), toReceive: r2(toReceive), toReceiveMonth: r2(toReceiveMonth), materialCost: r2(cost), materialPaid: r2(costPaid), materialToPay, profit: r2(profit), profitReceived: r2(profitReceived), drafts: r2(drafts) },
      toReceiveTotal: r2(toReceive + manualToReceive), payablesOpen: r2(payOpen), payablesManual: r2(payOpenManual), cash: r2(num(f.cash.value)),
      projected: r2(num(f.cash.value) + toReceive + manualToReceive - payOpen) };
  }
  app.get('/api/finance', requireAuth, needAdmin, (req, res) => { const data = db.view(); res.json({ ...JSON.parse(JSON.stringify(fin(data))), summary: financeSummary(data) }); });
  const addMonth = (iso) => { const [y, m, d] = iso.split('-').map(Number); const nm = m === 12 ? 1 : m + 1; const ny = m === 12 ? y + 1 : y; const last = new Date(ny, nm, 0).getDate(); return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`; };
  app.put('/api/finance', requireAuth, needAdmin, (req, res) => {
    const data = db.read(); const f = fin(data); const b = req.body || {};
    if (b.cash) f.cash = { value: r2(num(b.cash.value)), note: str(b.cash.note, 160), updatedAt: new Date().toISOString() };
    const okDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '');
    const item = (x, extraFn) => ({ id: str(x.id, 40) || newId('fi'), desc: str(x.desc, 140), value: r2(Math.max(0, num(x.value))), due: okDate(x.due), ...extraFn(x) });
    if (Array.isArray(b.payables)) {
      const prev = new Map(f.payables.map((x) => [x.id, x]));
      f.payables = b.payables.slice(0, 400).map((x) => item(x, (y) => ({ paid: !!y.paid, category: str(y.category, 40), recurring: !!y.recurring, next: !!(prev.get(str(y.id, 40)) || {}).next }))).filter((x) => x.desc || x.value);
      // conta fixa (todo mês): garante que o mês seguinte já aparece na lista
      for (const it of f.payables.slice()) if (it.recurring && it.due && !it.next) { f.payables.push({ id: newId('fi'), desc: it.desc, value: it.value, due: addMonth(it.due), paid: false, category: it.category, recurring: true, next: false }); it.next = true; }
    }
    if (Array.isArray(b.receivables)) f.receivables = b.receivables.slice(0, 400).map((x) => item(x, (y) => ({ received: !!y.received, receivedDate: y.received ? (okDate(y.receivedDate) || today()) : '' }))).filter((x) => x.desc || x.value);
    db.write(data); res.json({ ...JSON.parse(JSON.stringify(f)), summary: financeSummary(data) });
  });

  // ---- pagamentos de cada negócio do Pipeline (com comprovantes anexados) ----
  const ALLOWED = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
  const dealOf = (data, id) => (data.deals || []).find((d) => d.id === id);
  app.get('/api/deals/:id/financial', requireAuth, (req, res) => {
    const data = db.view(); const d = dealOf(data, req.params.id); if (!d) return res.status(404).json({ error: 'Negócio não encontrado' });
    const qs = store(data).quotes.filter((q) => q.dealId === d.id && q.status !== 'recusado').map((q) => { const pi = payInfo(q); return { id: q.id, number: q.number, status: q.status, total: (q.totals || {}).total || 0, received: pi.received, remaining: pi.remaining, payStatus: pi.status }; });
    const pays = dealPays(d); const paidDeal = r2(pays.reduce((a, x) => a + num(x.amount), 0)); const qPaid = r2(qs.reduce((a, q) => a + q.received, 0)); const qTotal = r2(qs.reduce((a, q) => a + q.total, 0));
    const ref = Math.max(num(d.value), qTotal); const paid = r2(paidDeal + qPaid);
    res.json({ id: d.id, title: d.title, value: num(d.value), currency: d.currency || 'BRL', payments: pays, quotes: qs, paidDeal, paidQuotes: qPaid, paid, reference: r2(ref), remaining: r2(Math.max(0, ref - paid)), pct: ref > 0 ? Math.min(100, r2((paid / ref) * 100)) : 0 });
  });
  app.put('/api/deals/:id/payments', requireAuth, (req, res) => {
    const data = db.read(); const d = dealOf(data, req.params.id); if (!d) return res.status(404).json({ error: 'Negócio não encontrado' });
    const old = new Map(dealPays(d).map((x) => [x.id, x])); const ids = new Set();
    const list = (Array.isArray((req.body || {}).payments) ? req.body.payments : []).slice(0, 200).map((x) => {
      const prev = old.get(str(x.id, 40)) || {}; const id = str(x.id, 40) && old.has(str(x.id, 40)) ? str(x.id, 40) : newId('pg'); ids.add(id);
      return { id, date: /^\d{4}-\d{2}-\d{2}$/.test(x.date || '') ? x.date : (prev.date || today()), amount: r2(Math.max(0, num(x.amount))), note: str(x.note, 160), fileId: prev.fileId || '', fileName: prev.fileName || '' };
    }).filter((x) => x.amount > 0 || x.fileId);
    const gone = [...old.values()].filter((x) => !list.some((y) => y.id === x.id) && x.fileId).map((x) => x.fileId);
    d.payments = list; d.paidAmount = r2(list.reduce((a, x) => a + x.amount, 0)); db.write(data);
    if (gone.length) db.deleteFiles(gone).catch(() => {});
    res.json({ ok: true, payments: list, paidAmount: d.paidAmount });
  });
  app.post('/api/deals/:id/payments/:pid/file', requireAuth, async (req, res) => {
    try {
      const b = req.body || {}; const mime = String(b.mime || '').toLowerCase(); if (!ALLOWED[mime]) return res.status(400).json({ error: 'Envie um PDF ou uma imagem (PNG, JPG, WEBP).' });
      const buf = Buffer.from(String(b.dataBase64 || ''), 'base64'); if (!buf.length || buf.length > 6 * 1024 * 1024) return res.status(400).json({ error: 'O arquivo precisa ter até 6 MB.' });
      const data = db.read(); const d = dealOf(data, req.params.id); const pay = d && dealPays(d).find((x) => x.id === req.params.pid); if (!d || !pay) return res.status(404).json({ error: 'Pagamento não encontrado' });
      if (!Array.isArray(d.payments)) d.payments = dealPays(d);
      const target = d.payments.find((x) => x.id === req.params.pid); const fileId = newId('f'); await db.putFile(fileId, mime, buf);
      const oldFile = target.fileId; target.fileId = fileId; target.fileName = str(b.name, 100) || ('comprovante.' + ALLOWED[mime]); db.write(data);
      if (oldFile) db.deleteFiles([oldFile]).catch(() => {});
      res.json({ ok: true, fileId, fileName: target.fileName });
    } catch (e) { res.status(500).json({ error: 'Não foi possível salvar o arquivo.' }); }
  });
  app.get('/api/deal-files/:id', requireAuth, async (req, res) => {
    const f = await db.getFile(req.params.id).catch(() => null); if (!f || !ALLOWED[f.mime]) return res.status(404).json({ error: 'Arquivo não encontrado' });
    res.set({ 'Content-Type': f.mime, 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=3600' }).send(f.buffer);
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
      items: (Array.isArray(b.items) ? b.items : []).slice(0, 300).map((it) => ({ sku: str(it.sku, 40), name: str(it.name, 160), description: str(it.description, 600), unit: str(it.unit, 12) || 'un', qty: Math.max(0, num(it.qty)), price: Math.max(0, num(it.price)), cost: Math.max(0, num(it.cost)), discountPct: clamp(num(it.discountPct), 0, 100), taxPct: clamp(num(it.taxPct), 0, 100) })).filter((it) => it.name || it.sku),
      taxMode: b.taxMode === 'included' ? 'included' : 'add', discountPct: clamp(num(b.discountPct), 0, 100), discountValue: Math.max(0, num(b.discountValue)), freight: Math.max(0, num(b.freight)),
      pay: { payments: (Array.isArray(b.pay && b.pay.payments) ? b.pay.payments : []).slice(0, 60).map((x) => ({ id: str(x.id, 40) || newId('pg'), date: /^\d{4}-\d{2}-\d{2}$/.test(x.date || '') ? x.date : today(), amount: r2(Math.max(0, num(x.amount))), note: str(x.note, 120) })).filter((x) => x.amount > 0) },
      materialExtra: r2(Math.max(0, num(b.materialExtra))), materialPaid: r2(Math.max(0, num(b.materialPaid))),
      payment: str(b.payment, 300), delivery: str(b.delivery, 300), warranty: str(b.warranty, 300), notes: str(b.notes, 1500), terms: str(b.terms, 1500), dealId: str(b.dealId, 40) || null
    };
  };
  app.get('/api/quotes', requireAuth, (req, res) => {
    res.json(store(db.view()).quotes.map((q) => ({ id: q.id, number: q.number, date: q.date, status: q.status, customerName: q.customer.name, total: q.totals.total, profit: q.totals.profit, materialCost: q.totals.materialCost, pay: payInfo(q), materialPaid: q.materialPaid || 0, dealId_: q.dealId || null, issuerName: q.issuer.name, createdByName: q.createdByName, dealId: q.dealId, itemCount: q.items.length })).reverse());
  });
  app.get('/api/quotes/:id', requireAuth, (req, res) => {
    const q = store(db.view()).quotes.find((x) => x.id === req.params.id); if (!q) return res.status(404).json({ error: 'Orçamento não encontrado' }); res.json({ ...q, payInfo: payInfo(q) });
  });
  app.post('/api/quotes', requireAuth, (req, res) => {
    const data = db.read(); const o = store(data); const y = Number(today().slice(0, 4));
    if (o.settings.counter.year !== y) o.settings.counter = { year: y, n: 0 };
    o.settings.counter.n += 1;
    const q = { id: newId('q'), number: `ORC-${y}-${String(o.settings.counter.n).padStart(4, '0')}`, ...clean(req.body || {}, o.settings), createdBy: req.user && req.user.role !== 'matriz' ? req.user.id : null, createdByName: authorName(req.user), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    q.totals = calcTotals(q); o.quotes.push(q); db.write(data); res.status(201).json({ ...q, payInfo: payInfo(q) });
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

module.exports = { register, calcTotals, payInfo };
