'use strict';

// ---------- 저장 (localStorage: 새로고침 후에도 유지) ----------
const LS_KEYWORDS = '__kw_keywords';
const LS_NICK = '__kw_mynick'; // 원본 스크립트가 쓴 키 이름과 동일하게 맞춤 (기존에 저장된 닉네임 그대로 불러옵)
const LS_NICK_OLD = '__kw_nick'; // 이전 버전에서 잘못 쓴 키 (혼용성 폴백)
const LS_AUTO = '__kw_auto_start';
const LS_HITS = '__kw_hits'; // 불린 대화 기록 (최대 30개, 새로고침 후에도 유지)
const LS_HIST = '__kw_hist_on'; // 불린 대화 목록 옵션 ('0'=끔, 그 외=켬)
const LS_SET = '__kw_set_open'; // 설정 화면 열림 상태
const LS_TAB = '__kw_set_tab'; // 설정 탭 ('general' | 'words' | 'about')
// 런타임에 보이는 버전/업데이트 주소 (@version 헤더와 함께 올릴 것)
const SCRIPT_VERSION = '2.8-beta35';
const UPDATE_URL = 'https://raw.githubusercontent.com/Dark1004-K/Chzzk_Alert/main/beta/chzzk_alert.beta.user.js';
const LS_W = '__kw_width'; // 스택 가로 (드래그 리사이즈, 기본 350)
const HITS_MAX = 30;

const loadKeywords = () => {
  try { return JSON.parse(localStorage.getItem(LS_KEYWORDS)) || []; } catch (e) { return []; }
};
const saveKeywords = (list) => localStorage.setItem(LS_KEYWORDS, JSON.stringify(list));
const loadNick = () => localStorage.getItem(LS_NICK) ?? localStorage.getItem(LS_NICK_OLD) ?? '';
const saveNick = (v) => localStorage.setItem(LS_NICK, v);
const histOn = () => { try { return localStorage.getItem(LS_HIST) !== '0'; } catch (e) { return true; } };
const LS_DEDUP = '__kw_dedup'; // 재알림 방지 옵션. 미설정 시 기존 목록옵션 값을 물려받음
const dedupOn = () => {
  try {
    const v = localStorage.getItem(LS_DEDUP);
    if (v === null) return localStorage.getItem(LS_HIST) !== '0';
    return v !== '0';
  } catch (e) { return true; }
};
const LS_MUTE = '__kw_mute'; // 알람 끄기 (감지·기록은 유지, 알림/토스트/소리만 생략)
const muted = () => { try { return localStorage.getItem(LS_MUTE) === '1'; } catch (e) { return false; } };
const LS_REDUP = '__kw_redup_min'; // 같은 호출 재알림 간격 (분, 기본 5, 0이면 항상 울림)
function redupMin() {
  try {
    const v = parseFloat(localStorage.getItem(LS_REDUP));
    if (isFinite(v) && v >= 0 && v <= 120) return v;
  } catch (e) {}
  return 5;
}
const redupMs = () => redupMin() * 60000;
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
const KW_TEST_TAG = '[KW-BETA]';
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
    ws: wsTracked, wsMsgs, hist: hitLog.length, limited: limitedMode, w: curWidth, allow: allowState,
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
      if (histSuppressed(fullSig)) { dlog('DUP-hist-skip', JSON.stringify({ kw: kt })); return; }
      if (!takeHit(fullSig)) { dlog('DUP-ws-skip', JSON.stringify({ kw: kt })); return; }
      hits++;
      recordHit(nick, text, kt, fullSig, null);
      scheduleStatsUpdate();
      dlog('HIT-ws', JSON.stringify({ kw: kt, nick: (nick || '').slice(0, 30), text: text.slice(0, 60) }));
      fireAlert(nick, text, null, kt);
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
// 불린 대화 목록: 클릭 이동용 + 같은 호출 재알림 간격 계산용
let hitLog = loadHits();
// 기록에 같은 서명이 간격 안에 있으면 재알림 생략 (스크롤 백필·접힘 리렌더·WS 리플레이 대응)
function histSuppressed(sig) {
  if (!dedupOn() || !sig) return false;
  const now = Date.now();
  const ttl = redupMs();
  for (const h of hitLog) {
    if (h.sig === sig && now - h.t < ttl) return true;
  }
  return false;
}
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
#__kw_dot{display:inline-block;width:11px;height:11px;border-radius:50%;background:#00ffa3;animation:__kwpulse 1.4s infinite;margin-right:8px;vertical-align:middle}
#__kw_ch{display:flex;align-items:center;justify-content:space-between;gap:6px;font-weight:bold;font-size:13px;margin-bottom:1px}
#__kw_links{display:inline-flex;gap:2px;align-items:center}
#__kw_titlerow{display:flex;align-items:center;gap:8px}
#__kw_panel.off #__kw_dot{background:#ff4d4d;animation:none}
#__kw_sub{font-size:11px;color:#aaa;margin-top:2px}
.__kw_b{border:0;border-radius:8px;padding:5px 9px;font:bold 12px sans-serif;cursor:pointer}
.__kw_chip{display:inline-flex;align-items:center;gap:4px;background:#333;border-radius:12px;padding:3px 8px;margin:2px;font-size:12px}
.__kw_chip b{cursor:pointer;color:#ff7b7b}
.__kw_in{background:#222;border:1px solid #555;color:#fff;border-radius:6px;padding:4px 6px;font-size:12px;user-select:text}
.__kw_lbl{font-size:11px;color:#aaa;margin:8px 0 3px}
#__kw_box{position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:2147483647;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none}
.__kw_toast{background:#ffd400;color:#000;font:bold 15px sans-serif;padding:12px 18px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.4);max-width:520px;pointer-events:auto;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#__kw_ask{position:fixed;bottom:14px;left:14px;z-index:2147483647;background:rgba(20,20,24,.96);color:#fff;font:13px sans-serif;padding:12px 14px;border-radius:12px;border:2px solid #ffd400;box-shadow:0 4px 16px rgba(0,0,0,.5);max-width:320px}
#__kw_ask .__kw_b{margin-top:8px;margin-right:6px}
#__kw_sel{position:absolute;z-index:2147483647;background:#00ffa3;color:#000;font:bold 12px sans-serif;padding:5px 9px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.5);cursor:pointer;display:none;white-space:nowrap}
.__kw_hl{outline:3px solid #ffd400 !important;background:rgba(255,212,0,.18) !important;border-radius:4px;transition:background 2.5s ease,outline-color 2.5s ease}
.__kw_hl.__kw_hl_fade{background:rgba(255,212,0,0) !important;outline-color:rgba(255,212,0,0) !important}
.__kw_hit{padding:4px 6px;border-radius:6px;cursor:pointer;font-size:12px;line-height:1.4;word-break:break-all}
.__kw_hit:hover{background:#2c2c31}
.__kw_hit_t{color:#888;font-size:11px;margin-right:4px}
.__kw_hit_k{color:#00ffa3;font-size:11px;margin-left:4px}
.__kw_hit_kw{color:#ffd400;font-weight:bold}
.__kw_hit.gone{opacity:.55}
.__kw_hit_gone{color:#ff7b7b;font-size:11px;margin-left:4px}
#__kw_stack{position:fixed;bottom:14px;left:14px;z-index:2147483647;display:flex;flex-direction:column;gap:8px;align-items:stretch;width:350px;max-width:calc(100vw - 28px)}
#__kw_stack #__kw_panel{position:static;width:100%;box-sizing:border-box;min-width:0;max-width:none}
#__kw_histp{width:100%;box-sizing:border-box;background:rgba(20,20,24,.94);color:#fff;font:13px sans-serif;padding:8px 10px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.5);border:1px solid #ffd400}
#__kw_setp{position:absolute;left:calc(100% + 8px);bottom:0;width:360px;height:320px;box-sizing:border-box;background:rgba(20,20,24,.94);color:#fff;font:13px sans-serif;padding:8px 10px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.5);border:1px solid #777}
.__kw_tabs{display:flex;flex-direction:column;gap:4px;flex:none}
.__kw_tab{border:1px solid #555;background:#222;color:#bbb;border-radius:8px;padding:6px 8px;font-size:12px;cursor:pointer;white-space:nowrap}
.__kw_tab.on{background:#00ffa3;color:#000;border-color:#00ffa3;font-weight:bold}
.__kw_ic{background:transparent;border:0;padding:5px;border-radius:8px;cursor:pointer;color:#ddd;display:inline-flex;align-items:center;justify-content:center;flex:none;vertical-align:middle}
#__kw_row .__kw_ic{align-self:center}
#__kw_stack input[type="checkbox"], #__kw_ask input[type="checkbox"]{accent-color:#00ffa3;width:14px;height:14px;vertical-align:-2px}
.__kw_ic:hover{background:rgba(255,255,255,.12)}
.__kw_ic:disabled{opacity:.3;cursor:default;background:transparent}
.__kw_ic svg{width:16px;height:16px;display:block}
.__kw_upbtn{background:#1f6feb;color:#fff;border:0;border-radius:8px;padding:5px 12px;font:bold 12px sans-serif;cursor:pointer;margin-left:6px}
.__kw_upbtn:disabled{background:#333;color:#777;cursor:default}
#__kw_update_msg{font-size:12px;color:#ddd;margin-top:4px}
#__kw_update_msg.hot{color:#00ffa3;font-weight:bold}
#__kw_set_about .__kw_ic{margin-left:6px}
#__kw_set_body .__kw_lbl:first-child{margin-top:0}
#__kw_midrow{position:relative;width:100%}
#__kw_grip{position:absolute;top:0;bottom:0;right:-6px;width:12px;cursor:ew-resize;z-index:1}
#__kw_grip:hover{background:rgba(0,255,163,.25)}
#__kw_stack #__kw_box{position:static;transform:none;width:100%;max-width:none;margin:0;display:none;align-items:stretch}
#__kw_box.fs{position:absolute;top:12px;left:50%;transform:translateX(-50%);width:min(520px,90%);z-index:2147483647}
#__kw_hist_head{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;font-weight:bold}
#__kw_hits{max-height:150px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;user-select:text}
#__kw_hits_clear{background:#444;color:#fff;padding:2px 7px;font-size:11px}
`;
  document.head.appendChild(style);
  } catch (e) {}
}

