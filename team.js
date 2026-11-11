/* ============================================================================
   Equipe: login por usuário e senha, quem está online, por quanto tempo e o
   que cada pessoa fez no CRM.

   - Perfis: "socio" (cada sócio) e "matriz" (administrador). A matriz pode
     mexer em tudo e NÃO aparece em nada: nem tempo online, nem histórico, nem
     contagem de ações, nem no nome de quem alterou.
   - Senhas guardadas com scrypt (nunca em texto).
   - Transição: enquanto um sócio não tiver senha própria, ele entra com o
     próprio usuário + a senha antiga compartilhada (APP_PASSWORD). Quando a
     matriz define a senha dele, a antiga deixa de valer para ele.
   - Presença e contagens ficam em memória e vão para o banco a cada minuto.
   ========================================================================= */
'use strict';
const crypto = require('crypto');

const KEEP_DAYS = 120;
const ONLINE_MS = 100 * 1000;

// ---------- senhas ----------
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(String(pw), salt, 64).toString('hex')}`;
}
function verifyPassword(pw, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const [t, salt, h] = stored.split('$');
  if (t !== 'scrypt' || !salt || !h) return false;
  const a = crypto.scryptSync(String(pw), salt, 64); const b = Buffer.from(h, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const cleanUsername = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 32);

// Contas iniciais (senhas aleatórias entregues ao dono; aqui só o hash). Aplicadas UMA vez, em quem ainda não tem senha própria.
const SEED = {
  matriz: { role: 'matriz', hash: 'scrypt$10b989fe195bad69cd60ee6d070e569c$3b5dadf32bedf21bfaa68ea7055ee2d283fd7664762f873bd9f6abc9632f4b641b252dc089f70e14d54399adb6acceb6f2c9b7c74e7b654e23714591a4c8cb53' },
  luis: { role: 'admin', hash: 'scrypt$f048f17011cae05a0ba118726b8f0370$3a5d0235c8deede69fb871e51ab6b30d7d5f513d49716ac656550045fff9e2412121189af3c1466dfafdbded0447334ce6d094c7cba3d97d0f593f65a9bbc2fd' },
  diego: { role: 'admin', hash: 'scrypt$6173cf79923ad5ecb00559451e097c8a$49bd4aa5976ede5f471a0480e498c1694bfe3263f699c972ea76645220ec72ba4752f34052c6547ca70e8420ea52a27d448c20b3c954a8f8a6da0ce54244fc75' },
  pedro: { role: 'socio', hash: 'scrypt$ff055d875f1d118c901822eba0238776$1499b27d552d5634809332f7415beb92fe1ace65b21f633b03a7449a4bc54cd641108cee9764320b92d5b64ae16db88d7a649722b17f9e9234d79dbf00388bc0' },
};

// Garante usuário/perfil em todos os cadastros e cria a conta "matriz" (uma vez).
function ensureTeam(data) {
  let changed = false; const taken = new Set(data.users.map((u) => u.username).filter(Boolean));
  for (const u of data.users) {
    if (!u.role) { u.role = 'socio'; changed = true; }
    if (u.active === undefined) { u.active = true; changed = true; }
    if (!u.username) {
      let base = cleanUsername((u.name || 'usuario').split(' ')[0]) || 'usuario'; let n = base; let i = 2;
      while (taken.has(n)) n = base + i++;
      u.username = n; taken.add(n); changed = true;
    }
  }
  if (!data.users.some((u) => u.role === 'matriz')) {
    data.users.push({ id: 'u-matriz', name: 'Administrador (matriz)', ramal: '', email: '', role: 'matriz', username: taken.has('matriz') ? 'admin-matriz' : 'matriz', active: true });
    changed = true;
  }
  if (!(data.settings || {}).seedAccounts) {
    data.settings = data.settings || {};
    for (const u of data.users) {
      const sd = SEED[u.username];
      if (sd && !u.passHash) { u.passHash = sd.hash; u.role = sd.role; changed = true; }
    }
    data.settings.seedAccounts = true; changed = true;
  }
  return changed;
}

const publicUser = (u) => ({ id: u.id, name: u.name, role: u.role, username: u.username });
// o que vai para o navegador: nunca o hash da senha; e a matriz some das listas de atendentes
function sanitizeUsers(list) {
  return list.filter((u) => u.role !== 'matriz').map((u) => { const { passHash, ...rest } = u; return rest; });
}

// ---------- presença e atividade ----------
const P = { days: {} };
const lastPing = new Map(); const lastView = new Map(); let dirty = false;
const dayKey = (d = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
function slot(uid, key = dayKey()) {
  const day = P.days[key] || (P.days[key] = {});
  return day[uid] || (day[uid] = { sec: 0, first: null, last: null, logins: 0, act: {} });
}
const tracked = (u) => u && u.role !== 'matriz';
// matriz e administradores têm poder total; os demais (perfil limitado) não mexem em configurações
const isAdminLike = (u) => !!u && (u.role === 'matriz' || u.role === 'admin');

function load(data) { P.days = (data.presence && data.presence.days) || {}; }
function onLogin(u) { if (!tracked(u)) return; const s = slot(u.id); const now = new Date().toISOString(); s.logins++; s.first = s.first || now; s.last = now; lastPing.set(u.id, Date.now()); dirty = true; }
function onLogout(u) { if (!tracked(u)) return; lastPing.delete(u.id); dirty = true; }
function ping(u, view) {
  if (!tracked(u)) return;
  const now = Date.now(); const prev = lastPing.get(u.id); const s = slot(u.id); const iso = new Date(now).toISOString();
  if (prev && now - prev <= 120000) s.sec += (now - prev) / 1000;
  s.first = s.first || iso; s.last = iso; lastPing.set(u.id, now); lastView.set(u.id, String(view || '').slice(0, 30)); dirty = true;
}

function classify(method, path, body) {
  const p = path.split('?')[0]; const m = method;
  if (m === 'POST' && /^\/api\/leadgen\/items\/[^/]+\/outcome$/.test(p)) return 'prospeccao';
  if (m === 'POST' && p === '/api/leadgen/search') return 'geracao';
  if (m === 'POST' && /^\/api\/leads\/[^/]+\/call$/.test(p)) return 'ligacao';
  if (m === 'POST' && (p === '/api/activities' || /^\/api\/(deals|leads)\/[^/]+\/activities$/.test(p))) return body && body.type === 'call' ? 'ligacao' : 'atividade';
  if (m === 'PUT' && /^\/api\/activities\/[^/]+$/.test(p)) return 'atividade';
  if ((m === 'POST' && p === '/api/deals') || (m === 'PUT' && /^\/api\/deals\/[^/]+$/.test(p))) return 'negocio';
  if ((m === 'POST' && ['/api/contacts', '/api/contacts/import', '/api/organizations'].includes(p)) || (m === 'PUT' && /^\/api\/(contacts|organizations)\/[^/]+$/.test(p))) return 'cadastro';
  if (m === 'POST' && (/^\/api\/leads\/[^/]+\/messages$/.test(p) || /^\/api\/mail\/[^/]+\/send$/.test(p))) return 'contato';
  return null;
}

// Antes da rota: quem agiu é SEMPRE o usuário logado (o navegador não escolhe), e a matriz fica anônima.
function attribute(req) {
  const u = req.user; if (!u || !req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return;
  if (req.method === 'GET') return;
  const id = u.role === 'matriz' ? null : u.id;
  req.body.attendantId = id;
  if ('createdBy' in req.body) req.body.createdBy = id;
  if ('outcomeBy' in req.body) req.body.outcomeBy = id;
}
// Depois da resposta: se deu certo, conta a ação para o usuário.
function track(req, res) {
  const u = req.user; if (!tracked(u) || req.method === 'GET') return;
  const kind = classify(req.method, req.originalUrl || '', req.body);
  if (!kind) return;
  res.on('finish', () => { if (res.statusCode < 400) { const s = slot(u.id); s.act[kind] = (s.act[kind] || 0) + 1; s.last = new Date().toISOString(); dirty = true; } });
}

function flush(db) {
  if (!dirty) return; dirty = false;
  const cut = dayKey(new Date(Date.now() - KEEP_DAYS * 86400000));
  Object.keys(P.days).forEach((k) => { if (k < cut) delete P.days[k]; });
  const d = db.view(); d.presence = { days: P.days }; db.write(d);
}

function rangeDays(range) {
  const out = []; const now = Date.now();
  let n = { hoje: 1, '7d': 7, '30d': 30 }[range] || 1;
  if (range === 'mes') n = Number(dayKey().slice(8, 10));
  for (let i = n - 1; i >= 0; i--) out.push(dayKey(new Date(now - i * 86400000)));
  return out;
}

function report(data, range) {
  const days = rangeDays(range);
  return data.users.filter((u) => u.role !== 'matriz' && u.active !== false).map((u) => {
    const tot = { sec: 0, logins: 0, act: {}, activeDays: 0 }; let first = null; let last = null; const byDay = [];
    for (const k of days) {
      const s = (P.days[k] || {})[u.id];
      const acted = !!s && (s.logins > 0 || s.sec > 0 || Object.keys(s.act).length > 0);
      byDay.push({ date: k, sec: s ? Math.round(s.sec) : 0, acted, actions: s ? Object.values(s.act).reduce((a, b) => a + b, 0) : 0 });
      if (!s) continue;
      tot.sec += s.sec; tot.logins += s.logins; if (acted) tot.activeDays++;
      Object.entries(s.act).forEach(([a, n]) => { tot.act[a] = (tot.act[a] || 0) + n; });
      if (s.first && (!first || s.first < first)) first = s.first; if (s.last && (!last || s.last > last)) last = s.last;
    }
    const lp = lastPing.get(u.id);
    return {
      id: u.id, name: u.name, username: u.username, online: !!lp && Date.now() - lp < ONLINE_MS, view: lastView.get(u.id) || '', lastSeen: lp ? new Date(lp).toISOString() : last,
      sec: Math.round(tot.sec), logins: tot.logins, activeDays: tot.activeDays, daysInRange: days.length, first, last, act: tot.act, byDay
    };
  });
}

// ---------- rotas ----------
function register(app, { db, requireAuth, newId }) {
  const matrizOnly = (req, res, next) => (isAdminLike(req.user) ? next() : res.status(403).json({ error: 'Somente administradores.' }));

  app.post('/api/presence/ping', requireAuth, (req, res) => { ping(req.user, req.body && req.body.view); res.json({ ok: true }); });

  app.get('/api/team/report', requireAuth, matrizOnly, (req, res) => res.json({ range: req.query.range || 'hoje', users: report(db.view(), String(req.query.range || 'hoje')) }));

  app.get('/api/team/users', requireAuth, matrizOnly, (req, res) => {
    res.json(db.view().users.map((u) => ({ id: u.id, name: u.name, username: u.username, role: u.role, active: u.active !== false, hasPassword: !!u.passHash, email: u.email || '' })));
  });

  app.post('/api/team/users', requireAuth, matrizOnly, (req, res) => {
    const data = db.read(); const name = String(req.body.name || '').trim().slice(0, 80); const username = cleanUsername(req.body.username);
    const pw = String(req.body.password || '');
    if (!name || username.length < 3) return res.status(400).json({ error: 'Informe o nome e um usuário com pelo menos 3 letras ou números.' });
    if (pw.length < 8) return res.status(400).json({ error: 'A senha precisa ter pelo menos 8 caracteres.' });
    if (data.users.some((u) => u.username === username)) return res.status(409).json({ error: 'Esse usuário já existe.' });
    const user = { id: newId('u'), name, ramal: '', email: String(req.body.email || '').trim(), role: ['admin', 'socio'].includes(req.body.role) ? req.body.role : 'socio', username, active: true, passHash: hashPassword(pw) };
    data.users.push(user); db.write(data);
    res.status(201).json({ id: user.id });
  });

  app.put('/api/team/users/:id', requireAuth, matrizOnly, (req, res) => {
    const data = db.read(); const u = data.users.find((x) => x.id === req.params.id);
    if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });
    const b = req.body || {};
    if (typeof b.name === 'string' && b.name.trim()) u.name = b.name.trim().slice(0, 80);
    if (typeof b.username === 'string') {
      const n = cleanUsername(b.username);
      if (n.length < 3) return res.status(400).json({ error: 'Usuário muito curto.' });
      if (data.users.some((x) => x.username === n && x.id !== u.id)) return res.status(409).json({ error: 'Esse usuário já existe.' });
      u.username = n;
    }
    if (typeof b.password === 'string' && b.password) {
      if (b.password.length < 8) return res.status(400).json({ error: 'A senha precisa ter pelo menos 8 caracteres.' });
      u.passHash = hashPassword(b.password);
    }
    if (typeof b.active === 'boolean' && u.role !== 'matriz') u.active = b.active;
    if (['admin', 'socio'].includes(b.role) && u.role !== 'matriz') u.role = b.role;
    db.write(data); res.json({ ok: true });
  });

  // cada pessoa troca a própria senha
  app.put('/api/me/password', requireAuth, (req, res) => {
    const data = db.read(); const u = data.users.find((x) => x.id === req.user.id);
    const nw = String((req.body || {}).newPassword || '');
    if (nw.length < 8) return res.status(400).json({ error: 'A nova senha precisa ter pelo menos 8 caracteres.' });
    u.passHash = hashPassword(nw); db.write(data); res.json({ ok: true });
  });
}

module.exports = { isAdminLike, hashPassword, verifyPassword, ensureTeam, publicUser, sanitizeUsers, load, onLogin, onLogout, ping, attribute, track, flush, register, cleanUsername };
