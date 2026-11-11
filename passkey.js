/* Entrar com Face ID / biometria (passkey, WebAuthn).
   O aparelho guarda a chave privada (protegida pelo Face ID, digital ou PIN do telefone);
   o servidor guarda só a chave pública. Nada de senha trafega neste login. */
'use strict';
const {
  generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse
} = require('@simplewebauthn/server');
const crypto = require('crypto');

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => new Uint8Array(Buffer.from(String(s), 'base64url'));
const challenges = new Map(); // chave -> { challenge, uid, exp }
function keep(key, rec) { challenges.set(key, { ...rec, exp: Date.now() + 5 * 60 * 1000 }); if (challenges.size > 500) for (const [k, v] of challenges) if (v.exp < Date.now()) challenges.delete(k); }
function take(key) { const r = challenges.get(key); challenges.delete(key); return r && r.exp > Date.now() ? r : null; }

function context(req) {
  const host = req.get('host') || 'localhost';
  const base = process.env.PUBLIC_URL ? new URL(process.env.PUBLIC_URL) : null;
  return base ? { rpID: base.hostname, origin: base.origin } : { rpID: host.split(':')[0], origin: `${req.protocol}://${host}` };
}

function register(app, { db, requireAuth, startSession, tooManyFailures, registerFailure }) {
  const notMatriz = (req, res, next) => (req.user && req.user.role === 'matriz' ? res.status(403).json({ error: 'A conta matriz usa apenas usuário e senha.' }) : next());

  // ---- cadastrar este aparelho (precisa estar logado) ----
  app.post('/api/passkey/register/options', requireAuth, notMatriz, async (req, res) => {
    const { rpID } = context(req); const u = db.view().users.find((x) => x.id === req.user.id);
    const options = await generateRegistrationOptions({
      rpName: 'Velocita Global CRM', rpID, userID: u.id, userName: u.username, userDisplayName: u.name, attestationType: 'none',
      excludeCredentials: (u.passkeys || []).map((p) => ({ id: p.id, type: 'public-key', transports: p.transports })),
      authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'required', userVerification: 'required' }
    });
    keep('reg:' + u.id, { challenge: options.challenge });
    res.json(options);
  });

  app.post('/api/passkey/register/verify', requireAuth, notMatriz, async (req, res) => {
    const rec = take('reg:' + req.user.id); const { rpID, origin } = context(req);
    if (!rec) return res.status(400).json({ error: 'O pedido expirou. Tente de novo.' });
    try {
      const v = await verifyRegistrationResponse({ response: req.body.response, expectedChallenge: rec.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
      if (!v.verified || !v.registrationInfo) return res.status(400).json({ error: 'Não foi possível confirmar o Face ID.' });
      const { credentialID, credentialPublicKey, counter } = v.registrationInfo;
      const data = db.read(); const u = data.users.find((x) => x.id === req.user.id);
      u.passkeys = (u.passkeys || []).filter((p) => p.id !== b64u(credentialID));
      u.passkeys.push({ id: b64u(credentialID), publicKey: b64u(credentialPublicKey), counter, transports: (req.body.response.response || {}).transports || [], name: String(req.body.name || 'Este aparelho').slice(0, 60), createdAt: new Date().toISOString(), lastUsedAt: null });
      db.write(data);
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: 'Não foi possível cadastrar: ' + e.message }); }
  });

  app.get('/api/passkey/list', requireAuth, (req, res) => {
    const u = db.view().users.find((x) => x.id === req.user.id);
    res.json((u.passkeys || []).map((p) => ({ id: p.id, name: p.name, createdAt: p.createdAt, lastUsedAt: p.lastUsedAt })));
  });
  app.delete('/api/passkey/:id', requireAuth, (req, res) => {
    const data = db.read(); const u = data.users.find((x) => x.id === req.user.id);
    u.passkeys = (u.passkeys || []).filter((p) => p.id !== req.params.id); db.write(data); res.json({ ok: true });
  });

  // ---- entrar com Face ID (sem estar logado) ----
  app.post('/api/passkey/login/options', async (req, res) => {
    if (tooManyFailures(req.ip)) return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' });
    const { rpID } = context(req);
    const options = await generateAuthenticationOptions({ rpID, userVerification: 'required' }); // sem lista: o aparelho mostra as chaves dele
    const ch = crypto.randomBytes(12).toString('hex'); keep('auth:' + ch, { challenge: options.challenge });
    res.json({ options, ch });
  });

  app.post('/api/passkey/login/verify', async (req, res) => {
    if (tooManyFailures(req.ip)) return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' });
    const { ch, response } = req.body || {}; const rec = take('auth:' + ch); const { rpID, origin } = context(req);
    const fail = (code, msg) => { registerFailure(req.ip); return res.status(code).json({ error: msg }); };
    if (!rec || !response || !response.id) return fail(400, 'O pedido expirou. Tente de novo.');
    const users = db.view().users; let owner = null; let pk = null;
    for (const u of users) { const f = (u.passkeys || []).find((p) => p.id === response.id); if (f) { owner = u; pk = f; break; } }
    if (!owner || owner.active === false || owner.role === 'matriz') return fail(401, 'Este aparelho não está cadastrado. Entre com usuário e senha.');
    try {
      const v = await verifyAuthenticationResponse({
        response, expectedChallenge: rec.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
        authenticator: { credentialID: fromB64u(pk.id), credentialPublicKey: fromB64u(pk.publicKey), counter: pk.counter || 0, transports: pk.transports }
      });
      if (!v.verified) return fail(401, 'Face ID não confirmado.');
      const data = db.read(); const u = data.users.find((x) => x.id === owner.id); const k = u.passkeys.find((p) => p.id === pk.id);
      k.counter = v.authenticationInfo.newCounter; k.lastUsedAt = new Date().toISOString(); db.write(data);
      startSession(req, res, u);
      res.json({ ok: true, user: { id: u.id, name: u.name, role: u.role, username: u.username } });
    } catch (e) { return fail(401, 'Não foi possível entrar com Face ID.'); }
  });
}

module.exports = { register };
