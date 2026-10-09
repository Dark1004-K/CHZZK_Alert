// ==UserScript==
// @name         CHZZK 채팅 호출 알림 (Keyword Alert)
// @namespace    https://chzzk.naver.com/
// @version      3.1.0
// @description  치지직(CHZZK) 생방송 채팅에서 등록한 단어(닉네임 등)가 언급되면 브라우저 알림 + 화면 토스트를 띄워줍니다.
// @author       DarkAngel
// @match        https://chzzk.naver.com/live/*
// @match        https://chzzk.naver.com/0a3deecf0fa1652445e3c97bc118272e*
// @run-at       document-start
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/Dark1004-K/Chzzk_Alert/main/chzzk_alert.user.js
// @updateURL    https://raw.githubusercontent.com/Dark1004-K/Chzzk_Alert/main/chzzk_alert.user.js
// ==/UserScript==

(function () {
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
const SCRIPT_VERSION = '3.1.0';
const UPDATE_URL = 'https://raw.githubusercontent.com/Dark1004-K/Chzzk_Alert/main/chzzk_alert.user.js';
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
const autoOn = () => { try { return localStorage.getItem(LS_AUTO) !== '0'; } catch (e) { return true; } }; // 기본 켜짐
const LS_SND = '__kw_snd'; // 알림 소리: 'dingdong'(기본) | 'custom'(내 파일)
const LS_SND_DATA = '__kw_snd_data'; // 내 파일 (data URL)
const LS_SND_NAME = '__kw_snd_name';
const SND_MAX_BYTES = 1500000; // 내 파일 최대 크기 (localStorage 용량 보호)
const sndMode = () => { try { return localStorage.getItem(LS_SND) === 'custom' && localStorage.getItem(LS_SND_DATA) ? 'custom' : 'dingdong'; } catch (e) { return 'dingdong'; } };
const LS_DROPS = '__kw_drops'; // 드롭스 창 표시 (기본 켜짐)
const dropsOn = () => { try { return localStorage.getItem(LS_DROPS) !== '0'; } catch (e) { return true; } };
const LS_REDUP = '__kw_redup_sec'; // 같은 호출 재알림 간격 (초, 기본 5, 0이면 항상 울림)
const LS_REDUP_OLD = '__kw_redup_min'; // 이전 버전(분 단위) 값은 초로 환산해 물려받음
function redupSec() {
  try {
    const v = parseFloat(localStorage.getItem(LS_REDUP));
    if (isFinite(v) && v >= 0 && v <= 7200) return v;
    const o = parseFloat(localStorage.getItem(LS_REDUP_OLD));
    if (isFinite(o) && o >= 0 && o <= 120) return o * 60;
  } catch (e) {}
  return 5;
}
const redupMs = () => redupSec() * 1000;
const LS_HITS_CID = '__kw_hits_cid'; // 불린 대화가 속한 채널 (다른 채널이면 초기화)
const loadHits = () => {
  try {
    const m = location.pathname.match(/\/live\/([0-9a-f]{32})/i);
    const stored = localStorage.getItem(LS_HITS_CID);
    if (m && stored && stored !== m[1].toLowerCase()) return [];
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
function dlog() {} // 정식: 콘솔 로그 없음
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
  return; // 정식: 진단 하트비트 없음
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
@keyframes __kwupd{0%,100%{box-shadow:0 8px 28px rgba(0,0,0,.6);border-color:#1f6feb}50%{box-shadow:0 0 22px 8px rgba(31,111,235,.95);border-color:#8bb8ff}}
#__kw_upd.blink{animation:__kwupd .7s ease-in-out infinite}
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
.__kw_hit{padding:4px 6px;border-radius:6px;cursor:pointer;font-size:12px;line-height:1.4;word-break:break-all;text-align:left}
.__kw_hit:hover{background:#2c2c31}
.__kw_hit_t{display:block;color:#888;font-size:10px;line-height:1.2;margin:0 0 1px}
.__kw_hit_k{color:#00ffa3;font-size:11px;margin-left:4px}
.__kw_hit_kw{color:#ffd400;font-weight:bold}
.__kw_hit.gone{opacity:.55}
.__kw_hit_gone{color:#ff7b7b;font-size:11px;margin-left:4px}
#__kw_stack{position:fixed;bottom:14px;left:14px;z-index:2147483647;display:flex;flex-direction:column;gap:8px;align-items:stretch;width:350px;max-width:calc(100vw - 28px)}
#__kw_stack #__kw_panel{position:static;width:100%;box-sizing:border-box;min-width:0;max-width:none}
#__kw_dropsp{width:100%;box-sizing:border-box;background:rgba(20,20,24,.94);color:#fff;font:13px sans-serif;padding:8px 10px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.5);border:1px solid #ff9f1a;display:none}
#__kw_dropsp .__kw_dr{display:flex;align-items:center;gap:8px}
#__kw_dropsp img{width:32px;height:32px;border-radius:6px;object-fit:cover;flex:none}
#__kw_dropsp .__kw_dr_b{flex:1;min-width:0}
#__kw_dropsp .__kw_dr_t{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#__kw_dropsp .__kw_dr_s{font-size:11px;color:#ff9f1a;margin-top:2px}
#__kw_histp{width:100%;box-sizing:border-box;background:rgba(20,20,24,.94);color:#fff;font:13px sans-serif;padding:8px 10px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.5);border:1px solid #ffd400}
#__kw_setp{position:absolute;left:calc(100% + 8px);bottom:0;width:440px;height:320px;box-sizing:border-box;background:rgba(20,20,24,.94);color:#fff;font:13px sans-serif;padding:8px 10px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.5);border:1px solid #777}
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
#__kw_grip{position:absolute;top:0;bottom:0;right:0;width:12px;cursor:ew-resize;z-index:1}
#__kw_grip:hover{background:rgba(0,255,163,.25)}
#__kw_grip::after{content:'';position:absolute;top:50%;left:50%;width:3px;height:30px;margin:-15px 0 0 -1.5px;border-radius:2px;background:rgba(255,255,255,.45)}
#__kw_grip:hover::after{background:#00ffa3}
#__kw_hgrip{position:relative;height:10px;margin:-4px 0 2px;cursor:ns-resize}
#__kw_hgrip::after{content:'';position:absolute;top:50%;left:50%;width:32px;height:3px;margin:-1.5px 0 0 -16px;border-radius:2px;background:rgba(255,255,255,.45)}
#__kw_hgrip:hover::after{background:#ffd400}
#__kw_stack #__kw_box{position:static;transform:none;width:100%;max-width:none;margin:0;display:none;align-items:stretch}
#__kw_box.fs{position:absolute;top:12px;left:50%;transform:translateX(-50%);width:min(520px,90%);z-index:2147483647}
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
function getCtx() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedCtx || sharedCtx.state === 'closed') sharedCtx = new Ctx();
  if (sharedCtx.state === 'suspended') sharedCtx.resume();
  return sharedCtx;
}
// 딩동: 높은 음 → 낮은 음, 기본음에 배음을 얹어 종소리 느낌
function playDingDong() {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [[987.77, 0], [783.99, 0.3]].forEach(([f, o]) => {
      [[1, 0.3], [2.01, 0.08]].forEach(([mul, vol]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = f * mul;
        gain.gain.setValueAtTime(0.0001, now + o);
        gain.gain.exponentialRampToValueAtTime(vol, now + o + 0.015);
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
    a.volume = 1;
    const p = a.play();
    if (p && p.catch) p.catch(() => playDingDong());
    return true;
  } catch (e) { return false; }
}
function playAlertSound() {
  try {
    const nowMs = Date.now();
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
  t.textContent = '🔔 ' + text.slice(0, 80);
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
      if (!takeHit(sig)) { dlog('DUP-dom-skip', JSON.stringify({ kw: kl })); break; }
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
      if (!takeHit(sig)) { dlog('DUP-dom-skip', JSON.stringify({ kw: kt })); break; }
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


// ---------- 패널 (#__kw_panel, 원본과 동일한 구조) + 목록 별도 화면 (#__kw_histp) ----------
let panel;
let stackEl = null, histPanel = null, histBox = null, histCount = null;
let midRowEl = null;
let curWidth = 350;
try { const wv = parseInt(localStorage.getItem(LS_W), 10); if (wv >= 216 && wv <= 600) curWidth = wv; } catch (e) {}
function setStackWidth(w) {
  curWidth = Math.max(216, Math.min(600, Math.round(w)));
  if (stackEl) stackEl.style.width = curWidth + 'px';
}
// 불린 대화 목록 높이: 위쪽 손잡이를 위로 끌면 커진다 (스택이 아래 고정이라). 한계 80px ~ 화면 높이의 85%
const LS_HH = '__kw_hits_h';
const HH_MIN = 80, HH_DEF = 150;
const hhMax = () => Math.max(HH_MIN, Math.floor(window.innerHeight * 0.85));
let histH = HH_DEF;
try { const hv = parseInt(localStorage.getItem(LS_HH), 10); if (hv >= HH_MIN && hv <= 4000) histH = hv; } catch (e) {}
let histCustom = false; // 사용자가 한 번이라도 끌어서 정한 높이면 항목 수와 상관없이 그 높이를 유지한다
try { histCustom = !!localStorage.getItem(LS_HH); } catch (e) {}
const HH_GAIN = 2; // 끄는 거리 대비 높이 변화 배율 (화면 위쪽에서 마우스가 더 못 올라가도 크게 늘릴 수 있게)
function applyHistHeight() {
  if (!histBox) return;
  const h = Math.min(histH, hhMax());
  histBox.style.maxHeight = h + 'px';
  histBox.style.height = histCustom ? h + 'px' : '';
}
function wireHGrip() {
  if (!histPanel) return;
  const g = histPanel.querySelector('#__kw_hgrip');
  if (!g || g.__kwWired) return;
  g.__kwWired = true;
  g.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
    const startY = e.clientY;
    const startH = histBox ? histBox.getBoundingClientRect().height : histH;
    const move = (ev) => {
      histCustom = true;
      histH = Math.max(HH_MIN, Math.min(hhMax(), Math.round(startH + (startY - ev.clientY) * HH_GAIN)));
      applyHistHeight();
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      try { localStorage.setItem(LS_HH, String(histH)); } catch (err) {}
      dlog('hits-height', histH);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
}
let setPanel = null;
let setOpen = false;
try { setOpen = localStorage.getItem(LS_SET) === '1'; } catch (e) {}
let setTab = 'general';
try { const st = localStorage.getItem(LS_TAB); if (st === 'words' || st === 'general' || st === 'ext' || st === 'about') setTab = st; } catch (e) {}
function ensureStack() {
  if (stackEl && stackEl.isConnected) return stackEl;
  let ex = null;
  try { ex = document.getElementById('__kw_stack'); } catch (e) {}
  if (ex) { stackEl = ex; setStackWidth(curWidth); return ex; }
  const s = document.createElement('div');
  s.id = '__kw_stack';
  document.body.appendChild(s);
  stackEl = s;
  setStackWidth(curWidth);
  return s;
}
function ensureMidrow() {
  ensureStack();
  if (midRowEl && midRowEl.isConnected) return midRowEl;
  let ex = null;
  try { ex = document.getElementById('__kw_midrow'); } catch (e) {}
  if (ex) { midRowEl = ex; wireGrip(); return ex; }
  const r = document.createElement('div');
  r.id = '__kw_midrow';
  stackEl.appendChild(r);
  midRowEl = r;
  const g = document.createElement('div');
  g.id = '__kw_grip';
  g.title = '드래그로 가로 조절';
  r.appendChild(g);
  wireGrip();
  return r;
}
function wireGrip() {
  if (!midRowEl) return;
  const g = midRowEl.querySelector('#__kw_grip');
  if (!g || g.__kwWired) return;
  g.__kwWired = true;
  g.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
    const startX = e.clientX;
    const startW = curWidth;
    const move = (ev) => setStackWidth(startW + (ev.clientX - startX));
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      try { localStorage.setItem(LS_W, String(curWidth)); } catch (err) {}
      dlog('width', curWidth);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
}
function attachHistHandlers() {
  if (!histPanel || histPanel.__kwWired) return;
  histPanel.__kwWired = true;
  wireHGrip();
  const c = histPanel.querySelector('#__kw_hits_clear');
  if (c) c.onclick = () => {
    hitLog = []; saveHits(); renderHitsList(); dlog('hits-cleared');
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
    applyHistHeight();
    attachHistHandlers();
    applyHistVisibility();
    renderHitsList();
    return;
  }
  const d = document.createElement('div');
  d.id = '__kw_histp';
  d.innerHTML = `<div id="__kw_hgrip" title="드래그로 높이 조절"></div><div id="__kw_hist_head"><span>🔔 불린 대화 <b id="__kw_hits_count">0</b></span><button class="__kw_ic" id="__kw_hits_clear" title="지우기">${IC.trash}</button></div><div id="__kw_hits"></div>`;
  stackEl.appendChild(d);
  histPanel = d;
  histBox = d.querySelector('#__kw_hits');
  histCount = d.querySelector('#__kw_hits_count');
  applyHistHeight();
  attachHistHandlers();
  applyHistVisibility();
  renderHitsList();
}
function applyHistVisibility() {
  applyDropsVisibility();
  if (!histPanel) return;
  const show = histOn() && panel && panel.classList.contains('show');
  histPanel.style.display = show ? 'block' : 'none';
}
function buildPanel() {
  ensureMidrow();
  panel = document.createElement('div');
  panel.id = '__kw_panel';
  midRowEl.appendChild(panel);
  renderPanel();
}
function ensureSettingsPanel() {
  ensureMidrow();
  if (setPanel && setPanel.isConnected) { applySetVisibility(); return; }
  let ex = null;
  try { ex = document.getElementById('__kw_setp'); } catch (e) {}
  if (ex) { setPanel = ex; renderSettings(); return; }
  const d = document.createElement('div');
  d.id = '__kw_setp';
  midRowEl.appendChild(d);
  setPanel = d;
  renderSettings();
}

// 서브 카운트줄은 삭제됨. 남은 카운트(불린 대화 수)는 renderHitsList에서 처리.
function updateStatsText() {}

// 통일 아이콘 세트 (인라인 SVG: 외부 요청 없이 단일 파일로 동작)
const IC = {
  sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6.5 7l.9 12.1a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9L17.5 7M10 11v6M14 11v6"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 3v5h-5"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>',
  house: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11l8-7 8 7M6 9.5V20h12V9.5"/></svg>',
  box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l9-5 9 5v8l-9 5-9-5V8zM3 8l9 5 9-5M12 13v8"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4V5z"/></svg>',
};
// 채널 표시명: 인가 목록 등록명 우선, 없으면 페이지에서 읽고, 그것도 없으면 ID 앞자리
function chDisplayName() {
  try {
    if (allowEntry && allowEntry.name) return allowEntry.name;
  } catch (e) {}
  const n = getPageChannelName();
  if (n) return n;
  const cid = pageChannelId();
  return cid ? cid.slice(0, 8) + '…' : '';
}
const okLinkUrl = (u) => /^(https?:|discord:)/i.test(u || '');
// 디스코드: 앱(discord://)을 먼저 호출하고, 앱이 안 열려 창 포커스가 유지되면 웹(https://)으로 대체
function openDiscord(u) {
  const m = /^https?:\/\/(?:discord\.gg|(?:www\.)?discord(?:app)?\.com\/invite)\/([\w-]+)/i.exec(u);
  const web = /^discord:/i.test(u) ? null : u;
  const app = m ? 'discord://-/invite/' + m[1] : (/^discord:/i.test(u) ? u : null);
  if (!app) { try { window.open(u, '_blank', 'noopener'); } catch (e) {} return; }
  let left = false;
  const onLeave = () => { left = true; };
  window.addEventListener('blur', onLeave);
  document.addEventListener('visibilitychange', onLeave);
  try {
    const f = document.createElement('iframe');
    f.style.display = 'none';
    f.src = app;
    document.body.appendChild(f);
    setTimeout(() => { try { f.remove(); } catch (e) {} }, 2000);
  } catch (e) { try { location.href = app; } catch (e2) {} }
  setTimeout(() => {
    window.removeEventListener('blur', onLeave);
    document.removeEventListener('visibilitychange', onLeave);
    if (!left && web) { try { window.open(web, '_blank', 'noopener'); } catch (e) {} }
  }, 1500);
}
function chLinksHtml() {
  let e = null;
  try { e = allowEntry; } catch (err) {}
  if (!e) return '';
  let h = '';
  if (e.home && okLinkUrl(e.home)) h += `<button class="__kw_ic" data-url="${escapeHtml(e.home)}" title="홈">${IC.house}</button>`;
  if (e.discord && okLinkUrl(e.discord)) h += `<button class="__kw_ic" data-url="${escapeHtml(e.discord)}" title="디스코드">${IC.chat}</button>`;
  return h;
}

function renderPanel() {
  if (!panel) return;
  panel.className = 'show' + (running ? '' : ' off');

  panel.innerHTML = `
    <div id="__kw_row"><div style="flex:1;min-width:0"><div id="__kw_ch"><b>${escapeHtml(chDisplayName())}</b><span id="__kw_links">${chLinksHtml()}<button class="__kw_ic" id="__kw_gear" title="설정" style="color:#ccc">${IC.sliders}</button></span></div><div id="__kw_titlerow"><div id="__kw_title" style="flex:1;min-width:0"><span id="__kw_dot"></span><b style="color:${running ? '#00ffa3' : '#ff4d4d'}">${running ? '감시중' : '중지됨'}</b> · 단어 ${keywords.length}개</div><button class="__kw_ic" id="__kw_btn" title="${running ? '정지' : '시작'}" style="color:${running ? '#ff6b6b' : '#00ffa3'}">${running ? IC.pause : IC.play}</button></div></div></div>
    <div id="__kw_warn" style="display:${limitedMode ? 'block' : 'none'};font-size:11px;color:#ffd400;margin-top:4px">⚠ 사용자 스크립트 허용 꺼짐: WS 감시 불가, DOM 감시만 동작. chrome://extensions → Tampermonkey 상세에서 허용 후 새로고침</div>`;

  panel.querySelector('#__kw_btn').onclick = () => (running ? stop() : start());
  panel.querySelector('#__kw_gear').onclick = () => {
    setOpen = !setOpen;
    try { localStorage.setItem(LS_SET, setOpen ? '1' : '0'); } catch (e) {}
    renderSettings();
  };
  const chRow = panel.querySelector('#__kw_ch');
  if (chRow) chRow.onclick = (ev) => {
    const b = ev.target && ev.target.closest ? ev.target.closest('[data-url]') : null;
    if (!b) return;
    const u = b.getAttribute ? b.getAttribute('data-url') : (b.dataset && b.dataset.url);
    if (u && okLinkUrl(u)) {
      if (b.getAttribute('title') === '디스코드') openDiscord(u);
      else { try { window.open(u, '_blank', 'noopener'); } catch (e) {} }
    }
  };
  updateWarn();
}

// ---------- 설정 별도 화면 (#__kw_setp, 감시 패널 아래) ----------
// 버전 비교: 같은 계열이면 숫자/베타번호로, 정식은 같은 번호의 베타보다 항상 새로움
function parseVer(v) {
  const m = String(v || '').match(/(\d+)\.(\d+)(?:\.(\d+))?(?:[-_.]?([A-Za-z]+)\.?(\d*))?/);
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: m[3] ? +m[3] : 0, pre: m[4] || '', preN: m[5] === '' || m[5] == null ? 0 : +m[5] };
}
function isNewer(remote, local) {
  const r = parseVer(remote), l = parseVer(local);
  if (!r || !l) return false;
  if (r.major !== l.major) return r.major > l.major;
  if (r.minor !== l.minor) return r.minor > l.minor;
  if (r.patch !== l.patch) return r.patch > l.patch;
  const rs = r.pre === '', ls = l.pre === '';
  if (rs !== ls) return rs;
  if (r.pre !== l.pre) return false;
  return r.preN > l.preN;
}
// 수동 업데이트 확인: 새 버전이 있을 때만 파란 업데이트 버튼을 켜줌
function checkUpdate() {
  const msg = setPanel ? setPanel.querySelector('#__kw_update_msg') : null;
  const btn = setPanel ? setPanel.querySelector('#__kw_update_check') : null;
  const go = setPanel ? setPanel.querySelector('#__kw_update_go') : null;
  const say = (t, hot) => {
    if (!msg) return;
    msg.textContent = t;
    if (hot) msg.classList.add('hot');
    else msg.classList.remove('hot');
  };
  if (btn) btn.disabled = true;
  say('확인 중...');
  const done = () => { if (btn) btn.disabled = false; };
  try {
    fetch(UPDATE_URL + '?t=' + Date.now(), { cache: 'no-store' })
      .then((r) => { if (!r || !r.ok) throw new Error('http'); return r.text(); })
      .then((t) => {
        const m = t.match(/@version\s+([^\s]+)/);
        if (!m) throw new Error('parse');
        const remote = m[1].trim();
        if (isNewer(remote, SCRIPT_VERSION)) {
          say('새 버전 있음: ' + SCRIPT_VERSION + ' → ' + remote, true);
          if (go) go.disabled = false;
          dlog('update-avail', remote);
        } else {
          say('최신 버전입니다 (' + SCRIPT_VERSION + ')', false);
          dlog('update-latest', remote);
        }
      })
      .catch(() => say('확인 실패 (네트워크)'))
      .then(done);
  } catch (e) {
    say('확인 실패 (네트워크)');
    done();
  }
}
// 플러그인 옵션 입력칸 (type: bool | number | multi)
function extOptHtml(p) {
  if (!pluginIsOn(p)) return ''; // 켜져 있을 때만 옵션을 보여준다
  if (!Array.isArray(p.options) || !p.options.length) return '';
  const rows = p.options.map((o) => {
    const v = pluginOptGet(p.id, o.key);
    const at = `data-pid="${escapeHtml(p.id)}" data-key="${escapeHtml(o.key)}"`;
    const lb = escapeHtml(o.label || o.key);
    if (o.type === 'bool') return `<div><label style="cursor:pointer"><input type="checkbox" class="__kw_popt" ${at} ${v ? 'checked' : ''}> ${lb}</label></div>`;
    if (o.type === 'number') return `<div>${lb} <input class="__kw_in __kw_popt" type="number" ${at} min="${Number(o.min) || 0}" max="${Number(o.max) || 999}" step="1" style="width:60px" value="${escapeHtml(String(v))}"></div>`;
    if (o.type === 'multi') {
      const sel = Array.isArray(v) ? v : [];
      const boxes = (o.choices || []).map((c) => `<label style="cursor:pointer;white-space:nowrap"><input type="checkbox" class="__kw_popt_m" ${at} data-val="${escapeHtml(c)}" ${sel.includes(c) ? 'checked' : ''}> ${escapeHtml(c)}</label>`).join('');
      return `<div>${lb}<div style="display:flex;flex-wrap:wrap;gap:2px 10px;margin-top:2px">${boxes}</div></div>`;
    }
    return '';
  }).join('');
  return `<div style="margin:0 0 6px 18px;font-size:12px;color:#ccc;display:flex;flex-direction:column;gap:4px">${rows}</div>`;
}
function extListHtml() {
  if (limitedMode) return '<div class="__kw_lbl" style="color:#ffd400">사용자 스크립트 허용이 꺼져 있어 확장을 쓸 수 없습니다</div>';
  if (pluginList === null) return '<div class="__kw_lbl">목록을 불러오는 중...</div>';
  if (!pluginList.length) return '<div class="__kw_lbl">등록된 확장이 없습니다</div>';
  return pluginList.map((p) => `<div class="__kw_lbl"><label style="cursor:pointer"><input type="checkbox" class="__kw_plug" data-id="${escapeHtml(p.id)}" ${pluginIsOn(p) ? 'checked' : ''}> ${escapeHtml(p.name || p.id)}</label>${p.desc ? ` <span style="color:#888">${escapeHtml(p.desc)}</span>` : ''}</div>${extOptHtml(p)}`).join('');
}
// 업데이트 설치(Tampermonkey 설치 창) 후 새로고침 안내 팝업.
// 설치 완료 여부는 직접 알 수 없어서, 설치 창이 닫히면 자동으로, 아니면 버튼으로 새로고침한다.
function showReloadPopup(installWin) {
  if (document.getElementById('__kw_upd')) return;
  const box = document.createElement('div');
  box.id = '__kw_upd';
  // 우리 앱 화면(설정 창, 닫혀 있으면 왼쪽 아래 스택) 위에 덮어서 보여준다
  let host = null;
  try { host = (setPanel && setPanel.isConnected && setPanel.style.display !== 'none') ? setPanel : stackEl; } catch (e) {}
  const hr = host && host.isConnected ? host.getBoundingClientRect() : null;
  const base = 'z-index:2147483647;background:rgba(14,14,18,.94);color:#fff;font:13px sans-serif;border-radius:12px;border:2px solid #1f6feb;box-shadow:0 8px 28px rgba(0,0,0,.6);box-sizing:border-box;text-align:left;';
  box.style.cssText = hr && hr.width > 120 && hr.height > 80
    ? base + 'position:fixed;left:' + hr.left + 'px;top:' + hr.top + 'px;width:' + hr.width + 'px;height:' + hr.height + 'px;padding:14px 16px;display:flex;flex-direction:column;justify-content:center;overflow:auto'
    : base + 'position:fixed;top:28%;left:50%;transform:translateX(-50%);padding:16px 18px;max-width:340px';
  box.innerHTML = '<div style="font-size:14px"><b>🔄 업데이트 설치 후 새로고침</b></div>' +
    '<div style="font-size:12px;color:#bbb;margin:8px 0 10px;line-height:1.5">새로 열린 Tampermonkey 창에서 <b>재설치/업데이트</b>를 누르세요<br>이후 화면이 갱신되면 알람 초기화가 일어날 수 있습니다</div>' +
    '<button class="__kw_b" id="__kw_upd_go" style="background:#1f6feb;color:#fff">새로고침</button> ' +
    '<button class="__kw_b" id="__kw_upd_x" style="background:#444;color:#fff">나중에</button>' +
    '<div id="__kw_upd_msg" style="font-size:12px;color:#ffd400;margin-top:8px"></div>';
  document.body.appendChild(box);
  let timer = null;
  const reload = () => { try { location.reload(); } catch (e) {} };
  const close = () => { if (timer) { clearInterval(timer); timer = null; } try { box.remove(); } catch (e) {} };
  box.querySelector('#__kw_upd_go').onclick = reload;
  box.querySelector('#__kw_upd_x').onclick = close;
  if (!installWin) return; // 팝업이 막혀 창 상태를 볼 수 없으면 버튼으로만
  timer = setInterval(() => {
    let closed = false;
    try { closed = !!installWin.closed; } catch (e) {}
    if (!closed) return;
    clearInterval(timer);
    timer = null;
    const msg = box.querySelector('#__kw_upd_msg');
    let n = 17;
    box.classList.add('blink'); // 카운트다운 동안 깜빡임
    const tick = () => {
      if (!box.isConnected) return;
      if (msg) msg.textContent = '설치 창이 닫혔습니다. ' + n + '초 뒤 새로고침합니다...';
      // 시작할 때와 마지막 3초에 알림음 (알람 끄기 상태면 소리 생략)
      if ((n === 17 || (n <= 3 && n > 0)) && !muted()) { lastSoundAt = 0; playAlertSound(); }
      if (n-- <= 0) { reload(); return; }
      setTimeout(tick, 1000);
    };
    tick();
  }, 1000);
}
function renderSettings() {
  if (!setPanel) return;
  setPanel.innerHTML = `
    <div style="display:flex;gap:14px;height:100%">
      <div class="__kw_tabs">
        <button class="__kw_tab${setTab === 'general' ? ' on' : ''}" data-tab="general">일반설정</button>
        <button class="__kw_tab${setTab === 'words' ? ' on' : ''}" data-tab="words">단어설정</button>
        <button class="__kw_tab${setTab === 'ext' ? ' on' : ''}" data-tab="ext">확장</button>
        <button class="__kw_tab${setTab === 'about' ? ' on' : ''}" data-tab="about">앱 정보</button>
      </div>
      <div id="__kw_set_body" style="flex:1;min-width:0;min-height:0;overflow-y:auto;display:flex;flex-direction:column">
        <div id="__kw_set_general" style="display:${setTab === 'general' ? 'block' : 'none'}">
          <div class="__kw_lbl"><label style="cursor:pointer"><input type="checkbox" id="__kw_auto" ${autoOn() ? 'checked' : ''}> 방송 들어가면 묻지 않고 자동으로 켜기</label></div>
          <div class="__kw_lbl"><label style="cursor:pointer"><input type="checkbox" id="__kw_hist" ${histOn() ? 'checked' : ''}> 불린 대화 목록 별도 표시 (클릭 이동)</label></div>
          <div class="__kw_lbl"><label style="cursor:pointer"><input type="checkbox" id="__kw_drops" ${dropsOn() ? 'checked' : ''}> 드롭스 보기 (진행 중인 드롭스가 있을 때만 표시)</label></div>
          <div class="__kw_lbl"><label style="cursor:pointer"><input type="checkbox" id="__kw_mute" ${muted() ? 'checked' : ''}> 알람 끄기 (감지·기록은 유지)</label></div>
          <div class="__kw_lbl">알림 소리 <select class="__kw_in" id="__kw_snd"><option value="dingdong">딩동</option><option value="custom">내 파일</option></select> <button class="__kw_b" id="__kw_snd_test" style="background:#444;color:#fff">들어보기</button></div>
          <div class="__kw_lbl" id="__kw_snd_row" style="display:${sndMode() === 'custom' ? 'block' : 'none'}"><input type="file" id="__kw_snd_file" accept="audio/*" style="max-width:150px;font-size:11px"> <span id="__kw_snd_name" style="color:#aaa"></span></div>
          <div class="__kw_lbl" id="__kw_snd_msg" style="color:#ffd400"></div>
          <div class="__kw_lbl"><label style="cursor:pointer;display:flex;align-items:center;gap:6px"><input type="checkbox" id="__kw_dedup" style="margin:0" ${dedupOn() ? 'checked' : ''}> 이미 울린 대화 재알림 방지</label></div>
          <div id="__kw_redup_grp" style="padding-left:20px;opacity:${dedupOn() ? 1 : 0.45}">
            <div class="__kw_lbl" style="margin-top:2px">같은 호출 다시 울리기까지 (초, 0이면 항상 울림)</div>
            <input class="__kw_in" id="__kw_redup" type="number" min="0" max="7200" step="1" style="width:80px" value="${redupSec()}" ${dedupOn() ? '' : 'disabled'}>
          </div>
        </div>
        <div id="__kw_set_words" style="display:${setTab === 'words' ? 'block' : 'none'}">
          <div class="__kw_lbl">호출 단어 (×로 삭제, 페이지 글자를 드래그해서도 추가 가능)</div>
          <div id="__kw_chips">${keywords.map((k, i) => `<span class="__kw_chip"><span>${escapeHtml(k)}</span><b data-i="${i}" title="삭제">×</b></span>`).join('')}</div>
          <div style="margin-top:6px"><input class="__kw_in" id="__kw_in" placeholder="추가할 단어" style="width:130px">
            <button class="__kw_b" id="__kw_add" style="background:#00ffa3;color:#000">추가</button></div>
          <div class="__kw_lbl">내 닉네임 (이 닉네임의 채팅은 알림 제외)</div>
          <input class="__kw_in" id="__kw_nick" style="width:130px" value="${escapeHtml(myNick)}">
        </div>
        <div id="__kw_set_ext" style="display:${setTab === 'ext' ? 'flex' : 'none'};flex-direction:column;flex:1">
          <div class="__kw_lbl">확장 모듈 설정(체크하면 켜짐)</div>
          ${extListHtml()}
          <div class="__kw_lbl" style="color:#888;margin-top:auto">끄면 이벤트 전달이 멈추고, 완전한 해제는 새로고침 후 적용됩니다</div>
        </div>
        <div id="__kw_set_about" style="display:${setTab === 'about' ? 'block' : 'none'}">
          <div class="__kw_lbl">프로그램</div>
          <div><b>CHZZK Alert</b></div>
          <div class="__kw_lbl">제작자</div>
          <div><b>비류라미</b></div>
          <div style="margin-top:6px;font-size:12px;color:#eee">"검은사막에서 미리내ES 님과 놀다 겁나 심심해서 만듬"</div>
          <div class="__kw_lbl">테스터</div>
          <div><b>데아앵커</b></div>
          <div style="margin-top:2px;font-size:12px;color:#eee">"쉬는 시간은 최고야!"</div>
          <div class="__kw_lbl">현재 버전</div>
          <div><b>${escapeHtml(SCRIPT_VERSION)}</b> <span style="color:#888">(정식)</span><button class="__kw_ic" id="__kw_update_check" title="업데이트 확인">${IC.refresh}</button><button class="__kw_upbtn" id="__kw_update_go" disabled>업데이트</button></div>
          <div id="__kw_update_msg" class="__kw_lbl"></div>
          <div class="__kw_lbl"><a href="https://github.com/Dark1004-K/Chzzk_Alert" target="_blank" rel="noopener" style="color:#00ffa3">GitHub 리포지토리</a> · <a href="https://github.com/Dark1004-K/Chzzk_Alert/blob/main/UPDATE.md" target="_blank" rel="noopener" style="color:#00ffa3">업데이트 내용</a></div>
        </div>
      </div>
    </div>`;

  setPanel.querySelectorAll('.__kw_tab').forEach((t) => {
    t.onclick = () => {
      setTab = t.dataset.tab;
      try { localStorage.setItem(LS_TAB, setTab); } catch (e) {}
      renderSettings();
    };
  });

  setPanel.querySelectorAll('#__kw_chips b').forEach((b) => {
    b.onclick = () => {
      keywords.splice(Number(b.dataset.i), 1);
      saveKeywords(keywords);
      refreshNormCache();
      renderPanel();
      renderSettings();
    };
  });
  const addBtn = setPanel.querySelector('#__kw_add');
  const addInput = setPanel.querySelector('#__kw_in');
  const doAdd = () => {
    const v = addInput.value.trim();
    if (v && !keywords.includes(v)) { keywords.push(v); saveKeywords(keywords); refreshNormCache(); renderPanel(); renderSettings(); }
  };
  addBtn.onclick = doAdd;
  addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
  setPanel.querySelector('#__kw_nick').onchange = (e) => { myNick = e.target.value; saveNick(myNick); refreshNormCache(); };
  setPanel.querySelector('#__kw_auto').onchange = (e) => localStorage.setItem(LS_AUTO, e.target.checked ? '1' : '0');
  setPanel.querySelector('#__kw_hist').onchange = (e) => {
    try { localStorage.setItem(LS_HIST, e.target.checked ? '1' : '0'); } catch (err) {}
    applyHistVisibility();
    renderHitsList();
  };
  setPanel.querySelector('#__kw_dedup').onchange = (e) => {
    try { localStorage.setItem(LS_DEDUP, e.target.checked ? '1' : '0'); } catch (err) {}
    // 재알림 방지를 끄면 "다시 울리기까지" 숫자는 입력할 수 없게 한다
    setPanel.querySelector('#__kw_redup').disabled = !e.target.checked;
    setPanel.querySelector('#__kw_redup_grp').style.opacity = e.target.checked ? '1' : '0.45';
  };
  setPanel.querySelectorAll('.__kw_plug').forEach((c) => {
    c.onchange = () => {
      const p = (pluginList || []).find((x) => x.id === c.dataset.id);
      if (p) { setPluginOn(p, c.checked); renderSettings(); } // 옵션 보임/숨김을 다시 그림
    };
  });
  setPanel.querySelectorAll('.__kw_popt').forEach((c) => {
    c.onchange = () => {
      const def = pluginOptDef(c.dataset.pid, c.dataset.key) || {};
      let v;
      if (c.type === 'checkbox') v = c.checked;
      else {
        v = parseFloat(c.value);
        if (!isFinite(v)) v = def.default;
        if (isFinite(def.min)) v = Math.max(def.min, v);
        if (isFinite(def.max)) v = Math.min(def.max, v);
        c.value = v;
      }
      pluginOptSet(c.dataset.pid, c.dataset.key, v);
    };
  });
  setPanel.querySelectorAll('.__kw_popt_m').forEach((c) => {
    c.onchange = () => {
      const all = [...setPanel.querySelectorAll('.__kw_popt_m')].filter((x) => x.dataset.pid === c.dataset.pid && x.dataset.key === c.dataset.key);
      pluginOptSet(c.dataset.pid, c.dataset.key, all.filter((x) => x.checked).map((x) => x.dataset.val));
    };
  });
  setPanel.querySelector('#__kw_drops').onchange = (e) => {
    try { localStorage.setItem(LS_DROPS, e.target.checked ? '1' : '0'); } catch (err) {}
    if (e.target.checked) startDrops(); else stopDrops();
  };
  // 알림 소리: 딩동(기본) / 내 파일(1.5MB 이하, 이 브라우저에 저장)
  const sndSel = setPanel.querySelector('#__kw_snd');
  const sndRow = setPanel.querySelector('#__kw_snd_row');
  const sndMsg = setPanel.querySelector('#__kw_snd_msg');
  const sndName = setPanel.querySelector('#__kw_snd_name');
  sndSel.value = sndMode();
  try { sndName.textContent = localStorage.getItem(LS_SND_NAME) || '(선택한 파일 없음)'; } catch (e) {}
  sndSel.onchange = () => {
    sndMsg.textContent = '';
    if (sndSel.value === 'custom' && !localStorage.getItem(LS_SND_DATA)) {
      sndRow.style.display = 'block';
      sndMsg.textContent = '파일을 선택하면 적용됩니다';
      return;
    }
    try { localStorage.setItem(LS_SND, sndSel.value); } catch (e) {}
    sndRow.style.display = sndSel.value === 'custom' ? 'block' : 'none';
  };
  setPanel.querySelector('#__kw_snd_file').onchange = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (f.size > SND_MAX_BYTES) { sndMsg.textContent = '파일이 너무 큽니다 (최대 약 1.5MB)'; e.target.value = ''; return; }
    const rd = new FileReader();
    rd.onload = () => {
      try {
        localStorage.setItem(LS_SND_DATA, String(rd.result));
        localStorage.setItem(LS_SND_NAME, f.name);
        localStorage.setItem(LS_SND, 'custom');
        sndSel.value = 'custom';
        sndName.textContent = f.name;
        sndMsg.textContent = '적용됨';
      } catch (err) {
        try { localStorage.removeItem(LS_SND_DATA); } catch (e2) {}
        sndMsg.textContent = '저장 실패 (브라우저 저장 공간 부족) — 더 작은 파일을 고르세요';
      }
    };
    rd.onerror = () => { sndMsg.textContent = '파일을 읽지 못했습니다'; };
    rd.readAsDataURL(f);
  };
  setPanel.querySelector('#__kw_snd_test').onclick = () => { lastSoundAt = 0; playAlertSound(); };
  const setBody = setPanel.querySelector('#__kw_set_body');
  if (setBody) setBody.addEventListener('wheel', (e) => { // 페이지가 휠을 가로채도 설정 본문은 스크롤되게
    if (setBody.scrollHeight <= setBody.clientHeight) return;
    e.stopPropagation();
    e.preventDefault();
    setBody.scrollTop += e.deltaY;
  }, { passive: false });
  setPanel.querySelector('#__kw_mute').onchange = (e) => {
    try { localStorage.setItem(LS_MUTE, e.target.checked ? '1' : '0'); } catch (err) {}
    dlog('mute', e.target.checked);
  };
  setPanel.querySelector('#__kw_redup').onchange = (e) => {
    let v = parseFloat(e.target.value);
    if (!isFinite(v) || v < 0) v = 0;
    if (v > 7200) v = 7200;
    try { localStorage.setItem(LS_REDUP, String(v)); } catch (err) {}
    e.target.value = v;
    dlog('redup', v);
  };
  const updateCheckBtn = setPanel.querySelector('#__kw_update_check');
  if (updateCheckBtn) updateCheckBtn.onclick = () => checkUpdate();
  const updateGoBtn = setPanel.querySelector('#__kw_update_go');
  if (updateGoBtn) updateGoBtn.onclick = () => {
    let w = null;
    try { w = window.open(UPDATE_URL, '_blank'); } catch (e) {}
    showReloadPopup(w);
  };
  applySetVisibility();
}
function applySetVisibility() {
  if (!setPanel) return;
  setPanel.style.display = (setOpen && panel && panel.classList.contains('show')) ? 'block' : 'none';
}

// start()/stop()이나 단어 추가/삭제처럼 구조가 바뀌는 경우만 renderPanel()을 쓰고,
// 채팅을 한 줄씩 훔을 때는 updateStatsText()만 쓰므로 이제 무한루프 위험이 없음.

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}


// ---------- 방송 진입 시 시작 여부 프롬프트 (#__kw_ask) ----------
function showAskPrompt() {
  if (autoOn()) { start(); return; }
  if (panel) panel.classList.remove('show');
  applyHistVisibility(); // 질문창이 떠 있는 동안 목록 화면도 함께 숨김
  applySetVisibility();
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
    applySetVisibility();
  };
  box.querySelector('#__kw_no').onclick = () => {
    box.remove();
    if (panel && isLivePage()) panel.classList.add('show');
    applyHistVisibility();
    applySetVisibility();
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


// ---------- 드롭스 창 (#__kw_dropsp, 감시 패널과 불린 대화 사이) ----------
// 공개 API로 채널의 드롭스 캠페인을 1분마다 확인하고, 없으면 창을 제거한다.
const DROPS_API = 'https://api.chzzk.naver.com/service/';
const DROPS_VAULT_URL = 'https://game.naver.com/profile#drops';
let dropsPanel = null, dropsPoll = null, dropsTick = null;
let dropsSaveN = 0;
let dropsCid = '', dropsJoinAt = 0, dropsNo = 0, dropsInfo = null;
let dropsDone = new Set(); // 시간 충족 알림을 이미 한 보상 번호
let dropsSrv = null; // 서버 집계 { min, claimed }. null이면 이 페이지 경과 시간으로 표시
let dropsSrvSynced = false;
let dropsCurNo = null; // 지금 창에 보여주는 보상 번호 (바뀌면 다시 그림)
// 새로고침해도 접속 시간 유지: 같은 채널이면 마지막 확인 후 10분 안에 돌아온 경우 이어서 센다
const LS_DJOIN = '__kw_drops_join';
const DROPS_RESUME_MS = 600000;
function loadJoin(cid) {
  try {
    const o = JSON.parse(localStorage.getItem(LS_DJOIN));
    if (o && o.cid === cid && o.joinAt && Date.now() - o.seen < DROPS_RESUME_MS) {
      return { joinAt: o.joinAt, done: Array.isArray(o.done) ? o.done : [] };
    }
  } catch (e) {}
  return { joinAt: Date.now(), done: [] };
}
function saveJoinAt() {
  if (!dropsCid) return;
  try { localStorage.setItem(LS_DJOIN, JSON.stringify({ cid: dropsCid, joinAt: dropsJoinAt, seen: Date.now(), done: [...dropsDone] })); } catch (e) {}
}
function fmtElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
function applyDropsVisibility() {
  if (!dropsPanel) return;
  const show = dropsInfo && dropsOn() && panel && panel.classList.contains('show');
  dropsPanel.style.display = show ? 'block' : 'none';
}
function removeDropsPanel() {
  if (dropsPanel) { try { dropsPanel.remove(); } catch (e) {} }
  dropsPanel = null;
}
// 시청 시간 기준으로 정렬한 보상 목록 (조건 분이 없는 보상은 제외)
function dropsRewards() {
  const l = (dropsInfo && dropsInfo.rewardList) || [];
  return l.filter((r) => r && isFinite(r.conditionForMinutes)).sort((a, b) => a.conditionForMinutes - b.conditionForMinutes);
}
// 서버(치지직)가 집계한 내 시청 분이 있으면 그 값을, 없으면(미로그인·집계 전) 이 페이지 경과 시간을 쓴다
function dropsElapsed() {
  return dropsSrv ? dropsSrv.min * 60000 : Date.now() - dropsJoinAt;
}
const dropsMet = (r, el) => (dropsSrv && dropsSrv.claimed.has(r.rewardNo)) || el >= r.conditionForMinutes * 60000;
// 아직 시간이 안 찬 첫 보상. 모두 찼으면 null
function dropsNextReward(el) {
  return dropsRewards().find((r) => !dropsMet(r, el)) || null;
}
function dropsSubHtml(el, cur) {
  const t = dropsSrv ? Math.floor(el / 60000) + '분' : fmtElapsed(el);
  return '시청 <b id="__kw_dr_time">' + t + '</b>' + (cur ? ' / ' + cur.conditionForMinutes + '분' : ' · 시간충족');
}
function renderDrops() {
  if (!dropsInfo || !dropsOn()) { removeDropsPanel(); return; }
  ensureStack();
  if (!dropsPanel || !dropsPanel.isConnected) {
    const d = document.createElement('div');
    d.id = '__kw_dropsp';
    stackEl.insertBefore(d, histPanel && histPanel.isConnected ? histPanel : null);
    dropsPanel = d;
  }
  const elapsed = dropsElapsed();
  const rewards = dropsRewards();
  const cur = dropsNextReward(elapsed);
  const r = cur || rewards[rewards.length - 1] || (dropsInfo.rewardList && dropsInfo.rewardList[0]) || null;
  dropsCurNo = cur ? cur.rewardNo : 'done';
  const title = r ? r.title : dropsInfo.title;
  const img = r && r.imageUrl ? `<img src="${escapeHtml(r.imageUrl)}" alt="">` : '';
  dropsPanel.innerHTML = `<div class="__kw_dr">${img}<div class="__kw_dr_b"><div class="__kw_dr_t" title="${escapeHtml(dropsInfo.title || '')}">🎁 ${escapeHtml(title || '드롭스')}</div><div class="__kw_dr_s">${dropsSubHtml(elapsed, cur)}</div></div><button class="__kw_ic" id="__kw_dr_refresh" title="새로고침" style="color:#ff9f1a">${IC.refresh}</button><button class="__kw_ic" id="__kw_dr_vault" title="보관함" style="color:#ff9f1a">${IC.box}</button></div>`;
  const rf = dropsPanel.querySelector('#__kw_dr_refresh');
  rf.onclick = () => { // 드롭스 정보와 서버 시청 시간을 바로 다시 가져옴 (연타 방지로 잠깐 비활성)
    rf.disabled = true;
    setTimeout(() => { rf.disabled = false; }, 3000);
    pollDrops();
  };
  dropsPanel.querySelector('#__kw_dr_vault').onclick = () => { try { window.open(DROPS_VAULT_URL, '_blank', 'noopener'); } catch (e) {} };
  applyDropsVisibility();
}
// 시간이 찬 보상을 알림 (토스트 + 브라우저 알림 + 소리, TTS는 확장이 'drops' 이벤트로 읽음)
function dropsReached(r, last) {
  const text = '드롭스 시간 충족: ' + r.title;
  kwEmit('drops', { title: r.title, minutes: r.conditionForMinutes, last: !!last });
  dlog('drops-reached', r.rewardNo, r.conditionForMinutes);
  if (muted()) return;
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      const n = new Notification('🎁 드롭스 시간 충족', { body: r.title.slice(0, 120), tag: 'kw-drops-' + r.rewardNo, requireInteraction: true, silent: true });
      n.onclick = () => { try { window.focus(); } catch (e) {} try { n.close(); } catch (e2) {} };
    } catch (e) {}
  }
  showToast(text);
  playAlertSound();
}
function dropsCheck() {
  if (!dropsInfo) return;
  const elapsed = dropsElapsed();
  const rewards = dropsRewards();
  rewards.forEach((r, k) => {
    if (dropsMet(r, elapsed) && !dropsDone.has(r.rewardNo)) {
      dropsDone.add(r.rewardNo);
      dropsReached(r, k === rewards.length - 1);
      saveJoinAt();
    }
  });
  const cur = dropsNextReward(elapsed);
  const curNo = cur ? cur.rewardNo : 'done';
  if (curNo !== dropsCurNo) { renderDrops(); return; } // 다음 보상으로 교체
  const sub = dropsPanel ? dropsPanel.querySelector('.__kw_dr_s') : null;
  if (sub) sub.innerHTML = dropsSubHtml(elapsed, cur);
}
// 서버 집계 시청 시간: 진행 중 보상(challenges)의 accumWatchMinutes, 받은 보상(claims)은 완료로 본다.
const DROPS_SRV = 'https://api.chzzk.naver.com/commercial/v2/drops/rewards/';
// 처음 서버 값을 받았을 때 이미 시간이 찬 보상은 알림 없이 기록만 한다
function syncDropsSrvDone() {
  if (!dropsSrv || dropsSrvSynced || !dropsInfo) return;
  dropsSrvSynced = true;
  const el = dropsElapsed();
  dropsRewards().forEach((r) => { if (dropsMet(r, el)) dropsDone.add(r.rewardNo); });
  saveJoinAt();
}
function fetchDropsServer(cid, no) {
  const get = (k) => fetch(DROPS_SRV + k, { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  Promise.all([get('challenges'), get('claims')]).then(([ch, cl]) => {
    if (cid !== dropsCid || no !== dropsNo) return;
    const chList = ((ch && ch.content && ch.content.challengeList) || []).filter((x) => x && x.campaignNo === no);
    const clList = ((cl && cl.content && cl.content.claimList) || []).filter((x) => x && x.campaignNo === no);
    if (!ch && !cl) return; // 미로그인/오류: 이 페이지 경과 시간으로 계속 표시
    const claimed = new Set(clList.map((x) => x.rewardNo));
    let min = null;
    chList.forEach((x) => { if (isFinite(x.accumWatchMinutes)) min = Math.max(min === null ? 0 : min, x.accumWatchMinutes); });
    if (min === null && claimed.size) { // 진행 중 보상이 없고 받은 보상만 있으면 모두 달성한 것
      min = dropsRewards().reduce((m, r) => Math.max(m, r.conditionForMinutes), 0);
    }
    if (min === null) return;
    const prev = dropsSrv ? dropsSrv.min : -1;
    dropsSrv = { min, claimed };
    if (min !== prev) dlog('drops-srv', 'min', min, 'claimed', claimed.size);
    syncDropsSrvDone();
    renderDrops();
  });
}
function pollDrops() {
  if (!dropsOn() || !isLivePage()) { dropsInfo = null; removeDropsPanel(); return; }
  const cid = pageChannelId();
  if (!cid) return;
  if (cid !== dropsCid) { // 채널이 바뀌면 접속 시간 초기화
    dropsCid = cid; const jn = loadJoin(cid); dropsJoinAt = jn.joinAt; dropsDone = new Set(jn.done); saveJoinAt(); dropsNo = 0; dropsInfo = null; dropsSrv = null; dropsSrvSynced = false; removeDropsPanel();
  }
  fetch(DROPS_API + 'v3.2/channels/' + cid + '/live-detail')
    .then((r) => { if (!r || !r.ok) throw new Error('http'); return r.json(); })
    .then((j) => {
      if (cid !== dropsCid) return;
      const no = j && j.content && j.content.dropsCampaignNo;
      if (!no) { dropsNo = 0; dropsInfo = null; dropsSrv = null; dropsSrvSynced = false; renderDrops(); return; }
      if (no === dropsNo && dropsInfo) { fetchDropsServer(cid, no); return; }
      dropsNo = no;
      dropsSrv = null; dropsSrvSynced = false;
      return fetch(DROPS_API + 'v1/drops/campaigns/' + no)
        .then((r) => { if (!r || !r.ok) throw new Error('http'); return r.json(); })
        .then((c) => {
          if (cid !== dropsCid || no !== dropsNo || !c || !c.content) return;
          dropsInfo = c.content;
          const el0 = Date.now() - dropsJoinAt; // 이미 시간이 찬 보상은 알리지 않고 기록만
          dropsRewards().forEach((r) => { if (el0 >= r.conditionForMinutes * 60000) dropsDone.add(r.rewardNo); });
          dlog('drops', no, dropsInfo.title);
          renderDrops();
          fetchDropsServer(cid, no);
        });
    })
    .catch(() => {}); // 네트워크 오류 시 현재 표시 유지
}
function startDrops() {
  if (!dropsPoll) dropsPoll = setInterval(pollDrops, 60000);
  if (!dropsTick) {
    dropsTick = setInterval(() => {
      dropsCheck();
      if (++dropsSaveN % 10 === 0) saveJoinAt();
    }, 1000);
  }
  pollDrops();
}
function stopDrops() {
  if (dropsPoll) { clearInterval(dropsPoll); dropsPoll = null; }
  if (dropsTick) { clearInterval(dropsTick); dropsTick = null; }
  dropsCid = ''; dropsNo = 0; dropsInfo = null; dropsDone = new Set(); dropsCurNo = null; dropsSrv = null; dropsSrvSynced = false;
  removeDropsPanel();
}

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
  if (m[id] && key in m[id]) return m[id][key];
  const d = pluginOptDef(id, key);
  return d ? d.default : undefined;
}
function pluginOptSet(id, key, v) {
  const m = pluginOptMap();
  (m[id] = m[id] || {})[key] = v;
  try { localStorage.setItem(LS_PLUGOPT, JSON.stringify(m)); } catch (e) {}
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
    option(id, key) { return pluginOptGet(id, key); }, // 설정 > 확장에서 사용자가 고른 옵션 값
    enabled(id) { return pluginIdIsOn(id); }, // 설정 > 확장에서 켜져 있는지
    sound() { playAlertSound(); }, // 설정 > 일반설정의 알림 소리 재생
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
function checkLogin() {
  return fetch('https://comm-api.game.naver.com/nng_main/v1/user/getUserStatus', { credentials: 'include' })
    .then((r) => r.json())
    .then((j) => !!(j && j.content && j.content.loggedIn))
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
  setInterval(checkRoute, 1000);
}


if (!window.__kwAlertLoaded) {
  window.__kwAlertLoaded = true;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
})();
