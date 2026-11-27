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
  // 검은사막 사이트는 다른 사이트(치지직 페이지)에서 직접 읽을 수 없어서(CORS), Vercel(/data/coupons.json)을 받아온다.
  // 데이터는 BDO_Alert의 Vercel 크롤러가 "쿠폰 모두 모아보기" 페이지를 읽어 Supabase에 갱신한다 (GAS가 매시간 호출).
  // 앱이 켜질 때 한 번 받고, 이후 매시 17분에 자동으로 다시 받는다.
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
  function bdoTop(el, move) { // 화면 최상위 유지 (옵션창과 동일 규격: 고정 최대 z + DOM 맨 끝)
    try {
      if (!el) return;
      el.style.zIndex = '2147483647';
      if (move && document.body && document.body.lastChild !== el) { try { document.body.appendChild(el); } catch (e) {} }
    } catch (e2) {}
  }
  function bdoTopWire(el) { // 클릭 시 최상단으로 (1회 배선)
    try {
      if (!el || el.__kwFrontWired) return;
      el.__kwFrontWired = true;
      el.addEventListener('pointerdown', () => bdoTop(el, true));
    } catch (e) {}
  }
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
    const items = (fresh || []).slice();
    if (!items.length) return 0;
    try {
      palarm(0, () => {
        items.forEach((c) => {
          try {
            if (typeof KW.toast === 'function') KW.toast('🎟 새 쿠폰', (c.name || '쿠폰') + '\n' + c.code, () => {
              setShow(LS_SHOW_CPN, true); mainSig = null; // 토스트 클릭=쿠폰창 열기
              try { updateCoupons(Date.now()); } catch (e) {}
              try { updateMain(Date.now()); } catch (e) {}
            });
          } catch (e) {}
        });
        try { if (opt('sound', true) && typeof KW.sound === 'function') KW.sound(); } catch (e) {}
        try { if (typeof KW.emit === 'function') KW.emit('coupon', { coupons: items.map((c) => ({ name: c.name, code: c.code })) }); } catch (e) {}
      }, 1400);
    } catch (e) {}
    if (!showCpn()) { cpnAlarmBlink = true; try { updateMain(Date.now()); } catch (e) {} } // 숨어있으면 메인 버튼 반짝임
    return items.length;
  }
  // 마감 임박 진입 감지·알림: 24시간 안으로 들어온 항목이 새로 생기면 토스트+알림음 (+확장 TTS). 첫 기록 때는 조용히 기억만.
  const LS_CPNURG = '__kw_cpn_urg';
  function cpnCheckUrg(now, skip) {
    try {
      if (!cpnData || !Array.isArray(cpnData.coupons)) return 0;
      now = now || Date.now();
      const off = urgOffSet(LS_URG_OFF_CPN);
      const urg = cpnVisible(now).filter((c) => { const end = c.expiresAt || urgEndMs(c.expires); return urgIs(end, now) && !off.has('c:' + c.code); });
      let raw = null;
      try { raw = localStorage.getItem(LS_CPNURG); } catch (e) {}
      const seen = new Set();
      if (raw) { try { JSON.parse(raw).forEach((k) => seen.add(k)); } catch (e2) {} }
      const keys = urg.map((c) => 'c:' + c.code);
      try { localStorage.setItem(LS_CPNURG, JSON.stringify(keys.slice(-200))); } catch (e3) {}
      if (raw === null) return 0; // 첫 기록: 조용히 기억만
      const fresh = urg.filter((c) => !seen.has('c:' + c.code) && !(skip && skip.has('c:' + c.code)));
      if (fresh.length) cpnAlarmUrg(fresh);
      return fresh.length;
    } catch (e) { return 0; }
  }
  function cpnAlarmUrg(fresh) {
    const items = (fresh || []).slice();
    if (!items.length) return 0;
    try {
      palarm(0, () => {
        items.forEach((c) => {
          try {
            if (typeof KW.toast === 'function') KW.toast('⏱ 쿠폰 마감 임박', (c.name || '쿠폰') + '\n' + c.code, () => {
              setShow(LS_SHOW_CPN, true); mainSig = null; // 토스트 클릭=쿠폰창 열기
              try { updateCoupons(Date.now()); } catch (e) {}
              try { updateMain(Date.now()); } catch (e2) {}
            });
          } catch (e) {}
        });
        try { if (opt('sound', true) && typeof KW.sound === 'function') KW.sound(); } catch (e) {}
        try { if (typeof KW.emit === 'function') KW.emit('coupon', { coupons: items.map((c) => ({ name: c.name, code: c.code })), urgent: true }); } catch (e) {}
      }, 1400);
    } catch (e) {}
    if (!showCpn()) { cpnAlarmBlink = true; try { updateMain(Date.now()); } catch (e) {} } // 숨어있으면 메인 버튼 반짝임
    return items.length;
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
    // 테스트: __kwBdoCouponUrgTest() → 12시간 뒤 만료 가짜 쿠폰 등록 (알람 없음, 창 열기 없음. 직접 쿠폰창을 열어 깜빡임 확인)
    window.__kwBdoCouponUrgTest = () => {
      const code = 'URGTEST-' + Date.now().toString(36).toUpperCase();
      if (!cpnData || !Array.isArray(cpnData.coupons)) cpnData = { updatedAt: Date.now(), coupons: [] };
      cpnData.coupons.push({ name: '테스트 임박 쿠폰', code, expires: '테스트 마감 (약 12시간 남음)', expiresAt: Date.now() + 12 * 3600 * 1000 });
      cpnState = 'ok'; cpnSig = '';
      try { const s = cpnSeenSet(); s.add(code); localStorage.setItem(LS_CPNSEEN, JSON.stringify([...s].slice(-200))); } catch (e) {}
      try { updateCoupons(Date.now()); } catch (e) {} // 열려 있으면 목록에 바로 표시
      return '쿠폰 임박 데이터 등록: ' + code;
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
    // 테스트: __kwBdoEventUrgTest() → 12시간 뒤 종료 가짜 이벤트 등록 (알람 없음, 창 열기 없음. 직접 이벤트창을 열어 깜빡임 확인)
    window.__kwBdoEventUrgTest = () => {
      const t = Date.now() + 12 * 3600 * 1000;
      const d = new Date(t + KST);
      const p2 = (n) => String(n).padStart(2, '0');
      const yo = ['일', '월', '화', '수', '목', '금', '토'][d.getUTCDay()];
      const period = '~ ' + d.getUTCFullYear() + '년 ' + (d.getUTCMonth() + 1) + '월 ' + d.getUTCDate() + '일(' + yo + ') ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes());
      const link = 'https://www.kr.playblackdesert.com/ko-KR/News/Detail?groupContentNo=13733#urgtest' + Date.now().toString(36);
      if (!evtData || !Array.isArray(evtData.events)) evtData = { updatedAt: Date.now(), events: [] };
      evtData.events.unshift({ category: 'NEW 이벤트', title: '테스트 임박 이벤트', period, summary: '마감 임박 깜빡임 시험용', link });
      evtState = 'ok'; evtSig = '';
      try { const s = evtSeenSet(); s.add(link); localStorage.setItem(LS_EVTSEEN, JSON.stringify([...s].slice(-200))); } catch (e) {}
      try { updateEvents(Date.now()); } catch (e) {} // 열려 있으면 목록에 바로 표시
      return '이벤트 임박 데이터 등록: ' + period;
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
    fetchData('coupons', (j) => !!j && Array.isArray(j.coupons))
      .then((j) => {
        if (!j || !Array.isArray(j.coupons)) throw new Error('format');
        cpnData = j; cpnState = 'ok';
        try { const fresh = cpnCheckNew(); if (opt('couponAlarm', true)) { cpnAlarmNew(fresh); cpnCheckUrg(Date.now(), new Set(fresh.map((c) => 'c:' + c.code))); } } catch (e) {} // 새 쿠폰 감지·알림 (끄면 조용히 기억만). 방금 새 알람한 것은 임박 중복 제외
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
    let cpnKeepTop = 0;
    try { const _s = cpnEl.querySelector('.__kw_sb_cpn'); if (_s) cpnKeepTop = _s.scrollTop; } catch (e) {} // 스크롤 유지: 다시 그려도 위치 그대로
    let h = '<div id="__kw_cpn_hd" style="display:flex;align-items:center;justify-content:flex-start;gap:4px;cursor:pointer;min-height:26px;padding-right:58px">' +
      '<b style="font-size:12px;white-space:nowrap;display:inline-flex;align-items:center">' + TI(TI_TICKET, '#b784ff') + '쿠폰 모아보기&nbsp;<span style="color:#b784ff">(' + list.length + ')</span></b>' +
      (fold && urgKeys.length ? urgOffBtn('cpn-all', true) : '') +
      '<span style="display:inline-flex;align-items:center"><button id="__kw_cpn_rf" class="' + (busy ? '__kw_ic __kw_spin' : '') + '" title="' + (cpnFetchedAt ? '새로고침 (마지막 갱신 ' + pad2(new Date(cpnFetchedAt).getHours()) + ':' + pad2(new Date(cpnFetchedAt).getMinutes()) + ':' + pad2(new Date(cpnFetchedAt).getSeconds()) + ')' : '새로고침') + '" style="border:0;background:transparent;color:#b784ff;cursor:pointer;padding:5px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;position:relative;top:1.5px">' + (busy ? ICON_REFRESH : flash ? (cpnFlashErr ? ICON_FAIL : ICON_DONE) : ICON_REFRESH) + '</button>' +
      '<span title="' + (fold ? '펼치기' : '접기') + '" style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:8px;color:#b784ff;position:absolute;top:2px;right:26px;z-index:2"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="' + (fold ? 'M9 6l6 6-6 6' : 'M6 9l6 6 6-6') + '"/></svg></span></span></div>' + xBtn('__kw_cpn_x', '#b784ff', 'position:absolute;top:2px;right:3px;z-index:2', SHOW_X_TITLE);
    if (!fold) {
      h += '<div style="height:1px;background:rgba(255,255,255,.14);margin:4px -10px"></div>';
      h += '<div class="__kw_sb_cpn" style="flex:1;min-height:0;overflow-y:auto;margin-top:4px;scrollbar-width:thin;scrollbar-color:rgba(183,132,255,.7) rgba(183,132,255,.12)">';
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
    if (cpnFitNext && !cpnFolded()) { // 펼치기 직후: 아래 기준 + 저장된 높이 그대로 (줄여놓은 크기 유지)
      cpnFitNext = false;
      try {
        const anchorB = cpnAnchorB > 0 ? cpnAnchorB : cpnEl.getBoundingClientRect().bottom; // 클릭 시점 아래 모서리
        cpnAnchorB = 0;
        cpnH = Math.max(CPN_H_MIN, Math.min(cpnH, cpnHMax()));
        if (cpnEl.style.position === 'fixed') {
          // 띄움: 펼치기 전 아래 모서리 고정 → 위로 늘어남 (저장된 높이 유지)
          cpnEl.style.height = Math.min(cpnH, cpnHMax()) + 'px';
          cpnEl.style.top = Math.max(0, Math.round(anchorB - cpnH)) + 'px';
          try { bdoPosSaveEl(LS_CPNNPOS, cpnEl); } catch (er2) {}
        } else {
          // 도크: 저장된 높이 그대로
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
    try { const _s2 = cpnEl.querySelector('.__kw_sb_cpn'); if (_s2) _s2.scrollTop = cpnKeepTop; } catch (e) {} // 스크롤 유지: 높이 확정 후 복원
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
    try { if (opt('couponAlarm', true)) cpnCheckUrg(now); } catch (e) {} // 마감 임박 진입 감지 (창 숨김과 무관, 1초 틱)
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

