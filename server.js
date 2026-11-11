const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');
const nodemailer = require('nodemailer');
const webpush = require('web-push');
const jwt = require('jsonwebtoken');
const zlib = require('zlib');
const fs = require('fs');
const db = require('./db');
const team = require('./team');

// Defina APP_PASSWORD nas variáveis de ambiente do Render para trocar a senha de
// acesso sem mexer no código (o repositório é público).
const APP_PASSWORD = process.env.APP_PASSWORD || 'Velocita1';
const PORT = process.env.PORT || 3000;

const app = express();
app.disable('x-powered-by');
// Necessário no Render (atrás de proxy) para que req.protocol reporte "https"
// corretamente — usado para montar a redirect_uri do OAuth do Google Calendar.
app.set('trust proxy', 1);

// Cabeçalhos básicos de segurança e "não indexar" (o CRM é privado).
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Robots-Tag': 'noindex, nofollow'
  });
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=15552000');
  next();
});

// Compressão gzip das respostas de texto (HTML, CSS, JS e JSON da API). O app.js
// sozinho tem ~260KB; comprimido cai para ~60KB, o que pesa muito no celular.
const COMPRESSIBLE = /^(text\/|application\/(json|javascript|manifest\+json)|image\/svg)/;
app.use((req, res, next) => {
  if (!/\bgzip\b/.test(req.headers['accept-encoding'] || '')) return next();
  const send = res.send.bind(res);
  res.send = (body) => {
    const type = String(res.get('Content-Type') || '');
    const size = typeof body === 'string' ? Buffer.byteLength(body) : Buffer.isBuffer(body) ? body.length : 0;
    if (size < 1024 || res.get('Content-Encoding') || !COMPRESSIBLE.test(type) || req.method === 'HEAD') return send(body);
    res.set('Content-Encoding', 'gzip');
    res.vary('Accept-Encoding');
    res.removeHeader('Content-Length');
    return send(zlib.gzipSync(typeof body === 'string' ? Buffer.from(body) : body));
  };
  next();
});

// Limite maior que o padrão (100kb) porque anexos de e-mail e do Chat da Equipe
// chegam em base64 dentro do corpo JSON — uma foto de celular sozinha já passa de
// 1-5MB antes mesmo da inflação de ~33% do base64.
app.use(express.json({ limit: '20mb' }));
app.use(
  session({
    // a sessão em memória já some a cada reinício (o cookie "lembrar" a recria),
    // então um segredo aleatório por boot é suficiente quando não há SESSION_SECRET
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 12, httpOnly: true, sameSite: 'lax' } // 12h
  })
);

// ---------- Auth ----------
// A sessão fica em memória e some quando a Render reinicia o servidor. Para o app no
// celular (PWA) não pedir a senha toda hora, o login também grava um cookie assinado
// de 60 dias; se a sessão sumir, ele a recria sozinho.
const REMEMBER_COOKIE = 'vg_remember';
function authSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const data = db.read();
  if (!data.settings.authSecret) {
    data.settings.authSecret = crypto.randomBytes(32).toString('hex');
    db.write(data);
  }
  return data.settings.authSecret;
}
function readCookie(req, name) {
  const m = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}
function currentUser(req) {
  let uid = req.session && req.session.userId;
  if (!uid) {
    const token = readCookie(req, REMEMBER_COOKIE);
    if (!token) return null;
    try { uid = jwt.verify(token, authSecret()).uid; } catch (e) { return null; }
    if (!uid) return null; // cookie antigo (senha única): pede login de novo
  }
  const u = db.view().users.find((x) => x.id === uid && x.active !== false);
  if (!u) return null;
  req.session.userId = uid; req.session.authenticated = true;
  return u;
}
function restoreFromCookie(req) {
  const u = currentUser(req);
  if (u) { req.user = u; return true; }
  return false;
}

function requireAuth(req, res, next) {
  if (restoreFromCookie(req)) return next();
  return res.status(401).json({ error: 'Não autenticado' });
}

function requirePageAuth(req, res, next) {
  if (restoreFromCookie(req)) return next();
  return res.redirect('/login.html');
}

// Freio contra tentativa de adivinhar a senha: 10 erros por IP a cada 15 minutos.
const loginFailures = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
function tooManyLoginFailures(ip) {
  const entry = loginFailures.get(ip);
  if (!entry || Date.now() - entry.first > LOGIN_WINDOW_MS) return false;
  return entry.count >= 10;
}
function registerLoginFailure(ip) {
  const entry = loginFailures.get(ip);
  if (!entry || Date.now() - entry.first > LOGIN_WINDOW_MS) loginFailures.set(ip, { first: Date.now(), count: 1 });
  else entry.count++;
  if (loginFailures.size > 5000) loginFailures.clear();
}

function passwordMatches(password) {
  const a = Buffer.from(String(password || ''));
  const b = Buffer.from(APP_PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (tooManyLoginFailures(req.ip)) {
    return res.status(429).json({ error: 'Muitas tentativas erradas. Aguarde 15 minutos e tente de novo.' });
  }
  const uname = team.cleanUsername(username);
  const user = db.view().users.find((u) => u.username === uname && u.active !== false);
  // com senha própria: só ela vale. Sem senha própria (transição): a senha antiga compartilhada.
  const ok = !!user && (user.passHash ? team.verifyPassword(password, user.passHash) : passwordMatches(password));
  if (ok) {
    loginFailures.delete(req.ip);
    req.session.userId = user.id; req.session.authenticated = true;
    const token = jwt.sign({ uid: user.id }, authSecret(), { expiresIn: '60d' });
    res.cookie(REMEMBER_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 60 * 24 * 60 * 60 * 1000 });
    team.onLogin(user);
    return res.json({ ok: true, user: team.publicUser(user), needsPassword: !user.passHash });
  }
  registerLoginFailure(req.ip);
  return res.status(401).json({ error: 'Usuário ou senha incorretos' });
});

app.post('/api/logout', (req, res) => {
  const u = currentUser(req); if (u) team.onLogout(u);
  res.clearCookie(REMEMBER_COOKIE);
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/session', (req, res) => {
  const u = currentUser(req);
  res.json({ authenticated: !!u, user: u ? { ...team.publicUser(u), hasPassword: !!u.passHash } : null });
});

// Em toda chamada da API: identifica quem é, força "quem fez" = usuário logado (matriz fica anônima) e conta a atividade.
app.use('/api', (req, res, next) => {
  if (restoreFromCookie(req)) { team.attribute(req); team.track(req, res); }
  next();
});

// Perfil limitado: pode usar o CRM (leads, pipeline, e-mail...), mas não altera configurações, etapas, etiquetas nem integrações.
const RESTRICTED_WRITE = [/^\/api\/settings(\/|$)/, /^\/api\/stages(\/|-reorder|$)/, /^\/api\/tags(\/|$)/, /^\/api\/users(\/|$)/, /^\/api\/team\//, /^\/api\/google\/.*(disconnect)/];
app.use('/api', (req, res, next) => {
  if (req.user && !team.isAdminLike(req.user) && req.method !== 'GET' && RESTRICTED_WRITE.some((re) => re.test(req.path_ || req.originalUrl.split('?')[0]))) {
    // o próprio usuário ainda pode ajustar o cadastro dele (ramal, assinatura)
    if (req.method === 'PUT' && /^\/api\/users\/[^/]+$/.test(req.originalUrl.split('?')[0]) && req.originalUrl.split('?')[0].endsWith(req.user.id)) return next();
    return res.status(403).json({ error: 'Seu perfil não tem permissão para alterar configurações. Fale com um administrador.' });
  }
  next();
});


// Para o Render saber se o serviço está de pé (Health Check Path: /healthz).
app.get('/healthz', (req, res) => res.json({ ok: true }));

app.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /\n'));

// ---------- Static assets (public, non-sensitive) ----------
// Arquivos de texto (JS/CSS/HTML) saem já comprimidos de um cache em memória.
// Quando a URL tem ?v= (versão do deploy), o navegador pode guardar por 1 ano.
const PUBLIC_DIR = path.join(__dirname, 'public');
const gzipCache = new Map();
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (!/\.(js|css|html|webmanifest|svg|json)$/.test(req.path)) return next();
  if (!/\bgzip\b/.test(req.headers['accept-encoding'] || '')) return next();
  let file;
  try {
    file = path.join(PUBLIC_DIR, path.normalize(decodeURIComponent(req.path)));
  } catch (e) {
    return next();
  }
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return next();
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return next();
    const key = `${file}:${st.mtimeMs}`;
    let entry = gzipCache.get(key);
    if (!entry) {
      const raw = fs.readFileSync(file);
      entry = { body: zlib.gzipSync(raw), etag: `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"` };
      gzipCache.set(key, entry);
    }
    res.type(path.extname(file));
    res.set({ 'Content-Encoding': 'gzip', ETag: entry.etag, Vary: 'Accept-Encoding' });
    res.set('Cache-Control', req.query.v ? 'public, max-age=31536000, immutable' : 'no-cache');
    if (req.headers['if-none-match'] === entry.etag) return res.status(304).end();
    if (req.method === 'HEAD') return res.end();
    res.end(entry.body);
  });
});
app.use(
  express.static(PUBLIC_DIR, {
    setHeaders: (res, filePath) => {
      // imagens e áudios da Ajuda quase nunca mudam
      if (/[\\/](img|audio)[\\/]/.test(filePath)) res.set('Cache-Control', 'public, max-age=604800');
    }
  })
);

app.get('/', (req, res) => {
  if (restoreFromCookie(req)) return res.redirect('/app');
  return res.redirect('/login.html');
});

// Cada deploy muda a versão dos arquivos de estilo/script na página, então o navegador
// (e o app instalado no celular) sempre pega a versão nova em vez de uma cópia antiga.
const ASSET_VERSION = (process.env.RENDER_GIT_COMMIT || String(Date.now())).slice(0, 12);
app.get('/app', requirePageAuth, (req, res) => {
  const html = require('fs')
    .readFileSync(path.join(__dirname, 'views', 'app.html'), 'utf-8')
    .replace('/css/style.css"', `/css/style.css?v=${ASSET_VERSION}"`)
    .replace('/css/tema-v2.css"', `/css/tema-v2.css?v=${ASSET_VERSION}"`)
    .replace('/js/ajuda-cenas.js"', `/js/ajuda-cenas.js?v=${ASSET_VERSION}"`)
    .replace('/js/app.js"', `/js/app.js?v=${ASSET_VERSION}"`)
    .replace('/js/margem.js"', `/js/margem.js?v=${ASSET_VERSION}"`)
    .replace('/js/leadgen-ui.js"', `/js/leadgen-ui.js?v=${ASSET_VERSION}"`)
    .replace('/js/nav-materiais.js"', `/js/nav-materiais.js?v=${ASSET_VERSION}"`)
    .replace('/js/team-ui.js"', `/js/team-ui.js?v=${ASSET_VERSION}"`)
    .replace('/js/pipeline-v2.js"', `/js/pipeline-v2.js?v=${ASSET_VERSION}"`)
    .replace('/js/calls-ui.js"', `/js/calls-ui.js?v=${ASSET_VERSION}"`);
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(html);
});


// ---------- Assinatura digital de e-mail (PNG claro e escuro) ----------
// Quem estiver logado envia com a própria assinatura, sem fazer nada. Em programas de e-mail com modo escuro
// que aceitam CSS, troca sozinha para a versão escura; nos demais, aparece a clara.
const SIGNATURE_KEYS = { luis: 'Luis Henrique Dias', pedro: 'Pedro Romanello', diego: 'Diego Gianini' };
function signatureHtmlFor(user) {
  if (!user || user.role === 'matriz') return '';
  const key = String(user.username || '').split(/[^a-z]/)[0] || String(user.name || '').toLowerCase().split(' ')[0];
  const full = SIGNATURE_KEYS[key]; if (!full) return '';
  const base = (process.env.PUBLIC_URL || 'https://velocita-global-crm.onrender.com').replace(/\/$/, '');
  const alt = `${full} · Velocita Global`;
  const img = (tone, hidden) => `<img class="vg-sig-${tone[0]}" src="${base}/img/assinaturas/${key}-${tone}.png" width="620" alt="${alt}" style="${hidden ? 'display:none;' : 'display:block;'}width:620px;max-width:100%;height:auto;border:0;" />`;
  return `<br><br><style>@media (prefers-color-scheme: dark){.vg-sig-c{display:none!important}.vg-sig-e{display:block!important}}</style><div class="vg-sig">${img('clara', false)}${img('escura', true)}</div>`;
}

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
  const what = { lead: 'Lead', org: 'Empresa', deal: 'Negócio' }[entityType] || 'CRM';
  pushToTeam(data, {
    except: attendantId,
    title: `${attendant ? attendant.name : 'Alguém'} · ${what}`,
    body: summary,
    url: entityType === 'org' ? '/app#orgs' : entityType === 'deal' ? '/app#pipeline' : '/app#leads',
    tag: `${entityType}-${entityId}`
  });
}


// ---------- Materiais e Preços (uso interno: tabela de preços, modelos de mensagem e atalhos do Drive) ----------
function defaultMaterials() {
  return {
    prices: [
      { name: 'Parceria orgânica', desc: 'Sem custo fixo inicial. Comissão cobrada só depois da venda.', value: 'R$ 0 fixo + 10% de comissão' },
      { name: 'Plano de gestão com mídia', desc: 'Gestão de anúncios e canais, com verba de mídia inclusa.', value: 'A partir de R$ 1.500/mês' },
      { name: 'Referência de mercado', desc: 'O que agências tradicionais cobram só de taxa de gestão.', value: 'R$ 2,5 mil a R$ 10 mil' }
    ],
    templates: [
      { title: 'WhatsApp: primeiro contato', text: 'Olá, {nome}! Aqui é {atendente}, da Velocita Global. Vimos a {empresa} e gostaríamos de conversar sobre levar os seus produtos para Mercado Livre, Shopee, Amazon e TikTok Shop, com tecnologia própria e acompanhamento de perto. O estoque continua com vocês. Posso explicar em 2 minutos?' },
      { title: 'E-mail: apresentação', text: 'Assunto: Vender mais em marketplaces com a {empresa}\n\nOlá, {nome}, tudo bem?\n\nSomos a Velocita Global. Unimos inteligência artificial própria, tráfego pago, marketing e e-commerce para acelerar as vendas de marcas em vários canais ao mesmo tempo.\n\nGostaria de apresentar como podemos fazer isso com a {empresa}, sem mexer no seu estoque. Tem 15 minutos esta semana?\n\n{atendente}\nvelocitaglobal.com.br | WhatsApp (16) 3362-4507' },
      { title: 'Follow-up: sem resposta', text: 'Olá, {nome}! Passando para saber se você viu a minha mensagem sobre vender a {empresa} em mais canais. Se fizer sentido, te explico rapidinho como funciona. Se não for o momento, sem problema!' },
      { title: 'Pós-reunião', text: 'Olá, {nome}! Obrigado pela conversa hoje. Como combinado, vou preparar a proposta para a {empresa} e envio até {data}. Qualquer dúvida, é só chamar por aqui.' }
    ],
    drive: [
      { title: 'Crachá e Cordão (arquivos para a gráfica)', url: 'https://drive.google.com/drive/folders/1B_28wKcaNL0_kKUXiQoBMUtEzgwv353V' },
      { title: 'Meu Drive', url: 'https://drive.google.com/drive/my-drive' }
    ]
  };
}
app.get('/api/materials', requireAuth, (req, res) => {
  const data = db.view();
  res.json(data.materials || defaultMaterials());
});
app.put('/api/materials', requireAuth, (req, res) => {
  const b = req.body || {}; const cl = (v, n) => String(v == null ? '' : v).slice(0, n);
  const data = db.read();
  data.materials = {
    prices: (Array.isArray(b.prices) ? b.prices : []).slice(0, 60).map((p) => ({ name: cl(p.name, 120), desc: cl(p.desc, 400), value: cl(p.value, 120) })),
    templates: (Array.isArray(b.templates) ? b.templates : []).slice(0, 60).map((p) => ({ title: cl(p.title, 120), text: cl(p.text, 4000) })),
    drive: (Array.isArray(b.drive) ? b.drive : []).slice(0, 60).map((p) => ({ title: cl(p.title, 120), url: /^https:\/\/(drive|docs)\.google\.com\//.test(cl(p.url, 500)) ? cl(p.url, 500) : '' }))
  };
  db.write(data);
  res.json(data.materials);
});

// Gerador de Leads (busca de empresas, pontuação e envio ao pipeline) — ver leadgen.js
team.register(app, { db, requireAuth, newId });
require('./calls').register(app, { db, requireAuth });
require('./leadgen').register(app, { db, requireAuth, newId, logHistory });

// ---------- Notificações no celular (Web Push / PWA) ----------
// Chaves VAPID geradas uma vez e guardadas nas configurações (persistem no Turso).
// Cada aparelho que ativa as notificações vira uma "inscrição" ligada a um atendente.
function vapidKeys(data) {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  if (!data.settings.webPush || !data.settings.webPush.publicKey) {
    data.settings.webPush = webpush.generateVAPIDKeys();
    db.write(data);
  }
  return data.settings.webPush;
}

// Envia em segundo plano; quem fez a ação (except) não recebe a própria notificação.
// only: lista de atendentes que devem receber (null = time todo).
function pushToTeam(data, { except, only, title, body, url, tag }) {
  const subs = (data.pushSubscriptions || []).filter(
    (s) => (!except || s.attendantId !== except) && (!only || only.length === 0 || only.includes(s.attendantId))
  );
  if (!subs.length) return;
  const keys = vapidKeys(data);
  webpush.setVapidDetails('mailto:velocitaglobal@gmail.com', keys.publicKey, keys.privateKey);
  const payload = JSON.stringify({ title, body: String(body || '').slice(0, 240), url: url || '/app', tag: tag || undefined });
  setImmediate(async () => {
    const dead = [];
    await Promise.all(
      subs.map((s) =>
        webpush.sendNotification(s.subscription, payload, { TTL: 60 * 60 * 24 }).catch((err) => {
          if (err.statusCode === 404 || err.statusCode === 410) dead.push(s.subscription.endpoint);
        })
      )
    );
    if (dead.length) {
      const fresh = db.read();
      fresh.pushSubscriptions = (fresh.pushSubscriptions || []).filter((s) => !dead.includes(s.subscription.endpoint));
      db.write(fresh);
    }
  });
}

app.get('/api/push/public-key', requireAuth, (req, res) => {
  res.json({ publicKey: vapidKeys(db.view()).publicKey });
});

app.post('/api/push/subscribe', requireAuth, (req, res) => {
  const { subscription, attendantId, device } = req.body || {};
  if (!subscription || !subscription.endpoint) return res.status(400).json({ error: 'Inscrição inválida' });
  const data = db.read();
  if (!data.pushSubscriptions) data.pushSubscriptions = [];
  data.pushSubscriptions = data.pushSubscriptions.filter((s) => s.subscription.endpoint !== subscription.endpoint);
  data.pushSubscriptions.push({ subscription, attendantId: attendantId || null, device: String(device || '').slice(0, 120), createdAt: new Date().toISOString() });
  db.write(data);
  res.json({ ok: true });
});

app.post('/api/push/unsubscribe', requireAuth, (req, res) => {
  const data = db.read();
  data.pushSubscriptions = (data.pushSubscriptions || []).filter((s) => s.subscription.endpoint !== (req.body || {}).endpoint);
  db.write(data);
  res.json({ ok: true });
});

app.post('/api/push/test', requireAuth, (req, res) => {
  const data = db.read();
  const user = data.users.find((u) => u.id === req.body.attendantId);
  pushToTeam(data, { only: req.body.attendantId ? [req.body.attendantId] : null, title: 'Velocita Global', body: `Notificações ativadas${user ? ` para ${user.name}` : ''}. Tudo certo!`, url: '/app', tag: 'teste' });
  res.json({ ok: true });
});

// Lembrete 15 minutos antes de reuniões, ligações e tarefas do Roteiro.
// (No plano gratuito da Render o servidor dorme sem uso; nesse caso o lembrete sai
// quando ele acordar, se ainda estiver dentro da janela.)
setInterval(() => {
  let data;
  try {
    data = db.read();
  } catch (e) {
    return; // banco ainda carregando
  }
  if (!(data.pushSubscriptions || []).length) return;
  const now = Date.now();
  let changed = false;
  for (const a of data.activities) {
    if (!['task', 'meeting', 'call'].includes(a.type) || a.done || a.reminderPushedAt) continue;
    const t = new Date(a.date).getTime();
    if (t - now <= 15 * 60 * 1000 && t - now > -5 * 60 * 1000) {
      a.reminderPushedAt = new Date().toISOString();
      changed = true;
      const hora = new Date(a.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
      pushToTeam(data, { only: a.attendantId ? [a.attendantId] : null, title: `Daqui a pouco, às ${hora}`, body: a.text || 'Compromisso do Roteiro', url: '/app#roteiro', tag: `lembrete-${a.id}` });
    }
  }
  if (changed) db.write(data);
}, 60 * 1000);

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
  const data = db.view();
  res.json([...data.stages].sort((a, b) => a.order - b.order));
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
  const { orderedIds } = req.body || {};
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'Ordem inválida' });
  orderedIds.forEach((id, idx) => {
    const stage = data.stages.find((s) => s.id === id);
    if (stage) stage.order = idx + 1;
  });
  db.write(data);
  res.json(data.stages.sort((a, b) => a.order - b.order));
});

// ---------- Organizations ----------
app.get('/api/organizations', requireAuth, (req, res) => {
  res.json(db.view().organizations);
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
  // leads e negócios dessa empresa ficam sem empresa, em vez de apontar para uma que não existe
  data.contacts.forEach((c) => {
    if (c.orgId === req.params.id) c.orgId = null;
  });
  data.deals.forEach((d) => {
    if (d.orgId === req.params.id) d.orgId = null;
  });
  db.write(data);
  res.json({ ok: true });
});

app.get('/api/organizations/:id/history', requireAuth, (req, res) => {
  const data = db.view();
  res.json((data.history || []).filter((h) => h.entityType === 'org' && h.entityId === req.params.id));
});

// ---------- Contacts (people) ----------
app.get('/api/contacts', requireAuth, (req, res) => {
  res.json(db.view().contacts);
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

// Importação em lote (planilha Excel/CSV lida no navegador). Cria a empresa pelo nome
// quando ela ainda não existe e pula leads repetidos (mesmo e-mail ou telefone).
app.post('/api/contacts/import', requireAuth, (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows.slice(0, 5000) : [];
  if (!rows.length) return res.status(400).json({ error: 'Nenhuma linha para importar' });
  const data = db.read();
  const digits = (s) => String(s || '').replace(/\D/g, '');
  const emails = new Set(data.contacts.map((c) => (c.email || '').trim().toLowerCase()).filter(Boolean));
  const phones = new Set(data.contacts.map((c) => digits(c.phone)).filter((p) => p.length >= 8));
  let created = 0;
  let skipped = 0;
  let orgsCreated = 0;
  for (const r of rows) {
    const name = String(r.name || '').trim();
    const email = String(r.email || '').trim();
    const phone = String(r.phone || '').trim();
    if (!name && !email) { skipped++; continue; }
    const emailKey = email.toLowerCase();
    const phoneKey = digits(phone);
    if ((emailKey && emails.has(emailKey)) || (phoneKey.length >= 8 && phones.has(phoneKey))) { skipped++; continue; }
    let orgId = null;
    const company = String(r.company || '').trim();
    if (company) {
      let org = data.organizations.find((o) => (o.name || '').trim().toLowerCase() === company.toLowerCase());
      if (!org) {
        org = { id: newId('org'), name: company, cnpj: String(r.cnpj || ''), razaoSocial: '', setor: String(r.setor || ''), phone: '', mobile: '', address: '', notes: '', tags: [], ownerId: req.body.ownerId || null, extraInfo: [] };
        data.organizations.push(org);
        orgsCreated++;
      }
      orgId = org.id;
    }
    const contact = {
      id: newId('c'),
      name: name || email,
      email,
      phone,
      orgId,
      notes: String(r.notes || ''),
      categories: r.category ? [String(r.category)] : [],
      tags: [],
      ownerId: req.body.ownerId || null,
      extraInfo: r.role ? [{ id: newId('x'), label: 'Cargo', value: String(r.role) }] : [],
      source: { channel: String(r.channel || 'importacao'), campaign: String(r.campaign || req.body.fileName || '') },
      channels: { whatsapp: phone, facebookPsid: '', instagramId: '' }
    };
    data.contacts.push(contact);
    if (emailKey) emails.add(emailKey);
    if (phoneKey.length >= 8) phones.add(phoneKey);
    created++;
  }
  logHistory(data, 'lead', 'import', req.body.attendantId, 'created', `Importação de planilha: ${created} leads`);
  db.write(data);
  res.json({ created, skipped, orgsCreated });
});

// ---------- Observações do dia (Roteiro) ----------
// Uma anotação por dia e por atendente (attendantId null = observação geral do time).
app.get('/api/daily-notes', requireAuth, (req, res) => {
  const { from, to } = req.query;
  let notes = db.view().dailyNotes || [];
  if (from) notes = notes.filter((n) => n.date >= from);
  if (to) notes = notes.filter((n) => n.date <= to);
  res.json(notes);
});

app.put('/api/daily-notes', requireAuth, (req, res) => {
  const { date, attendantId, text } = req.body || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return res.status(400).json({ error: 'Data inválida' });
  const data = db.read();
  if (!data.dailyNotes) data.dailyNotes = [];
  const who = attendantId || null;
  const idx = data.dailyNotes.findIndex((n) => n.date === date && (n.attendantId || null) === who);
  const clean = String(text || '').trim();
  if (!clean) {
    if (idx >= 0) data.dailyNotes.splice(idx, 1);
    db.write(data);
    return res.json({ ok: true, removed: true });
  }
  const note = {
    id: idx >= 0 ? data.dailyNotes[idx].id : newId('dn'),
    date,
    attendantId: who,
    attendantName: (data.users.find((u) => u.id === who) || {}).name || null,
    text: clean,
    updatedAt: new Date().toISOString()
  };
  if (idx >= 0) data.dailyNotes[idx] = note;
  else data.dailyNotes.push(note);
  db.write(data);
  res.json(note);
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
  const data = db.view();
  res.json((data.history || []).filter((h) => h.entityType === 'lead' && h.entityId === req.params.id));
});

// ---------- Deals ----------
app.get('/api/deals', requireAuth, (req, res) => {
  res.json(db.view().deals);
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
    supplyCost: Number(req.body.supplyCost) || 0,
    marketingCost: Number(req.body.marketingCost) || 0,
    personId: req.body.personId || null,
    orgId: req.body.orgId || null,
    stage: stageId,
    ownerId: req.body.ownerId || (req.user && req.user.role !== 'matriz' ? req.user.id : null) || (data.users.find((u) => u.role !== 'matriz') || {}).id || null,
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
  res.json(db.view().activities);
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
  pushNewActivity(data, activity, req.body.createdBy);
});

app.get('/api/deals/:id/activities', requireAuth, (req, res) => {
  const data = db.view();
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
  pushNewActivity(data, activity, req.body.createdBy);
});

// Atividades gerais do lead (não vinculadas a um negócio específico)
app.get('/api/leads/:id/activities', requireAuth, (req, res) => {
  const data = db.view();
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
  pushNewActivity(data, activity, req.body.createdBy);
});

app.put('/api/activities/:id', requireAuth, (req, res) => {
  const data = db.read();
  const activity = data.activities.find((a) => a.id === req.params.id);
  if (!activity) return res.status(404).json({ error: 'Atividade não encontrada' });
  const before = { progress: activity.progress, contacted: activity.contacted, outcomeNotes: activity.outcomeNotes, done: activity.done };
  Object.assign(activity, req.body);
  db.write(data);
  res.json(activity);
  // avisa o time quando o andamento de uma tarefa do Roteiro muda
  const parts = [];
  const PROG = { pendente: 'Pendente', andamento: 'Em andamento', concluida: 'Concluída' };
  if (req.body.progress && req.body.progress !== before.progress) parts.push(PROG[req.body.progress] || req.body.progress);
  else if (req.body.done !== undefined && req.body.done !== before.done) parts.push(req.body.done ? 'Concluída' : 'Reaberta');
  if (req.body.contacted !== undefined && req.body.contacted !== before.contacted && req.body.contacted !== null) parts.push(req.body.contacted ? 'contato feito' : 'sem contato');
  if (req.body.outcomeNotes && req.body.outcomeNotes !== before.outcomeNotes) parts.push(`obs.: ${req.body.outcomeNotes}`);
  if (parts.length && ['task', 'meeting', 'call'].includes(activity.type)) {
    const who = data.users.find((u) => u.id === req.body.outcomeBy);
    pushToTeam(data, {
      except: req.body.outcomeBy,
      title: `${who ? who.name : 'Roteiro'} atualizou uma tarefa`,
      body: `${activity.text}: ${parts.join(' · ')}`,
      url: '/app#roteiro',
      tag: `act-${activity.id}`
    });
  }
});

function pushNewActivity(data, activity, createdBy) {
  if (!['task', 'meeting', 'call'].includes(activity.type)) return;
  const LABEL = { task: 'Nova tarefa', meeting: 'Nova reunião', call: 'Nova ligação' };
  const quando = new Date(activity.date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  pushToTeam(data, {
    except: createdBy,
    only: activity.attendantId ? [activity.attendantId] : null,
    title: `${LABEL[activity.type]} no Roteiro`,
    body: `${activity.text} · ${quando}${activity.attendantName ? ' · ' + activity.attendantName : ' · Geral'}`,
    url: '/app#roteiro',
    tag: `act-${activity.id}`
  });
}

app.delete('/api/activities/:id', requireAuth, (req, res) => {
  const data = db.read();
  data.activities = data.activities.filter((a) => a.id !== req.params.id);
  db.write(data);
  res.json({ ok: true });
});

// ---------- Tags (etiquetas) ----------
app.get('/api/tags', requireAuth, (req, res) => {
  res.json(db.view().tags || []);
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
  const data = db.view();
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
  res.json(team.sanitizeUsers(db.view().users));
});

const matrizOnly = (req, res, next) => (req.user && team.isAdminLike(req.user) ? next() : res.status(403).json({ error: 'Seu perfil não tem permissão para isso.' }));
app.post('/api/users', requireAuth, matrizOnly, (req, res) => {
  const data = db.read();
  const user = { id: newId('u'), name: req.body.name || 'Novo usuário', ramal: req.body.ramal || '', role: 'socio', active: true };
  data.users.push(user);
  team.ensureTeam(data);
  db.write(data);
  res.status(201).json(team.sanitizeUsers([data.users.find((u) => u.id === user.id)])[0]);
});

app.put('/api/users/:id', requireAuth, (req, res) => {
  const data = db.read();
  const user = data.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  if (!team.isAdminLike(req.user) && req.user.id !== user.id) return res.status(403).json({ error: 'Você só pode alterar o seu próprio cadastro.' });
  const { passHash, role, username, active, id, ...safe } = req.body || {};
  Object.assign(user, safe);
  db.write(data);
  res.json(team.sanitizeUsers([user])[0] || {});
});

app.delete('/api/users/:id', requireAuth, matrizOnly, (req, res) => {
  const data = db.read();
  const target = data.users.find((u) => u.id === req.params.id);
  if (target && target.role === 'matriz') return res.status(400).json({ error: 'A conta matriz não pode ser excluída.' });
  if (data.users.filter((u) => u.role !== 'matriz').length <= 1) return res.status(400).json({ error: 'É necessário ao menos um usuário' });
  data.users = data.users.filter((u) => u.id !== req.params.id);
  db.write(data);
  res.json({ ok: true });
});

// ---------- Settings (custom fields, goal) ----------
// Chaves internas do servidor (assinatura do login e das notificações) não vão
// para o navegador nem podem ser trocadas por ele.
const SERVER_ONLY_SETTINGS = ['authSecret', 'webPush'];

app.get('/api/settings', requireAuth, (req, res) => {
  const settings = { ...db.view().settings };
  SERVER_ONLY_SETTINGS.forEach((k) => delete settings[k]);
  // perfil limitado não enxerga chaves e senhas de integrações
  if (req.user && !team.isAdminLike(req.user)) delete settings.integrations;
  res.json(settings);
});

app.put('/api/settings', requireAuth, (req, res) => {
  const data = db.read();
  const payload = { ...(req.body || {}) };
  SERVER_ONLY_SETTINGS.forEach((k) => delete payload[k]);
  data.settings = { ...data.settings, ...payload };
  db.write(data);
  const visible = { ...data.settings };
  SERVER_ONLY_SETTINGS.forEach((k) => delete visible[k]);
  res.json(visible);
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
    pushToTeam(data, {
      title: `Nova mensagem de ${lead ? lead.name : 'um lead'}`,
      body: full.text || 'Mensagem recebida',
      url: '/app#mensagens',
      tag: `msg-${full.leadId}`
    });
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

// Formulário público: no máximo 20 envios por IP por hora, para um robô não
// encher o CRM de leads falsos.
const siteFormHits = new Map();
function siteFormLimited(ip) {
  const now = Date.now();
  const hits = (siteFormHits.get(ip) || []).filter((t) => now - t < 60 * 60 * 1000);
  hits.push(now);
  siteFormHits.set(ip, hits);
  if (siteFormHits.size > 5000) siteFormHits.clear();
  return hits.length > 20;
}

app.post('/api/webhooks/site-form', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  if (siteFormLimited(req.ip)) return res.status(429).json({ error: 'Muitos envios. Tente mais tarde.' });
  const body = req.body || {};
  const field = (v, max) => String(v || '').trim().slice(0, max);
  const data = db.read();
  const name = field(body.name || body.nome, 200);
  const email = field(body.email, 200);
  const whatsapp = field(body.whatsapp || body.phone, 40);
  const company = field(body.company || body.empresa, 200);
  const plan = field(body.plan || body.plano, 200);
  const message = field(body.message || body.mensagem, 5000);

  if (!name && !email && !whatsapp) {
    return res.status(400).json({ error: 'Formulário vazio' });
  }

  let contact = (email && findContactByChannel(data, 'email', email)) || (whatsapp && findContactByChannel(data, 'whatsapp', whatsapp));

  if (!contact) {
    let orgId = null;
    if (company) {
      let org = data.organizations.find((o) => (o.name || '').toLowerCase() === company.toLowerCase());
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
  res.json((db.view().webhookEvents || []).slice(0, 50));
});

// ---------- Conversas por canal (WhatsApp / Facebook / Instagram / E-mail) ----------
// Cada mensagem enviada fica registrada com o atendente (usuário logado no CRM) que
// a escreveu. O envio real só acontece quando a integração correspondente estiver
// configurada em Configurações > Integrações; caso contrário a mensagem fica
// registrada apenas no CRM (deliveryStatus: "simulated"), de forma transparente.
// Lista a conversa mais recente por lead+canal — alimenta a página Comunicações.
app.get('/api/messages', requireAuth, (req, res) => {
  const data = db.view();
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
  res.json((db.view().notifications || []).slice(0, 50));
});

app.get('/api/notifications/unread-count', requireAuth, (req, res) => {
  const count = (db.view().notifications || []).filter((n) => !n.read).length;
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

// Descarta uma notificacao especifica.
app.delete('/api/notifications/:id', requireAuth, (req, res) => {
  const data = db.read();
  data.notifications = (data.notifications || []).filter((n) => n.id !== req.params.id);
  db.write(data);
  res.json({ ok: true });
});

// Limpeza em lote. escopo: 'lidas' (padrao), 'antigas' (acima de `dias`) ou 'todas'.
app.post('/api/notifications/clear', requireAuth, (req, res) => {
  const escopo = (req.body || {}).escopo || 'lidas';
  const dias = Number((req.body || {}).dias) || 7;
  const limite = Date.now() - dias * 24 * 60 * 60 * 1000;
  const data = db.read();
  const antes = (data.notifications || []).length;
  data.notifications = (data.notifications || []).filter((n) => {
    if (escopo === 'todas') return false;
    if (escopo === 'antigas') {
      const quando = new Date(n.timestamp).getTime();
      return !(Number.isFinite(quando) && quando < limite);
    }
    return !n.read; // 'lidas'
  });
  db.write(data);
  res.json({ ok: true, removidas: antes - data.notifications.length });
});

// ---------- Chat interno da equipe (somente entre admins/atendentes, não visível ao lead) ----------
// Mensagens "gerais" (sem recipientId) vão para todo mundo; mensagens privadas só
// aparecem para o remetente e o destinatário escolhido.
app.get('/api/team-chat', requireAuth, (req, res) => {
  const data = db.view();
  const me = req.query.attendantId || '';
  const msgs = (data.teamChat || []).filter((m) => !m.recipientId || m.senderId === me || m.recipientId === me);
  res.json(msgs);
});

// Fotos, áudios e arquivos do chat ficam guardados à parte (db.putFile) e são
// baixados só quando aparecem na tela — o navegador guarda cópia, já que nunca mudam.
app.get('/api/team-chat/files/:id', requireAuth, async (req, res) => {
  try {
    const file = await db.getFile(req.params.id);
    if (!file) return res.status(404).json({ error: 'Arquivo não encontrado' });
    res.set('Cache-Control', 'private, max-age=31536000, immutable');
    res.type(file.mime || 'application/octet-stream').end(file.buffer);
  } catch (err) {
    res.status(500).json({ error: 'Falha ao carregar o arquivo' });
  }
});

const TEAM_CHAT_KINDS = ['image', 'audio', 'file'];

app.post('/api/team-chat', requireAuth, async (req, res) => {
  const { text, attendantId, attachment, recipientId } = req.body || {};
  const trimmedText = String(text || '').trim().slice(0, 5000);
  if (!trimmedText && !(attachment && attachment.dataBase64)) {
    return res.status(400).json({ error: 'Mensagem vazia' });
  }
  let storedAttachment = null;
  if (attachment && attachment.dataBase64) {
    const buffer = Buffer.from(String(attachment.dataBase64), 'base64');
    const fileId = newId('f');
    const mime = String(attachment.mime || 'application/octet-stream').slice(0, 100);
    try {
      await db.putFile(fileId, mime, buffer);
    } catch (err) {
      console.error('Falha ao guardar anexo do chat:', err.message);
      return res.status(500).json({ error: 'Não foi possível salvar o anexo. Tente de novo.' });
    }
    storedAttachment = {
      kind: TEAM_CHAT_KINDS.includes(attachment.kind) ? attachment.kind : 'file',
      filename: String(attachment.filename || 'arquivo').slice(0, 200),
      mime,
      size: buffer.length,
      fileId
    };
  }
  // lê os dados só depois do upload, para não sobrescrever o que chegou nesse meio-tempo
  const data = db.read();
  if (!data.teamChat) data.teamChat = [];
  const sender = data.users.find((u) => u.id === attendantId);
  const message = {
    id: newId('tc'),
    senderId: attendantId || null,
    senderName: sender ? sender.name : 'Atendente',
    recipientId: recipientId || null,
    text: trimmedText,
    attachment: storedAttachment,
    readBy: [],
    timestamp: new Date().toISOString()
  };
  data.teamChat.push(message);
  const dropped = data.teamChat.slice(0, Math.max(0, data.teamChat.length - 500));
  data.teamChat = data.teamChat.slice(-500);
  db.write(data);
  const droppedFiles = dropped.map((m) => m.attachment && m.attachment.fileId).filter(Boolean);
  if (droppedFiles.length) db.deleteFiles(droppedFiles).catch(() => {});
  res.status(201).json(message);
  pushToTeam(data, {
    except: attendantId,
    only: recipientId ? [recipientId] : null,
    title: `${message.senderName}${recipientId ? ' (privado)' : ' · Chat da Equipe'}`,
    body: trimmedText || (message.attachment ? `Enviou ${message.attachment.kind === 'audio' ? 'um áudio' : message.attachment.kind === 'image' ? 'uma foto' : 'um arquivo'}` : ''),
    url: '/app#chatequipe',
    tag: recipientId ? `chat-${attendantId}` : 'chat-equipe'
  });
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
  const data = db.view();
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
            signatureHtmlFor(req.user) ||
            (attendant && attendant.signatureImage ? `<br><br><img src="${attendant.signatureImage}" alt="Assinatura" style="max-width:320px;" />` : '');
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
  const data = db.view();
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
      call: (sys, msgs) => callGeminiRaw(process.env.GEMINI_API_KEY, process.env.GEMINI_MODEL || 'gemini-3.5-flash', sys, msgs)
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
    const model = ai.model || process.env.GEMINI_MODEL || 'gemini-3.5-flash';
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
      body: JSON.stringify({ model: ai.model || 'claude-sonnet-5-5', max_tokens: 500, system: systemPrompt, messages })
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
  const data = db.view();
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
  const data = db.view();
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
    scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email',
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
  const data = db.view();
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
    scope: 'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email',
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
  if (!response.ok) {
    // invalid_grant = autorização expirada/revogada. Acontece a cada 7 dias enquanto o
    // app OAuth do Google estiver em modo "Teste" — a solução é reconectar a conta.
    const err = new Error(
      result.error === 'invalid_grant' || response.status === 400
        ? `A conexão de ${label || 'esta conta'} com o Google expirou. Clique em "Reconectar Google" para autorizar de novo.`
        : `Falha ao renovar token do Google: ${result.error_description || result.error}`
    );
    err.code = 'GOOGLE_RECONNECT';
    throw err;
  }
  return result.access_token;
}

// ---------- E-mail (Gmail API) — caixas "gmail" (compartilhada) e "my" (do atendente) ----------
function resolveMailbox(data, box, attendantId) {
  const gcal = data.settings.integrations.googleCalendar || {};
  if (box === 'gmail') {
    const inbox = data.settings.integrations.gmailInbox || {};
    return { gcal, refreshToken: inbox.refreshToken, email: inbox.email || '', label: inbox.email || 'a caixa compartilhada' };
  }
  const user = data.users.find((u) => u.id === attendantId);
  return { gcal, refreshToken: user && user.googleRefreshToken, email: (user && user.googleEmail) || '', label: user ? user.name : 'este usuário', user };
}

function mailError(res, err) {
  res.status(err.code === 'GOOGLE_RECONNECT' ? 409 : 400).json({ error: err.message, code: err.code || null });
}

async function gmailApi(accessToken, pathAndQuery, options = {}) {
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${pathAndQuery}`, {
    ...options,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const j = r.status === 204 ? {} : await r.json();
  if (!r.ok) {
    const err = new Error(j.error?.message || 'Erro na API do Gmail');
    // escopo insuficiente: conta conectada antes de existir envio/exclusão no CRM
    if (r.status === 403 || r.status === 401) {
      err.code = 'GOOGLE_RECONNECT';
      err.message = 'Essa conta foi conectada com permissões antigas. Clique em "Reconectar Google" para liberar envio e organização dos e-mails.';
    }
    throw err;
  }
  return j;
}

// Cabeçalho com acento/emoji precisa ir codificado (RFC 2047)
const mimeWord = (s) => (/^[\x20-\x7e]*$/.test(s || '') ? s || '' : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`);

function buildRawEmail({ from, to, cc, subject, html, inReplyTo, references }) {
  const lines = [`From: ${from}`, `To: ${to}`];
  if (cc) lines.push(`Cc: ${cc}`);
  lines.push(`Subject: ${mimeWord(subject || '(sem assunto)')}`, 'MIME-Version: 1.0', 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64');
  if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`, `References: ${references || inReplyTo}`);
  const body = Buffer.from(html || '', 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n');
  return Buffer.from(lines.join('\r\n') + '\r\n\r\n' + body, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

app.get('/api/mail/:box/messages', requireAuth, async (req, res) => {
  const data = db.view();
  const mb = resolveMailbox(data, req.params.box, req.query.attendantId);
  try {
    const token = await getGoogleAccessTokenGeneric(mb.gcal, mb.refreshToken, mb.label);
    const folder = GMAIL_FOLDERS.includes(req.query.folder) ? req.query.folder : 'INBOX';
    const params = new URLSearchParams({ maxResults: '30', labelIds: folder });
    if (req.query.q) params.set('q', String(req.query.q));
    if (req.query.pageToken) params.set('pageToken', String(req.query.pageToken));
    if (folder === 'TRASH' || folder === 'SPAM') params.set('includeSpamTrash', 'true');
    const list = await gmailApi(token, `messages?${params}`);
    const messages = await Promise.all(
      (list.messages || []).map(async (m) => {
        const j = await gmailApi(token, `messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`);
        const h = (n) => ((j.payload && j.payload.headers) || []).find((x) => x.name === n)?.value || '';
        return { id: m.id, threadId: j.threadId, from: h('From'), to: h('To'), subject: h('Subject') || '(sem assunto)', date: h('Date'), internalDate: Number(j.internalDate) || 0, snippet: j.snippet || '', unread: (j.labelIds || []).includes('UNREAD') };
      })
    );
    res.json({ email: mb.email, messages, nextPageToken: list.nextPageToken || null });
  } catch (err) {
    mailError(res, err);
  }
});

app.get('/api/mail/:box/messages/:id', requireAuth, async (req, res) => {
  const data = db.view();
  const mb = resolveMailbox(data, req.params.box, req.query.attendantId);
  try {
    const token = await getGoogleAccessTokenGeneric(mb.gcal, mb.refreshToken, mb.label);
    const j = await gmailApi(token, `messages/${req.params.id}?format=full`);
    const h = (n) => ((j.payload && j.payload.headers) || []).find((x) => x.name.toLowerCase() === n.toLowerCase())?.value || '';
    const msg = {
      id: j.id, threadId: j.threadId, from: h('From'), to: h('To'), cc: h('Cc'), subject: h('Subject') || '(sem assunto)', date: h('Date'),
      messageId: h('Message-ID'), references: h('References'), unread: (j.labelIds || []).includes('UNREAD'),
      body: await extractGmailBody(j.payload, token, j.id)
    };
    // abrir = marcar como lida (falha silenciosa se a conta ainda não tem permissão de modificar)
    if (msg.unread) gmailApi(token, `messages/${j.id}/modify`, { method: 'POST', body: JSON.stringify({ removeLabelIds: ['UNREAD'] }) }).catch(() => {});
    res.json(msg);
  } catch (err) {
    mailError(res, err);
  }
});

app.post('/api/mail/:box/messages/:id/trash', requireAuth, async (req, res) => {
  const data = db.read();
  const mb = resolveMailbox(data, req.params.box, req.body.attendantId);
  try {
    const token = await getGoogleAccessTokenGeneric(mb.gcal, mb.refreshToken, mb.label);
    await gmailApi(token, `messages/${req.params.id}/${req.body.restore ? 'untrash' : 'trash'}`, { method: 'POST' });
    res.json({ ok: true });
  } catch (err) {
    mailError(res, err);
  }
});

app.post('/api/mail/:box/messages/:id/unread', requireAuth, async (req, res) => {
  const data = db.read();
  const mb = resolveMailbox(data, req.params.box, req.body.attendantId);
  try {
    const token = await getGoogleAccessTokenGeneric(mb.gcal, mb.refreshToken, mb.label);
    await gmailApi(token, `messages/${req.params.id}/modify`, { method: 'POST', body: JSON.stringify({ addLabelIds: ['UNREAD'] }) });
    res.json({ ok: true });
  } catch (err) {
    mailError(res, err);
  }
});

app.post('/api/mail/:box/send', requireAuth, async (req, res) => {
  const data = db.read();
  const mb = resolveMailbox(data, req.params.box, req.body.attendantId);
  const { to, cc, subject, text, html, inReplyTo, references, threadId } = req.body || {};
  if (!to || !String(to).includes('@')) return res.status(400).json({ error: 'Informe pelo menos um destinatário válido.' });
  try {
    const token = await getGoogleAccessTokenGeneric(mb.gcal, mb.refreshToken, mb.label);
    const from = mb.user ? `${mimeWord(mb.user.name)} <${mb.email}>` : `Velocita Global <${mb.email}>`;
    const bodyHtml = html || escapeHtmlServer(String(text || '')).replace(/\n/g, '<br>');
    const bodyWithSig = req.body.noSignature ? bodyHtml : bodyHtml + signatureHtmlFor(req.user);
    const raw = buildRawEmail({ from, to, cc, subject, html: `<div style="font-family:Arial,sans-serif;font-size:14px;">${bodyWithSig}</div>`, inReplyTo, references });
    const sent = await gmailApi(token, 'messages/send', { method: 'POST', body: JSON.stringify(threadId ? { raw, threadId } : { raw }) });
    // se o destinatário for um lead do CRM, registra na linha do tempo dele
    const lead = data.contacts.find((c) => c.email && String(to).toLowerCase().includes(c.email.toLowerCase()));
    if (lead) {
      logHistory(data, 'lead', lead.id, req.body.attendantId, 'updated', `E-mail enviado por ${mb.email}: ${subject || '(sem assunto)'}`);
      db.write(data);
    }
    res.json({ ok: true, id: sent.id });
  } catch (err) {
    mailError(res, err);
  }
});

function escapeHtmlServer(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function decodeGmailBase64Url(str) {
  return Buffer.from((str || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

// Acha a melhor parte (html > texto simples) e devolve a referência bruta —
// pode vir com o conteúdo já embutido (body.data) ou só uma referência
// (body.attachmentId) quando a parte é grande demais pro Gmail embutir inline.
function findGmailBodyPart(payload) {
  if (!payload) return null;
  if (payload.body && (payload.body.data || payload.body.attachmentId) && (payload.mimeType === 'text/html' || payload.mimeType === 'text/plain')) {
    return payload;
  }
  if (Array.isArray(payload.parts)) {
    const htmlPart = payload.parts.find((p) => p.mimeType === 'text/html');
    if (htmlPart) {
      const found = findGmailBodyPart(htmlPart);
      if (found) return found;
    }
    const textPart = payload.parts.find((p) => p.mimeType === 'text/plain');
    if (textPart) {
      const found = findGmailBodyPart(textPart);
      if (found) return found;
    }
    for (const part of payload.parts) {
      const nested = findGmailBodyPart(part);
      if (nested) return nested;
    }
  }
  return null;
}

async function extractGmailBody(payload, accessToken, messageId) {
  const part = findGmailBodyPart(payload);
  if (!part) return '';
  if (part.body.data) return decodeGmailBase64Url(part.body.data);
  if (part.body.attachmentId && accessToken && messageId) {
    const attRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${part.body.attachmentId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const attJson = await attRes.json();
    if (attRes.ok && attJson.data) return decodeGmailBase64Url(attJson.data);
  }
  return '';
}

const GMAIL_FOLDERS = ['INBOX', 'SENT', 'SPAM', 'TRASH'];

async function listGmailMessages(accessToken, folder) {
  const label = GMAIL_FOLDERS.includes(folder) ? folder : 'INBOX';
  const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&labelIds=${label}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const listJson = await listRes.json();
  if (!listRes.ok) throw new Error(listJson.error?.message || 'Erro ao listar mensagens do Gmail');

  return Promise.all(
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
}

async function getGmailMessage(accessToken, id) {
  const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const msgJson = await msgRes.json();
  if (!msgRes.ok) throw new Error(msgJson.error?.message || 'Erro ao carregar a mensagem');
  const headers = (msgJson.payload && msgJson.payload.headers) || [];
  const getHeader = (name) => (headers.find((h) => h.name === name) || {}).value || '';
  return {
    id,
    from: getHeader('From'),
    to: getHeader('To'),
    subject: getHeader('Subject') || '(sem assunto)',
    date: getHeader('Date'),
    body: await extractGmailBody(msgJson.payload, accessToken, id)
  };
}

app.get('/api/email-inbox/gmail/messages', requireAuth, async (req, res) => {
  const data = db.view();
  const gcal = data.settings.integrations.googleCalendar || {};
  const gmailInbox = data.settings.integrations.gmailInbox || {};
  try {
    const accessToken = await getGoogleAccessTokenGeneric(gcal, gmailInbox.refreshToken, 'A caixa de entrada do Gmail');
    const messages = await listGmailMessages(accessToken, req.query.folder);
    res.json({ email: gmailInbox.email || '', messages });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/email-inbox/gmail/messages/:id', requireAuth, async (req, res) => {
  const data = db.view();
  const gcal = data.settings.integrations.googleCalendar || {};
  const gmailInbox = data.settings.integrations.gmailInbox || {};
  try {
    const accessToken = await getGoogleAccessTokenGeneric(gcal, gmailInbox.refreshToken, 'A caixa de entrada do Gmail');
    res.json(await getGmailMessage(accessToken, req.params.id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Caixa de entrada pessoal de quem está "Atendendo como X" no momento — reaproveita
// o MESMO refresh token que o usuário já conectou para o Google Calendar (o escopo
// gmail.readonly foi incluído nesse fluxo), então não precisa de uma conexão separada.
app.get('/api/email-inbox/my/messages', requireAuth, async (req, res) => {
  const data = db.view();
  const gcal = data.settings.integrations.googleCalendar || {};
  const user = data.users.find((u) => u.id === req.query.attendantId);
  try {
    const accessToken = await getGoogleAccessTokenGeneric(gcal, user && user.googleRefreshToken, user ? user.name : 'Este usuário');
    const messages = await listGmailMessages(accessToken, req.query.folder);
    res.json({ email: user.googleEmail || '', messages });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/email-inbox/my/messages/:id', requireAuth, async (req, res) => {
  const data = db.view();
  const gcal = data.settings.integrations.googleCalendar || {};
  const user = data.users.find((u) => u.id === req.query.attendantId);
  try {
    const accessToken = await getGoogleAccessTokenGeneric(gcal, user && user.googleRefreshToken, user ? user.name : 'Este usuário');
    res.json(await getGmailMessage(accessToken, req.params.id));
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
// Aplicação com banco e IA próprios, montada dentro do mesmo site em /roteiro-do-dia.
// Recebe do CRM só duas coisas: se a pessoa está logada no CRM e a lista de sócios,
// para entrar no Gerador como o sócio escolhido em "Atendendo como" (assim cada roteiro
// gerado fica no nome de quem gerou).
const roteiroDoDia = require('./roteiro-do-dia/server');
app.use(
  '/roteiro-do-dia',
  (req, res, next) => {
    req.crmAuthenticated = restoreFromCookie(req);
    req.crmUser = req.crmAuthenticated && req.user ? { id: req.user.id, name: req.user.name, role: req.user.role } : null;
    req.crmUsers = req.crmAuthenticated ? db.view().users.filter((u) => u.role !== 'matriz').map((u) => ({ id: u.id, name: u.name, email: u.email || u.googleEmail || '' })) : [];
    next();
  },
  roteiroDoDia.app
);

// Rotas inexistentes da API respondem JSON (o app espera JSON, não uma página HTML).
app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada' }));

// Erro inesperado numa rota: responde JSON simples, sem expor o stack trace.
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Arquivo grande demais para enviar.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Dados inválidos.' });
  console.error(`Erro em ${req.method} ${req.originalUrl}:`, err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Erro interno no servidor. Tente de novo.' });
});

// Mensagens antigas do Chat da Equipe guardavam a mídia em base64 dentro do JSON
// principal. Na primeira subida com esta versão, elas são movidas para o
// armazenamento de arquivos (uma vez só; depois não há mais nada a migrar).
async function migrateTeamChatAttachments() {
  const data = db.read();
  const pending = (data.teamChat || []).filter((m) => m.attachment && m.attachment.dataBase64);
  if (!pending.length) return;
  const moved = new Map();
  for (const m of pending) {
    const buffer = Buffer.from(m.attachment.dataBase64, 'base64');
    const fileId = newId('f');
    await db.putFile(fileId, m.attachment.mime || 'application/octet-stream', buffer);
    moved.set(m.id, { fileId, size: buffer.length });
  }
  // relê para não perder nada gravado durante a migração
  const fresh = db.read();
  for (const m of fresh.teamChat || []) {
    const info = moved.get(m.id);
    if (!info || !m.attachment) continue;
    delete m.attachment.dataBase64;
    m.attachment.fileId = info.fileId;
    m.attachment.size = info.size;
  }
  db.write(fresh);
  await db.flush();
  console.log(`Chat da Equipe: ${moved.size} anexo(s) movido(s) para o armazenamento de arquivos.`);
}

(async () => {
  try {
    await db.init();
  } catch (e) {
    // Sem o banco, o CRM não pode subir: com Turso configurado, seguir com o db.json
    // do repositório gravaria dados de exemplo por cima dos dados reais.
    console.error('Falha ao iniciar o banco de dados do CRM:', e);
    process.exit(1);
  }

  // usuários com login/perfil, conta matriz e dados de presença (quem está online, atividade)
  try {
    const d0 = db.read();
    if (team.ensureTeam(d0)) db.write(d0);
    team.load(db.view());
    setInterval(() => team.flush(db), 60000);
  } catch (e) {
    console.error('Falha ao preparar os usuários da equipe:', e);
  }

  try {
    await migrateTeamChatAttachments();
  } catch (e) {
    console.error('Falha ao migrar anexos do Chat da Equipe (os antigos continuam funcionando):', e.message);
  }

  try {
    await roteiroDoDia.init();
  } catch (e) {
    console.error('Falha ao iniciar o Roteiro do Dia:', e);
  }

  const server = app.listen(PORT, () => {
    console.log(`Velocita Global CRM rodando em http://localhost:${PORT}`);
  });

  // No deploy o Render manda SIGTERM: termina de gravar o que estiver pendente antes de sair.
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} recebido, gravando dados pendentes...`);
    server.close();
    try {
      team.flush(db);
      await Promise.race([db.flush(), new Promise((r) => setTimeout(r, 8000))]);
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
})();
