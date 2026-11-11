/* Face ID / biometria (passkey) no navegador. Usado na tela de login e dentro do CRM. */
(() => {
  'use strict';
  const toBuf = (s) => { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4)); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
  const toB64u = (b) => { const u = new Uint8Array(b); let s = ''; u.forEach((c) => { s += String.fromCharCode(c); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  async function available() { try { return !!(window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())); } catch (e) { return false; } }
  async function post(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Erro'); return d;
  }
  function deviceName() { const ua = navigator.userAgent; if (/iPhone/.test(ua)) return 'iPhone'; if (/iPad/.test(ua)) return 'iPad'; if (/Android/.test(ua)) return 'Android'; if (/Mac/.test(ua)) return 'Mac'; if (/Windows/.test(ua)) return 'Computador Windows'; return 'Este aparelho'; }

  async function enroll() {
    const opts = await post('/api/passkey/register/options');
    opts.challenge = toBuf(opts.challenge); opts.user.id = toBuf(opts.user.id); (opts.excludeCredentials || []).forEach((c) => { c.id = toBuf(c.id); });
    const cred = await navigator.credentials.create({ publicKey: opts }); const r = cred.response;
    await post('/api/passkey/register/verify', {
      name: deviceName(),
      response: { id: cred.id, rawId: toB64u(cred.rawId), type: cred.type, authenticatorAttachment: cred.authenticatorAttachment, clientExtensionResults: cred.getClientExtensionResults(),
        response: { clientDataJSON: toB64u(r.clientDataJSON), attestationObject: toB64u(r.attestationObject), transports: r.getTransports ? r.getTransports() : [] } }
    });
    try { localStorage.setItem('vg_passkey', '1'); } catch (e) { /* sem armazenamento */ }
  }

  async function login() {
    const { options, ch } = await post('/api/passkey/login/options');
    options.challenge = toBuf(options.challenge); (options.allowCredentials || []).forEach((c) => { c.id = toBuf(c.id); });
    const cred = await navigator.credentials.get({ publicKey: options }); const r = cred.response;
    return post('/api/passkey/login/verify', {
      ch, response: { id: cred.id, rawId: toB64u(cred.rawId), type: cred.type, authenticatorAttachment: cred.authenticatorAttachment, clientExtensionResults: cred.getClientExtensionResults(),
        response: { clientDataJSON: toB64u(r.clientDataJSON), authenticatorData: toB64u(r.authenticatorData), signature: toB64u(r.signature), userHandle: r.userHandle ? toB64u(r.userHandle) : undefined } }
    });
  }

  window.VGPasskey = { available, enroll, login };
})();
