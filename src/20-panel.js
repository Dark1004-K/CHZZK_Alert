  // ---------- 패널 (#__kw_panel, 원본과 동일한 구조) + 목록 별도 화면 (#__kw_histp) ----------
  let panel;
  let stackEl = null, histPanel = null, histBox = null, histCount = null;
  let midRowEl = null;
  let curWidth = 350;
  try { const wv = parseInt(localStorage.getItem(LS_W), 10); if (wv >= 240 && wv <= 600) curWidth = wv; } catch (e) {}
  function setStackWidth(w) {
    curWidth = Math.max(240, Math.min(600, Math.round(w)));
    if (stackEl) stackEl.style.width = curWidth + 'px';
  }
  let setPanel = null;
  let setOpen = false;
  try { setOpen = localStorage.getItem(LS_SET) === '1'; } catch (e) {}
  let setTab = 'general';
  try { const st = localStorage.getItem(LS_TAB); if (st === 'words' || st === 'general' || st === 'about') setTab = st; } catch (e) {}
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
      attachHistHandlers();
      applyHistVisibility();
      renderHitsList();
      return;
    }
    const d = document.createElement('div');
    d.id = '__kw_histp';
    d.innerHTML = `<div id="__kw_hist_head"><span>🔔 불린 대화 <b id="__kw_hits_count">0</b></span><button class="__kw_ic" id="__kw_hits_clear" title="지우기">${IC.trash}</button></div><div id="__kw_hits"></div>`;
    stackEl.appendChild(d);
    histPanel = d;
    histBox = d.querySelector('#__kw_hits');
    histCount = d.querySelector('#__kw_hits_count');
    attachHistHandlers();
    applyHistVisibility();
    renderHitsList();
  }
  function applyHistVisibility() {
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
  };
  function renderPanel() {
    if (!panel) return;
    panel.className = 'show' + (running ? '' : ' off');

    panel.innerHTML = `
      <div id="__kw_row"><div style="flex:1"><div id="__kw_ch">${escapeHtml(pageChannelName())}</div><div id="__kw_title"><span id="__kw_dot"></span><b style="color:${running ? '#00ffa3' : '#ff4d4d'}">${running ? '감시중' : '중지됨'}</b> · 단어 ${keywords.length}개</div></div>
        <button class="__kw_ic" id="__kw_gear" title="설정" style="color:#ccc">${IC.sliders}</button>
        <button class="__kw_ic" id="__kw_btn" title="${running ? '정지' : '시작'}" style="color:${running ? '#ff6b6b' : '#00ffa3'}">${running ? IC.pause : IC.play}</button></div>
      <div id="__kw_warn" style="display:${limitedMode ? 'block' : 'none'};font-size:11px;color:#ffd400;margin-top:4px">⚠ 사용자 스크립트 허용 꺼짐: WS 감시 불가, DOM 감시만 동작. chrome://extensions → Tampermonkey 상세에서 허용 후 새로고침</div>`;

    panel.querySelector('#__kw_btn').onclick = () => (running ? stop() : start());
    panel.querySelector('#__kw_gear').onclick = () => {
      setOpen = !setOpen;
      try { localStorage.setItem(LS_SET, setOpen ? '1' : '0'); } catch (e) {}
      renderSettings();
    };
    updateWarn();
  }
