/* Sons da Velocita Global (CRM e portal de parcerias), gerados no próprio navegador: não depende de arquivo de áudio.
   "ok"    = assinatura sonora da marca: um "swoosh" rápido e um arpejo ascendente (dó-mi-sol-dó) que termina brilhante.
   "alert" = tom diferente para erro ou operação pausada: dois pares de notas graves e descendentes.
   No celular, o aviso do sistema usa o som do próprio aparelho; aqui entram o som com a página aberta e a vibração. */
(() => {
  'use strict';
  const KEY = 'vg_sound'; let ctx = null;
  const enabled = () => { try { return localStorage.getItem(KEY) !== 'off'; } catch (e) { return true; } };
  const setEnabled = (b) => { try { localStorage.setItem(KEY, b ? 'on' : 'off'); } catch (e) { /* sem armazenamento */ } };
  function ac() {
    if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; try { ctx = new C(); } catch (e) { return null; } }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return ctx;
  }
  function tone(c, t, f, dur, o = {}) {
    const osc = c.createOscillator(); const g = c.createGain(); osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(f, t);
    if (o.glide) osc.frequency.linearRampToValueAtTime(f + o.glide, t + dur);
    const peak = o.gain || 0.18; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(c.destination); osc.start(t); osc.stop(t + dur + 0.03);
  }
  function swoosh(c, t) { // ruído filtrado subindo de grave para agudo: a "velocidade" da marca
    const len = Math.floor(c.sampleRate * 0.16); const buf = c.createBuffer(1, len, c.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4; f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(4200, t + 0.15);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16); src.connect(f).connect(g).connect(c.destination); src.start(t);
  }
  const VIBRATE = { ok: [90, 50, 90, 50, 200], alert: [420, 140, 420] };
  function play(kind, opt) {
    if (!(opt && opt.force) && !enabled()) return; const c = ac(); if (!c) return; const t = c.currentTime + 0.03;
    if (kind === 'alert') { [[440, 0], [330, 0.2], [440, 0.5], [330, 0.7]].forEach(([f, d]) => tone(c, t + d, f, 0.2, { type: 'triangle', gain: 0.24, glide: -18 })); }
    else { swoosh(c, t); [[523.25, 0.07], [659.25, 0.16], [783.99, 0.25], [1046.5, 0.34]].forEach(([f, d], i) => tone(c, t + d, f, i === 3 ? 0.6 : 0.17, { gain: i === 3 ? 0.21 : 0.16 })); tone(c, t + 0.34, 2093, 0.45, { gain: 0.035 }); }
    try { if (navigator.vibrate) navigator.vibrate(VIBRATE[kind] || VIBRATE.ok); } catch (e) { /* aparelho sem vibração */ }
  }
  // navegadores só liberam áudio depois do primeiro toque/clique do usuário
  const unlock = () => { ac(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
  // aviso push chegou com a página aberta: toca o som certo
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.type === 'vg-sound') play(e.data.tone === 'alert' ? 'alert' : 'ok'); });
  window.VGSound = { play, enabled, setEnabled };

  // CRM: botão "Som" ao lado de "Minha senha"
  window.addEventListener('crm-ready', () => {
    const anchor = document.getElementById('btn-switch-attendant'); if (!anchor || document.getElementById('vg-sound-btn')) return;
    const b = document.createElement('button'); b.id = 'vg-sound-btn'; b.type = 'button'; b.className = 'btn-secondary btn-sm'; b.style.marginLeft = '8px';
    const label = () => { b.textContent = enabled() ? 'Som: ligado' : 'Som: desligado'; }; label();
    b.title = 'Som das notificações da Velocita'; b.addEventListener('click', () => { setEnabled(!enabled()); label(); if (enabled()) play('ok'); });
    anchor.after(b);
  });
})();
