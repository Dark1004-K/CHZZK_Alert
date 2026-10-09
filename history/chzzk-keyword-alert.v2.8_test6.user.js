// ==UserScript==
// @name         CHZZK 채팅 호출 알림 (Keyword Alert)
// @namespace    https://chzzk.naver.com/
// @version      2.8-test6
// @description  치지직(CHZZK) 생방송 채팅에서 등록한 단어(닉네임 등)가 언급되면 브라우저 알림 + 화면 토스트를 띄워줍니다.
// @author       DarkAngel
// @match        https://chzzk.naver.com/live/0a3deecf0fa1652445e3c97bc118272e*
// @match        https://chzzk.naver.com/0a3deecf0fa1652445e3c97bc118272e*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  if (window.__kwAlertLoaded) return;
  window.__kwAlertLoaded = true;

  // ---------- 저장 (localStorage: 새로고침 후에도 유지) ----------
  const LS_KEYWORDS = '__kw_keywords';
  const LS_NICK = '__kw_mynick'; // 원본 스크립트가 쓴 키 이름과 동일하게 맞춤 (기존에 저장된 닉네임 그대로 불러옵)
  const LS_NICK_OLD = '__kw_nick'; // 이전 버전에서 잘못 쓴 키 (혼용성 폴백)
  const LS_AUTO = '__kw_auto_start';
  const LS_HITS = '__kw_hits'; // 불린 대화 기록 (최대 30개, 새로고침 후에도 유지)
  const LS_HIST = '__kw_hist_on'; // 불린 대화 목록 옵션 ('0'=끔, 그 외=켬)
  const HITS_MAX = 30;

  const loadKeywords = () => {
    try { return JSON.parse(localStorage.getItem(LS_KEYWORDS)) || []; } catch (e) { return []; }
  };
  const saveKeywords = (list) => localStorage.setItem(LS_KEYWORDS, JSON.stringify(list));
  const loadNick = () => localStorage.getItem(LS_NICK) ?? localStorage.getItem(LS_NICK_OLD) ?? '';
  const saveNick = (v) => localStorage.setItem(LS_NICK, v);
  const histOn = () => { try { return localStorage.getItem(LS_HIST) !== '0'; } catch (e) { return true; } };
  const loadHits = () => {
    try {
      const a = JSON.parse(localStorage.getItem(LS_HITS)) || [];
      return Array.isArray(a) ? a.filter((h) => h && h.sig).slice(0, HITS_MAX).map((h) => ({ ...h, el: null })) : [];
    } catch (e) { return []; }
  };
  const norm = (s) => (s || '').replace(/\s+/g, '').toLowerCase();
  const normLoose = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

  let keywords = loadKeywords();
  let myNick = loadNick();
  // CPU 절감 + 경계 오탐 방지: 타이트(공백제거)/루즈(공백유지) 두 형태를 미리 캐시
  // 타이트만 쓰면 "그런데 아"가 "그런데아"로 합쳐져서 키워드 "데아"에 오탐됨.
  let kwCache = keywords.map((k) => ({ tight: norm(k), loose: normLoose(k) })).filter((o) => o.tight);
  let normMyNick = norm(myNick);
  function refreshNormCache() {
    kwCache = keywords.map((k) => ({ tight: norm(k), loose: normLoose(k) })).filter((o) => o.tight);
    normMyNick = norm(myNick);
  }

  // ---------- TEST1 진단 로그 (콘솔 입력 없이 보기용, 10s 하트비트) ----------
  const KW_TEST_TAG = '[KW-2.8T6]';
  function dlog(...a) { try { console.log(KW_TEST_TAG, ...a); } catch (e) {} }
  function domMsgCount() {
    try { return document.querySelectorAll('[class*="chatting_message"]').length; }
    catch (e) { return -1; }
  }
  function isChatFolded() {
    try { return !!document.querySelector('[class*="_is_folded"]'); }
    catch (e) { return false; }
  }
  function hb(reason) {
    dlog('HB(' + reason + ')', JSON.stringify({
      running, checked, hits,
      dom: domMsgCount(), folded: isChatFolded(),
      watched: !!watchedContainer, kw: keywords.length,
      mut: mutBatches, mutNodes, catchup: catchupFound,
      ws: wsTracked, wsMsgs, hist: hitLog.length, limited: limitedMode,
    }));
    mutBatches = 0; mutNodes = 0; catchupFound = 0; wsMsgs = 0;
  }
  let hbTimer = null;
  function startHeartbeat() {
    if (hbTimer) return;
    dlog('loaded', location.href);
    hb('init');
    hbTimer = setInterval(() => {
      try { if (isLivePage()) hb('tick'); } catch (e) {}
    }, 10000);
  }

  // ---------- WS 스니핑 (히든/접힘 상태 대응, DOM과 무관) ----------
  // 채팅 서버: wss://*.chat.naver.com/chat, 일반 93101 / 후원 93102
  const WS_URL_RE = /chat\.naver\.com\/chat/i;
  let wsHooked = false;
  function wsMatch(nick, msg) {
    if (!running || kwCache.length === 0) return;
    const text = (nick ? nick + ' ' : '') + (msg || '');
    const sig = hitSig(text);
    if (!sig) return;
    const tl = normLoose(text);
    let tightTokens = null;
    for (const { tight: kt, loose: kl } of kwCache) {
      let hit = false;
      if (kl && tl.includes(kl)) hit = true;
      else {
        if (!tightTokens) tightTokens = tl.split(' ').map((t) => norm(t)).filter(Boolean);
        for (const tt of tightTokens) { if (tt.includes(kt)) { hit = true; break; } }
      }
      if (hit) {
        const fullSig = sig + '|' + kt;
        if (histOn() && histSigs.has(fullSig)) { dlog('DUP-hist-skip', JSON.stringify({ kw: kt })); return; }
        if (!takeHit(fullSig)) { dlog('DUP-ws-skip', JSON.stringify({ kw: kt })); return; }
        hits++;
        recordHit(nick, text, kt, fullSig, null);
        dlog('HIT-ws', JSON.stringify({ kw: kt, nick: (nick || '').slice(0, 30), text: text.slice(0, 60) }));
        fireAlert(nick, text, null);
        return;
      }
    }
  }
  function handleWsPayload(data) {
    if (typeof data !== 'string') return;
    let obj;
    try { obj = JSON.parse(data); } catch (e) { return; }
    if (!obj || (obj.cmd !== 93101 && obj.cmd !== 93102)) return;
    const bdy = obj.bdy;
    if (!Array.isArray(bdy)) return;
    wsMsgs++;
    for (const m of bdy) {
      if (!m) continue;
      const msg = m.msg || '';
      if (!msg) continue;
      let nick = '';
      try {
        if (typeof m.profile === 'string' && m.profile) nick = JSON.parse(m.profile).nickname || '';
        else if (m.profile && typeof m.profile === 'object') nick = m.profile.nickname || '';
      } catch (e) {}
      if (normMyNick && nick && norm(nick) === normMyNick) continue;
      wsMatch(nick, msg);
    }
  }
  function patchWebSocket() {
    if (wsHooked) return;
    wsHooked = true;
    try {
      const OrigWS = window.WebSocket;
      if (!OrigWS) { dlog('ws-noapi'); return; }
      function HookedWS(url, protocols) {
        const ws = (protocols !== undefined) ? new OrigWS(url, protocols) : new OrigWS(url);
        try {
          if (typeof url === 'string' && WS_URL_RE.test(url)) {
            wsTracked++;
            dlog('ws-track', String(url).slice(0, 90));
            ws.addEventListener('message', (ev) => {
              try { handleWsPayload(ev.data); } catch (e) {}
            });
          }
        } catch (e) {}
        return ws;
      }
      HookedWS.prototype = OrigWS.prototype;
      try {
        ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach((k) => { HookedWS[k] = OrigWS[k]; });
      } catch (e) {}
      window.WebSocket = HookedWS;
      dlog('ws-hooked');
    } catch (e) { try { dlog('ws-hook-fail'); } catch (e2) {} }
  }
  patchWebSocket(); // document-start 최우선 실행 (페이지 소켓 생성 전에 가로채야 함)

  // ---------- 실행 환경 판별 (사용자 스크립트 허용 여부) ----------
  // MAIN world면 주입 스크립트가 같은 window를 봐서 echo가 일치하고,
  // 격리 월드(허용 꺼짐)면 주입 스크립트가 userscript의 window 확장을 못 봐서 불일치.
  let limitedMode = false;
  function runWorldProbe() {
    try {
      const k = '__kwWorldProbe';
      const v = 'v' + Math.random().toString(36).slice(2);
      window[k] = v;
      const root = document.documentElement || document.head;
      if (!root) return;
      const s = document.createElement('script');
      s.textContent = 'window["' + k + 'Echo"]=window["' + k + '"];';
      root.appendChild(s);
      try { s.remove(); } catch (e) {}
      limitedMode = window[k + 'Echo'] !== v;
      try { delete window[k]; delete window[k + 'Echo']; } catch (e) {}
      dlog(limitedMode ? 'world-limited' : 'world-main');
    } catch (e) { limitedMode = true; try { dlog('world-probe-fail'); } catch (e2) {} }
    updateWarn();
  }
  function updateWarn() {
    if (!panel) return;
    const w = panel.querySelector('#__kw_warn');
    if (w) w.style.display = limitedMode ? 'block' : 'none';
  }
  let running = false;
  let checked = 0;
  let hits = 0;
  let observer = null;
  let mutBatches = 0; // TEST2: 옵저버 콜백 발화 횟수 (10s 하트비트마다 리셋)
  let mutNodes = 0;   // TEST2: 옵저버가 본 addedNodes 중 HTMLElement 수
  let catchupFound = 0; // TEST2: 폴링 보완스캔이 찾아낸 미확인 메시지 수
  let wsTracked = 0;  // 2.8: 추적 중인 채팅 WS 수
  let wsMsgs = 0;     // 2.8: WS로 받은 채팅 패킷 수 (10s마다 리셋)
  const seen = new WeakSet();
  // DOM/WS 중복 발화 방지: 같은 본문 서명은 8초 내 1회만 알림
  const hitTimes = new Map();
  // 불린 대화 목록: 장기 중복 회피(재오픈 시 과거분 refill) + 클릭 이동용
  let hitLog = loadHits();
  const histSigs = new Set(hitLog.map((h) => h.sig).filter(Boolean));
  function hitSig(text) { try { return norm(text).slice(0, 80); } catch (e) { return ''; } }
  function takeHit(sig) {
    const now = Date.now();
    const prev = hitTimes.get(sig) || 0;
    if (now - prev < 8000) return false;
    hitTimes.set(sig, now);
    if (hitTimes.size > 200) {
      for (const [k, t] of hitTimes) { if (now - t > 30000) hitTimes.delete(k); }
    }
    return true;
  }

  // ---------- 스타일 (원본과 동일한 색/구조) ----------
  // document-start 실행이므로 head가 없을 수 있어 지연 주입
  function ensureStyle() {
    try {
      if (document.getElementById('__kw_style') || !document.head) return;
      const style = document.createElement('style');
      style.id = '__kw_style';
      style.textContent = `
  @keyframes __kwpulse{0%{box-shadow:0 0 0 0 rgba(0,255,163,.8)}70%{box-shadow:0 0 0 8px rgba(0,255,163,0)}100%{box-shadow:0 0 0 0 rgba(0,255,163,0)}}
  #__kw_panel{position:fixed;bottom:14px;left:14px;z-index:2147483647;background:rgba(20,20,24,.94);color:#fff;font:13px sans-serif;padding:10px 12px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.5);border:2px solid #00ffa3;user-select:none;min-width:250px;max-width:330px;display:none}
  #__kw_panel.show{display:block}
  #__kw_panel.off{border-color:#777}
  #__kw_row{display:flex;align-items:center;gap:8px}
  #__kw_dot{width:11px;height:11px;border-radius:50%;background:#00ffa3;animation:__kwpulse 1.4s infinite;flex:none}
  #__kw_panel.off #__kw_dot{background:#ff4d4d;animation:none}
  #__kw_sub{font-size:11px;color:#aaa;margin-top:2px}
  .__kw_b{border:0;border-radius:8px;padding:5px 9px;font:bold 12px sans-serif;cursor:pointer}
  #__kw_btn{background:#ff4d4d;color:#fff}
  #__kw_panel.off #__kw_btn{background:#00ffa3;color:#000}
  #__kw_gear{background:#444;color:#fff}
  #__kw_edit{display:none;margin-top:8px;border-top:1px solid #444;padding-top:8px}
  #__kw_panel.open #__kw_edit{display:block}
  .__kw_chip{display:inline-flex;align-items:center;gap:4px;background:#333;border-radius:12px;padding:3px 8px;margin:2px;font-size:12px}
  .__kw_chip b{cursor:pointer;color:#ff7b7b}
  .__kw_in{background:#222;border:1px solid #555;color:#fff;border-radius:6px;padding:4px 6px;font-size:12px;user-select:text}
  .__kw_lbl{font-size:11px;color:#aaa;margin:8px 0 3px}
  #__kw_box{position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:2147483647;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none}
  .__kw_toast{background:#ffd400;color:#000;font:bold 15px sans-serif;padding:12px 18px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.4);max-width:520px;pointer-events:auto;cursor:pointer}
  #__kw_ask{position:fixed;bottom:14px;left:14px;z-index:2147483647;background:rgba(20,20,24,.96);color:#fff;font:13px sans-serif;padding:12px 14px;border-radius:12px;border:2px solid #ffd400;box-shadow:0 4px 16px rgba(0,0,0,.5);max-width:320px}
  #__kw_ask .__kw_b{margin-top:8px;margin-right:6px}
  #__kw_sel{position:absolute;z-index:2147483647;background:#00ffa3;color:#000;font:bold 12px sans-serif;padding:5px 9px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.5);cursor:pointer;display:none;white-space:nowrap}
  .__kw_hl{outline:3px solid #ffd400 !important;background:rgba(255,212,0,.18) !important;border-radius:4px;transition:background 2.5s ease,outline-color 2.5s ease}
  .__kw_hl.__kw_hl_fade{background:rgba(255,212,0,0) !important;outline-color:rgba(255,212,0,0) !important}
  .__kw_hit{padding:4px 6px;border-radius:6px;cursor:pointer;font-size:12px;line-height:1.4;word-break:break-all}
  .__kw_hit:hover{background:#2c2c31}
  .__kw_hit_t{color:#888;font-size:11px;margin-right:4px}
  .__kw_hit_k{color:#00ffa3;font-size:11px;margin-left:4px}
  #__kw_stack{position:fixed;bottom:14px;left:14px;z-index:2147483647;display:flex;flex-direction:column;gap:8px;align-items:stretch}
  #__kw_stack #__kw_panel{position:static}
  #__kw_histp{width:300px;max-width:330px;background:rgba(20,20,24,.94);color:#fff;font:13px sans-serif;padding:8px 10px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.5);border:1px solid #ffd400}
  #__kw_hist_head{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;font-weight:bold}
  #__kw_hits{max-height:150px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;user-select:text}
  #__kw_hits_clear{background:#444;color:#fff;padding:2px 7px;font-size:11px}
  `;
    document.head.appendChild(style);
    } catch (e) {}
  }

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
  function fireAlert(nick, text, el) {
    const body = splitBody(nick, text);
    const title = nick ? '🔔 ' + nick : '🔔 CHZZK 채팅 호출';
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try { new Notification(title, { body: body.slice(0, 120) }); } catch (e) {}
    }
    showCallToast(nick, body);
    playAlertSound();
    highlightMessage(el);
  }
  function showCallToast(nick, body) {
    let box = document.getElementById('__kw_box');
    if (!box) {
      box = document.createElement('div');
      box.id = '__kw_box';
      document.body.appendChild(box);
    }
    // 도배 시 DOM 비대화 방지: 최대 5개 유지
    while (box.children.length >= 5) box.firstChild?.remove();
    const t = document.createElement('div');
    t.className = '__kw_toast';
    t.innerHTML = '<b>🔔 ' + escapeHtml(nick || 'CHZZK') + '</b><br>' + escapeHtml((body || '').slice(0, 80));
    t.onclick = () => t.remove();
    box.appendChild(t);
    setTimeout(() => t.remove(), 5000);
  }
  function showToast(text) {
    let box = document.getElementById('__kw_box');
    if (!box) {
      box = document.createElement('div');
      box.id = '__kw_box';
      document.body.appendChild(box);
    }
    // 도배 시 DOM 비대화 방지: 최대 5개 유지
    while (box.children.length >= 5) box.firstChild?.remove();
    const t = document.createElement('div');
    t.className = '__kw_toast';
    t.textContent = '🔔 ' + text.slice(0, 80);
    t.onclick = () => t.remove();
    box.appendChild(t);
    setTimeout(() => t.remove(), 5000);
  }

  // ---------- 불린 대화 목록 (저장/표시/클릭 이동) ----------
  function saveHits() {
    try {
      localStorage.setItem(LS_HITS, JSON.stringify(
        hitLog.slice(0, HITS_MAX).map(({ t, nick, text, kw, sig }) => ({ t, nick, text, kw, sig }))
      ));
    } catch (e) {}
  }
  function fmtTime(t) {
    try { return new Date(t).toTimeString().slice(0, 8); } catch (e) { return ''; }
  }
  function recordHit(nick, text, kw, sig, el) {
    if (!histOn()) return;
    hitLog.unshift({ t: Date.now(), nick: nick || '', text: (text || '').slice(0, 120), kw, sig, el: el || null });
    histSigs.add(sig);
    while (hitLog.length > HITS_MAX) {
      const rm = hitLog.pop();
      if (rm && rm.sig && !hitLog.some((h) => h.sig === rm.sig)) histSigs.delete(rm.sig);
    }
    saveHits();
    renderHitsList();
  }
  function renderHitsList() {
    if (histCount) histCount.textContent = String(hitLog.length);
    if (!histBox || !histBox.isConnected) return;
    if (!histOn()) { histBox.innerHTML = ''; return; }
    histBox.innerHTML = hitLog.length ? hitLog.map((h, i) =>
      `<div class="__kw_hit" data-i="${i}" title="클릭하면 해당 채팅으로 이동"><span class="__kw_hit_t">${fmtTime(h.t)}</span><span>${escapeHtml(h.text)}</span><span class="__kw_hit_k">${escapeHtml(h.kw)}</span></div>`
    ).join('') : '<div style="font-size:11px;color:#666">아직 없음</div>';
  }
  function jumpToHit(i) {
    const h = hitLog[i];
    if (!h) return;
    const el = h.el;
    if (el && el.isConnected) {
      try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      catch (e) { try { el.scrollIntoView(); } catch (e2) {} }
      highlightMessage(el);
      dlog('jump', JSON.stringify({ i, text: (h.text || '').slice(0, 40) }));
    } else {
      // 원본이 가상리스트에서 밀려남 (새로고침 전 기록 포함) → 목록에서 제거하고 알림
      hitLog.splice(i, 1);
      if (h.sig && !hitLog.some((x) => x.sig === h.sig)) histSigs.delete(h.sig);
      saveHits();
      renderHitsList();
      showToast('이미 사라진 대화입니다' + (h.text ? ': ' + h.text.slice(0, 40) : ''));
      dlog('jump-gone-pruned', JSON.stringify({ i }));
    }
  }

  // ---------- 채팅 감시 ----------
  const CHANNEL_ID = '0a3deecf0fa1652445e3c97bc118272e'; // 미리내ES 채널로만 동작 제한
  const isLivePage = () => /\/live\//.test(location.pathname) && location.pathname.includes(CHANNEL_ID);

  // 우리 자체 UI(패널/프롬프트/토스트/선택버튼)에서 발생한 변화는 절대 관리하지 않아야 무한루프를 막을 수 있음
  const isOwnUi = (node) =>
    node.id && ['__kw_panel', '__kw_ask', '__kw_box', '__kw_sel', '__kw_stack', '__kw_histp'].includes(node.id);

  let statsRaf = null;
  function scheduleStatsUpdate() {
    if (statsRaf) return;
    statsRaf = requestAnimationFrame(() => {
      statsRaf = null;
      updateStatsText();
    });
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
        if (histOn() && histSigs.has(sig)) { dlog('DUP-hist-skip', JSON.stringify({ kw: kl })); break; }
        if (!takeHit(sig)) { dlog('DUP-dom-skip', JSON.stringify({ kw: kl })); break; }
        hits++;
        recordHit(senderName, text, kl, sig, el);
        dlog('HIT-loose', JSON.stringify({ kw: kl, nick: senderName.slice(0, 30), text: text.slice(0, 60) }));
        fireAlert(senderName, text, el);
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
        if (histOn() && histSigs.has(sig)) { dlog('DUP-hist-skip', JSON.stringify({ kw: kt })); break; }
        if (!takeHit(sig)) { dlog('DUP-dom-skip', JSON.stringify({ kw: kt })); break; }
        hits++;
        recordHit(senderName, text, kt, sig, el);
        dlog('HIT-token', JSON.stringify({ kw: kt, nick: senderName.slice(0, 30), text: text.slice(0, 60) }));
        fireAlert(senderName, text, el);
        break;
      }
    }
    return true;
  }

  function scanNode(node) {
    if (!(node instanceof HTMLElement)) return;
    if (isOwnUi(node) || node.closest?.('#__kw_panel,#__kw_ask,#__kw_box,#__kw_sel,#__kw_stack,#__kw_histp')) return;
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
        if (m.target && (isOwnUi(m.target) || m.target.closest?.('#__kw_panel,#__kw_ask,#__kw_box,#__kw_sel,#__kw_stack,#__kw_histp'))) continue;
        for (const n of m.addedNodes) {
          if (!(n instanceof HTMLElement)) continue; // 텍스트노드 스킵
          mutNodes++;
          scanNode(n);
        }
      }
    });
    observer.observe(container, { childList: true, subtree: true });
  }

  function start() {
    if (running) return;
    ensurePermission();
    running = true;
    renderPanel();
    dlog('start', JSON.stringify({ dom: domMsgCount(), folded: isChatFolded(), hasContainer: !!findChatContainer() }));
    hb('start');

    // body를 절대 observe하지 않음. 컨테이너가 생길 때까지 1.5s 폴링만 수행.
    const first = findChatContainer();
    if (first && first !== document.body) {
      attachObserverTo(first);
      scanNode(first); // 시작 전 쌓인 메시지 1회 회수 (기록에 있으면 재알림 생략됨)
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
        scanNode(better); // 재접속/refill 과거분: 기록에 있으면 재알림 생략됨
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
  function stop() {
    if (observer) observer.disconnect();
    observer = null;
    watchedContainer = null;
    if (containerCheckTimer) { clearInterval(containerCheckTimer); containerCheckTimer = null; }
    running = false;
    dlog('stop');
    renderPanel();
  }

  // ---------- 패널 (#__kw_panel, 원본과 동일한 구조) + 목록 별도 화면 (#__kw_histp) ----------
  let panel;
  let stackEl = null, histPanel = null, histBox = null, histCount = null;
  function ensureStack() {
    if (stackEl && stackEl.isConnected) return stackEl;
    let ex = null;
    try { ex = document.getElementById('__kw_stack'); } catch (e) {}
    if (ex) { stackEl = ex; return ex; }
    const s = document.createElement('div');
    s.id = '__kw_stack';
    document.body.appendChild(s);
    stackEl = s;
    return s;
  }
  function attachHistHandlers() {
    if (!histPanel || histPanel.__kwWired) return;
    histPanel.__kwWired = true;
    const c = histPanel.querySelector('#__kw_hits_clear');
    if (c) c.onclick = () => {
      hitLog = []; histSigs.clear(); saveHits(); renderHitsList(); dlog('hits-cleared');
    };
    const b = histPanel.querySelector('#__kw_hits');
    if (b) b.onclick = (ev) => {
      const it = ev.target && ev.target.closest ? ev.target.closest('.__kw_hit') : null;
      if (it) jumpToHit(Number(it.dataset.i));
    };
  }
  function ensureHistPanel() {
    ensureStack();
    if (histPanel && histPanel.isConnected && histBox && histBox.isConnected) return;
    let ex = null;
    try { ex = document.getElementById('__kw_histp'); } catch (e) {}
    if (ex) {
      histPanel = ex;
      histBox = ex.querySelector('#__kw_hits');
      histCount = ex.querySelector('#__kw_hits_count');
      attachHistHandlers();
      applyHistVisibility();
      renderHitsList();
      return;
    }
    const d = document.createElement('div');
    d.id = '__kw_histp';
    d.innerHTML = `<div id="__kw_hist_head"><span>🔔 불린 대화 <b id="__kw_hits_count">0</b></span><button class="__kw_b" id="__kw_hits_clear">지우기</button></div><div id="__kw_hits"></div>`;
    stackEl.appendChild(d);
    histPanel = d;
    histBox = d.querySelector('#__kw_hits');
    histCount = d.querySelector('#__kw_hits_count');
    attachHistHandlers();
    applyHistVisibility();
    renderHitsList();
  }
  function applyHistVisibility() {
    if (!histPanel) return;
    const show = histOn() && panel && panel.classList.contains('show');
    histPanel.style.display = show ? 'block' : 'none';
  }
  function buildPanel() {
    ensureStack();
    panel = document.createElement('div');
    panel.id = '__kw_panel';
    stackEl.appendChild(panel);
    renderPanel();
  }

  // 채팅 카운트만 가벼게 갱신 (innerHTML 재생성 없음 → MutationObserver 루프 안 탈)
  function updateStatsText() {
    if (!panel) return;
    const sub = panel.querySelector('#__kw_sub');
    if (sub) sub.textContent = `확인 ${checked}개 · 감지 ${hits}회 · 내 채팅 제외`;
  }

  function renderPanel() {
    if (!panel) return;
    const wasOpen = panel.classList.contains('open');
    panel.className = 'show' + (running ? '' : ' off') + (wasOpen ? ' open' : '');

    panel.innerHTML = `
      <div id="__kw_row"><div id="__kw_dot"></div>
        <div style="flex:1"><div id="__kw_title"><b style="color:${running ? '#00ffa3' : '#ff4d4d'}">${running ? '감시중' : '중지됨'}</b> · 단어 ${keywords.length}개</div><div id="__kw_sub">확인 ${checked}개 · 감지 ${hits}회 · 내 채팅 제외</div></div>
        <button class="__kw_b" id="__kw_gear" title="설정">단어</button>
        <button class="__kw_b" id="__kw_btn">${running ? '정지' : '시작'}</button></div>
      <div id="__kw_warn" style="display:${limitedMode ? 'block' : 'none'};font-size:11px;color:#ffd400;margin-top:4px">⚠ 사용자 스크립트 허용 꺼짐: WS 감시 불가, DOM 감시만 동작. chrome://extensions → Tampermonkey 상세에서 허용 후 새로고침</div>
      <div id="__kw_edit">
        <div class="__kw_lbl">호출 단어 (×로 삭제, 페이지 글자를 드래그해서도 추가 가능)</div>
        <div id="__kw_chips">${keywords.map((k, i) => `<span class="__kw_chip"><span>${escapeHtml(k)}</span><b data-i="${i}" title="삭제">×</b></span>`).join('')}</div>
        <div style="margin-top:6px"><input class="__kw_in" id="__kw_in" placeholder="추가할 단어" style="width:150px">
          <button class="__kw_b" id="__kw_add" style="background:#00ffa3;color:#000">추가</button></div>
        <div class="__kw_lbl">내 닉네임 (이 닉네임의 채팅은 알림 제외)</div>
        <input class="__kw_in" id="__kw_nick" style="width:150px" value="${escapeHtml(myNick)}">
        <div class="__kw_lbl"><label style="cursor:pointer"><input type="checkbox" id="__kw_auto" ${localStorage.getItem(LS_AUTO) === '1' ? 'checked' : ''}> 방송 들어가면 묻지 않고 자동으로 켜기</label></div>
        <div class="__kw_lbl"><label style="cursor:pointer"><input type="checkbox" id="__kw_hist" ${histOn() ? 'checked' : ''}> 감시 패널 위에 불린 대화 목록 별도 표시 + 이미 울린 대화 재알림 방지 (클릭하면 해당 채팅으로 이동)</label></div>
      </div>`;

    panel.querySelector('#__kw_btn').onclick = () => (running ? stop() : start());
    panel.querySelector('#__kw_gear').onclick = () => panel.classList.toggle('open');
    panel.querySelectorAll('#__kw_chips b').forEach((b) => {
      b.onclick = () => {
        keywords.splice(Number(b.dataset.i), 1);
        saveKeywords(keywords);
        refreshNormCache();
        renderPanel();
      };
    });
    const addBtn = panel.querySelector('#__kw_add');
    const addInput = panel.querySelector('#__kw_in');
    const doAdd = () => {
      const v = addInput.value.trim();
      if (v && !keywords.includes(v)) { keywords.push(v); saveKeywords(keywords); refreshNormCache(); renderPanel(); }
    };
    addBtn.onclick = doAdd;
    addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
    panel.querySelector('#__kw_nick').onchange = (e) => { myNick = e.target.value; saveNick(myNick); refreshNormCache(); };
    panel.querySelector('#__kw_auto').onchange = (e) => localStorage.setItem(LS_AUTO, e.target.checked ? '1' : '0');
    panel.querySelector('#__kw_hist').onchange = (e) => {
      try { localStorage.setItem(LS_HIST, e.target.checked ? '1' : '0'); } catch (err) {}
      applyHistVisibility();
      renderHitsList();
    };
    renderHitsList();
    updateWarn();
  }

  // start()/stop()이나 단어 추가/삭제처럼 구조가 바뀌는 경우만 renderPanel()을 쓰고,
  // 채팅을 한 줄씩 훔을 때는 updateStatsText()만 쓰므로 이제 무한루프 위험이 없음.

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- 방송 진입 시 시작 여부 프롬프트 (#__kw_ask) ----------
  function showAskPrompt() {
    if (localStorage.getItem(LS_AUTO) === '1') { start(); return; }
    if (panel) panel.classList.remove('show');
    applyHistVisibility(); // 질문창이 떠 있는 동안 목록 화면도 함께 숨김
    const box = document.createElement('div');
    box.id = '__kw_ask';
    box.innerHTML = `<div><b>🔔 채팅 호출 알림을 켤까요?</b></div>
      <div style="font-size:12px;color:#bbb;margin-top:4px">단어: <span>${escapeHtml(keywords.join(', ')) || '(없음, 단어를 먼저 등록하세요)'}</span></div>
      <button class="__kw_b" id="__kw_yes" style="background:#00ffa3;color:#000">켜기</button>
      <button class="__kw_b" id="__kw_no" style="background:#444;color:#fff">이번엔 안 함</button>
      <div style="font-size:11px;margin-top:8px"><label style="cursor:pointer"><input type="checkbox" id="__kw_ask_auto"> 다음부터 묻지 않고 자동으로 켜기</label></div>`;
    document.body.appendChild(box);
    box.querySelector('#__kw_yes').onclick = () => {
      if (box.querySelector('#__kw_ask_auto').checked) localStorage.setItem(LS_AUTO, '1');
      start();
      box.remove();
      if (panel && isLivePage()) panel.classList.add('show');
      applyHistVisibility();
    };
    box.querySelector('#__kw_no').onclick = () => {
      box.remove();
      if (panel && isLivePage()) panel.classList.add('show');
      applyHistVisibility();
    };
  }

  // ---------- 드래그 선택으로 단어 추가 (#__kw_sel) ----------
  // 문서 전역 리스너는 한 번만 등록하고, 실제 버튼 DOM은 라이브 페이지에서 텍스트를
  // 드래그했을 때만 그때그때 만든다. (다른 URL에서는 UI 요소 자체가 존재하지 않도록)
  let dragListenerAdded = false;
  function setupDragToAdd() {
    if (dragListenerAdded) return;
    dragListenerAdded = true;
    document.addEventListener('mouseup', () => {
      if (!isLivePage()) return; // 이 채널의 라이브 페이지가 아니면 아무 것도 하지 않음
      let sel = document.getElementById('__kw_sel');
      if (!sel) {
        sel = document.createElement('div');
        sel.id = '__kw_sel';
        document.body.appendChild(sel);
      }
      const s = window.getSelection();
      const text = s ? s.toString().trim() : '';
      if (!text || text.length > 30 || text.includes('\n')) { sel.style.display = 'none'; return; }
      const range = s.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) { sel.style.display = 'none'; return; }
      sel.textContent = '＋ 호출 단어로 추가';
      sel.style.left = (rect.left + window.scrollX) + 'px';
      sel.style.top = (rect.top + window.scrollY - 30) + 'px';
      sel.style.display = 'block';
      sel.onclick = () => {
        if (!keywords.includes(text)) { keywords.push(text); saveKeywords(keywords); refreshNormCache(); renderPanel(); }
        sel.style.display = 'none';
      };
    });
  }

  // ---------- SPA 라우트 변경 감지 ----------
  let lastPath = location.pathname;

  // 이 채널의 라이브 페이지가 아니면 패널/토스트박스/선택버튼 등 UI DOM을 통째로 제거한다.
  // (CSS display:none으로 숨기는 게 아니라 실제로 DOM에서 없애서 "UI 자체가 안 보이게" 함)
  function teardownUi() {
    dlog('teardown', location.pathname);
    stop();
    try { document.getElementById('__kw_stack')?.remove(); } catch (e) {}
    panel = null; stackEl = null; histPanel = null; histBox = null; histCount = null;
    document.getElementById('__kw_ask')?.remove();
    document.getElementById('__kw_box')?.remove();
    document.getElementById('__kw_sel')?.remove();
  }

  function buildUi() {
    ensureStyle();
    ensureStack();
    ensureHistPanel();
    if (!panel || !panel.isConnected) buildPanel();
    setupDragToAdd();
    panel.classList.add('show');
    applyHistVisibility();
    dlog('buildui', JSON.stringify({ running, dom: domMsgCount(), folded: isChatFolded() }));
    if (!running) showAskPrompt();
  }

  function checkRoute() {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      if (isLivePage()) {
        buildUi();
      } else {
        teardownUi();
      }
    }
  }

  function init() {
    ensureStyle();
    startHeartbeat();
    if (isLivePage()) {
      buildUi();
    } else {
      dlog('init-notlive', location.pathname);
    }
    runWorldProbe();
    setInterval(checkRoute, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
