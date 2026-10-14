// CHZZK Alert plugin: 검은사막 — 월드 우두머리 레이드 출현 N분 전에 주황색 알림을 띄우고, 출현 시각까지 유지한다.
// 시간표 출처: https://www.kr.playblackdesert.com/ko-kr/Wiki?wikiNo=167 (표가 이미지라 직접 옮겨 적음)
// 시간표는 저장소의 bosses.json에서 받아온다(6시간마다 + 매주 수요일 12:27). 받지 못하면 아래 DEFAULT_SCHEDULE(코드에 적힌 값)을 쓴다.
// 위키 시간표 이미지가 바뀌면 GitHub Actions(check-boss-schedule)가 알려 주고, bosses.json을 고치면 앱이 따라간다.
// 옵션(설정 > 확장): lead(몇 분 전), sound(알림음), bosses(알림받을 우두머리)
(function () {
  const KW = window.__KW;
  if (!KW || typeof KW.option !== 'function' || typeof KW.enabled !== 'function') return;
  if (window.__kwBdoLoaded) return;
  window.__kwBdoLoaded = true;
  try { console.log('[KW-BETA]', 'bdo-eval', 'plugin-1.1.1'); } catch (e) {} // [BETA-ONLY-LINE] 진단용 (메인창 미표시 원인 파악 후 삭제)
  try { if (KW && typeof KW.describe === 'function') KW.describe({ name: 'blackdesert', version: '1.1.1' }); } catch (e) {}
  const ID = 'blackdesert';
  // 설정 > 일반설정의 창 투명도를 결과창(fixed, 스택 밖)에도 적용. 본체 KW.opacity() 우선, 없으면 저장값 직접 읽기.
  function bdoOpacity() {
    try { if (KW && typeof KW.opacity === 'function') return KW.opacity(); } catch (e) {}
    try { const v = parseInt(localStorage.getItem('__kw_transparency'), 10); if (isFinite(v)) return (100 - Math.max(0, Math.min(90, v))) / 100; } catch (e) {}
    return 0.85;
  }
  // 썸네일 박스: 로딩 중 스피너 → 완료 시 이미지 → 실패 시 "NO"
  // (onload/onerror="..." 인라인에서 호출. 박스(.​__kw_thumb) 구조에 의존)
  const THUMB_CSS = 'flex:none;width:24px;height:24px;position:relative;display:inline-flex;align-items:center;justify-content:center;border-radius:6px;background:rgba(255,255,255,.06);overflow:hidden';
  const SPIN_CSS = 'width:12px;height:12px;border-radius:50%;border:2px solid rgba(255,255,255,.2);border-top-color:#ff7ab8;animation:__kwspin .8s linear infinite';
  const NO_CSS = 'width:100%;height:100%;display:inline-flex;align-items:center;justify-content:center;color:#777;font-size:10px';
  function thumbHtml(iconUrl) {
    if (!iconUrl) return '<span class="__kw_thumb" style="' + THUMB_CSS + '"><span style="' + NO_CSS + '">NO</span></span>';
    return '<span class="__kw_thumb" style="' + THUMB_CSS + '"><span class="__kw_ld" style="' + SPIN_CSS + '"></span>' +
      '<img loading="lazy" src="' + esc(iconUrl) + '" width="24" height="24" style="position:absolute;left:0;top:0;border-radius:6px" onload="try{this.parentNode.querySelector(\'.__kw_ld\').style.display=\'none\';}catch(e){}" onerror="__kwNoImg(this)"></span>';
  }
  try {
    window.__kwNoImg = (el) => {
      try {
        const box = el && el.parentNode && el.parentNode.classList && el.parentNode.classList.contains('__kw_thumb') ? el.parentNode : null;
        const t = document.createElement('span');
        t.textContent = 'NO';
        if (box) { t.style.cssText = NO_CSS; box.innerHTML = ''; box.appendChild(t); }
        else {
          const w = (el && el.width) || 24, h = (el && el.height) || 24;
          t.style.cssText = NO_CSS + ';flex:none;width:' + w + 'px;height:' + h + 'px;border-radius:6px;background:rgba(255,255,255,.06)';
          el.replaceWith(t);
        }
      } catch (e) {}
    };
  } catch (e) {}
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
  const LS_BOSSLOT = '__kw_boss_slot'; // 마지막으로 받은 수요일 슬롯 시각
  function bossSlotTime(now) { // 가장 최근 수요일 12:27 (한국시간, 액션 17분 뒤) ms
    const k = new Date(now + KST);
    const diff = (k.getUTCDay() - 3 + 7) % 7; // 수요일(3)로부터 며칠 지남
    const dayStartK = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - KST; // 오늘 00:00 (한국시간)
    let slot = dayStartK - diff * DAY + (12 * 60 + 27) * 60000;
    if (slot > now) slot -= 7 * DAY;
    return slot;
  }
  function bossSlotDue(now) { // 수요일 슬롯 이후에 받은 적이 없으면 true
    let last = 0;
    try { last = parseInt(localStorage.getItem(LS_BOSSLOT), 10) || 0; } catch (e) {}
    return bossSlotTime(now) > last;
  }

  function opt(key, def) {
    try { const v = KW.option(ID, key); return v === undefined || v === null ? def : v; } catch (e) { return def; }
  }
  try { KW.refreshBdo = () => { try { updateParty(Date.now()); } catch (e) {} try { updateMain(Date.now()); } catch (e) {} }; } catch (e) {} // 녹색 메인 버튼용: 파티·검은사막메인 즉시 갱신
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

  // ---------- 검은사막 메인창 + 서브창 (쿠폰·이벤트·파티·검색) ----------
  // 감시 화면(#__kw_stack)의 드롭스 창 아래에 파란색 "검은사막" 메인창을 둔다 (감시중 녹색창과 같은 도크형).
  // 메인창 타이틀 아래에는 다음 우두머리 카운터를 항상 표시하고, 타이틀 옆 버튼으로 서브창을 띄웠다 숨겼다 한다.
  // 스택 직속 배치: 그룹 컨테이너 없이 각 창을 감시 화면(#__kw_stack)에 직접 둔다 (순서: 드롭스 → 메인 → 쿠폰 → 이벤트 → 파티 → 검색 → 불린대화).
  // 가로(↔·대각의 가로축)는 스택 너비를 공유하고, 세로는 창마다 따로 저장한다.
  try { localStorage.removeItem('__kw_bdo_gpos'); } catch (e) {} // 묶음 위치값 잔재 정리
  try { localStorage.removeItem('__kw_bdop_pos'); } catch (e) {} // 구 "다음 우두머리" 창 위치값 잔재 정리
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
  const LS_EVTH = '__kw_evt_h';
  const EVT_H_DEF = 220, EVT_H_MIN = 80;
  const evtHMax = () => Math.max(EVT_H_MIN, window.innerHeight);
  let evtH = EVT_H_DEF;
  try { const ehv = parseInt(localStorage.getItem(LS_EVTH), 10); if (ehv >= EVT_H_MIN && ehv <= 4000) evtH = ehv; } catch (e) {}
  function bdoOrder() { // 스택 안에서 메인→쿠폰→이벤트→파티→검색 순서로, 불린대화 창 바로 위에 둔다 (띄운 창은 제외)
    try {
      const stack = document.getElementById('__kw_stack');
      if (!stack) return;
      const hist = document.getElementById('__kw_histp');
      const ref = (hist && hist.parentNode === stack) ? hist : null;
      if (!ref) return;
      let anchor = ref; // 뒤에서부터 제자리 확인 — 이미 맞으면 DOM을 손대지 않음 (조상 이동 시 포커스가 날아감)
      const seq = [mainEl, cpnEl, evtEl, partyEl, famEl];
      for (let i = seq.length - 1; i >= 0; i--) {
        const el = seq[i];
        if (!el || !el.isConnected || el.parentNode !== stack || el.style.position === 'fixed' || el === ref) continue;
        if (el.nextSibling !== anchor) { try { stack.insertBefore(el, anchor); } catch (er) {} }
        anchor = el;
      }
    } catch (e) {}
  }
  // 띄우기 위치 {x,y,w} (본체 KW.float이 읽는 형식과 동일). w는 225~600으로 감시중 창을 따름.
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
  // 창 제목 아이콘 (이모지는 색을 못 바꿔서 SVG로): 이벤트=청록, 쿠폰=보라, 파티=주황, 검색=분홍
  const TI = (path, color) => '<span style="display:inline-flex;align-items:center;color:' + color + ';margin-right:5px"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg></span>';
  const TI_TICKET = '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 17v2M13 11v2"/>';
  const TI_USERS = '<circle cx="9" cy="8" r="3.2"/><path d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.2a4.2 4.2 0 0 1 4.5 4.3V20"/>';
  const TI_SEARCH = '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>';
  const TI_CAL = '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>';
  function placeGroup() { bdoOrder(); }
  // ---------- 검은사막 메인창 (#__kw_bdo_main) ----------
  // 감시중(녹색창)과 같은 성격의 도크 창 (이동 불가, 가로=스택 너비 공유). 색은 우두머리 파랑.
  // 타이틀(로고형 아이콘 + "검은사막") 아래에 다음 우두머리 카운터를 항상 표시 (구 "다음 우두머리" 창 대체).
  // 타이틀 옆 버튼: 이벤트·쿠폰·검색 창 띄우기/숨기기, 설정(검은사막 확장 옵션 열기).
  const BDO_BLUE = '#3b9eff';
  const TI_BDO = '<path d="M9.4 5.6L2.8 12l9.2 9.2L21.2 12 12 2.8"/><path d="M11.3 8.3l4.1 4.1-3.3 3.3-3.3-3.3 2.5-2.5"/>';
  const TI_BELL_P = '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 21h4"/>';
  const TI_SLIDERS = '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>';
  const BDO_BTN = (path) => '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>';
  // 서브창 표시 상태 (세션만, 시작 시 숨김. 메인 버튼·토스트·X로 전환)
  const LS_SHOW_CPN = '__kw_bdo_show_cpn';
  const LS_SHOW_EVT = '__kw_bdo_show_evt';
  const LS_SHOW_FAM = '__kw_bdo_show_fam';
  let showCpnFlag = false, showEvtFlag = false, showFamFlag = false; // 시작 시 숨김 (세션만)
  function setShow(key, v) {
    v = !!v;
    if (key === LS_SHOW_CPN) showCpnFlag = v;
    else if (key === LS_SHOW_EVT) showEvtFlag = v;
    else if (key === LS_SHOW_FAM) showFamFlag = v;
  }
  const showCpn = () => showCpnFlag;
  const showEvt = () => showEvtFlag;
  const showFam = () => showFamFlag;
  function histOnNow() { try { return (typeof histOn === 'function' ? histOn() : true) && histShown; } catch (e) { return false; } }
  const SHOW_X_TITLE = '닫기 (검은사막 창의 버튼으로 다시 표시)';
  let mainEl = null, mainSig = null;
  let cpnAlarmBlink = false, evtAlarmBlink = false; // 새 쿠폰·이벤트 알람 후 상세창이 숨어있으면 메인 버튼 반짝임 (창이 보이면 해제)
  // [BETA-TEST-ONLY:start]
  // 진단용 (메인창 미표시 원인 파악 후 삭제): 접두어별로 바뀔 때만 찍는다.
  let mainDbgLast = {};
  function mainDbg(msg) {
    const k = String(msg).split(' ')[0];
    if (mainDbgLast[k] === msg) return;
    mainDbgLast[k] = msg;
    try { console.log('[KW-BETA]', 'bdo-main', msg); } catch (e) {}
  }
  function sigDiff(a, b) { // sig가 안 맞는 원인을 지목한다
    const names = ['evt', 'cpn', 'fam', 'evtBlink', 'cpnBlink', 'histOn', 'pty', 'histBlink', 'ptyBlink', 'next'];
    const pa = String(a || '').split('|'), pb = String(b || '').split('|');
    const out = [];
    for (let i = 0; i < names.length; i++) {
      const x = pa[i] === undefined ? '-' : pa[i], y = pb[i] === undefined ? '-' : pb[i];
      if (x !== y) out.push(names[i] + ':[' + String(x).slice(0, 40) + '>' + String(y).slice(0, 40) + ']');
    }
    return out.length ? out.join(' ') : 'first';
  }
  // [BETA-TEST-ONLY:end]
  function removeMain() {
    if (mainEl) { try { mainEl.remove(); } catch (e) {} }
    mainEl = null;
    mainSig = null;
  }
  function fmtLong(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    const p = (n) => String(n).padStart(2, '0');
    return (h ? h + ':' : '') + p(m) + ':' + p(x);
  }
  function nextCounter(now) { // 다음 출현 (선택 우두머리 필터 적용). 없으면 null
    const sel = opt('bosses', null);
    for (const o of occurrences(now, 8).sort((a, b) => a.t - b.t)) {
      if (o.t <= now) continue;
      const bosses = Array.isArray(sel) ? o.bosses.filter((b) => sel.includes(b)) : o.bosses;
      if (bosses.length) {
        const when = new Date(o.t + KST);
        const days = Math.floor((o.t + KST) / DAY) - Math.floor((now + KST) / DAY);
        const dayTxt = days <= 1 ? '' : ['일', '월', '화', '수', '목', '금', '토'][when.getUTCDay()] + ' ';
        return { t: o.t, label: dayTxt + o.hhmm, bosses, selN: Array.isArray(sel) ? sel.length : -1 };
      }
    }
    return null;
  }
  function mainBtn(act, title, svg, color, on, blink) {
    return '<button class="__kw_ic' + (blink ? ' __kw_urg' : '') + '" data-bdo-act="' + act + '" title="' + title + '" style="color:' + (on ? color : '#555') + ';padding:4px">' + svg + '</button>';
  }
  function renderMain(nc) {
    if (!mainEl) return;
    try { urgCss(); } catch (e) {} // 반짝임 스타일 (상세창을 한 번도 안 열어도 메인 버튼용으로 필요)
    mainEl.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:6px;min-height:26px">' +
      '<span style="display:inline-flex;align-items:center;font-weight:bold;font-size:13px;min-width:0;overflow:hidden;white-space:nowrap"><span style="display:inline-flex;align-items:center;color:' + BDO_BLUE + ';margin-right:5px;flex:none"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' + TI_BDO + '</svg></span>검은사막</span>' +
      '<span style="display:inline-flex;gap:0;flex:none">' +
      mainBtn('evt', '이벤트 모아보기', BDO_BTN(TI_CAL), EVT_COLOR, showEvt(), evtAlarmBlink) +
      mainBtn('cpn', '쿠폰 모아보기', BDO_BTN(TI_TICKET), '#b784ff', showCpn(), cpnAlarmBlink) +
      mainBtn('fam', '검은사막 검색', BDO_BTN(TI_SEARCH), '#ff7ab8', showFam(), false) +
      mainBtn('hist', '불린 대화', BDO_BTN(TI_BELL_P), '#ffd400', histOnNow(), histAlarmBlink) +
      mainBtn('pty', '파티 모집', BDO_BTN(TI_USERS), '#ff7a59', partyShown, partyAlarmBlink) +
      mainBtn('opt', '검은사막 옵션', BDO_BTN(TI_SLIDERS), '#ccc', true, false) +
      '</span></div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-top:1px;padding-left:19px">' +
      (nc
        ? '<div style="flex:1;min-width:0;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">다음 <b>' + nc.bosses.map((n) => esc(n)).join(' · ') + '</b> <span style="color:#888">(' + esc(nc.label) + ')</span></div>' +
          '<span id="__kw_bdo_main_left" style="flex:none;font-size:12px;font-weight:bold;color:' + BDO_BLUE + ';white-space:nowrap">' + fmtLong(nc.t - Date.now()) + '</span>'
        : '<div style="flex:1;font-size:12px;color:#888">다음 우두머리 없음 (확장 옵션에서 선택)</div>') +
      '</div>';
  }
  function updateMain(now) {
    const stack = document.getElementById('__kw_stack');
    const panel = document.getElementById('__kw_panel');
    try { mainDbg('gate stack=' + !!stack + ' panel=' + !!panel + ' show=' + (!!panel && panel.classList.contains('show'))); } catch (e) {} // [BETA-ONLY-LINE] 진단용
    if (!stack || !panel || !panel.classList.contains('show')) { removeMain(); return; }
    if (!mainEl || !mainEl.isConnected) {
      try { mainDbg('el-recreated'); } catch (e) {} // [BETA-ONLY-LINE] 진단용 (원인 파악 후 삭제)
      mainEl = document.createElement('div');
      mainEl.id = '__kw_bdo_main';
      mainEl.style.cssText = 'width:100%;box-sizing:border-box;background:rgb(20,20,24);color:#fff;font:13px sans-serif;padding:8px 10px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.5);border:1px solid ' + BDO_BLUE + ';position:relative';
      mainEl.onclick = (e) => { // 버튼 4개 (1초마다 다시 그리므로 위임으로 한 번만 달아 둔다)
        const b = e.target && e.target.closest ? e.target.closest('[data-bdo-act]') : null;
        if (!b) return;
        const act = b.getAttribute('data-bdo-act');
        if (act === 'opt') { try { if (KW && typeof KW.openOpts === 'function') KW.openOpts(ID); } catch (er) {} return; }
        if (act === 'evt') { setShow(LS_SHOW_EVT, !showEvt()); try { updateEvents(Date.now()); } catch (er) {} }
        else if (act === 'cpn') { setShow(LS_SHOW_CPN, !showCpn()); try { updateCoupons(Date.now()); } catch (er) {} }
        else if (act === 'fam') { setShow(LS_SHOW_FAM, !showFam()); try { updateFamily(Date.now()); } catch (er) {} }
        else if (act === 'hist') {
          try { histShown = !histShown; } catch (er) {}
          histAlarmBlink = false;
          try { if (typeof applyHistVisibility === 'function') applyHistVisibility(); } catch (er) {}
          try { if (typeof renderPanel === 'function') renderPanel(); } catch (er) {}
        }
        else if (act === 'pty') {
          partyAlarmBlink = false;
          setPartyShown(!partyShown);
          try { updateParty(Date.now()); } catch (er) {}
        }
        mainSig = null;
        try { updateMain(Date.now()); } catch (er) {}
      };
      stack.appendChild(mainEl);
      mainSig = null;
    }
    bdoOrder();
    const nc = nextCounter(now);
    try { const kd = new Date(now + KST); mainDbg('render next=' + (nc ? nc.bosses.join('/') + '@' + nc.label : 'none') + ' now=' + kd.getUTCHours() + ':' + String(kd.getUTCMinutes()).padStart(2, '0') + ' sel=' + (nc ? nc.selN : '-')); } catch (e) {} // [BETA-ONLY-LINE] 진단용
    const sig = [showEvt() ? 1 : 0, showCpn() ? 1 : 0, showFam() ? 1 : 0, evtAlarmBlink ? 1 : 0, cpnAlarmBlink ? 1 : 0, histOnNow() ? 1 : 0, partyShown ? 1 : 0, histAlarmBlink ? 1 : 0, partyAlarmBlink ? 1 : 0, nc ? nc.t + '|' + nc.bosses.join(',') : '-'].join('|');
    if (sig !== mainSig) {
      try { mainDbg('sig-diff: ' + sigDiff(mainSig, sig)); } catch (e) {} // [BETA-ONLY-LINE] 진단용 (원인 파악 후 삭제)
      mainSig = sig; renderMain(nc);
    }
    else if (nc) { // 카운터 숫자만 갱신 (버튼 깜빡임 방지)
      try { const l = mainEl.querySelector('#__kw_bdo_main_left'); if (l) l.textContent = fmtLong(nc.t - now); } catch (e) {}
    }
    try { // 창 기본형 상속: 감시중과 같은 도크형 (가로=스택공유, 이동 불가)
      if (KW && typeof KW.window === 'function') KW.window(mainEl, { color: BDO_BLUE, rsz: 'h', dock: () => bdoOrder() });
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
  // ---------- 마감 임박 깜빡임 (쿠폰·이벤트 공통) ----------
  // 만료/종료까지 24시간 이하로 남으면 해당 항목이 깜빡인다. 창이 접혀 있으면 창 전체가 깜빡인다.
  // 깜빡이는 항목의 🔕 버튼을 누르면 그 항목은 멈춘다 (항목이 사라지면 기록도 정리).
  const URG_MS = 24 * 3600 * 1000; // 하루
  // 끄기 기록은 창별로 저장 (공유하면 다른 창의 렌더가 정리 단계에서 지워버림)
  const LS_URG_OFF_CPN = '__kw_urg_off_cpn';
  const LS_URG_OFF_EVT = '__kw_urg_off_evt';
  function urgOffSet(storeKey) { try { return new Set(JSON.parse(localStorage.getItem(storeKey)) || []); } catch (e) { return new Set(); } }
  function urgOffSave(storeKey, s) { try { localStorage.setItem(storeKey, JSON.stringify([...s].slice(-200))); } catch (e) {} }
  function urgDismiss(storeKey, key) { const s = urgOffSet(storeKey); s.add(key); urgOffSave(storeKey, s); }
  function urgPrune(storeKey, aliveKeys) { // 목록에 없는 항목의 끄기 기록 정리
    const alive = new Set(aliveKeys);
    const s = urgOffSet(storeKey);
    let changed = false;
    for (const k of [...s]) if (!alive.has(k)) { s.delete(k); changed = true; }
    if (changed) urgOffSave(storeKey, s);
    try { localStorage.removeItem('__kw_urg_off'); } catch (e) {} // 구 공유키 잔재 정리
    return s;
  }
  function urgEndMs(text) { // "… 2026년 11월 4일(수) 05:00" / "… ~ … 23:59" → 마지막 시각(KST ms), 못 읽으면 0
    if (!text) return 0;
    const t = String(text).replace(/정기점검\s*전/g, '05:00'); // 구 캐시 데이터 대응
    const re = /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일(?:\([^)]*\))?\s*(\d{1,2}):(\d{2})/g;
    let last = 0, m;
    while ((m = re.exec(t))) last = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - 9 * 3600 * 1000;
    return last;
  }
  function urgIs(end, now) { return end > now && end - now <= URG_MS; } // 0 < 남은시간 <= 하루
  function urgCss() { // 깜빡임 스타일 1회 주입
    try {
      if (document.getElementById('__kw_urg_css')) return;
      const st = document.createElement('style');
      st.id = '__kw_urg_css';
      st.textContent = '@keyframes __kwblink{0%,100%{background-color:rgba(255,90,90,.22)}50%{background-color:rgba(255,90,90,.03)}}.__kw_urg{animation:__kwblink 1.1s ease-in-out infinite;border-radius:8px}';
      (document.head || document.documentElement).appendChild(st);
    } catch (e) {}
  }
  const URG_OFF_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/><path d="M4 4l16 16"/></svg>';
  function urgOffBtn(key, all) {
    return '<button data-urg-off="' + esc(key) + '" title="' + (all ? '깜빡임 모두 끄기' : '깜빡임 끄기') + '" style="border:0;background:transparent;color:#ff9a9a;cursor:pointer;padding:2px;display:inline-flex;align-items:center;flex:none">' + URG_OFF_SVG + '</button>';
  }
  // ---------- 쿠폰 모아보기 (#__kw_cpn) ----------
  // 검은사막 사이트는 다른 사이트(치지직 페이지)에서 직접 읽을 수 없어서(CORS), 저장소의 coupons.json을 받아온다.
  // coupons.json은 scripts/crawl-coupons.js가 "쿠폰 모두 모아보기" 페이지를 읽어 갱신한다.
  // 앱이 켜질 때 한 번 받고, 이후 매시 17분에 자동으로 다시 받는다 (액션은 20분 간격 실행).
  const CPN_URL = 'https://raw.githubusercontent.com/Dark1004-K/Chzzk_Alert/main/coupons.json';
  const LS_CPN_FOLD = '__kw_cpn_fold';
  let cpnEl = null;
  let cpnData = null; // 마지막으로 받은 coupons.json
  let cpnState = 'idle'; // idle | loading | ok | err
  let cpnSig = ''; // 마지막으로 그린 내용의 서명 (바뀔 때만 다시 그림)
  let cpnFitNext = false; // 펼치기(최대화) 직후 한 번: 아래 기준으로 내용만큼 펼치고 화면에 맞춤
  let cpnAnchorB = 0; // 펼치기 클릭 시점(접힌 상태)의 아래 모서리. innerHTML이 먼저 깔리므로 클릭 때 잡아야 함
  let cpnFoldB = 0; // 접기 클릭 시점(펼친 상태)의 아래 모서리. 접을 때도 아래 고정
  let cpnFetchedAt = 0; // 마지막으로 받아온 시각
  // 매시 17분에 자동 갱신 (GitHub 액션은 20분 간격 실행). 시간대와 무관하게 매시 '분'은 일치한다.
  const CPN_SLOT_MIN = 17; // 매시 17분
  function cpnSlotDue(now) { // 가장 최근 17분 슬롯 이후에 받은 적이 없으면 true
    const d = new Date(now);
    const slot = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), CPN_SLOT_MIN, 0, 0).getTime();
    const last = now < slot ? slot - 3600000 : slot;
    return cpnFetchedAt < last;
  }
  let cpnBusyUntil = 0; // 이 시각까지는 "가져오는 중"(도는 아이콘)으로 보여줌 (너무 빨리 끝나도 눌린 것이 보이게)
  let cpnFlashUntil = 0; // 이 시각까지는 완료(체크)/실패(!) 표시
  let cpnFlashErr = false;
  const ICON_REFRESH = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 3v5h-5"/></svg>';
  const ICON_DONE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#7dffb3" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const ICON_FAIL = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ff7b7b" stroke-width="2.6" stroke-linecap="round"><path d="M12 6v8M12 18v.5"/></svg>';
  const pad2 = (n) => String(n).padStart(2, '0');
  // 창 오른쪽 위 X 버튼 (창 색에 맞춤). 누르면 설정 > 확장의 해당 옵션을 끈다.
  const xBtn = (id, color, style, title) => '<button id="' + id + '" title="' + (title || '닫기 (설정 > 확장에서 다시 켤 수 있음)') + '" style="border:0;background:transparent;color:' + color + ';cursor:pointer;padding:5px;border-radius:8px;display:inline-flex;align-items:center;' + (style || '') + '"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
  const ICON_COPY = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>';
  const ICON_OK = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#7dffb3" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function cpnFolded() { try { return localStorage.getItem(LS_CPN_FOLD) === '1'; } catch (e) { return false; } }
  function cpnVisible(now) {
    const l = cpnData && Array.isArray(cpnData.coupons) ? cpnData.coupons : [];
    return l.filter((c) => c && c.code && (!c.expiresAt || c.expiresAt > now)); // 기간이 지난 쿠폰은 숨김
  }
  // 새 쿠폰 감지·알림: 본 적 없는 유효 쿠폰이 들어오면 토스트+알림음 (+확장 TTS). 첫 수신 때는 조용히 기억만.
  const LS_CPNSEEN = '__kw_cpn_seen';
  function cpnSeenSet() { try { return new Set(JSON.parse(localStorage.getItem(LS_CPNSEEN)) || []); } catch (e) { return new Set(); } }
  function cpnCheckNew() {
    const list = cpnVisible(Date.now());
    const seen = cpnSeenSet();
    const fresh = list.filter((c) => c && c.code && !seen.has(c.code));
    try { localStorage.setItem(LS_CPNSEEN, JSON.stringify(list.map((c) => c.code).slice(-200))); } catch (e) {}
    if (!seen.size) return []; // 첫 수신: 알람 없이 기억만
    return fresh;
  }
  function cpnAlarmNew(fresh) {
    (fresh || []).forEach((c) => {
      try {
        if (typeof KW.toast === 'function') KW.toast('🎟 새 쿠폰', (c.name || '쿠폰') + '\n' + c.code, () => {
          setShow(LS_SHOW_CPN, true); mainSig = null; // 토스트 클릭=쿠폰창 열기
          try { updateCoupons(Date.now()); } catch (e) {}
          try { updateMain(Date.now()); } catch (e) {}
        });
      } catch (e) {}
    });
    if (fresh && fresh.length) {
      try { if (opt('sound', true) && typeof KW.sound === 'function') KW.sound(); } catch (e) {}
      try { if (typeof KW.emit === 'function') KW.emit('coupon', { coupons: fresh.map((c) => ({ name: c.name, code: c.code })) }); } catch (e) {}
      if (!showCpn()) { cpnAlarmBlink = true; try { updateMain(Date.now()); } catch (e) {} } // 숨어있으면 메인 버튼 반짝임
    }
    return (fresh || []).length;
  }
  // [BETA-TEST-ONLY:start]
  // 테스트: 콘솔에서 __kwBdoCouponTest() 를 호출하면 가짜 새 쿠폰으로 알람 경로를 즉시 시험 (옵션 무시)
  if (KW.beta) { // 정식 앱에서는 테스트 후크를 만들지 않는다
    window.__kwBdoCouponTest = () => {
      const code = 'TEST-' + Date.now().toString(36).toUpperCase();
      if (!cpnData || !Array.isArray(cpnData.coupons)) cpnData = { updatedAt: Date.now(), coupons: [] };
      cpnData.coupons.push({ name: '테스트 쿠폰', code });
      cpnState = 'ok'; cpnSig = '';
      cpnAlarmNew([{ name: '테스트 쿠폰', code }]);
      try { const s = cpnSeenSet(); s.add(code); localStorage.setItem(LS_CPNSEEN, JSON.stringify([...s].slice(-200))); } catch (e) {}
      try { updateCoupons(Date.now()); } catch (e) {}
      return '쿠폰 테스트 알람: ' + code;
    };
    // 테스트: __kwBdoCouponUrgTest() → 12시간 뒤 만료 가짜 쿠폰으로 마감 임박 깜빡임 즉시 시험
    window.__kwBdoCouponUrgTest = () => {
      const code = 'URGTEST-' + Date.now().toString(36).toUpperCase();
      if (!cpnData || !Array.isArray(cpnData.coupons)) cpnData = { updatedAt: Date.now(), coupons: [] };
      cpnData.coupons.push({ name: '테스트 임박 쿠폰', code, expires: '테스트 마감 (약 12시간 남음)', expiresAt: Date.now() + 12 * 3600 * 1000 });
      cpnState = 'ok'; cpnSig = '';
      try { updateCoupons(Date.now()); } catch (e) {}
      return '쿠폰 임박 깜빡임 테스트: ' + code;
    };
    // 테스트: __kwBdoEventTest() → 가짜 새 이벤트로 알람 경로 즉시 시험 (옵션 무시)
    window.__kwBdoEventTest = () => {
      const link = 'https://www.kr.playblackdesert.com/ko-KR/News/Detail?groupContentNo=13733#evttest' + Date.now().toString(36);
      if (!evtData || !Array.isArray(evtData.events)) evtData = { updatedAt: Date.now(), events: [] };
      evtData.events.unshift({ category: 'NEW 이벤트', title: '테스트 새 이벤트', period: '', summary: '새 이벤트 알람 시험용', link });
      evtState = 'ok'; evtSig = '';
      evtAlarmNew([{ title: '테스트 새 이벤트', link }]);
      try { const s = evtSeenSet(); s.add(link); localStorage.setItem(LS_EVTSEEN, JSON.stringify([...s].slice(-200))); } catch (e) {}
      try { updateEvents(Date.now()); } catch (e) {}
      return '이벤트 테스트 알람: ' + link;
    };
    // 테스트: __kwBdoEventUrgTest() → 12시간 뒤 종료 가짜 이벤트로 마감 임박 깜빡임 즉시 시험
    window.__kwBdoEventUrgTest = () => {
      const t = Date.now() + 12 * 3600 * 1000;
      const d = new Date(t + KST);
      const p2 = (n) => String(n).padStart(2, '0');
      const yo = ['일', '월', '화', '수', '목', '금', '토'][d.getUTCDay()];
      const period = '~ ' + d.getUTCFullYear() + '년 ' + (d.getUTCMonth() + 1) + '월 ' + d.getUTCDate() + '일(' + yo + ') ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes());
      if (!evtData || !Array.isArray(evtData.events)) evtData = { updatedAt: Date.now(), events: [] };
      evtData.events.unshift({ category: 'NEW 이벤트', title: '테스트 임박 이벤트', period, summary: '마감 임박 깜빡임 시험용', link: 'https://www.kr.playblackdesert.com/ko-KR/News/Detail?groupContentNo=13733#urgtest' + Date.now().toString(36) });
      evtState = 'ok'; evtSig = '';
      try { updateEvents(Date.now()); } catch (e) {}
      return '이벤트 임박 깜빡임 테스트: ' + period;
    };
  }
  // [BETA-TEST-ONLY:end]
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
      .then((j) => {
        if (!j || !Array.isArray(j.coupons)) throw new Error('format');
        cpnData = j; cpnState = 'ok';
        try { const fresh = cpnCheckNew(); if (opt('couponAlarm', true)) cpnAlarmNew(fresh); } catch (e) {} // 새 쿠폰 감지·알림 (끄면 조용히 기억만)
      })
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
    urgCss();
    const off = urgPrune(LS_URG_OFF_CPN, list.map((c) => 'c:' + c.code)); // 끄기 기록 정리 + 현재 끈 집합
    const urg = (c) => { const end = c.expiresAt || urgEndMs(c.expires); return urgIs(end, now) && !off.has('c:' + c.code); };
    const urgKeys = list.filter(urg).map((c) => 'c:' + c.code);
    const sig = [cpnState, fold ? 1 : 0, busy ? 1 : 0, flash ? 1 : 0, cpnData ? cpnData.updatedAt : 0, cpnFetchedAt, list.map((c) => c.code).join(','), urgKeys.join(',')].join('|');
    if (sig === cpnSig && cpnEl && cpnEl.isConnected) return;
    cpnSig = sig;
    let h = '<div id="__kw_cpn_hd" style="display:flex;align-items:center;justify-content:flex-start;gap:4px;cursor:pointer;min-height:26px;padding-right:58px">' +
      '<b style="font-size:12px;white-space:nowrap;display:inline-flex;align-items:center">' + TI(TI_TICKET, '#b784ff') + '쿠폰 모아보기&nbsp;<span style="color:#b784ff">(' + list.length + ')</span></b>' +
      (fold && urgKeys.length ? urgOffBtn('cpn-all', true) : '') +
      '<span style="display:inline-flex;align-items:center"><button id="__kw_cpn_rf" class="' + (busy ? '__kw_ic __kw_spin' : '') + '" title="' + (cpnFetchedAt ? '새로고침 (마지막 갱신 ' + pad2(new Date(cpnFetchedAt).getHours()) + ':' + pad2(new Date(cpnFetchedAt).getMinutes()) + ':' + pad2(new Date(cpnFetchedAt).getSeconds()) + ')' : '새로고침') + '" style="border:0;background:transparent;color:#b784ff;cursor:pointer;padding:5px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;position:relative;top:1.5px">' + (busy ? ICON_REFRESH : flash ? (cpnFlashErr ? ICON_FAIL : ICON_DONE) : ICON_REFRESH) + '</button>' +
      '<span title="' + (fold ? '펼치기' : '접기') + '" style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:8px;color:#b784ff;position:absolute;top:2px;right:26px;z-index:2"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="' + (fold ? 'M9 6l6 6-6 6' : 'M6 9l6 6 6-6') + '"/></svg></span></span></div>' + xBtn('__kw_cpn_x', '#b784ff', 'position:absolute;top:2px;right:3px;z-index:2', SHOW_X_TITLE);
    if (!fold) {
      h += '<div style="height:1px;background:rgba(255,255,255,.14);margin:4px -10px"></div>';
      h += '<div class="__kw_sb_cpn" style="flex:1;min-height:0;overflow-y:auto;margin-top:4px">';
      if (cpnState === 'err') h += '<div style="font-size:11px;color:#ff7b7b;margin-top:6px">쿠폰 목록을 받지 못했습니다. 새로고침(↻)을 눌러 보세요.</div>';
      else if (cpnState === 'idle' || (cpnState === 'loading' && !cpnData)) h += '<div style="font-size:11px;color:#aaa;margin-top:6px">불러오는 중...</div>';
      else if (!list.length) h += '<div style="font-size:11px;color:#aaa;margin-top:6px">사용할 수 있는 쿠폰이 없습니다.</div>';
      list.forEach((c, ci) => {
        const u = urg(c);
        h += '<div' + (u ? ' class="__kw_urg"' : '') + ' style="' + (ci ? 'margin-top:7px;padding-top:6px;border-top:1px solid rgba(255,255,255,.12)' : 'margin-top:2px') + '">' +
          '<div style="font-size:12px;font-weight:bold">' + esc(c.name || '쿠폰') + '</div>' +
          '<div style="margin:2px 0;display:flex;align-items:center;gap:6px"><code style="background:#2a2433;color:#e6d8ff;padding:1px 6px;border-radius:5px;font-size:12px;user-select:text;word-break:break-all">' + esc(c.code) + '</code>' +
          '<button class="__kw_cpn_cp" data-code="' + esc(c.code) + '" title="복사" style="border:0;background:transparent;color:#b784ff;cursor:pointer;padding:2px;display:inline-flex;align-items:center">' + ICON_COPY + '</button>' +
          (u ? urgOffBtn('c:' + c.code, false) : '') + '</div>' +
          (c.expires ? '<div style="font-size:11px;color:#b784ff">⏱ 만료 ' + esc(c.expires) + (u ? ' <b style="color:#ff9a9a">D-1</b>' : '') + '</div>' : '') + '</div>';
      });
      if (cpnData && cpnData.updatedAt) {
        const d = new Date(cpnData.updatedAt + KST);
        const p2 = (n) => String(n).padStart(2, '0');
        h += '<div style="font-size:10px;color:#777;margin-top:6px">목록 갱신 ' + (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + ' ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + '</div>';
      }
      h += '</div>';
    }
    cpnEl.innerHTML = h;
    try { cpnEl.classList.toggle('__kw_urg', fold && urgKeys.length > 0); } catch (e5b) {} // 접힘 + 임박 항목 → 창 전체 깜빡임
    if (cpnFitNext && !cpnFolded()) { // 펼치기 직후: 아래 기준으로 내용만큼, 화면을 넘으면 거기까지만
      cpnFitNext = false;
      try {
        const anchorB = cpnAnchorB > 0 ? cpnAnchorB : cpnEl.getBoundingClientRect().bottom; // 클릭 시점 아래 모서리
        cpnAnchorB = 0;
        cpnEl.style.height = 'auto';
        const need = cpnEl.scrollHeight;
        if (cpnEl.style.position === 'fixed') {
          // 띄움: 펼치기 전 아래 모서리 고정 → 위로 늘어남
          const room = Math.max(CPN_H_MIN, anchorB);
          cpnH = Math.max(CPN_H_MIN, Math.min(need, room, cpnHMax()));
          cpnEl.style.height = Math.min(cpnH, cpnHMax()) + 'px';
          cpnEl.style.top = Math.max(0, Math.round(anchorB - cpnH)) + 'px';
          try { bdoPosSaveEl(LS_CPNNPOS, cpnEl); } catch (er2) {}
        } else {
          // 도크: 레이아웃이 아래 고정 → 위로 늘어남
          const r = cpnEl.getBoundingClientRect();
          const room = Math.max(CPN_H_MIN, r.top + r.height);
          cpnH = Math.max(CPN_H_MIN, Math.min(need, room, cpnHMax()));
          cpnEl.style.height = Math.min(cpnH, cpnHMax()) + 'px';
        }
        try { localStorage.setItem(LS_CPNH, String(cpnH)); } catch (er) {}
        // [BETA-TEST-ONLY:start] 쿠폰 맞춤 진단 로그
        try { console.log('[KW-BETA]', 'cpn-fit', JSON.stringify({ need, anchorB: Math.round(anchorB), H: cpnH, topAfter: cpnEl.style.top, isFx: cpnEl.style.position === 'fixed' })); } catch (er3) {}
        // [BETA-TEST-ONLY:end]
      } catch (e5) {}
    }
    // 높이는 패널 통째로 명시 (내용 길이에 관계없이 조절이 바로 보이게). 접힘 상태는 자동 높이.
    try {
      cpnEl.style.display = 'flex';
      cpnEl.style.flexDirection = 'column';
      cpnEl.style.height = fold ? '' : Math.min(cpnH, cpnHMax()) + 'px';
    } catch (e5) {}
    if (cpnFoldB > 0) { // 접기: 아래 모서리 고정 → 아래로 접힘 (띄움만, 도크는 레이아웃)
      const fb = cpnFoldB; cpnFoldB = 0;
      if (fold && cpnEl.style.position === 'fixed') {
        try {
          cpnEl.style.top = Math.max(0, Math.round(fb - cpnEl.getBoundingClientRect().height)) + 'px';
          try { bdoPosSaveEl(LS_CPNNPOS, cpnEl); } catch (er2) {}
        } catch (e6) {}
      }
    }
    const hd = cpnEl.querySelector('#__kw_cpn_hd');
    if (hd) hd.onclick = (e) => {
      if (e.target && e.target.id === '__kw_cpn_rf') return;
      if (e.target && e.target.closest && e.target.closest('[data-urg-off]')) return;
      const was = cpnFolded();
      try { localStorage.setItem(LS_CPN_FOLD, was ? '0' : '1'); } catch (er) {}
      if (was) {
        cpnFitNext = true; // 펼칠 때 아래 기준으로 내용만큼 (화면을 넘으면 거기까지만)
        try { cpnAnchorB = Math.round(cpnEl.getBoundingClientRect().bottom); } catch (ex2) { cpnAnchorB = 0; }
      } else {
        try { cpnFoldB = Math.round(cpnEl.getBoundingClientRect().bottom); } catch (ex3) { cpnFoldB = 0; }
      }
      // [BETA-TEST-ONLY:start] 쿠폰 펼치기 진단 로그
      try { console.log('[KW-BETA]', 'cpn-unfold-click', JSON.stringify({ was })); } catch (ex) {}
      // [BETA-TEST-ONLY:end]
      cpnSig = '';
    };
    const cx = cpnEl.querySelector('#__kw_cpn_x');
    if (cx) cx.onclick = (e) => { e.stopPropagation(); setShow(LS_SHOW_CPN, false); removeCoupons(); mainSig = null; try { updateMain(Date.now()); } catch (er) {} };
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
    cpnEl.querySelectorAll('[data-urg-off]').forEach((el) => {
      el.onclick = (e) => {
        e.stopPropagation();
        const k = el.getAttribute('data-urg-off');
        if (k === 'cpn-all') urgKeys.forEach((kk) => urgDismiss(LS_URG_OFF_CPN, kk)); // 접힘: 임박 항목 전체 끄기
        else urgDismiss(LS_URG_OFF_CPN, k);
        cpnSig = '';
      };
    });
    try { // 창 기본형 상속: 쿠폰=가로+세로
      if (KW && typeof KW.window === 'function') {
        KW.window(cpnEl, {
          color: '#b784ff', posKey: LS_CPNNPOS, rsz: fold ? 'h' : 'd', dock: () => bdoOrder(), // 접힘=가로만, 펼침=가로+세로
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
    if (!stack || !panel || !panel.classList.contains('show')) { removeCoupons(); return; }
    if (cpnState === 'idle') loadCoupons(); // 처음 켜질 때 한 번 받아온다 (창 숨김과 무관, 알람용)
    else if (cpnState !== 'loading' && cpnSlotDue(now)) loadCoupons(); // 이후 매시 17분에 자동 갱신
    if (!showCpn()) { removeCoupons(); return; } // 창 숨김: 데이터·알람은 위에서 계속
    cpnAlarmBlink = false; // 창이 보이면 메인 반짝임 해제
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

  // ---------- 이벤트 모아보기 (#__kw_evt) ----------
  // 검은사막 사이트는 다른 사이트(치지직 페이지)에서 직접 읽을 수 없어서(CORS), 저장소의 events.json을 받아온다.
  // events.json은 scripts/crawl-events.js가 "진행중인 이벤트 모아보기" 페이지를 읽어 갱신한다.
  // 보스와 같은 스케줄: 켜질 때 한 번 받고, 이후 6시간마다 + 매주 수요일 12:27 슬롯에 다시 받는다.
  // 알람은 울리지 않고 목록만 보여준다. 항목을 누르면 상세 페이지가 팝업 창으로 열린다.
  const EVT_URL = 'https://raw.githubusercontent.com/Dark1004-K/Chzzk_Alert/main/events.json';
  const EVT_COLOR = '#2dd4bf';
  const LS_EVT_FOLD = '__kw_evt_fold';
  const LS_EVTPOS = '__kw_evt_pos';
  const LS_EVTSLOT = '__kw_evt_slot'; // 마지막으로 받은 수요일 슬롯 시각 (보스와 같은 슬롯 규칙)
  let evtEl = null;
  let evtData = null; // 마지막으로 받은 events.json
  let evtState = 'idle'; // idle | loading | ok | err
  let evtSig = ''; // 마지막으로 그린 내용의 서명 (바뀔 때만 다시 그림)
  let evtFetchedAt = 0; // 마지막으로 받아온 시각
  function evtSlotDue(now) { // 가장 최근 수요일 12:27 슬롯 이후에 받은 적이 없으면 true (보스와 같은 슬롯)
    let last = 0;
    try { last = parseInt(localStorage.getItem(LS_EVTSLOT), 10) || 0; } catch (e) {}
    return bossSlotTime(now) > last;
  }
  let evtBusyUntil = 0; // 이 시각까지는 "가져오는 중"(도는 아이콘)으로 보여줌
  let evtFlashUntil = 0; // 이 시각까지는 완료(체크)/실패(!) 표시
  let evtFlashErr = false;
  // 새 이벤트 감지·알림: 본 적 없는 이벤트가 들어오면 토스트+알림음 (+확장 TTS). 첫 수신 때는 조용히 기억만.
  const LS_EVTSEEN = '__kw_evt_seen';
  function evtSeenSet() { try { return new Set(JSON.parse(localStorage.getItem(LS_EVTSEEN)) || []); } catch (e) { return new Set(); } }
  function evtCheckNew() {
    const list = evtList();
    const seen = evtSeenSet();
    const fresh = list.filter((c) => c && c.link && !seen.has(c.link));
    try { localStorage.setItem(LS_EVTSEEN, JSON.stringify(list.map((c) => c.link).slice(-200))); } catch (e) {}
    if (!seen.size) return []; // 첫 수신: 알람 없이 기억만
    return fresh;
  }
  function evtAlarmNew(fresh) {
    (fresh || []).forEach((c) => {
      try {
        if (typeof KW.toast === 'function') KW.toast('📅 새 이벤트', (c.title || '이벤트'), () => {
          setShow(LS_SHOW_EVT, true); mainSig = null; // 토스트 클릭=이벤트창 열기
          try { updateEvents(Date.now()); } catch (e) {}
          try { updateMain(Date.now()); } catch (e) {}
        });
      } catch (e) {}
    });
    if (fresh && fresh.length) {
      try { if (opt('sound', true) && typeof KW.sound === 'function') KW.sound(); } catch (e) {}
      try { if (typeof KW.emit === 'function') KW.emit('event', { events: fresh.map((c) => ({ title: c.title, link: c.link })) }); } catch (e) {}
      if (!showEvt()) { evtAlarmBlink = true; try { updateMain(Date.now()); } catch (e) {} } // 숨어있으면 메인 버튼 반짝임
    }
    return (fresh || []).length;
  }
  function evtFolded() { try { return localStorage.getItem(LS_EVT_FOLD) === '1'; } catch (e) { return false; } }
  function evtList() {
    const l = evtData && Array.isArray(evtData.events) ? evtData.events : [];
    return l.filter((c) => c && c.title && c.link);
  }
  function removeEvents() {
    if (evtEl) { try { evtEl.remove(); } catch (e) {} }
    evtEl = null;
    evtSig = '';
  }
  function loadEvents(manual) {
    if (evtState === 'loading') return;
    evtState = 'loading';
    if (manual) evtBusyUntil = Date.now() + 700;
    evtSig = '';
    fetch(EVT_URL + '?t=' + Date.now(), { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error('http'); return r.json(); })
      .then((j) => {
        if (!j || !Array.isArray(j.events)) throw new Error('format');
        evtData = j; evtState = 'ok';
        try { const fresh = evtCheckNew(); if (opt('eventAlarm', true)) evtAlarmNew(fresh); } catch (e) {} // 새 이벤트 감지·알림 (끄면 조용히 기억만)
      })
      .catch(() => { evtState = evtData ? 'ok' : 'err'; }) // 실패해도 이전에 받은 목록은 유지
      .then(() => { evtFetchedAt = Date.now(); }) // 실패해도 6시간 뒤에 다시 시도
      .then(() => {
        if (manual) { // 직접 누른 경우에만 완료/실패를 눈에 띄게 표시
          evtFlashErr = evtState === 'err';
          const wait = Math.max(0, evtBusyUntil - Date.now()); // 최소 표시 시간만큼은 도는 모습 유지
          setTimeout(() => { evtFlashUntil = Date.now() + 1400; evtSig = ''; renderEvents(Date.now()); setTimeout(() => { evtSig = ''; }, 1500); }, wait);
        }
        evtSig = '';
      });
  }
  function evtOpen(link) {
    if (!link) return;
    try {
      const w = window.open(link, 'kwEvent', 'width=860,height=860,menubar=no,toolbar=no,location=yes,resizable=yes,scrollbars=yes');
      if (!w && typeof KW.toast === 'function') KW.toast('이벤트', '팝업이 차단됐습니다. 팝업을 허용하고 다시 누르세요.');
    } catch (e) {}
  }
  const LS_EVTCATS = '__kw_evt_cats'; // { [category]: 1 } 접힌 카테고리 (기본: NEW만 펼침)
  const EVT_CAT_ORDER = ['NEW 이벤트', 'HOT 이벤트', '상시 이벤트'];
  function evtCatsFolded() { try { return JSON.parse(localStorage.getItem(LS_EVTCATS)) || {}; } catch (e) { return {}; } }
  function evtCatFolded(cat, map) { const m = map || evtCatsFolded(); if (m && (cat in m)) return !!m[cat]; return cat !== 'NEW 이벤트'; } // 저장값 우선, 기본 NEW만 펼침
  function renderEvents(now) {
    const list = evtList();
    const fold = evtFolded();
    const busy = evtState === 'loading' || now < evtBusyUntil;
    const flash = now < evtFlashUntil;
    urgCss();
    const off = urgPrune(LS_URG_OFF_EVT, list.map((c) => 'e:' + c.link)); // 끄기 기록 정리 + 현재 끈 집합
    const urg = (c) => urgIs(urgEndMs(c.period), now) && !off.has('e:' + c.link);
    const urgKeys = list.filter(urg).map((c) => 'e:' + c.link);
    const cats = evtCatsFolded();
    // 카테고리 묶음 (NEW → HOT → 상시 → 기타 순)
    const gmap = {};
    const gorder = [];
    list.forEach((c, i) => { const k = c.category || '기타'; if (!(k in gmap)) { gmap[k] = []; gorder.push(k); } gmap[k].push({ c, i }); });
    gorder.sort((a, b) => {
      const ia = EVT_CAT_ORDER.indexOf(a), ib = EVT_CAT_ORDER.indexOf(b);
      if (ia < 0 && ib < 0) return 0;
      if (ia < 0) return 1;
      if (ib < 0) return -1;
      return ia - ib;
    });
    const sig = [evtState, fold ? 1 : 0, busy ? 1 : 0, flash ? 1 : 0, evtData ? evtData.updatedAt : 0, evtFetchedAt, list.map((c) => c.link).join(','), urgKeys.join(','), JSON.stringify(cats)].join('|');
    if (sig === evtSig && evtEl && evtEl.isConnected) return;
    evtSig = sig;
    let h = '<div id="__kw_evt_hd" style="display:flex;align-items:center;justify-content:flex-start;gap:4px;cursor:pointer;min-height:26px;padding-right:58px">' +
      '<b style="font-size:12px;white-space:nowrap;display:inline-flex;align-items:center">' + TI(TI_CAL, EVT_COLOR) + '이벤트 모아보기&nbsp;<span style="color:' + EVT_COLOR + '">(' + list.length + ')</span></b>' +
      (fold && urgKeys.length ? urgOffBtn('evt-all', true) : '') +
      '<span style="display:inline-flex;align-items:center"><button id="__kw_evt_rf" class="' + (busy ? '__kw_ic __kw_spin' : '') + '" title="' + (evtFetchedAt ? '새로고침 (마지막 갱신 ' + pad2(new Date(evtFetchedAt).getHours()) + ':' + pad2(new Date(evtFetchedAt).getMinutes()) + ':' + pad2(new Date(evtFetchedAt).getSeconds()) + ')' : '새로고침') + '" style="border:0;background:transparent;color:' + EVT_COLOR + ';cursor:pointer;padding:5px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;position:relative;top:1.5px">' + (busy ? ICON_REFRESH : flash ? (evtFlashErr ? ICON_FAIL : ICON_DONE) : ICON_REFRESH) + '</button>' +
      '<span title="' + (fold ? '펼치기' : '접기') + '" style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:8px;color:' + EVT_COLOR + ';position:absolute;top:2px;right:26px;z-index:2"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="' + (fold ? 'M9 6l6 6-6 6' : 'M6 9l6 6 6-6') + '"/></svg></span></span></div>' + xBtn('__kw_evt_x', EVT_COLOR, 'position:absolute;top:2px;right:3px;z-index:2', SHOW_X_TITLE);
    if (!fold) {
      h += '<div style="height:1px;background:rgba(255,255,255,.14);margin:4px -10px"></div>';
      h += '<div class="__kw_sb_evt" style="flex:1;min-height:0;overflow-y:auto;margin-top:4px">';
      if (evtState === 'err') h += '<div style="font-size:11px;color:#ff7b7b;margin-top:6px">이벤트 목록을 받지 못했습니다. 새로고침(↻)을 눌러 보세요.</div>';
      else if (evtState === 'idle' || (evtState === 'loading' && !evtData)) h += '<div style="font-size:11px;color:#aaa;margin-top:6px">불러오는 중...</div>';
      else if (!list.length) h += '<div style="font-size:11px;color:#aaa;margin-top:6px">진행 중인 이벤트가 없습니다.</div>';
      gorder.forEach((cat, gi) => {
        const items = gmap[cat];
        const collapsed = evtCatFolded(cat, cats);
        const gUrg = items.filter(({ c }) => urg(c));
        h += '<div' + (collapsed && gUrg.length ? ' class="__kw_urg"' : '') + ' data-evt-cat="' + esc(cat) + '" title="' + (collapsed ? '펼치기' : '접기') + '" style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-top:' + (gi ? '8px' : '2px') + ';padding:4px 6px;background:rgba(255,255,255,.05);border-radius:8px">' +
          '<b style="font-size:12px;color:' + EVT_COLOR + '">' + esc(cat) + ' (' + items.length + ')</b>' +
          '<span style="margin-left:auto;display:inline-flex;align-items:center;gap:2px">' +
          (gUrg.length ? urgOffBtn('evt-cat:' + cat, true) : '') +
          '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="' + (collapsed ? 'M9 6l6 6-6 6' : 'M6 9l6 6 6-6') + '"/></svg></span></div>';
        if (collapsed) return;
        items.forEach(({ c, i }) => {
          const u = urg(c);
          h += '<div' + (u ? ' class="__kw_urg"' : '') + ' style="margin-top:7px;padding-top:6px;border-top:1px solid rgba(255,255,255,.12)">' +
            '<div style="display:flex;align-items:flex-start;gap:4px"><button data-evt-go="' + i + '" title="' + esc(c.summary || c.title || '이벤트') + '" style="border:0;background:transparent;padding:0;cursor:pointer;display:block;flex:1;min-width:0;text-align:left">' +
            '<span style="font-size:12px;font-weight:bold;color:#fff">' + esc(c.title || '이벤트') + '</span></button>' +
            (u ? urgOffBtn('e:' + c.link, false) : '') + '</div>' +
            (c.period ? '<div style="font-size:11px;color:' + EVT_COLOR + '">⏱ ' + esc(c.period) + (u ? ' <b style="color:#ff9a9a">D-1</b>' : '') + '</div>' : '') + '</div>';
        });
      });
      if (evtData && evtData.updatedAt) {
        const d = new Date(evtData.updatedAt + KST);
        const p2 = (n) => String(n).padStart(2, '0');
        h += '<div style="font-size:10px;color:#777;margin-top:6px">목록 갱신 ' + (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + ' ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + '</div>';
      }
      h += '</div>';
    }
    evtEl.innerHTML = h;
    try { evtEl.classList.toggle('__kw_urg', fold && urgKeys.length > 0); } catch (e5b) {} // 접힘 + 임박 항목 → 창 전체 깜빡임
    // 높이는 패널 통째로 명시 (내용 길이에 관계없이 조절이 바로 보이게). 접힘 상태는 자동 높이.
    try {
      evtEl.style.display = 'flex';
      evtEl.style.flexDirection = 'column';
      evtEl.style.height = fold ? '' : Math.min(evtH, evtHMax()) + 'px';
    } catch (e5) {}
    const hd = evtEl.querySelector('#__kw_evt_hd');
    if (hd) hd.onclick = (e) => {
      if (e.target && e.target.id === '__kw_evt_rf') return;
      if (e.target && e.target.closest && e.target.closest('[data-urg-off]')) return;
      const was = evtFolded();
      try { localStorage.setItem(LS_EVT_FOLD, was ? '0' : '1'); } catch (er) {}
      evtSig = '';
    };
    const cx = evtEl.querySelector('#__kw_evt_x');
    if (cx) cx.onclick = (e) => { e.stopPropagation(); setShow(LS_SHOW_EVT, false); removeEvents(); mainSig = null; try { updateMain(Date.now()); } catch (er) {} };
    const rf = evtEl.querySelector('#__kw_evt_rf');
    if (rf) rf.onclick = (e) => { e.stopPropagation(); if (evtState === 'loading') return; loadEvents(true); renderEvents(Date.now()); };
    evtEl.querySelectorAll('[data-evt-go]').forEach((el) => {
      el.onclick = (e) => {
        e.stopPropagation();
        const item = list[Number(el.getAttribute('data-evt-go'))];
        if (item) evtOpen(item.link);
      };
    });
    evtEl.querySelectorAll('[data-urg-off]').forEach((el) => {
      el.onclick = (e) => {
        e.stopPropagation();
        const k = el.getAttribute('data-urg-off');
        if (k === 'evt-all') urgKeys.forEach((kk) => urgDismiss(LS_URG_OFF_EVT, kk)); // 창 접힘: 임박 항목 전체 끄기
        else if (k.indexOf('evt-cat:') === 0) { // 카테고리 접힘: 그 묶음의 임박 항목 끄기
          const cat = k.slice(8);
          (gmap[cat] || []).forEach(({ c }) => { if (urgKeys.indexOf('e:' + c.link) >= 0) urgDismiss(LS_URG_OFF_EVT, 'e:' + c.link); });
        }
        else urgDismiss(LS_URG_OFF_EVT, k);
        evtSig = '';
      };
    });
    evtEl.querySelectorAll('[data-evt-cat]').forEach((el) => {
      el.onclick = (e) => {
        if (e.target && e.target.closest && e.target.closest('[data-urg-off]')) return; // 그룹 끄기 버튼은 토글 제외
        const cat = el.getAttribute('data-evt-cat');
        const m = evtCatsFolded();
        m[cat] = evtCatFolded(cat, m) ? 0 : 1;
        try { localStorage.setItem(LS_EVTCATS, JSON.stringify(m)); } catch (er) {}
        evtSig = '';
        renderEvents(Date.now());
      };
    });
    try { // 창 기본형 상속: 이벤트=가로+세로
      if (KW && typeof KW.window === 'function') {
        KW.window(evtEl, {
          color: EVT_COLOR, posKey: LS_EVTPOS, rsz: fold ? 'h' : 'd', dock: () => bdoOrder(), // 접힘=가로만, 펼침=가로+세로
          getH: () => evtH,
          setH: (v) => {
            evtH = Math.max(EVT_H_MIN, Math.min(evtHMax(), v));
            evtEl.style.height = Math.min(evtH, evtHMax()) + 'px';
          },
          saveH: () => { try { localStorage.setItem(LS_EVTH, String(evtH)); } catch (er) {} },
        });
      } else {
        if (KW && typeof KW.rsz === 'function') {
          const cpos = bdoPosGet(LS_EVTPOS);
          const base = {
            dir: 'd', color: EVT_COLOR,
            getH: () => evtH,
            setH: (v) => {
              evtH = Math.max(EVT_H_MIN, Math.min(evtHMax(), v));
              const lst = evtEl.querySelector('.__kw_sb_evt');
              if (lst) lst.style.maxHeight = Math.min(evtH, evtHMax()) + 'px';
            },
            save: () => {
              try { localStorage.setItem(LS_EVTH, String(evtH)); } catch (er) {}
              if (cpos) bdoPosSaveEl(LS_EVTPOS, evtEl);
            },
          };
          if (cpos) {
            base.wMode = 'self';
            base.getW = () => evtEl.getBoundingClientRect().width;
            base.setW = (v) => { evtEl.style.width = Math.max(225, Math.min(600, Math.round(v))) + 'px'; };
          }
          KW.rsz(evtEl, base);
        }
        if (KW && typeof KW.float === 'function') KW.float(evtEl, { color: EVT_COLOR, key: LS_EVTPOS, dock: () => bdoOrder() });
      }
    } catch (e) {}
  }
  function updateEvents(now) {
    const stack = document.getElementById('__kw_stack');
    const panel = document.getElementById('__kw_panel');
    if (!stack || !panel || !panel.classList.contains('show')) { removeEvents(); return; }
    if (evtState === 'idle') loadEvents(); // 처음 켜질 때 한 번 받아온다 (창 숨김과 무관, 알람용)
    else if (evtState !== 'loading' && now - evtFetchedAt >= BOSS_REFRESH_MS) loadEvents(); // 이후 6시간마다
    else if (evtState !== 'loading' && evtSlotDue(now)) { // 매주 수요일 12:27 슬롯 (보스와 동일)
      try { localStorage.setItem(LS_EVTSLOT, String(bossSlotTime(now))); } catch (e) {}
      loadEvents();
    }
    if (!showEvt()) { removeEvents(); return; } // 창 숨김: 데이터·알람은 위에서 계속
    evtAlarmBlink = false; // 창이 보이면 메인 반짝임 해제
    if (!evtEl || !evtEl.isConnected) {
      evtEl = document.createElement('div');
      evtEl.id = '__kw_evt';
      evtEl.style.cssText = 'width:100%;box-sizing:border-box;background:rgb(20,20,24);color:#fff;font:13px sans-serif;padding:8px 10px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.5);border:1px solid ' + EVT_COLOR + ';position:relative';
      evtSig = '';
      stack.appendChild(evtEl);
    }
    bdoOrder();
    renderEvents(now);
  }

  // ---------- 파티모집 ----------
  // 치지직 채팅에 "#파티 검은사당 10분 내용..." 이라고 쓰면 등록된다. 종류는 아래 7가지(그 밖의 말은 "기타").
  // 한 사람(닉네임)당 진행 중인 모집은 1개만, 모집 시간(최대 10분, 안 쓰면 10분)이 지나면 저절로 사라진다.
  // 선택한 종류가 등록되면 알림(토스트·알림음·TTS)이 울린다. 목록은 이 페이지에서만 기억한다(새로고침하면 비움).
  const PARTY_KINDS = ['항해일퀘', '검은사당', '피의제단', '파티사냥', '아토락시온', '솔라레', '기타'];
  const PARTY_MAX_MIN = 10;
  let parties = []; // { id, nick, kind, content, exp }
  let partyEl = null, partySig = null;
  // partyShown/partyAlarmBlink는 코어(src/core.js)와 공유 (녹색창 버튼도 같은 값을 씀)
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
      if (partyKindsSel().includes(e.kind)) { // 선택한 종류만 알림 + 창 자동 표시
        try { KW.toast('👥 ' + e.kind + ' 파티 모집', nick + (e.content ? ': ' + e.content : '')); } catch (er) {}
        if (opt('sound', true)) { if (typeof KW.sound === 'function') KW.sound(); else beep(); }
        try { if (typeof KW.emit === 'function') KW.emit('party', { nick, kind: e.kind, content: e.content }); } catch (er) {}
        setPartyShown(true);
        partyAlarmBlink = true; // 보이면 아래 updateParty가 바로 해제, 숨어있으면 메인 버튼 반짝임 유지
        try { updateParty(Date.now()); } catch (er) {}
        try { updateMain(Date.now()); } catch (er) {}
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
  function setPartyShown(v) { // 표시 전환 (바뀔 때만 녹색 버튼 갱신)
    v = !!v;
    if (partyShown === v) return;
    partyShown = v;
    if (!v) partyAlarmBlink = false; // 닫힘=확인
    try { if (typeof renderPanel === 'function') renderPanel(); } catch (e) {}
  }
  function updateParty(now) {
    const stack = document.getElementById('__kw_stack');
    const panel = document.getElementById('__kw_panel');
    if (!opt('party', true)) { parties = []; setPartyShown(false); removeParty(); return; }
    if (!stack || !panel || !panel.classList.contains('show')) { removeParty(); return; }
    parties = parties.filter((x) => x.exp > now);
    const sel = partyKindsSel();
    const list = parties.filter((x) => sel.includes(x.kind));
    if (!partyShown) { removeParty(); return; } // 기본 숨음 + X로 닫은 뒤: 새 알림까지 숨음 유지
    if (!list.length) { setPartyShown(false); removeParty(); return; } // 모두 만료되면 자동 숨김
    if (partyAlarmBlink) { partyAlarmBlink = false; try { if (typeof renderPanel === 'function') renderPanel(); } catch (e) {} } // 보이면 반짝임 해제
    if (!partyEl || !partyEl.isConnected) {
      partyEl = document.createElement('div');
      partyEl.id = '__kw_bdo_party';
      partyEl.onclick = (e) => {
        if (e.target && e.target.closest && e.target.closest('#__kw_bdo_party_x')) { setPartyShown(false); removeParty(); return; } // X = 창만 닫기 (알림 옵션 유지)
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
  // 실시간 검색 전용. 동반 브릿지(chzzk_bridge)가 검은사막 사이트를 읽어오고, 파싱은 이 플러그인이 담당.
  // 브릿지가 없으면 검색 불가 (스냅샷 폴백 없음).
  const LS_FAMPOS = '__kw_family_pos';
  const LS_FAMQ = '__kw_family_q';
  const LS_GUILDQ = '__kw_guild_q';
  const LS_ITEMQ = '__kw_item_q';
  let famEl = null, famSig = null;
  let famQuery = ''; // 새로고침 시 초기화 (이전 검색어는 복원하지 않음)
  let guildQuery = '';
  let itemQuery = '';
  try { localStorage.removeItem(LS_FAMQ); localStorage.removeItem(LS_GUILDQ); localStorage.removeItem(LS_ITEMQ); } catch (e) {}
  // 결과창: 가문·길드·아이템 각각 독립 (동시 표시 가능)
  // ---------- 데이터 출처 안내창 (#__kw_bdo_famsrc, ? 버튼 위) ----------
  let famSrcEl = null;
  function removeFamSrc() {
    if (famSrcEl) { try { famSrcEl.remove(); } catch (e) {} }
    famSrcEl = null;
    try { document.removeEventListener('pointerdown', famSrcOutside, true); } catch (e) {}
    try { document.removeEventListener('keydown', famSrcEsc, true); } catch (e) {}
  }
  function famSrcOutside(e) {
    try {
      if (!famSrcEl || !famSrcEl.isConnected) return;
      if (famSrcEl.contains(e.target)) return;
      const sb = document.getElementById('__kw_fam_src');
      if (sb && sb.contains(e.target)) return; // ? 버튼 클릭은 토글에 맡김
    } catch (er) { return; }
    removeFamSrc(); // 바깥 클릭은 막지 않고 창만 닫음
  }
  function famSrcEsc(e) { try { if (e && e.key === 'Escape') removeFamSrc(); } catch (er) {} }
  function openFamSrc(anchor) {
    if (famSrcEl && famSrcEl.isConnected) { removeFamSrc(); return; } // 토글 닫기
    removeFamSrc();
    const W = Math.min(320, window.innerWidth - 16);
    const w = document.createElement('div');
    w.id = '__kw_bdo_famsrc';
    w.style.cssText = 'position:fixed;z-index:2147483647;width:' + W + 'px;max-height:60vh;overflow-y:auto;box-sizing:border-box;background:rgb(20,20,24);color:#fff;font:13px/1.55 sans-serif;padding:12px 14px 14px;border-radius:12px;border:1px solid #777;box-shadow:0 8px 28px rgba(0,0,0,.6);scrollbar-width:thin;opacity:' + bdoOpacity();
    const link = (url, label) => '<div style="color:#ccc">' + '<button data-src-go="' + url + '" title="' + label + ' 열기" style="border:0;background:transparent;color:#7ab8ff;font-size:13px;padding:0;cursor:pointer;text-decoration:underline">' + label + '</button></div>';
    w.innerHTML = xBtn('__kw_bdo_famsrc_x', '#aaaab9', 'position:absolute;top:2px;right:3px;z-index:2') +
      '<div style="display:flex;align-items:center;min-height:22px;padding-right:26px;margin-bottom:6px"><b style="font-size:13px">데이터 출처</b></div>' +
      '<div style="color:#ccc">본 데이터는 아래의 사이트를 참고합니다.</div>' +
      '<div style="margin-top:2px">' + link('https://bdocodex.com', 'bdocodex.com') + link('https://bdolytics.com', 'bdolytics.com') + link('https://www.kr.playblackdesert.com', 'www.kr.playblackdesert.com') + '</div>' +
      '<div style="margin-top:6px;color:#ccc">위 사이트와 협약은 맺지 않아 기능이 사라질 수 있습니다. 해당 기능이 사이트의 재산권 침해를 한다면 제작자에게 연락을 부탁 드립니다.</div>';
    document.body.appendChild(w);
    try { // ? 버튼 바로 위 (위 공간 부족이면 아래)
      const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null;
      const hh = w.offsetHeight || 220;
      let top = r ? r.top - hh - 8 : 70;
      if (top < 8) top = r ? r.bottom + 8 : 70;
      let left = r ? r.right - W : 8;
      left = Math.max(8, Math.min(window.innerWidth - W - 8, left));
      w.style.left = Math.round(left) + 'px';
      w.style.top = Math.max(8, Math.round(top)) + 'px';
    } catch (e) {}
    famSrcEl = w;
    const fx = w.querySelector('#__kw_bdo_famsrc_x');
    if (fx) fx.onclick = removeFamSrc;
    w.querySelectorAll('[data-src-go]').forEach((b) => {
      b.onclick = () => { const u = b.getAttribute('data-src-go'); if (u) { try { window.open(u, '_blank', 'noopener'); } catch (er) {} } };
    });
    try { document.addEventListener('pointerdown', famSrcOutside, true); } catch (e) {}
    try { document.addEventListener('keydown', famSrcEsc, true); } catch (e) {}
  }
  function removeFamily() {
    removeFamSrc();
    if (famEl) { try { famEl.remove(); } catch (e) {} }
    famEl = null;
    famSig = null;
  }
  function renderFamily() {
    if (!famEl || !famEl.isConnected) return;
    try { // 입력칸에 포커스가 있으면 다시 그리지 않음 (포커스·한글 조합 유지). 쿼리 변수는 input 이벤트에서 이미 동기화됨
      const ae = document.activeElement;
      if (ae && famEl.contains(ae) && ae.tagName && /^(INPUT|TEXTAREA)$/.test(ae.tagName)) {
        famSig = [famQuery, guildQuery, itemQuery].join('|');
        return;
      }
    } catch (er) {}
    const sig = [famQuery, guildQuery, itemQuery].join('|'); // 입력 중이 아닐 때만 다시 그림
    if (sig === famSig) return;
    famSig = sig;
    // 다시 그리기 전 포커스 기억 (innerHTML 교체로 포커스가 날아감 방지)
    let refocus = null;
    try {
      const ae = document.activeElement;
      if (ae && famEl.contains(ae) && ae.id) refocus = { id: ae.id, s: ae.selectionStart, e: ae.selectionEnd };
    } catch (er) {}
    famEl.innerHTML = xBtn('__kw_bdo_family_x', '#ff7ab8', 'position:absolute;top:2px;right:3px;z-index:2', SHOW_X_TITLE) +
      '<div style="display:flex;align-items:center;min-height:26px;padding-right:28px;flex:none"><b style="font-size:12px;white-space:nowrap;display:inline-flex;align-items:center">' + TI(TI_SEARCH, '#ff7ab8') + '검은사막 검색</b>' +
      '<button id="__kw_fam_src" title="데이터 출처" style="align-self:center;width:16px;height:16px;margin-left:6px;padding:0;border-radius:50%;border:1px solid #8a8a99;background:transparent;color:#ccc;font:bold 11px/14px sans-serif;cursor:pointer;flex:none">?</button></div>' +
      '<div style="display:flex;gap:6px;flex:none;margin-top:4px;padding-left:19px"><input id="__kw_fam_q" class="__kw_in" placeholder="가문명 입력" value="' + esc(famQuery) + '" style="flex:1;min-width:0"><button id="__kw_fam_go" title="검색" style="border:0;background:transparent;color:#ff7ab8;padding:5px;border-radius:8px;cursor:pointer;flex:none;display:inline-flex;align-items:center;justify-content:center"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">' + TI_SEARCH + '</svg></button></div>' +
      '<div style="display:flex;gap:6px;flex:none;margin-top:6px;padding-left:19px"><input id="__kw_guild_q" class="__kw_in" placeholder="길드명 입력" value="' + esc(guildQuery) + '" style="flex:1;min-width:0"><button id="__kw_guild_go" title="검색" style="border:0;background:transparent;color:#ff7ab8;padding:5px;border-radius:8px;cursor:pointer;flex:none;display:inline-flex;align-items:center;justify-content:center"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">' + TI_SEARCH + '</svg></button></div>' +
      '<div style="display:flex;gap:6px;flex:none;margin-top:6px;padding-left:19px"><input id="__kw_item_q" class="__kw_in" placeholder="아이템명 입력" value="' + esc(itemQuery) + '" style="flex:1;min-width:0"><button id="__kw_item_go" title="검색" style="border:0;background:transparent;color:#ff7ab8;padding:5px;border-radius:8px;cursor:pointer;flex:none;display:inline-flex;align-items:center;justify-content:center"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">' + TI_SEARCH + '</svg></button></div>';
    const qi = famEl.querySelector('#__kw_fam_q');
    const go = () => {
      famQuery = qi ? qi.value : '';
      try { localStorage.setItem(LS_FAMQ, famQuery); } catch (er) {}
      famSig = null;
      if (!famQuery.trim()) { famResQ = ''; liveFam = null; liveFamRev++; resSig = null; try { updateRes(Date.now()); } catch (er) {} renderFamily(); return; }
      famResQ = famQuery;
      resKind = 'fam';
      resSig = null;
      updateFamily(Date.now()); // 다시 그림 + 핸들(+/리사이즈) 즉시 복구
      startLive('fam', famQuery);
    };
    if (qi) qi.addEventListener('keydown', (e) => { try { e.stopPropagation(); } catch (er) {} if (e && e.key === 'Enter') { try { e.preventDefault(); } catch (er2) {} go(); } }); // Enter=검색
    if (qi) qi.addEventListener('input', () => { famQuery = qi.value; try { localStorage.setItem(LS_FAMQ, famQuery); } catch (er) {} });
    const gb = famEl.querySelector('#__kw_fam_go');
    if (gb) gb.onclick = go;
    const gi = famEl.querySelector('#__kw_guild_q');
    const goGuild = () => {
      guildQuery = gi ? gi.value : '';
      try { localStorage.setItem(LS_GUILDQ, guildQuery); } catch (er) {}
      if (!guildQuery.trim()) { guildResQ = ''; liveGuild = null; liveGuildRev++; resSig = null; try { updateRes(Date.now()); } catch (er) {} return; }
      guildResQ = guildQuery;
      resKind = 'guild';
      resSig = null;
      updateFamily(Date.now()); // 다시 그림 + 핸들(+/리사이즈) 즉시 복구
      startLive('guild', guildQuery);
    };
    if (gi) gi.addEventListener('keydown', (e) => { try { e.stopPropagation(); } catch (er) {} if (e && e.key === 'Enter') { try { e.preventDefault(); } catch (er2) {} goGuild(); } }); // Enter=검색
    if (gi) gi.addEventListener('input', () => { guildQuery = gi.value; try { localStorage.setItem(LS_GUILDQ, guildQuery); } catch (er) {} });
    const gg = famEl.querySelector('#__kw_guild_go');
    if (gg) gg.onclick = goGuild;
    const ii = famEl.querySelector('#__kw_item_q');
    const goItem = () => {
      itemQuery = ii ? ii.value : '';
      try { localStorage.setItem(LS_ITEMQ, itemQuery); } catch (er) {}
      if (!itemQuery.trim()) { itemResQ = ''; liveItem = null; liveItemRev++; selId = null; selPhase = ''; selData = null; resSig = null; try { updateRes(Date.now()); } catch (er) {} return; }
      itemResQ = itemQuery;
      resKind = 'item';
      selId = null; selPhase = ''; selData = null;
      resSig = null;
      updateFamily(Date.now()); // 다시 그림 + 핸들(+/리사이즈) 즉시 복구
      startLive('item', itemQuery);
    };
    if (ii) ii.addEventListener('keydown', (e) => { try { e.stopPropagation(); } catch (er) {} if (e && e.key === 'Enter') { try { e.preventDefault(); } catch (er2) {} goItem(); } }); // Enter=검색
    if (ii) ii.addEventListener('input', () => { itemQuery = ii.value; try { localStorage.setItem(LS_ITEMQ, itemQuery); } catch (er) {} });
    const ig = famEl.querySelector('#__kw_item_go');
    if (ig) ig.onclick = goItem;
    const fx = famEl.querySelector('#__kw_bdo_family_x');
    if (fx) fx.onclick = (e) => { e.stopPropagation(); setShow(LS_SHOW_FAM, false); removeFamily(); removeRes(); mainSig = null; try { updateMain(Date.now()); } catch (er) {} };
    const sbtn = famEl.querySelector('#__kw_fam_src');
    if (sbtn) sbtn.onclick = (e) => { try { e.stopPropagation(); } catch (er) {} openFamSrc(sbtn); };
    // 다시 그리기로 날아간 포커스 복구 (커서 위치 포함)
    try {
      if (refocus) {
        const el = famEl.querySelector('#' + refocus.id);
        if (el) { el.focus({ preventScroll: true }); try { if (refocus.s != null) el.setSelectionRange(refocus.s, refocus.e); } catch (er2) {} }
      }
    } catch (er3) {}
  }
  function updateFamily(now) {
    const stack = document.getElementById('__kw_stack');
    const panel = document.getElementById('__kw_panel');
    if (!showFam()) { removeFamily(); return; }
    if (!stack || !panel || !panel.classList.contains('show')) { removeFamily(); return; }
    if (!famEl || !famEl.isConnected) {
      famEl = document.createElement('div');
      famEl.id = '__kw_bdo_family';
      famEl.style.cssText = 'position:relative;width:fit-content;max-width:100%;align-self:flex-start;box-sizing:border-box;background:rgb(20,20,24);color:#fff;font:13px sans-serif;padding:8px 10px 18px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.5);border:1px solid #ff7ab8;display:flex;flex-direction:column;overflow:visible;min-width:225px';
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

  // ---------- 검색 결과창 (단일 창 + 종류탭 + 아이템 드릴다운) ----------
  // 가문·길드·아이템이 하나의 창을 공유. 탭으로 전환, 아이템은 목록→상세로 파고듦.
  const LS_RESPOS = '__kw_family_r_pos'; // 기존 가문 결과창 위치 승계
  const LS_RESH = '__kw_family_r_h';
  const RES_H_DEF = 300, RES_H_MIN = 120;
  const resHMax = () => Math.max(RES_H_MIN, window.innerHeight);
  let resH = RES_H_DEF;
  try { const rhv = parseInt(localStorage.getItem(LS_RESH), 10); if (rhv >= RES_H_MIN && rhv <= 4000) resH = rhv; } catch (e) {}
  let resEl = null, resSig = null;
  let resKind = 'fam'; // 'fam' | 'guild' | 'item' (현재 탭)
  let famResQ = ''; // 결과창 가문 검색어
  let guildResQ = ''; // 결과창 길드 검색어
  let itemResQ = ''; // 결과창 아이템 검색어
  let selId = null, selPhase = '', selData = null; // 옆 상세 pane: 선택된 아이템 (null=목록만)
  function removeRes() {
    if (resEl) { try { resEl.remove(); } catch (e) {} }
    resEl = null;
    resSig = null;
    marketData = null; marketPhase = 'idle'; // 결과창이 닫히면 현황창도 함께 닫음
    try { if (typeof removeMarket === 'function') removeMarket(); } catch (e) {}
    try { removeRecipe(); } catch (e) {}
  }
  // 결과창 위치: 저장된 곳, 없으면 검색창 오른쪽
  function placeRes() {
    if (!resEl) return;
    let done = false;
    try {
      const o = JSON.parse(localStorage.getItem(LS_RESPOS));
      if (o && isFinite(o.x) && isFinite(o.y)) {
        const w = isFinite(o.w) ? Math.max(225, Math.min(600, Math.round(o.w))) : 300;
        resEl.style.position = 'fixed';
        resEl.style.left = Math.max(0, Math.min(window.innerWidth - w, o.x)) + 'px';
        resEl.style.top = Math.max(0, Math.min(window.innerHeight - 100, o.y)) + 'px';
        resEl.style.bottom = 'auto';
        resEl.style.width = w + 'px';
        done = true;
      }
    } catch (e) {}
    if (done) return;
    try {
      const r = famEl && famEl.isConnected ? famEl.getBoundingClientRect() : null;
      const w = 300;
      resEl.style.position = 'fixed';
      resEl.style.width = w + 'px';
      resEl.style.bottom = 'auto';
      if (r && r.width > 0) {
        resEl.style.left = Math.max(0, Math.min(window.innerWidth - w, Math.round(r.right + 8))) + 'px';
        resEl.style.top = Math.max(0, Math.min(window.innerHeight - 100, Math.round(r.top))) + 'px';
      } else {
        resEl.style.left = Math.max(0, window.innerWidth - w - 16) + 'px';
        resEl.style.top = '70px';
      }
    } catch (e2) {}
  }
  // ---------- 실시간 검색 (동반 브릿지 fetch + 플러그인 파싱) ----------
  const BDO_BASE = 'https://www.kr.playblackdesert.com';
  // 동반이 뒤늦게 깔리거나 load 시점 ready를 놓치면 검색이 '브릿지 없음'으로 끝나버린다. 그때는 ping 후 잠깐 기다렸다가 다시 확인.
  function ensureBridge(waitMs) {
    if (KW.bridgeReady && KW.bridgeReady()) return Promise.resolve(true);
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        try { clearTimeout(to); } catch (e) {}
        try { document.removeEventListener('bdo-search-ready', onReady); } catch (e) {}
        resolve(v);
      };
      function onReady() { finish(true); }
      const to = setTimeout(() => finish(!!(KW.bridgeReady && KW.bridgeReady())), waitMs || 1500);
      try { document.addEventListener('bdo-search-ready', onReady); } catch (e) {}
      try { document.dispatchEvent(new CustomEvent('bdo-search-ping', {})); } catch (e) {}
    });
  }
  let bdoMaint = false, bdoMaintTold = false;
  const decHtml = (s) => String(s)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  const CODEX_BASE = 'https://bdocodex.com'; // 아이템 상세 설명 (2차)
  const BDOLY_BASE = 'https://bdolytics.com'; // 아이템 목록·상세 (1차)
  const BDOLY_IMG = 'https://cdn.questlog.gg/black-desert'; // bdolytics 아이콘 호스트 (API의 /assets/... 를 앞에 붙임)
  const CODEX_GRADE = { 0: '#c8c8c8', 1: '#3fb950', 2: '#58a6ff', 3: '#bc8cff', 4: '#f0883e' }; // 등급별 이름 색
  function bdoFetch(url, timeoutMs, base) {
    const call = () => KW.bridge('fetch', { url, base: base || BDO_BASE }, timeoutMs || 12000).then((r) => {
      if (!r || !r.ok || !r.data || typeof r.data.html !== 'string') {
        if (r && r.maintenance) {
          bdoMaint = true;
          if (!bdoMaintTold) { bdoMaintTold = true; try { KW.toast('검은사막 검색', '점검중입니다'); } catch (e) {} }
        }
        return null;
      }
      bdoMaint = false;
      return r.data.html;
    }).catch(() => null);
    if (KW.bridgeReady && KW.bridgeReady()) return call();
    return ensureBridge(1500).then((ok) => (ok ? call() : null)); // 뒤늦은 동반 대비 ping 후 재확인
  }
  function famRowsOf(html) {
    const out = [];
    const re = /<a href="([^"]*?Profile\?profileTarget=([^"&]+))"[^>]*>([^<]+)<\/a>/g;
    let m;
    while ((m = re.exec(html))) out.push({ family: decHtml(m[3]), profileTarget: decHtml(m[2]) });
    return out;
  }
  function lineListOf(html, title) {
    const re = new RegExp('<span class="title">' + title + '<\\/span>([\\s\\S]*?)<\\/li>');
    const m = re.exec(html);
    if (!m) return null;
    if (/<em class="lock">/.test(m[1])) return null;
    const t = decHtml(m[1]);
    return t || null;
  }
  function parseFamHtml(html) {
    const created = lineListOf(html, '가문생성일');
    const guild = lineListOf(html, '가입길드');
    const characters = [];
    const liRe = /<p class="character_name">([\s\S]*?)<\/p>\s*<p class="character_info">([\s\S]*?)<\/p>/g;
    let m;
    while ((m = liRe.exec(html))) {
      const main = /대표캐릭터/.test(m[1]);
      const name = decHtml(m[1].replace(/대표캐릭터/g, ''));
      if (!name) continue;
      const cm = /<em>([^<>]+)<\/em>/.exec(m[2]);
      let level = null;
      const lm = /Lv(?:<em class="lock">[^<]*<\/em>|(\d+))/.exec(m[2]);
      if (lm && lm[1]) level = parseInt(lm[1], 10);
      characters.push({ name, class: cm ? decHtml(cm[1]) : '', level, main });
    }
    return { created, guild, characters };
  }
  function guildRowsOf(html) {
    const out = [];
    const liRe = /<li>([\s\S]*?)<\/li>/g;
    let m;
    while ((m = liRe.exec(html))) {
      const block = m[1];
      const lm = /<a href="\/Adventure\/Guild\/GuildProfile\?[^"]*"[^>]*>([^<]+)<\/a>/.exec(block);
      if (!lm) continue;
      const mm = /<div class="guild_info">[\s\S]*?<a[^>]*>([^<]+)<\/a>/.exec(block);
      const dm = /<div class="date[^"]*">([^<]*)<\/div>/.exec(block);
      const cm = /<div class="member">([^<]*)<\/div>/.exec(block);
      out.push({ guild: decHtml(lm[1]), master: mm ? decHtml(mm[1]) : '', created: dm ? decHtml(dm[1]) : '', members: cm ? decHtml(cm[1]) : '' });
    }
    return out;
  }
  function parseGuildHtml(html) {
    const created = lineListOf(html, '길드생성일');
    let master = null;
    const mm = /<span class="title">대장<\/span>[\s\S]*?<a[^>]*>([^<]+)<\/a>/.exec(html);
    if (mm) master = decHtml(mm[1]);
    let members = null;
    const cm = /<span class="title">인원<\/span>[\s\S]*?<em>(\d+)<\/em>\s*명/.exec(html);
    if (cm) members = parseInt(cm[1], 10);
    let siege = null;
    const sm = /점령현황<\/span>([\s\S]{0,300})/.exec(html);
    if (sm) siege = decHtml(sm[1]) || null;
    const boxIdx = html.indexOf('구성원</h3>');
    const box = boxIdx >= 0 ? html.slice(boxIdx) : html;
    const memberList = [];
    const seen = {};
    const re = /<a href="[^"]*Profile\?profileTarget=([^"&]+)"[^>]*>([^<]+)<\/a>/g;
    let m;
    while ((m = re.exec(box))) {
      const family = decHtml(m[2]);
      if (!family || seen[family]) continue;
      seen[family] = 1;
      memberList.push({ family, profileTarget: decHtml(m[1]), role: master && family === master ? '대장' : '' });
    }
    return { created, master, members, siege, memberList };
  }
  let liveFamRev = 0, liveGuildRev = 0, liveItemRev = 0;
  let liveFam = null, liveGuild = null, liveItem = null; // { kind, q, phase:'loading'|'ok'|'miss', data } — 가문·길드·아이템 독립 (공유 시 한쪽 검색이 다른 쪽 결과를 덮음)
  const liveCache = {}; // "kind:Q" -> { t, data }
  function liveCached(kind, q) {
    try {
      const c = liveCache[kind + ':' + q];
      if (c && Date.now() - c.t < 3600000) return c.data;
    } catch (e) {}
    return null;
  }
  function searchLiveFam(q) {
    if (!KW.bridgeReady || !KW.bridgeReady()) return Promise.resolve(null);
    const su = BDO_BASE + '/ko-KR/Adventure?searchType=2&checkSearchText=False&searchKeyword=' + encodeURIComponent(q);
    return bdoFetch(su, 12000).then((html) => {
      if (!html) return null;
      const row = famRowsOf(html).find((x) => x && x.family === q) || null;
      if (!row || !row.profileTarget) return { miss: true };
      return bdoFetch(BDO_BASE + '/Adventure/Profile?profileTarget=' + row.profileTarget, 12000).then((ph) => {
        if (!ph) return null;
        const p = parseFamHtml(ph);
        if (!p.characters.length) return null;
        return { family: row.family, created: p.created, guild: p.guild, characters: p.characters };
      });
    }).catch(() => null);
  }
  function searchLiveGuild(q) {
    if (!KW.bridgeReady || !KW.bridgeReady()) return Promise.resolve(null);
    const su = BDO_BASE + '/ko-KR/Adventure/Guild?searchText=' + encodeURIComponent(q) + '&page=1';
    return bdoFetch(su, 12000).then((html) => {
      if (!html) return null;
      const row = guildRowsOf(html).find((x) => x && x.guild === q) || null;
      if (!row) return { miss: true };
      const params = 'guildName=' + encodeURIComponent(row.guild) + '&region=KR';
      return bdoFetch(BDO_BASE + '/Adventure/Guild/GuildProfile?' + params, 12000).then((ph) => {
        if (!ph) return null;
        const p = parseGuildHtml(ph);
        if (!p.memberList.length) return null;
        return { guild: row.guild, created: p.created, master: p.master || row.master || null, members: (p.members != null ? p.members : (parseInt(row.members, 10) || null)), siege: p.siege, memberList: p.memberList };
      });
    }).catch(() => null);
  }
  function parseBdolyticsItems(text) { // bdolytics 목록: {result:{data:[{id,name(icon 상대경로),grade,dbType}]}} — dbType:"item"만
    let j = null;
    try { j = JSON.parse(text); } catch (e) { return null; }
    const rows = (j && j.result && Array.isArray(j.result.data)) ? j.result.data : [];
    const out = [];
    for (const r of rows) {
      if (!r || r.dbType !== 'item') continue;
      const id = String((r.id == null ? '' : r.id));
      if (!id) continue;
      let iconUrl = String(r.icon || '');
      if (iconUrl && iconUrl.charAt(0) === '/') iconUrl = BDOLY_IMG + iconUrl;
      let grade = null;
      try { grade = (r.grade == null || r.grade === '' ? null : parseInt(r.grade, 10)); if (!isFinite(grade)) grade = null; } catch (e) { grade = null; }
      out.push({
        id,
        name: decHtml(String(r.name || '')),
        icon: iconUrl,
        href: BDOLY_BASE + '/ko/db/item/' + encodeURIComponent(id),
        grade,
      });
    }
    return out;
  }
  // ---------- calculator 1차 상세 (crafting 페이지와 동일 소스, database.getItem 대체) ----------
  // /ko/crafting/:id 가 쓰는 3종: getCraftingRecipes(990) + getMaterialGroups(105) + getCraftingItemMetadata(1663)
  // 최초 1회만 받아 캐시하고, 이후 상세·버튼·하위 레시피는 메모리에서 해결 (항목당 추가 호출 없음)
  let calcRecipes = null, calcGroups = null, calcMeta = null, calcInflight = null;
  function ensureCalcData() {
    if (calcRecipes && calcGroups && calcMeta) return Promise.resolve(true);
    if (calcInflight) return calcInflight;
    const ru = BDOLY_BASE + '/api/trpc/calculator.getCraftingRecipes?input=' + encodeURIComponent(JSON.stringify(null));
    const gu = BDOLY_BASE + '/api/trpc/calculator.getMaterialGroups?input=' + encodeURIComponent(JSON.stringify(null));
    const mu = BDOLY_BASE + '/api/trpc/calculator.getCraftingItemMetadata?input=' + encodeURIComponent(JSON.stringify({ language: 'ko' }));
    calcInflight = Promise.all([
      bdoFetch(ru, 12000, BDOLY_BASE),
      bdoFetch(gu, 12000, BDOLY_BASE),
      bdoFetch(mu, 12000, BDOLY_BASE),
    ]).then((arr) => {
      let r = null, g = null, m = null;
      try { r = JSON.parse(arr[0]).result.data; } catch (e) { r = null; }
      try { g = JSON.parse(arr[1]).result.data; } catch (e) { g = null; }
      try { m = JSON.parse(arr[2]).result.data; } catch (e) { m = null; }
      const ok = !!(r && g && m);
      calcRecipes = ok ? r : null; calcGroups = ok ? g : null; calcMeta = ok ? m : null;
      calcInflight = null;
      return ok;
    }).catch(() => { calcRecipes = calcGroups = calcMeta = null; calcInflight = null; return false; });
    return calcInflight;
  }
  function calcMetaOf(id) { // meta[id] -> { name, icon(상대경로), grade, ... } | null
    try {
      const m = calcMeta && calcMeta[String(id)];
      return (m && typeof m === 'object') ? m : null;
    } catch (e) { return null; }
  }
  function calcIcon(m) {
    let ic = String((m && m.icon) || '');
    if (ic && ic.charAt(0) === '/') ic = BDOLY_IMG + ic;
    return ic;
  }
  function calcGroupOf(gid) { // groupId -> [{ itemId, value }] | null
    try {
      gid = Number(gid);
      for (const g of (calcGroups || [])) {
        if (g && Number(g.groupId) === gid) return g.items || g.candidates || null;
      }
    } catch (e) {}
    return null;
  }
  function calcIngToRow(ing) { // calculator 재료 1개 -> { name, amount, id, icon, grade, alt } (id 확정, 검색 불필요)
    if (!ing) return null;
    if (ing.type === 'item') {
      const m = calcMetaOf(ing.itemId);
      const nm = (m && m.name) || String(ing.itemId);
      return { name: nm, amount: ing.quantity, id: String(ing.itemId), icon: calcIcon(m), grade: (m && m.grade != null ? m.grade : null) };
    }
    if (ing.groupId != null) { // 대체재 그룹: crafting과 동일하게 value===1인 항목을 대표로 (없으면 첫 항목)
      const items = calcGroupOf(ing.groupId) || [];
      if (!items.length) return { name: '재료 그룹 ' + ing.groupId, amount: ing.quantity, id: '', icon: '', grade: null };
      const rep = items.find((x) => Number(x.value) === 1) || items[0], m0 = calcMetaOf(rep.itemId);
      const alts = items.filter((x) => x !== rep).map((x) => {
        const mm = calcMetaOf(x.itemId);
        return { name: (mm && mm.name) || String(x.itemId), amount: ing.quantity, id: String(x.itemId), icon: calcIcon(mm), grade: (mm && mm.grade != null ? mm.grade : null), value: x.value };
      });
      return { name: (m0 && m0.name) || String(rep.itemId), amount: ing.quantity, id: String(rep.itemId), icon: calcIcon(m0), grade: (m0 && m0.grade != null ? m0.grade : null), value: rep.value, alt: alts };
    }
    return null;
  }
  function calcRecipesByProduct(id) { // productItemId == id 인 레시피 목록 (보통 0~1개)
    const out = [];
    try {
      const nid = Number(id);
      for (const r of (calcRecipes || [])) {
        if (r && Number(r.productItemId) === nid) out.push(r);
      }
    } catch (e) {}
    return out;
  }
  function buildCalcDetail(id) { // 1차 상세: 메타(종류·무게·가격) + 대표 레시피 (id 확정 행)
    const m = calcMetaOf(id);
    const recs = calcRecipesByProduct(id);
    const rows = [];
    if (recs.length) {
      for (const ing of (recs[0].ingredients || [])) {
        const row = calcIngToRow(ing);
        if (row) rows.push(row);
      }
    }
    const stats = [];
    if (m) {
      const cat = [m.mainCategory, m.subCategory].filter((x) => x).join(' · ');
      if (cat) stats.push('종류: ' + cat);
      if (m.weight != null && Number(m.weight) > 0) stats.push('무게: ' + m.weight + ' LT');
      try {
        if (m.buyPrice != null && Number(m.buyPrice) > 0) stats.push('구입가: ' + Number(m.buyPrice).toLocaleString('ko-KR'));
        if (m.vendorPrice != null && Number(m.vendorPrice) > 0) stats.push('판매가: ' + Number(m.vendorPrice).toLocaleString('ko-KR'));
      } catch (e) {}
    }
    return { icon: calcIcon(m), eng: '', stats, flags: [], desc: '', effects: [], hasRecipe: recs.length > 0, recipes: rows };
  }
  function parseCodexRecipe(html) { // bdocodex "- 제작 재료" 섹션 → [{ name, amount }] (이 아이템의 제작법, 정방향)
    try {
      let t = String(html || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
      t = t.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '\n');
      t = t.replace(/&nbsp;|&#160;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      const lines = t.split('\n').map((s) => s.replace(/\s+/g, ' ').trim());
      const out = [];
      let on = false;
      for (const ln of lines) {
        if (!on) { if (/^-\s*제작\s*재료/.test(ln)) on = true; continue; }
        if (!ln) continue;
        if (/^[※-]/.test(ln) || /대량 제작/.test(ln)) break;
        const m = /^(.+?)\s*x\s*(\d+)\s*$/.exec(ln);
        if (m) out.push({ name: m[1].trim(), amount: parseInt(m[2], 10) });
        else break;
      }
      return out;
    } catch (e) { return []; }
  }
  const ingCache = {}; // 재료명 -> { id, icon, grade } | null (bdolytics 검색 정확일치)
  function resolveIng(name) { // 재료명 → id/아이콘/등급 (캐시, 실패해도 null)
    name = String(name || '').trim();
    if (!name) return Promise.resolve(null);
    if (ingCache[name] !== undefined) return Promise.resolve(ingCache[name]);
    const su = BDOLY_BASE + '/api/trpc/database.searchEntities?input=' + encodeURIComponent(JSON.stringify({ searchTerm: name, language: 'ko', extendSearch: true }));
    return bdoFetch(su, 12000, BDOLY_BASE).then((txt) => {
      let found = null;
      try {
        const items = parseBdolyticsItems(String(txt || '')) || [];
        const cands = items.filter((x) => x && decHtml(String(x.name || '')) === name);
        // 동명 item 중복 시 플레이스홀더 아이콘(00000000_*)이 아닌 진짜를 우선
        found = cands.find((x) => x.icon && String(x.icon).indexOf('00000000_') < 0) || cands[0] || null;
      } catch (e) { found = null; }
      const out = found ? { id: String(found.id), icon: found.icon || '', grade: found.grade } : null;
      ingCache[name] = out;
      return out;
    });
  }
  function enrichIngs(ings) { // [{ name, amount }]에 id/icon/grade 부착 (직접 수정, 실패해도 이름은 표시)
    ings = Array.isArray(ings) ? ings : [];
    return Promise.all(ings.map((g) => {
      if (!g || g.id) return Promise.resolve(g);
      return resolveIng(g.name).then((o) => {
        if (o) { g.id = o.id; g.icon = o.icon; g.grade = o.grade; }
        return g;
      }).catch(() => g);
    }));
  }
  function normLine(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function mergeDetail(first, second) { // 1차(bdolytics)+2차(bdocodex) 합치기 — 중복 줄은 하나만
    const f = first || { stats: [], flags: [], desc: '', effects: [] };
    const s = second || { stats: [], flags: [], desc: '', effects: [] };
    const seen = {};
    (f.stats || []).concat(f.flags || []).concat(f.effects || []).forEach((x) => { const n = normLine(x); if (n) seen[n] = 1; });
    if (f.desc) { const n = normLine(f.desc); if (n) seen[n] = 1; }
    const stats = (f.stats || []).slice();
    const hasWeight = stats.some((x) => /^무게\s*:/.test(normLine(x)));
    (s.stats || []).forEach((x) => {
      const n = normLine(x);
      if (!n || seen[n]) return;
      if (hasWeight && /무\s*게\s*:|적재량\s*:/.test(n)) return; // 1차 무게와 중복
      seen[n] = 1; stats.push(x);
    });
    const flags = (f.flags || []).slice();
    (s.flags || []).forEach((x) => { const n = normLine(x); if (n && !seen[n]) { seen[n] = 1; flags.push(x); } });
    const effects = (f.effects || []).slice();
    (s.effects || []).forEach((x) => {
      const n = normLine(x);
      if (!n || seen[n]) return;
      let dup = false; // 한쪽이 다른 쪽을 포함하면 같은 내용으로 간주
      for (const k in seen) { if (k && (k.includes(n) || n.includes(k))) { dup = true; break; } }
      if (!dup) { seen[n] = 1; effects.push(x); }
    });
    let desc = f.desc || '';
    const sd = s.desc || '';
    if (sd) {
      const n1 = normLine(desc), n2 = normLine(sd);
      if (!n1) desc = sd;
      else if (n1 !== n2 && !n1.includes(n2) && !n2.includes(n1)) desc = desc + '\n' + sd;
      else if (n2.length > n1.length) desc = sd;
    }
    return { icon: f.icon || s.icon || '', eng: s.eng || f.eng || '', stats, flags, desc, effects, hasRecipe: !!(((f && f.recipes) || []).length || ((s && s.recipes) || []).length), recipes: ((f && f.recipes) || []).length ? f.recipes : ((s && s.recipes) || []) };
  }
  function parseCodexDetail(html) { // bdocodex 상세: 스탯·특성·설명·효과 (ID·구입/판매/수리비·강화 시뮬레이터 제외)
    html = String(html || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, ''); // 시세 스크립트(edescription 아님) 제거
    const card = html.split('<div class="addon_info')[0];
    let icon = '';
    const im = /<td class="icon_cell"><img src="([^"]+)"/.exec(card);
    if (im) icon = im[1].charAt(0) === '/' ? CODEX_BASE + im[1] : im[1];
    let eng = '';
    const em = /영어 이름:\s*<span[^>]*><b>([^<]+)<\/b>/.exec(card);
    if (em) eng = decHtml(em[1]);
    const stats = [];
    const tm = /<td class="titles_cell">([\s\S]*?)<\/td>/.exec(card);
    if (tm) {
      let t = tm[1];
      for (let k = 0; k < 5 && /<span class=" ?hide_me">/.test(t); k++) t = t.replace(/<span class=" ?hide_me">[\s\S]*?<\/span>/, ''); // 숨김 스탯(0 표시)은 제외
      t.split(/<br\s*\/?>/).forEach((ln) => { const s = decHtml(ln); if (s) stats.push(s); });
    }
    const flags = [];
    let desc = '';
    const effects = [];
    let bodyHtml = ''; // 본문 td (장비 페이지는 <tr>이 중첩되어 있어 가격 블록이 있는 쪽을 고름)
    try {
      let work = card;
      work = work.replace(/<div id="enchant_item_block"[\s\S]*?<\/div>/, ''); // 강화 재료 줄
      work = work.replace(/<div id="pe_block"[\s\S]*?<div id="cron_stones"[\s\S]*?<\/div>\s*<\/div>/, ''); // 퍼펙트·크론석 시뮬레이터
      work = work.replace(/일반 강화:/, ''); // 시뮬레이터 제목 잔재
      const bodies = [];
      const bre = /<tr><td colspan="2">([\s\S]*?)<\/td><\/tr>/g;
      let bmx;
      while ((bmx = bre.exec(work))) bodies.push(bmx[1]);
      for (const b of bodies) { if (/가격을 구입/.test(b)) { bodyHtml = b; break; } }
      if (!bodyHtml && bodies.length) bodyHtml = bodies[bodies.length - 1];
    } catch (e) {}
    if (bodyHtml) {
      const segs = bodyHtml.split(/<hr[^>]*>/);
      for (const sg of segs) {
        if (/가격을 구입/.test(sg)) continue; // 구입 가격·판매 가격·수리비 제외 (calculator 가격 표시)
        if (/real_price|게임 내 시장 가격|iconset_wrapper/.test(sg)) { // 시장 가격·지식 블록: 가격 줄만 빼고 지식 등은 유지
          sg.split(/<br\s*\/?>/).forEach((ln) => {
            const s = decHtml(ln);
            if (!s) return;
            if (/게임 내 시장 가격/.test(s)) return;
            if (/^KR:\s*[\d,]+/.test(s)) return;
            if (/재고:\s*[\d,]+\s*$/.test(s)) return;
            flags.push(s);
          });
          continue;
        }
        if (/id="edescription"/.test(sg) || /아이템 효과/.test(sg)) {
          sg.split(/<br\s*\/?>/).forEach((ln) => {
            const s = decHtml(ln);
            if (s && s !== '아이템 효과' && !/^[A-Z_0-9]+$/.test(s)) effects.push(s); // 섹션 제목·내부 코드만 제외, '- ...' 내용은 그대로
          });
          continue;
        }
        if (/-\s*설명/.test(sg)) {
          desc = sg.replace(/[\s\S]*?-\s*설명\s*:?/, '').split(/<br\s*\/?>/).map((ln) => decHtml(ln)).filter((s) => s).join('\n').trim();
          continue;
        }
        sg.split(/<br\s*\/?>/).forEach((ln) => { const s = decHtml(ln); if (!s) return; if (/^\s*-?\s*획득\s*시\s*귀속\s*$/.test(s)) return; flags.push(s); }); // '(-) 획득 시 귀속' 표기는 빼고 하위 내용은 유지
      }
    }
    return { icon, eng, stats, flags, desc, effects };
  }
  const selCache = {}; // [itemId] -> { t, data } 상세 캐시 (1+2차 병합 결과)
  const recipeCache = {}; // [itemId] -> { has, recipes } 제작 레시피 존재 여부 (calculator + bdocodex 기준)
  function fetchCalcDetail(id) { // 1차: calculator 메타+레시피 (상세 미리 표시 + 버튼 활성화용)
    return ensureCalcData().then((ok) => {
      if (!ok) return null;
      let d = null;
      try { d = buildCalcDetail(id); } catch (e) { d = null; }
      if (!d || (!d.stats.length && !d.icon && !d.hasRecipe)) return null;
      return d;
    }).catch(() => null);
  }
  function fetchCodexDetail(id) { // 2차: bdocodex 상세 (설명 보충 + 제작 재료, 로딩이 김)
    return bdoFetch(CODEX_BASE + '/kr/item/' + encodeURIComponent(id) + '/', 15000, CODEX_BASE).then((html) => {
      if (!html) return null;
      const d = parseCodexDetail(html);
      if (!d || (!d.stats.length && !d.flags.length && !d.desc && !d.effects.length)) return null;
      let recs = [];
      try { recs = parseCodexRecipe(html); } catch (e) { recs = []; }
      d.recipes = recs;
      d.hasRecipe = recs.length > 0;
      try { recipeCache[String(id)] = { has: recs.length > 0, recipes: recs }; } catch (e) {}
      return d;
    }).catch(() => null);
  }
  function searchLiveItem(q) {
    const run = () => {
      const su = BDOLY_BASE + '/api/trpc/database.searchEntities?input=' + encodeURIComponent(JSON.stringify({ searchTerm: q, language: 'ko', extendSearch: true }));
      let p = null;
      try { p = KW.bridge('fetch', { url: su, base: BDOLY_BASE }, 12000); } catch (e) { p = null; }
      if (!p || typeof p.then !== 'function') return Promise.resolve({ miss: true, error: '호출 실패' });
      return p.then((r) => {
      if (!r || !r.ok || !r.data || typeof r.data.html !== 'string') {
        if (r && r.maintenance) {
          bdoMaint = true;
          if (!bdoMaintTold) { bdoMaintTold = true; try { KW.toast('검은사막 검색', '점검중입니다'); } catch (e) {} }
          return { miss: true, error: '점검중' };
        }
        return { miss: true, error: '브릿지 응답 오류' + (r && r.error ? ' (' + r.error + ')' : '') };
      }
      bdoMaint = false;
      let items = null;
      try { items = parseBdolyticsItems(r.data.html); } catch (e) { items = null; }
      if (!items || !items.length) return { miss: true, error: '일치 항목 없음' };
      return { query: q, items };
      }).catch(() => ({ miss: true, error: '예외 발생' }));
    };
    if (KW.bridgeReady && KW.bridgeReady()) return run();
    return ensureBridge(1500).then((ok) => (ok ? run() : { miss: true, error: '브릿지 없음' }));
  }
  function openCodexDetail(id) { // 목록 클릭 → 1차(calculator) 먼저 표시 → 설명은 2차(bdocodex) 로딩 표시 후 병합
    id = String(id || '');
    if (!id) return;
    selId = id; selPhase = 'loading'; selData = null;
    try { if (typeof marketPrefetch === 'function') marketPrefetch(id); } catch (e) {}
    resKind = 'item';
    resSig = null;
    try { renderRes(); } catch (e) {}
    try { // 상세를 옆에 붙이므로 창이 좁으면 넓힘
      if (resEl && resEl.isConnected) {
        const w = resEl.getBoundingClientRect().width;
        if (w && w < 520) resEl.style.width = Math.min(560, window.innerWidth - 32) + 'px';
      }
    } catch (e) {}
    try {
      const c = selCache[id];
      const cHas = c && c.data && typeof c.data.hasRecipe === 'boolean';
      if (c && Date.now() - c.t < 3600000 && cHas) { selPhase = 'ok'; selData = c.data; resSig = null; try { renderRes(); } catch (e) {} return; }
    } catch (e) {}
    fetchCalcDetail(id).then((d1) => {
      if (selId !== id) return; // 다른 항목으로 넘어감
      if (!d1) { // 1차가 비면 2차만 시도
        fetchCodexDetail(id).then((d2) => {
          if (selId !== id) return;
          if (d2) { selPhase = 'ok'; selData = d2; try { selCache[id] = { t: Date.now(), data: d2 }; } catch (e) {} }
          else selPhase = 'miss';
          resSig = null;
          try { renderRes(); } catch (e2) {}
        });
        return;
      }
      selPhase = 'loading-desc'; selData = mergeDetail(d1, null); selData.descState = 'loading';
      resSig = null;
      try { renderRes(); } catch (e) {}
      setTimeout(() => { // 2차 무한 대기 방지: 20초 넘으면 실패 박스로 확정
        try {
          if (selId !== id || !selData || selData.descState !== 'loading') return;
          selData.descState = 'fail';
          resSig = null;
          renderRes();
        } catch (e) {}
      }, 20000);
      fetchCodexDetail(id).then((d2) => {
        if (selId !== id) return; // 다른 항목으로 넘어감
        const merged = mergeDetail(d1, d2);
        merged.descState = d2 ? 'ok' : 'fail';
        selPhase = 'ok'; selData = merged;
        try { selCache[id] = { t: Date.now(), data: merged }; } catch (e) {}
        resSig = null;
        try { renderRes(); } catch (e2) {}
      });
    });
  }
  function startLive(kind, q) {
    const isGuild = kind === 'guild', isItem = kind === 'item';
    const upd = updateRes;
    const ren = renderRes;
    const getLive = () => (isGuild ? liveGuild : isItem ? liveItem : liveFam);
    const setLive = (v) => { if (isGuild) liveGuild = v; else if (isItem) liveItem = v; else liveFam = v; };
    const bump = () => { if (isGuild) liveGuildRev++; else if (isItem) liveItemRev++; else liveFamRev++; };
    const hit = liveCached(kind, q);
    if (hit) { setLive({ kind, q, phase: 'ok', data: hit }); }
    else {
      const cur = { kind, q, phase: 'loading', data: null };
      setLive(cur);
      // 안전망: 20초 안에 응답이 없으면 miss로 확정 (무한 로딩 방지)
      try {
        setTimeout(() => {
          try {
            if (getLive() !== cur) return;
            setLive({ kind, q, phase: 'miss', data: { miss: true, timeout: true } });
            bump(); resSig = null; renderRes();
          } catch (e) {}
        }, 20000);
      } catch (e) {}
      let run = null;
      try { run = isGuild ? searchLiveGuild(q) : isItem ? searchLiveItem(q) : searchLiveFam(q); } catch (e) { run = null; }
      if (!run || typeof run.then !== 'function') {
        setLive({ kind, q, phase: 'miss', data: { miss: true, error: '호출 실패' } });
      } else {
      run.then((data) => {
        if (getLive() !== cur) return; // 같은 종류의 다른 검색으로 넘어감
        if (data && !data.miss) {
          setLive({ kind, q, phase: 'ok', data });
          try { liveCache[kind + ':' + q] = { t: Date.now(), data }; } catch (e) {}
        } else {
          setLive({ kind, q, phase: 'miss', data: (data && data.miss) ? data : null }); // 실패 사유(error) 유지
        }
        bump();
        resSig = null;
        try { ren(); } catch (e2) {}
      });
      }
    }
    bump();
    upd(Date.now());
  }
  function recipeBtnHtml(nm, icon) { // 제작 레시피 버튼 3상태 (거래소 버튼 아래)
    if (!selId || selPhase === 'miss') return '';
    const base = 'margin-top:8px;width:100%;box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:6px;border-radius:8px;padding:6px;font-size:11px;font-weight:bold;';
    const cv = recipeCache[selId];
    const v = (selData && typeof selData.hasRecipe === 'boolean') ? selData.hasRecipe
      : (cv && typeof cv === 'object' ? !!cv.has : cv);
    if (v === true) return '<button data-recipe-id="' + esc(selId) + '" data-recipe-name="' + esc(nm || itemResQ || '제작 레시피') + '" data-recipe-icon="' + esc(icon || '') + '" title="제작 레시피 보기" style="' + base + 'background:rgba(122,184,255,.08);border:1px solid rgba(122,184,255,.35);color:#7ab8ff;cursor:pointer">제작 레시피 보기</button>';
    if (v === false) return '<button disabled title="레시피 존재 하지 않음" style="' + base + 'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.14);color:#777;cursor:default">레시피 존재 하지 않음</button>';
    return '<button disabled title="레시피 확인 중" style="' + base + 'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.14);color:#888;cursor:default">레시피 확인 중...</button>';
  }
  // ---------- 제작 레시피 창 (#__kw_bdo_rcp, 결과창 오른쪽) ----------
  const LS_RCPPOS = '__kw_recipe_pos';
  const LS_RCPH = '__kw_recipe_h';
  const RCP_H_DEF = 380, RCP_H_MIN = 200, RCP_W = 320;
  let rcpEl = null, rcpKey = '', rcpName = '', rcpIcon = '', rcpRecipes = [];
  let rcpExpanded = {}, rcpSub = {}, rcpInflight = {}; // rcpExpanded[ingId:depth]=true, rcpSub[ingId]={loading|recipes[]}
  let rcpH = RCP_H_DEF;
  try { const rhv = parseInt(localStorage.getItem(LS_RCPH), 10); if (rhv >= RCP_H_MIN && rhv <= 4000) rcpH = rhv; } catch (e) {}
  function removeRecipe() {
    if (rcpEl) { try { rcpEl.remove(); } catch (e) {} }
    rcpEl = null; rcpKey = ''; rcpRecipes = []; rcpExpanded = {}; rcpSub = {}; rcpInflight = {};
  }
  function placeRecipe() { // 시세창 오른쪽, 없으면 결과창 오른쪽, 그것도 없으면 화면 오른쪽
    if (!rcpEl) return;
    let done = false;
    try {
      const o = JSON.parse(localStorage.getItem(LS_RCPPOS));
      if (o && isFinite(o.x) && isFinite(o.y)) {
        const w = isFinite(o.w) ? Math.max(225, Math.min(600, Math.round(o.w))) : RCP_W;
        rcpEl.style.position = 'fixed';
        rcpEl.style.left = Math.max(0, Math.min(window.innerWidth - w, o.x)) + 'px';
        rcpEl.style.top = Math.max(0, Math.min(window.innerHeight - 100, o.y)) + 'px';
        rcpEl.style.bottom = 'auto';
        rcpEl.style.width = w + 'px';
        done = true;
      }
    } catch (e) {}
    if (done) return;
    try {
      const anchor = (typeof marketEl !== 'undefined' && marketEl && marketEl.isConnected) ? marketEl.getBoundingClientRect()
        : (typeof resEl !== 'undefined' && resEl && resEl.isConnected) ? resEl.getBoundingClientRect()
        : (typeof famEl !== 'undefined' && famEl && famEl.isConnected) ? famEl.getBoundingClientRect() : null;
      const w = RCP_W;
      rcpEl.style.position = 'fixed';
      rcpEl.style.width = w + 'px';
      rcpEl.style.bottom = 'auto';
      if (anchor && anchor.width > 0 && anchor.right + 8 + w <= window.innerWidth) {
        rcpEl.style.left = Math.round(anchor.right + 8) + 'px';
        rcpEl.style.top = Math.max(0, Math.min(window.innerHeight - 100, Math.round(anchor.top))) + 'px';
      } else if (anchor && anchor.width > 0 && anchor.left - 8 - w >= 0) {
        rcpEl.style.left = Math.round(anchor.left - 8 - w) + 'px';
        rcpEl.style.top = Math.max(0, Math.min(window.innerHeight - 100, Math.round(anchor.top))) + 'px';
      } else {
        rcpEl.style.left = Math.max(0, window.innerWidth - w - 16) + 'px';
        rcpEl.style.top = '70px';
      }
    } catch (e2) {}
  }
  function recipeIngRow(g, depth) { // 재료 한 줄 (+ 펼치면 하위 레시피)
    const gid = String((g && g.id) || '');
    const isSelf = !!(gid && rcpKey && gid === String(rcpKey)); // 메인 아이템과 같은 하위: 순환 방지, 확장 불가
    const iname = decHtml(String((g && g.name) || ''));
    let ic = String((g && g.icon) || '');
    if (ic && ic.charAt(0) === '/') ic = BDOLY_IMG + ic;
    const gc = (g && g.grade != null && CODEX_GRADE[g.grade]) ? CODEX_GRADE[g.grade] : '#555';
    const open = !!rcpExpanded[gid + ':' + depth];
    const sub = gid ? rcpSub[gid] : null;
    const hasSub = !!(sub && sub.recipes && sub.recipes.length);
    const subLoading = !!(sub && sub.loading);
    let subHtml = '';
    if (open && !isSelf) {
      if (!sub || sub.loading) subHtml = '<div style="font-size:11px;color:#888;margin:2px 0 2px 26px">불러오는 중...</div>';
      else if (!hasSub) subHtml = '<div style="font-size:11px;color:#666;margin:2px 0 2px 26px">하위 레시피 없음</div>';
      else subHtml = '<div style="margin-left:16px">' + recipeRows(sub.recipes, depth + 1) + '</div>';
    }
    const togBtn = 'flex:none;width:18px;height:18px;padding:0;border-radius:50%;border:1px solid #8a8a99;background:transparent;color:#ccc;font:bold 12px/16px sans-serif;cursor:pointer';
    const togGap = 'flex:none;width:6px'; // 미확인: 약간의 간격만
    const togNone = 'flex:none;width:18px;text-align:center;font-size:14px;line-height:18px;color:#5a5a66'; // 하위 없음(확정): 다른 모양
    const tog = !gid ? '<span style="' + togGap + '"></span>'
      : isSelf ? '<span title="현재 아이템 (펼치기 불가)" style="' + togNone + '">·</span>'
      : open ? '<button data-rcp-sub="' + esc(gid) + '" data-rcp-depth="' + depth + '" data-rcp-nm="' + esc(iname) + '" title="접기" style="' + togBtn + '">－</button>'
      : hasSub ? '<button data-rcp-sub="' + esc(gid) + '" data-rcp-depth="' + depth + '" data-rcp-nm="' + esc(iname) + '" title="하위 레시피 펼치기" style="' + togBtn + '">＋</button>'
      : subLoading ? '<span style="flex:none;width:18px;text-align:center;font-size:10px;color:#888">…</span>'
      : '<span title="하위 레시피 없음" style="' + togNone + '">·</span>';
    const amt = (g && g.amount) == null ? '' : esc(String(g.amount)) + '개';
    return '<div style="display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.04);border-radius:8px;padding:6px 8px;margin-top:4px">' +
      tog +
      '<span style="flex:1;min-width:0;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(iname) + ((g && g.alt && g.alt.length) ? '<span style="color:#8a8a99;font-size:11px"> / ' + esc(g.alt.map((a) => a.name).join(' · ')) + '</span>' : '') + '</span>' +
      '<span style="flex:none;font-size:11px;color:#aaa;white-space:nowrap">' + amt + '</span>' +
      (ic ? '<img loading="lazy" src="' + esc(ic) + '" width="34" height="34" style="flex:none;border-radius:6px;border:2px solid ' + gc + ';background:rgba(0,0,0,.4)" onerror="this.remove()">' : '') +
      '</div>' + subHtml;
  }
  function recipeRows(recs, depth) {
    return (recs || []).map((r, ri) => {
      const ings = (r && Array.isArray(r.ingredients)) ? r.ingredients : [];
      const skipHead = depth === 0 && (recs || []).length === 1 && r && r.name && r.name === rcpName;
      const head = skipHead ? '' : '<div style="font-size:11px;font-weight:bold;color:#ffd76a;margin:8px 0 0">' + esc((r && r.name) || ('레시피 ' + (ri + 1))) + ((r && r.actionType) ? ' <span style="color:#8a8a99;font-weight:normal">· ' + esc(r.actionType) + '</span>' : '') + '</div>';
      return head + ings.map((g) => recipeIngRow(g, depth || 0)).join('');
    }).join('');
  }
  function renderRecipe() {
    if (!rcpEl || !rcpEl.isConnected) return;
    if (!calcRecipes && !calcInflight) { try { ensureCalcData().then(() => { try { renderRecipe(); } catch (e) {} }); } catch (e) {} }
    const sc0 = rcpEl.querySelector('.__kw_sb_rcp');
    const st0 = sc0 ? sc0.scrollTop : 0;
    const body = rcpRecipes.length
      ? recipeRows(rcpRecipes, 0)
      : '<div style="font-size:11px;color:#888;margin-top:8px">레시피가 없습니다.</div>';
    rcpEl.innerHTML = xBtn('__kw_bdo_rcp_x', '#ff7ab8', 'position:absolute;top:2px;right:3px;z-index:2') +
      '<div style="display:flex;align-items:center;min-height:26px;padding-right:28px;flex:none"><b style="font-size:12px;white-space:nowrap;display:inline-flex;align-items:center;overflow:hidden">' + (rcpIcon ? '<img src="' + esc(rcpIcon) + '" width="26" height="26" style="flex:none;border-radius:6px;background:rgba(255,255,255,.06);margin-right:6px" onerror="this.remove()">' : '') + esc(rcpName ? rcpName + ' - 제작 레시피' : '제작 레시피') + '</b></div>' +
      '<div style="flex:none;height:1px;background:rgba(255,255,255,.14);margin:4px -10px 0"></div>' +
      '<div class="__kw_sb_rcp" style="flex:1;min-height:0;overflow-y:auto;margin-top:2px">' + body + '</div>' +
      (hasCalcCrafting() ? '<button data-rcp-ext style="margin-top:8px;width:100%;box-sizing:border-box;background:transparent;border:1px solid rgba(255,255,255,.2);color:#7ab8ff;border-radius:8px;padding:6px;font-size:11px;cursor:pointer;flex:none">bdolytics 제작 페이지 열기</button>' : '');
    const xx = rcpEl.querySelector('#__kw_bdo_rcp_x');
    if (xx) xx.onclick = removeRecipe;
    rcpEl.querySelectorAll('[data-rcp-sub]').forEach((b) => {
      b.onclick = (e) => {
        try { e.stopPropagation(); } catch (er) {}
        const gid = b.getAttribute('data-rcp-sub');
        const dep = parseInt(b.getAttribute('data-rcp-depth'), 10) || 0;
        const gnm = b.getAttribute('data-rcp-nm') || gid;
        if (!gid || dep >= 3) return;
        if (rcpKey && gid === String(rcpKey)) return; // 메인 아이템과 같은 하위: 순환 방지
        const k = gid + ':' + dep;
        if (rcpExpanded[k]) { delete rcpExpanded[k]; renderRecipe(); return; }
        rcpExpanded[k] = true;
        ensureSub(gid, gnm, dep); // 미리 확인됐으면 즉시 펼침, 아니면 지금 조회
        renderRecipe();
      };
    });
    const xe = rcpEl.querySelector('[data-rcp-ext]');
    if (xe) xe.onclick = (e) => {
      try { if (e && e.stopPropagation) e.stopPropagation(); } catch (er) {}
      try {
        const w = window.open(BDOLY_BASE + '/ko/crafting/' + encodeURIComponent(rcpKey), 'kwCrafting', 'width=720,height=860,menubar=no,toolbar=no,location=yes,resizable=yes,scrollbars=yes');
        if (w && w.focus) { try { w.focus(); } catch (er2) {} }
        else if (!w && typeof KW.toast === 'function') KW.toast('제작 페이지', '팝업이 차단됐습니다. 팝업을 허용하고 다시 누르세요.');
      } catch (er3) {}
    };
    try { const sc1 = rcpEl.querySelector('.__kw_sb_rcp'); if (sc1) sc1.scrollTop = st0; } catch (e) {}
    wireRecipeWindow();
    try { prefetchVisibleSubs(); } catch (e) {}
  }
  function wireRecipeWindow() { // innerHTML 재렌더로 날아간 이동·리사이즈 핸들을 매번 복구 (멱등)
    try {
      if (rcpEl && rcpEl.isConnected && KW && typeof KW.window === 'function') {
        KW.window(rcpEl, {
          color: '#ff7ab8', posKey: LS_RCPPOS, rsz: 'd', dock: () => placeRecipe(),
          getH: () => rcpH,
          setH: (v) => {
            rcpH = Math.max(RCP_H_MIN, Math.min(resHMax(), v));
            rcpEl.style.height = Math.min(rcpH, resHMax()) + 'px';
          },
          saveH: () => { try { localStorage.setItem(LS_RCPH, String(rcpH)); } catch (er) {} },
        });
      }
    } catch (e) {}
  }
  function hasCalcCrafting() { // calculator에 해당 아이템 레시피가 있을 때만 외부 버튼 표시
    try {
      if (!calcRecipes || !rcpKey) return false;
      const nid = Number(rcpKey);
      if (!isFinite(nid)) return false;
      for (const r of calcRecipes) {
        if (r && Number(r.productItemId) === nid) return true;
      }
    } catch (e) {}
    return false;
  }
  function fetchCalcSubList(gid) { // 재료의 제작법 (calculator, id 확정 행 반환)
    return ensureCalcData().then((ok) => {
      if (!ok) return [];
      const recs = calcRecipesByProduct(gid);
      if (!recs.length) return [];
      const rows = [];
      for (const ing of (recs[0].ingredients || [])) {
        const row = calcIngToRow(ing);
        if (row) rows.push(row);
      }
      return rows;
    }).catch(() => []);
  }
  function fetchCodexRecipeList(gid) { // 재료의 제작법 (bdocodex 제작 재료 + 이름 해석, flat 반환)
    const cu = CODEX_BASE + '/kr/item/' + encodeURIComponent(gid) + '/';
    let p = null;
    try { p = bdoFetch(cu, 15000, CODEX_BASE); } catch (e) { p = null; }
    if (!p || !p.then) return Promise.resolve([]);
    return p.then((html) => {
      let flat = [];
      try { flat = parseCodexRecipe(String(html || '')); } catch (e) { flat = []; }
      return enrichIngs(flat).then(() => flat).catch(() => flat);
    }).catch(() => []);
  }
  function ensureSub(gid, gname, depth) { // 하위 레시피 확보 (있을 때만 + 표시, 중복 호출 방지)
    gid = String(gid || '');
    if (!gid || depth >= 3 || rcpSub[gid] || rcpInflight[gid]) return;
    if (rcpKey && gid === String(rcpKey)) return; // 메인 아이템과 같은 하위: 순환 방지
    const forKey = rcpKey;
    rcpInflight[gid] = true;
    rcpSub[gid] = { loading: true };
    fetchCalcSubList(gid).then((cflat) => {
      if ((cflat || []).length) { // calculator에 있으면 id 확정 행으로 바로 펼침
        delete rcpInflight[gid];
        if (forKey !== rcpKey) return; // 다른 아이템 창으로 넘어감
        rcpSub[gid] = { recipes: [{ name: String(gname || gid), ingredients: cflat }] };
        try { renderRecipe(); } catch (e) {}
        return;
      }
      fetchCodexRecipeList(gid).then((flat) => {
        delete rcpInflight[gid];
        if (forKey !== rcpKey) return; // 다른 아이템 창으로 넘어감
        rcpSub[gid] = { recipes: (flat || []).length ? [{ name: String(gname || gid), ingredients: flat }] : [] };
        try { renderRecipe(); } catch (e) {}
      });
    });
  }
  function prefetchVisibleSubs() { // 보이는 줄의 하위 레시피를 미리 확인 (확정된 것만 + 표시)
    const visit = (ings, depth) => {
      (ings || []).forEach((g) => {
        if (g && g.id) ensureSub(g.id, g.name, depth);
      });
    };
    (rcpRecipes || []).forEach((r) => visit(r.ingredients, 0));
    Object.keys(rcpExpanded).forEach((k) => {
      const li = k.lastIndexOf(':');
      const gid = li >= 0 ? k.slice(0, li) : k;
      const dep = li >= 0 ? (parseInt(k.slice(li + 1), 10) || 0) : 0;
      const sub = rcpSub[gid];
      if (!sub || !sub.recipes) return;
      sub.recipes.forEach((r) => visit(r.ingredients, dep + 1));
    });
  }
  function updateRecipe() {
    if (!rcpKey || !rcpRecipes.length) { removeRecipe(); return; }
    if (!rcpEl || !rcpEl.isConnected) {
      rcpEl = document.createElement('div');
      rcpEl.id = '__kw_bdo_rcp';
      rcpEl.style.cssText = 'position:fixed;box-sizing:border-box;background:rgb(20,20,24);color:#fff;font:13px sans-serif;padding:8px 10px 18px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.5);border:1px solid #ff7ab8;display:flex;flex-direction:column;overflow:visible;opacity:' + bdoOpacity() + ';height:' + Math.min(rcpH, resHMax()) + 'px';
      document.body.appendChild(rcpEl);
      placeRecipe();
    }
    renderRecipe();
    wireRecipeWindow();
  }
  function openRecipeWindow(id, name, icon) {
    id = String(id || '');
    if (!id) return;
    rcpKey = id; rcpName = String(name || ''); rcpIcon = String(icon || '');
    rcpExpanded = {}; rcpSub = {}; rcpInflight = {};
    const cv = recipeCache[id];
    const flat = ((typeof selId !== 'undefined' && selId === id && selData && selData.recipes) || (cv && cv.recipes) || []);
    rcpRecipes = flat.length ? [{ name: rcpName || '제작 레시피', ingredients: flat.map((g) => ({ name: g.name, amount: g.amount, id: g.id || '', icon: g.icon || '', grade: (g.grade != null ? g.grade : null), alt: g.alt || null })) }] : [];
    updateRecipe();
    const all = [];
    rcpRecipes.forEach((r) => { (r.ingredients || []).forEach((g) => all.push(g)); });
    enrichIngs(all).then(() => { if (rcpKey === id) { try { renderRecipe(); } catch (e) {} } }); // id 없는 bdocodex 행만 검색으로 보충
  }
  function selBodyHtml(fI) { // 옆 상세 pane 본문 (선택된 아이템)
    if (selPhase === 'loading' || !selData) return '<div style="font-size:11px;color:#aaa;margin-top:6px">아이템 상세 불러오는 중...</div>';
    if (selPhase === 'miss') return '<div style="font-size:11px;color:#aaa;margin-top:6px;line-height:1.5">상세를 불러오지 못했습니다.<br>잠시 뒤 다시 시도하세요.</div>';
    const d = selData;
    const it = ((fI || []).find((x) => x && x.id === selId)) || null;
    const nm = (it && it.name) || itemResQ || '아이템';
    const gc = (it && it.grade != null && CODEX_GRADE[it.grade]) ? CODEX_GRADE[it.grade] : '#fff';
    const href = (it && it.href) || (BDOLY_BASE + '/ko/db/item/' + encodeURIComponent(selId));
    const codexHref = CODEX_BASE + '/kr/item/' + encodeURIComponent(selId) + '/';
    const icon = (it && it.icon) || (d && d.icon) || ''; // 목록 썸네일 우선 (전체 창 통일)
    let h = '<div style="margin-top:6px;border:1px solid rgba(255,255,255,.16);border-top:2px solid ' + gc + ';border-radius:10px;background:linear-gradient(180deg,rgba(36,36,46,.98),rgba(18,18,24,.98));padding:10px;box-shadow:0 2px 10px rgba(0,0,0,.5)">' +
      '<div style="display:flex;align-items:flex-start;gap:9px">' +
      (icon ? '<img loading="lazy" src="' + esc(icon) + '" width="44" height="44" style="flex:none;border-radius:9px;border:2px solid ' + gc + ';background:rgba(0,0,0,.5)" onerror="__kwNoImg(this)">' : '') +
      '<div style="flex:1;min-width:0;align-self:center"><b style="display:block;font-size:14px;color:' + gc + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(nm) + '</b>' +
      ((d.eng) ? '<span style="display:block;font-size:11px;color:#8a8a99;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(d.eng) + '</span>' : '') + '</div>' +
      '<button class="__kw_ic" data-ext-open="' + esc(href) + '" title="bdolytics" style="color:#00ffa3;padding:3px;flex:none"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4L10 14M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/></svg></button>' +
      '<button class="__kw_ic" data-ext-open="' + esc(codexHref) + '" title="bdocodex" style="color:#7ab8ff;padding:3px;flex:none"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4L10 14M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/></svg></button></div>';
    const marketHook = (typeof window !== 'undefined' && typeof window.__kwBdoMarketTest === 'function');
    if (marketHook) {
      try { if (typeof marketPreviewHtml === 'function') h += marketPreviewHtml(selId); } catch (e) {}
      // 로그인됨 + 조회 성공 + 매물 없음 → 버튼을 "거래소 정보 없음"으로 바꾸고 비활성 (그 외는 기존 버튼 유지)
      let mkEmpty = false;
      try { const mc = marketPreCache[selId]; mkEmpty = !!(mc && !mc.miss && Array.isArray(mc.cond) && !mc.cond.length); } catch (e) {}
      h += '<button data-market-open="' + esc(selId) + '" data-market-name="' + esc(nm) + '" data-market-icon="' + esc(icon) + '" title="' + (mkEmpty ? '거래소 정보 없음' : '거래소 현황 보기') + '"' + (mkEmpty ? ' disabled' : '') + ' style="margin-top:8px;width:100%;box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:6px;background:rgba(0,255,163,.08);border:1px solid rgba(0,255,163,.35);color:#7dffb3;border-radius:8px;padding:6px;font-size:11px;font-weight:bold;' + (mkEmpty ? 'cursor:default;opacity:.45' : 'cursor:pointer') + '"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></svg>' + (mkEmpty ? '거래소 정보 없음' : '거래소 현황 보기') + '</button>';
    }
    h += recipeBtnHtml(nm, icon);
    if ((d.stats || []).length) {
      h += '<div style="margin-top:8px;padding-top:7px;border-top:1px solid rgba(255,255,255,.12)">';
      (d.stats || []).forEach((s, i) => {
        h += '<div style="font-size:11px;margin-top:2px;color:' + (i === 0 ? '#fff;font-weight:bold' : '#a9a9b8') + '">' + esc(s) + '</div>';
      });
      h += '</div>';
    }
    const flagRows = (d.flags || []).slice(); // bdocodex 본문 그대로 (획득 시 귀속 표기는 파싱 단계에서 제외)
    if (flagRows.length) {
      h += '<div style="margin-top:7px;padding-top:7px;border-top:1px solid rgba(255,255,255,.12)">';
      flagRows.forEach((s) => {
        h += '<div style="font-size:11px;color:#9ecfff;margin-top:2px">· ' + esc(String(s).replace(/^\s*-\s*/, '')) + '</div>';
      });
      h += '</div>';
    }
    if (d.descState === 'loading') h += '<div style="margin-top:8px;padding:9px;border:1px solid rgba(122,184,255,.4);border-radius:8px;background:rgba(122,184,255,.07);font-size:11px;color:#7ab8ff;display:flex;align-items:center;gap:7px"><span style="width:12px;height:12px;flex:none;border-radius:50%;border:2px solid rgba(122,184,255,.25);border-top-color:#7ab8ff;animation:__kwspin .8s linear infinite"></span>상세 설명 로딩 중...</div>';
    else if (d.descState === 'fail') h += '<div style="margin-top:8px;padding:9px;border:1px solid rgba(255,123,123,.4);border-radius:8px;background:rgba(255,123,123,.07);font-size:11px;color:#ff9a9a;line-height:1.5">상세정보를 가져오는데 실패했습니다. 나중에 다시 확인하세요.</div>';
    else if (d.desc) h += '<div style="margin-top:8px;padding:8px 9px;border-left:2px solid #e9bd23;border-radius:0 8px 8px 0;background:rgba(233,189,35,.06);font-size:11px;color:#e5d6a4;line-height:1.6;white-space:pre-line">' + esc(d.desc) + '</div>';
    if ((d.effects || []).length) {
      h += '<div style="margin-top:8px;padding-top:7px;border-top:1px solid rgba(255,255,255,.12)"><div style="font-size:11px;font-weight:bold;color:#ffd76a">◆ 아이템 효과</div>';
      d.effects.forEach((s) => {
        h += '<div style="margin-top:3px;font-size:11px;color:#ffdf7e;line-height:1.5">' + esc(s) + '</div>';
      });
      h += '</div>';
    }
    h += '</div>';
    return h;
  }
  function resKinds() {
    const k = [];
    if (famResQ.trim()) k.push('fam');
    if (guildResQ.trim()) k.push('guild');
    if (itemResQ.trim()) k.push('item');
    return k;
  }
  function clearResKind(k) { // X 버튼: 현재 탭의 검색어·입력값·상태를 지움
    if (k === 'guild') {
      guildResQ = '';
      liveGuild = null; liveGuildRev++;
      guildQuery = '';
      try { localStorage.setItem(LS_GUILDQ, ''); } catch (er) {}
      try {
        const gi = famEl && famEl.isConnected ? famEl.querySelector('#__kw_guild_q') : null;
        if (gi) gi.value = '';
      } catch (er2) {}
    } else if (k === 'item') {
      itemResQ = '';
      liveItem = null; liveItemRev++;
      selId = null; selPhase = ''; selData = null;
      itemQuery = '';
      try { localStorage.setItem(LS_ITEMQ, ''); } catch (er) {}
      try {
        const ii = famEl && famEl.isConnected ? famEl.querySelector('#__kw_item_q') : null;
        if (ii) ii.value = '';
      } catch (er2) {}
    } else {
      famResQ = '';
      liveFam = null; liveFamRev++;
      famQuery = '';
      try { localStorage.setItem(LS_FAMQ, ''); } catch (er) {}
      try {
        const qi = famEl && famEl.isConnected ? famEl.querySelector('#__kw_fam_q') : null;
        if (qi) qi.value = '';
      } catch (er2) {}
      famSig = null;
      try { renderFamily(); } catch (er3) {}
    }
  }
  function resTabHtml(kinds) {
    const names = { fam: '가문', guild: '길드', item: '아이템' };
    return '<div style="display:flex;gap:4px;flex:none;margin-top:6px">' + kinds.map((k) =>
      '<button data-restab="' + k + '" style="flex:1;border:1px solid ' + (k === resKind ? '#ff7ab8' : 'rgba(255,255,255,.16)') + ';background:' + (k === resKind ? 'rgba(255,122,184,.14)' : 'transparent') + ';color:' + (k === resKind ? '#ff9ec4' : '#999') + ';border-radius:8px;padding:3px 0;font-size:11px;font-weight:bold;cursor:pointer">' + names[k] + '</button>'
    ).join('') + '</div>';
  }
  let resKeepRev = ''; // 목록 스크롤 유지 키 (같은 검색 내 선택 이동시에만 복원)
  function renderRes() {
    if (!resEl || !resEl.isConnected) return;
    const kinds = resKinds();
    if (!kinds.length) { removeRes(); return; }
    if (!kinds.includes(resKind)) resKind = kinds[0];
    const bridgeOn = !!(KW.bridgeReady && KW.bridgeReady());
    const lvF = (liveFam && liveFam.q === famResQ) ? liveFam : null;
    const fF = (lvF && lvF.phase === 'ok' && lvF.data && !lvF.data.miss) ? lvF.data : null;
    const lvG = (liveGuild && liveGuild.q === guildResQ) ? liveGuild : null;
    const fG = (lvG && lvG.phase === 'ok' && lvG.data && !lvG.data.miss) ? lvG.data : null;
    const lvI = (liveItem && liveItem.q === itemResQ) ? liveItem : null;
    const fI = (lvI && lvI.phase === 'ok' && lvI.data && !lvI.data.miss && Array.isArray(lvI.data.items)) ? lvI.data.items : null;
    const sig = [resKind,
      famResQ, fF ? fF.family : '', fF ? (fF.characters || []).length : 0, lvF ? lvF.phase : '-', liveFamRev,
      guildResQ, fG ? fG.guild : '', fG ? (fG.memberList || []).length : 0, fG ? fG.siege : '', lvG ? lvG.phase : '-', liveGuildRev,
      itemResQ, fI ? fI.length : 0, lvI ? lvI.phase : '-', (lvI && lvI.data && lvI.data.error) || '', (lvI && lvI.data && lvI.data.timeout) ? 't' : '', liveItemRev,
      selId || '', selPhase, (selData && selData.descState) || '',
      bridgeOn ? 'b' : '-'].join('|');
    if (sig === resSig) return;
    resSig = sig;
    // 스크롤 유지: 같은 검색 안에서 아이템 선택/상세 로딩으로 다시 그려도 위치 그대로
    const keepRev = [resKind, liveFamRev, liveGuildRev, liveItemRev, famResQ, guildResQ, itemResQ].join('|');
    let keepListTop = null, keepItemTop = null;
    if (resKeepRev === keepRev) {
      try {
        const lf = resEl.querySelector('.__kw_sb_fam');
        if (lf) keepListTop = lf.scrollTop;
        const ll = resEl.querySelector('.__kw_sb_list');
        if (ll) keepListTop = ll.scrollTop;
        const it = resEl.querySelector('.__kw_sb_item');
        if (it) keepItemTop = it.scrollTop;
      } catch (e) {}
    }
    resKeepRev = keepRev;
    const needBridge = '<div style="font-size:11px;color:#ff7b7b;margin-top:6px;line-height:1.5">동반 브릿지(chzzk_bridge)가 필요합니다.<br>설치 후 방송 페이지를 새로고침하세요.</div>';
    const loading = '<div style="font-size:11px;color:#aaa;margin-top:6px">실시간 검색 중...</div>';
    let title = '', body = '', liveTag = false;
    if (resKind === 'guild') {
      const n = fG ? (fG.memberList || []).length : 0;
      title = TI(TI_USERS, '#ff7ab8') + (fG ? esc(fG.guild) + '&nbsp;<span style="color:#ff7ab8">(' + n + ')</span>' : esc(guildResQ || '검색 결과'));
      liveTag = !!fG;
      if (!bridgeOn) body = needBridge;
      else if (lvG && lvG.phase === 'loading') body = loading;
      else if (lvG && lvG.phase === 'miss' && lvG.data && lvG.data.timeout) body = '<div style="font-size:11px;color:#aaa;margin-top:6px;line-height:1.5">응답이 없습니다(시간 초과).<br>브릿지를 최신으로 업데이트하세요.</div>';
      else if (fG) {
        body = '<div style="display:flex;justify-content:space-between;margin-top:6px;font-size:11px;color:#888"><span>길드생성일</span><span>' + esc(fG.created || '') + '</span></div>' +
          '<div style="margin-top:2px;font-size:11px;color:#ddd">대장 ' + esc(fG.master || '?') + (fG.members ? ' · ' + fG.members + '명' : '') + '</div>' +
          (fG.siege ? '<div style="margin-top:2px;font-size:11px;color:#ddd">점령현황 ' + esc(fG.siege) + '</div>' : '');
        (fG.memberList || []).forEach((m) => {
          body += '<div style="display:flex;align-items:center;gap:6px;margin-top:5px;padding-top:5px;border-top:1px solid rgba(255,255,255,.12)">' +
            '<b style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1">' + esc(m.family || '?') + '</b>' +
            (m.role ? '<span style="background:#3a2a33;color:#ff9aab;border-radius:6px;padding:1px 6px;font-size:11px;font-weight:bold;white-space:nowrap">' + esc(m.role) + '</span>' : '') + '</div>';
        });
      } else body = '<div style="font-size:11px;color:#aaa;margin-top:6px;line-height:1.5">검색 결과가 없습니다.<br>길드명을 정확히 입력했는지 확인하세요.</div>';
    } else if (resKind === 'item') { // 목록 + 옆 상세 (bdolytics 1차 + bdocodex 설명 2차)
      const n = fI ? fI.length : 0;
      title = TI(TI_SEARCH, '#ff7ab8') + (fI ? esc(itemResQ) + '&nbsp;<span style="color:#ff7ab8">(' + n + ')</span>' : esc(itemResQ || '검색 결과'));
      liveTag = !!fI;
      if (!bridgeOn) body = needBridge;
      else if (lvI && lvI.phase === 'loading') body = loading;
      else if (lvI && lvI.phase === 'miss' && lvI.data && lvI.data.timeout) body = '<div style="font-size:11px;color:#aaa;margin-top:6px;line-height:1.5">응답이 없습니다(시간 초과).<br>브릿지를 최신으로 업데이트하세요.</div>';
      else if (lvI && lvI.phase === 'miss' && lvI.data && lvI.data.error) body = '<div style="font-size:11px;color:#aaa;margin-top:6px;line-height:1.5">검색 실패: ' + esc(lvI.data.error) + '</div>';
      else if (fI) {
        let listH = '';
        fI.forEach((it) => {
          const gc = (it.grade != null && CODEX_GRADE[it.grade]) ? CODEX_GRADE[it.grade] : '#fff';
          const sel = selId === it.id;
          listH += '<div class="__kw_item_row" data-item-id="' + esc(it.id) + '" title="옆에 상세 보기" style="display:flex;align-items:center;gap:8px;margin-top:5px;padding:5px 4px;border-top:1px solid rgba(255,255,255,.12);cursor:pointer' + (sel ? ';background:rgba(255,122,184,.12);border-radius:8px' : '') + '">' +
            thumbHtml(it.icon) +
            '<b style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1;color:' + gc + '">' + esc(it.name || '?') + '</b></div>';
        });
        if (selId) body = { twoCol: true, list: listH, detail: selBodyHtml(fI) };
        else body = listH;
      } else body = '<div style="font-size:11px;color:#aaa;margin-top:6px;line-height:1.5">검색 결과가 없습니다.<br>아이템명을 정확히 입력했는지 확인하세요.</div>';
    } else { // fam
      const n = fF ? (fF.characters || []).length : 0;
      title = TI(TI_SEARCH, '#ff7ab8') + (fF ? esc(fF.family) + '&nbsp;<span style="color:#ff7ab8">(' + n + ')</span>' : esc(famResQ || '검색 결과'));
      liveTag = !!fF;
      if (!bridgeOn) body = needBridge;
      else if (lvF && lvF.phase === 'loading') body = loading;
      else if (lvF && lvF.phase === 'miss' && lvF.data && lvF.data.timeout) body = '<div style="font-size:11px;color:#aaa;margin-top:6px;line-height:1.5">응답이 없습니다(시간 초과).<br>브릿지를 최신으로 업데이트하세요.</div>';
      else if (fF) {
        body = '<div style="display:flex;justify-content:space-between;margin-top:6px;font-size:11px;color:#888"><span>가문생성일</span><span>' + esc(fF.created || '') + '</span></div>' +
          (fF.guild ? '<div style="margin-top:2px;font-size:11px;color:#ff7ab8">' + esc(fF.guild) + '</div>' : '');
        (fF.characters || []).forEach((c) => {
          body += '<div style="display:flex;align-items:center;gap:6px;margin-top:5px;padding-top:5px;border-top:1px solid rgba(255,255,255,.12)">' +
            '<b style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1">' + esc(c.name || '?') + (c.main ? ' <span style="color:#ff7ab8;font-size:10px">대표</span>' : '') + '</b>' +
            '<span style="font-size:11px;color:#ddd;white-space:nowrap">' + esc(c.class || '') + '</span>' +
            '<span style="font-size:11px;color:' + (c.level ? '#7dffb3' : '#888') + ';white-space:nowrap">' + (c.level ? 'Lv' + c.level : '비공개') + '</span></div>';
        });
      } else body = '<div style="font-size:11px;color:#aaa;margin-top:6px;line-height:1.5">검색 결과가 없습니다.<br>가문명을 정확히 입력했는지 확인하세요.</div>';
    }
    const twoCol = (body && typeof body === 'object' && body.twoCol);
    let h = '<div style="display:flex;align-items:center;min-height:26px;padding-right:28px;flex:none"><b style="font-size:12px;white-space:nowrap;display:inline-flex;align-items:center;overflow:hidden">' + title + '</b></div>' +
      xBtn('__kw_bdo_res_x', '#ff7ab8', 'position:absolute;top:2px;right:3px;z-index:2') +
      '<div style="flex:none;height:1px;background:rgba(255,255,255,.14);margin:4px -10px 0"></div>' +
      (kinds.length > 1 ? resTabHtml(kinds) : '') +
      (liveTag ? '<div style="font-size:10px;color:#7dffb3;margin-top:4px">● 실시간 검색 결과</div>' : '') +
      (twoCol
        ? '<div style="flex:1;min-height:0;display:flex;gap:8px;margin-top:4px"><div class="__kw_sb_list" style="flex:1;min-width:0;overflow-y:auto">' + body.list + '</div><div style="flex:none;width:1px;background:rgba(255,255,255,.14);margin:4px 0"></div><div class="__kw_sb_item" style="flex:1.25;min-width:0;overflow-y:auto">' + body.detail + '</div></div>'
        : '<div class="__kw_sb_fam" style="flex:1;min-height:0;overflow-y:auto;margin-top:4px">' + body + '</div>');
    resEl.innerHTML = h;
    const rx = resEl.querySelector('#__kw_bdo_res_x');
    if (rx) rx.onclick = () => {
      clearResKind(resKind);
      if (!resKinds().length) removeRes();
      else { resSig = null; try { renderRes(); } catch (er) {} }
    };
    resEl.querySelectorAll('[data-restab]').forEach((t) => {
      t.onclick = () => { resKind = t.getAttribute('data-restab'); resSig = null; try { renderRes(); } catch (er) {} };
    });
    resEl.querySelectorAll('.__kw_item_row').forEach((row) => {
      row.onclick = () => {
        const id = row.getAttribute('data-item-id');
        if (!id) return;
        if (selId === id) { selId = null; selPhase = ''; selData = null; resSig = null; try { renderRes(); } catch (er) {} }
        else openCodexDetail(id);
      };
    });
    resEl.querySelectorAll('[data-ext-open]').forEach((b) => {
      b.onclick = (e) => {
        try { e.stopPropagation(); } catch (er) {}
        const u = b.getAttribute('data-ext-open');
        if (u) { try { window.open(u, '_blank', 'noopener'); } catch (er2) {} }
      };
    });
    resEl.querySelectorAll('[data-recipe-id]').forEach((b) => {
      b.onclick = (e) => {
        try { e.stopPropagation(); } catch (er) {}
        const id = b.getAttribute('data-recipe-id');
        if (id) { try { openRecipeWindow(id, b.getAttribute('data-recipe-name'), b.getAttribute('data-recipe-icon')); } catch (er2) {} }
      };
    });
    resEl.querySelectorAll('[data-market-open]').forEach((b) => {
      b.onclick = (e) => {
        try { e.stopPropagation(); } catch (er) {}
        const id = b.getAttribute('data-market-open');
        const nm = b.getAttribute('data-market-name');
        const ic = b.getAttribute('data-market-icon');
        if (id && typeof window.__kwBdoMarketTest === 'function') { try { window.__kwBdoMarketTest(id, nm, ic); } catch (er2) {} }
      };
    });
    try { // 저장해 둔 스크롤 복원 (목록/상세 각각)
      if (keepListTop != null) {
        const nl = resEl.querySelector('.__kw_sb_list') || resEl.querySelector('.__kw_sb_fam');
        if (nl) nl.scrollTop = keepListTop;
      }
      if (keepItemTop != null) {
        const ni = resEl.querySelector('.__kw_sb_item');
        if (ni) ni.scrollTop = keepItemTop;
      }
    } catch (e) {}
  }
  function updateRes(now) {
    const stack = document.getElementById('__kw_stack');
    const panel = document.getElementById('__kw_panel');
    if (!showFam() || !stack || !panel || !panel.classList.contains('show') || !famEl || !famEl.isConnected) { removeRes(); return; }
    if (!resKinds().length) { removeRes(); return; }
    if (!resEl || !resEl.isConnected) {
      resEl = document.createElement('div');
      resEl.id = '__kw_bdo_res';
      resEl.style.cssText = 'position:fixed;box-sizing:border-box;background:rgb(20,20,24);color:#fff;font:13px sans-serif;padding:8px 10px 18px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.5);border:1px solid #ff7ab8;display:flex;flex-direction:column;overflow:visible;opacity:' + bdoOpacity() + ';height:' + Math.min(resH, resHMax()) + 'px';
      document.body.appendChild(resEl);
      placeRes();
      resSig = null;
    }
    renderRes();
    try { // 창 기본형 상속: 결과창=가로+세로
      if (KW && typeof KW.window === 'function') {
        KW.window(resEl, {
          color: '#ff7ab8', posKey: LS_RESPOS, rsz: 'd', dock: () => placeRes(),
          getH: () => resH,
          setH: (v) => {
            resH = Math.max(RES_H_MIN, Math.min(resHMax(), v));
            resEl.style.height = Math.min(resH, resHMax()) + 'px';
          },
          saveH: () => { try { localStorage.setItem(LS_RESH, String(resH)); } catch (er) {} },
        });
      } else {
        if (KW && typeof KW.rsz === 'function') KW.rsz(resEl, {
          dir: 'd', color: '#ff7ab8', wMode: 'self',
          getW: () => resEl.getBoundingClientRect().width,
          setW: (v) => { resEl.style.width = Math.max(225, Math.min(600, Math.round(v))) + 'px'; },
          getH: () => resH,
          setH: (v) => {
            resH = Math.max(RES_H_MIN, Math.min(resHMax(), v));
            resEl.style.height = Math.min(resH, resHMax()) + 'px';
          },
          save: () => { try { localStorage.setItem(LS_RESH, String(resH)); } catch (er) {} },
        });
        if (KW && typeof KW.float === 'function') KW.float(resEl, { color: '#ff7ab8', key: LS_FAMPOS, dock: () => placeRes() });
      }
    } catch (e) {}
  }

  // (구 종류별 결과창 3개는 단일 결과창 renderRes/updateRes로 통합됨)

  // 거래소 현황 공유 상태 (BETA 블록 밖: tick 정리 코드가 참조하므로 선언 유지, 조회 로직은 베타 전용)
  const LS_MKTPOS = '__kw_market_pos';
  const LS_MKTH = '__kw_market_h';
  const MKT_H_DEF = 400, MKT_H_MIN = 200, MKT_W = 340;
  let marketEl = null, marketPhase = 'idle', marketName = '', marketData = null, marketKey = '', marketIcon = '';
  let marketPending = null; // 버튼 요청 보관 (현황창은 토큰 확보 후에만 염)
  let marketSig = null, marketRev = 0; // 같은 내용 반복 렌더 방지 (스크롤 유지)
  let marketH = MKT_H_DEF;
  const marketPreCache = {}; // 상세창 미리보기용 { [mainKey]: { cond, basePrice } | { miss:true } }
  const marketInflight = {}; // 조회 중 { [mainKey]: true }
  // 거래소 현황: 로그인 팝업 → 토큰 추출 → 시세 조회 (v3.4.0까지 베타 시험, v3.4.1부터 정식 포함)
  const TRADE_BASE = 'https://trade.kr.playblackdesert.com';
  function mlog(...a) { try { console.log('[KW-market]', ...a); } catch (e) {} }
  function marketCall(kind, params) {
    const p = Object.assign({ base: TRADE_BASE }, params || {});
    try { mlog('req', kind, p.url, kind === 'postForm' ? ('body ' + String(p.body || '').length + '자: ' + String(p.body || '').slice(0, 200)) : ''); } catch (e) {}
    try {
      const r = KW.bridge(kind, p, 15000);
      if (r && typeof r.then === 'function') return r.then((v) => {
        try {
          const d = (v && v.data) || {};
          const bodyTxt = d.text != null ? String(d.text) : (d.html != null ? String(d.html) : '');
          mlog('res', kind, p.url, 'ok=' + (v && v.ok), v && v.error ? ('error=' + v.error) : '', 'len=' + bodyTxt.length, bodyTxt.slice(0, 500));
        } catch (e) {}
        return v;
      }).catch((er) => { try { mlog('res-err', kind, p.url, String((er && er.message) || er)); } catch (e) {} return { ok: false, error: 'exception' }; });
    } catch (e) {}
    return Promise.resolve({ ok: false, error: '호출 실패' });
  }
  function marketFindToken(html) {
    const m = /name="__RequestVerificationToken"[^>]*value="([^"]+)"/.exec(String(html || ''));
    return m ? m[1] : null;
  }
  // ---------- 거래소 현황창 (#__kw_bdo_mk, 결과창 오른쪽) ----------
  try { const mhv = parseInt(localStorage.getItem(LS_MKTH), 10); if (mhv >= MKT_H_MIN && mhv <= 4000) marketH = mhv; } catch (e) {}
  const fmtN = (n) => { try { return Number(n).toLocaleString('ko-KR'); } catch (e) { return String(n); } };
  function removeMarket() {
    if (marketEl) { try { marketEl.remove(); } catch (e) {} }
    marketEl = null;
    marketSig = null;
  }
  function placeMarket() { // 결과창 오른쪽, 없으면 검색창 오른쪽, 그것도 없으면 화면 오른쪽
    if (!marketEl) return;
    let done = false;
    try {
      const o = JSON.parse(localStorage.getItem(LS_MKTPOS));
      if (o && isFinite(o.x) && isFinite(o.y)) {
        const w = isFinite(o.w) ? Math.max(225, Math.min(600, Math.round(o.w))) : MKT_W;
        marketEl.style.position = 'fixed';
        marketEl.style.left = Math.max(0, Math.min(window.innerWidth - w, o.x)) + 'px';
        marketEl.style.top = Math.max(0, Math.min(window.innerHeight - 100, o.y)) + 'px';
        marketEl.style.bottom = 'auto';
        marketEl.style.width = w + 'px';
        done = true;
      }
    } catch (e) {}
    if (done) return;
    try {
      const anchor = (typeof resEl !== 'undefined' && resEl && resEl.isConnected) ? resEl.getBoundingClientRect()
        : (typeof famEl !== 'undefined' && famEl && famEl.isConnected) ? famEl.getBoundingClientRect() : null;
      const w = MKT_W;
      marketEl.style.position = 'fixed';
      marketEl.style.width = w + 'px';
      marketEl.style.bottom = 'auto';
      if (anchor && anchor.width > 0 && anchor.right + 8 + w <= window.innerWidth) {
        marketEl.style.left = Math.round(anchor.right + 8) + 'px';
        marketEl.style.top = Math.max(0, Math.min(window.innerHeight - 100, Math.round(anchor.top))) + 'px';
      } else if (anchor && anchor.width > 0 && anchor.left - 8 - w >= 0) {
        marketEl.style.left = Math.round(anchor.left - 8 - w) + 'px';
        marketEl.style.top = Math.max(0, Math.min(window.innerHeight - 100, Math.round(anchor.top))) + 'px';
      } else {
        marketEl.style.left = Math.max(0, window.innerWidth - w - 16) + 'px';
        marketEl.style.top = '70px';
      }
    } catch (e2) {}
  }
  function marketGraphSvg(hist) { // 본 사이트식: Y축 M단위·X축 주간 날짜·값별 색(저=파랑·고=빨강)·최신가 중앙
    const pts = (hist || []).slice(-30);
    if (pts.length < 2) return '<div style="font-size:11px;color:#888">시세 기록 없음</div>';
    const vals = pts.map((p) => Number(p.value));
    let mn = Infinity, mx = -Infinity;
    vals.forEach((v) => { if (isFinite(v)) { if (v < mn) mn = v; if (v > mx) mx = v; } });
    if (!isFinite(mn)) return '<div style="font-size:11px;color:#888">시세 기록 없음</div>';
    if (mx === mn) mx = mn + 1;
    const W = 360, H = 130, PL = 44, PR = 10, PT = 18, PB = 20;
    const X = (i) => (PL + (W - PL - PR) * (i / (pts.length - 1))).toFixed(1);
    const Y = (v) => (PT + (H - PT - PB) * (1 - (v - mn) / (mx - mn))).toFixed(1);
    const lerp = (a, b, t) => Math.round(a + (b - a) * t);
    const heat = (t) => { // 저=파랑 → 중=회백 → 고=빨강
      const LO = [58, 108, 220], MID = [205, 205, 210], HI = [224, 62, 62];
      const A = t < 0.5 ? LO : MID, B = t < 0.5 ? MID : HI, k = t < 0.5 ? t * 2 : (t - 0.5) * 2;
      return 'rgb(' + lerp(A[0], B[0], k) + ',' + lerp(A[1], B[1], k) + ',' + lerp(A[2], B[2], k) + ')';
    };
    let segs = '';
    for (let i = 1; i < pts.length; i++) {
      const t = ((vals[i - 1] + vals[i]) / 2 - mn) / (mx - mn);
      segs += '<line x1="' + X(i - 1) + '" y1="' + Y(vals[i - 1]) + '" x2="' + X(i) + '" y2="' + Y(vals[i]) + '" stroke="' + heat(t) + '" stroke-width="1.4"/>';
    }
    const fmtM = (v) => v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? Math.round(v / 1e3) + 'K' : String(Math.round(v));
    const yT = [mx, (mn + mx) / 2, mn].map((v) => '<text x="' + (PL - 4) + '" y="' + (+Y(v) + 3) + '" text-anchor="end" font-size="9" fill="#999">' + fmtM(v) + '</text>').join('');
    const xi = [];
    for (let i = 0; i < pts.length && xi.length < 5; i += 7) xi.push(i);
    const xT = xi.map((i) => '<text x="' + X(i) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="9" fill="#999">' + esc(String((pts[i] && pts[i].days) || '').slice(5).replace('-', '/')) + '</text>').join('');
    const rp = Math.pow(10, Math.floor(Math.log10((mx - mn) / 2)));
    const rm = (mx - mn) / 2 / rp;
    const step = (rm >= 5 ? 5 : rm >= 2 ? 2 : 1) * rp;
    const last = pts[pts.length - 1];
    const cx = (PL + W - PR) / 2, cy = (PT + H - PB) / 2;
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="display:block;width:100%;background:rgba(255,255,255,.02);border-radius:8px">' +
      '<line x1="' + PL + '" y1="' + PT + '" x2="' + PL + '" y2="' + (H - PB) + '" stroke="#999" stroke-width="1"/>' +
      '<line x1="' + PL + '" y1="' + (H - PB) + '" x2="' + (W - PR) + '" y2="' + (H - PB) + '" stroke="#999" stroke-width="1"/>' +
      yT + segs + xT +
      '<text x="' + cx.toFixed(1) + '" y="' + cy.toFixed(1) + '" text-anchor="middle" font-size="15" font-weight="bold" fill="#fff" stroke="#141418" stroke-width="3" paint-order="stroke">' + fmtN(last.value) + '</text>' +
      '<text x="' + (W - PR) + '" y="10" text-anchor="end" font-size="9" fill="#999">(' + fmtN(step) + ')</text></svg>';
  }
  function renderMarket() {
    if (!marketEl || !marketEl.isConnected) return;
    const mSig = marketPhase + '|' + marketKey + '|' + marketRev;
    if (mSig === marketSig && marketEl.querySelector('#__kw_bdo_mk_x')) return; // 변화 없으면 DOM 유지 (스크롤·포커스 유지)
    marketSig = mSig;
    const mSc = marketEl.querySelector('.__kw_sb_mkt');
    const mSt = mSc ? mSc.scrollTop : 0;
    let body = '';
    if (marketPhase === 'loading') body = '<div style="font-size:11px;color:#aaa;margin-top:8px">시세 불러오는 중...</div>';
    else if (marketPhase === 'miss' || !marketData) body = '<div style="font-size:11px;color:#ff9a9a;margin-top:8px;line-height:1.6">시세를 불러오지 못했습니다.<br>다시 눌러주세요.</div>';
    else {
      const cond = marketData.cond || [];
      const sellTot = cond.reduce((n, c) => n + Number(c.sellCount), 0);
      const buyTot = cond.reduce((n, c) => n + Number(c.buyCount), 0);
      const lastH = (marketData.hist || []).slice(-1)[0] || null;
      const rows = cond.slice().sort((a, b) => Number(b.pricePerOne) - Number(a.pricePerOne)).map((c) => {
        const p = Number(c.pricePerOne), s = Number(c.sellCount), b = Number(c.buyCount);
        let tag = '';
        if (s > 0) tag += '<div style="font-size:10px;color:#7dffb3;white-space:nowrap">판매 대기 ' + fmtN(s) + '건</div>';
        if (b > 0) tag += '<div style="font-size:10px;color:#aaa;white-space:nowrap">구매 대기 ' + fmtN(b) + '건</div>';
        return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;background:rgba(255,120,120,.10);border-bottom:1px solid rgba(0,0,0,.5)">' +
          '<b style="font-size:12px;color:#ff9a9a">' + fmtN(p) + '</b><div style="text-align:right">' + (tag || '<span style="font-size:10px;color:#555">-</span>') + '</div></div>';
      }).join('');
      body =
        '<div style="margin-top:6px;flex:none">' + marketGraphSvg(marketData.hist) + '</div>' +
        '<div style="flex:none;font-size:11px;line-height:1.7">' + marketSummaryHtml(cond) + '</div>' +
        '<button data-trade-go="' + esc(marketKey) + '" title="거래소 구매하러 가기" style="margin-top:4px;width:100%;box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:6px;background:rgba(0,255,163,.08);border:1px solid rgba(0,255,163,.35);color:#7dffb3;border-radius:8px;padding:6px;font-size:11px;font-weight:bold;cursor:pointer;flex:none">거래소 구매하러 가기</button>' +
        '<div style="display:flex;justify-content:space-between;gap:6px;font-size:11px;color:#bbb;margin-top:4px;flex:none"><span>최근 거래: ' + (lastH ? esc(String(lastH.days || '')) : '-') + '</span><span>누적 거래: ' + fmtN(sellTot + buyTot) + '건</span></div>' +
        '<div style="flex:none;height:1px;background:rgba(255,255,255,.14);margin:8px -10px 0"></div>' +
        '<div class="__kw_sb_mkt" style="flex:1;min-height:0;overflow-y:auto;margin:0 -10px -18px;border-radius:0 0 12px 12px">' + (rows || '<div style="font-size:11px;color:#888;padding:8px 10px">목록 없음</div>') + '</div>';
    }
    marketEl.innerHTML = xBtn('__kw_bdo_mk_x', '#ff7ab8', 'position:absolute;top:2px;right:3px;z-index:2') +
      '<div style="display:flex;align-items:center;min-height:26px;padding-right:28px;flex:none"><b style="font-size:12px;white-space:nowrap;display:inline-flex;align-items:center;overflow:hidden">' + (marketIcon ? '<img src="' + esc(marketIcon) + '" width="26" height="26" style="flex:none;border-radius:6px;background:rgba(255,255,255,.06);margin-right:6px" onerror="this.remove()">' : (marketKey ? '<img src="https://static.pearlcdn.com/asset/trade/bdo_kr/Common/img/BDO/item/' + esc(String(marketKey)) + '.png" width="26" height="26" style="flex:none;border-radius:6px;background:rgba(255,255,255,.06);margin-right:6px" onerror="this.remove()">' : '')) + esc(marketName && marketName !== '거래소 현황' ? marketName + ' - 거래소 현황' : '거래소 현황') + '</b></div>' +
      '<div style="flex:none;height:1px;background:rgba(255,255,255,.14);margin:4px -10px 0"></div>' + body;
    const mx = marketEl.querySelector('#__kw_bdo_mk_x');
    if (mx) mx.onclick = () => { marketData = null; marketPhase = 'idle'; removeMarket(); };
    marketEl.querySelectorAll('[data-trade-go]').forEach((b) => {
      b.onclick = (e) => {
        try { e.stopPropagation(); } catch (er) {}
        const id = b.getAttribute('data-trade-go');
        if (!id) return;
        try {
          const w = window.open(TRADE_BASE + '/Home/item/' + encodeURIComponent(id), 'kwTradeItem', 'width=720,height=860,menubar=no,toolbar=no,location=yes,resizable=yes,scrollbars=yes');
          if (w && w.focus) { try { w.focus(); } catch (er2) {} }
          else if (!w && typeof KW.toast === 'function') KW.toast('거래소', '팝업이 차단됐습니다. 팝업을 허용하고 다시 누르세요.');
        } catch (er3) {}
      };
    });
    try { const sc2 = marketEl.querySelector('.__kw_sb_mkt'); if (sc2) sc2.scrollTop = mSt; } catch (e) {}
  }
  function updateMarket() {
    if (!showFam()) { removeMarket(); return; }
    if (marketPhase === 'idle' && !marketData) { removeMarket(); return; }
    if (!marketEl || !marketEl.isConnected) {
      if (marketPhase === 'loading') return; // 조회 중에는 결과 확정 후 생성 (빈 창 방지)
      marketEl = document.createElement('div');
      marketEl.id = '__kw_bdo_mk';
      marketEl.style.cssText = 'position:fixed;box-sizing:border-box;background:rgb(20,20,24);color:#fff;font:13px sans-serif;padding:8px 10px 18px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.5);border:1px solid #ff7ab8;display:flex;flex-direction:column;overflow:visible;opacity:' + bdoOpacity() + ';height:' + Math.min(marketH, resHMax()) + 'px';
      document.body.appendChild(marketEl);
      placeMarket();
    }
    renderMarket();
    try { // 창 기본형 상속: 현황창=가로+세로
      if (KW && typeof KW.window === 'function') {
        KW.window(marketEl, {
          color: '#ff7ab8', posKey: LS_MKTPOS, rsz: 'd', dock: () => placeMarket(),
          getH: () => marketH,
          setH: (v) => {
            marketH = Math.max(MKT_H_MIN, Math.min(resHMax(), v));
            marketEl.style.height = Math.min(marketH, resHMax()) + 'px';
          },
          saveH: () => { try { localStorage.setItem(LS_MKTH, String(marketH)); } catch (er) {} },
        });
      }
    } catch (e) {}
  }
  function parseSellBuy(txt) { // GetItemSellBuyInfo 응답 파싱 → { cond, basePrice, hist } 또는 null
    let j = null;
    try { j = JSON.parse(txt); } catch (e) { return null; }
    if (!j || Number(j.resultCode) !== 0) return null;
    let hist = [];
    try { const h = JSON.parse(j.resultMsg); if (Array.isArray(h)) hist = h; } catch (e) {}
    return { cond: Array.isArray(j.marketConditionList) ? j.marketConditionList : [], basePrice: Number(j.basePrice) || 0, hist };
  }
  function sellBuyFailKind(txt) { // 조회 실패 원인: 'auth'(미로그인) | 'data'(그 외·재시도 가능)
    const t = String(txt || '');
    if (!t) return 'data'; // 빈 응답: 네트워크 문제로 보고 miss 유지
    let j = null;
    try { j = JSON.parse(t); } catch (e) { j = null; }
    if (!j) return /로그인|아이디|비밀번호|login|signin|passport|accounts\.pearlabyss/i.test(t) ? 'auth' : 'data';
    if (Number(j.resultCode) === 0) return 'data';
    const msg = String((j.resultMsg || '') + ' ' + (j.message || '') + ' ' + (j.error || ''));
    if (/로그인|login|signin|인증|권한|permission|unauthor/i.test(msg)) return 'auth';
    return 'data';
  }
  function marketSummaryHtml(cond) { // 판매최저가/구매최저가 2행 (상세 미리보기·현황창 공용)
    cond = Array.isArray(cond) ? cond : [];
    const sells = cond.filter((c) => Number(c.sellCount) > 0);
    const buys = cond.filter((c) => Number(c.buyCount) > 0);
    const sellMin = sells.length ? Math.min.apply(null, sells.map((c) => Number(c.pricePerOne))) : 0;
    const buyMin = buys.length ? Math.min.apply(null, buys.map((c) => Number(c.pricePerOne))) : 0;
    const buyMax = buys.length ? Math.max.apply(null, buys.map((c) => Number(c.pricePerOne))) : 0;
    const sellShow = sellMin || buyMax; // 판매대기 없으면 구매최고가로 표시
    const sellTot = sells.reduce((n, c) => n + Number(c.sellCount), 0);
    const buyTot = buys.reduce((n, c) => n + Number(c.buyCount), 0);
    return '<div style="display:flex;justify-content:space-between;gap:6px"><span>판매최저가: <b style="font-size:12px;color:#7dffb3">' + (sellShow ? fmtN(sellShow) : '없음') + '</b></span><span style="color:#888;white-space:nowrap;display:inline-block;min-width:118px;text-align:right">예약구매 ' + fmtN(buyTot) + '개</span></div>' +
      '<div style="display:flex;justify-content:space-between;gap:6px"><span>구매최저가: <b style="font-size:12px;color:#ff9a9a">' + (buyMin ? fmtN(buyMin) : '없음') + '</b></span><span style="color:#888;white-space:nowrap;display:inline-block;min-width:118px;text-align:right">판매대기 ' + fmtN(sellTot) + '개</span></div>';
  }
  function marketPrefetch(key) { // 상세창 미리보기용 조용한 1회 조회 (팝업·현황창·토스트 없음, 실패하면 조용히 miss)
    key = String(key || '');
    if (!key || marketPreCache[key] || marketInflight[key]) return;
    try { if (!KW.bridgeReady || !KW.bridgeReady()) return; } catch (e) { return; }
    marketInflight[key] = true;
    (async () => {
      try {
        const pages = [TRADE_BASE + '/', TRADE_BASE + '/Home/list'];
        for (const u of pages) {
          const r = await marketCall('fetch', { url: u });
          const t = (r && r.ok && r.data && r.data.html) ? marketFindToken(r.data.html) : null;
          if (!t) continue;
          const body = '__RequestVerificationToken=' + encodeURIComponent(t) + '&keyType=0&mainKey=' + encodeURIComponent(key) + '&subKey=0&isUp=false';
          const pr = await marketCall('postForm', { url: TRADE_BASE + '/Home/GetItemSellBuyInfo', body });
          const txt = (pr && pr.ok && pr.data) ? String(pr.data.text || '') : '';
          const sd = parseSellBuy(txt);
          marketPreCache[key] = sd ? { cond: sd.cond, basePrice: sd.basePrice } : { miss: true };
          break;
        }
        if (!marketPreCache[key]) marketPreCache[key] = { miss: true };
      } catch (e) { marketPreCache[key] = { miss: true }; }
      delete marketInflight[key];
      try { resSig = null; renderRes(); } catch (e) {}
    })();
  }
  function marketPreviewHtml(key) { // 상세창 "거래소 현황 보기" 버튼 위 미리보기
    key = String(key || '');
    const c = marketPreCache[key];
    if (!c) return marketInflight[key] ? '<div style="margin-top:8px;font-size:11px;color:#888">시세 불러오는 중...</div>' : '';
    if (c.miss || !Array.isArray(c.cond)) return '';
    return '<div style="margin-top:8px;padding-top:7px;border-top:1px solid rgba(255,255,255,.12);font-size:11px;line-height:2">' + marketSummaryHtml(c.cond) + '</div>';
  }
  function marketAskLogin(key) { // 미로그인 확정 시: 로그인 안내만 (빈 현황창을 열지 않음). 로그인 후 폴링이 자동 조회
    marketLoginModal(() => {
      try {
        const w = window.open(TRADE_BASE + '/', 'kwTradeLogin', 'width=560,height=720,menubar=no,toolbar=no,location=yes,resizable=yes,scrollbars=yes');
        if (!w) { try { if (typeof KW.toast === 'function') KW.toast('거래소 테스트', '팝업이 차단됐습니다. 팝업을 허용하고 다시 누르세요.'); } catch (e) {} return; }
        try { if (w.focus) w.focus(); } catch (e) {}
      } catch (e) {}
      marketTestPoll(key, 30);
    });
  }
  function marketQueryWithToken(key, token) { // GetItemSellBuyInfo 1회 조회 → 결과 확정 후에만 현황창을 염
    if (marketPending && marketPending.key === String(key) && marketPending.name) marketName = marketPending.name;
    if (!marketName) marketName = itemResQ || '거래소 현황';
    if (marketPending && marketPending.key === String(key) && marketPending.icon) marketIcon = marketPending.icon;
    marketKey = String(key);
    marketPhase = 'loading';
    marketRev++;
    const body = '__RequestVerificationToken=' + encodeURIComponent(token) + '&keyType=0&mainKey=' + encodeURIComponent(key) + '&subKey=0&isUp=false';
    try { mlog('query', 'mainKey=' + key, 'token ' + String(token || '').length + '자'); } catch (e) {}
    return marketCall('postForm', { url: TRADE_BASE + '/Home/GetItemSellBuyInfo', body }).then((pr) => {
      const txt = (pr && pr.ok && pr.data) ? String(pr.data.text || '') : '';
      try { mlog('query-res', 'mainKey=' + key, 'ok=' + (pr && pr.ok), 'len=' + txt.length, txt.slice(0, 1000)); } catch (e) {}
      const sd = parseSellBuy(txt);
      if (!sd) {
        // 페이지 GET은 됐는데 POST가 비었으면 서버 거부(미로그인 유력). 로그인 서명도 함께 판정.
        if (!txt || sellBuyFailKind(txt) === 'auth') { // 미로그인: 빈 현황창 없이 로그인 안내만
          marketPhase = 'idle'; marketData = null; marketRev++;
          try { removeMarket(); } catch (e) {}
          marketAskLogin(key);
          return false;
        }
        marketPhase = 'miss'; marketRev++;
        try { updateMarket(); } catch (e) {}
        try { if (typeof KW.toast === 'function') KW.toast('거래소 현황', '조회 실패'); } catch (e) {}
        return false;
      }
      marketData = { key, cond: sd.cond, basePrice: sd.basePrice, hist: sd.hist };
      marketPhase = 'ok';
      marketRev++;
      try { window.__kwBdoMarketLast = { key, reqBody: body, response: txt.slice(0, 5000) }; } catch (e) {}
      try { updateMarket(); } catch (e) {}
      renderMarket();
      return true;
    }).catch(() => { marketPhase = 'miss'; marketRev++; renderMarket(); return false; });
  }
  function marketProbeOnce(key) { // 로그인 확인용 1회 시도: 결과가 오면 로그인됨 (창을 열지 않음)
    const pages = [TRADE_BASE + '/', TRADE_BASE + '/Home/list'];
    const step = (async () => {
      try {
        for (const u of pages) {
          const r = await marketCall('fetch', { url: u });
          const t = (r && r.ok && r.data && r.data.html) ? marketFindToken(r.data.html) : null;
          try { mlog('probe', u, t ? ('token 찾음 ' + String(t).length + '자') : 'token 없음'); } catch (e) {}
          if (t) return marketQueryWithToken(key, t);
        }
      } catch (e) {}
      return false;
    })();
    return step;
  }
  function marketTestPoll(key, left) {
    const pages = [TRADE_BASE + '/', TRADE_BASE + '/Home/list'];
    const step = (async () => {
      try {
        for (const u of pages) {
          const r = await marketCall('fetch', { url: u });
          const t = (r && r.ok && r.data && r.data.html) ? marketFindToken(r.data.html) : null;
          try { mlog('poll', u, '남은횟수=' + left, t ? 'token 찾음' : 'token 없음'); } catch (e) {}
          if (t) { await marketQueryWithToken(key, t); return; }
        }
        if (left > 0) setTimeout(() => marketTestPoll(key, left - 1), 3000);
        else {
          try { if (typeof KW.toast === 'function') KW.toast('거래소 테스트', '토큰을 못 찾았습니다. 로그인 상태를 확인하세요.'); } catch (e) {}
          marketPhase = 'miss'; try { renderMarket(); } catch (e) {}
        }
      } catch (e) {}
    })();
    return step;
  }
  function marketLoginModal(onLogin) { // 1회 로그인 안내 팝업 (로그인/닫기)
    try { const ex = document.getElementById('__kw_trade_login'); if (ex) ex.remove(); } catch (e) {}
    const w = document.createElement('div');
    w.id = '__kw_trade_login';
    w.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6)';
    w.innerHTML = '<div style="width:min(420px,90vw);box-sizing:border-box;background:rgb(20,20,24);color:#fff;font:13px sans-serif;padding:16px;border-radius:12px;border:1px solid #ff9f1a;box-shadow:0 4px 24px rgba(0,0,0,.6)">' +
      '<b style="font-size:13px">검은사막 거래소 로그인</b>' +
      '<div style="margin-top:8px;font-size:12px;color:#ddd;line-height:1.7;white-space:pre-line">검은사막 거래소 현황을 보기 위해서는 1회 로그인이 필요합니다.\nCHZZK Alert는 절대적으로 개인 PC에서만 구동되며,\n로그인 정보 및 개인 정보를 절대 수집하지 않으니 안심하시고 사용하셔도 됩니다.</div>' +
      '<div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end"><button id="__kw_trade_login_no" style="border:1px solid rgba(255,255,255,.25);background:transparent;color:#ccc;border-radius:8px;padding:7px 16px;font-size:12px;cursor:pointer">닫기</button>' +
      '<button id="__kw_trade_login_yes" style="border:0;background:#00ffa3;color:#000;border-radius:8px;padding:7px 16px;font-size:12px;font-weight:bold;cursor:pointer">로그인</button></div></div>';
    const close = () => { try { w.remove(); } catch (e) {} };
    try {
      w.addEventListener('mousedown', (e) => { if (e.target === w) close(); });
      w.querySelector('#__kw_trade_login_no').onclick = close;
      w.querySelector('#__kw_trade_login_yes').onclick = () => { close(); try { onLogin(); } catch (e) {} };
      document.body.appendChild(w);
    } catch (e) {}
  }
  { // 거래소 조회 후크 (상세창 버튼이 호출)
    window.__kwBdoMarketTest = (mainKey, name, icon) => {
      const key = String(mainKey || '4998');
      marketKey = key;
      marketPending = { key, name: String(name || itemResQ || '거래소 현황'), icon: String(icon || '') };
      marketProbeOnce(key).then((done) => {
        if (done) return; // 로그인됨 → 바로 조회 끝. 창을 열지 않음
        marketAskLogin(key); // 미로그인 → 안내만 (로그인 후 폴링이 자동 조회)
      });
      return '로그인 상태 확인 중... (로그인이 안 되어 있으면 안내 창이 열립니다)';
    };
  }
  let lastHref = ''; // 방송 이동 감지용
  function tick() {
    try {
      try { // 방송이 바뀌면(새로고침 없이 주소만 변경) 검색어·결과창 초기화
        const href = location.href;
        if (lastHref && href !== lastHref) {
          famQuery = guildQuery = itemQuery = '';
          removeFamSrc();
          famResQ = guildResQ = itemResQ = '';
          liveFam = liveGuild = liveItem = null; liveFamRev++; liveGuildRev++; liveItemRev++;
          selId = null; selPhase = ''; selData = null;
          try { localStorage.removeItem(LS_FAMQ); localStorage.removeItem(LS_GUILDQ); localStorage.removeItem(LS_ITEMQ); } catch (e) {}
          famSig = null; resSig = null;
          removeFamily(); removeRes(); marketData = null; marketPhase = 'idle'; try { if (typeof removeMarket === 'function') removeMarket(); } catch (e) {}
          try { for (const k in marketPreCache) delete marketPreCache[k]; } catch (e) {}
        }
        lastHref = href;
      } catch (e) {}
      if (!KW.enabled(ID)) {
        try { mainDbg('disabled'); } catch (e) {} // [BETA-ONLY-LINE] 진단용 (원인 파악 후 삭제)
        clearAll(); removeMain(); removeCoupons(); removeEvents(); removeParty(); removeFamily(); removeRes(); marketData = null; marketPhase = 'idle'; try { if (typeof removeMarket === 'function') removeMarket(); } catch (e) {} return; }
      const now = Date.now();
      if (now - bossFetchedAt >= BOSS_REFRESH_MS) loadSchedule(); // 처음 켜질 때 한 번, 이후 6시간마다
      if (bossSlotDue(now)) { // 매주 수요일 12:27 (액션 17분 뒤)
        try { localStorage.setItem(LS_BOSSLOT, String(bossSlotTime(now))); } catch (e) {}
        loadSchedule();
      }
      updateMain(now);
      updateCoupons(now);
      updateEvents(now);
      updateParty(now);
      updateFamily(now);
      updateRes(now);
      try { if (typeof updateMarket === 'function') updateMarket(); } catch (e2) {}
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
