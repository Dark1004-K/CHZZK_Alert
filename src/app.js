'use strict';

// ---------- SPA 라우트 변경 감지 ----------
let lastPath = location.pathname;
let lastCid = pageChannelId();

// 이 채널의 라이브 페이지가 아니면 패널/토스트박스/선택버튼 등 UI DOM을 통째로 제거한다.
// (CSS display:none으로 숨기는 게 아니라 실제로 DOM에서 없애서 "UI 자체가 안 보이게" 함)

// 이 채널의 라이브 페이지가 아니면 패널/토스트박스/선택버튼 등 UI DOM을 통째로 제거한다.
// (CSS display:none으로 숨기는 게 아니라 실제로 DOM에서 없애서 "UI 자체가 안 보이게" 함)
function teardownUi() {
  dlog('teardown', location.pathname);
  stop();
  stopDrops();
  try { document.getElementById('__kw_stack')?.remove(); } catch (e) {}
  panel = null; stackEl = null; midRowEl = null; histPanel = null; histBox = null; histCount = null; setPanel = null;
  document.getElementById('__kw_ask')?.remove();
  document.getElementById('__kw_box')?.remove();
  document.getElementById('__kw_sel')?.remove();
}

function buildUi() {
  ensureStyle();
  ensureStack();
  ensureHistPanel();
  if (dropsOn()) startDrops();
  if (!panel || !panel.isConnected) buildPanel();
  ensureSettingsPanel();
  setupDragToAdd();
  setupFsReloc();
  panel.classList.add('show');
  applyHistVisibility();
  applySetVisibility();
  dlog('buildui', JSON.stringify({ running, dom: domMsgCount(), folded: isChatFolded() }));
  if (!running) showAskPrompt();
}

function checkRoute() {
  if (location.pathname !== lastPath) {
    lastPath = location.pathname;
    const cid = pageChannelId();
    if (cid) {
      if (cid !== lastCid) { // 다른 채널로 이동: 감시 중단 + 인가 재확인
        lastCid = cid;
        allowState = 'pending';
        allowEntry = null;
        try { stop(); } catch (e) {}
        hitLog = []; hitTimes.clear(); saveHits(); renderHitsList(); // 다른 채널: 불린 대화 초기화
      }
      buildUi();
    } else {
      lastCid = '';
      teardownUi();
    }
  }
}

// ---------- 플러그인 (plugins.json 매니페스트 기반 동적 로딩) ----------
// MAIN world(사용자 스크립트 허용 켜짐)에서만 동작. 주입 <script>가 같은 window를 공유한다.
// 플러그인은 window.__KW.on('hit', ({nick, text, kw}) => ...) 형태로 구독한다.
const PLUGIN_MANIFEST_URL = 'https://raw.githubusercontent.com/Dark1004-K/Chzzk_Alert/main/plugins.json';
const __kwListeners = {};
// 설정 > 확장에서 켜고 끈다. 끄면 해당 플러그인이 등록한 리스너로 이벤트 전달을 멈춘다 (주입된 코드는 새로고침 시 완전히 해제).
const LS_PLUG = '__kw_plugins'; // { [id]: true|false } 사용자가 고른 상태. 없으면 매니페스트의 on 값
let pluginList = null; // 매니페스트에서 받은 목록 (null이면 아직 못 받음)
const pluginLoaded = {};
let pluginInjecting = '';
function pluginStateMap() {
  try { return JSON.parse(localStorage.getItem(LS_PLUG)) || {}; } catch (e) { return {}; }
}
function pluginIsOn(p) {
  const m = pluginStateMap();
  return p.id in m ? !!m[p.id] : p.on !== false;
}
function pluginIdIsOn(id) {
  const p = (pluginList || []).find((x) => x && x.id === id);
  return p ? pluginIsOn(p) : true;
}
function setPluginOn(p, on) {
  const m = pluginStateMap();
  m[p.id] = !!on;
  try { localStorage.setItem(LS_PLUG, JSON.stringify(m)); } catch (e) {}
  if (on && !pluginLoaded[p.id] && !limitedMode) injectPlugin(p);
  dlog('plugin-' + (on ? 'on' : 'off'), p.id);
}
try {
  window.__KW = window.__KW || {
    version: SCRIPT_VERSION,
    on(evt, fn) {
      if (typeof fn !== 'function') return;
      fn.__kwPlugin = pluginInjecting;
      (__kwListeners[evt] = __kwListeners[evt] || []).push(fn);
    },
    toast(nick, body) { showCallToast(nick, body); },
  };
} catch (e) {}
function kwEmit(evt, data) {
  try {
    const arr = __kwListeners[evt] || [];
    for (const fn of arr) {
      if (fn.__kwPlugin && !pluginIdIsOn(fn.__kwPlugin)) continue;
      try { fn(data); } catch (e) {}
    }
  } catch (e) {}
}
function loadPlugins() {
  if (limitedMode) { dlog('plugin-skip-limited'); return; }
  try {
    fetch(PLUGIN_MANIFEST_URL + '?t=' + Math.floor(Date.now() / 3600000), { cache: 'no-store' })
      .then((r) => { if (!r || !r.ok) throw new Error('http'); return r.json(); })
      .then((j) => {
        const list = j && Array.isArray(j.plugins) ? j.plugins.filter((p) => p && p.id && p.url) : [];
        pluginList = list;
        for (const p of list) {
          if (pluginIsOn(p)) injectPlugin(p);
        }
        if (setTab === 'ext') renderSettings();
      })
      .catch(() => {});
  } catch (e) {}
}
function injectPlugin(p) {
  try {
    fetch(p.url, { cache: 'no-store' })
      .then((r) => { if (!r || !r.ok) throw new Error('http'); return r.text(); })
      .then((code) => {
        if (!code || code.length < 10) return;
        const s = document.createElement('script');
        s.textContent = '\n;try{\n' + code + '\n}catch(e){}';
        pluginInjecting = p.id || '';
        pluginLoaded[p.id] = true;
        try { (document.head || document.documentElement).appendChild(s); } finally { pluginInjecting = ''; }
        try { s.remove(); } catch (e) {}
        dlog('plugin-loaded', p.id || p.url);
      })
      .catch(() => {});
  } catch (e) {}
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
  loadPlugins();
  try {
    document.addEventListener('pointerdown', unlockAudio);
    document.addEventListener('keydown', unlockAudio);
  } catch (e) {}
  setInterval(checkRoute, 1000);
}

// 베타 진단용 후크 (정식에서는 제거): 콘솔에서 __kwDebug.jump(0) 등으로 직접 검증 가능
try { window.__kwDebug = { jump: jumpToHit, find: findElBySig, log: () => hitLog }; } catch (e) {}

if (!window.__kwAlertLoaded) {
  window.__kwAlertLoaded = true;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
