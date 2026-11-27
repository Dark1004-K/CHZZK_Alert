  // ---------- 이벤트 모아보기 (#__kw_evt) ----------
  // 검은사막 사이트는 다른 사이트(치지직 페이지)에서 직접 읽을 수 없어서(CORS), Vercel(/data/events.json)을 받아온다.
  // 데이터는 BDO_Alert의 Vercel 크롤러가 "진행중인 이벤트 모아보기" 페이지를 읽어 Supabase에 갱신한다.
  // 보스와 같은 스케줄: 켜질 때 한 번 받고, 이후 6시간마다 + 매주 수요일 12:27 슬롯에 다시 받는다.
  // 알람은 울리지 않고 목록만 보여준다. 항목을 누르면 상세 페이지가 팝업 창으로 열린다.
  const EVT_COLOR = '#2dd4bf';
  const LS_EVT_FOLD = '__kw_evt_fold';
  const LS_EVTPOS = '__kw_evt_pos';
  const LS_EVTSLOT = '__kw_evt_slot'; // 마지막으로 받은 수요일 슬롯 시각 (보스와 같은 슬롯 규칙)
  let evtEl = null;
  let evtData = null; // 마지막으로 받은 events.json
  let evtState = 'idle'; // idle | loading | ok | err
  let evtSig = ''; // 마지막으로 그린 내용의 서명 (바뀔 때만 다시 그림)
  let evtFitNext = false; // 펼치기 직후 한 번: 아래 기준으로 내용만큼 펼치고 화면에 맞춤 (쿠폰과 동일)
  let evtAnchorB = 0; // 펼치기 클릭 시점(접힌 상태)의 아래 모서리
  let evtFoldB = 0; // 접기 클릭 시점(펼친 상태)의 아래 모서리. 접을 때도 아래 고정
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
    const items = (fresh || []).slice();
    if (!items.length) return 0;
    try {
      palarm(0, () => {
        items.forEach((c) => {
          try {
            if (typeof KW.toast === 'function') KW.toast('📅 새 이벤트', (c.title || '이벤트'), () => {
              setShow(LS_SHOW_EVT, true); mainSig = null; // 토스트 클릭=이벤트창 열기
              try { updateEvents(Date.now()); } catch (e) {}
              try { updateMain(Date.now()); } catch (e) {}
            });
          } catch (e) {}
        });
        try { if (opt('sound', true) && typeof KW.sound === 'function') KW.sound(); } catch (e) {}
        try { if (typeof KW.emit === 'function') KW.emit('event', { events: items.map((c) => ({ title: c.title, link: c.link })) }); } catch (e) {}
      }, 1400);
    } catch (e) {}
    if (!showEvt()) { evtAlarmBlink = true; try { updateMain(Date.now()); } catch (e) {} } // 숨어있으면 메인 버튼 반짝임
    return items.length;
  }
  // 마감 임박 진입 감지·알림: 24시간 안으로 들어온 이벤트가 새로 생기면 토스트+알림음 (+확장 TTS). 첫 기록 때는 조용히 기억만.
  const LS_EVTURG = '__kw_evt_urg';
  function evtCheckUrg(now, skip) {
    try {
      if (!evtData || !Array.isArray(evtData.events)) return 0;
      now = now || Date.now();
      const off = urgOffSet(LS_URG_OFF_EVT);
      const urg = evtList().filter((c) => urgIs(urgEndMs(c.period), now) && !off.has('e:' + c.link));
      let raw = null;
      try { raw = localStorage.getItem(LS_EVTURG); } catch (e) {}
      const seen = new Set();
      if (raw) { try { JSON.parse(raw).forEach((k) => seen.add(k)); } catch (e2) {} }
      const keys = urg.map((c) => 'e:' + c.link);
      try { localStorage.setItem(LS_EVTURG, JSON.stringify(keys.slice(-200))); } catch (e3) {}
      if (raw === null) return 0; // 첫 기록: 조용히 기억만
      const fresh = urg.filter((c) => !seen.has('e:' + c.link) && !(skip && skip.has('e:' + c.link)));
      if (fresh.length) evtAlarmUrg(fresh);
      return fresh.length;
    } catch (e) { return 0; }
  }
  function evtAlarmUrg(fresh) {
    const items = (fresh || []).slice();
    if (!items.length) return 0;
    try {
      palarm(0, () => {
        items.forEach((c) => {
          try {
            if (typeof KW.toast === 'function') KW.toast('📅 이벤트 마감 임박', (c.title || '이벤트'), () => {
              setShow(LS_SHOW_EVT, true); mainSig = null; // 토스트 클릭=이벤트창 열기
              try { updateEvents(Date.now()); } catch (e) {}
              try { updateMain(Date.now()); } catch (e2) {}
            });
          } catch (e) {}
        });
        try { if (opt('sound', true) && typeof KW.sound === 'function') KW.sound(); } catch (e) {}
        try { if (typeof KW.emit === 'function') KW.emit('event', { events: items.map((c) => ({ title: c.title, link: c.link })), urgent: true }); } catch (e) {}
      }, 1400);
    } catch (e) {}
    if (!showEvt()) { evtAlarmBlink = true; try { updateMain(Date.now()); } catch (e) {} } // 숨어있으면 메인 버튼 반짝임
    return items.length;
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
    fetchData('events', (j) => !!j && Array.isArray(j.events))
      .then((j) => {
        if (!j || !Array.isArray(j.events)) throw new Error('format');
        evtData = j; evtState = 'ok';
        try { const fresh = evtCheckNew(); if (opt('eventAlarm', true)) { evtAlarmNew(fresh); evtCheckUrg(Date.now(), new Set(fresh.map((c) => 'e:' + c.link))); } } catch (e) {} // 새 이벤트 감지·알림 (끄면 조용히 기억만). 방금 새 알람한 것은 임박 중복 제외
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
    let evtKeepTop = 0;
    try { const _s = evtEl.querySelector('.__kw_sb_evt'); if (_s) evtKeepTop = _s.scrollTop; } catch (e) {} // 스크롤 유지: 다시 그려도 위치 그대로
    let h = '<div id="__kw_evt_hd" style="display:flex;align-items:center;justify-content:flex-start;gap:4px;cursor:pointer;min-height:26px;padding-right:58px">' +
      '<b style="font-size:12px;white-space:nowrap;display:inline-flex;align-items:center">' + TI(TI_CAL, EVT_COLOR) + '이벤트 모아보기&nbsp;<span style="color:' + EVT_COLOR + '">(' + list.length + ')</span></b>' +
      (fold && urgKeys.length ? urgOffBtn('evt-all', true) : '') +
      '<span style="display:inline-flex;align-items:center"><button id="__kw_evt_rf" class="' + (busy ? '__kw_ic __kw_spin' : '') + '" title="' + (evtFetchedAt ? '새로고침 (마지막 갱신 ' + pad2(new Date(evtFetchedAt).getHours()) + ':' + pad2(new Date(evtFetchedAt).getMinutes()) + ':' + pad2(new Date(evtFetchedAt).getSeconds()) + ')' : '새로고침') + '" style="border:0;background:transparent;color:' + EVT_COLOR + ';cursor:pointer;padding:5px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;position:relative;top:1.5px">' + (busy ? ICON_REFRESH : flash ? (evtFlashErr ? ICON_FAIL : ICON_DONE) : ICON_REFRESH) + '</button>' +
      '<span title="' + (fold ? '펼치기' : '접기') + '" style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:8px;color:' + EVT_COLOR + ';position:absolute;top:2px;right:26px;z-index:2"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="' + (fold ? 'M9 6l6 6-6 6' : 'M6 9l6 6 6-6') + '"/></svg></span></span></div>' + xBtn('__kw_evt_x', EVT_COLOR, 'position:absolute;top:2px;right:3px;z-index:2', SHOW_X_TITLE);
    if (!fold) {
      h += '<div style="height:1px;background:rgba(255,255,255,.14);margin:4px -10px"></div>';
      h += '<div class="__kw_sb_evt" style="flex:1;min-height:0;overflow-y:auto;margin-top:4px;scrollbar-width:thin;scrollbar-color:rgba(45,212,191,.7) rgba(45,212,191,.12)">';
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
            '<div style="display:flex;align-items:flex-start;gap:4px"><button data-evt-go="' + i + '" title="' + esc(String(c.summary || c.title || '이벤트').split(' / ').join('\n')) + '" style="border:0;background:transparent;padding:0;cursor:pointer;display:block;flex:1;min-width:0;text-align:left">' +
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
    if (evtFitNext && !evtFolded()) { // 펼치기 직후: 아래 기준 + 저장된 높이 그대로 (줄여놓은 크기 유지)
      evtFitNext = false;
      try {
        const anchorB = evtAnchorB > 0 ? evtAnchorB : evtEl.getBoundingClientRect().bottom; // 클릭 시점 아래 모서리
        evtAnchorB = 0;
        evtH = Math.max(EVT_H_MIN, Math.min(evtH, evtHMax()));
        if (evtEl.style.position === 'fixed') {
          // 띄움: 펼치기 전 아래 모서리 고정 → 위로 늘어남 (저장된 높이 유지)
          evtEl.style.height = Math.min(evtH, evtHMax()) + 'px';
          evtEl.style.top = Math.max(0, Math.round(anchorB - evtH)) + 'px';
          try { bdoPosSaveEl(LS_EVTPOS, evtEl); } catch (er2) {}
        } else {
          // 도크: 저장된 높이 그대로
          evtEl.style.height = Math.min(evtH, evtHMax()) + 'px';
        }
        try { localStorage.setItem(LS_EVTH, String(evtH)); } catch (er) {}
      } catch (e5) {}
    }
    // 높이는 패널 통째로 명시 (내용 길이에 관계없이 조절이 바로 보이게). 접힘 상태는 자동 높이.
    try {
      evtEl.style.display = 'flex';
      evtEl.style.flexDirection = 'column';
      evtEl.style.height = fold ? '' : Math.min(evtH, evtHMax()) + 'px';
    } catch (e5) {}
    if (evtFoldB > 0) { // 접기: 아래 모서리 고정 → 아래로 접힘 (띄움만, 도크는 레이아웃)
      const fb = evtFoldB; evtFoldB = 0;
      if (fold && evtEl.style.position === 'fixed') {
        try {
          evtEl.style.top = Math.max(0, Math.round(fb - evtEl.getBoundingClientRect().height)) + 'px';
          try { bdoPosSaveEl(LS_EVTPOS, evtEl); } catch (er2) {}
        } catch (e6) {}
      }
    }
    try { const _s2 = evtEl.querySelector('.__kw_sb_evt'); if (_s2) _s2.scrollTop = evtKeepTop; } catch (e) {} // 스크롤 유지: 높이 확정 후 복원
    const hd = evtEl.querySelector('#__kw_evt_hd');
    if (hd) hd.onclick = (e) => {
      if (e.target && e.target.id === '__kw_evt_rf') return;
      if (e.target && e.target.closest && e.target.closest('[data-urg-off]')) return;
      const was = evtFolded();
      try { localStorage.setItem(LS_EVT_FOLD, was ? '0' : '1'); } catch (er) {}
      if (was) {
        evtFitNext = true; // 펼칠 때 아래 기준으로 내용만큼 (화면을 넘으면 거기까지만)
        try { evtAnchorB = Math.round(evtEl.getBoundingClientRect().bottom); } catch (ex2) { evtAnchorB = 0; }
      } else {
        try { evtFoldB = Math.round(evtEl.getBoundingClientRect().bottom); } catch (ex3) { evtFoldB = 0; }
      }
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
    try { if (opt('eventAlarm', true)) evtCheckUrg(now); } catch (e) {} // 마감 임박 진입 감지 (창 숨김과 무관, 1초 틱)
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

