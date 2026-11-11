/* Chamadas do Chat da Equipe (voz, vídeo e tela) por WebRTC.
   O áudio e o vídeo vão direto de um computador para o outro; o servidor só repassa os
   "sinais" de combinação (convite, resposta, caminhos de rede) por uma caixa de correio em memória. */
'use strict';

const TTL_MS = 120000;
const mailbox = new Map(); // userId -> [{ from, fromName, type, callId, kind, data, t }]
const TYPES = new Set(['invite', 'accept', 'decline', 'offer', 'answer', 'ice', 'end']);

function register(app, { db, requireAuth }) {
  const blockMatriz = (req, res, next) => (req.user && req.user.role === 'matriz' ? res.status(403).json({ error: 'A conta matriz não participa de chamadas. Entre com o seu usuário.' }) : next());

  // servidores de rede para atravessar roteadores. TURN é opcional (variáveis TURN_URL, TURN_USER, TURN_PASS).
  app.get('/api/calls/ice', requireAuth, (req, res) => {
    const iceServers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
    if (process.env.TURN_URL) iceServers.push({ urls: process.env.TURN_URL.split(','), username: process.env.TURN_USER || '', credential: process.env.TURN_PASS || '' });
    res.json({ iceServers, turn: !!process.env.TURN_URL });
  });

  app.post('/api/calls/signal', requireAuth, blockMatriz, (req, res) => {
    const b = req.body || {};
    if (!TYPES.has(b.type) || typeof b.callId !== 'string' || b.callId.length > 64) return res.status(400).json({ error: 'Sinal inválido' });
    const target = db.view().users.find((u) => u.id === b.to && u.role !== 'matriz' && u.active !== false);
    if (!target || target.id === req.user.id) return res.status(404).json({ error: 'Colega não encontrado' });
    const box = mailbox.get(target.id) || []; mailbox.set(target.id, box);
    const raw = JSON.stringify(b.data == null ? null : b.data);
    if (raw && raw.length > 60000) return res.status(413).json({ error: 'Sinal grande demais' });
    box.push({ from: req.user.id, fromName: req.user.name, type: b.type, callId: b.callId, kind: ['audio', 'video', 'screen'].includes(b.kind) ? b.kind : 'audio', data: b.data == null ? null : b.data, t: Date.now() });
    if (box.length > 300) box.splice(0, box.length - 300);
    res.json({ ok: true });
  });

  app.get('/api/calls/poll', requireAuth, (req, res) => {
    const box = mailbox.get(req.user.id) || []; const now = Date.now();
    const fresh = box.filter((m) => now - m.t < TTL_MS);
    mailbox.set(req.user.id, []);
    res.json(fresh);
  });
}

module.exports = { register };
