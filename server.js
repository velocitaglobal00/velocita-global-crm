const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');
const nodemailer = require('nodemailer');
const db = require('./db');

const APP_PASSWORD = 'Velocita1';
const PORT = process.env.PORT || 3000;

const app = express();
// Necessário no Render (atrás de proxy) para que req.protocol reporte "https"
// corretamente — usado para montar a redirect_uri do OAuth do Google Calendar.
app.set('trust proxy', 1);
// Limite maior que o padrão (100kb) porque fotos/áudios do Chat da Equipe e
// anexos de e-mail chegam em base64 dentro do corpo JSON — uma foto de celular
// sozinha já passa de 1-5MB antes mesmo da inflação de ~33% do base64.
app.use(express.json({ limit: '20mb' }));
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

// Notifica o celular de um sócio via WhatsApp (usa o número pessoal cadastrado
// em Configurações > Usuários) quando algo importante/individual acontece com
// ele: reunião marcada, tarefa atribuída, negócio ganho/perdido. Não bloqueia
// a resposta da rota que chamou — falha silenciosamente (só loga) se o
// WhatsApp Business não estiver configurado ou o usuário não tiver telefone.
function maybeNotifyActivity(data, activity) {
  if (!activity.attendantId || (activity.type !== 'meeting' && activity.type !== 'task')) return;
  const typeLabel = activity.type === 'meeting' ? 'Reunião' : 'Tarefa';
  const when = activity.date ? new Date(activity.date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
  notifyUserWhatsApp(data, activity.attendantId, `Velocita Global: ${typeLabel} atribuída a você — "${activity.text}"${when ? ` em ${when}` : ''}.`);
}

function notifyUserWhatsApp(data, userId, text) {
  const user = data.users.find((u) => u.id === userId);
  const wa = data.settings.integrations.whatsapp || {};
  if (!user || !user.phone || !wa.phoneNumberId || !wa.accessToken) return;
  const to = user.phone.replace(/\D/g, '');
  fetch(`https://graph.facebook.com/v19.0/${wa.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${wa.accessToken}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } })
  }).catch((err) => console.error(`Falha ao notificar ${user.name} via WhatsApp:`, err.message));
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
    cnpj: req.body.cnpj || '',
    razaoSocial: req.body.razaoSocial || '',
    setor: req.body.setor || '',
    phone: req.body.phone || '',
    mobile: req.body.mobile || '',
    address: req.body.address || '',
    notes: req.body.notes || '',
    tags: Array.isArray(req.body.tags) ? req.body.tags : [],
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
    categories: Array.isArray(req.body.categories) ? req.body.categories : req.body.category ? [req.body.category] : [],
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
  const summary = diffSummary(before, contact, ['name', 'email', 'phone', 'orgId', 'categories', 'ownerId', 'notes']);
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
    tags: Array.isArray(req.body.tags) ? req.body.tags : [],
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

  const statusChanged = req.body.status && req.body.status !== deal.status;
  Object.assign(deal, req.body);
  db.write(data);
  res.json(deal);

  if (statusChanged && deal.ownerId && (deal.status === 'won' || deal.status === 'lost')) {
    const label = deal.status === 'won' ? 'GANHO 🎉' : 'perdido';
    notifyUserWhatsApp(data, deal.ownerId, `Velocita Global: o negócio "${deal.title}" foi marcado como ${label}.`);
  }
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

// Criação avulsa (aba Calendário) — não vinculada obrigatoriamente a um negócio/lead.
app.post('/api/activities', requireAuth, (req, res) => {
  const data = db.read();
  const activity = {
    id: newId('a'),
    dealId: req.body.dealId || null,
    leadId: req.body.leadId || null,
    type: req.body.type || 'meeting',
    text: req.body.text || '',
    date: req.body.date || new Date().toISOString(),
    done: !!req.body.done,
    attendantId: req.body.attendantId || null,
    attendantName: (data.users.find((u) => u.id === req.body.attendantId) || {}).name || null
  };
  data.activities.push(activity);
  db.write(data);
  res.status(201).json(activity);
  maybeNotifyActivity(data, activity);
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
  maybeNotifyActivity(data, activity);
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
  maybeNotifyActivity(data, activity);
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
  const tag = {
    id: newId('tag'),
    name: req.body.name || '',
    color: req.body.color || '#1b2a4e',
    type: req.body.type === 'org' ? 'org' : 'lead'
  };
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
  data.organizations.forEach((o) => {
    if (Array.isArray(o.tags)) o.tags = o.tags.filter((id) => id !== req.params.id);
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

// Webhook do formulário do site institucional (velocita-digital-hub, hospedado no
// Replit). Sem autenticação de sessão pois é chamado pelo navegador do visitante,
// diretamente da página pública — por isso libera CORS só nesta rota.
app.options('/api/webhooks/site-form', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});

app.post('/api/webhooks/site-form', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  const data = db.read();
  const name = (req.body.name || req.body.nome || '').trim();
  const email = (req.body.email || '').trim();
  const whatsapp = (req.body.whatsapp || req.body.phone || '').trim();
  const company = (req.body.company || req.body.empresa || '').trim();
  const plan = (req.body.plan || req.body.plano || '').trim();
  const message = (req.body.message || req.body.mensagem || '').trim();

  if (!name && !email && !whatsapp) {
    return res.status(400).json({ error: 'Formulário vazio' });
  }

  let contact = (email && findContactByChannel(data, 'email', email)) || (whatsapp && findContactByChannel(data, 'whatsapp', whatsapp));

  if (!contact) {
    let orgId = null;
    if (company) {
      let org = data.organizations.find((o) => o.name.toLowerCase() === company.toLowerCase());
      if (!org) {
        org = { id: newId('org'), name: company, address: '', ownerId: null, extraInfo: [] };
        data.organizations.push(org);
      }
      orgId = org.id;
    }
    contact = {
      id: newId('c'),
      name: name || company || 'Lead do site',
      email,
      phone: whatsapp,
      orgId,
      notes: '',
      categories: [],
      tags: [],
      ownerId: null,
      extraInfo: [],
      source: { channel: 'organico', campaign: 'site-institucional' },
      channels: { whatsapp, facebookPsid: '', instagramId: '' }
    };
    data.contacts.push(contact);
    logHistory(data, 'lead', contact.id, null, 'created', 'Lead criado pelo formulário do site');
  }

  const textParts = [];
  if (plan) textParts.push(`Plano de interesse: ${plan}`);
  if (message) textParts.push(message);
  pushMessage(data, {
    leadId: contact.id,
    channel: 'site',
    direction: 'in',
    text: textParts.join('\n') || 'Novo contato recebido pelo formulário do site.'
  });

  db.write(data);
  res.status(201).json({ ok: true, leadId: contact.id });
});

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

// ---------- Chat interno da equipe (somente entre admins/atendentes, não visível ao lead) ----------
// Mensagens "gerais" (sem recipientId) vão para todo mundo; mensagens privadas só
// aparecem para o remetente e o destinatário escolhido.
app.get('/api/team-chat', requireAuth, (req, res) => {
  const data = db.read();
  const me = req.query.attendantId || '';
  const msgs = (data.teamChat || []).filter((m) => !m.recipientId || m.senderId === me || m.recipientId === me);
  res.json(msgs);
});

app.post('/api/team-chat', requireAuth, (req, res) => {
  const data = db.read();
  if (!data.teamChat) data.teamChat = [];
  const { text, attendantId, attachment, recipientId } = req.body;
  const trimmedText = (text || '').trim();
  if (!trimmedText && !(attachment && attachment.dataBase64)) {
    return res.status(400).json({ error: 'Mensagem vazia' });
  }
  const sender = data.users.find((u) => u.id === attendantId);
  const message = {
    id: newId('tc'),
    senderId: attendantId || null,
    senderName: sender ? sender.name : 'Atendente',
    recipientId: recipientId || null,
    text: trimmedText,
    attachment:
      attachment && attachment.dataBase64
        ? {
            kind: attachment.kind || 'file',
            filename: attachment.filename || 'arquivo',
            mime: attachment.mime || '',
            dataBase64: attachment.dataBase64
          }
        : null,
    readBy: [],
    timestamp: new Date().toISOString()
  };
  data.teamChat.push(message);
  data.teamChat = data.teamChat.slice(-500);
  db.write(data);
  res.status(201).json(message);
});

// Registra o "flash de visualização" (quem já abriu/viu a mensagem).
app.post('/api/team-chat/:id/read', requireAuth, (req, res) => {
  const data = db.read();
  const msg = (data.teamChat || []).find((m) => m.id === req.params.id);
  if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada' });
  const { attendantId } = req.body;
  if (!msg.readBy) msg.readBy = [];
  if (attendantId && attendantId !== msg.senderId && !msg.readBy.includes(attendantId)) {
    msg.readBy.push(attendantId);
    db.write(data);
  }
  res.json(msg);
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
          const signatureImageHtml =
            attendant && attendant.signatureImage
              ? `<br><br><img src="${attendant.signatureImage}" alt="Assinatura" style="max-width:320px;" />`
              : '';
          const htmlBody = message.text.replace(/\n/g, '<br>') + signatureImageHtml + trackingPixel;
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
//
// "Automático" (padrão) não precisa de nenhuma configuração: ele reaproveita as
// mesmas variáveis de ambiente gratuitas já usadas pelo Gerador de Roteiros
// (GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, CEREBRAS_API_KEY,
// MISTRAL_API_KEY), já que os dois rodam no mesmo serviço do Render, tentando cada
// uma em ordem até uma responder. Sem nenhuma dessas variáveis configuradas no
// servidor, ele explica isso no erro em vez de tentar falar com um Ollama local
// que não existe em produção (essa era a causa do assistente "não funcionar" ao
// vivo: o padrão antigo era sempre Ollama em localhost).
function withAiTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} demorou demais para responder.`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function callOpenAiCompat(baseUrl, apiKey, model, systemPrompt, messages) {
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, ...messages] })
  });
  const raw = await response.text();
  let result = {};
  try {
    result = JSON.parse(raw);
  } catch (e) {
    // corpo não é JSON (ex: página de erro HTML) — mantém result vazio e usa o raw abaixo
  }
  if (!response.ok) {
    const detail = (result.error && (result.error.message || result.error)) || raw.slice(0, 200) || 'sem detalhes';
    throw new Error(`HTTP ${response.status} (modelo "${model}"): ${detail}`);
  }
  return (result.choices && result.choices[0] && result.choices[0].message.content) || '';
}

async function callGeminiRaw(apiKey, model, systemPrompt, messages) {
  const transcript = [systemPrompt, ...messages.map((m) => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.content}`)].join('\n\n');
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: transcript }] }] })
  });
  const raw = await response.text();
  let result = {};
  try {
    result = JSON.parse(raw);
  } catch (e) {
    // corpo não é JSON — mantém result vazio e usa o raw abaixo
  }
  if (!response.ok) {
    const detail = (result.error && (result.error.message || result.error)) || raw.slice(0, 200) || 'sem detalhes';
    throw new Error(`HTTP ${response.status} (modelo "${model}"): ${detail}`);
  }
  return (result.candidates && result.candidates[0] && result.candidates[0].content.parts[0].text) || '';
}

// Provedores gratuitos configurados via variáveis de ambiente, cada um com uma
// função call(systemPrompt, messages) genérica — usada tanto para o rascunho
// inicial (com histórico da conversa) quanto para os passos de revisão
// (uma única mensagem com o rascunho a melhorar).
function buildFreeAiProviders() {
  const providers = [];
  if (process.env.GEMINI_API_KEY) {
    providers.push({
      name: 'Gemini',
      call: (sys, msgs) => callGeminiRaw(process.env.GEMINI_API_KEY, process.env.GEMINI_MODEL || 'gemini-1.5-flash', sys, msgs)
    });
  }
  if (process.env.GROQ_API_KEY) {
    providers.push({
      name: 'Groq',
      call: (sys, msgs) => callOpenAiCompat('https://api.groq.com/openai/v1/chat/completions', process.env.GROQ_API_KEY, process.env.GROQ_MODEL || 'llama-3.1-8b-instant', sys, msgs)
    });
  }
  if (process.env.OPENROUTER_API_KEY) {
    providers.push({
      name: 'OpenRouter',
      call: (sys, msgs) => callOpenAiCompat('https://openrouter.ai/api/v1/chat/completions', process.env.OPENROUTER_API_KEY, process.env.OPENROUTER_MODEL || 'openrouter/free', sys, msgs)
    });
  }
  if (process.env.CEREBRAS_API_KEY) {
    providers.push({
      name: 'Cerebras',
      call: (sys, msgs) => callOpenAiCompat('https://api.cerebras.ai/v1/chat/completions', process.env.CEREBRAS_API_KEY, process.env.CEREBRAS_MODEL || 'llama3.1-8b', sys, msgs)
    });
  }
  if (process.env.MISTRAL_API_KEY) {
    providers.push({
      name: 'Mistral',
      call: (sys, msgs) => callOpenAiCompat('https://api.mistral.ai/v1/chat/completions', process.env.MISTRAL_API_KEY, process.env.MISTRAL_MODEL || 'mistral-small-latest', sys, msgs)
    });
  }
  return providers;
}

// Loop de refinamento com até 3 IAs gratuitas: a primeira que responder faz o
// rascunho, e as próximas (até 2) revisam e melhoram o texto em sequência —
// entrega uma resposta mais elaborada do que uma única IA sozinha. Se algum
// provedor falhar no rascunho, tenta o próximo (mantém a resiliência de antes);
// se falhar numa revisão, simplesmente mantém a versão anterior em vez de
// derrubar a resposta já obtida.
async function callAutoFreeAi(systemPrompt, userMessage, history) {
  const messages = (history || []).map((h) => ({ role: h.role, content: h.content }));
  messages.push({ role: 'user', content: userMessage });

  const providers = buildFreeAiProviders();
  if (!providers.length) {
    throw new Error(
      'Nenhuma IA gratuita configurada no servidor. Peça para definir GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, CEREBRAS_API_KEY ou MISTRAL_API_KEY nas variáveis de ambiente do Render (as mesmas do Gerador de Roteiros), ou escolha um provedor manualmente em Configurações > Assistente IA.'
    );
  }

  const failures = [];
  let draft = null;
  let draftIndex = -1;
  for (let i = 0; i < providers.length; i++) {
    try {
      draft = await withAiTimeout(providers[i].call(systemPrompt, messages), 20000, providers[i].name);
      draftIndex = i;
      break;
    } catch (e) {
      console.log(`[Assistente IA do CRM] ${providers[i].name} (rascunho) falhou: ${e.message}`);
      failures.push(`${providers[i].name}: ${e.message}`);
    }
  }
  if (draft === null) {
    throw new Error(`Todas as IAs gratuitas configuradas falharam — ${failures.join(' | ')}`);
  }

  let current = draft;
  const reviewers = providers.filter((_, i) => i !== draftIndex).slice(0, 2);
  for (const provider of reviewers) {
    const refineSystem = `Você é um revisor especialista. Melhore a resposta abaixo para a pergunta do usuário, corrigindo eventuais erros e deixando-a mais completa e útil, SEM inventar informação nova que não esteja no contexto original. Mantenha o mesmo idioma. Se a resposta tiver uma linha no formato exato [ACAO:...], preserve essa linha sem nenhuma alteração. Responda apenas com a versão final melhorada, sem comentar o que foi mudado.

CONTEXTO ORIGINAL:
${systemPrompt}

PERGUNTA DO USUÁRIO:
${userMessage}

RESPOSTA A MELHORAR:
${current}`;
    try {
      const improved = await withAiTimeout(
        provider.call(refineSystem, [{ role: 'user', content: 'Melhore a resposta conforme as instruções acima.' }]),
        20000,
        provider.name
      );
      if (improved && improved.trim()) current = improved;
    } catch (e) {
      console.log(`[Assistente IA do CRM] ${provider.name} (revisão) falhou, mantendo a versão anterior: ${e.message}`);
    }
  }

  return current;
}

async function callAiProvider(ai, systemPrompt, userMessage, history) {
  const provider = ai.provider || 'auto';
  const messages = (history || []).map((h) => ({ role: h.role, content: h.content }));
  messages.push({ role: 'user', content: userMessage });

  if (provider === 'auto') {
    return callAutoFreeAi(systemPrompt, userMessage, history);
  }

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
Contato: ${contact ? contact.name : 'não vinculado'}${contact && contact.phone ? ` (telefone: ${contact.phone})` : ''}.
Atividades recentes: ${activities.slice(-5).map((a) => `[${a.type}] ${a.text}`).join(' | ') || 'nenhuma'}.
Etapas disponíveis no funil (id=nome): ${stageNames}.`;
  }

  const now = new Date();
  const systemPrompt = `Você é o assistente de vendas do CRM Velocita Global. Ajude o vendedor com dicas objetivas e práticas sobre o negócio abaixo. Responda em português, em até 4 frases. Não invente dados que não foram informados.
Data e hora atuais: ${now.toISOString()} (use isso para calcular datas relativas como "amanhã" ou "sexta-feira").
${context}
Se fizer sentido sugerir UMA ação concreta, adicione ao final da resposta, em uma linha própria, exatamente um destes formatos:
[ACAO:MOVER_ETAPA:<id_da_etapa>]
[ACAO:MARCAR_GANHO]
[ACAO:MARCAR_PERDIDO]
[ACAO:ADICIONAR_TAREFA:<texto da tarefa>]
[ACAO:AGENDAR_REUNIAO:<data e hora em ISO 8601>|<título curto da reunião>]
[ACAO:LIGAR]
Use AGENDAR_REUNIAO quando o vendedor pedir para marcar/agendar uma reunião ou call — isso cria a atividade E manda para o Google Calendar. Use LIGAR quando ele pedir para ligar para o contato — isso origina a chamada pela Vivo PABX. Só inclua a linha de ação se realmente fizer sentido pelo que foi pedido. Caso contrário, não inclua nenhuma tag.`;

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

// ---------- Dicas de IA sob demanda: analisa os negócios em aberto e suas
// anotações (notas do lead, informações adicionais, atividades) e sugere como
// abordar cada um para avançar a venda. Diferente de /api/ai/tips (regras
// locais, grátis, sempre instantâneo), esta rota chama a IA de verdade —
// por isso só roda quando o vendedor pede, não a cada abertura do painel.
app.post('/api/ai/smart-tips', requireAuth, async (req, res) => {
  const data = db.read();
  const ai = data.settings.integrations.ai || {};

  const openDeals = data.deals.filter((d) => d.status === 'open');
  if (openDeals.length === 0) {
    return res.json({ reply: 'Nenhum negócio em aberto no momento para analisar.' });
  }

  const stageName = (id) => (data.stages.find((s) => s.id === id) || {}).name || '-';

  const dealsContext = openDeals
    .slice(0, 15)
    .map((deal) => {
      const contact = data.contacts.find((c) => c.id === deal.personId);
      const activities = data.activities
        .filter((a) => a.dealId === deal.id)
        .slice(-4)
        .map((a) => `${a.type}: ${a.text}`)
        .join(' | ');
      const extra = (deal.extraInfo || []).map((i) => `${i.label}: ${i.value}`).join(' | ');
      return `- "${deal.title}" (valor ${deal.currency} ${deal.value}, etapa: ${stageName(deal.stage)})
  Contato: ${contact ? contact.name : 'sem contato'}. Notas do lead: ${(contact && contact.notes) || 'nenhuma'}.
  Informações adicionais do negócio: ${extra || 'nenhuma'}.
  Últimas atividades: ${activities || 'nenhuma'}.`;
    })
    .join('\n');

  const systemPrompt = `Você é um vendedor sênior analisando a carteira de negócios em aberto do CRM Velocita Global. Para CADA negócio listado abaixo, escreva uma dica curta (1-2 frases) e concreta de como abordar o contato para avançar/fechar a venda, baseada especificamente nas notas e atividades registradas — não invente informação que não está nos dados. Se um negócio não tiver nenhuma nota ou atividade útil, diga isso e sugira o próximo passo básico (ex: fazer o primeiro contato). Formate como uma lista, um item por negócio, começando pelo nome do negócio em negrito. Responda em português, direto ao ponto, sem introdução nem conclusão genérica.`;

  try {
    const reply = await callAiProvider(ai, systemPrompt, dealsContext, []);
    res.json({ reply });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
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

// ---------- Google Calendar: um app OAuth compartilhado (Client ID/Secret,
// cadastrado em Configurações > Integrações), cada usuário conecta sua PRÓPRIA
// conta Google individualmente (Configurações > Usuários), guardando um refresh
// token por usuário. Assim cada sócio recebe os eventos no calendário dele.
function googleRedirectUri(req) {
  return `${req.protocol}://${req.get('host')}/api/google/oauth-callback`;
}

app.get('/api/google/oauth-start', requireAuth, (req, res) => {
  const data = db.read();
  const gcal = data.settings.integrations.googleCalendar || {};
  const user = data.users.find((u) => u.id === req.query.userId);
  if (!gcal.clientId || !gcal.clientSecret) {
    return res.status(400).send('Configure o Client ID e o Client Secret do Google em Configurações > Integrações antes de conectar um usuário.');
  }
  if (!user) return res.status(404).send('Usuário não encontrado.');

  const params = new URLSearchParams({
    client_id: gcal.clientId,
    redirect_uri: googleRedirectUri(req),
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email',
    state: user.id
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

// Conexão separada (não por usuário) para ler a caixa de entrada real de um
// e-mail compartilhado (ex: velocitaglobal@gmail.com) na aba E-mail > Caixa de
// Entrada (Gmail). Usa o mesmo Client ID/Secret do Google Calendar, mas com o
// escopo gmail.readonly, e reaproveita a mesma redirect_uri (identificado pelo
// state="gmail-inbox" em vez de um id de usuário).
app.get('/api/google/gmail-oauth-start', requireAuth, (req, res) => {
  const data = db.read();
  const gcal = data.settings.integrations.googleCalendar || {};
  if (!gcal.clientId || !gcal.clientSecret) {
    return res.status(400).send('Configure o Client ID e o Client Secret do Google em Configurações > Integrações antes de conectar a caixa de entrada.');
  }
  const params = new URLSearchParams({
    client_id: gcal.clientId,
    redirect_uri: googleRedirectUri(req),
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email',
    state: 'gmail-inbox'
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

app.get('/api/google/oauth-callback', async (req, res) => {
  const closePopup = (payload) => {
    res.send(`<script>window.opener && window.opener.postMessage(${JSON.stringify(payload)}, '*'); window.close();</script><p>Pode fechar esta janela.</p>`);
  };

  if (req.query.error) return closePopup({ googleCalendarError: String(req.query.error) });

  const data = db.read();
  const gcal = data.settings.integrations.googleCalendar || {};
  const isGmailInbox = req.query.state === 'gmail-inbox';
  const user = isGmailInbox ? null : data.users.find((u) => u.id === req.query.state);
  if ((!isGmailInbox && !user) || !gcal.clientId || !gcal.clientSecret) {
    return closePopup({ googleCalendarError: 'Configuração inválida ou usuário não encontrado.' });
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: req.query.code,
        client_id: gcal.clientId,
        client_secret: gcal.clientSecret,
        redirect_uri: googleRedirectUri(req),
        grant_type: 'authorization_code'
      })
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokenJson.error_description || tokenJson.error || 'Falha ao obter token do Google');
    if (!tokenJson.refresh_token) {
      throw new Error('O Google não retornou um refresh token. Remova o acesso do app em myaccount.google.com/permissions e tente conectar de novo.');
    }

    const infoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` }
    });
    const infoJson = await infoRes.json();

    if (isGmailInbox) {
      if (!data.settings.integrations.gmailInbox) data.settings.integrations.gmailInbox = {};
      data.settings.integrations.gmailInbox.refreshToken = tokenJson.refresh_token;
      data.settings.integrations.gmailInbox.email = infoJson.email || '';
      db.write(data);
      closePopup({ gmailInboxConnected: true, email: data.settings.integrations.gmailInbox.email });
    } else {
      user.googleRefreshToken = tokenJson.refresh_token;
      user.googleEmail = infoJson.email || '';
      db.write(data);
      closePopup({ googleCalendarConnected: true, userId: user.id, email: user.googleEmail });
    }
  } catch (err) {
    closePopup({ googleCalendarError: err.message });
  }
});

app.post('/api/settings/gmail-inbox-disconnect', requireAuth, (req, res) => {
  const data = db.read();
  data.settings.integrations.gmailInbox = {};
  db.write(data);
  res.json({ ok: true });
});

async function getGoogleAccessTokenGeneric(gcal, refreshToken, label) {
  if (!gcal.clientId || !gcal.clientSecret) {
    throw new Error('Configure o Client ID e o Client Secret do Google em Configurações > Integrações.');
  }
  if (!refreshToken) {
    throw new Error(`${label || 'Esta conta'} ainda não foi conectada.`);
  }
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: gcal.clientId,
      client_secret: gcal.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`Falha ao renovar token do Google: ` + (result.error_description || result.error));
  return result.access_token;
}

function decodeGmailBase64Url(str) {
  return Buffer.from((str || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function extractGmailBody(payload) {
  if (!payload) return '';
  if (payload.body && payload.body.data && (payload.mimeType === 'text/html' || payload.mimeType === 'text/plain')) {
    return decodeGmailBase64Url(payload.body.data);
  }
  if (Array.isArray(payload.parts)) {
    const htmlPart = payload.parts.find((p) => p.mimeType === 'text/html');
    if (htmlPart) return extractGmailBody(htmlPart);
    const textPart = payload.parts.find((p) => p.mimeType === 'text/plain');
    if (textPart) return extractGmailBody(textPart);
    for (const part of payload.parts) {
      const nested = extractGmailBody(part);
      if (nested) return nested;
    }
  }
  return '';
}

app.get('/api/email-inbox/gmail/messages', requireAuth, async (req, res) => {
  const data = db.read();
  const gcal = data.settings.integrations.googleCalendar || {};
  const gmailInbox = data.settings.integrations.gmailInbox || {};
  try {
    const accessToken = await getGoogleAccessTokenGeneric(gcal, gmailInbox.refreshToken, 'A caixa de entrada do Gmail');
    const listRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&labelIds=INBOX', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const listJson = await listRes.json();
    if (!listRes.ok) throw new Error(listJson.error?.message || 'Erro ao listar mensagens do Gmail');

    const messages = await Promise.all(
      (listJson.messages || []).map(async (m) => {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const msgJson = await msgRes.json();
        const headers = (msgJson.payload && msgJson.payload.headers) || [];
        const getHeader = (name) => (headers.find((h) => h.name === name) || {}).value || '';
        return {
          id: m.id,
          from: getHeader('From'),
          subject: getHeader('Subject') || '(sem assunto)',
          date: getHeader('Date'),
          snippet: msgJson.snippet || '',
          unread: (msgJson.labelIds || []).includes('UNREAD')
        };
      })
    );
    res.json({ email: gmailInbox.email || '', messages });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/email-inbox/gmail/messages/:id', requireAuth, async (req, res) => {
  const data = db.read();
  const gcal = data.settings.integrations.googleCalendar || {};
  const gmailInbox = data.settings.integrations.gmailInbox || {};
  try {
    const accessToken = await getGoogleAccessTokenGeneric(gcal, gmailInbox.refreshToken, 'A caixa de entrada do Gmail');
    const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${req.params.id}?format=full`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const msgJson = await msgRes.json();
    if (!msgRes.ok) throw new Error(msgJson.error?.message || 'Erro ao carregar a mensagem');
    const headers = (msgJson.payload && msgJson.payload.headers) || [];
    const getHeader = (name) => (headers.find((h) => h.name === name) || {}).value || '';
    res.json({
      id: req.params.id,
      from: getHeader('From'),
      to: getHeader('To'),
      subject: getHeader('Subject') || '(sem assunto)',
      date: getHeader('Date'),
      body: extractGmailBody(msgJson.payload)
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/users/:id/google-disconnect', requireAuth, (req, res) => {
  const data = db.read();
  const user = data.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  delete user.googleRefreshToken;
  delete user.googleEmail;
  db.write(data);
  res.json({ ok: true });
});

async function getGoogleAccessTokenForUser(gcal, user) {
  if (!gcal.clientId || !gcal.clientSecret) {
    throw new Error('Configure o Client ID e o Client Secret do Google em Configurações > Integrações.');
  }
  if (!user || !user.googleRefreshToken) {
    throw new Error(`${user ? user.name : 'O atendente responsável'} ainda não conectou o Google Calendar (Configurações > Usuários).`);
  }
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: gcal.clientId,
      client_secret: gcal.clientSecret,
      refresh_token: user.googleRefreshToken,
      grant_type: 'refresh_token'
    })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`Falha ao renovar token do Google de ${user.name}: ` + (result.error_description || result.error));
  return result.access_token;
}

app.post('/api/activities/:id/sync-calendar', requireAuth, async (req, res) => {
  const data = db.read();
  const activity = data.activities.find((a) => a.id === req.params.id);
  if (!activity) return res.status(404).json({ error: 'Atividade não encontrada' });

  const gcal = data.settings.integrations.googleCalendar || {};
  const user = data.users.find((u) => u.id === activity.attendantId);

  try {
    const accessToken = await getGoogleAccessTokenForUser(gcal, user);
    const start = new Date(activity.date);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const calendarId = gcal.calendarId || 'primary';

    // Convida os demais sócios (pelo e-mail cadastrado em Configurações > Usuários)
    // como participantes, com lembretes de push/e-mail — é assim que o celular de
    // cada um recebe a notificação da reunião, mesmo sem terem conectado a própria
    // conta Google ainda (o convite chega por e-mail e pelo Google Agenda de qualquer forma).
    const attendees = data.users
      .filter((u) => u.email && u.id !== user.id)
      .map((u) => ({ email: u.email }));

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          summary: activity.text,
          description: 'Criado automaticamente pelo Velocita Global CRM',
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
          attendees,
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'popup', minutes: 30 },
              { method: 'email', minutes: 60 }
            ]
          }
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

// ---------- Calendário: agenda unificada de reuniões/tarefas com data ----------
app.get('/api/calendar/events', requireAuth, (req, res) => {
  const data = db.read();
  const events = data.activities
    .filter((a) => a.date && (a.type === 'meeting' || a.type === 'task'))
    .map((a) => {
      const deal = a.dealId ? data.deals.find((d) => d.id === a.dealId) : null;
      const lead = a.leadId ? data.contacts.find((c) => c.id === a.leadId) : null;
      const user = data.users.find((u) => u.id === a.attendantId);
      return {
        id: a.id,
        dealId: a.dealId || null,
        leadId: a.leadId || null,
        dealTitle: deal ? deal.title : null,
        leadName: lead ? lead.name : null,
        type: a.type,
        text: a.text,
        date: a.date,
        done: !!a.done,
        attendantId: a.attendantId || null,
        attendantName: user ? user.name : null,
        googleEventLink: a.googleEventLink || null
      };
    })
    .sort((x, y) => new Date(x.date) - new Date(y.date));
  res.json(events);
});

// ---------- Roteiro do Dia (gerador de roteiros virais para afiliados) ----------
// Aplicação independente (login, banco e IA próprios), montada dentro do mesmo
// site em /roteiro-do-dia. Não compartilha sessão nem dados com o CRM.
const roteiroDoDia = require('./roteiro-do-dia/server');
app.use('/roteiro-do-dia', roteiroDoDia.app);

(async () => {
  try {
    await db.init();
  } catch (e) {
    console.error('Falha ao iniciar o banco de dados do CRM (voltando ao db.json local):', e);
  }

  try {
    await roteiroDoDia.init();
  } catch (e) {
    console.error('Falha ao iniciar o Roteiro do Dia:', e);
  }

  app.listen(PORT, () => {
    console.log(`Velocita Global CRM rodando em http://localhost:${PORT}`);
  });
})();
