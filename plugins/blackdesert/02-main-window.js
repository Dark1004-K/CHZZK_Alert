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
  // ---------- 검은사막 메인창 (#__kw_bdo_main) ----------
  // 감시중(녹색창)과 같은 성격의 도크 창 (이동 불가, 가로=스택 너비 공유). 색은 우두머리 파랑.
  // 타이틀(로고형 아이콘 + "검은사막") 아래에 다음 우두머리 카운터를 항상 표시 (구 "다음 우두머리" 창 대체).
  // 타이틀 옆 버튼: 이벤트·쿠폰·검색 창 띄우기/숨기기, 설정(검은사막 확장 옵션 열기).
  const BDO_BLUE = '#3b9eff';
  const TI_BDO = '<path d="M9.4 5.6L2.8 12l9.2 9.2L21.2 12 12 2.8"/><path d="M11.3 8.3l4.1 4.1-3.3 3.3-3.3-3.3 2.5-2.5"/>';
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
  function optWinOpen() { try { if (KW && typeof KW.optWinOpen === 'function') return !!KW.optWinOpen(ID); } catch (e) {} return false; } // 검은사막 옵션 창 열림 (파란 메인 옵션 버튼 토글·색용)
  const SHOW_X_TITLE = '닫기 (검은사막 창의 버튼으로 다시 표시)';
  let mainEl = null, mainSig = null;
  let cpnAlarmBlink = false, evtAlarmBlink = false; // 새 쿠폰·이벤트 알람 후 상세창이 숨어있으면 메인 버튼 반짝임 (창이 보이면 해제)
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
      const bosses = Array.isArray(sel) ? o.bosses.filter((b) => sel.includes(b)) : o.bosses; // 가모스 숨기기는 확장 옵션 체크 해제로 (하드코딩 제외 없음)
      if (bosses.length) {
        const when = new Date(o.t + KST);
        const days = Math.floor((o.t + KST) / DAY) - Math.floor((now + KST) / DAY);
        const dayTxt = days <= 1 ? '' : ['일', '월', '화', '수', '목', '금', '토'][when.getUTCDay()] + ' ';
        return { t: o.t, label: dayTxt + o.hhmm, bosses };
      }
    }
    return null;
  }
  function mainBtn(act, title, svg, color, on, blink) {
    return '<button class="__kw_ic' + (blink ? ' __kw_urg' : '') + '" data-bdo-act="' + act + '" title="' + title + '" style="color:' + (on ? color : '#ccc') + ';padding:4px">' + svg + '</button>';
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
      mainBtn('pty', '파티 모집', BDO_BTN(TI_USERS), '#ff7a59', window.__KW_UI.partyShown, window.__KW_UI.partyAlarmBlink) +
      mainBtn('opt', '검은사막 옵션', BDO_BTN(TI_SLIDERS), BDO_BLUE, optWinOpen(), false) +
      '</span></div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-top:1px;padding-left:19px">' +
      (nc
        ? '<div style="flex:1;min-width:0;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><b>' + nc.bosses.map((n) => esc(n)).join(' · ') + '</b> <span style="color:#888">(' + esc(nc.label) + ')</span></div>' +
          '<span id="__kw_bdo_main_left" style="flex:none;font-size:12px;font-weight:bold;color:' + BDO_BLUE + ';white-space:nowrap;padding-right:4px">' + fmtLong(nc.t - Date.now()) + '</span>'
        : '<div style="flex:1;font-size:12px;color:#888">다음 우두머리 없음 (확장 옵션에서 선택)</div>') +
      '</div>';
  }
  function updateMain(now) {
    const stack = document.getElementById('__kw_stack');
    const panel = document.getElementById('__kw_panel');
    if (!stack || !panel || !panel.classList.contains('show')) { removeMain(); return; }
    if (!mainEl || !mainEl.isConnected) {
      mainEl = document.createElement('div');
      mainEl.id = '__kw_bdo_main';
      mainEl.style.cssText = 'width:100%;box-sizing:border-box;background:rgb(20,20,24);color:#fff;font:13px sans-serif;padding:8px 10px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.5);border:1px solid ' + BDO_BLUE + ';position:relative';
      mainEl.onclick = (e) => { // 버튼 4개 (1초마다 다시 그리므로 위임으로 한 번만 달아 둔다)
        const b = e.target && e.target.closest ? e.target.closest('[data-bdo-act]') : null;
        if (!b) return;
        const act = b.getAttribute('data-bdo-act');
        if (act === 'opt') { try { if (KW && typeof KW.toggleOpts === 'function') KW.toggleOpts(ID); else if (KW && typeof KW.openOpts === 'function') KW.openOpts(ID); } catch (er) {} }
        if (act === 'evt') { setShow(LS_SHOW_EVT, !showEvt()); try { updateEvents(Date.now()); } catch (er) {} }
        else if (act === 'cpn') { setShow(LS_SHOW_CPN, !showCpn()); try { updateCoupons(Date.now()); } catch (er) {} }
        else if (act === 'fam') { setShow(LS_SHOW_FAM, !showFam()); try { updateFamily(Date.now()); } catch (er) {} }
        else if (act === 'pty') {
          window.__KW_UI.partyAlarmBlink = false;
          setPartyShown(!window.__KW_UI.partyShown);
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
    const sig = [showEvt() ? 1 : 0, showCpn() ? 1 : 0, showFam() ? 1 : 0, optWinOpen() ? 1 : 0, evtAlarmBlink ? 1 : 0, cpnAlarmBlink ? 1 : 0, window.__KW_UI.partyShown ? 1 : 0, window.__KW_UI.partyAlarmBlink ? 1 : 0, nc ? nc.t + '|' + nc.bosses.join(',') : '-'].join('|');
    if (sig !== mainSig) {
      mainSig = sig;
      try { renderMain(nc); }
      catch (e) {
        try { if (mainEl && !mainEl.innerHTML) mainEl.innerHTML = '<div style="font-size:12px;color:#ff7b7b">검은사막 표시 오류 (새로고침 후에도 같으면 알려주세요)</div>'; } catch (e3) {}
      }
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
