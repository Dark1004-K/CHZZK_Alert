'use strict';

// ---------- 알림 ----------
function ensurePermission() {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'default') Notification.requestPermission();
}
let sharedCtx = null;
let lastSoundAt = 0;
function getCtx() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedCtx || sharedCtx.state === 'closed') { sharedCtx = new Ctx(); applySink(sharedCtx); }
  if (sharedCtx.state === 'suspended') sharedCtx.resume();
  return sharedCtx;
}
// 딩동: 높은 음 → 낮은 음, 기본음에 배음을 얹어 종소리 느낌
function playDingDong() {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const vf = volPct() / 100;
    [[987.77, 0], [783.99, 0.3]].forEach(([f, o]) => {
      [[1, 0.3], [2.01, 0.08]].forEach(([mul, vol]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = f * mul;
        gain.gain.setValueAtTime(0.0001, now + o);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * vf), now + o + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + o + 0.9);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + o);
        osc.stop(now + o + 0.95);
      });
    });
  } catch (e) {}
}
function playCustomSound() {
  try {
    const d = localStorage.getItem(LS_SND_DATA);
    if (!d) return false;
    const a = new Audio(d);
    a.volume = volPct() / 100;
    applySink(a);
    const p = a.play();
    if (p && p.catch) p.catch(() => playDingDong());
    return true;
  } catch (e) { return false; }
}
function playAlertSound() {
  try {
    const nowMs = Date.now();
    if (volPct() === 0) return;
    if (nowMs - lastSoundAt < 800) return; // 도배 시 사운드 스킵 (CPU/컨텍스트 보호)
    lastSoundAt = nowMs;
    if (sndMode() === 'custom' && playCustomSound()) return;
    playDingDong();
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
        const n = new Notification(title, { body: body.slice(0, 120), tag: 'kw-' + Date.now() + '-' + Math.floor(Math.random() * 1e6), requireInteraction: true, silent: true });
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
    if (!sharedCtx || sharedCtx.state === 'closed') { sharedCtx = new Ctx(); applySink(sharedCtx); }
    if (sharedCtx.state === 'suspended') sharedCtx.resume();
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission();
  } catch (e) {}
}
// 토스트 박스는 스택 맨 위(목록 위, 동일 너비)에 두고 비면 숨김
// 토스트 위치: 전체화면 중이면 비디오 안, 아니면 스택 맨 위(목록 위, 동일 너비)
function toastTarget() {
  try { if (document.fullscreenElement) return document.fullscreenElement; } catch (e) {}
  try {
    // 평소: 녹색 창 오른쪽(설정 창이 열리는 자리)에 길게 붙인다. 없으면 예전처럼 스택 맨 위.
    const m = document.getElementById('__kw_midrow');
    if (m) return m;
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
    // 녹색 창 옆에 붙일 때: 설정 창·확장 창(옮겨 놓은 곳 포함)·옵션 창과 겹치면 그 바로 위로, 화면 오른쪽을 넘지 않게 폭 제한
    if (target.id === '__kw_midrow' && !fsEl) {
      const r = target.getBoundingClientRect();
      box.style.maxWidth = Math.max(220, window.innerWidth - r.right - 8 - 14) + 'px';
      box.style.bottom = '0';
      const obs = ['__kw_setp', '__kw_bdo_grp', '__kw_bdo_party', '__kw_optwin'].map((id) => document.getElementById(id)).filter((el) => {
        if (!el || el.style.display === 'none') return false;
        const q = el.getBoundingClientRect();
        return q.width > 20 && q.height > 20;
      });
      let b = 0;
      for (let i = 0; i < 6 && obs.length; i++) { // 겹치는 창이 있으면 그 위로 올린다 (여러 개면 반복)
        const bw = box.offsetWidth, bh = box.offsetHeight;
        const bl = r.right + 8, bt = r.bottom - b - bh, bb = r.bottom - b, br = bl + bw;
        let hit = null;
        for (const el of obs) {
          const q = el.getBoundingClientRect();
          if (q.left < br && q.right > bl && q.top < bb && q.bottom > bt) { if (!hit || q.top < hit.top) hit = q; }
        }
        if (!hit) break;
        b = Math.max(b, r.bottom - hit.top + 8);
        box.style.bottom = b + 'px';
      }
    } else {
      box.style.bottom = '';
      box.style.maxWidth = '';
    }
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
  t.innerHTML = '<b>🔔 ' + escapeHtml((nick || 'CHZZK').slice(0, 24)) + '</b><span style="font-weight:normal">: ' + escapeHtml((body || '').slice(0, 120)) + '</span>';
  t.onclick = () => { t.remove(); hideBoxIfEmpty(); };
  box.appendChild(t);
  setTimeout(() => { t.remove(); hideBoxIfEmpty(); }, TOAST_MS);
}
const TOAST_MS = 5000;
function showToast(text) {
  const box = ensureToastBox();
  if (!box) return;
  // 도배 시 DOM 비대화 방지: 최대 5개 유지
  while (box.children.length >= 5) box.firstChild?.remove();
  const t = document.createElement('div');
  t.className = '__kw_toast';
  t.textContent = '🔔 ' + text.slice(0, 120);
  t.onclick = () => { t.remove(); hideBoxIfEmpty(); };
  box.appendChild(t);
  setTimeout(() => { t.remove(); hideBoxIfEmpty(); }, 5000);
}

// ---------- 불린 대화 목록 (저장/표시/클릭 이동) ----------
function saveHits() {
  try {
    localStorage.setItem(LS_HITS_CID, pageChannelId());
    localStorage.setItem(LS_HITS, JSON.stringify(
      hitLog.slice(0, HITS_MAX).map(({ t, nick, text, kw, sig, gone }) => ({ t, nick, text, kw, sig, gone: !!gone }))
    ));
  } catch (e) {}
}
function fmtTime(t) {
  try { return new Date(t).toTimeString().slice(0, 8); } catch (e) { return ''; }
}
function recordHit(nick, text, kw, sig, el) {
  rememberSig(sig);
  if (!histOn() && !dedupOn()) return;
  hitLog.unshift({ t: Date.now(), nick: nick || '', text: (text || '').slice(0, 120), kw, sig, el: el || null });
  while (hitLog.length > HITS_MAX) hitLog.pop();
  saveHits();
  renderHitsList();
}
// 목록 표시용: 본문 속 검출 단어만 노란색으로 (대소문자 무시, 여러 번 출현 전부)
function hiKw(text, kw) {
  const t = text || '';
  if (!kw) return escapeHtml(t);
  const low = t.toLowerCase();
  const keys = [];
  for (const k of [kw, norm(kw)]) { if (k && !keys.includes(k)) keys.push(k); }
  let best = -1, bestK = '';
  for (const k of keys) {
    const i = low.indexOf(k.toLowerCase());
    if (i >= 0 && (best < 0 || i < best)) { best = i; bestK = k; }
  }
  if (best < 0) return escapeHtml(t);
  const kl = bestK.toLowerCase();
  const parts = [];
  let pos = 0;
  for (;;) {
    const i = low.indexOf(kl, pos);
    if (i < 0) { parts.push(escapeHtml(t.slice(pos))); break; }
    parts.push(escapeHtml(t.slice(pos, i)));
    parts.push('<span class="__kw_hit_kw">' + escapeHtml(t.slice(i, i + bestK.length)) + '</span>');
    pos = i + bestK.length;
  }
  return parts.join('');
}
function renderHitsList() {
  if (histCount) histCount.textContent = String(hitLog.length);
  if (!histBox || !histBox.isConnected) return;
  if (!histOn()) { histBox.innerHTML = ''; return; }
  // 오래된 것이 위, 최신이 아래(역순). 맨 아래를 보고 있었거나 처음이면 최신으로 스크롤한다.
  const stick = histBox.dataset.init !== '1' || histBox.scrollHeight - histBox.scrollTop - histBox.clientHeight < 8;
  histBox.innerHTML = hitLog.length ? hitLog.map((h, i) => ({ h, i })).reverse().map(({ h, i }) => {
    const body = splitBody(h.nick, h.text) || h.text;
    const nickHtml = h.nick ? `<b>${escapeHtml(h.nick)}</b> ` : '';
    return `<div class="__kw_hit${h.gone ? ' gone' : ''}" data-i="${i}" title="클릭하면 해당 채팅으로 이동"><div class="__kw_hit_t">${fmtTime(h.t)}</div><div>${nickHtml}<span>${hiKw(body, h.kw)}</span>${h.gone ? '<span class="__kw_hit_gone">사라짐</span>' : ''}</div></div>`;
  }).join('') : '<div style="font-size:11px;color:#666">아직 없음</div>';
  histBox.dataset.init = '1';
  if (stick) { histBox.scrollTop = histBox.scrollHeight; requestAnimationFrame(() => { try { histBox.scrollTop = histBox.scrollHeight; } catch (e) {} }); }
}
function jumpToHit(i) {
  const h = hitLog[i];
  if (!h) return;
  // 원본이 살아있으면 그대로, 밀려났으면 같은 서명의 노드를 다시 찾아 채택.
  // 가상리스트에서 잠시 내려간 경우도 있어 못 찾았다고 지우지 않고 표시만 함.
  const el = (h.el && h.el.isConnected) ? h.el : findElBySig(h.sig, h.kw);
  if (el) {
    h.el = el;
    if (h.gone) { h.gone = false; saveHits(); }
    try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    catch (e) { try { el.scrollIntoView(); } catch (e2) {} }
    highlightMessage(el);
    renderHitsList();
    dlog('jump', JSON.stringify({ i, text: (h.text || '').slice(0, 40) }));
    return;
  }
  if (!h.gone) { h.gone = true; saveHits(); }
  renderHitsList();
  showToast('현재 화면에 없음 (목록 유지)' + (h.text ? ': ' + h.text.slice(0, 30) : ''));
  dlog('jump-gone', JSON.stringify({ i }));
}
function findElBySig(sig, kw) {
  if (!sig) return null;
  try {
    const list = document.querySelectorAll('[class*="chatting_message"]');
    for (const el of list) {
      if (!(el instanceof HTMLElement)) continue;
      if (hitSig(el.textContent || '') + '|' + kw === sig) return el;
    }
  } catch (e) {}
  return null;
}

// ---------- 채팅 감시 ----------
// 현재 페이지의 라이브 채널 ID (32자리 hex). 인가 목록과 대조한다.
const pageChannelId = () => {
  try { const m = location.pathname.match(/\/live\/([0-9a-f]{32})/i); return m ? m[1].toLowerCase() : ''; } catch (e) { return ''; }
};
const isLivePage = () => !!pageChannelId();
// 페이지에 보이는 채널명. 채널 프로필 링크(`/채널ID`) 텍스트 우선, 없으면 탭 제목 첫 토막.
const cleanChName = (t) => (t || '').replace(/\s*채널로 이동\s*/g, '').replace(/\s*LIVE\s*$/, '').trim();
const getPageChannelName = () => {
  const cid = pageChannelId();
  try {
    if (cid) {
      const a = document.querySelector('a[href="/' + cid + '"]') || document.querySelector('a[href$="/' + cid + '"]');
      if (a) {
        const n = cleanChName(a.textContent);
        if (n) return n;
      }
    }
  } catch (e) {}
  try {
    const t = (document.title || '').split(' - ')[0].trim();
    if (t && t !== '치지직' && !/CHZZK/i.test(t)) return t;
  } catch (e) {}
  return '';
};
// 등록명-페이지명 비교 (공백 제거/소문자 정규화 양쪽 시도)
const sameName = (a, b) => {
  if (!a || !b) return false;
  if (norm(a) === norm(b)) return true;
  const la = normLoose(a), lb = normLoose(b);
  return !!la && la === lb;
};

// 우리 자체 UI(패널/프롬프트/토스트/선택버튼)에서 발생한 변화는 절대 관리하지 않아야 무한루프를 막을 수 있음
const isOwnUi = (node) =>
  node.id && ['__kw_panel', '__kw_ask', '__kw_box', '__kw_sel', '__kw_stack', '__kw_histp', '__kw_setp', '__kw_midrow', '__kw_grip'].includes(node.id);

let statsRaf = null;
function scheduleStatsUpdate() {
  if (statsRaf) return;
  statsRaf = requestAnimationFrame(() => {
    statsRaf = null;
    updateStatsText();
  });
}

// 이미 목록/기억(최대 400개)에 있는 호출이 DOM에 다시 나타났을 때의 처리.
// 채팅창은 보이는 일부만 DOM에 두고 스크롤하면 옛 메시지를 위/아래에 다시 그리므로, DOM에서 본 것만으로는 새 메시지인지 알 수 없다.
// 실시간 새 메시지는 WS로 먼저 들어오므로, WS가 동작 중이면 기억에 있는 호출은 DOM 경로에서 항상 무시한다.
// WS를 못 쓰는 경우(제한 모드 등)에만 맨 아래에 새로 붙은 것은 새 메시지로 인정한다.
function domRepeatBlocked(sig, el) {
  try {
    if (!alreadyListed(sig)) return false;
    if (limitedMode || !wsTracked) return !!el.nextElementSibling;
    return true;
  } catch (e) { return false; }
}
function scanSingle(el) {
  if (!(el instanceof HTMLElement)) return false;
  if (seen.has(el)) return false;
  seen.add(el);
  checked++;
  const text = el.textContent || '';
  // 발신자 닉네임만 따로 뽑아 비교한다. (기존 버그: 메시지 "본문"에 내 닉네임 글자가
  // 포함되기만 해도 "내 채팅"으로 오인해서 걸러버렸음 → 남이 정확히 내 닉네임으로
  // 불러도 감지가 안 됐던 원인. 반드시 "보낸 사람"이 나일 때만 제외하도록 수정.)
  const nickBtn = el.querySelector('button[class*="_nickname_"], [class*="nickname"]');
  const senderName = nickBtn ? (nickBtn.textContent || '') : '';
  const isMine = normMyNick && norm(senderName) === normMyNick;
  if (isMine) return true; // 확인 카운트는 올리되 알림만 제외
  // 1차: 공백 유지 매칭 (경계 보호) — "그런데 아"는 "데아"와 다름
  const tl = normLoose(text);
  // 2차용: 어절 단위 타이트 토큰 (같은 어절 안에서만 공백무시 매칭 허용)
  let tightTokens = null; // 필요할 때만 계산 (지연 평가로 CPU 절감)
  for (const { tight: kt, loose: kl } of kwCache) {
    if (kl && tl.includes(kl)) {
      const sig = hitSig(text) + '|' + kt;
      // 기록에 있는 건 경로/시점 불문 재알림 생략 (스크롤 백필·접힘 리렌더·WS 리플레이 대응)
      if (histSuppressed(sig)) { dlog('DUP-hist-skip', JSON.stringify({ kw: kl })); break; }
      if (domRepeatBlocked(sig, el)) { dlog('DUP-scroll-skip', JSON.stringify({ kw: kl })); break; }
      if (!takeHit(sig)) { dlog('DUP-dom-skip', JSON.stringify({ kw: kl })); break; }
      if (isQuietNow()) { // 다시 그려진 옛 채팅 등: 울리지 않고, 목록에 같은 내용이 없을 때만 추가
        if (!alreadyListed(sig)) { hits++; recordHit(senderName, text, kl, sig, el); dlog('HIT-quiet-dom', JSON.stringify({ kw: kl })); }
        break;
      }
      hits++;
      recordHit(senderName, text, kl, sig, el);
      dlog('HIT-loose', JSON.stringify({ kw: kl, nick: senderName.slice(0, 30), text: text.slice(0, 60) }));
      fireAlert(senderName, text, el, kl);
      break;
    }
    // 1차가 실패하면 같은 어절 안에서만 타이트 매칭 시도.
    // 예: 키워드 "데아" vs "데아님ㅋㅋ" → 토큰 "데아님ㅋㅋ"가 "데아" 포함 → 검출 O
    // 예: 키워드 "데아" vs "그런데 아~~" → 토큰 "그런데"/"아~~" 어디에도 "데아" 없음 → 검출 X
    if (!tightTokens) {
      tightTokens = tl.split(' ').map((t) => norm(t)).filter(Boolean);
      if (tightTokens.length === 0) break;
    }
    let inToken = false;
    for (const tt of tightTokens) {
      if (tt.includes(kt)) { inToken = true; break; }
    }
    if (inToken) {
      const sig = hitSig(text) + '|' + kt;
      if (histSuppressed(sig)) { dlog('DUP-hist-skip', JSON.stringify({ kw: kt })); break; }
      if (domRepeatBlocked(sig, el)) { dlog('DUP-scroll-skip', JSON.stringify({ kw: kt })); break; }
      if (!takeHit(sig)) { dlog('DUP-dom-skip', JSON.stringify({ kw: kt })); break; }
      if (isQuietNow()) {
        if (!alreadyListed(sig)) { hits++; recordHit(senderName, text, kt, sig, el); dlog('HIT-quiet-dom', JSON.stringify({ kw: kt })); }
        break;
      }
      hits++;
      recordHit(senderName, text, kt, sig, el);
      dlog('HIT-token', JSON.stringify({ kw: kt, nick: senderName.slice(0, 30), text: text.slice(0, 60) }));
      fireAlert(senderName, text, el, kt);
      break;
    }
  }
  return true;
}

function scanNode(node) {
  if (!(node instanceof HTMLElement)) return;
  if (isOwnUi(node) || node.closest?.('#__kw_panel,#__kw_ask,#__kw_box,#__kw_sel,#__kw_stack,#__kw_histp,#__kw_setp,#__kw_midrow,#__kw_grip')) return;
  // 가장 흔한 경로: 추가된 노드 자체가 메시지 1개
  if (node.matches?.('[class*="chatting_message"]')) {
    if (scanSingle(node)) scheduleStatsUpdate();
    return;
  }
  if (!node.querySelectorAll) return;
  // 자식이 적으면 전체 querySelectorAll 대신 자식만 훑어서 비용 절감
  if (node.childElementCount <= 3) {
    let changed = false;
    for (const child of node.children) {
      if (!(child instanceof HTMLElement)) continue;
      if (child.matches?.('[class*="chatting_message"]')) {
        if (scanSingle(child)) changed = true;
      } else if (child.querySelectorAll) {
        const found = child.querySelectorAll('[class*="chatting_message"]');
        for (const el of found) { if (scanSingle(el)) changed = true; }
      }
    }
    if (changed) scheduleStatsUpdate();
    return;
  }
  const list = node.querySelectorAll('[class*="chatting_message"]');
  if (list.length === 0) return;
  let changed = false;
  for (const el of list) { if (scanSingle(el)) changed = true; }
  if (changed) scheduleStatsUpdate();
}

// 채팅 메시지 요소에서 위로 올라가며 실제 채팅 목록을 감싸는 컨테이너를 찾는다.
// document.body 전체를 감시하면 타이머/시청자수/영상 플레이어 등 무관한 변화까지 다 감지되어 CPU를 과도하게 쓰게 된다.
function findChatContainer() {
  const msg = document.querySelector('[class*="chatting_message"]');
  if (!msg) return null;
  let node = msg.parentElement;
  for (let i = 0; i < 6 && node && node !== document.body; i++) {
    if (node.children.length > 3) return node; // 여러 채팅 아이템을 가진 목록 컨테이너로 판단
    node = node.parentElement;
  }
  return msg.parentElement;
}

let watchedContainer = null;
let containerCheckTimer = null;

function attachObserverTo(container) {
  if (!container || container === document.body) return; // body 전체 감시 금지 (CPU 폭증 원인)
  if (container === watchedContainer && observer) return;
  if (observer) observer.disconnect();
  watchedContainer = container;
  dlog('attach', JSON.stringify({ kids: container.children?.length ?? -1, dom: domMsgCount(), folded: isChatFolded() }));
  observer = new MutationObserver((muts) => {
    mutBatches++;
    for (const m of muts) {
      // 패널/프롬프트 자체의 변화는 무시 (무한루프 방지)
      if (m.target && (isOwnUi(m.target) || m.target.closest?.('#__kw_panel,#__kw_ask,#__kw_box,#__kw_sel,#__kw_stack,#__kw_histp,#__kw_setp,#__kw_midrow,#__kw_grip'))) continue;
      for (const n of m.addedNodes) {
        if (!(n instanceof HTMLElement)) continue; // 텍스트노드 스킵
        mutNodes++;
        scanNode(n);
      }
    }
  });
  observer.observe(container, { childList: true, subtree: true });
}

// ---------- 채널 인가 (allowlist.json, git에서 관리) ----------
// 강제력은 없음(클라이언트 코드라 고치면 우회됨). 정직한 사용자용 관리 + 원격 킬스위치.
const ALLOW_URL = 'https://raw.githubusercontent.com/Dark1004-K/Chzzk_Alert/main/allowlist.json';
const LS_ALLOW = '__kw_allow';
let allowState = 'pending'; // pending | ok | denied
function readAllowCache() {
  try {
    const o = JSON.parse(localStorage.getItem(LS_ALLOW));
    if (o && Array.isArray(o.channels)) return o;
  } catch (e) {}
  return null;
}
function noteDenied(cid) {
  if (noteDenied._id === cid) return;
  noteDenied._id = cid;
  showToast('인가되지 않은 채널입니다');
  dlog('allow-denied-notice', cid);
  // 토스트가 끝나면 감시 중단 + UI 제거 (같은 채널로 다시 들어오면 토스트를 다시 띄움)
  setTimeout(() => {
    if (allowState !== 'denied') return;
    noteDenied._id = null;
    teardownUi();
  }, TOAST_MS);
}
// 항목 정규화: "id" 문자열 또는 {id, name, discord, home} 객체
const normEntry = (e) => {
  if (typeof e === 'string') return { id: e, name: '', discord: '', home: '' };
  if (e && typeof e === 'object') {
    return {
      id: String(e.id || ''),
      name: String(e.name || ''),
      discord: String(e.discord || ''),
      home: String(e.home || ''),
    };
  }
  return null;
};
let allowEntry = null; // 현재 채널의 인가 항목 (표시명·링크 버튼용)
// id 일치 + (등록명이 있으면) 페이지 표시명 일치해야 통과.
// 페이지명을 못 읽으면 id만으로 허용 (DOM 변경 대비, 로그 남김).
function judgeAllow(entries, cid, silent, tag) {
  const entry = entries.find((e) => e.id && e.id.toLowerCase() === cid) || null;
  allowEntry = entry;
  let ok = !!entry;
  let why = ok ? 'id' : 'no-id';
  if (ok && entry.name) {
    const pn = getPageChannelName();
    if (pn) {
      ok = sameName(entry.name, pn);
      why = ok ? 'name' : 'mismatch';
    } else {
      why = 'noname-page';
    }
  }
  if (!silent) dlog(tag + ':' + why, cid);
  if (!ok) noteDenied(cid);
  return ok;
}
function refreshAllowlist(silent, done) {
  const cid = pageChannelId();
  const finish = (st) => { allowState = st; if (st === 'ok') noteDenied._id = null; if (done) { try { done(); } catch (e) {} } };
  try {
    fetch(ALLOW_URL + '?t=' + Math.floor(Date.now() / 3600000), { cache: 'no-store' })
      .then((r) => { if (!r || !r.ok) throw new Error('http'); return r.json(); })
      .then((j) => {
        const raw = j && Array.isArray(j.channels) ? j.channels : null;
        if (!raw) throw new Error('format');
        const entries = raw.map(normEntry).filter(Boolean);
        try { localStorage.setItem(LS_ALLOW, JSON.stringify({ channels: entries, at: Date.now() })); } catch (e) {}
        finish(judgeAllow(entries, cid, silent, 'allow') ? 'ok' : 'denied');
      })
      .catch(() => {
        const c = readAllowCache();
        if (c) {
          const entries = (c.channels || []).map(normEntry).filter(Boolean);
          finish(judgeAllow(entries, cid, silent, 'allow-cache') ? 'ok' : 'denied');
        } else {
          if (!silent) { dlog('allow-offline-open', cid); showToast('인가 목록 확인 불가(오프라인), 이번만 허용'); }
          finish('ok');
        }
      });
  } catch (e) { finish('ok'); }
}

function start() {
  if (running) return;
  const cid = pageChannelId();
  if (!cid) return;
  if (allowState === 'denied') { noteDenied(cid); renderPanel(); return; }
  if (allowState !== 'ok') {
    refreshAllowlist(false, () => {
      if (allowState === 'ok') start();
      else renderPanel();
    });
    return;
  }
  ensurePermission();
  running = true;
  renderPanel();
  // 인가 철회 대응: 10분마다 목록 재확인 (조용히)
  if (allowTimer) { clearInterval(allowTimer); allowTimer = null; }
  allowTimer = setInterval(() => {
    if (!running) return;
    refreshAllowlist(true, () => {
      if (allowState === 'denied' && running) {
        noteDenied(pageChannelId()); // 토스트 종료 시 감시 중단 + UI 제거
      }
    });
  }, 600000);
  dlog('start', JSON.stringify({ dom: domMsgCount(), folded: isChatFolded(), hasContainer: !!findChatContainer() }));
  hb('start');

  // body를 절대 observe하지 않음. 컨테이너가 생길 때까지 1.5s 폴링만 수행.
  const first = findChatContainer();
  if (first && first !== document.body) {
    attachObserverTo(first);
    scanQuiet++; // 시작 전 쌓인 메시지 1회 회수: 울리지 않고 목록에만 추가
    try { scanNode(first); } finally { scanQuiet--; }
  } else {
    dlog('start-nocontainer', JSON.stringify({ dom: domMsgCount(), folded: isChatFolded() }));
  }
  if (containerCheckTimer) { clearInterval(containerCheckTimer); containerCheckTimer = null; }
  containerCheckTimer = setInterval(() => {
    if (!running) { clearInterval(containerCheckTimer); containerCheckTimer = null; return; }
    const better = findChatContainer();
    if (better && better !== document.body && better !== watchedContainer) {
      dlog('reattach', JSON.stringify({ dom: domMsgCount(), folded: isChatFolded() }));
      attachObserverTo(better);
      scanQuiet++; // 재접속/refill 과거분: 울리지 않고 목록에만 추가
      try { scanNode(better); } finally { scanQuiet--; }
    } else if (!better && !watchedContainer) {
      dlog('nocontainer-tick', JSON.stringify({ dom: domMsgCount(), folded: isChatFolded() }));
    }
    // TEST2 보완: 옵저버가 죽거나 접힘 리렌더를 놓쳐도 최대 1.5s 지연으로 회수.
    // seen WeakSet 덕분에 이미 본 건 스킵이라 평소 비용은 querySelectorAll 1회뿐.
    try {
      const list = document.querySelectorAll('[class*="chatting_message"]');
      let fresh = 0;
      for (const el of list) { if (!seen.has(el)) fresh++; }
      if (fresh > 0) {
        catchupFound += fresh;
        let changed = false;
        for (const el of list) { if (scanSingle(el)) changed = true; }
        if (changed) scheduleStatsUpdate();
        dlog('catchup', JSON.stringify({ fresh, dom: list.length, folded: isChatFolded() }));
      }
    } catch (e) {}
  }, 1500);
}
let allowTimer = null;
function stop() {
  if (observer) observer.disconnect();
  observer = null;
  watchedContainer = null;
  if (containerCheckTimer) { clearInterval(containerCheckTimer); containerCheckTimer = null; }
  if (allowTimer) { clearInterval(allowTimer); allowTimer = null; }
  running = false;
  dlog('stop');
  renderPanel();
}

