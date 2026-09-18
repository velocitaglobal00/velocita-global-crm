const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');
const nodemailer = require('nodemailer');
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

// Registra quem (qual admin) fez uma alteração em um lead ou organização.
function logHistory(data, entityType, entityId, attendantId, action, summary) {
  if (!data.history) data.history = [];
  const attendant = data.users.find((u) => u.id === attendantId);
  data.history.unshift({
    id: newId('h'),
    entityType,
    entityId,
    attendantId: attendantId || null,
    attendantName: attendant ? attendant.name : 'Alguém',
    action,
    summary,
    timestamp: new Date().toISOString()
  });
}

const FIELD_LABELS = {
  name: 'nome', email: 'e-mail', phone: 'telefone', orgId: 'empresa', notes: 'notas',
  category: 'categoria', ownerId: 'proprietário', address: 'endereço'
};

function diffSummary(before, after, fields) {
  const parts = [];
  const changed = fields.filter((f) => String(before[f] || '') !== String(after[f] || ''));
  if (changed.length > 0) parts.push(`Atualizou ${changed.map((f) => FIELD_LABELS[f] || f).join(', ')}`);

  const beforeExtra = before.extraInfo || [];
  const afterExtra = after.extraInfo || [];
  if (afterExtra.length > beforeExtra.length) {
    const added = afterExtra.filter((i) => !beforeExtra.some((b) => b.id === i.id));
    added.forEach((i) => parts.push(`Adicionou informação "${i.label}"`));
  } else if (afterExtra.length < beforeExtra.length) {
    const removed = beforeExtra.filter((i) => !afterExtra.some((a) => a.id === i.id));
    removed.forEach((i) => parts.push(`Removeu informação "${i.label}"`));
  }

  return parts.length ? parts.join('; ') : null;
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
  const org = {
    id: newId('org'),
    name: req.body.name || '',
    address: req.body.address || '',
    ownerId: req.body.ownerId || null,
    extraInfo: []
  };
  data.organizations.push(org);
  logHistory(data, 'org', org.id, req.body.attendantId, 'created', 'Empresa criada');
  db.write(data);
  res.status(201).json(org);
});

app.put('/api/organizations/:id', requireAuth, (req, res) => {
  const data = db.read();
  const org = data.organizations.find((o) => o.id === req.params.id);
  if (!org) return res.status(404).json({ error: 'Empresa não encontrada' });
  const before = { ...org };
  const { attendantId, ...payload } = req.body;
  Object.assign(org, payload);
  const summary = diffSummary(before, org, ['name', 'address', 'ownerId']);
  if (summary) logHistory(data, 'org', org.id, attendantId, 'updated', summary);
  db.write(data);
  res.json(org);
});

app.delete('/api/organizations/:id', requireAuth, (req, res) => {
  const data = db.read();
  data.organizations = data.organizations.filter((o) => o.id !== req.params.id);
  db.write(data);
  res.json({ ok: true });
});

app.get('/api/organizations/:id/history', requireAuth, (req, res) => {
  const data = db.read();
  res.json((data.history || []).filter((h) => h.entityType === 'org' && h.entityId === req.params.id));
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
    ownerId: req.body.ownerId || null,
    extraInfo: [],
    source: req.body.source || { channel: 'organico', campaign: '' },
    channels: req.body.channels || { whatsapp: '', facebookPsid: '', instagramId: '' }
  };
  data.contacts.push(contact);
  logHistory(data, 'lead', contact.id, req.body.attendantId, 'created', 'Lead criado');
  db.write(data);
  res.status(201).json(contact);
});

app.put('/api/contacts/:id', requireAuth, (req, res) => {
  const data = db.read();
  const contact = data.contacts.find((c) => c.id === req.params.id);
  if (!contact) return res.status(404).json({ error: 'Contato não encontrado' });
  const before = { ...contact };
  const { attendantId, ...payload } = req.body;
  Object.assign(contact, payload);
  const summary = diffSummary(before, contact, ['name', 'email', 'phone', 'orgId', 'category', 'ownerId', 'notes']);
  if (summary) logHistory(data, 'lead', contact.id, attendantId, 'updated', summary);
  db.write(data);
  res.json(contact);
});

app.delete('/api/contacts/:id', requireAuth, (req, res) => {
  const data = db.read();
  data.contacts = data.contacts.filter((c) => c.id !== req.params.id);
  db.write(data);
  res.json({ ok: true });
});

app.get('/api/leads/:id/history', requireAuth, (req, res) => {
  const data = db.read();
  res.json((data.history || []).filter((h) => h.entityType === 'lead' && h.entityId === req.params.id));
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
    platform: req.body.platform || null,
    extraInfo: [],
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
// Todas as atividades (negócios + leads) — usado pelo Roteiro do Dia.
app.get('/api/activities', requireAuth, (req, res) => {
  res.json(db.read().activities);
});

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
    done: !!req.body.done,
    attendantId: req.body.attendantId || null,
    attendantName: (data.users.find((u) => u.id === req.body.attendantId) || {}).name || null
  };
  data.activities.push(activity);
  db.write(data);
  res.status(201).json(activity);
});

// Atividades gerais do lead (não vinculadas a um negócio específico)
app.get('/api/leads/:id/activities', requireAuth, (req, res) => {
  const data = db.read();
  res.json(data.activities.filter((a) => a.leadId === req.params.id));
});

app.post('/api/leads/:id/activities', requireAuth, (req, res) => {
  const data = db.read();
  const activity = {
    id: newId('a'),
    leadId: req.params.id,
    type: req.body.type || 'note',
    text: req.body.text || '',
    date: req.body.date || new Date().toISOString(),
    done: !!req.body.done,
    attendantId: req.body.attendantId || null,
    attendantName: (data.users.find((u) => u.id === req.body.attendantId) || {}).name || null
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
      if (a.leadId) {
        const lead = data.contacts.find((c) => c.id === a.leadId);
        return {
          id: a.id,
          dealId: null,
          leadId: a.leadId,
          dealTitle: lead ? `Lead: ${lead.name}` : 'Lead removido',
          text: a.text,
          date: a.date,
          overdue: new Date(a.date) < now
        };
      }
      const deal = data.deals.find((d) => d.id === a.dealId);
      return {
        id: a.id,
        dealId: a.dealId,
        leadId: null,
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
  const user = { id: newId('u'), name: req.body.name || 'Novo usuário', ramal: req.body.ramal || '' };
  data.users.push(user);
  db.write(data);
  res.status(201).json(user);
});

app.put('/api/users/:id', requireAuth, (req, res) => {
  const data = db.read();
  const user = data.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  Object.assign(user, req.body);
  db.write(data);
  res.json(user);
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
  if (req.method === 'POST') tryIngestInbound(data, channel, req.body);
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

function pushMessage(data, msg) {
  if (!data.messages) data.messages = [];
  const full = {
    id: newId('msg'),
    attendantId: null,
    attendantName: null,
    deliveryStatus: 'received',
    deliveryNote: '',
    timestamp: new Date().toISOString(),
    ...msg
  };
  data.messages.push(full);

  if (full.direction === 'in') {
    if (!data.notifications) data.notifications = [];
    const lead = data.contacts.find((c) => c.id === full.leadId);
    data.notifications.unshift({
      id: newId('notif'),
      leadId: full.leadId,
      leadName: lead ? lead.name : 'Lead',
      channel: full.channel,
      preview: full.text,
      timestamp: full.timestamp,
      read: false
    });
    data.notifications = data.notifications.slice(0, 100);
  }
  return full;
}

// Faz o melhor esforço para interpretar payloads reais de webhook da Meta (WhatsApp/
// Facebook/Instagram usam formatos parecidos) e registrar a mensagem recebida na
// conversa do lead correspondente, identificado pelo número/ID do canal.
function tryIngestInbound(data, channel, body) {
  try {
    if (channel === 'whatsapp') {
      (body.entry || []).forEach((entry) => {
        (entry.changes || []).forEach((change) => {
          const value = change.value || {};
          (value.messages || []).forEach((m) => {
            const contact = findContactByChannel(data, 'whatsapp', m.from);
            if (!contact) return;
            pushMessage(data, {
              leadId: contact.id,
              channel: 'whatsapp',
              direction: 'in',
              text: (m.text && m.text.body) || `[${m.type}]`,
              timestamp: new Date(Number(m.timestamp) * 1000).toISOString()
            });
          });
        });
      });
    } else if (channel === 'facebook' || channel === 'instagram') {
      (body.entry || []).forEach((entry) => {
        (entry.messaging || []).forEach((evt) => {
          const text = evt.message && evt.message.text;
          const senderId = evt.sender && evt.sender.id;
          if (!text || !senderId) return;
          const contact = findContactByChannel(data, channel === 'facebook' ? 'facebook' : 'instagram', senderId);
          if (!contact) return;
          pushMessage(data, { leadId: contact.id, channel, direction: 'in', text });
        });
      });
    }
  } catch (e) {
    // Formato de payload não reconhecido; o evento bruto já fica salvo em webhookEvents.
  }
}

app.get('/api/webhooks/whatsapp', (req, res) => logWebhookEvent('whatsapp', req, res));
app.post('/api/webhooks/whatsapp', (req, res) => logWebhookEvent('whatsapp', req, res));
app.get('/api/webhooks/facebook', (req, res) => logWebhookEvent('facebook', req, res));
app.post('/api/webhooks/facebook', (req, res) => logWebhookEvent('facebook', req, res));
app.get('/api/webhooks/instagram', (req, res) => logWebhookEvent('instagram', req, res));
app.post('/api/webhooks/instagram', (req, res) => logWebhookEvent('instagram', req, res));
app.post('/api/webhooks/google-ads-leads', (req, res) => logWebhookEvent('google_ads', req, res));

// Webhook de e-mail recebido (compatível com o formato "Inbound Parse" de provedores
// como SendGrid/Mailgun/Postmark: campos "from" e "text"/"body-plain").
app.post('/api/webhooks/email', (req, res) => {
  const data = db.read();
  const from = req.body.from || req.body.sender || '';
  const emailMatch = (from.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [])[0];
  const text = req.body.text || req.body['body-plain'] || req.body.subject || '';
  const contact = findContactByChannel(data, 'email', emailMatch);
  if (contact) {
    pushMessage(data, { leadId: contact.id, channel: 'email', direction: 'in', text });
  }
  if (!data.webhookEvents) data.webhookEvents = [];
  data.webhookEvents.unshift({ id: newId('evt'), channel: 'email', receivedAt: new Date().toISOString(), payload: req.body });
  data.webhookEvents = data.webhookEvents.slice(0, 200);
  db.write(data);
  res.status(200).json({ ok: true });
});

app.get('/api/webhook-events', requireAuth, (req, res) => {
  res.json((db.read().webhookEvents || []).slice(0, 50));
});

// ---------- Conversas por canal (WhatsApp / Facebook / Instagram / E-mail) ----------
// Cada mensagem enviada fica registrada com o atendente (usuário logado no CRM) que
// a escreveu. O envio real só acontece quando a integração correspondente estiver
// configurada em Configurações > Integrações; caso contrário a mensagem fica
// registrada apenas no CRM (deliveryStatus: "simulated"), de forma transparente.
// Lista a conversa mais recente por lead+canal — alimenta a página Comunicações.
app.get('/api/messages', requireAuth, (req, res) => {
  const data = db.read();
  const latestByThread = new Map();
  (data.messages || [])
    .slice()
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .forEach((m) => {
      latestByThread.set(`${m.leadId}::${m.channel}`, m);
    });
  const threads = Array.from(latestByThread.values())
    .map((m) => {
      const lead = data.contacts.find((c) => c.id === m.leadId);
      return { leadId: m.leadId, leadName: lead ? lead.name : 'Lead removido', channel: m.channel, lastMessage: m };
    })
    .sort((a, b) => new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp));
  res.json(threads);
});

// ---------- Notificações ----------
app.get('/api/notifications', requireAuth, (req, res) => {
  res.json((db.read().notifications || []).slice(0, 50));
});

app.get('/api/notifications/unread-count', requireAuth, (req, res) => {
  const count = (db.read().notifications || []).filter((n) => !n.read).length;
  res.json({ count });
});

app.post('/api/notifications/:id/read', requireAuth, (req, res) => {
  const data = db.read();
  const notif = (data.notifications || []).find((n) => n.id === req.params.id);
  if (notif) notif.read = true;
  db.write(data);
  res.json({ ok: true });
});

app.post('/api/notifications/read-all', requireAuth, (req, res) => {
  const data = db.read();
  (data.notifications || []).forEach((n) => (n.read = true));
  db.write(data);
  res.json({ ok: true });
});

app.get('/api/leads/:id/messages', requireAuth, (req, res) => {
  const data = db.read();
  let msgs = (data.messages || []).filter((m) => m.leadId === req.params.id);
  if (req.query.channel) msgs = msgs.filter((m) => m.channel === req.query.channel);
  msgs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  res.json(msgs);
});

app.post('/api/leads/:id/messages', requireAuth, async (req, res) => {
  const data = db.read();
  const contact = data.contacts.find((c) => c.id === req.params.id);
  if (!contact) return res.status(404).json({ error: 'Lead não encontrado' });

  const { channel, text, attendantId, subject, attachments } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Mensagem vazia' });
  const attendant = data.users.find((u) => u.id === attendantId);

  const message = {
    id: newId('msg'),
    leadId: contact.id,
    channel,
    direction: 'out',
    text: text.trim(),
    attendantId: attendantId || null,
    attendantName: attendant ? attendant.name : 'Atendente',
    timestamp: new Date().toISOString(),
    deliveryStatus: 'simulated',
    deliveryNote: ''
  };
  if (channel === 'email') {
    message.subject = subject || '(sem assunto)';
    message.attachments = Array.isArray(attachments) ? attachments.map((a) => ({ filename: a.filename, size: a.size })) : [];
    message.opens = [];
    message.openCount = 0;
  }

  try {
    if (channel === 'whatsapp') {
      const wa = data.settings.integrations.whatsapp || {};
      const to = contact.channels && contact.channels.whatsapp;
      if (wa.phoneNumberId && wa.accessToken && to) {
        const response = await fetch(`https://graph.facebook.com/v19.0/${wa.phoneNumberId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${wa.accessToken}` },
          body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: message.text } })
        });
        const result = await response.json();
        if (response.ok) message.deliveryStatus = 'sent';
        else {
          message.deliveryStatus = 'failed';
          message.deliveryNote = (result.error && result.error.message) || 'Erro na API do WhatsApp';
        }
      } else {
        message.deliveryNote = 'Integração do WhatsApp não configurada em Configurações > Integrações.';
      }
    } else if (channel === 'facebook' || channel === 'instagram') {
      const creds = channel === 'facebook' ? data.settings.integrations.facebook : data.settings.integrations.instagram;
      const recipientId = channel === 'facebook' ? contact.channels && contact.channels.facebookPsid : contact.channels && contact.channels.instagramId;
      const token = channel === 'facebook' ? creds && creds.pageAccessToken : creds && creds.accessToken;
      if (token && recipientId) {
        const response = await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${encodeURIComponent(token)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipient: { id: recipientId }, message: { text: message.text } })
        });
        const result = await response.json();
        if (response.ok) message.deliveryStatus = 'sent';
        else {
          message.deliveryStatus = 'failed';
          message.deliveryNote = (result.error && result.error.message) || 'Erro na API';
        }
      } else {
        message.deliveryNote = `Integração do ${channel === 'facebook' ? 'Facebook' : 'Instagram'} não configurada em Configurações > Integrações.`;
      }
    } else if (channel === 'email') {
      const email = data.settings.integrations.email || {};
      if (email.smtpHost && email.smtpUser && email.smtpPass && contact.email) {
        try {
          const transporter = nodemailer.createTransport({
            host: email.smtpHost,
            port: Number(email.smtpPort) || 587,
            secure: Number(email.smtpPort) === 465,
            auth: { user: email.smtpUser, pass: email.smtpPass }
          });
          const trackingPixel = `<img src="${req.protocol}://${req.get('host')}/api/track/open/${message.id}.png" width="1" height="1" alt="" style="display:none;" />`;
          const htmlBody = message.text.replace(/\n/g, '<br>') + trackingPixel;
          const mailAttachments = (Array.isArray(attachments) ? attachments : [])
            .filter((a) => a.dataBase64)
            .map((a) => ({ filename: a.filename, content: a.dataBase64, encoding: 'base64' }));
          await transporter.sendMail({
            from: email.smtpUser,
            to: contact.email,
            subject: message.subject,
            html: htmlBody,
            attachments: mailAttachments
          });
          message.deliveryStatus = 'sent';
        } catch (mailErr) {
          message.deliveryStatus = 'failed';
          message.deliveryNote = mailErr.message;
        }
      } else {
        message.deliveryNote = 'Integração de e-mail (SMTP) não configurada em Configurações > Integrações.';
      }
    }
  } catch (err) {
    message.deliveryStatus = 'failed';
    message.deliveryNote = err.message;
  }

  if (!data.messages) data.messages = [];
  data.messages.push(message);
  db.write(data);
  res.status(201).json(message);
});

// Pixel de rastreamento de abertura de e-mail (1x1 transparente). É carregado
// automaticamente pelo cliente de e-mail do destinatário quando ele abre a
// mensagem e exibe imagens — por isso fica sem autenticação, como um webhook.
const TRACKING_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

app.get('/api/track/open/:messageId.png', (req, res) => {
  const data = db.read();
  const message = (data.messages || []).find((m) => m.id === req.params.messageId);
  if (message) {
    if (!Array.isArray(message.opens)) message.opens = [];
    message.opens.push({ timestamp: new Date().toISOString() });
    message.openCount = message.opens.length;
    db.write(data);
  }
  res.set('Content-Type', 'image/png');
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.send(TRACKING_PIXEL);
});

app.get('/api/leads/:id/messages/:messageId/opens', requireAuth, (req, res) => {
  const data = db.read();
  const message = (data.messages || []).find((m) => m.id === req.params.messageId && m.leadId === req.params.id);
  if (!message) return res.status(404).json({ error: 'Mensagem não encontrada' });
  res.json({ openCount: message.openCount || 0, opens: message.opens || [] });
});

// ---------- Assistente de IA ----------
// Suporta provedores gratuitos: Ollama (modelo local, sem custo, sem chave), Groq e
// Google Gemini (planos gratuitos na nuvem, só uma API key grátis), além de
// Anthropic Claude (pago). Escolha em Configurações > Assistente IA.
async function callAiProvider(ai, systemPrompt, userMessage, history) {
  const provider = ai.provider || 'ollama';
  const messages = (history || []).map((h) => ({ role: h.role, content: h.content }));
  messages.push({ role: 'user', content: userMessage });

  if (provider === 'ollama') {
    const baseUrl = ai.baseUrl || 'http://localhost:11434';
    let response;
    try {
      response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ai.model || 'llama3.1',
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          stream: false
        })
      });
    } catch (netErr) {
      throw new Error(
        `Não foi possível conectar ao Ollama em ${baseUrl}. Verifique se o Ollama está instalado e rodando neste computador (comando "ollama serve"), ou escolha outro provedor gratuito em Configurações > Assistente IA.`
      );
    }
    if (!response.ok) throw new Error(`Ollama respondeu ${response.status}. Verifique se o modelo "${ai.model || 'llama3.1'}" foi baixado (ollama pull ${ai.model || 'llama3.1'}).`);
    const result = await response.json();
    return (result.message && result.message.content) || '';
  }

  if (provider === 'groq') {
    if (!ai.apiKey) throw new Error('Configure a API Key da Groq em Configurações > Assistente IA.');
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.apiKey}` },
      body: JSON.stringify({
        model: ai.model || 'llama-3.1-8b-instant',
        messages: [{ role: 'system', content: systemPrompt }, ...messages]
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error((result.error && result.error.message) || 'Erro na API da Groq');
    return (result.choices && result.choices[0] && result.choices[0].message.content) || '';
  }

  if (provider === 'gemini') {
    if (!ai.apiKey) throw new Error('Configure a API Key do Google Gemini em Configurações > Assistente IA.');
    const model = ai.model || 'gemini-1.5-flash';
    const transcript = [systemPrompt, ...messages.map((m) => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.content}`)].join('\n\n');
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${ai.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: transcript }] }] })
      }
    );
    const result = await response.json();
    if (!response.ok) throw new Error((result.error && result.error.message) || 'Erro na API do Gemini');
    return (result.candidates && result.candidates[0] && result.candidates[0].content.parts[0].text) || '';
  }

  if (provider === 'anthropic') {
    if (!ai.apiKey) throw new Error('Configure a API Key da Anthropic em Configurações > Assistente IA.');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ai.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: ai.model || 'claude-sonnet-4-5', max_tokens: 500, system: systemPrompt, messages })
    });
    const result = await response.json();
    if (!response.ok) throw new Error((result.error && result.error.message) || 'Erro na API da Anthropic');
    return (result.content && result.content[0] && result.content[0].text) || '';
  }

  throw new Error('Provedor de IA desconhecido.');
}

app.post('/api/ai/chat', requireAuth, async (req, res) => {
  const data = db.read();
  const ai = data.settings.integrations.ai || {};
  const { dealId, message, history } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Mensagem vazia' });

  const deal = data.deals.find((d) => d.id === dealId);
  const contact = deal ? data.contacts.find((c) => c.id === deal.personId) : null;
  const activities = deal ? data.activities.filter((a) => a.dealId === deal.id) : [];
  const stageNames = data.stages.map((s) => `${s.id}=${s.name}`).join(', ');

  let context = 'Nenhum negócio selecionado.';
  if (deal) {
    const stage = data.stages.find((s) => s.id === deal.stage);
    context = `Negócio: "${deal.title}", valor ${deal.currency} ${deal.value}, estágio atual: ${stage ? stage.name : '-'}, status: ${deal.status}, data de fechamento esperada: ${deal.closeDate || 'não definida'}.
Contato: ${contact ? contact.name : 'não vinculado'}.
Atividades recentes: ${activities.slice(-5).map((a) => `[${a.type}] ${a.text}`).join(' | ') || 'nenhuma'}.
Etapas disponíveis no funil (id=nome): ${stageNames}.`;
  }

  const systemPrompt = `Você é o assistente de vendas do CRM Velocita Global. Ajude o vendedor com dicas objetivas e práticas sobre o negócio abaixo. Responda em português, em até 4 frases. Não invente dados que não foram informados.
${context}
Se fizer sentido sugerir UMA ação concreta, adicione ao final da resposta, em uma linha própria, exatamente um destes formatos:
[ACAO:MOVER_ETAPA:<id_da_etapa>]
[ACAO:MARCAR_GANHO]
[ACAO:MARCAR_PERDIDO]
[ACAO:ADICIONAR_TAREFA:<texto da tarefa>]
Só inclua essa linha se realmente fizer sentido. Caso contrário, não inclua nenhuma tag.`;

  try {
    const reply = await callAiProvider(ai, systemPrompt, message, history);
    res.json({ reply });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---------- Dicas automáticas (regras locais, sem IA e sem custo) ----------
app.get('/api/ai/tips', requireAuth, (req, res) => {
  const data = db.read();
  const now = new Date();
  const tips = [];

  data.deals.filter((d) => d.status === 'open').forEach((deal) => {
    const open = (deal.stageHistory || []).find((h) => !h.exitedAt);
    if (open) {
      const days = Math.floor((now - new Date(open.enteredAt)) / 86400000);
      if (days >= 7) {
        const stage = data.stages.find((s) => s.id === deal.stage);
        tips.push({ icon: '⏳', text: `"${deal.title}" está há ${days} dias em ${stage ? stage.name : 'uma etapa'} sem avançar. Vale um follow-up.`, dealId: deal.id });
      }
    }
  });

  const overdueTasks = data.activities.filter((a) => a.type === 'task' && !a.done && new Date(a.date) < now);
  if (overdueTasks.length > 0) {
    tips.push({ icon: '⚠️', text: `Você tem ${overdueTasks.length} tarefa(s) atrasada(s). Confira os lembretes no Dashboard.`, dealId: null });
  }

  const goal = Number(data.settings.monthlyGoal) || 0;
  const wonValue = data.deals.filter((d) => d.status === 'won').reduce((s, d) => s + Number(d.value), 0);
  if (goal > 0) {
    const pct = Math.round((wonValue / goal) * 100);
    if (pct < 50) {
      tips.push({ icon: '🎯', text: `A meta do mês está em ${pct}%. Faltam R$ ${(goal - wonValue).toLocaleString('pt-BR')} para bater a meta.`, dealId: null });
    }
  }

  data.deals
    .filter((d) => d.status === 'open' && !data.activities.some((a) => a.dealId === d.id))
    .forEach((deal) => {
      tips.push({ icon: '📭', text: `"${deal.title}" ainda não tem nenhuma atividade registrada.`, dealId: deal.id });
    });

  if (tips.length === 0) {
    tips.push({ icon: '✅', text: 'Tudo em dia! Nenhum alerta no momento.', dealId: null });
  }

  res.json(tips.slice(0, 10));
});

// ---------- Vivo PABX: originar ligação (click-to-call) ----------
// A Vivo PABX Virtual não tem uma API pública padronizada como a da Meta ou do
// Google — o endpoint e o formato exato do corpo da requisição dependem do seu
// contrato e ficam disponíveis no painel administrativo da sua conta Vivo. Ajuste
// a "apiUrl" em Configurações > Integrações com a URL fornecida pela Vivo; se o
// formato do corpo da requisição for diferente do usado abaixo, me envie a
// documentação da sua conta para eu ajustar este endpoint com precisão.
app.post('/api/leads/:id/call', requireAuth, async (req, res) => {
  const data = db.read();
  const contact = data.contacts.find((c) => c.id === req.params.id);
  if (!contact) return res.status(404).json({ error: 'Lead não encontrado' });

  const pabx = data.settings.integrations.vivoPabx || {};
  const attendant = data.users.find((u) => u.id === req.body.attendantId);
  const phone = (contact.channels && contact.channels.whatsapp) || (contact.phone || '').replace(/\D/g, '');

  if (!pabx.apiUrl || !pabx.apiToken) {
    return res.status(400).json({ error: 'Integração da Vivo PABX não configurada em Configurações > Integrações.' });
  }
  if (!attendant || !attendant.ramal) {
    return res.status(400).json({ error: 'Cadastre o ramal do atendente em Configurações > Usuários.' });
  }
  if (!phone) {
    return res.status(400).json({ error: 'Este lead não possui telefone cadastrado.' });
  }

  try {
    const response = await fetch(pabx.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pabx.apiToken}` },
      body: JSON.stringify({ ramal: attendant.ramal, numero: phone })
    });
    const text = await response.text();
    if (!response.ok) return res.status(response.status).json({ error: `Vivo PABX respondeu ${response.status}: ${text}` });
    res.json({ ok: true, result: text });
  } catch (err) {
    res.status(500).json({ error: 'Falha ao conectar com a Vivo PABX: ' + err.message });
  }
});

// ---------- Google Calendar: sincronizar reunião/tarefa como evento ----------
// Requer um Client ID/Secret de um projeto no Google Cloud Console e um Refresh
// Token obtido via OAuth (veja INTEGRACOES.md). Sem isso, retorna erro claro.
async function getGoogleAccessToken(gcal) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: gcal.clientId,
      client_secret: gcal.clientSecret,
      refresh_token: gcal.refreshToken,
      grant_type: 'refresh_token'
    })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error_description || result.error || 'Falha ao renovar token do Google');
  return result.access_token;
}

app.post('/api/activities/:id/sync-calendar', requireAuth, async (req, res) => {
  const data = db.read();
  const activity = data.activities.find((a) => a.id === req.params.id);
  if (!activity) return res.status(404).json({ error: 'Atividade não encontrada' });

  const gcal = data.settings.integrations.googleCalendar || {};
  if (!gcal.clientId || !gcal.clientSecret || !gcal.refreshToken) {
    return res.status(400).json({ error: 'Integração do Google Calendar não configurada em Configurações > Integrações.' });
  }

  try {
    const accessToken = await getGoogleAccessToken(gcal);
    const start = new Date(activity.date);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const calendarId = gcal.calendarId || 'primary';

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          summary: activity.text,
          description: 'Criado automaticamente pelo Velocita Global CRM',
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() }
        })
      }
    );
    const result = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: result.error?.message || 'Erro na API do Google Calendar' });

    activity.googleEventId = result.id;
    activity.googleEventLink = result.htmlLink;
    db.write(data);
    res.json({ ok: true, eventLink: result.htmlLink });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Roteiro do Dia (gerador de roteiros virais para afiliados) ----------
// Aplicação independente (login, banco e IA próprios), montada dentro do mesmo
// site em /roteiro-do-dia. Não compartilha sessão nem dados com o CRM.
const roteiroDoDia = require('./roteiro-do-dia/server');
app.use('/roteiro-do-dia', roteiroDoDia.app);

(async () => {
  try {
    await roteiroDoDia.init();
  } catch (e) {
    console.error('Falha ao iniciar o Roteiro do Dia:', e);
  }

  app.listen(PORT, () => {
    console.log(`Velocita Global CRM rodando em http://localhost:${PORT}`);
  });
})();
