'use strict';

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
  house: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11l8-7 8 7M6 9.5V20h12V9.5"/></svg>',
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
    if (u && okLinkUrl(u)) { try { window.open(u, '_blank', 'noopener'); } catch (e) {} }
  };
  updateWarn();
}

// ---------- 설정 별도 화면 (#__kw_setp, 감시 패널 아래) ----------
// 버전 비교: 같은 계열이면 숫자/베타번호로, 정식은 같은 번호의 베타보다 항상 새로움
function parseVer(v) {
  const m = String(v || '').match(/(\d+)\.(\d+)(?:[-_]([A-Za-z]+)(\d*))?/);
  if (!m) return null;
  return { major: +m[1], minor: +m[2], pre: m[3] || '', preN: m[4] === '' || m[4] == null ? 0 : +m[4] };
}
function isNewer(remote, local) {
  const r = parseVer(remote), l = parseVer(local);
  if (!r || !l) return false;
  if (r.major !== l.major) return r.major > l.major;
  if (r.minor !== l.minor) return r.minor > l.minor;
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
function renderSettings() {
  if (!setPanel) return;
  setPanel.innerHTML = `
    <div style="display:flex;gap:14px;height:100%">
      <div class="__kw_tabs">
        <button class="__kw_tab${setTab === 'general' ? ' on' : ''}" data-tab="general">일반설정</button>
        <button class="__kw_tab${setTab === 'words' ? ' on' : ''}" data-tab="words">단어설정</button>
        <button class="__kw_tab${setTab === 'about' ? ' on' : ''}" data-tab="about">앱 정보</button>
      </div>
      <div id="__kw_set_body" style="flex:1;min-width:0;min-height:0;overflow-y:auto">
        <div id="__kw_set_general" style="display:${setTab === 'general' ? 'block' : 'none'}">
          <div class="__kw_lbl"><label style="cursor:pointer"><input type="checkbox" id="__kw_auto" ${localStorage.getItem(LS_AUTO) === '1' ? 'checked' : ''}> 방송 들어가면 묻지 않고 자동으로 켜기</label></div>
          <div class="__kw_lbl"><label style="cursor:pointer"><input type="checkbox" id="__kw_hist" ${histOn() ? 'checked' : ''}> 불린 대화 목록 별도 표시 (클릭 이동)</label></div>
          <div class="__kw_lbl"><label style="cursor:pointer"><input type="checkbox" id="__kw_dedup" ${dedupOn() ? 'checked' : ''}> 이미 울린 대화 재알림 방지</label></div>
          <div class="__kw_lbl"><label style="cursor:pointer"><input type="checkbox" id="__kw_mute" ${muted() ? 'checked' : ''}> 알람 끄기 (감지·기록은 유지)</label></div>
          <div class="__kw_lbl">같은 호출 다시 울리기까지 (분, 0이면 항상 울림)</div>
          <input class="__kw_in" id="__kw_redup" type="number" min="0" max="120" step="1" style="width:80px" value="${redupMin()}">
        </div>
        <div id="__kw_set_words" style="display:${setTab === 'words' ? 'block' : 'none'}">
          <div class="__kw_lbl">호출 단어 (×로 삭제, 페이지 글자를 드래그해서도 추가 가능)</div>
          <div id="__kw_chips">${keywords.map((k, i) => `<span class="__kw_chip"><span>${escapeHtml(k)}</span><b data-i="${i}" title="삭제">×</b></span>`).join('')}</div>
          <div style="margin-top:6px"><input class="__kw_in" id="__kw_in" placeholder="추가할 단어" style="width:130px">
            <button class="__kw_b" id="__kw_add" style="background:#00ffa3;color:#000">추가</button></div>
          <div class="__kw_lbl">내 닉네임 (이 닉네임의 채팅은 알림 제외)</div>
          <input class="__kw_in" id="__kw_nick" style="width:130px" value="${escapeHtml(myNick)}">
        </div>
        <div id="__kw_set_about" style="display:${setTab === 'about' ? 'block' : 'none'}">
          <div class="__kw_lbl">프로그램</div>
          <div><b>CHZZK Alert</b></div>
          <div class="__kw_lbl">제작자</div>
          <div><b>비류라미</b></div>
          <div style="margin-top:6px;font-size:12px;color:#eee">검은사막 게임을 하다 미리내ES 님과 놀다 심심해서 만듬</div>
          <div class="__kw_lbl">현재 버전</div>
          <div><b>${escapeHtml(SCRIPT_VERSION)}</b> <span style="color:#888">(Beta 채널)</span><button class="__kw_ic" id="__kw_update_check" title="업데이트 확인">${IC.refresh}</button><button class="__kw_upbtn" id="__kw_update_go" disabled>업데이트</button></div>
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
  };
  setPanel.querySelector('#__kw_mute').onchange = (e) => {
    try { localStorage.setItem(LS_MUTE, e.target.checked ? '1' : '0'); } catch (err) {}
    dlog('mute', e.target.checked);
  };
  setPanel.querySelector('#__kw_redup').onchange = (e) => {
    let v = parseFloat(e.target.value);
    if (!isFinite(v) || v < 0) v = 0;
    if (v > 120) v = 120;
    try { localStorage.setItem(LS_REDUP, String(v)); } catch (err) {}
    e.target.value = v;
    dlog('redup', v);
  };
  const updateCheckBtn = setPanel.querySelector('#__kw_update_check');
  if (updateCheckBtn) updateCheckBtn.onclick = () => checkUpdate();
  const updateGoBtn = setPanel.querySelector('#__kw_update_go');
  if (updateGoBtn) updateGoBtn.onclick = () => { try { window.open(UPDATE_URL, '_blank'); } catch (e) {} };
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
  if (localStorage.getItem(LS_AUTO) === '1') { start(); return; }
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

