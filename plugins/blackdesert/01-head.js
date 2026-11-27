// CHZZK Alert plugin: 검은사막 — 월드 우두머리 레이드 출현 N분 전에 주황색 알림을 띄우고, 출현 시각까지 유지한다.
// 시간표 출처: https://www.kr.playblackdesert.com/ko-kr/Wiki?wikiNo=167 (표가 이미지라 직접 옮겨 적음)
// 시간표는 bdo-alert.vercel.app/data/bosses.json 에서 받아온다(6시간마다 + 매주 수요일 12:27). 받지 못하면 아래 DEFAULT_SCHEDULE(코드에 적힌 값)을 쓴다.
// 위키 시간표 이미지가 바뀌면 GitHub Actions(check-boss-schedule)가 알려 주고, DB 시간표가 갱신되면 앱이 따라간다.
// 옵션(설정 > 확장): lead(몇 분 전), sound(알림음), bosses(알림받을 우두머리)
(function () {
  const KW = window.__KW;
  if (!KW || typeof KW.option !== 'function' || typeof KW.enabled !== 'function') return;
  if (window.__kwBdoLoaded) return;
  window.__kwBdoLoaded = true;
  try { if (KW && typeof KW.describe === 'function') KW.describe({ name: 'blackdesert', version: '1.2.0' }); } catch (e) {}
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
  // 원격 시간표(/data/bosses.json). 형식: { schedule: [ { time: '02:00', days: { '1': ['크자카', ...], ... } }, ... ] }
  // 게임 데이터(우두머리·쿠폰·이벤트)는 BDO_Alert의 Vercel(/data, Supabase 정본)에서 받는다.
  // (v4.3.2 부터 GitHub raw JSON 폴백 없음 — 실패하면 현재 값을 유지하고 다음 주기에 다시 시도)
  const DATA_BASE = 'https://bdo-alert.vercel.app/data/';
  function fetchData(name, valid) {
    // ?t= 없이 요청 — 서버(Vercel CDN)가 60초 캐시하므로 같은 시간대의 요청은 DB를 다시 조회하지 않는다 (브라우저 캐시는 no-store 로 우회)
    return fetch(DATA_BASE + name + '.json', { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error('http'); return r.json(); })
      .then((j) => { if (valid && !valid(j)) throw new Error('format'); return j; });
  }
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
    fetchData('bosses', parseSchedule)
      .then((j) => { const s = parseSchedule(j); if (s) { schedule = s; syncBossList(); } })
      .catch(() => {}); // 실패하면 현재 시간표(처음엔 코드 기본값)를 유지
  }
  // 시간표의 우두머리 이름 전체를 "알림받을 우두머리" 옵션 목록에 동기화한다.
  // 새로 생긴 우두머리는 기본 체크 상태로 추가되고, 빠진 우두머리는 목록에서 사라진다.
  function syncBossList() {
    try {
      if (!KW || typeof KW.setOptChoices !== 'function') return; // 구 코어: plugins.json 목록 그대로
      const names = [];
      for (const [, byDay] of schedule) {
        for (const k of Object.keys(byDay)) {
          for (const n of byDay[k]) if (n && names.indexOf(n) < 0) names.push(n);
        }
      }
      if (names.length) KW.setOptChoices(ID, 'bosses', names);
    } catch (e) {}
  }
  try { syncBossList(); } catch (e) {} // 시작 시: 코드 기본값 기준으로도 한 번 맞춰 둔다 (첫 갱신 전 오프라인 대비)
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
  function palarm(prio, run, gap) { // 알람 큐 (코어). 없으면(구버전 코어) 즉시 실행 폴백
    try { if (KW && typeof KW.alarm === 'function') return KW.alarm(prio, run, gap); } catch (e) {}
    try { run(); } catch (e2) {}
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

