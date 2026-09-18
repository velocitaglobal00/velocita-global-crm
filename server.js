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
    notes: req.body.notes || '',
    category: req.body.category || null,
    tags: Array.isArray(req.body.tags) ? req.body.tags : [],
    source: req.body.source || { channel: 'organico', campaign: '' },
    channels: req.body.channels || { whatsapp: '', facebookPsid: '', instagramId: '' }
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
  const stageId = req.body.stage || data.stages[0].id;
  const now = new Date().toISOString();
  const deal = {
    id: newId('d'),
    title: req.body.title || 'Novo negócio',
    value: Number(req.body.value) || 0,
    currency: req.body.currency || 'BRL',
    personId: req.body.personId || null,
    orgId: req.body.orgId || null,
    stage: stageId,
    ownerId: req.body.ownerId || (data.users[0] && data.users[0].id) || null,
    closeDate: req.body.closeDate || null,
    status: 'open',
    createdAt: now,
    stageHistory: [{ stageId, enteredAt: now, exitedAt: null }]
  };
  data.deals.push(deal);
  db.write(data);
  res.status(201).json(deal);
});

app.put('/api/deals/:id', requireAuth, (req, res) => {
  const data = db.read();
  const deal = data.deals.find((d) => d.id === req.params.id);
  if (!deal) return res.status(404).json({ error: 'Negócio não encontrado' });

  if (req.body.stage && req.body.stage !== deal.stage) {
    const now = new Date().toISOString();
    if (!Array.isArray(deal.stageHistory)) deal.stageHistory = [];
    const openEntry = deal.stageHistory.find((h) => !h.exitedAt);
    if (openEntry) openEntry.exitedAt = now;
    deal.stageHistory.push({ stageId: req.body.stage, enteredAt: now, exitedAt: null });
  }

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

// ---------- Tags (etiquetas) ----------
app.get('/api/tags', requireAuth, (req, res) => {
  res.json(db.read().tags || []);
});

app.post('/api/tags', requireAuth, (req, res) => {
  const data = db.read();
  if (!data.tags) data.tags = [];
  const tag = { id: newId('tag'), name: req.body.name || '', color: req.body.color || '#1b2a4e' };
  data.tags.push(tag);
  db.write(data);
  res.status(201).json(tag);
});

app.delete('/api/tags/:id', requireAuth, (req, res) => {
  const data = db.read();
  data.tags = (data.tags || []).filter((t) => t.id !== req.params.id);
  data.contacts.forEach((c) => {
    if (Array.isArray(c.tags)) c.tags = c.tags.filter((id) => id !== req.params.id);
  });
  db.write(data);
  res.json({ ok: true });
});

// ---------- Reminders (lembretes / tarefas a vencer) ----------
app.get('/api/reminders', requireAuth, (req, res) => {
  const data = db.read();
  const now = new Date();
  const reminders = data.activities
    .filter((a) => a.type === 'task' && !a.done)
    .map((a) => {
      const deal = data.deals.find((d) => d.id === a.dealId);
      return {
        id: a.id,
        dealId: a.dealId,
        dealTitle: deal ? deal.title : 'Negócio removido',
        text: a.text,
        date: a.date,
        overdue: new Date(a.date) < now
      };
    })
    .sort((x, y) => new Date(x.date) - new Date(y.date));
  res.json(reminders);
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

// ---------- Integrações: webhooks de recebimento ----------
// Estes endpoints ficam prontos para receber eventos reais da Meta (WhatsApp/Facebook/
// Instagram) e do Google Ads assim que você configurar suas próprias credenciais em
// Configurações > Integrações e apontar os webhooks dessas plataformas para estas URLs.
// Sem credenciais configuradas, eles apenas registram o payload recebido.

function findContactByChannel(data, channel, value) {
  if (!value) return null;
  return data.contacts.find((c) => {
    if (channel === 'whatsapp') return c.channels && c.channels.whatsapp === value;
    if (channel === 'facebook') return c.channels && c.channels.facebookPsid === value;
    if (channel === 'instagram') return c.channels && c.channels.instagramId === value;
    if (channel === 'email') return c.email === value;
    return false;
  });
}

function logWebhookEvent(channel, req, res) {
  // Verificação de webhook do Meta (hub.challenge) para WhatsApp/Facebook/Instagram
  if (req.method === 'GET') {
    const verifyToken = (db.read().settings.integrations.whatsapp || {}).verifyToken;
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === verifyToken && verifyToken) {
      return res.status(200).send(req.query['hub.challenge']);
    }
    return res.status(403).json({ error: 'Verify token inválido' });
  }

  const data = db.read();
  if (!data.webhookEvents) data.webhookEvents = [];
  data.webhookEvents.unshift({
    id: newId('evt'),
    channel,
    receivedAt: new Date().toISOString(),
    payload: req.body
  });
  data.webhookEvents = data.webhookEvents.slice(0, 200);
  db.write(data);
  res.status(200).json({ ok: true });
}

app.get('/api/webhooks/whatsapp', (req, res) => logWebhookEvent('whatsapp', req, res));
app.post('/api/webhooks/whatsapp', (req, res) => logWebhookEvent('whatsapp', req, res));
app.get('/api/webhooks/facebook', (req, res) => logWebhookEvent('facebook', req, res));
app.post('/api/webhooks/facebook', (req, res) => logWebhookEvent('facebook', req, res));
app.get('/api/webhooks/instagram', (req, res) => logWebhookEvent('instagram', req, res));
app.post('/api/webhooks/instagram', (req, res) => logWebhookEvent('instagram', req, res));
app.post('/api/webhooks/google-ads-leads', (req, res) => logWebhookEvent('google_ads', req, res));

app.get('/api/webhook-events', requireAuth, (req, res) => {
  res.json((db.read().webhookEvents || []).slice(0, 50));
});

// ---------- Envio de mensagens (WhatsApp / E-mail) ----------
// Usa as credenciais salvas em Configurações > Integrações. Retorna erro claro se
// ainda não houver credenciais configuradas — a chamada real só funciona com uma
// conta válida da Meta (WhatsApp Cloud API) ou de um provedor de e-mail (SMTP).
app.post('/api/leads/:id/send-whatsapp', requireAuth, async (req, res) => {
  const data = db.read();
  const contact = data.contacts.find((c) => c.id === req.params.id);
  if (!contact) return res.status(404).json({ error: 'Lead não encontrado' });

  const wa = data.settings.integrations.whatsapp || {};
  if (!wa.phoneNumberId || !wa.accessToken) {
    return res.status(400).json({
      error: 'Integração do WhatsApp não configurada. Adicione o Phone Number ID e o Access Token em Configurações > Integrações.'
    });
  }
  const to = contact.channels && contact.channels.whatsapp;
  if (!to) return res.status(400).json({ error: 'Este lead não possui número de WhatsApp cadastrado.' });

  try {
    const response = await fetch(`https://graph.facebook.com/v19.0/${wa.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${wa.accessToken}` },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: req.body.message || '' }
      })
    });
    const result = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: result.error?.message || 'Erro na API do WhatsApp' });
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: 'Falha ao conectar com a API do WhatsApp: ' + err.message });
  }
});

app.post('/api/leads/:id/send-email', requireAuth, async (req, res) => {
  const data = db.read();
  const contact = data.contacts.find((c) => c.id === req.params.id);
  if (!contact) return res.status(404).json({ error: 'Lead não encontrado' });

  const email = data.settings.integrations.email || {};
  if (!email.smtpHost || !email.smtpUser || !email.smtpPass) {
    return res.status(400).json({
      error: 'Integração de e-mail não configurada. Adicione um servidor SMTP em Configurações > Integrações.'
    });
  }
  if (!contact.email) return res.status(400).json({ error: 'Este lead não possui e-mail cadastrado.' });

  // Envio real de e-mail requer um cliente SMTP (ex: nodemailer) configurado com as
  // credenciais acima. Deixe pronto para plugar assim que a integração for configurada.
  res.status(501).json({
    error: 'Credenciais de SMTP salvas, mas o envio real ainda depende de instalar um cliente SMTP (ex: nodemailer) no servidor.'
  });
});

app.listen(PORT, () => {
  console.log(`Velocita Global CRM rodando em http://localhost:${PORT}`);
});
