  // ---------- 알림 ----------
  function ensurePermission() {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') Notification.requestPermission();
  }
  let sharedCtx = null;
  let lastSoundAt = 0;
  function playAlertSound() {
    try {
      const nowMs = Date.now();
      if (nowMs - lastSoundAt < 800) return; // 도배 시 사운드 스킵 (CPU/컨텍스트 보호)
      lastSoundAt = nowMs;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!sharedCtx || sharedCtx.state === 'closed') sharedCtx = new Ctx();
      const ctx = sharedCtx;
      if (ctx.state === 'suspended') ctx.resume();
      const now = ctx.currentTime;
      // 두 번 짧게 삑삑 울리는 알림음
      [0, 0.16].forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.35, now + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.14);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.16);
      });
    } catch (e) {}
  }

  function highlightMessage(el) {
    if (!el) return;
    el.classList.remove('__kw_hl_fade');
    el.classList.add('__kw_hl');
    requestAnimationFrame(() => {
      setTimeout(() => el.classList.add('__kw_hl_fade'), 800);
      setTimeout(() => el.classList.remove('__kw_hl', '__kw_hl_fade'), 3300);
    });
  }

  // 본문 앞에 붙은 발신자명을 떼어냄 (DOM은 "닉넴+본문"이 붙어있고 WS는 "닉 본문" 형태)
  function splitBody(nick, text) {
    const t = text || '';
    if (nick && t.startsWith(nick)) {
      const rest = t.slice(nick.length).trim();
      if (rest) return rest;
    }
    return t;
  }
  function fireAlert(nick, text, el, kw) {
    const body = splitBody(nick, text);
    const title = nick ? '🔔 ' + nick : '🔔 CHZZK 채팅 호출';
    kwEmit('hit', { nick: nick || '', text: body, kw: kw || '', el: el || null });
    if (!muted()) {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          // 다른 탭을 보고 있어도 놓치지 않도록: 겹치지 않는 태그 + 직접 닫을 때까지 유지 + 클릭 시 창 포커스
          const n = new Notification(title, { body: body.slice(0, 120), tag: 'kw-' + Date.now() + '-' + Math.floor(Math.random() * 1e6), requireInteraction: true });
          n.onclick = () => { try { window.focus(); } catch (e) {} try { n.close(); } catch (e2) {} };
        } catch (e) {}
      }
      showCallToast(nick, body);
      playAlertSound();
    }
    highlightMessage(el);
  }
  // 백그라운드 탭에서도 소리가 나도록: 첫 제스처 때 오디오를 미리 깨워둠
  function unlockAudio() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!sharedCtx || sharedCtx.state === 'closed') sharedCtx = new Ctx();
      if (sharedCtx.state === 'suspended') sharedCtx.resume();
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission();
    } catch (e) {}
  }
  // 토스트 박스는 스택 맨 위(목록 위, 동일 너비)에 두고 비면 숨김
  // 토스트 위치: 전체화면 중이면 비디오 안, 아니면 스택 맨 위(목록 위, 동일 너비)
  function toastTarget() {
    try { if (document.fullscreenElement) return document.fullscreenElement; } catch (e) {}
    try {
      const s = document.getElementById('__kw_stack');
      if (s) return s;
    } catch (e) {}
    return document.body;
  }
  function placeToastBox(box) {
    if (!box) return;
    try {
      const fsEl = document.fullscreenElement || null;
      const target = toastTarget() || document.body;
      if (box.parentElement !== target) {
        if (target.id === '__kw_stack') target.prepend(box);
        else target.appendChild(box);
      }
      if (box.classList) box.classList.toggle('fs', !!fsEl);
    } catch (e) {}
  }
  let fsListenerAdded = false;
  function setupFsReloc() {
    if (fsListenerAdded) return;
    fsListenerAdded = true;
    try {
      document.addEventListener('fullscreenchange', () => {
        try {
          const box = document.getElementById('__kw_box');
          if (box && box.children.length) placeToastBox(box);
        } catch (e) {}
      });
    } catch (e) {}
  }
  function ensureToastBox() {
    let box = null;
    try { box = document.getElementById('__kw_box'); } catch (e) {}
    if (!box) {
      box = document.createElement('div');
      box.id = '__kw_box';
    }
    placeToastBox(box);
    box.style.display = 'flex';
    return box;
  }
  function hideBoxIfEmpty() {
    try {
      const box = document.getElementById('__kw_box');
      if (box && box.children.length === 0) box.style.display = 'none';
    } catch (e) {}
  }
  function showCallToast(nick, body) {
    const box = ensureToastBox();
    if (!box) return;
    // 도배 시 DOM 비대화 방지: 최대 5개 유지
    while (box.children.length >= 5) box.firstChild?.remove();
    const t = document.createElement('div');
    t.className = '__kw_toast';
    t.innerHTML = '<b>🔔 ' + escapeHtml((nick || 'CHZZK').slice(0, 24)) + '</b><span style="font-weight:normal">: ' + escapeHtml((body || '').slice(0, 60)) + '</span>';
    t.onclick = () => { t.remove(); hideBoxIfEmpty(); };
    box.appendChild(t);
    setTimeout(() => { t.remove(); hideBoxIfEmpty(); }, 5000);
  }
  function showToast(text) {
    const box = ensureToastBox();
    if (!box) return;
    // 도배 시 DOM 비대화 방지: 최대 5개 유지
    while (box.children.length >= 5) box.firstChild?.remove();
    const t = document.createElement('div');
    t.className = '__kw_toast';
    t.textContent = '🔔 ' + text.slice(0, 80);
    t.onclick = () => { t.remove(); hideBoxIfEmpty(); };
    box.appendChild(t);
    setTimeout(() => { t.remove(); hideBoxIfEmpty(); }, 5000);
  }
