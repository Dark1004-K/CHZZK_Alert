// CHZZK Alert plugin: 검은사막 — 월드 우두머리 레이드 출현 N분 전에 주황색 알림을 띄우고, 출현 시각까지 유지한다.
// 시간표 출처: https://www.kr.playblackdesert.com/ko-kr/Wiki?wikiNo=167 (표가 이미지라 직접 옮겨 적음)
// 시간표는 저장소의 bosses.json에서 받아온다(6시간마다). 받지 못하면 아래 DEFAULT_SCHEDULE(코드에 적힌 값)을 쓴다.
// 위키 시간표 이미지가 바뀌면 GitHub Actions(check-boss-schedule)가 알려 주고, bosses.json을 고치면 앱이 따라간다.
// 옵션(설정 > 확장): lead(몇 분 전), sound(알림음), bosses(알림받을 우두머리)
(function () {
  const KW = window.__KW;
  if (!KW || typeof KW.option !== 'function' || typeof KW.enabled !== 'function') return;
  if (window.__kwBdoLoaded) return;
  window.__kwBdoLoaded = true;
  const ID = 'blackdesert';
  const D = (a) => ({ 0: a, 1: a, 2: a, 3: a, 4: a, 5: a, 6: a });
  // 시간(KST) -> { 요일(0=일 ... 6=토): [우두머리...] }
  const DEFAULT_SCHEDULE = [
    ['00:15', { 4: ['벨'], 0: ['가모스'] }],
    ['02:00', { 1: ['크자카', '불가살'], 2: ['누베르', '우투리'], 3: ['오핀', '금돼지왕'], 4: ['카란다', '금돼지왕'], 5: ['쿠툼', '산군'], 6: ['쿠툼', '불가살'], 0: ['누베르', '산군'] }],
    ['11:00', { 1: ['누베르', '우투리'], 2: ['쿠툼', '금돼지왕'], 4: ['크자카', '산군'], 5: ['카란다', '불가살'], 6: ['카란다', '우투리'], 0: ['쿠툼', '불가살'] }],
    ['14:00', D(['가모스'])],
    ['16:00', { 1: ['쿠툼', '금돼지왕'], 2: ['누베르', '산군'], 3: ['카란다', '산군'], 4: ['누베르', '불가살'], 5: ['크자카', '우투리'], 6: ['크자카', '금돼지왕'], 0: ['카란다', '우투리'] }],
    ['17:00', { 0: ['벨'] }],
    ['19:00', { 3: ['귄트', '무라카'], 6: ['귄트', '무라카'] }],
    ['20:00', { 1: ['카란다', '산군'], 2: ['크자카', '불가살'], 3: ['쿠툼', '불가살'], 4: ['누베르', '우투리'], 5: ['누베르', '금돼지왕'], 0: ['크자카', '산군'] }],
    ['23:15', { 1: ['가모스'], 2: ['가모스'], 3: ['가모스'], 4: ['가모스'], 5: ['가모스'], 0: ['가모스'] }],
    ['23:30', { 1: ['오핀', '불가살'], 2: ['카란다', '우투리'], 3: ['크자카', '우투리'], 4: ['쿠툼', '금돼지왕'], 5: ['오핀', '산군'], 0: ['누베르', '금돼지왕'] }],
  ];
  const KST = 9 * 3600 * 1000;
  // 원격 시간표(bosses.json). 형식: { schedule: [ { time: '02:00', days: { '1': ['크자카', ...], ... } }, ... ] }
  const BOSS_URL = 'https://raw.githubusercontent.com/Dark1004-K/Chzzk_Alert/main/bosses.json';
  const BOSS_REFRESH_MS = 6 * 3600000;
  let schedule = DEFAULT_SCHEDULE;
  let bossFetchedAt = 0;
  function parseSchedule(j) {
    if (!j || !Array.isArray(j.schedule) || !j.schedule.length) return null;
    const out = [];
    for (const r of j.schedule) {
      if (!r || !/^\d{1,2}:\d{2}$/.test(String(r.time)) || !r.days || typeof r.days !== 'object') return null;
      const days = {};
      for (const k of Object.keys(r.days)) {
        if (!/^[0-6]$/.test(k) || !Array.isArray(r.days[k])) return null;
        days[k] = r.days[k].map(String);
      }
      out.push([String(r.time), days]);
    }
    return out;
  }
  function loadSchedule() {
    bossFetchedAt = Date.now(); // 실패해도 6시간 뒤에 다시 시도
    fetch(BOSS_URL + '?t=' + Date.now(), { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error('http'); return r.json(); })
      .then((j) => { const s = parseSchedule(j); if (s) schedule = s; })
      .catch(() => {}); // 실패하면 현재 시간표(처음엔 코드 기본값)를 유지
  }
  const DAY = 86400000;

  function opt(key, def) {
    try { const v = KW.option(ID, key); return v === undefined || v === null ? def : v; } catch (e) { return def; }
  }
  // 지금 기준 오늘/내일의 출현 목록 (절대 시각 ms)
  function occurrences(now, days) {
    const out = [];
    const midnight = Math.floor((now + KST) / DAY) * DAY - KST;
    for (let off = 0; off < (days || 2); off++) {
      const base = midnight + off * DAY;
      const day = new Date(base + KST).getUTCDay();
      for (const [hhmm, byDay] of schedule) {
        const bosses = byDay[day];
        if (!bosses) continue;
        const [h, m] = hhmm.split(':').map(Number);
        out.push({ t: base + (h * 60 + m) * 60000, hhmm, bosses });
      }
    }
    return out;
  }

  const tests = [];
  const warned30 = new Set(); // 30초 전 TTS를 이미 알린 출현 시각
  // [BETA-TEST-ONLY:start]
  // 테스트: 콘솔에서 __kwBdoTest(초) 를 호출하면 그 시간 뒤에 출현하는 가짜 우두머리 알림을 바로 띄운다 (옵션/필터 무시)
  if (KW.beta) { // 정식 앱에서는 테스트 후크를 만들지 않는다
    window.__kwBdoTest = (sec) => {
      const s = Math.max(5, Number(sec) || 60);
      const t = Date.now() + s * 1000;
      tests.push({ t, hhmm: '테스트', bosses: ['카란다', '우투리'], test: true });
      tick();
      return '테스트 알림: ' + s + '초 뒤 출현';
    };
  }
  // [BETA-TEST-ONLY:end]

  // ---------- 창 묶음(그룹): 다음 우두머리 + 쿠폰 모아보기 ----------
  // 평소에는 감시 화면(#__kw_stack)의 드롭스 창 아래에 붙어 있고, 맨 위의 손잡이를 끌면 화면 아무 곳으로 옮길 수 있다.
  // 옮기는 동안 화면 가장자리와 다른 창(초록·드롭스·불린 대화·설정)의 가장자리에 자석처럼 붙는다. 손잡이를 더블클릭하면 원래 자리로 돌아온다.
  // 스택 직속 배치: 그룹 컨테이너 없이 각 창을 감시 화면(#__kw_stack)에 직접 둔다 (순서: 드롭스 → 다음 → 쿠폰 → 파티 → 불린대화).
  // 가로(↔·대각의 가로축)는 스택 너비를 공유하고, 세로는 창마다 따로 저장한다.
  try { localStorage.removeItem('__kw_bdo_gpos'); } catch (e) {} // 묶음 위치값 잔재 정리
  const LS_CPNH = '__kw_cpn_h';
  const CPN_H_DEF = 190, CPN_H_MIN = 80;
  const cpnHMax = () => Math.max(CPN_H_MIN, window.innerHeight);
  let cpnH = CPN_H_DEF;
  try { const chv = parseInt(localStorage.getItem(LS_CPNH), 10); if (chv >= CPN_H_MIN && chv <= 4000) cpnH = chv; } catch (e) {}
  const LS_PARTYH = '__kw_party_h';
  const PARTY_H_DEF = 170, PARTY_H_MIN = 100;
  const partyHMax = () => Math.max(PARTY_H_MIN, window.innerHeight);
  let partyH = PARTY_H_DEF;
  try { const phv = parseInt(localStorage.getItem(LS_PARTYH), 10); if (phv >= PARTY_H_MIN && phv <= 4000) partyH = phv; } catch (e) {}
  function bdoOrder() { // 스택 안에서 다음→쿠폰→파티→가문 순서로, 불린대화 창 바로 위에 둔다 (띄운 창은 제외)
    try {
      const stack = document.getElementById('__kw_stack');
      if (!stack) return;
      const hist = document.getElementById('__kw_histp');
      const ref = (hist && hist.parentNode === stack) ? hist : null;
      [nextEl, cpnEl, partyEl, famEl].forEach((el) => {
        if (el && el.isConnected && el.parentNode === stack && el.style.position !== 'fixed' && ref && el !== ref) {
          try { stack.insertBefore(el, ref); } catch (er) {}
        }
      });
    } catch (e) {}
  }
  // 띄우기 위치 {x,y,w} (본체 KW.float이 읽는 형식과 동일). w는 225~600으로 감시중 창을 따름.
  const LS_BDOPPOS = '__kw_bdop_pos';
  const LS_CPNNPOS = '__kw_cpn_pos';
  const LS_PARTYPOS = '__kw_party_pos';
  function bdoPosGet(key) {
    try {
      const o = JSON.parse(localStorage.getItem(key));
      if (o && isFinite(o.x) && isFinite(o.y)) {
        return { x: +o.x, y: +o.y, w: isFinite(o.w) ? Math.max(225, Math.min(600, Math.round(o.w))) : 0 };
      }
    } catch (e) {}
    return null;
  }
  function bdoPosSaveEl(key, el) {
    try {
      const r = el.getBoundingClientRect();
      localStorage.setItem(key, JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width) }));
    } catch (e) {}
  }
  // 창 제목 아이콘 (이모지는 색을 못 바꿔서 SVG로): 다음 우두머리=파랑, 쿠폰=보라, 파티=주황
  const TI = (path, color) => '<span style="display:inline-flex;align-items:center;color:' + color + ';margin-right:5px"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg></span>';
  const TI_SWORDS = '<path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M14.5 6.5L18 3h3v3l-3.5 3.5M5 14l4 4M7 17l-3 3M3 19l2 2"/>';
  const TI_TICKET = '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 17v2M13 11v2"/>';
  const TI_USERS = '<circle cx="9" cy="8" r="3.2"/><path d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.2a4.2 4.2 0 0 1 4.5 4.3V20"/>';
  const TI_SEARCH = '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>';
  function placeGroup() { bdoOrder(); }
  // 감시 화면(#__kw_stack)의 드롭스 창 바로 아래에 파란색 "다음 우두머리" 창을 둔다 (스택 직속)
  let nextEl = null;
  function removeNext() {
    if (nextEl) { try { nextEl.remove(); } catch (e) {} }
    nextEl = null;
  }
  function fmtLong(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    const p = (n) => String(n).padStart(2, '0');
    return (h ? h + ':' : '') + p(m) + ':' + p(x);
  }
  function updateNext(now) {
    const stack = document.getElementById('__kw_stack');
    const panel = document.getElementById('__kw_panel');
    if (!opt('nextBoss', true) || !stack || !panel || !panel.classList.contains('show')) { removeNext(); return; }
    const sel = opt('bosses', null);
    let next = null;
    for (const o of occurrences(now, 8).sort((a, b) => a.t - b.t)) {
      if (o.t <= now) continue;
      const bosses = Array.isArray(sel) ? o.bosses.filter((b) => sel.includes(b)) : o.bosses;
      if (bosses.length) { next = { t: o.t, hhmm: o.hhmm, bosses }; break; }
    }
    if (!next) { removeNext(); return; }
    if (!nextEl || !nextEl.isConnected) {
      nextEl = document.createElement('div');
      nextEl.id = '__kw_bdop';
      nextEl.style.cssText = 'width:100%;box-sizing:border-box;background:rgb(20,20,24);color:#fff;font:13px sans-serif;padding:8px 10px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.5);border:1px solid #3b9eff;position:relative';
      nextEl.onclick = (e) => { // X 버튼 (내용을 매초 다시 그리므로 창에 한 번만 달아 둔다)
        if (e.target && e.target.closest && e.target.closest('#__kw_bdop_x')) { turnOff('nextBoss'); removeNext(); }
      };
      stack.appendChild(nextEl);
    }
    bdoOrder();
    const when = new Date(next.t + KST);
    const days = Math.floor((next.t + KST) / DAY) - Math.floor((now + KST) / DAY);
    const dayTxt = days === 0 ? '' : days === 1 ? '내일 ' : ['일', '월', '화', '수', '목', '금', '토'][when.getUTCDay()] + '요일 ';
    // 쿠폰 모아보기 창과 같은 디자인: 굵은 12px 제목 줄(이모지 아이콘 + 제목) → 보스 이름 줄 → 시각 줄
    nextEl.innerHTML = '<div style="display:flex;align-items:center;min-height:26px;padding-right:28px"><b style="font-size:12px;white-space:nowrap;display:inline-flex;align-items:center">' + TI(TI_SWORDS, '#3b9eff') + '다음 우두머리</b></div>' +
      // 한 줄: 보스 이름 · 출현 시각(11:00) ········· 남은 시간(34:08, 오른쪽 끝). 본문은 타이틀 글자 시작점에 맞춤
      '<div style="display:flex;align-items:center;gap:8px;margin-top:2px;padding-left:19px;padding-right:19px">' +
      '<div style="font-size:13px;font-weight:bold;display:flex;flex-wrap:wrap;gap:2px 10px;word-break:keep-all;min-width:0">' + next.bosses.map((n) => '<span>' + esc(n) + '</span>').join('') + '</div>' +
      '<span style="flex:none;font-size:12px;color:#3b9eff;white-space:nowrap">' + dayTxt + next.hhmm + '</span>' +
      '<span style="flex:none;margin-left:auto;font-size:12px;font-weight:bold;color:#3b9eff;white-space:nowrap">' + fmtLong(next.t - now) + '</span></div>' + xBtn('__kw_bdop_x', '#3b9eff', 'position:absolute;top:2px;right:3px');
    try { // 창 기본형 상속: 우두머리=가로 (dock=스택공유, float=자기너비)
      if (KW && typeof KW.window === 'function') KW.window(nextEl, { color: '#3b9eff', posKey: LS_BDOPPOS, rsz: 'h', dock: () => bdoOrder() });
      else if (KW && typeof KW.float === 'function') KW.float(nextEl, { color: '#3b9eff', key: LS_BDOPPOS, dock: () => bdoOrder() });
    } catch (e) {}
  }

  let box = null;
  const items = new Map(); // t -> { el, txt }
  const dismissed = new Set();
  function ensureBox() {
    if (box && box.isConnected) return box;
    box = document.createElement('div');
    box.id = '__kw_bdo';
    box.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:2147483647;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;max-width:92vw';
    (document.body || document.documentElement).appendChild(box);
    return box;
  }
  function beep() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      try { if (typeof KW.sink === 'function') KW.sink(ctx); } catch (e) {}
      const vf = typeof KW.volume === 'function' ? KW.volume() : 1;
      if (vf <= 0) { try { ctx.close(); } catch (e) {} return; }
      const now = ctx.currentTime;
      [0, 0.2, 0.4].forEach((o) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.frequency.value = 660;
        g.gain.setValueAtTime(0.0001, now + o);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.3 * vf), now + o + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + o + 0.16);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(now + o); osc.stop(now + o + 0.18);
      });
      setTimeout(() => { try { ctx.close(); } catch (e) {} }, 1500);
    } catch (e) {}
  }
  function fmt(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }
  function addItem(o) {
    const el = document.createElement('div');
    el.style.cssText = 'pointer-events:auto;display:flex;align-items:center;gap:10px;background:#ff9f1a;color:#1a1a1a;font:bold 15px sans-serif;padding:10px 14px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.45);border:2px solid #ffd08a';
    const txt = document.createElement('span');
    const x = document.createElement('button');
    x.textContent = '✕';
    x.title = '이 알림 닫기';
    x.style.cssText = 'border:0;background:rgba(0,0,0,.18);color:#1a1a1a;border-radius:6px;cursor:pointer;font:bold 12px sans-serif;padding:2px 6px';
    x.onclick = () => { dismissed.add(o.t); removeItem(o.t); };
    el.appendChild(txt); el.appendChild(x);
    ensureBox().appendChild(el);
    items.set(o.t, { el, txt });
  }
  function removeItem(t) {
    const it = items.get(t);
    if (it) { try { it.el.remove(); } catch (e) {} items.delete(t); }
  }
  function clearAll() {
    for (const t of [...items.keys()]) removeItem(t);
  }
  // ---------- 쿠폰 모아보기 (#__kw_cpn) ----------
  // 검은사막 사이트는 다른 사이트(치지직 페이지)에서 직접 읽을 수 없어서(CORS), 저장소의 coupons.json을 받아온다.
  // coupons.json은 scripts/crawl-coupons.js가 "쿠폰 모두 모아보기" 페이지를 읽어 갱신한다.
  // 앱이 켜질 때 한 번 받고, 창의 새로고침 버튼을 누르면 다시 받는다.
  const CPN_URL = 'https://raw.githubusercontent.com/Dark1004-K/Chzzk_Alert/main/coupons.json';
  const LS_CPN_FOLD = '__kw_cpn_fold';
  let cpnEl = null;
  let cpnData = null; // 마지막으로 받은 coupons.json
  let cpnState = 'idle'; // idle | loading | ok | err
  let cpnSig = ''; // 마지막으로 그린 내용의 서명 (바뀔 때만 다시 그림)
  let cpnFetchedAt = 0; // 마지막으로 받아온 시각
  const CPN_REFRESH_MS = 3600000; // 1시간마다 자동으로 다시 받는다
  let cpnBusyUntil = 0; // 이 시각까지는 "가져오는 중"(도는 아이콘)으로 보여줌 (너무 빨리 끝나도 눌린 것이 보이게)
  let cpnFlashUntil = 0; // 이 시각까지는 완료(체크)/실패(!) 표시
  let cpnFlashErr = false;
  const ICON_REFRESH = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 3v5h-5"/></svg>';
  const ICON_DONE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#7dffb3" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const ICON_FAIL = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ff7b7b" stroke-width="2.6" stroke-linecap="round"><path d="M12 6v8M12 18v.5"/></svg>';
  const pad2 = (n) => String(n).padStart(2, '0');
  // 창 오른쪽 위 X 버튼 (창 색에 맞춤). 누르면 설정 > 확장의 해당 옵션을 끈다.
  const xBtn = (id, color, style) => '<button id="' + id + '" title="닫기 (설정 > 확장에서 다시 켤 수 있음)" style="border:0;background:transparent;color:' + color + ';cursor:pointer;padding:5px;border-radius:8px;display:inline-flex;align-items:center;' + (style || '') + '"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
  const turnOff = (key) => { try { if (typeof KW.setOption === 'function') KW.setOption(ID, key, false); } catch (e) {} };
  const ICON_COPY = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>';
  const ICON_OK = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#7dffb3" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function cpnFolded() { try { return localStorage.getItem(LS_CPN_FOLD) === '1'; } catch (e) { return false; } }
  function cpnVisible(now) {
    const l = cpnData && Array.isArray(cpnData.coupons) ? cpnData.coupons : [];
    return l.filter((c) => c && c.code && (!c.expiresAt || c.expiresAt > now)); // 기간이 지난 쿠폰은 숨김
  }
  function removeCoupons() {
    if (cpnEl) { try { cpnEl.remove(); } catch (e) {} }
    cpnEl = null;
    cpnSig = '';
  }
  function loadCoupons(manual) {
    if (cpnState === 'loading') return;
    cpnState = 'loading';
    if (manual) cpnBusyUntil = Date.now() + 700;
    cpnSig = '';
    fetch(CPN_URL + '?t=' + Date.now(), { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error('http'); return r.json(); })
      .then((j) => { if (!j || !Array.isArray(j.coupons)) throw new Error('format'); cpnData = j; cpnState = 'ok'; })
      .catch(() => { cpnState = cpnData ? 'ok' : 'err'; }) // 실패해도 이전에 받은 목록은 유지
      .then(() => { cpnFetchedAt = Date.now(); }) // 실패해도 1시간 뒤에 다시 시도
      .then(() => {
        if (manual) { // 직접 누른 경우에만 완료/실패를 눈에 띄게 표시
          cpnFlashErr = cpnState === 'err';
          const wait = Math.max(0, cpnBusyUntil - Date.now()); // 최소 표시 시간만큼은 도는 모습 유지
          setTimeout(() => { cpnFlashUntil = Date.now() + 1400; cpnSig = ''; renderCoupons(Date.now()); setTimeout(() => { cpnSig = ''; }, 1500); }, wait);
        }
        cpnSig = '';
      });
  }
  function copyText(text, done) {
    const fallback = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done(true);
      } catch (e) { done(false); }
    };
    try { navigator.clipboard.writeText(text).then(() => done(true), fallback); } catch (e) { fallback(); }
  }
  function renderCoupons(now) {
    const list = cpnVisible(now);
    const fold = cpnFolded();
    const busy = cpnState === 'loading' || now < cpnBusyUntil;
    const flash = now < cpnFlashUntil;
    const sig = [cpnState, fold ? 1 : 0, busy ? 1 : 0, flash ? 1 : 0, cpnData ? cpnData.updatedAt : 0, cpnFetchedAt, list.map((c) => c.code).join(',')].join('|');
    if (sig === cpnSig && cpnEl && cpnEl.isConnected) return;
    cpnSig = sig;
    let h = '<div id="__kw_cpn_hd" style="display:flex;align-items:center;justify-content:flex-start;gap:4px;cursor:pointer;min-height:26px;padding-right:58px">' +
      '<b style="font-size:12px;white-space:nowrap;display:inline-flex;align-items:center">' + TI(TI_TICKET, '#b784ff') + '쿠폰 모아보기&nbsp;<span style="color:#b784ff">(' + list.length + ')</span></b>' +
      '<span style="display:inline-flex;align-items:center"><button id="__kw_cpn_rf" class="' + (busy ? '__kw_ic __kw_spin' : '') + '" title="' + (cpnFetchedAt ? '새로고침 (마지막 갱신 ' + pad2(new Date(cpnFetchedAt).getHours()) + ':' + pad2(new Date(cpnFetchedAt).getMinutes()) + ':' + pad2(new Date(cpnFetchedAt).getSeconds()) + ')' : '새로고침') + '" style="border:0;background:transparent;color:#b784ff;cursor:pointer;padding:5px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;position:relative;top:1.5px">' + (busy ? ICON_REFRESH : flash ? (cpnFlashErr ? ICON_FAIL : ICON_DONE) : ICON_REFRESH) + '</button>' +
      '<span title="' + (fold ? '펼치기' : '접기') + '" style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:8px;color:#b784ff;position:absolute;top:2px;right:29px;z-index:2"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="' + (fold ? 'M9 6l6 6-6 6' : 'M6 9l6 6 6-6') + '"/></svg></span></span></div>' + xBtn('__kw_cpn_x', '#b784ff', 'position:absolute;top:2px;right:3px;z-index:2');
    if (!fold) {
      h += '<div style="height:1px;background:rgba(255,255,255,.14);margin:4px -10px"></div>';
      h += '<div class="__kw_sb_cpn" style="flex:1;min-height:0;overflow-y:auto;margin-top:4px">';
      if (cpnState === 'err') h += '<div style="font-size:11px;color:#ff7b7b;margin-top:6px">쿠폰 목록을 받지 못했습니다. 새로고침(↻)을 눌러 보세요.</div>';
      else if (cpnState === 'idle' || (cpnState === 'loading' && !cpnData)) h += '<div style="font-size:11px;color:#aaa;margin-top:6px">불러오는 중...</div>';
      else if (!list.length) h += '<div style="font-size:11px;color:#aaa;margin-top:6px">사용할 수 있는 쿠폰이 없습니다.</div>';
      list.forEach((c, ci) => {
        h += '<div style="' + (ci ? 'margin-top:7px;padding-top:6px;border-top:1px solid rgba(255,255,255,.12)' : 'margin-top:2px') + '">' +
          '<div style="font-size:12px;font-weight:bold">' + esc(c.name || '쿠폰') + '</div>' +
          '<div style="margin:2px 0;display:flex;align-items:center;gap:6px"><code style="background:#2a2433;color:#e6d8ff;padding:1px 6px;border-radius:5px;font-size:12px;user-select:text;word-break:break-all">' + esc(c.code) + '</code>' +
          '<button class="__kw_cpn_cp" data-code="' + esc(c.code) + '" title="복사" style="border:0;background:transparent;color:#b784ff;cursor:pointer;padding:2px;display:inline-flex;align-items:center">' + ICON_COPY + '</button></div>' +
          (c.expires ? '<div style="font-size:11px;color:#b784ff">⏱ 만료 ' + esc(c.expires) + '</div>' : '') + '</div>';
      });
      if (cpnData && cpnData.updatedAt) {
        const d = new Date(cpnData.updatedAt + KST);
        const p2 = (n) => String(n).padStart(2, '0');
        h += '<div style="font-size:10px;color:#777;margin-top:6px">목록 갱신 ' + (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + ' ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + '</div>';
      }
      h += '</div>';
    }
    cpnEl.innerHTML = h;
    // 높이는 패널 통째로 명시 (내용 길이에 관계없이 조절이 바로 보이게). 접힘 상태는 자동 높이.
    try {
      cpnEl.style.display = 'flex';
      cpnEl.style.flexDirection = 'column';
      cpnEl.style.height = fold ? '' : Math.min(cpnH, cpnHMax()) + 'px';
    } catch (e5) {}
    const hd = cpnEl.querySelector('#__kw_cpn_hd');
    if (hd) hd.onclick = (e) => {
      if (e.target && e.target.id === '__kw_cpn_rf') return;
      try { localStorage.setItem(LS_CPN_FOLD, cpnFolded() ? '0' : '1'); } catch (er) {}
      cpnSig = '';
    };
    const cx = cpnEl.querySelector('#__kw_cpn_x');
    if (cx) cx.onclick = (e) => { e.stopPropagation(); turnOff('coupons'); removeCoupons(); };
    const rf = cpnEl.querySelector('#__kw_cpn_rf');
    if (rf) rf.onclick = (e) => { e.stopPropagation(); if (cpnState === 'loading') return; loadCoupons(true); renderCoupons(Date.now()); };
    cpnEl.querySelectorAll('.__kw_cpn_cp').forEach((el) => {
      el.onclick = (e) => {
        e.stopPropagation();
        copyText(el.getAttribute('data-code'), (ok) => {
          if (ok) { el.innerHTML = ICON_OK; el.title = '복사됨'; setTimeout(() => { cpnSig = ''; }, 1000); } // 잠깐 체크 표시 후 원래 아이콘으로
        });
      };
    });
    try { // 창 기본형 상속: 쿠폰=가로+세로
      if (KW && typeof KW.window === 'function') {
        KW.window(cpnEl, {
          color: '#b784ff', posKey: LS_CPNNPOS, rsz: 'd', dock: () => bdoOrder(),
          getH: () => cpnH,
          setH: (v) => {
            cpnH = Math.max(CPN_H_MIN, Math.min(cpnHMax(), v));
            cpnEl.style.height = Math.min(cpnH, cpnHMax()) + 'px';
          },
          saveH: () => { try { localStorage.setItem(LS_CPNH, String(cpnH)); } catch (er) {} },
        });
      } else {
        if (KW && typeof KW.rsz === 'function') {
          const cpos = bdoPosGet(LS_CPNNPOS);
          const base = {
            dir: 'd', color: '#b784ff',
            getH: () => cpnH,
            setH: (v) => {
              cpnH = Math.max(CPN_H_MIN, Math.min(cpnHMax(), v));
              const lst = cpnEl.querySelector('.__kw_sb_cpn');
              if (lst) lst.style.maxHeight = Math.min(cpnH, cpnHMax()) + 'px';
            },
            save: () => {
              try { localStorage.setItem(LS_CPNH, String(cpnH)); } catch (er) {}
              if (cpos) bdoPosSaveEl(LS_CPNNPOS, cpnEl);
            },
          };
          if (cpos) {
            base.wMode = 'self';
            base.getW = () => cpnEl.getBoundingClientRect().width;
            base.setW = (v) => { cpnEl.style.width = Math.max(225, Math.min(600, Math.round(v))) + 'px'; };
          }
          KW.rsz(cpnEl, base);
        }
        if (KW && typeof KW.float === 'function') KW.float(cpnEl, { color: '#b784ff', key: LS_CPNNPOS, dock: () => bdoOrder() });
      }
    } catch (e) {}
  }
  function updateCoupons(now) {
    const stack = document.getElementById('__kw_stack');
    const panel = document.getElementById('__kw_panel');
    if (!opt('coupons', true) || !stack || !panel || !panel.classList.contains('show')) { removeCoupons(); return; }
    if (cpnState === 'idle') loadCoupons(); // 처음 켜질 때 한 번 받아온다
    else if (cpnState !== 'loading' && now - cpnFetchedAt >= CPN_REFRESH_MS) loadCoupons(); // 이후 1시간마다 자동 갱신
    if (!cpnEl || !cpnEl.isConnected) {
      cpnEl = document.createElement('div');
      cpnEl.id = '__kw_cpn';
      cpnEl.style.cssText = 'width:100%;box-sizing:border-box;background:rgb(20,20,24);color:#fff;font:13px sans-serif;padding:8px 10px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.5);border:1px solid #b784ff;position:relative';
      cpnSig = '';
      stack.appendChild(cpnEl);
    }
    bdoOrder();
    renderCoupons(now);
  }

  // ---------- 파티모집 ----------
  // 치지직 채팅에 "#파티 검은사당 10분 내용..." 이라고 쓰면 등록된다. 종류는 아래 7가지(그 밖의 말은 "기타").
  // 한 사람(닉네임)당 진행 중인 모집은 1개만, 모집 시간(최대 10분, 안 쓰면 10분)이 지나면 저절로 사라진다.
  // 선택한 종류가 등록되면 알림(토스트·알림음·TTS)이 울린다. 목록은 이 페이지에서만 기억한다(새로고침하면 비움).
  const PARTY_KINDS = ['항해일퀘', '검은사당', '피의제단', '파티사냥', '아토락시온', '솔라레', '기타'];
  const PARTY_MAX_MIN = 10;
  let parties = []; // { id, nick, kind, content, exp }
  let partyEl = null, partySig = null;
  function partyKindsSel() {
    const v = opt('partyKinds', null);
    return Array.isArray(v) ? v : PARTY_KINDS.slice();
  }
  // "#파티"로 시작하는 채팅을 읽는다. 쓰는 법이 틀리면 { err: '이유' }, 맞으면 { kind, mins, content, clamped }.
  function parseParty(text) {
    const m = /^\s*#\s*파티([\s\S]*)$/.exec(String(text || ''));
    if (!m) return null; // #파티 로 시작하지 않으면 파티모집 채팅이 아님
    if (m[1] && !/^\s/.test(m[1])) return { err: "'#파티' 다음에 띄어쓰기를 하고 종류를 적어 주세요. 예) #파티 검은사당 10분 내용" };
    const body = (m[1] || '').trim();
    if (!body) return { err: '종류를 적어 주세요. 예) #파티 검은사당 10분 내용' };
    const mk = /^(\S+)([\s\S]*)$/.exec(body);
    const kind = mk[1];
    if (!PARTY_KINDS.includes(kind)) { // 종류(#파티 다음 두 번째 말)가 목록에 없으면 오류
      return { err: "'" + kind.slice(0, 12) + "'은(는) 없는 종류입니다. " + PARTY_KINDS.join(' · ') + ' 중 하나를 써 주세요.' };
    }
    let rest = mk[2];
    // 시간(종류 다음 세 번째 말)은 꼭 "X분" 형태여야 한다 (생략 불가). 쓴 분이 모집 시간이고, 10분을 넘게 써도 10분까지.
    let clamped = false;
    const mm = /^\s*(\d{1,4})\s*분\s*([\s\S]*)$/.exec(rest);
    if (!mm) {
      if (/^\s*\d+(?:\s|$)/.test(rest)) return { err: "시간은 '10분'처럼 숫자 뒤에 '분'을 붙여 주세요." };
      return { err: "종류 다음에 시간을 '10분'처럼 꼭 써 주세요 (생략할 수 없어요). 예) #파티 " + kind + ' 10분 내용' };
    }
    const n = parseInt(mm[1], 10);
    if (n < 1) return { err: '시간은 1분 이상으로 적어 주세요. 예) 5분' };
    if (n > PARTY_MAX_MIN) clamped = true;
    const mins = Math.min(PARTY_MAX_MIN, n);
    rest = mm[2];
    return { kind, mins, clamped, content: rest.replace(/\s+/g, ' ').trim().slice(0, 60) };
  }
  // 등록이 안 될 때(쓰는 법 오류·이미 모집 중) 이유를 토스트로 안내한다(파티 창에는 표시하지 않음). 같은 사람이 같은 이유로 도배하면 15초에 한 번만.
  const partyNoteGuard = new Map();
  function partyNotice(nick, reason) {
    const now = Date.now();
    const key = nick + '|' + reason;
    if (now - (partyNoteGuard.get(key) || 0) < 15000) return;
    partyNoteGuard.set(key, now);
    if (partyNoteGuard.size > 100) { for (const [k, t] of partyNoteGuard) { if (now - t > 60000) partyNoteGuard.delete(k); } }
    try { KW.toast('👥 파티 모집 안내', nick + ' · ' + reason); } catch (e) {}
  }
  function onChat(d) {
    try {
      if (!d || !KW.enabled(ID) || !opt('party', true)) return;
      const p = parseParty(d.text);
      if (!p) return;
      const nick = String(d.nick || '익명');
      if (p.err) { partyNotice(nick, p.err); return; }
      const now = Date.now();
      parties = parties.filter((x) => x.exp > now);
      const mine = parties.find((x) => x.nick === nick);
      if (mine) { // 한 사람당 1회: 진행 중인 모집이 끝나야 다시 등록할 수 있다
        partyNotice(nick, '이미 모집 중입니다. ' + fmt(mine.exp - now) + ' 뒤에 다시 등록할 수 있어요.');
        return;
      }
      const e = { id: now + '-' + Math.random().toString(36).slice(2, 6), nick, kind: p.kind, content: p.content, raw: String(d.text || ''), exp: now + p.mins * 60000 };
      parties.push(e);
      partySig = null;
      if (p.clamped) partyNotice(nick, '모집 시간은 최대 ' + PARTY_MAX_MIN + '분이라 ' + PARTY_MAX_MIN + '분으로 등록했어요.');
      if (partyKindsSel().includes(e.kind)) { // 선택한 종류만 알림
        try { KW.toast('👥 ' + e.kind + ' 파티 모집', nick + (e.content ? ': ' + e.content : '')); } catch (er) {}
        if (opt('sound', true)) { if (typeof KW.sound === 'function') KW.sound(); else beep(); }
        try { if (typeof KW.emit === 'function') KW.emit('party', { nick, kind: e.kind, content: e.content }); } catch (er) {}
      }
    } catch (e) {}
  }
  try { KW.on('chat', onChat); } catch (e) {}
  let partyDelBtn = () => ''; // 항목별 삭제 버튼 HTML (정식에서는 없음)
  // [BETA-TEST-ONLY:start]
  // 베타에서만: 진행 중인 파티 모집을 임의로 지울 수 있는 ✕ 버튼 (한 사람 1회 제한도 같이 풀림)
  if (KW.beta) {
    partyDelBtn = (id) => '<button data-pdel="' + esc(id) + '" title="이 모집 삭제 (베타 전용)" style="border:0;background:transparent;color:#ff7a59;cursor:pointer;padding:0 2px;font-size:13px;line-height:1;flex:none">✕</button>';
  }
  // [BETA-TEST-ONLY:end]
  // 파티 항목을 누르면 불린 대화처럼 그 채팅으로 스크롤한다. 지금 대화창에 없으면 없다고만 알린다.
  const collapse = (t) => String(t || '').replace(/\s+/g, '');
  function findPartyChat(e) {
    const want = collapse(e.raw);
    const nick = collapse(e.nick);
    let found = null;
    try {
      document.querySelectorAll('[class*="chatting_message"]').forEach((el) => { // 같은 글이 여러 번이면 가장 아래(최근) 것
        const t = collapse(el.textContent);
        if (t.includes(want) && (!nick || t.includes(nick))) found = el;
      });
    } catch (er) {}
    return found;
  }
  function jumpToParty(id) {
    const e = parties.find((x) => x.id === id);
    if (!e) return;
    const el = findPartyChat(e);
    if (!el) { try { KW.toast('👥 파티 모집', '현재 대화창에 없음'); } catch (er) {} return; }
    try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (er) { try { el.scrollIntoView(); } catch (er2) {} }
    try { if (typeof KW.highlight === 'function') KW.highlight(el); } catch (er) {}
  }
  function removeParty() {
    if (partyEl) { try { partyEl.remove(); } catch (e) {} }
    partyEl = null;
    partySig = null;
  }
  function updateParty(now) {
    const stack = document.getElementById('__kw_stack');
    const panel = document.getElementById('__kw_panel');
    if (!opt('party', true)) { parties = []; removeParty(); return; }
    if (!stack || !panel || !panel.classList.contains('show')) { removeParty(); return; }
    parties = parties.filter((x) => x.exp > now);
    const sel = partyKindsSel();
    const list = parties.filter((x) => sel.includes(x.kind));
    if (!partyEl || !partyEl.isConnected) {
      partyEl = document.createElement('div');
      partyEl.id = '__kw_bdo_party';
      partyEl.onclick = (e) => {
        if (e.target && e.target.closest && e.target.closest('#__kw_bdo_party_x')) { turnOff('party'); removeParty(); return; }
        if (e.target && e.target.closest && e.target.closest('[data-pdel]')) return; // 베타 삭제 버튼은 이동하지 않음
        const row = e.target && e.target.closest ? e.target.closest('[data-pjump]') : null;
        if (row) jumpToParty(row.getAttribute('data-pjump'));
      };
      stack.appendChild(partyEl);
      partySig = null;
      // [BETA-TEST-ONLY:start]
      partyEl.addEventListener('click', (e) => { // 베타 전용: ✕로 모집 삭제
        const b = e.target && e.target.closest ? e.target.closest('[data-pdel]') : null;
        if (!b) return;
        const id = b.getAttribute('data-pdel');
        parties = parties.filter((x) => x.id !== id);
        partySig = null;
        updateParty(Date.now());
      });
      // [BETA-TEST-ONLY:end]
    }
    // 스택 직속 1칸: 옆붙임 absolute 제거, 높이는 대각 핸들로 조절. 바깥은 overflow:visible이어야 좌상 +원과 우하 원이 잘리지 않음(목록 스크롤은 안쪽 .__kw_sb_pty가 담당)
    const css = 'position:relative;width:100%;height:' + Math.min(partyH, partyHMax()) + 'px;' + 'box-sizing:border-box;background:rgb(20,20,24);color:#fff;font:13px sans-serif;padding:8px 10px 18px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.5);border:1px solid #ff7a59;display:flex;flex-direction:column;overflow:visible';
    // 떠 있는 상태(fixed)에서는 손대지 않는다: cssText를 덮으면 left/top/width가 날아가 위치가 튐
    if (partyEl.style.position !== 'fixed' && partyEl.style.cssText !== css && partyEl.getAttribute('data-css') !== css) { partyEl.style.cssText = css; partyEl.setAttribute('data-css', css); }
    bdoOrder();
    const sig = list.map((x) => x.id).join(',');
    if (sig !== partySig) {
      partySig = sig;
      let h = '<div style="display:flex;align-items:center;min-height:26px;padding-right:28px;flex:none"><b style="font-size:12px;white-space:nowrap;display:inline-flex;align-items:center">' + TI(TI_USERS, '#ff7a59') + '파티 모집&nbsp;<span style="color:#ff7a59">(' + list.length + ')</span></b></div>' +
        xBtn('__kw_bdo_party_x', '#ff7a59', 'position:absolute;top:2px;right:3px;z-index:2') +
        '<div style="flex:none;height:1px;background:rgba(255,255,255,.14);margin:4px -10px 0"></div>' +
        '<div class="__kw_sb_pty" style="flex:1;min-height:0;overflow-y:auto;margin-top:4px">';
      if (!list.length) h += '<div style="font-size:11px;color:#aaa;margin-top:6px;line-height:1.5">모집 중인 파티가 없습니다.<br>채팅에 <b>#파티 검은사당 10분 내용</b> 처럼 쓰면 등록됩니다.</div>';
      list.forEach((x, xi) => {
        h += '<div data-pjump="' + esc(x.id) + '" title="클릭하면 해당 채팅으로 이동" style="' + (xi ? 'margin-top:7px;padding-top:6px;border-top:1px solid rgba(255,255,255,.12);' : 'margin-top:2px;') + 'cursor:pointer">' +
          '<div style="display:flex;align-items:center;gap:6px"><span style="background:#3a2a24;color:#ff9a7a;border-radius:6px;padding:1px 6px;font-size:11px;font-weight:bold;white-space:nowrap">' + esc(x.kind) + '</span>' +
          '<b style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0">' + esc(x.nick) + '</b>' +
          '<span data-pexp="' + x.exp + '" style="margin-left:auto;font-size:11px;color:#ff9a7a;white-space:nowrap"></span>' + partyDelBtn(x.id) + '</div>' +
          (x.content ? '<div style="font-size:12px;color:#ddd;margin-top:3px;word-break:break-all">' + esc(x.content) + '</div>' : '') + '</div>';
      });
      h += '</div>';
      const sc = partyEl.querySelector('.__kw_sb_pty');
      const top = sc ? sc.scrollTop : 0;
      partyEl.innerHTML = h;
      const sc2 = partyEl.querySelector('.__kw_sb_pty');
      if (sc2) sc2.scrollTop = top;
    }
    partyEl.querySelectorAll('[data-pexp]').forEach((el) => { el.textContent = fmt(Number(el.getAttribute('data-pexp')) - now) + ' 남음'; });
    try { // 창 기본형 상속: 파티=가로+세로
      if (KW && typeof KW.window === 'function') {
        KW.window(partyEl, {
          color: '#ff7a59', posKey: LS_PARTYPOS, rsz: 'd', dock: () => bdoOrder(),
          getH: () => partyH,
          setH: (v) => {
            partyH = Math.max(PARTY_H_MIN, Math.min(partyHMax(), v));
            partyEl.style.height = Math.min(partyH, partyHMax()) + 'px';
            partyEl.setAttribute('data-css', partyEl.style.cssText);
          },
          saveH: () => { try { localStorage.setItem(LS_PARTYH, String(partyH)); } catch (er) {} },
        });
      } else {
        if (KW && typeof KW.rsz === 'function') KW.rsz(partyEl, {
          dir: 'v', color: '#ff7a59',
          getH: () => partyH,
          setH: (v) => {
            partyH = Math.max(PARTY_H_MIN, Math.min(partyHMax(), v));
            partyEl.style.height = Math.min(partyH, partyHMax()) + 'px';
            partyEl.setAttribute('data-css', partyEl.style.cssText);
          },
          save: () => { try { localStorage.setItem(LS_PARTYH, String(partyH)); } catch (er) {} },
        });
        if (KW && typeof KW.float === 'function') KW.float(partyEl, { color: '#ff7a59', key: LS_PARTYPOS, dock: () => bdoOrder() });
      }
    } catch (e) {}
  }

  // ---------- 가문검색 (#__kw_bdo_family) ----------
  // 미리 등록된 가문(data/adventure-targets.json)만 검색된다. 목록은 scripts/crawl-adventurers.js가
  // 시간마다 읽어 adventurers.json으로 올린다 (브라우저 CORS 우회, 쿠폰과 같은 방식).
  const FAM_URL = 'https://raw.githubusercontent.com/Dark1004-K/Chzzk_Alert/main/adventurers.json';
  const FAM_REFRESH_MS = 3600000; // 1시간마다 자동 갱신 (프로필 갱신 주기와 동일)
  const LS_FAMPOS = '__kw_family_pos';
  const LS_FAMQ = '__kw_family_q';
  let famEl = null, famSig = null;
  let famData = null; // 마지막으로 받은 adventurers.json
  let famState = 'idle'; // idle | loading | ok | err
  let famFetchedAt = 0;
  let famQuery = '';
  try { famQuery = localStorage.getItem(LS_FAMQ) || ''; } catch (e) {}
  function removeFamily() {
    if (famEl) { try { famEl.remove(); } catch (e) {} }
    famEl = null;
    famSig = null;
  }
  function loadFam() {
    if (famState === 'loading') return;
    famState = 'loading';
    famSig = null;
    fetch(FAM_URL + '?t=' + Date.now(), { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error('http'); return r.json(); })
      .then((j) => { if (!j || !Array.isArray(j.families)) throw new Error('format'); famData = j; famState = 'ok'; })
      .catch(() => { famState = famData ? 'ok' : 'err'; }) // 실패해도 이전에 받은 목록은 유지
      .then(() => { famFetchedAt = Date.now(); famSig = null; });
  }
  function famFind(q) {
    const l = famData && Array.isArray(famData.families) ? famData.families : [];
    const t = String(q || '').trim();
    if (!t) return null;
    return l.find((f) => f && f.family === t) || l.find((f) => f && f.family && f.family.includes(t)) || null;
  }
  function renderFamily() {
    if (!famEl || !famEl.isConnected) return;
    const q = famQuery;
    const f = q ? famFind(q) : null;
    const sig = [famState, f ? f.family : '', f ? (f.characters || []).length : 0, famFetchedAt].join('|');
    if (sig === famSig) return;
    famSig = sig;
    let h = '<div style="display:flex;align-items:center;min-height:26px;padding-right:28px;flex:none"><b style="font-size:12px;white-space:nowrap;display:inline-flex;align-items:center">' + TI(TI_SEARCH, '#ff7ab8') + '가문검색</b></div>' +
      xBtn('__kw_bdo_family_x', '#ff7ab8', 'position:absolute;top:2px;right:3px;z-index:2') +
      '<div style="display:flex;gap:6px;margin-top:4px;flex:none"><input id="__kw_fam_q" class="__kw_in" placeholder="가문명 입력" value="' + esc(q) + '" style="flex:1;min-width:0"><button id="__kw_fam_go" title="검색" style="border:0;border-radius:6px;background:#ff7ab8;color:#000;font:bold 12px sans-serif;padding:4px 10px;cursor:pointer;flex:none">검색</button></div>' +
      '<div class="__kw_sb_fam" style="flex:1;min-height:0;overflow-y:auto;margin-top:4px;max-height:min(420px,60vh)">';
    if (famState === 'err') h += '<div style="font-size:11px;color:#ff7b7b;margin-top:6px">가문 목록을 받지 못했습니다. 잠시 뒤 다시 시도하세요.</div>';
    else if (famState === 'loading' || !famData) h += '<div style="font-size:11px;color:#aaa;margin-top:6px">불러오는 중...</div>';
    else if (q && !f) h += '<div style="font-size:11px;color:#aaa;margin-top:6px;line-height:1.5">등록되지 않은 가문입니다.<br>GitHub Issues로 등록을 요청하세요.</div>';
    else {
      h += '<div style="margin-top:6px;font-size:12px"><b>' + esc(f.family) + '</b>' +
        (f.created ? ' <span style="color:#888;font-size:11px">' + esc(f.created) + '</span>' : '') +
        (f.guild ? ' <span style="color:#ff7ab8;font-size:11px">' + esc(f.guild) + '</span>' : '') + '</div>';
      (f.characters || []).forEach((c) => {
        h += '<div style="display:flex;align-items:center;gap:6px;margin-top:5px;padding-top:5px;border-top:1px solid rgba(255,255,255,.12)">' +
          '<b style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1">' + esc(c.name || '?') + (c.main ? ' <span style="color:#ff7ab8;font-size:10px">대표</span>' : '') + '</b>' +
          '<span style="font-size:11px;color:#ddd;white-space:nowrap">' + esc(c.class || '') + '</span>' +
          '<span style="font-size:11px;color:' + (c.level ? '#7dffb3' : '#888') + ';white-space:nowrap">' + (c.level ? 'Lv' + c.level : '비공개') + '</span></div>';
      });
      if (famData && famData.updatedAt) {
        const d = new Date(famData.updatedAt + KST);
        const p2 = (n) => String(n).padStart(2, '0');
        h += '<div style="font-size:10px;color:#777;margin-top:6px">목록 갱신 ' + (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + ' ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + '</div>';
      }
    }
    h += '</div>';
    famEl.innerHTML = h;
    const qi = famEl.querySelector('#__kw_fam_q');
    const go = () => {
      famQuery = qi ? qi.value : '';
      try { localStorage.setItem(LS_FAMQ, famQuery); } catch (er) {}
      famSig = null;
      renderFamily();
      famResQ = famQuery;
      famResSig = null;
      updateFamRes(Date.now());
    };
    if (qi) qi.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    const gb = famEl.querySelector('#__kw_fam_go');
    if (gb) gb.onclick = go;
    const fx = famEl.querySelector('#__kw_bdo_family_x');
    if (fx) fx.onclick = (e) => { e.stopPropagation(); turnOff('family'); removeFamily(); removeFamRes(); };
  }
  function updateFamily(now) {
    const stack = document.getElementById('__kw_stack');
    const panel = document.getElementById('__kw_panel');
    if (!opt('family', true)) { removeFamily(); return; }
    if (!stack || !panel || !panel.classList.contains('show')) { removeFamily(); return; }
    if (famState === 'idle') loadFam(); // 처음 켜질 때 한 번 받아온다
    else if (famState !== 'loading' && now - famFetchedAt >= FAM_REFRESH_MS) loadFam(); // 이후 1시간마다 자동 갱신
    if (!famEl || !famEl.isConnected) {
      famEl = document.createElement('div');
      famEl.id = '__kw_bdo_family';
      famEl.style.cssText = 'position:relative;width:100%;box-sizing:border-box;background:rgb(20,20,24);color:#fff;font:13px sans-serif;padding:8px 10px 18px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.5);border:1px solid #ff7ab8;display:flex;flex-direction:column;overflow:visible';
      famSig = null;
      stack.appendChild(famEl);
    }
    bdoOrder();
    renderFamily();
    try { // 창 기본형 상속: 가문검색=가로 (높이는 내용 자동)
      if (KW && typeof KW.window === 'function') {
        KW.window(famEl, { color: '#ff7ab8', posKey: LS_FAMPOS, rsz: 'h', dock: () => bdoOrder() });
      } else {
        if (KW && typeof KW.rsz === 'function') KW.rsz(famEl, { dir: 'h', color: '#ff7ab8' });
        if (KW && typeof KW.float === 'function') KW.float(famEl, { color: '#ff7ab8', key: LS_FAMPOS, dock: () => bdoOrder() });
      }
    } catch (e) {}
  }

  // ---------- 가문검색 결과창 (#__kw_bdo_family_r: 검색창 오른쪽 별도 창, 가로+세로) ----------
  const LS_FAMRPOS = '__kw_family_r_pos';
  const LS_FAMRH = '__kw_family_r_h';
  const FAMR_H_DEF = 300, FAMR_H_MIN = 120;
  const famRHMax = () => Math.max(FAMR_H_MIN, window.innerHeight);
  let famRH = FAMR_H_DEF;
  try { const fhv = parseInt(localStorage.getItem(LS_FAMRH), 10); if (fhv >= FAMR_H_MIN && fhv <= 4000) famRH = fhv; } catch (e) {}
  let famResEl = null, famResSig = null;
  let famResQ = ''; // 결과창에 보여줄 검색어 (''면 결과창 숨김)
  function removeFamRes() {
    if (famResEl) { try { famResEl.remove(); } catch (e) {} }
    famResEl = null;
    famResSig = null;
  }
  // 결과창 위치: 저장된 곳, 없으면 검색창 오른쪽
  function placeFamRes() {
    if (!famResEl) return;
    let done = false;
    try {
      const o = JSON.parse(localStorage.getItem(LS_FAMRPOS));
      if (o && isFinite(o.x) && isFinite(o.y)) {
        const w = isFinite(o.w) ? Math.max(225, Math.min(600, Math.round(o.w))) : 300;
        famResEl.style.position = 'fixed';
        famResEl.style.left = Math.max(0, Math.min(window.innerWidth - w, o.x)) + 'px';
        famResEl.style.top = Math.max(0, Math.min(window.innerHeight - 100, o.y)) + 'px';
        famResEl.style.bottom = 'auto';
        famResEl.style.width = w + 'px';
        done = true;
      }
    } catch (e) {}
    if (done) return;
    try {
      const r = famEl && famEl.isConnected ? famEl.getBoundingClientRect() : null;
      const w = 300;
      famResEl.style.position = 'fixed';
      famResEl.style.width = w + 'px';
      famResEl.style.bottom = 'auto';
      if (r && r.width > 0) {
        famResEl.style.left = Math.max(0, Math.min(window.innerWidth - w, Math.round(r.right + 8))) + 'px';
        famResEl.style.top = Math.max(0, Math.min(window.innerHeight - 100, Math.round(r.top))) + 'px';
      } else {
        famResEl.style.left = Math.max(0, window.innerWidth - w - 16) + 'px';
        famResEl.style.top = '70px';
      }
    } catch (e2) {}
  }
  function renderFamRes() {
    if (!famResEl || !famResEl.isConnected) return;
    const q = famResQ;
    const f = q ? famFind(q) : null;
    const sig = [famState, q, f ? f.family : '', f ? (f.characters || []).length : 0, famFetchedAt].join('|');
    if (sig === famResSig) return;
    famResSig = sig;
    let h = '<div style="display:flex;align-items:center;min-height:26px;padding-right:28px;flex:none"><b style="font-size:12px;white-space:nowrap;display:inline-flex;align-items:center">' + TI(TI_SEARCH, '#ff7ab8') + (f ? esc(f.family) + '&nbsp;<span style="color:#ff7ab8">(' + (f.characters || []).length + ')</span>' : esc(q || '검색 결과')) + '</b></div>' +
      xBtn('__kw_bdo_family_r_x', '#ff7ab8', 'position:absolute;top:2px;right:3px;z-index:2') +
      '<div style="flex:none;height:1px;background:rgba(255,255,255,.14);margin:4px -10px 0"></div>' +
      '<div class="__kw_sb_fam" style="flex:1;min-height:0;overflow-y:auto;margin-top:4px">';
    if (famState === 'err') h += '<div style="font-size:11px;color:#ff7b7b;margin-top:6px">가문 목록을 받지 못했습니다. 잠시 뒤 다시 시도하세요.</div>';
    else if (famState === 'loading' || !famData) h += '<div style="font-size:11px;color:#aaa;margin-top:6px">불러오는 중...</div>';
    else if (f) {
      h += '<div style="margin-top:6px;font-size:11px;color:#888">' +
        (f.created ? esc(f.created) : '') +
        (f.guild ? ' · <span style="color:#ff7ab8">' + esc(f.guild) + '</span>' : '') + '</div>';
      (f.characters || []).forEach((c) => {
        h += '<div style="display:flex;align-items:center;gap:6px;margin-top:5px;padding-top:5px;border-top:1px solid rgba(255,255,255,.12)">' +
          '<b style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1">' + esc(c.name || '?') + (c.main ? ' <span style="color:#ff7ab8;font-size:10px">대표</span>' : '') + '</b>' +
          '<span style="font-size:11px;color:#ddd;white-space:nowrap">' + esc(c.class || '') + '</span>' +
          '<span style="font-size:11px;color:' + (c.level ? '#7dffb3' : '#888') + ';white-space:nowrap">' + (c.level ? 'Lv' + c.level : '비공개') + '</span></div>';
      });
      if (famData && famData.updatedAt) {
        const d = new Date(famData.updatedAt + KST);
        const p2 = (n) => String(n).padStart(2, '0');
        h += '<div style="font-size:10px;color:#777;margin-top:6px">목록 갱신 ' + (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + ' ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + '</div>';
      }
    } else h += '<div style="font-size:11px;color:#aaa;margin-top:6px;line-height:1.5">등록되지 않은 가문입니다.<br>GitHub Issues로 등록을 요청하세요.</div>';
    h += '</div>';
    famResEl.innerHTML = h;
    const fx = famResEl.querySelector('#__kw_bdo_family_r_x');
    if (fx) fx.onclick = () => { famResQ = ''; removeFamRes(); };
  }
  function updateFamRes(now) {
    const stack = document.getElementById('__kw_stack');
    const panel = document.getElementById('__kw_panel');
    if (!opt('family', true) || !stack || !panel || !panel.classList.contains('show') || !famResQ.trim() || !famEl || !famEl.isConnected) { removeFamRes(); return; }
    if (!famResEl || !famResEl.isConnected) {
      famResEl = document.createElement('div');
      famResEl.id = '__kw_bdo_family_r';
      famResEl.style.cssText = 'position:fixed;box-sizing:border-box;background:rgb(20,20,24);color:#fff;font:13px sans-serif;padding:8px 10px 18px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.5);border:1px solid #ff7ab8;display:flex;flex-direction:column;overflow:visible;height:' + Math.min(famRH, famRHMax()) + 'px';
      document.body.appendChild(famResEl);
      placeFamRes();
      famResSig = null;
    }
    renderFamRes();
    try { // 창 기본형 상속: 결과창=가로+세로
      if (KW && typeof KW.window === 'function') {
        KW.window(famResEl, {
          color: '#ff7ab8', posKey: LS_FAMRPOS, rsz: 'd', dock: () => placeFamRes(),
          getH: () => famRH,
          setH: (v) => {
            famRH = Math.max(FAMR_H_MIN, Math.min(famRHMax(), v));
            famResEl.style.height = Math.min(famRH, famRHMax()) + 'px';
          },
          saveH: () => { try { localStorage.setItem(LS_FAMRH, String(famRH)); } catch (er) {} },
        });
      } else {
        if (KW && typeof KW.rsz === 'function') KW.rsz(famResEl, {
          dir: 'd', color: '#ff7ab8', wMode: 'self',
          getW: () => famResEl.getBoundingClientRect().width,
          setW: (v) => { famResEl.style.width = Math.max(225, Math.min(600, Math.round(v))) + 'px'; },
          getH: () => famRH,
          setH: (v) => {
            famRH = Math.max(FAMR_H_MIN, Math.min(famRHMax(), v));
            famResEl.style.height = Math.min(famRH, famRHMax()) + 'px';
          },
          save: () => { try { localStorage.setItem(LS_FAMRH, String(famRH)); } catch (er) {} },
        });
        if (KW && typeof KW.float === 'function') KW.float(famResEl, { color: '#ff7ab8', key: LS_FAMPOS, dock: () => placeFamRes() });
      }
    } catch (e) {}
  }

  function tick() {
    try {
      if (!KW.enabled(ID)) { clearAll(); removeNext(); removeCoupons(); removeParty(); removeFamily(); removeFamRes(); return; }
      const now = Date.now();
      if (now - bossFetchedAt >= BOSS_REFRESH_MS) loadSchedule(); // 처음 켜질 때 한 번, 이후 6시간마다
      updateNext(now);
      updateCoupons(now);
      updateParty(now);
      updateFamily(now);
      updateFamRes(now);
      const lead = Math.max(1, Math.min(30, Number(opt('lead', 3)) || 3)) * 60000;
      const sel = opt('bosses', null);
      const active = new Set();
      for (let i = tests.length - 1; i >= 0; i--) if (tests[i].t < now - 60000) tests.splice(i, 1);
      const bossAlertOn = opt('bossAlert', true); // 설정 > 우두머리 알림 체크
      for (const o of occurrences(now).concat(tests)) {
        if (!bossAlertOn && !o.test) continue;
        if (now >= o.t || (!o.test && now < o.t - lead)) continue; // 알림 구간: 출현 N분 전 ~ 출현 시각
        const bosses = Array.isArray(sel) && !o.test ? o.bosses.filter((b) => sel.includes(b)) : o.bosses;
        if (!bosses.length) continue;
        // 출현 30초 전: 알림을 닫았어도, 몇 분 전 알림 설정과 상관없이 무조건 한 번 더 TTS로 알린다 (구독: on('ext:boss30'))
        if (o.t - now <= 30000 && !warned30.has(o.t)) {
          warned30.add(o.t);
          try { if (typeof KW.emit === 'function') KW.emit('boss30', { bosses }); } catch (e) {}
        }
        if (dismissed.has(o.t)) continue;
        active.add(o.t);
        if (!items.has(o.t)) {
          addItem(o);
          if (opt('sound', true)) { if (typeof KW.sound === 'function') KW.sound(); else beep(); } // 설정의 알림 소리 사용
          // TTS 확장이 켜져 있으면 우두머리 이름을 읽는다 (구독: on('ext:boss'))
          try {
            if (typeof KW.emit === 'function') {
              const ms = o.t - now;
              KW.emit('boss', { bosses, when: ms >= 60000 ? Math.round(ms / 60000) + '분' : Math.max(1, Math.ceil(ms / 1000)) + '초' });
            }
          } catch (e) {}
        }
        items.get(o.t).txt.textContent = '⚔ 검은사막 ' + o.hhmm + ' 우두머리: ' + bosses.join(' / ') + ' · ' + fmt(o.t - now) + ' 남음';
      }
      for (const t of [...items.keys()]) if (!active.has(t)) removeItem(t);
      for (const t of [...dismissed]) if (t < now - DAY) dismissed.delete(t);
      for (const t of [...warned30]) if (t < now - DAY) warned30.delete(t);
    } catch (e) {}
  }
  setInterval(tick, 1000);
  tick();
})();
