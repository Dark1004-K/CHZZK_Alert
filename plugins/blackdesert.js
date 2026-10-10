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
  const LS_GPOS = '__kw_bdo_gpos';
  const SNAP_TH = 14; // 이 거리(px) 안이면 붙는다
  const SNAP_GAP = 8; // 다른 창 옆에 붙을 때 간격
  let grp = null, grpIn = null, grpDrag = false, grpSig = '';
  function loadGpos() {
    try { const o = JSON.parse(localStorage.getItem(LS_GPOS)); if (o && isFinite(o.x) && isFinite(o.y)) return o; } catch (e) {}
    return null;
  }
  function saveGpos(p) {
    try { if (p) localStorage.setItem(LS_GPOS, JSON.stringify(p)); else localStorage.removeItem(LS_GPOS); } catch (e) {}
  }
  const GRP_BASE = 'box-sizing:border-box;display:flex;flex-direction:column;gap:6px;';
  const floatCss = (x, y, w) => GRP_BASE + 'position:fixed;left:' + Math.round(x) + 'px;top:' + Math.round(y) + 'px;width:' + Math.round(w) + 'px;margin:0;z-index:1;';
  function ensureGroup(stack) {
    if (grp && grp.isConnected) return grpIn;
    grp = document.createElement('div');
    grp.id = '__kw_bdo_grp';
    grp.style.cssText = GRP_BASE + 'width:100%';
    grpSig = '';
    const grip = document.createElement('div');
    grip.id = '__kw_bdo_grip';
    grip.title = '드래그로 이동 (화면 가장자리·다른 창에 자석처럼 붙음) · 더블클릭: 원래 자리로';
    grip.style.cssText = 'height:10px;margin:-2px 0 -2px;cursor:grab;position:relative;touch-action:none;flex:none';
    grip.innerHTML = '<span style="position:absolute;left:50%;top:50%;width:32px;height:3px;margin:-1.5px 0 0 -16px;border-radius:2px;background:rgba(255,255,255,.45)"></span>';
    grpIn = document.createElement('div');
    grpIn.style.cssText = 'display:flex;flex-direction:column;gap:8px';
    grp.appendChild(grip);
    grp.appendChild(grpIn);
    grip.onpointerdown = (e) => startGroupDrag(e, grip);
    grip.ondblclick = () => { saveGpos(null); grpSig = ''; placeGroup(); };
    return grpIn;
  }
  function cleanupGroup() {
    if (grp && grpIn && !grpIn.children.length) { try { grp.remove(); } catch (e) {} grp = null; grpIn = null; grpSig = ''; }
  }
  function placeGroup() {
    const stack = document.getElementById('__kw_stack');
    if (!grp || !stack || grpDrag) return;
    const pos = loadGpos();
    if (pos) {
      if (grp.parentNode !== stack) stack.appendChild(grp);
      const w = Math.round(stack.getBoundingClientRect().width) || 350;
      const h = grp.offsetHeight || 0;
      const x = Math.max(0, Math.min(window.innerWidth - w, pos.x));
      const y = Math.max(0, Math.min(window.innerHeight - h, pos.y));
      const sig = 'f' + Math.round(x) + ',' + Math.round(y) + ',' + w;
      if (sig !== grpSig) { grp.style.cssText = floatCss(x, y, w); grpSig = sig; }
      return;
    }
    if (grpSig !== 'd') { grp.style.cssText = GRP_BASE + 'width:100%'; grpSig = 'd'; }
    // 제자리: 드롭스 창이 있으면 그 바로 아래, 없으면 불린 대화 창 바로 위
    const drops = document.getElementById('__kw_dropsp');
    const hist = document.getElementById('__kw_histp');
    if (drops && drops.parentNode === stack) {
      if (grp.previousSibling !== drops) stack.insertBefore(grp, drops.nextSibling);
    } else if (hist && hist.parentNode === stack) {
      if (grp.nextSibling !== hist) stack.insertBefore(grp, hist);
    } else if (grp.parentNode !== stack) stack.appendChild(grp);
  }
  // 자석: 끌고 있는 묶음의 가장자리를 화면 가장자리·다른 창 가장자리에 맞춘다
  function snapGroup(x, y, w, h) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const xs = [[0, 0], [vw - w, 0]]; // [맞출 left 값, 0]
    const ys = [[0, 0], [vh - h, 0]];
    ['__kw_panel', '__kw_dropsp', '__kw_histp', '__kw_setp'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el || el.closest('#__kw_bdo_grp')) return;
      const r = el.getBoundingClientRect();
      if (r.width < 20 || r.height < 20) return;
      xs.push([r.left, 0], [r.right - w, 0], [r.right + SNAP_GAP, 0], [r.left - SNAP_GAP - w, 0]);
      ys.push([r.top, 0], [r.bottom - h, 0], [r.bottom + SNAP_GAP, 0], [r.top - SNAP_GAP - h, 0]);
    });
    const best = (v, list) => {
      let bv = v, bd = SNAP_TH + 1;
      list.forEach(([c]) => { const d = Math.abs(c - v); if (d < bd) { bd = d; bv = c; } });
      return bd <= SNAP_TH ? { v: bv, hit: true } : { v, hit: false };
    };
    const bx = best(x, xs), by = best(y, ys);
    return { x: bx.v, y: by.v, hit: bx.hit || by.hit };
  }
  function startGroupDrag(e, grip) {
    if (e.button !== undefined && e.button !== 0) return;
    const stack = document.getElementById('__kw_stack');
    if (!grp || !stack) return;
    e.preventDefault();
    const r = grp.getBoundingClientRect();
    const ox = e.clientX - r.left, oy = e.clientY - r.top;
    const w = Math.round(stack.getBoundingClientRect().width) || Math.round(r.width);
    grpDrag = true;
    grip.style.cursor = 'grabbing';
    let cur = { x: r.left, y: r.top };
    if (grp.parentNode !== stack) stack.appendChild(grp);
    grp.style.cssText = floatCss(cur.x, cur.y, w); // 제자리에서 그대로 들어올린다
    const h = grp.offsetHeight || r.height;
    const move = (ev) => {
      let x = ev.clientX - ox, y = ev.clientY - oy;
      const sn = snapGroup(x, y, w, h);
      x = Math.max(0, Math.min(window.innerWidth - w, sn.x));
      y = Math.max(0, Math.min(window.innerHeight - h, sn.y));
      cur = { x, y };
      grp.style.cssText = floatCss(x, y, w) + (sn.hit ? 'box-shadow:0 0 0 2px rgba(0,255,163,.7);border-radius:12px;' : '');
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      grpDrag = false;
      grip.style.cursor = 'grab';
      grp.style.boxShadow = '';
      saveGpos({ x: cur.x, y: cur.y });
      grpSig = '';
      placeGroup();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }
  // 감시 화면(#__kw_stack)의 드롭스 창 바로 아래에 파란색 "다음 우두머리" 창을 둔다 (창 묶음 안)
  let nextEl = null;
  function removeNext() {
    if (nextEl) { try { nextEl.remove(); } catch (e) {} }
    nextEl = null;
    cleanupGroup();
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
      nextEl.style.cssText = 'width:100%;box-sizing:border-box;background:rgb(20,20,24);color:#fff;font:13px sans-serif;padding:8px 10px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.5);border:1px solid #3b9eff;position:relative;padding-right:30px';
      nextEl.onclick = (e) => { // X 버튼 (내용을 매초 다시 그리므로 창에 한 번만 달아 둔다)
        if (e.target && e.target.closest && e.target.closest('#__kw_bdop_x')) { turnOff('nextBoss'); removeNext(); }
      };
    }
    const gin = ensureGroup(stack); // 위치는 창 묶음이 정한다
    if (nextEl.parentNode !== gin || gin.firstChild !== nextEl) gin.insertBefore(nextEl, gin.firstChild);
    placeGroup();
    const when = new Date(next.t + KST);
    const days = Math.floor((next.t + KST) / DAY) - Math.floor((now + KST) / DAY);
    const dayTxt = days === 0 ? '' : days === 1 ? '내일 ' : ['일', '월', '화', '수', '목', '금', '토'][when.getUTCDay()] + '요일 ';
    nextEl.innerHTML = '<div style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">⚔ 다음 우두머리 · <b>' + next.bosses.join(' / ') + '</b></div>' +
      '<div style="font-size:11px;color:#3b9eff;margin-top:2px">' + dayTxt + next.hhmm + ' · ' + fmtLong(next.t - now) + ' 후</div>' + xBtn('__kw_bdop_x', '#3b9eff', 'position:absolute;top:2px;right:3px');
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
    cleanupGroup();
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
      '<b style="font-size:12px;white-space:nowrap">🎟 쿠폰 모아보기 <span style="color:#b784ff">(' + list.length + ')</span></b>' +
      '<span style="display:inline-flex;align-items:center"><button id="__kw_cpn_rf" class="' + (busy ? '__kw_ic __kw_spin' : '') + '" title="' + (cpnFetchedAt ? '새로고침 (마지막 갱신 ' + pad2(new Date(cpnFetchedAt).getHours()) + ':' + pad2(new Date(cpnFetchedAt).getMinutes()) + ':' + pad2(new Date(cpnFetchedAt).getSeconds()) + ')' : '새로고침') + '" style="border:0;background:transparent;color:#b784ff;cursor:pointer;padding:5px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;position:relative;top:1.5px">' + (busy ? ICON_REFRESH : flash ? (cpnFlashErr ? ICON_FAIL : ICON_DONE) : ICON_REFRESH) + '</button>' +
      '<span title="' + (fold ? '펼치기' : '접기') + '" style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:8px;color:#b784ff;position:absolute;top:2px;right:29px;z-index:2"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="' + (fold ? 'M9 6l6 6-6 6' : 'M6 9l6 6 6-6') + '"/></svg></span></span></div>' + xBtn('__kw_cpn_x', '#b784ff', 'position:absolute;top:2px;right:3px;z-index:2');
    if (!fold) {
      h += '<div class="__kw_sb_cpn" style="max-height:190px;overflow-y:auto;margin-top:2px">';
      if (cpnState === 'err') h += '<div style="font-size:11px;color:#ff7b7b;margin-top:6px">쿠폰 목록을 받지 못했습니다. 새로고침(↻)을 눌러 보세요.</div>';
      else if (cpnState === 'idle' || (cpnState === 'loading' && !cpnData)) h += '<div style="font-size:11px;color:#aaa;margin-top:6px">불러오는 중...</div>';
      else if (!list.length) h += '<div style="font-size:11px;color:#aaa;margin-top:6px">사용할 수 있는 쿠폰이 없습니다.</div>';
      list.forEach((c) => {
        h += '<div style="margin-top:7px;padding-top:6px;border-top:1px solid rgba(255,255,255,.12)">' +
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
    }
    const gin = ensureGroup(stack);
    if (cpnEl.parentNode !== gin || gin.lastChild !== cpnEl) gin.appendChild(cpnEl);
    placeGroup();
    renderCoupons(now);
  }

  function tick() {
    try {
      if (!KW.enabled(ID)) { clearAll(); removeNext(); removeCoupons(); return; }
      const now = Date.now();
      if (now - bossFetchedAt >= BOSS_REFRESH_MS) loadSchedule(); // 처음 켜질 때 한 번, 이후 6시간마다
      updateNext(now);
      updateCoupons(now);
      const lead = Math.max(1, Math.min(30, Number(opt('lead', 3)) || 3)) * 60000;
      const sel = opt('bosses', null);
      const active = new Set();
      for (let i = tests.length - 1; i >= 0; i--) if (tests[i].t < now - 60000) tests.splice(i, 1);
      for (const o of occurrences(now).concat(tests)) {
        if (now >= o.t || (!o.test && now < o.t - lead)) continue; // 알림 구간: 출현 N분 전 ~ 출현 시각
        if (dismissed.has(o.t)) continue;
        const bosses = Array.isArray(sel) && !o.test ? o.bosses.filter((b) => sel.includes(b)) : o.bosses;
        if (!bosses.length) continue;
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
    } catch (e) {}
  }
  setInterval(tick, 1000);
  tick();
})();
