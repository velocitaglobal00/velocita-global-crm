const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');
const db = require('./db');

const APP_PASSWORD = 'Velocita1';
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());
app.use(
  session({
    secret: 'velocita-global-crm-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 12 } // 12h
  })
);

// ---------- Auth ----------
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  return res.status(401).json({ error: 'Não autenticado' });
}

function requirePageAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  return res.redirect('/login.html');
}

app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  if (password === APP_PASSWORD) {
    req.session.authenticated = true;
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: 'Senha incorreta' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/session', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.authenticated) });
});

// ---------- Static assets (public, non-sensitive) ----------
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  if (req.session && req.session.authenticated) return res.redirect('/app');
  return res.redirect('/login.html');
});

app.get('/app', requirePageAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'app.html'));
});

// ---------- API helpers ----------
function newId(prefix) {
  return `${prefix}-${crypto.randomBytes(6).toString('hex')}`;
}

// ---------- Stages ----------
app.get('/api/stages', requireAuth, (req, res) => {
  const data = db.read();
  res.json(data.stages.sort((a, b) => a.order - b.order));
});

app.post('/api/stages', requireAuth, (req, res) => {
  const data = db.read();
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nome obrigatório' });
  const maxOrder = data.stages.reduce((m, s) => Math.max(m, s.order), 0);
  const stage = { id: newId('st'), name: name.trim(), order: maxOrder + 1 };
  data.stages.push(stage);
  db.write(data);
  res.status(201).json(stage);
});

app.put('/api/stages/:id', requireAuth, (req, res) => {
  const data = db.read();
  const stage = data.stages.find((s) => s.id === req.params.id);
  if (!stage) return res.status(404).json({ error: 'Estágio não encontrado' });
  Object.assign(stage, req.body);
  db.write(data);
  res.json(stage);
});

app.delete('/api/stages/:id', requireAuth, (req, res) => {
  const data = db.read();
  const inUse = data.deals.some((d) => d.stage === req.params.id);
  if (inUse) return res.status(400).json({ error: 'Existem negócios neste estágio' });
  data.stages = data.stages.filter((s) => s.id !== req.params.id);
  db.write(data);
  res.json({ ok: true });
});

app.put('/api/stages-reorder', requireAuth, (req, res) => {
  const data = db.read();
  const { orderedIds } = req.body;
  orderedIds.forEach((id, idx) => {
    const stage = data.stages.find((s) => s.id === id);
    if (stage) stage.order = idx + 1;
  });
  db.write(data);
  res.json(data.stages.sort((a, b) => a.order - b.order));
});

// ---------- Organizations ----------
app.get('/api/organizations', requireAuth, (req, res) => {
  res.json(db.read().organizations);
});

app.post('/api/organizations', requireAuth, (req, res) => {
  const data = db.read();
  const org = { id: newId('org'), name: req.body.name || '', address: req.body.address || '' };
  data.organizations.push(org);
  db.write(data);
  res.status(201).json(org);
});

app.put('/api/organizations/:id', requireAuth, (req, res) => {
  const data = db.read();
  const org = data.organizations.find((o) => o.id === req.params.id);
  if (!org) return res.status(404).json({ error: 'Empresa não encontrada' });
  Object.assign(org, req.body);
  db.write(data);
  res.json(org);
});

app.delete('/api/organizations/:id', requireAuth, (req, res) => {
  const data = db.read();
  data.organizations = data.organizations.filter((o) => o.id !== req.params.id);
  db.write(data);
  res.json({ ok: true });
});

// ---------- Contacts (people) ----------
app.get('/api/contacts', requireAuth, (req, res) => {
  res.json(db.read().contacts);
});

app.post('/api/contacts', requireAuth, (req, res) => {
  const data = db.read();
  const contact = {
    id: newId('c'),
    name: req.body.name || '',
    email: req.body.email || '',
    phone: req.body.phone || '',
    orgId: req.body.orgId || null,
    notes: req.body.notes || ''
  };
  data.contacts.push(contact);
  db.write(data);
  res.status(201).json(contact);
});

app.put('/api/contacts/:id', requireAuth, (req, res) => {
  const data = db.read();
  const contact = data.contacts.find((c) => c.id === req.params.id);
  if (!contact) return res.status(404).json({ error: 'Contato não encontrado' });
  Object.assign(contact, req.body);
  db.write(data);
  res.json(contact);
});

app.delete('/api/contacts/:id', requireAuth, (req, res) => {
  const data = db.read();
  data.contacts = data.contacts.filter((c) => c.id !== req.params.id);
  db.write(data);
  res.json({ ok: true });
});

// ---------- Deals ----------
app.get('/api/deals', requireAuth, (req, res) => {
  res.json(db.read().deals);
});

app.post('/api/deals', requireAuth, (req, res) => {
  const data = db.read();
  const deal = {
    id: newId('d'),
    title: req.body.title || 'Novo negócio',
    value: Number(req.body.value) || 0,
    currency: req.body.currency || 'BRL',
    personId: req.body.personId || null,
    orgId: req.body.orgId || null,
    stage: req.body.stage || data.stages[0].id,
    ownerId: req.body.ownerId || (data.users[0] && data.users[0].id) || null,
    closeDate: req.body.closeDate || null,
    status: 'open',
    createdAt: new Date().toISOString()
  };
  data.deals.push(deal);
  db.write(data);
  res.status(201).json(deal);
});

app.put('/api/deals/:id', requireAuth, (req, res) => {
  const data = db.read();
  const deal = data.deals.find((d) => d.id === req.params.id);
  if (!deal) return res.status(404).json({ error: 'Negócio não encontrado' });
  Object.assign(deal, req.body);
  db.write(data);
  res.json(deal);
});

app.delete('/api/deals/:id', requireAuth, (req, res) => {
  const data = db.read();
  data.deals = data.deals.filter((d) => d.id !== req.params.id);
  data.activities = data.activities.filter((a) => a.dealId !== req.params.id);
  db.write(data);
  res.json({ ok: true });
});

// ---------- Activities ----------
app.get('/api/deals/:id/activities', requireAuth, (req, res) => {
  const data = db.read();
  res.json(data.activities.filter((a) => a.dealId === req.params.id));
});

app.post('/api/deals/:id/activities', requireAuth, (req, res) => {
  const data = db.read();
  const activity = {
    id: newId('a'),
    dealId: req.params.id,
    type: req.body.type || 'note',
    text: req.body.text || '',
    date: req.body.date || new Date().toISOString(),
    done: !!req.body.done
  };
  data.activities.push(activity);
  db.write(data);
  res.status(201).json(activity);
});

app.put('/api/activities/:id', requireAuth, (req, res) => {
  const data = db.read();
  const activity = data.activities.find((a) => a.id === req.params.id);
  if (!activity) return res.status(404).json({ error: 'Atividade não encontrada' });
  Object.assign(activity, req.body);
  db.write(data);
  res.json(activity);
});

app.delete('/api/activities/:id', requireAuth, (req, res) => {
  const data = db.read();
  data.activities = data.activities.filter((a) => a.id !== req.params.id);
  db.write(data);
  res.json({ ok: true });
});

// ---------- Users ----------
app.get('/api/users', requireAuth, (req, res) => {
  res.json(db.read().users);
});

app.post('/api/users', requireAuth, (req, res) => {
  const data = db.read();
  const user = { id: newId('u'), name: req.body.name || 'Novo usuário' };
  data.users.push(user);
  db.write(data);
  res.status(201).json(user);
});

app.delete('/api/users/:id', requireAuth, (req, res) => {
  const data = db.read();
  if (data.users.length <= 1) return res.status(400).json({ error: 'É necessário ao menos um usuário' });
  data.users = data.users.filter((u) => u.id !== req.params.id);
  db.write(data);
  res.json({ ok: true });
});

// ---------- Settings (custom fields, goal) ----------
app.get('/api/settings', requireAuth, (req, res) => {
  res.json(db.read().settings);
});

app.put('/api/settings', requireAuth, (req, res) => {
  const data = db.read();
  data.settings = { ...data.settings, ...req.body };
  db.write(data);
  res.json(data.settings);
});

app.post('/api/settings/custom-fields', requireAuth, (req, res) => {
  const data = db.read();
  const field = { id: newId('cf'), name: req.body.name || '' };
  data.settings.customFields.push(field);
  db.write(data);
  res.status(201).json(field);
});

app.delete('/api/settings/custom-fields/:id', requireAuth, (req, res) => {
  const data = db.read();
  data.settings.customFields = data.settings.customFields.filter((f) => f.id !== req.params.id);
  db.write(data);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Velocita Global CRM rodando em http://localhost:${PORT}`);
});
