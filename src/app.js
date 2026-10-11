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
  try { maybeCompanionPrompt(); } catch (e) {}
  dlog('buildui', JSON.stringify({ running, dom: domMsgCount(), folded: isChatFolded() }));
  if (!running) showAskPrompt();
}

// 탭이 얼었다 깨어남/버려졌다 다시 불러옴/가려졌다 다시 보임을 감지 → 그 직후 잠깐은 울리지 않음 (markResume)
let lastTickAt = Date.now();
let hiddenAt = 0;
function setupResumeWatch() {
  try { if (document.wasDiscarded) markResume('discarded', 20000); } catch (e) {}
  try {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 60000) markResume('visible-after-hidden');
    });
    document.addEventListener('resume', () => markResume('resume')); // Page Lifecycle: 얼었던 탭이 깨어남
    window.addEventListener('pageshow', (e) => { if (e.persisted) markResume('pageshow'); });
  } catch (e) {}
}
function gapCheck() { // 타이머가 150초 넘게 멈췄다 풀렸으면 탭이 얼어 있었던 것
  const now = Date.now();
  if (now - lastTickAt > 150000) markResume('gap');
  lastTickAt = now;
}
function checkRoute() {
  gapCheck();
  if (location.pathname !== lastPath) {
    lastPath = location.pathname;
    const cid = pageChannelId();
    if (cid) {
      if (cid !== lastCid) { // 다른 채널로 이동: 감시 중단 + 인가 재확인
        lastCid = cid;
        allowState = 'pending';
        allowEntry = null; allowExpiry = null;
        try { stop(); } catch (e) {}
        hitLog = []; hitTimes.clear(); clearSeen(); saveHits(); renderHitsList(); // 다른 채널: 불린 대화 초기화
        try { syncPlugins(); } catch (e) {}
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
const pluginMeta = {}; // 플러그인 자기 신고 { [id]: { name, version } }
let pluginInjecting = '';
function pluginMetaOf(id) {
  try { return pluginMeta[id] || null; } catch (e) { return null; }
}
function pluginDisplayName(p) {
  const base = (p && p.name) || (p && p.id) || '';
  try {
    const m = p && pluginMeta[p.id];
    if (m && m.version) return base + ' v' + m.version;
  } catch (e) {}
  return base;
}
function pluginStateMap() {
  try { return JSON.parse(localStorage.getItem(LS_PLUG)) || {}; } catch (e) { return {}; }
}
function pluginIsOn(p) {
  if (p.noOwner && isOwner()) return false; // 방장이면 항상 꺼짐 (사용자 선택보다 우선)
  const cp = channelPlugins(); // 현재 채널의 플러그인 구성 (없으면 전역 동작)
  if (cp && (!(p.id in cp) || cp[p.id].on === false)) return false; // 채널 미제공·off는 사용 불가
  const m = pluginStateMap();
  if (p.id in m) return !!m[p.id]; // 사용자 선택 우선
  if (cp && cp[p.id] && typeof cp[p.id].on === 'boolean') return !!cp[p.id].on; // 채널 기본값
  return p.on !== false;
}
// 현재 채널의 플러그인 구성 ({ [id]: { on?, options? } } 또는 null). 없으면 전역 동작.
function channelPlugins() {
  try {
    const p = allowEntry && allowEntry.plugins;
    return (p && typeof p === 'object') ? p : null;
  } catch (e) { return null; }
}
function pluginIdIsOn(id) {
  const p = (pluginList || []).find((x) => x && x.id === id);
  return p ? pluginIsOn(p) : true;
}
// 플러그인 옵션: plugins.json의 options 정의(key/label/type/default)를 설정 > 확장에 그리고, 값은 localStorage에 저장한다.
const LS_PLUGOPT = '__kw_plugopt'; // { [pluginId]: { [key]: value } }
function pluginOptMap() {
  try { return JSON.parse(localStorage.getItem(LS_PLUGOPT)) || {}; } catch (e) { return {}; }
}
function pluginOptDef(id, key) {
  const p = (pluginList || []).find((x) => x && x.id === id);
  return p && Array.isArray(p.options) ? p.options.find((o) => o && o.key === key) || null : null;
}
function pluginOptGet(id, key) {
  const m = pluginOptMap();
  if (m[id] && key in m[id]) return m[id][key]; // 사용자 선택 우선
  const cp = channelPlugins();
  if (cp && cp[id] && cp[id].options && key in cp[id].options) return cp[id].options[key]; // 채널 기본값
  const d = pluginOptDef(id, key);
  return d ? d.default : undefined;
}
function pluginOptSet(id, key, v) {
  const m = pluginOptMap();
  (m[id] = m[id] || {})[key] = v;
  try { localStorage.setItem(LS_PLUGOPT, JSON.stringify(m)); } catch (e) {}
}
// 켜져 있는데 아직 안 불러온 확장을 불러온다 (채널 이동으로 방장 여부가 바뀐 경우 등)
function syncPlugins() {
  if (limitedMode || !pluginList) return;
  pluginList.forEach((p) => { if (pluginIsOn(p) && !pluginLoaded[p.id]) injectPlugin(p); });
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
    beta: true, // [BETA-ONLY-LINE] 베타 빌드 표시 (플러그인이 테스트 후크를 켤지 판단)
    on(evt, fn) {
      if (typeof fn !== 'function') return;
      fn.__kwPlugin = pluginInjecting;
      (__kwListeners[evt] = __kwListeners[evt] || []).push(fn);
    },
    toast(nick, body) { showCallToast(nick, body); },
    option(id, key) { return pluginOptGet(id, key); }, // 설정 > 확장에서 사용자가 고른 옵션 값
    enabled(id) { return pluginIdIsOn(id); }, // 설정 > 확장에서 켜져 있는지
    setOption(id, key, v) { pluginOptSet(id, key, v); try { if (setPanel && setPanel.isConnected) renderSettings(); } catch (e) {} }, // 플러그인 창의 X 버튼이 옵션을 끌 때 (설정 화면도 갱신)
    volume() { return volPct() / 100; }, // 설정 > 음향설정의 볼륨 (0~1)
    sink(target) { applySink(target); }, // AudioContext/Audio를 선택한 출력 장치로
    highlight(el) { highlightMessage(el); }, // 채팅 한 줄을 잠깐 강조 (불린 대화 이동과 같은 효과)
    sound() { playAlertSound(); }, // 설정 > 일반설정의 알림 소리 재생
    rsz(el, o) { try { return kwRsz(el, o); } catch (e) {} }, // 우하 리사이즈 핸들 (dir h=가로공유/v=세로/d=대각)
    float(el, o) { try { return kwFloatKey(el, o); } catch (e) {} }, // 좌상 + 띄우기 (key=위치 저장키, dock=복귀 추가동작)
    describe(info) { // 플러그인 자기 신고 (이름·버전은 플러그인이 가짐). UI는 메타 우선, 매니페스트는 폴백.
      try {
        if (pluginInjecting && info && typeof info === 'object') {
          pluginMeta[pluginInjecting] = {
            name: String(info.name || ''),
            version: String(info.version || ''),
          };
          if (setTab === 'ext') renderSettings();
        }
      } catch (e) {}
    },
    window(el, cfg) { try { return kwWindow(el, cfg); } catch (e) {} }, // 창 기본형 (색+띄우기+리사이즈+자석 일괄. rsz h/v/d)
    stackW(v) { try { return kwStackW(v); } catch (e) {} }, // 스택 너비 공유 (225~600)
    bridge(kind, params, timeoutMs) { try { return bridgeCall(kind, params, timeoutMs); } catch (e) { return Promise.resolve({ ok: false, error: 'bridge' }); } }, // 동반 브릿지 호출
    bridgeReady() { try { return bridgeIsReady(); } catch (e) { return false; } }, // 동반 감지 여부
    emit(evt, data) { kwEmit('ext:' + evt, data); }, // 플러그인끼리 이벤트 전달 (구독은 on('ext:이름'))
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

// 치지직 로그인이 안 되어 있으면 앱을 실행하지 않는다 (확인 실패도 미실행, 1분마다 재확인)
let appStarted = false;
let myUserIdHash = ''; // 로그인한 내 치지직 ID (채널 ID와 같으면 그 방송의 방장)
const isOwner = () => !!myUserIdHash && myUserIdHash === pageChannelId();
function checkLogin() {
  return fetch('https://comm-api.game.naver.com/nng_main/v1/user/getUserStatus', { credentials: 'include' })
    .then((r) => r.json())
    .then((j) => {
      const c = j && j.content;
      myUserIdHash = c && c.loggedIn && c.userIdHash ? String(c.userIdHash).toLowerCase() : '';
      return !!(c && c.loggedIn);
    })
    .catch(() => false);
}
function init() {
  if (appStarted) return;
  checkLogin().then((ok) => {
    if (appStarted) return;
    if (!ok) { dlog('not-logged-in'); setTimeout(init, 60000); return; }
    appStarted = true;
    initApp();
  });
}
function initApp() {
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
  setupResumeWatch();
  setInterval(checkRoute, 1000);
}

// [BETA-TEST-ONLY:start] 베타 진단용 후크 (정식에서는 제거): 콘솔에서 __kwDebug.jump(0) 등으로 직접 검증 가능
try { window.__kwDebug = { jump: jumpToHit, find: findElBySig, log: () => hitLog, dropsMin: dropsSimMin }; } catch (e) {}
// [BETA-TEST-ONLY:end]

if (!window.__kwAlertLoaded) {
  window.__kwAlertLoaded = true;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
