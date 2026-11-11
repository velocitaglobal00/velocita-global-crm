/* Chamadas no Chat da Equipe: voz, vídeo e compartilhamento de tela (WebRTC). */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const api = (u, o) => window.api(u, o);
  const toast = (t) => window.showToast && window.showToast(t);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let C = null;            // chamada em andamento
  let ice = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  let ringTimer = null; let poller = null; let ringCtx = null;
  const newId = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 24) : String(Date.now()) + Math.random().toString(16).slice(2, 10));
  const peerName = (id) => ((window.state.users || []).find((u) => u.id === id) || {}).name || 'Colega';
  const send = (to, type, callId, kind, data) => api('/api/calls/signal', { method: 'POST', body: JSON.stringify({ to, type, callId, kind, data }) }).catch(() => {});

  // ---------- botões no chat privado ----------
  function paintButtons() {
    const head = document.querySelector('#view-chatequipe .comms-chat-header'); if (!head) return;
    let box = head.querySelector('.call-actions');
    if (!box) {
      box = document.createElement('div'); box.className = 'call-actions';
      box.innerHTML = `<button type="button" class="btn-secondary btn-sm" data-call="audio" title="Ligar só com voz">Ligar</button>
        <button type="button" class="btn-secondary btn-sm" data-call="video" title="Chamada de vídeo">Vídeo</button>
        <button type="button" class="btn-secondary btn-sm" data-call="screen" title="Chamar e compartilhar a sua tela">Compartilhar tela</button>`;
      head.appendChild(box);
      box.addEventListener('click', (e) => { const b = e.target.closest('[data-call]'); if (b) startCall(b.dataset.call); });
    }
    const target = window.state.teamChatTarget; const me = window.state.me;
    box.style.display = target && me && me.role !== 'matriz' ? 'flex' : 'none';
  }

  // ---------- janela da chamada ----------
  function overlay() {
    let o = $('call-overlay'); if (o) return o;
    o = document.createElement('div'); o.id = 'call-overlay'; o.className = 'call-overlay'; o.hidden = true;
    o.innerHTML = `<div class="call-box" role="dialog" aria-label="Chamada">
      <div class="call-head"><b id="call-title">Chamada</b><span id="call-status">Chamando...</span></div>
      <div class="call-stage"><video id="call-remote" autoplay playsinline></video><video id="call-local" autoplay playsinline muted></video><div class="call-avatar" id="call-avatar"></div></div>
      <div class="call-bar">
        <button type="button" class="btn-secondary" id="call-mic">Mudo</button>
        <button type="button" class="btn-secondary" id="call-cam">Câmera</button>
        <button type="button" class="btn-secondary" id="call-screen">Compartilhar tela</button>
        <button type="button" class="btn-danger" id="call-end">Desligar</button>
      </div>
      <p class="call-note">Controle remoto do computador do colega não funciona pelo navegador. Compartilhe a tela e, se precisar mexer na máquina dele, use o <a href="https://remotedesktop.google.com/support" target="_blank" rel="noopener">Chrome Remote Desktop</a>.</p>
    </div>`;
    document.body.appendChild(o);
    $('call-mic').onclick = toggleMic; $('call-cam').onclick = toggleCam; $('call-screen').onclick = toggleScreen; $('call-end').onclick = () => endCall(true);
    return o;
  }
  function showOverlay(status) { const o = overlay(); o.hidden = false; $('call-title').textContent = C ? peerName(C.peer) : 'Chamada'; $('call-avatar').textContent = C ? (peerName(C.peer)[0] || '?') : ''; if (status) $('call-status').textContent = status; }
  function setStatus(t) { const e = $('call-status'); if (e) e.textContent = t; }

  // ---------- toque ----------
  function ring(on) {
    try {
      if (!on) { clearInterval(ringTimer); ringTimer = null; return; }
      if (ringTimer) return;
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; ringCtx = ringCtx || new AC();
      const beep = () => { const o = ringCtx.createOscillator(); const g = ringCtx.createGain(); o.frequency.value = 520; g.gain.value = 0.06; o.connect(g); g.connect(ringCtx.destination); o.start(); o.stop(ringCtx.currentTime + 0.25); };
      beep(); ringTimer = setInterval(beep, 1400);
    } catch (e) { /* sem áudio de toque */ }
  }

  // ---------- mídia e conexão ----------
  async function getMedia(kind) {
    const media = { audio: null, video: null, screen: null };
    try { media.audio = (await navigator.mediaDevices.getUserMedia({ audio: true })).getAudioTracks()[0]; } catch (e) { toast('Não consegui usar o microfone. Libere a permissão no navegador.'); }
    if (kind === 'video') { try { media.video = (await navigator.mediaDevices.getUserMedia({ video: true })).getVideoTracks()[0]; } catch (e) { toast('Não consegui usar a câmera. Seguindo só com voz.'); } }
    if (kind === 'screen') { try { media.screen = (await navigator.mediaDevices.getDisplayMedia({ video: true })).getVideoTracks()[0]; } catch (e) { toast('Compartilhamento de tela cancelado.'); } }
    return media;
  }
  function makePeer() {
    const pc = new RTCPeerConnection(ice);
    const remote = new MediaStream(); $('call-remote').srcObject = remote;
    pc.ontrack = (ev) => { remote.addTrack(ev.track); $('call-remote').play && $('call-remote').play().catch(() => {}); };
    pc.onicecandidate = (ev) => { if (ev.candidate && C) send(C.peer, 'ice', C.id, C.kind, ev.candidate.toJSON()); };
    pc.onconnectionstatechange = () => {
      if (!C) return;
      if (pc.connectionState === 'connected') { C.connected = true; setStatus('Em chamada'); startTimer(); }
      if (['failed'].includes(pc.connectionState)) { setStatus('Falha na conexão (rede da empresa pode bloquear). Tente de novo.'); }
      if (['disconnected', 'closed'].includes(pc.connectionState) && C.connected) endCall(false);
    };
    return pc;
  }
  function startTimer() { if (!C || C.timer) return; const t0 = Date.now(); C.timer = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); setStatus(`Em chamada · ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`); }, 1000); }
  function attachLocal() {
    const m = C.media; const stream = new MediaStream();
    const v = m.screen || m.video; if (v) stream.addTrack(v);
    $('call-local').srcObject = stream; $('call-local').style.display = v ? 'block' : 'none';
    $('call-cam').style.display = m.video ? '' : 'none';
  }
  async function bindTracks(pc) {
    const m = C.media; const tr = pc.getTransceivers();
    let at = tr.find((t) => t.receiver.track && t.receiver.track.kind === 'audio'); let vt = tr.find((t) => t.receiver.track && t.receiver.track.kind === 'video');
    if (!at) at = pc.addTransceiver('audio', { direction: 'sendrecv' }); if (!vt) vt = pc.addTransceiver('video', { direction: 'sendrecv' });
    at.direction = 'sendrecv'; vt.direction = 'sendrecv';
    if (m.audio) await at.sender.replaceTrack(m.audio);
    const v = m.screen || m.video; if (v) await vt.sender.replaceTrack(v);
    C.vsender = vt.sender; C.asender = at.sender;
    attachLocal();
  }

  async function startCall(kind) {
    const peer = window.state.teamChatTarget; if (!peer) return toast('Abra uma conversa privada para ligar.');
    if (C) return toast('Você já está em uma chamada.');
    if (!window.isSecureContext) return toast('Chamadas só funcionam em página segura (https).');
    C = { id: newId(), peer, kind, role: 'caller', media: {}, pend: [], connected: false };
    showOverlay('Chamando ' + peerName(peer) + '...');
    C.media = await getMedia(kind);
    if (!C.media.audio) { cleanup(); return; }
    attachLocal();
    try { ice = await api('/api/calls/ice'); } catch (e) { /* usa o padrão */ }
    send(peer, 'invite', C.id, kind, null);
    C.ringTimeout = setTimeout(() => { if (C && !C.connected) { toast(peerName(peer) + ' não atendeu.'); endCall(true); } }, 45000);
  }

  async function onSignal(m) {
    if (m.type === 'invite') {
      if (C) { send(m.from, 'decline', m.callId, m.kind, { reason: 'busy' }); return; }
      C = { id: m.callId, peer: m.from, kind: m.kind, role: 'callee', media: {}, pend: [], connected: false, ringing: true };
      showOverlay(`${m.fromName} está chamando (${{ audio: 'voz', video: 'vídeo', screen: 'compartilhando a tela' }[m.kind]})`);
      const bar = overlay().querySelector('.call-bar'); bar.classList.add('ringing'); $('call-end').textContent = 'Recusar';
      let acc = $('call-accept'); if (!acc) { acc = document.createElement('button'); acc.id = 'call-accept'; acc.type = 'button'; acc.className = 'btn-primary'; acc.textContent = 'Atender'; bar.prepend(acc); }
      acc.style.display = ''; acc.onclick = acceptCall; ring(true);
      return;
    }
    if (!C || m.callId !== C.id) return;
    if (m.type === 'accept' && C.role === 'caller') {
      clearTimeout(C.ringTimeout); setStatus('Conectando...');
      C.pc = makePeer(); await bindTracks(C.pc);
      const offer = await C.pc.createOffer(); await C.pc.setLocalDescription(offer);
      send(C.peer, 'offer', C.id, C.kind, { type: offer.type, sdp: offer.sdp });
    } else if (m.type === 'offer' && C.role === 'callee') {
      await C.pc.setRemoteDescription(m.data); await flushIce();
      await bindTracks(C.pc);
      const ans = await C.pc.createAnswer(); await C.pc.setLocalDescription(ans);
      send(C.peer, 'answer', C.id, C.kind, { type: ans.type, sdp: ans.sdp });
    } else if (m.type === 'answer' && C.role === 'caller') {
      await C.pc.setRemoteDescription(m.data); await flushIce();
    } else if (m.type === 'ice') {
      if (C.pc && C.pc.remoteDescription) { try { await C.pc.addIceCandidate(m.data); } catch (e) { /* candidato antigo */ } } else C.pend.push(m.data);
    } else if (m.type === 'decline') { toast(m.data && m.data.reason === 'busy' ? `${peerName(C.peer)} está em outra chamada.` : `${peerName(C.peer)} recusou a chamada.`); cleanup(); }
    else if (m.type === 'end') { toast('A chamada terminou.'); cleanup(); }
  }
  async function flushIce() { while (C && C.pend.length) { try { await C.pc.addIceCandidate(C.pend.shift()); } catch (e) { /* ignora */ } } }

  async function acceptCall() {
    if (!C || !C.ringing) return; ring(false); C.ringing = false;
    const acc = $('call-accept'); if (acc) acc.style.display = 'none'; $('call-end').textContent = 'Desligar'; overlay().querySelector('.call-bar').classList.remove('ringing'); setStatus('Conectando...');
    C.media = await getMedia(C.kind === 'screen' ? 'audio' : C.kind);
    if (!C.media.audio) { send(C.peer, 'decline', C.id, C.kind, { reason: 'media' }); cleanup(); return; }
    try { ice = await api('/api/calls/ice'); } catch (e) { /* padrão */ }
    C.pc = makePeer(); attachLocal();
    send(C.peer, 'accept', C.id, C.kind, null);
  }

  async function toggleMic() { if (!C || !C.media.audio) return; C.media.audio.enabled = !C.media.audio.enabled; $('call-mic').textContent = C.media.audio.enabled ? 'Mudo' : 'Ativar som'; }
  async function toggleCam() { if (!C || !C.media.video) return; C.media.video.enabled = !C.media.video.enabled; $('call-cam').textContent = C.media.video.enabled ? 'Câmera' : 'Ligar câmera'; }
  async function toggleScreen() {
    if (!C || !C.vsender) return toast('Espere a chamada conectar.');
    if (C.media.screen) { C.media.screen.stop(); await stopScreen(); return; }
    try {
      const track = (await navigator.mediaDevices.getDisplayMedia({ video: true })).getVideoTracks()[0];
      C.media.screen = track; await C.vsender.replaceTrack(track); attachLocal(); $('call-screen').textContent = 'Parar de compartilhar';
      track.onended = () => stopScreen();
    } catch (e) { toast('Compartilhamento de tela cancelado.'); }
  }
  async function stopScreen() { if (!C) return; C.media.screen = null; try { await C.vsender.replaceTrack(C.media.video || null); } catch (e) { /* ignora */ } attachLocal(); $('call-screen').textContent = 'Compartilhar tela'; }

  function endCall(notify) { if (C && notify) send(C.peer, 'end', C.id, C.kind, null); cleanup(); }
  function cleanup() {
    ring(false);
    if (C) {
      clearTimeout(C.ringTimeout); clearInterval(C.timer);
      Object.values(C.media || {}).forEach((t) => { try { t && t.stop(); } catch (e) { /* ok */ } });
      try { C.pc && C.pc.close(); } catch (e) { /* ok */ }
    }
    C = null;
    const o = $('call-overlay'); if (o) { o.hidden = true; const r = $('call-remote'); if (r) r.srcObject = null; const l = $('call-local'); if (l) l.srcObject = null; const acc = $('call-accept'); if (acc) acc.style.display = 'none'; $('call-end').textContent = 'Desligar'; $('call-mic').textContent = 'Mudo'; $('call-cam').textContent = 'Câmera'; $('call-screen').textContent = 'Compartilhar tela'; o.querySelector('.call-bar').classList.remove('ringing'); }
  }

  async function poll() {
    if (document.hidden) return;
    try { const list = await api('/api/calls/poll'); for (const m of list) await onSignal(m); } catch (e) { /* sem rede */ }
  }

  window.addEventListener('crm-ready', () => {
    const me = window.state && window.state.me; if (!me || me.role === 'matriz') return;
    poller = setInterval(poll, 2000); poll();
    const nm = $('team-chat-target-name'); if (nm) new MutationObserver(paintButtons).observe(nm, { childList: true, characterData: true, subtree: true });
    setInterval(paintButtons, 1500); paintButtons();
    window.__callsTest = { get state() { return C; }, startCall };
  });
  window.addEventListener('beforeunload', () => { if (C) endCall(true); });
})();
