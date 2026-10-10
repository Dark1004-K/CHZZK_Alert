'use strict';

// ---------- 패널 (#__kw_panel, 원본과 동일한 구조) + 목록 별도 화면 (#__kw_histp) ----------
let panel;
let stackEl = null, histPanel = null, histBox = null, histCount = null;
let midRowEl = null;
let curWidth = 225; // 처음 시작은 최소 너비
try { const wv = parseInt(localStorage.getItem(LS_W), 10); if (wv >= 225 && wv <= 600) curWidth = wv; } catch (e) {}
function setStackWidth(w) {
  curWidth = Math.max(225, Math.min(600, Math.round(w)));
  if (stackEl) stackEl.style.width = curWidth + 'px';
}
// 불린 대화 목록 높이: 위쪽 손잡이를 위로 끌면 커진다 (스택이 아래 고정이라). 한계 80px ~ 화면 높이의 85%
const LS_HH = '__kw_hits_h';
const LS_HISTPOS = '__kw_hist_pos'; // 불린대화 띄우기 위치 {x,y,w} (없으면 스택 자리)
const LS_DROPSPOS = '__kw_drops_pos'; // 드롭스 띄우기 위치 {x,y,w} (없으면 스택 자리)
const HH_MIN = 80, HH_DEF = 150;
const hhMax = () => Math.max(HH_MIN, Math.floor(window.innerHeight * 0.85));
let histH = HH_DEF;
try { const hv = parseInt(localStorage.getItem(LS_HH), 10); if (hv >= HH_MIN && hv <= 4000) histH = hv; } catch (e) {}
let histCustom = false; // 사용자가 한 번이라도 끌어서 정한 높이면 항목 수와 상관없이 그 높이를 유지한다
try { histCustom = !!localStorage.getItem(LS_HH); } catch (e) {}
const HH_GAIN = 1; // 끄는 거리 대비 높이 변화 배율. 1이면 창 위쪽 막대가 마우스를 그대로 따라온다
function applyHistHeight() {
  if (!histBox) return;
  const h = Math.min(histH, hhMax());
  histBox.style.maxHeight = h + 'px';
  histBox.style.height = histCustom ? h + 'px' : '';
}
let setPanel = null;
let setOpen = false;
try { setOpen = localStorage.getItem(LS_SET) === '1'; } catch (e) {}
let setTab = 'general';
try { const st = localStorage.getItem(LS_TAB); if (st === 'words' || st === 'sound' || st === 'general' || st === 'ext' || st === 'about') setTab = st; } catch (e) {}
// 창 투명도: 0~90%만 허용 (100%면 창이 안 보여서 되돌릴 수 없음). 앱 창 전체(#__kw_stack)에 적용.
const LS_OPACITY = '__kw_transparency';
function getTransparency() {
  try { const v = parseInt(localStorage.getItem(LS_OPACITY), 10); if (isFinite(v)) return Math.max(0, Math.min(90, v)); } catch (e) {}
  return 0;
}
function applyOpacity() {
  try { if (stackEl) stackEl.style.opacity = String((100 - getTransparency()) / 100); } catch (e) {}
  try { const ow = document.getElementById('__kw_optwin'); if (ow) ow.style.opacity = String((100 - getTransparency()) / 100); } catch (e) {}
}
function ensureStack() {
  if (stackEl && stackEl.isConnected) return stackEl;
  let ex = null;
  try { ex = document.getElementById('__kw_stack'); } catch (e) {}
  if (ex) { stackEl = ex; setStackWidth(curWidth); applyOpacity(); return ex; }
  const s = document.createElement('div');
  s.id = '__kw_stack';
  document.body.appendChild(s);
  stackEl = s;
  setStackWidth(curWidth);
  applyOpacity();
  return s;
}
function ensureMidrow() {
  ensureStack();
  if (midRowEl && midRowEl.isConnected) return midRowEl;
  let ex = null;
  try { ex = document.getElementById('__kw_midrow'); } catch (e) {}
  if (ex) { midRowEl = ex; return ex; }
  const r = document.createElement('div');
  r.id = '__kw_midrow';
  stackEl.appendChild(r);
  midRowEl = r;
  return r;
}

// ---------- 통일 핸들 (우하 리사이즈 .__kw_rsz + 좌상 이동 .__kw_mv) ----------
// dir 'h'=가로만(스택너비 공유) 'v'=세로만 'd'=대각(가로+세로).
// 떠있는 창(setp/optwin)은 wMode:'self'로 자기 너비를 쓴다 (범위만 225~600으로 감시중 창을 따름).
const RSZ_GLYPH = { h: '↔', v: '↕', d: '⤡' };
function kwStackW(v) {
  if (v === undefined) return curWidth;
  setStackWidth(v);
  try { localStorage.setItem(LS_W, String(curWidth)); } catch (e) {}
  return curWidth;
}
function kwRsz(el, o) {
  if (!el) return;
  try { el.querySelectorAll(':scope > .__kw_rsz').forEach((n) => n.remove()); } catch (e) {}
  o = o || {};
  const dir = o.dir === 'h' ? 'h' : o.dir === 'v' ? 'v' : 'd';
  const h = document.createElement('div');
  h.className = '__kw_rsz ' + dir;
  h.textContent = RSZ_GLYPH[dir];
  h.title = dir === 'h' ? '드래그로 가로 조절' : dir === 'v' ? '드래그로 세로 조절' : '드래그로 크기 조절';
  if (o.color) h.style.color = o.color;
  el.appendChild(h);
  h.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
    const startX = e.clientX, startY = e.clientY;
    const startW = o.wMode === 'self' && o.getW ? o.getW() : curWidth;
    const startH = o.getH ? o.getH() : 0;
    let originL = 0, originT = 0;
    try { const r0 = el.getBoundingClientRect(); originL = Math.round(r0.left); originT = Math.round(r0.top); } catch (e0) {}
    // 자석 후보는 시작 때 한 번만 고정: 늘리면서 창들이 움직여도 후보가 흔들리지 않음
    const listW = (dir === 'h' || dir === 'd') ? snapLenList('w', originL, el, startW) : null;
    const listH = ((dir === 'v' || dir === 'd') && o.setH) ? snapLenList('h', originT, el, startH) : null;
    const move = (ev) => {
      let hit = false;
      const guides = [];
      if (dir === 'h' || dir === 'd') {
        const w = startW + (ev.clientX - startX);
        const sn = snapLenNear(w, listW);
        hit = hit || sn.hit;
        if (sn.hit) guides.push({ axis: 'v', pos: originL + sn.v }); // 늘어나는 오른쪽 모서리선
        if (o.wMode === 'self' && o.setW) o.setW(sn.v);
        else kwStackW(sn.v);
      }
      if ((dir === 'v' || dir === 'd') && o.setH) {
        const hgt = Math.round(startH + (ev.clientY - startY));
        const sn = snapLenNear(hgt, listH);
        hit = hit || sn.hit;
        if (sn.hit) guides.push({ axis: 'h', pos: originT + sn.v }); // 늘어나는 아래 모서리선
        o.setH(sn.v);
      }
      el.style.boxShadow = hit ? '0 0 0 2px rgba(0,255,163,.7)' : '';
      snapGuideShow(guides);
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      el.style.boxShadow = '';
      snapGuideHide();
      try { if (o.save) o.save(); } catch (err) {}
      if (o.log) dlog(o.log, dir === 'v' || dir === 'd' ? (o.getH ? o.getH() : '') : curWidth);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
}
// ---------- 늘리기 자석: 늘리는 모서리를 다른 창 모서리·화면 끝·같은 크기에 맞춤 (8px) ----------
// 후보 목록은 드래그 시작 때 snapLenList로 한 번만 만든다. snapLenNear는 그 목록에서 가장 가까움을 고른다.
// axis 'w'=오른쪽 모서리(origin=왼쪽), 'h'=아래 모서리(origin=위쪽).
const RSZ_SNAP = 8;
function snapLenList(axis, origin, skipEl, startV) {
  const list = [];
  const push = (c) => { if (isFinite(c) && Math.abs(c - startV) > 1) list.push(c); }; // 제자리 후보 제외 → 시작점 달라붙음 방지
  try {
    if (axis === 'w') {
      // 화면 끝 자석 제외: 우리 창끼리만
      snapRects(skipEl).forEach((rc) => {
        push(rc.l - origin); push(rc.r - origin); // 다른 창 모서리(동그라미 끝)에 맞춤
        push(rc.l - SNAP_GAP - origin); push(rc.r + SNAP_GAP - origin); // 간격 두고 맞춤
        push(rc.w); // 다른 창과 같은 너비
      });
    } else {
      // 화면 끝 자석 제외: 우리 창끼리만
      snapRects(skipEl).forEach((rc) => {
        push(rc.t - origin); push(rc.b - origin);
        push(rc.t - SNAP_GAP - origin); push(rc.b + SNAP_GAP - origin);
        push(rc.h); // 다른 창과 같은 높이
      });
    }
  } catch (e) {}
  return list;
}
function snapLenNear(v, list) {
  let bv = v, bd = RSZ_SNAP + 1;
  (list || []).forEach((c) => { const d = Math.abs(c - v); if (d < bd) { bd = d; bv = c; } });
  return { v: Math.round(bv), hit: bd <= RSZ_SNAP };
}
// ---------- 낱개 띄우기 (스택창을 + 배지로 끌어내 fixed로, 위치 저장+자석) ----------
// load()->{x,y,w}|null, save(p), clear(), dock() (원래 자리 복구), apply(p) (위치 적용)
function loadFloatPos(key) {
  try {
    const o = JSON.parse(localStorage.getItem(key));
    if (o && isFinite(o.x) && isFinite(o.y)) {
      return {
        x: Math.round(o.x), y: Math.round(o.y),
        w: isFinite(o.w) ? Math.max(225, Math.min(600, Math.round(o.w))) : curWidth,
      };
    }
  } catch (e) {}
  return null;
}
function applyFloatPos(el, p) {
  if (!el || !p) return;
  const w = p.w || Math.round(el.getBoundingClientRect().width) || curWidth;
  el.style.position = 'fixed';
  el.style.left = Math.max(0, Math.min(window.innerWidth - w, p.x)) + 'px';
  el.style.top = Math.max(0, Math.min(window.innerHeight - (el.offsetHeight || 100), p.y)) + 'px';
  el.style.bottom = 'auto';
  el.style.width = w + 'px';
}
function clearFloatPos(el) {
  if (!el) return;
  el.style.position = ''; el.style.left = ''; el.style.top = ''; el.style.bottom = ''; el.style.width = ''; el.style.boxShadow = '';
}
// ---------- 낱개 띄우기 (통일 규격: 감시중=녹색창 제외 모든 창) ----------
// 신규 창도 `KW.float(el, { color, key, dock })` 한 줄이면 같은 +버튼·자석·저장 규격을 따른다.
// +버튼: 좌상 라운드 .__kw_mv (색테두리만 창 색). 드래그=fixed 띄우기, 더블클릭=원래 자리.
// 자석: snapRect()가 화면 끝·다른 창에 14px 안이면 맞춤. 위치는 localStorage {x,y,w}.
// innerHTML을 매번 다시 그리는 창(드롭스/보스/쿠폰)은 버튼이 지워지므로 매 렌더 후 KW.float을
// 다시 호출해도 되게 멱등(idempotent)하게 만들었다: 이미 떠 있으면 저장 위치로 리셋하지 않음.
function kwFloat(el, o) {
  if (!el || !o) return;
  const firstWire = !el.__kwFloatWired;
  // innerHTML 재렌더로 버튼이 날아갔으면 다시 달고, 이미 달려 있으면 핸들러만 최신으로 갱신.
  // (설정 #__kw_set_move·옵션 #__kw_optwin_mv는 innerHTML에 딸려 오므로 첫 호출에서 바로 걸어야 함)
  try {
    let b = null;
    try { b = el.querySelector(':scope > .__kw_mv'); } catch (e0) {}
    if (!b) {
      b = document.createElement('div');
      b.className = '__kw_mv';
      b.textContent = '+';
      b.title = '드래그로 창 띄우기 · 더블클릭: 원래 자리로';
      el.appendChild(b);
    }
    if (o.color) { b.style.borderColor = o.color; b.style.color = o.color; }
    b.onpointerdown = (e) => dragFloatBtn(e, el, o);
    b.ondblclick = () => { try { o.clear(); } catch (e2) {} try { o.dock(); } catch (e3) {} };
  } catch (e) {}
  try { el.setAttribute('data-kw-float', '1'); } catch (e2) {}
  el.__kwFloatWired = true;
  el.__kwFloatSave = o.save || null;
  el.__kwFloatClear = o.clear || null;
  el.__kwFloatDock = o.dock || null;
  // 첫 연결 때만 저장 위치 복구. 이미 fixed(떠 있음)면 렌더 중에도 건드리지 않는다.
  if (firstWire && el.style.position !== 'fixed') {
    try {
      const p = o.load ? o.load() : null;
      if (p && isFinite(p.x) && isFinite(p.y) && o.apply) o.apply(p);
    } catch (e4) {}
  }
}
function dragFloatBtn(e, el, o) {
  if (!el || (e.button !== undefined && e.button !== 0)) return;
  e.preventDefault();
  if (e.stopPropagation) e.stopPropagation();
  const r = el.getBoundingClientRect();
  const w = Math.round(r.width), h = Math.round(r.height);
  const ox = e.clientX - r.left, oy = e.clientY - r.top;
  el.style.position = 'fixed'; // 제자리에서 그대로 들어올린다
  el.style.left = r.left + 'px'; el.style.top = r.top + 'px'; el.style.bottom = 'auto';
  el.style.width = w + 'px';
  el.__kwDragging = true;
  const prevCur = document.documentElement.style.cursor;
  document.documentElement.style.cursor = 'grabbing';
  let cur = { x: r.left, y: r.top, w };
  const move = (ev) => {
    const sn = snapRect(ev.clientX - ox, ev.clientY - oy, w, h, el);
    const x = Math.max(0, Math.min(window.innerWidth - w, sn.x));
    const y = Math.max(0, Math.min(window.innerHeight - h, sn.y));
    cur = { x, y, w };
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.style.boxShadow = sn.hit ? '0 0 0 2px rgba(0,255,163,.7)' : '';
    const guides = [];
    if (sn.hx !== null && sn.hx !== undefined) guides.push({ axis: 'v', pos: sn.hx });
    if (sn.hy !== null && sn.hy !== undefined) guides.push({ axis: 'h', pos: sn.hy });
    snapGuideShow(guides);
    try { if (o.onMove) o.onMove(cur); } catch (err) {}
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    document.documentElement.style.cursor = prevCur;
    el.style.boxShadow = '';
    snapGuideHide();
    el.__kwDragging = false;
    try { if (o.save) o.save({ x: Math.round(cur.x), y: Math.round(cur.y), w }); } catch (err) {}
    try { if (o.apply) o.apply({ x: Math.round(cur.x), y: Math.round(cur.y), w }); } catch (err2) {}
    try { if (o.onDrop) o.onDrop(cur); } catch (err3) {}
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}
// 키 문자열만 넘기면 저장/복구를 알아서 (플러그인용). dock 추가 동작만 따로 받는다.
function kwFloatKey(el, o) {
  if (!el || !o || !o.key) return;
  kwFloat(el, {
    color: o.color,
    load: () => loadFloatPos(o.key),
    save: (p) => { try { localStorage.setItem(o.key, JSON.stringify(p)); } catch (e) {} },
    clear: () => { try { localStorage.removeItem(o.key); } catch (e) {} },
    dock: () => { clearFloatPos(el); try { if (o.dock) o.dock(); } catch (e2) {} try { if (o.afterDock) o.afterDock(); } catch (e3) {} },
    apply: (p) => applyFloatPos(el, p),
    onMove: o.onMove,
    onDrop: o.onDrop,
  });
}
// ---------- 창 기본형 kwWindow (abstract): 모든 창은 여기서 파생 ----------
// 감시중(녹색창)은 posKey 없이 rsz만 (이동 불가). 나머지 창은 posKey 필수.
// cfg: { color(창색, +원·리사이즈원 테두리), posKey(위치 저장키, 없으면 이동 불가),
//   rsz: null|'h'(가로)|'v'(세로)|'d'(가로+세로),
//   getH/setH (v/d용 세로값), saveH (세로 저장),
//   getW/setW (floating 자기너비 직접 지정 시, 생략하면 기본 225~600),
//   dock (더블클릭 복귀 추가동작), onMove/onDrop (드래그 중/후 추가동작) }
// 가로축: dock 상태면 스택너비 공유(감시중 창을 따름), float 상태면 자기너비.
// innerHTML 재렌더 대응 멱등: 매 렌더 후 다시 호출해도 위치를 리셋하지 않음.
function kwWindow(el, cfg) {
  if (!el || !cfg) return;
  const color = cfg.color, posKey = cfg.posKey || null;
  const wireRsz = () => {
    if (!cfg.rsz) return;
    const dir = cfg.rsz === 'v' ? 'v' : cfg.rsz === 'd' ? 'd' : 'h';
    const floating = posKey ? !!loadFloatPos(posKey) : !!cfg.selfW;
    const o = { dir, color, log: cfg.log };
    if (dir === 'h' || dir === 'd') {
      if (floating) {
        o.wMode = 'self';
        o.getW = cfg.getW || (() => { try { return el.getBoundingClientRect().width; } catch (e) { return curWidth; } });
        o.setW = cfg.setW || ((v) => { el.style.width = Math.max(225, Math.min(600, Math.round(v))) + 'px'; });
      }
    }
    if (dir === 'v' || dir === 'd') { o.getH = cfg.getH; o.setH = cfg.setH; }
    o.save = () => {
      try { if (cfg.saveH) cfg.saveH(); } catch (e) {}
      if (floating && posKey) saveFloatRect(posKey, el);
      else { try { if (cfg.saveW) cfg.saveW(); } catch (e2) {} }
    };
    kwRsz(el, o);
  };
  if (posKey) {
    kwFloatKey(el, {
      color, key: posKey, dock: cfg.dock, onMove: cfg.onMove,
      onDrop: () => { try { if (cfg.onDrop) cfg.onDrop(); } catch (e) {} wireRsz(); },
      afterDock: () => wireRsz(),
    });
  } else {
    try { el.setAttribute('data-kw-float', '1'); } catch (e) {} // 자석 대상으로 등록 (이동은 불가)
  }
  wireRsz();
}
// ---------- 창 기본형 XY형 (설정·확장옵션용): 위치 {x,y} + 크기 {w,h} 분리 저장 ----------
// posKey형(kwWindow)과 달리 구형 키(LS_SETPOS/LS_OPTPOS + LS_SETSIZE/LS_OPTSIZE)를 그대로 쓴다.
// cfg: { color, loadPos/savePos/clearPos/applyPos, getW/setW/getH/setH/saveSize/applySize,
//   onMove/onDrop/onDock, log }
function kwWindowXY(el, cfg) {
  if (!el || !cfg) return;
  try { el.setAttribute('data-kw-float', '1'); } catch (e) {} // 자석 대상으로 등록
  kwFloat(el, {
    color: cfg.color,
    load: cfg.loadPos, save: cfg.savePos, clear: cfg.clearPos,
    apply: () => { try { if (cfg.applyPos) cfg.applyPos(); } catch (e2) {} },
    dock: () => { try { if (cfg.onDock) cfg.onDock(); } catch (e3) {} },
    onMove: cfg.onMove, onDrop: cfg.onDrop,
  });
  try { if (cfg.applySize) cfg.applySize(); } catch (e4) {}
  kwRsz(el, {
    dir: 'd', color: cfg.color, wMode: 'self', log: cfg.log,
    getW: cfg.getW, setW: cfg.setW, getH: cfg.getH, setH: cfg.setH, save: cfg.saveSize,
  });
}
// 띄운 창의 가로 리사이즈 저장용: 현재 rect를 위치키에 통째 저장
function saveFloatRect(key, el) {
  try {
    const r = el.getBoundingClientRect();
    localStorage.setItem(key, JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width) }));
  } catch (e) {}
}
function attachHistHandlers() {
  if (!histPanel || histPanel.__kwWired) return;
  histPanel.__kwWired = true;
  kwWindow(histPanel, { // 불린대화: 가로+세로 (가로 dock=스택공유, float=자기너비 / 세로=목록 높이)
    color: '#ffd400', posKey: LS_HISTPOS, rsz: 'd',
    getH: () => histH,
    setH: (v) => {
      histCustom = true;
      histH = Math.max(HH_MIN, Math.min(hhMax(), v));
      applyHistHeight();
      const real = histBox ? histBox.getBoundingClientRect().height : histH;
      if (real > 0 && real + 1 < histH) histH = Math.max(HH_MIN, Math.round(real));
    },
    saveH: () => { try { localStorage.setItem(LS_HH, String(histH)); } catch (err) {} },
  });
  const c = histPanel.querySelector('#__kw_hits_clear');
  if (c) c.onclick = () => {
    hitLog = []; saveHits(); renderHitsList(); dlog('hits-cleared');
  };
  const x = histPanel.querySelector('#__kw_hits_close');
  if (x) x.onclick = () => { // X = 설정의 "불린 대화 목록 별도 표시" 체크를 끈 것과 같음
    try { localStorage.setItem(LS_HIST, '0'); } catch (e) {}
    applyHistVisibility();
    renderHitsList();
    refreshSettingsIfOpen();
    dlog('hist-closed');
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
  d.innerHTML = `<div id="__kw_hist_head"><span style="display:inline-flex;align-items:center;gap:4px"><span style="display:inline-flex;align-items:center">${TI(TI_BELL, '#ffd400')}불린 대화&nbsp;<b id="__kw_hits_count">0</b></span><button class="__kw_ic" id="__kw_hits_clear" title="지우기" style="color:#ffd400">${IC.trash}</button></span><button class="__kw_ic __kw_xabs" id="__kw_hits_close" title="닫기 (설정 > 일반설정에서 다시 켤 수 있음)" style="color:#ffd400">${IC.close}</button></div><div id="__kw_hits"></div>`;
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
  histPanel.style.display = show ? 'flex' : 'none'; // 세로 flex: 화면이 모자라면 목록이 먼저 줄어든다
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
// 창 제목 아이콘: 이모지 대신 창 색으로 칠한 SVG (불린 대화=노랑 종, 드롭스=주황 선물)
const TI = (path, color) => '<span style="display:inline-flex;align-items:center;flex:none;color:' + color + ';margin-right:5px"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg></span>';
const TI_BELL = '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 21h4"/>';
const TI_GIFT = '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>';
const IC = {
  sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 21h4"/></svg>',
  bellOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 21h4M4 4l16 16"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6.5 7l.9 12.1a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9L17.5 7M10 11v6M14 11v6"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 3v5h-5"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  move: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
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

// 알람 끄기: 녹색 창 아이콘과 설정의 체크를 같이 맞춘다
function setMuted(v) {
  try { localStorage.setItem(LS_MUTE, v ? '1' : '0'); } catch (err) {}
  dlog('mute', v);
  const b = panel && panel.querySelector('#__kw_mutebtn');
  if (b) { b.innerHTML = v ? IC.bellOff : IC.bell; b.style.color = v ? '#ff9f1a' : '#00ffa3'; b.title = v ? '알람 꺼짐 (누르면 켜기)' : '알람 켜짐 (누르면 끄기)'; }
  const c = setPanel && setPanel.querySelector('#__kw_mute');
  if (c) c.checked = v;
}
function renderPanel() {
  if (!panel) return;
  panel.className = 'show' + (running ? '' : ' off');

  panel.innerHTML = `
    <div id="__kw_row"><div style="flex:1;min-width:0"><div id="__kw_ch"><span style="display:inline-flex;align-items:center;gap:5px;min-width:0"><span class="__kw_ti" style="color:#00ffa3">${IC.house}</span><b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(chDisplayName())}</b></span><span id="__kw_links">${chLinksHtml()}<button class="__kw_ic" id="__kw_gear" title="설정" style="color:#00ffa3">${IC.sliders}</button></span></div><div id="__kw_titlerow"><div id="__kw_title" style="flex:1;min-width:0"><span id="__kw_dot"></span><b style="color:${running ? '#00ffa3' : '#ff4d4d'}">${running ? '감시중' : '중지됨'}</b> · 단어 ${keywords.length}개</div><span style="display:inline-flex;gap:0;flex:none"><button class="__kw_ic" id="__kw_mutebtn" title="${muted() ? '알람 꺼짐 (누르면 켜기)' : '알람 켜짐 (누르면 끄기)'}" style="color:${muted() ? '#ff9f1a' : '#00ffa3'}">${muted() ? IC.bellOff : IC.bell}</button><button class="__kw_ic" id="__kw_btn" title="${running ? '정지' : '시작'}" style="color:#00ffa3">${running ? IC.pause : IC.play}</button></span></div></div></div>
    <div id="__kw_expwarn" style="display:${allowExpiry ? 'block' : 'none'};font-size:11px;color:#ff9f1a;margin-top:4px">⚠ 만료 경고 · ${allowExpiry ? escapeHtml(allowExpiry.date) : ''} 만료, ${allowExpiry ? allowExpiry.stopDays : ''}일 뒤 동작 중지</div>
    <div id="__kw_warn" style="display:${limitedMode ? 'block' : 'none'};font-size:11px;color:#ffd400;margin-top:4px">⚠ 사용자 스크립트 허용 꺼짐: WS 감시 불가, DOM 감시만 동작. chrome://extensions → Tampermonkey 상세에서 허용 후 새로고침</div>`;

  panel.querySelector('#__kw_btn').onclick = () => (running ? stop() : start());
  panel.querySelector('#__kw_mutebtn').onclick = () => setMuted(!muted());
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
  kwWindow(panel, { color: '#00ffa3', rsz: 'h' }); // 감시중: 가로만 (이동 불가, 스택너비 공유)
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
  const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()); };
  if (btn) { btn.disabled = true; btn.classList.add('__kw_spin'); }
  say('확인 중...');
  const done = () => { if (btn) { btn.disabled = false; btn.classList.remove('__kw_spin'); } };
  try {
    fetch(UPDATE_URL + '?t=' + Date.now(), { cache: 'no-store' })
      .then((r) => { if (!r || !r.ok) throw new Error('http'); return r.text(); })
      .then((t) => {
        const m = t.match(/@version\s+([^\s]+)/);
        if (!m) throw new Error('parse');
        const remote = m[1].trim();
        if (isNewer(remote, SCRIPT_VERSION)) {
          say('새 버전 있음: ' + SCRIPT_VERSION + ' → ' + remote + ' · ' + stamp() + ' 확인', true);
          if (go) go.disabled = false;
          dlog('update-avail', remote);
        } else {
          say('최신 버전입니다 (' + SCRIPT_VERSION + ') · ' + stamp() + ' 확인', false);
          dlog('update-latest', remote);
        }
      })
      .catch(() => say('확인 실패 (네트워크) · ' + stamp()))
      .then(() => new Promise((r) => setTimeout(r, 500))) // 너무 빨리 끝나도 도는 모습이 보이도록 잠깐 유지
      .then(done);
  } catch (e) {
    say('확인 실패 (네트워크)');
    done();
  }
}
// 플러그인 옵션 입력칸 (type: bool | number | multi)
// (?) 도움말: 옵션 정의의 help { title, text } 를 팝업으로 보여준다
function showOptHelp(h) {
  const old = document.getElementById('__kw_opthelp');
  if (old) old.remove();
  if (!h || !h.text) return;
  const w = document.createElement('div');
  w.id = '__kw_opthelp';
  w.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);padding:16px;box-sizing:border-box';
  const lines = String(h.text).split('\n').map((l) => {
    const t = escapeHtml(l);
    if (!l.trim()) return '<div style="height:8px"></div>';
    if (/^#파티/.test(l) || /^예\)/.test(l)) return '<div style="background:#2a2a33;border-radius:6px;padding:4px 8px;margin:2px 0;font-weight:bold;color:#ffd400;white-space:pre-wrap">' + t + '</div>';
    if (/^[①②③④]/.test(l) || l === '이렇게 동작해요') return '<div style="margin-top:6px;font-weight:bold;color:#fff">' + t + '</div>';
    return '<div style="color:#ccc;white-space:pre-wrap">' + t + '</div>';
  }).join('');
  w.innerHTML = '<div style="position:relative;width:min(420px,100%);max-height:100%;overflow-y:auto;box-sizing:border-box;background:rgb(20,20,24);color:#fff;font:13px/1.55 sans-serif;padding:14px 16px 16px;border-radius:12px;border:1px solid #777;box-shadow:0 8px 28px rgba(0,0,0,.6);scrollbar-width:thin">' +
    '<div style="display:flex;align-items:center;min-height:26px;padding-right:28px;margin-bottom:6px"><b style="font-size:14px">' + escapeHtml(h.title || '도움말') + '</b></div>' +
    '<button class="__kw_ic __kw_xabs" id="__kw_opthelp_x" title="닫기" style="color:#aaaab9">' + IC.close + '</button>' + lines +
    '<button class="__kw_b" id="__kw_opthelp_ok" style="display:block;width:100%;margin:14px 0 0;padding:10px 0;background:#1f6feb;color:#fff;font-size:14px">확인</button></div>';
  document.body.appendChild(w);
  const close = () => { try { w.remove(); } catch (e) {} };
  w.querySelector('#__kw_opthelp_x').onclick = close;
  w.querySelector('#__kw_opthelp_ok').onclick = close;
  w.onclick = (e) => { if (e.target === w) close(); };
}
function bindPluginOpts(root) {
  root.querySelectorAll('[data-help]').forEach((b) => {
    b.onclick = (e) => { e.preventDefault(); const d = pluginOptDef(b.dataset.pid, b.dataset.key) || {}; showOptHelp(d.help); };
  });
  root.querySelectorAll('.__kw_popt').forEach((c) => {
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
      try { // 이 옵션이 다른 옵션의 부모(체크)이면 아래 항목의 활성/비활성을 다시 그린다
        const pl = (pluginList || []).find((x) => x.id === c.dataset.pid);
        if (pl && (pl.options || []).some((x) => x.parent === c.dataset.key)) renderOptWin();
      } catch (e) {}
    };
  });
  root.querySelectorAll('.__kw_popt_m').forEach((c) => {
    c.onchange = () => {
      const all = [...root.querySelectorAll('.__kw_popt_m')].filter((x) => x.dataset.pid === c.dataset.pid && x.dataset.key === c.dataset.key);
      pluginOptSet(c.dataset.pid, c.dataset.key, all.filter((x) => x.checked).map((x) => x.dataset.val));
    };
  });
}
const OPT_CB = 'margin:0;width:14px;height:14px;accent-color:#00ffa3;flex:none'; // 옵션 창 체크박스: 글자와 세로 가운데 정렬
const pluginHasOpts = (p) => Array.isArray(p.options) && p.options.length > 0;
function extOptHtml(p) {
  if (!pluginHasOpts(p)) return '';
  const rows = p.options.map((o) => {
    const v = pluginOptGet(p.id, o.key);
    const at = `data-pid="${escapeHtml(p.id)}" data-key="${escapeHtml(o.key)}"`;
    const lb = escapeHtml(o.label || o.key);
    if (o.type === 'bool') return `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><label style="cursor:pointer;display:inline-flex;align-items:center;gap:6px"><input type="checkbox" class="__kw_popt" ${at} ${v ? 'checked' : ''} style="${OPT_CB}"> ${lb}</label>${o.help ? `<button class="__kw_help" data-help="1" ${at} title="사용 방법" style="width:16px;height:16px;padding:0;border-radius:50%;border:1px solid #8a8a99;background:transparent;color:#ccc;font:bold 11px/14px sans-serif;cursor:pointer;flex:none">?</button>` : ''}</div>`;
    if (o.type === 'number') {
      // parent: 같은 확장의 다른 체크 옵션이 켜져 있어야 입력할 수 있다. after: 입력칸 뒤에 붙는 글자(예: "[3] 분 전에 알림")
      const par = o.parent ? !!pluginOptGet(p.id, o.parent) : true;
      return `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;${o.parent ? 'margin-left:22px;' : ''}opacity:${par ? 1 : 0.45}">${o.label ? lb : ''}<input class="__kw_in __kw_popt" type="number" ${at} min="${Number(o.min) || 0}" max="${Number(o.max) || 999}" step="1" style="width:46px;text-align:center;padding:4px 2px;margin:0" value="${escapeHtml(String(v))}" ${par ? '' : 'disabled'}>${o.after ? '<span>' + escapeHtml(o.after) + '</span>' : ''}${o.unit ? '<span>' + escapeHtml(o.unit) + '</span>' : ''}</div>`;
    }
    if (o.type === 'multi') {
      const sel = Array.isArray(v) ? v : [];
      // parent: 같은 확장의 다른 체크 옵션이 켜져 있어야 아래 항목을 고를 수 있다 (꺼져 있으면 흐리게 + 비활성)
      const par = o.parent ? !!pluginOptGet(p.id, o.parent) : true;
      const cw = Number(o.colw) > 0 ? Math.min(200, Number(o.colw)) : 0; // 한 칸 폭(px). 창이 좁아지면 이 폭 단위로 줄바꿈
      const box = (c) => `<label style="cursor:${par ? 'pointer' : 'default'};white-space:nowrap;display:inline-flex;align-items:center;gap:5px;flex:none${cw ? `;width:${cw}px;overflow:hidden` : ''}"><input type="checkbox" class="__kw_popt_m" ${at} data-val="${escapeHtml(c)}" ${sel.includes(c) ? 'checked' : ''} ${par ? '' : 'disabled'} style="${OPT_CB}"> <span style="overflow:hidden;text-overflow:ellipsis">${escapeHtml(c)}</span></label>`;
      // groups가 있으면 묶음마다 따로 그리되, 창이 좁아지면 폭 단위로 자동 줄바꿈된다
      const groups = Array.isArray(o.groups) && o.groups.length ? o.groups : [o.choices || []];
      const rowsHtml = groups.map((g) => `<div style="display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:3px">${g.map(box).join('')}</div>`).join('');
      return `<div style="${o.parent ? 'margin-left:22px;' : ''}opacity:${par ? 1 : 0.45}">${o.label ? lb : ''}${rowsHtml}</div>`;
    }
    return '';
  }).join('');
  return `<div style="font-size:12px;color:#ddd;display:flex;flex-direction:column;gap:8px">${rows}</div>`;
}
// 확장 옵션 창: 설정 > 확장의 [옵션] 버튼으로 여는 별도 창 (옵션이 있는 확장만)
let optWinId = null;
function closeOptWin() { optWinId = null; const w = document.getElementById('__kw_optwin'); if (w) w.remove(); }
const LS_OPTSIZE = '__kw_opt_size';
const LS_OPTPOS = '__kw_opt_pos';
const OPT_H_MIN = 200;
const optHMax = () => Math.max(OPT_H_MIN, window.innerHeight - 16);
function loadOptSize() {
  try {
    const o = JSON.parse(localStorage.getItem(LS_OPTSIZE));
    if (o && isFinite(o.w) && isFinite(o.h)) {
      return { w: Math.max(225, Math.min(600, Math.round(o.w))), h: Math.max(OPT_H_MIN, Math.min(4000, Math.round(o.h))) };
    }
  } catch (e) {}
  return null;
}
function loadOptPos() {
  try { const o = JSON.parse(localStorage.getItem(LS_OPTPOS)); if (o && isFinite(o.x) && isFinite(o.y)) return o; } catch (e) {}
  return null;
}
function renderOptWin() {
  const old = document.getElementById('__kw_optwin');
  const p = optWinId && (pluginList || []).find((x) => x.id === optWinId);
  if (!p || !pluginHasOpts(p) || !pluginIsOn(p)) { if (old) old.remove(); optWinId = null; return; }
  const w = old || document.createElement('div');
  w.id = '__kw_optwin';
  // 설정 창 오른쪽에 붙여서 연다 (설정 창이 없으면 화면 가운데)
  let pos = 'top:50%;left:50%;transform:translate(-50%,-50%)';
  try {
    const r = setPanel && setPanel.isConnected && setPanel.style.display !== 'none' ? setPanel.getBoundingClientRect() : null;
    if (r && r.width > 0 && r.right + 330 < window.innerWidth) pos = 'bottom:' + Math.max(8, Math.round(window.innerHeight - r.bottom)) + 'px;left:' + Math.round(r.right + 8) + 'px';
  } catch (e) {}
  w.style.cssText = 'position:fixed;' + pos + ';z-index:2147483647;width:fit-content;min-width:min(225px,92vw);max-width:96vw;min-height:min(470px,86vh);max-height:86vh;overflow:visible;display:flex;flex-direction:column;box-sizing:border-box;background:rgb(20,20,24);color:#fff;font:13px sans-serif;padding:8px 10px 12px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.5);border:1px solid #777;opacity:' + ((100 - getTransparency()) / 100);
  try { // 저장된 위치/크기가 있으면 우선 (통일: 좌상 + 이동, 우하 대각 리사이즈)
    const sp = loadOptPos();
    if (sp) {
      const rr0 = w.getBoundingClientRect();
      const ww0 = rr0.width || 340, hh0 = rr0.height || 470;
      w.style.left = Math.max(0, Math.min(window.innerWidth - ww0, sp.x)) + 'px';
      w.style.top = Math.max(0, Math.min(window.innerHeight - hh0, sp.y)) + 'px';
      w.style.bottom = 'auto'; w.style.transform = 'none';
    }
    const ss = loadOptSize();
    if (ss) { w.style.width = Math.min(ss.w, window.innerWidth - 16) + 'px'; w.style.height = Math.min(ss.h, optHMax()) + 'px'; }
  } catch (e) {}
  w.innerHTML = `<div id="__kw_optwin_mv" class="__kw_mv" title="드래그로 옵션 창 이동 · 더블클릭: 원래 자리로" style="border-color:#777;color:#ccc">+</div><div style="display:flex;align-items:center;flex:none;min-height:26px;padding-right:26px;margin-bottom:8px"><b style="display:inline-flex;align-items:center;gap:5px"><span class="__kw_ti" style="color:#ccc">${IC.sliders}</span>${escapeHtml(p.name || p.id)} · 옵션</b></div><button class="__kw_ic __kw_xabs" id="__kw_optwin_x" title="닫기" style="color:#aaaab9">${IC.close}</button><div id="__kw_optwin_body" style="flex:1;min-height:0;overflow-y:auto;scrollbar-width:thin">${extOptHtml(p)}</div>`;
  if (!old) document.body.appendChild(w);
  try { // 옵션 창 폭이 넓어서 설정 창 오른쪽에 다 들어가지 않으면 화면 가운데로 (저장 위치가 없을 때만)
    if (!loadOptPos()) {
      const rr = w.getBoundingClientRect();
      if (rr.right > window.innerWidth - 4 && pos.indexOf('translate') < 0) w.style.cssText = w.style.cssText.replace(/(bottom|top):[^;]+;left:[^;]+;/, 'top:50%;left:50%;transform:translate(-50%,-50%);');
    }
  } catch (e) {}
  w.querySelector('#__kw_optwin_x').onclick = closeOptWin;
  bindPluginOpts(w);
  kwWindowXY(w, { // 확장 옵션: 가로+세로
    color: '#aaaab9', log: 'opt-size',
    loadPos: loadOptPos,
    savePos: (p) => { try { localStorage.setItem(LS_OPTPOS, JSON.stringify({ x: Math.round(p.x), y: Math.round(p.y) })); } catch (err) {} },
    clearPos: () => { try { localStorage.removeItem(LS_OPTPOS); } catch (e) {} },
    applyPos: () => {
      const sp = loadOptPos();
      if (!sp) return;
      const rr0 = w.getBoundingClientRect();
      const ww0 = rr0.width || 340, hh0 = rr0.height || 470;
      w.style.position = 'fixed';
      w.style.left = Math.max(0, Math.min(window.innerWidth - ww0, sp.x)) + 'px';
      w.style.top = Math.max(0, Math.min(window.innerHeight - hh0, sp.y)) + 'px';
      w.style.bottom = 'auto'; w.style.transform = 'none';
    },
    onDock: () => renderOptWin(),
    getW: () => w.getBoundingClientRect().width || 340,
    setW: (v) => { w.style.width = Math.max(225, Math.min(600, Math.round(v))) + 'px'; },
    getH: () => w.getBoundingClientRect().height || 470,
    setH: (v) => { w.style.height = Math.max(OPT_H_MIN, Math.min(optHMax(), v)) + 'px'; },
    saveSize: () => {
      try {
        const r = w.getBoundingClientRect();
        localStorage.setItem(LS_OPTSIZE, JSON.stringify({ w: Math.round(r.width), h: Math.round(r.height) }));
      } catch (err) {}
    },
  });
}
function extListHtml() {
  if (limitedMode) return '<div class="__kw_lbl" style="color:#ffd400">사용자 스크립트 허용이 꺼져 있어 확장을 쓸 수 없습니다</div>';
  if (pluginList === null) return '<div class="__kw_lbl">목록을 불러오는 중...</div>';
  if (!pluginList.length) return '<div class="__kw_lbl">등록된 확장이 없습니다</div>';
  return pluginList.map((p) => {
    const blocked = !!(p.noOwner && isOwner()); // 방장은 이 확장을 켤 수 없다
    const note = blocked ? ' <span style="color:#ffd400">(방장은 사용할 수 없음)</span>' : (p.desc ? ` <span style="color:#888">${escapeHtml(p.desc)}</span>` : '');
    const optBtn = pluginIsOn(p) && pluginHasOpts(p) ? ` <button class="__kw_ic __kw_popen" data-id="${escapeHtml(p.id)}" title="옵션" style="color:#ccc;padding:3px">${IC.sliders}</button>` : '';
    return `<div class="__kw_lbl"><label style="cursor:${blocked ? 'default' : 'pointer'}${blocked ? ';opacity:.6' : ''}"><input type="checkbox" class="__kw_plug" data-id="${escapeHtml(p.id)}" ${pluginIsOn(p) ? 'checked' : ''} ${blocked ? 'disabled' : ''}> ${escapeHtml(p.name || p.id)}</label>${optBtn}${note}</div>`;
  }).join('');
}
// 업데이트 설치(Tampermonkey 설치 창) 후 새로고침 안내 팝업.
// 설치 완료 여부는 직접 알 수 없어서, 설치 창이 닫히면 자동으로, 아니면 버튼으로 새로고침한다.
function showReloadPopup(openInstall) {
  if (document.getElementById('__kw_upd')) return;
  const box = document.createElement('div');
  box.id = '__kw_upd';
  // 우리 앱 화면(설정 창, 닫혀 있으면 왼쪽 아래 스택) 위에 덮어서 보여준다
  let host = null;
  try { host = (setPanel && setPanel.isConnected && setPanel.style.display !== 'none') ? setPanel : stackEl; } catch (e) {}
  const hr = host && host.isConnected ? host.getBoundingClientRect() : null;
  const base = 'z-index:2147483647;background:rgb(14,14,18);color:#fff;font:13px sans-serif;border-radius:12px;border:2px solid #1f6feb;box-shadow:0 8px 28px rgba(0,0,0,.6);box-sizing:border-box;text-align:left;';
  box.style.cssText = hr && hr.width > 120 && hr.height > 80
    ? base + 'position:fixed;left:' + hr.left + 'px;top:' + hr.top + 'px;width:' + hr.width + 'px;height:' + hr.height + 'px;padding:14px 16px;display:flex;flex-direction:column;justify-content:center;overflow:auto'
    : base + 'position:fixed;top:28%;left:50%;transform:translateX(-50%);padding:16px 18px;max-width:340px';
  const phase1Html = '<div style="font-size:14px"><b>🔄 업데이트 설치 후 새로고침</b></div>' +
    '<div style="font-size:12px;color:#bbb;margin:8px 0 10px;line-height:1.5">이 탭으로 돌아오면 카운트 후 <b>자동으로 새로고침</b>됩니다 (알람 초기화가 일어날 수 있습니다)</div>' +
    '<div style="display:flex;gap:14px;align-items:center">' + // 두 버튼 사이 간격
    '<button class="__kw_b" id="__kw_upd_go" style="background:#1f6feb;color:#fff;margin:0">설치 끝남 · 새로고침</button>' +
    '<button class="__kw_b" id="__kw_upd_x" style="background:#444;color:#fff;margin:0">나중에</button></div>' +
    '<div id="__kw_upd_msg" style="font-size:12px;color:#ffd400;margin-top:8px"></div>';
  // 1) 먼저 확인 팝업: 확인을 누르면 Tampermonkey 설치 창으로 넘어간다
  box.innerHTML = '<div style="font-size:14px"><b>🔄 업데이트</b></div>' +
    '<div style="font-size:12px;color:#bbb;margin:8px 0 8px;line-height:1.5">새 버전을 설치합니다. <b>확인</b>을 누르면 Tampermonkey 설치 창이 열립니다.</div>' +
    '<div style="font-size:14px;font-weight:bold;color:#ffd400;background:rgba(255,212,0,.12);border:1px solid #ffd400;border-radius:8px;padding:8px 10px;margin:0 0 12px;line-height:1.5">새로 열린 Tampermonkey 창에서<br><span style="font-size:15px">재설치/업그레이드</span>를 누르세요</div>' +
    '<div style="display:flex;gap:10px;align-items:stretch"><button class="__kw_b" id="__kw_upd_ok" style="background:#1f6feb;color:#fff;margin:0;flex:1;padding:12px 0;font-size:14px">확인</button>' +
    '<button class="__kw_b" id="__kw_upd_cancel" style="background:#444;color:#fff;margin:0;flex:1;padding:12px 0;font-size:14px">취소</button></div>';
  document.body.appendChild(box);
  box.querySelector('#__kw_upd_cancel').onclick = () => { try { box.remove(); } catch (e) {} };
  box.querySelector('#__kw_upd_ok').onclick = () => {
    let w = null;
    try { w = openInstall(); } catch (e) {}
    box.innerHTML = phase1Html;
    watchInstall(w);
  };
  function watchInstall(installWin) {
  let timer = null;
  const reload = () => { // 새로고침 전에 불린 대화 목록을 비운다
    try { hitLog = []; hitTimes.clear(); saveHits(); } catch (e) {}
    try { location.reload(); } catch (e) {}
  };
  const close = () => { if (timer) { clearInterval(timer); timer = null; } try { box.remove(); } catch (e) {} };
  box.querySelector('#__kw_upd_go').onclick = reload;
  box.querySelector('#__kw_upd_x').onclick = close;
  // 돌아오면(설치 창이 닫히거나, 이 탭이 다시 보이면) 카운트다운 후 강제 새로고침. 이때부터는 "나중에"를 없앤다.
  let counting = false;
  const startCount = () => {
    if (counting || !box.isConnected) return;
    counting = true;
    if (timer) { clearInterval(timer); timer = null; }
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('focus', onFocus);
    const later = box.querySelector('#__kw_upd_x');
    if (later) later.style.display = 'none';
    const go = box.querySelector('#__kw_upd_go');
    if (go) { go.textContent = '지금 새로고침'; go.style.flex = '1'; go.style.width = '100%'; go.style.padding = '10px 0'; } // 닫기가 없으니 버튼을 꽉 채워 크게
    const msg = box.querySelector('#__kw_upd_msg');
    let n = 17;
    box.classList.add('blink'); // 카운트다운 동안 깜빡임
    const tick = () => {
      if (!box.isConnected) return;
      if (msg) msg.textContent = '돌아오셨네요. ' + n + '초 뒤 새로고침합니다...';
      // 시작할 때와 마지막 3초에 알림음 (알람 끄기 상태면 소리 생략)
      if ((n === 17 || (n <= 3 && n > 0)) && !muted()) { lastSoundAt = 0; playAlertSound(); }
      if (n-- <= 0) { reload(); return; }
      setTimeout(tick, 1000);
    };
    tick();
  };
  let left = false; // 설치 창으로 나갔었는가
  const onVis = () => { if (document.visibilityState === 'hidden') left = true; else if (left) setTimeout(startCount, 500); };
  const onFocus = () => { if (left) setTimeout(startCount, 500); };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('blur', () => { left = true; });
  window.addEventListener('focus', onFocus);
  const close0 = close;
  box.querySelector('#__kw_upd_x').onclick = () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onFocus); close0(); };
  if (!installWin) return; // 팝업이 막혀 창 상태를 볼 수 없으면 탭 복귀 감지와 버튼으로만
  timer = setInterval(() => {
    let closed = false;
    try { closed = !!installWin.closed; } catch (e) {}
    if (closed) startCount();
  }, 1000);
  }
}
function renderSettings() {
  if (!setPanel) return;
  setPanel.innerHTML = `
    <b id="__kw_set_title" title="끌어서 설정 창 이동" style="position:absolute;top:10px;left:18px;font-size:14px;color:#fff;cursor:grab;touch-action:none;user-select:none;display:inline-flex;align-items:center;gap:5px"><span class="__kw_ti" style="color:#ccc">${IC.sliders}</span>설정</b>
    <button id="__kw_set_move" class="__kw_mv" title="드래그로 설정 창 이동 (화면 가장자리·다른 창에 자석처럼 붙음) · 더블클릭: 원래 자리로" style="border-color:#777;color:#ccc">+</button>
    <button class="__kw_ic __kw_xabs" id="__kw_set_close" title="설정 닫기" style="color:#aaaab9">${IC.close}</button>
    <div style="display:flex;gap:14px;height:calc(100% - 28px);margin-top:28px">
      <div class="__kw_tabs">
        <button class="__kw_tab${setTab === 'general' ? ' on' : ''}" data-tab="general">일반설정</button>
        <button class="__kw_tab${setTab === 'sound' ? ' on' : ''}" data-tab="sound">음향설정</button>
        <button class="__kw_tab${setTab === 'words' ? ' on' : ''}" data-tab="words">단어설정</button>
        <button class="__kw_tab${setTab === 'ext' ? ' on' : ''}" data-tab="ext">확장</button>
        <button class="__kw_tab${setTab === 'about' ? ' on' : ''}" data-tab="about">앱 정보</button>
      </div>
      <div id="__kw_set_body" style="flex:1;min-width:0;min-height:0;overflow-y:auto;display:flex;flex-direction:column;padding-right:8px">
        <div id="__kw_set_general" style="display:${setTab === 'general' ? 'block' : 'none'}">
          <div class="__kw_lbl"><label style="cursor:pointer"><input type="checkbox" id="__kw_auto" ${autoOn() ? 'checked' : ''}> 방송 들어가면 묻지 않고 자동으로 켜기</label></div>
          <div class="__kw_lbl"><label style="cursor:pointer"><input type="checkbox" id="__kw_hist" ${histOn() ? 'checked' : ''}> 불린 대화 목록 별도 표시 (클릭 이동)</label></div>
          <div class="__kw_lbl"><label style="cursor:pointer"><input type="checkbox" id="__kw_drops" ${dropsOn() ? 'checked' : ''}> 드롭스 보기 (진행 중인 드롭스가 있을 때만 표시)</label></div>
          <div class="__kw_lbl"><label style="cursor:pointer"><input type="checkbox" id="__kw_mute" ${muted() ? 'checked' : ''}> 알람 끄기 (감지·기록은 유지)</label></div>
          <div class="__kw_lbl">창 투명도 <b id="__kw_op_val">${getTransparency()}%</b> <span style="color:#888">(0~90%)</span></div>
          <input type="range" id="__kw_op" min="0" max="90" step="5" value="${getTransparency()}" style="width:220px;cursor:pointer">
          <div class="__kw_lbl"><label style="cursor:pointer;display:flex;align-items:center;gap:6px"><input type="checkbox" id="__kw_dedup" style="margin:0" ${dedupOn() ? 'checked' : ''}> 이미 울린 대화 재알림 방지</label></div>
          <div id="__kw_redup_grp" style="padding-left:20px;opacity:${dedupOn() ? 1 : 0.45}">
            <div class="__kw_lbl" style="margin-top:2px">같은 호출 다시 울리기까지 (0이면 항상 울림)</div>
            <div style="display:flex;align-items:center;gap:6px">
              <input class="__kw_in" id="__kw_redup" type="number" min="0" max="999" maxlength="3" oninput="if(this.value.length>3)this.value=this.value.slice(0,3)" step="1" style="width:42px;text-align:center;padding:4px 2px;${redupInf() ? 'opacity:.45' : ''}" value="${redupSec()}" ${dedupOn() && !redupInf() ? '' : 'disabled'}>
              <span>초</span>
              <label style="cursor:pointer;display:flex;align-items:center;gap:4px;margin-left:6px" title="켜면 시간이 아무리 지나도 같은 내용(같은 단어)은 다시 울리지 않습니다"><input type="checkbox" id="__kw_redup_inf" style="margin:0" ${redupInf() ? 'checked' : ''} ${dedupOn() ? '' : 'disabled'}> 무제한</label>
            </div>
          </div>
        </div>
        <div id="__kw_set_sound" style="display:${setTab === 'sound' ? 'block' : 'none'}">
          <div class="__kw_lbl" style="margin-top:0">알림 소리</div>
          <div style="display:flex;align-items:center;gap:6px"><select class="__kw_in" id="__kw_snd"><option value="dingdong">딩동</option><option value="custom">내 파일</option></select><button class="__kw_ic" id="__kw_snd_test" title="들어보기" style="color:#00ffa3">${IC.play}</button></div>
          <div class="__kw_lbl" id="__kw_snd_row" style="display:${sndMode() === 'custom' ? 'block' : 'none'}"><input type="file" id="__kw_snd_file" accept="audio/*" style="max-width:150px;font-size:11px"> <span id="__kw_snd_name" style="color:#aaa"></span></div>
          <div class="__kw_lbl" id="__kw_snd_msg" style="color:#ffd400"></div>
          <div class="__kw_lbl">볼륨 <b id="__kw_vol_val">${volPct()}%</b></div>
          <input type="range" id="__kw_vol" min="0" max="100" step="5" value="${volPct()}" style="width:220px;cursor:pointer">
          <div class="__kw_lbl">출력장치(알람소리만)</div>
          <div style="display:flex;align-items:center;gap:6px"><select class="__kw_in" id="__kw_sink" style="max-width:210px"><option value="">시스템 기본</option></select><button class="__kw_ic" id="__kw_sink_pick" title="스피커 목록 불러오기" style="color:#ccc">${IC.refresh}</button></div>
          <div class="__kw_lbl" id="__kw_sink_msg" style="color:#888"></div>
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
          <!-- [BETA-TEST-ONLY:start] -->
          <div style="margin-top:4px"><button class="__kw_b" id="__kw_t_drops" style="background:#ff9f1a;color:#000">드롭스 알림 테스트</button> <button class="__kw_b" id="__kw_t_boss" style="background:#ff9f1a;color:#000">보스 알람 테스트</button></div>
          <div id="__kw_t_msg" class="__kw_lbl"></div>
          <!-- [BETA-TEST-ONLY:end] -->
          <div style="display:flex;align-items:flex-start;gap:5px;margin-top:8px;line-height:18px"><span class="__kw_lbl" style="margin:0;width:5em;flex:none;line-height:18px">제작자</span><b>비류라미</b></div>
          <div style="margin-top:4px;font-size:12px;color:#eee">"검은사막에서 미리내ES 님과 놀다 겁나 심심해서 만듬"</div>
          <div style="display:flex;align-items:flex-start;gap:5px;margin-top:8px;line-height:18px"><span class="__kw_lbl" style="margin:0;width:5em;flex:none;line-height:18px">테스터</span><b>데아앵커</b></div>
          <div style="margin-top:4px;font-size:12px;color:#eee">"쉬는 시간은 최고야!"</div>
          <div style="display:flex;align-items:flex-start;gap:5px;margin-top:8px;line-height:18px"><span class="__kw_lbl" style="margin:0;width:5em;flex:none;line-height:18px">최초설치자</span><b>털찐길냥이</b></div>
          <div style="margin-top:4px;font-size:12px;color:#eee">"하우징은 즐겁다옹!!"</div>
          <div class="__kw_lbl">현재 버전</div>
          <div><b>${escapeHtml(SCRIPT_VERSION)}</b> <span style="color:#888">(Beta 채널)</span><button class="__kw_ic" id="__kw_update_check" title="업데이트 확인">${IC.refresh}</button><button class="__kw_upbtn" id="__kw_update_go" disabled>업데이트</button></div>
          <div id="__kw_update_msg" class="__kw_lbl"></div>
          <div class="__kw_lbl"><a href="https://github.com/Dark1004-K/Chzzk_Alert" target="_blank" rel="noopener" style="color:#00ffa3">GitHub 리포지토리</a> · <a href="https://github.com/Dark1004-K/Chzzk_Alert/blob/main/beta/UPDATE.md" target="_blank" rel="noopener" style="color:#00ffa3">업데이트 내용</a></div>
        </div>
      </div>
    </div>`;

  kwWindowXY(setPanel, { // 설정: 가로+세로 (기본창 XY형 상속)
    color: '#aaaab9', log: 'set-size',
    loadPos: loadSetPos,
    savePos: (p) => { try { localStorage.setItem(LS_SETPOS, JSON.stringify({ x: Math.round(p.x), y: Math.round(p.y) })); } catch (err) {} },
    clearPos: () => { try { localStorage.removeItem(LS_SETPOS); } catch (e) {} },
    applyPos: () => applySetPos(),
    onDock: () => { try { if (document.getElementById('__kw_optwin')) renderOptWin(); } catch (e) {} },
    onMove: () => { try { const ow = document.getElementById('__kw_optwin'); if (ow) renderOptWin(); } catch (err) {} }, // 옵션 창은 설정 창 옆을 따라감
    onDrop: () => { try { const tb = document.getElementById('__kw_box'); if (tb) placeToastBox(tb); } catch (err) {} }, // 열려 있는 알람 토스트가 옮긴 창과 겹치면 위로
    getW: () => setPanel.getBoundingClientRect().width || SET_W_DEF,
    setW: (v) => { setPanel.style.width = Math.max(225, Math.min(600, Math.round(v))) + 'px'; },
    getH: () => setPanel.getBoundingClientRect().height || SET_H_DEF,
    setH: (v) => { setPanel.style.height = Math.max(SET_H_MIN, Math.min(setHMax(), v)) + 'px'; },
    saveSize: () => {
      try {
        const r = setPanel.getBoundingClientRect();
        localStorage.setItem(LS_SETSIZE, JSON.stringify({ w: Math.round(r.width), h: Math.round(r.height) }));
      } catch (err) {}
    },
    applySize: () => applySetSize(),
  });
  const __kwSetMv = setPanel.querySelector('#__kw_set_move');
  setPanel.querySelector('#__kw_set_title').onpointerdown = (e) => { try { if (__kwSetMv && __kwSetMv.onpointerdown) __kwSetMv.onpointerdown(e); } catch (err) {} };
  setPanel.querySelector('#__kw_set_close').onclick = () => { // X = 설정 창 닫기 (⚙ 버튼과 같음)
    setOpen = false;
    try { localStorage.setItem(LS_SET, '0'); } catch (e) {}
    applySetVisibility();
  };
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
    setPanel.querySelector('#__kw_redup').disabled = !e.target.checked || redupInf();
    setPanel.querySelector('#__kw_redup_inf').disabled = !e.target.checked;
    setPanel.querySelector('#__kw_redup_grp').style.opacity = e.target.checked ? '1' : '0.45';
  };
  // 무제한: 켜면 시간이 지나도 같은 내용은 다시 울리지 않는다 (숫자 입력은 막음)
  setPanel.querySelector('#__kw_redup_inf').onchange = (e) => {
    try { localStorage.setItem(LS_REDUP_INF, e.target.checked ? '1' : '0'); } catch (err) {}
    const num = setPanel.querySelector('#__kw_redup');
    num.disabled = e.target.checked || !dedupOn();
    num.style.opacity = e.target.checked ? '.45' : '';
    dlog('redup-inf', e.target.checked);
  };
  setPanel.querySelectorAll('.__kw_plug').forEach((c) => {
    c.onchange = () => {
      const p = (pluginList || []).find((x) => x.id === c.dataset.id);
      if (p) { setPluginOn(p, c.checked); renderSettings(); } // 옵션 보임/숨김을 다시 그림
    };
  });
  setPanel.querySelectorAll('.__kw_popen').forEach((b) => { b.onclick = () => { optWinId = b.dataset.id; renderOptWin(); }; });
  bindPluginOpts(setPanel);
  renderOptWin(); // 열려 있으면 최신 값으로 다시 그림
  const opInput = setPanel.querySelector('#__kw_op');
  if (opInput) opInput.oninput = () => {
    const v = Math.max(0, Math.min(90, parseInt(opInput.value, 10) || 0)); // 최대 90%
    try { localStorage.setItem(LS_OPACITY, String(v)); } catch (e) {}
    const lbl = setPanel.querySelector('#__kw_op_val');
    if (lbl) lbl.textContent = v + '%';
    applyOpacity();
  };
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
  // 볼륨
  const volEl = setPanel.querySelector('#__kw_vol');
  volEl.oninput = () => {
    try { localStorage.setItem(LS_VOL, String(parseInt(volEl.value, 10) || 0)); } catch (e) {}
    const l = setPanel.querySelector('#__kw_vol_val'); if (l) l.textContent = volPct() + '%';
  };
  volEl.onchange = () => { lastSoundAt = 0; playAlertSound(); }; // 놓으면 미리 들려줌
  // 출력 장치 (알림음 출력용. 음성 읽기(TTS)는 브라우저가 장치를 바꿀 수 없어 기본 장치로 나감)
  const sinkSel = setPanel.querySelector('#__kw_sink');
  const sinkMsg = setPanel.querySelector('#__kw_sink_msg');
  const canSink = typeof AudioContext !== 'undefined' && typeof AudioContext.prototype.setSinkId === 'function';
  function fillSinks(list) {
    const cur = sinkId();
    let html = '<option value="">시스템 기본</option>';
    const have = new Set(['']);
    (list || []).forEach((d) => { if (d.deviceId && d.deviceId !== 'default' && !have.has(d.deviceId)) { have.add(d.deviceId); html += '<option value="' + escapeHtml(d.deviceId) + '">' + escapeHtml(d.label || '장치') + '</option>'; } });
    if (cur && !have.has(cur)) { let nm = ''; try { nm = localStorage.getItem(LS_SINK_NAME) || ''; } catch (e) {} html += '<option value="' + escapeHtml(cur) + '">' + escapeHtml(nm || '선택한 장치') + '</option>'; }
    sinkSel.innerHTML = html;
    sinkSel.value = cur;
  }
  // 스피커(출력) 장치 목록. 이름은 브라우저가 권한 없이는 숨기므로 이름이 없으면 "스피커 1, 2.."로 보여준다 (고르면 바로 소리가 나서 구분 가능)
  function loadSinks(ask) {
    try {
      const list = () => navigator.mediaDevices.enumerateDevices();
      // Chrome은 마이크 권한이 없으면 스피커를 "기본" 하나만 보여준다(개인정보 보호). 목록 버튼을 누르면 권한을 한 번 요청해 전체를 읽고 마이크는 바로 끈다.
      const first = ask === true ? navigator.mediaDevices.getUserMedia({ audio: true }).then((st) => { try { st.getTracks().forEach((t) => t.stop()); } catch (e) {} return list(); }) : list();
      first.then((l) => {
        const outs = l.filter((d) => d.kind === 'audiooutput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications');
        fillSinks(outs.map((d, i) => ({ deviceId: d.deviceId, label: d.label || ('스피커 ' + (i + 1)) })));
        sinkMsg.textContent = outs.length ? '알림음이 나갈 스피커입니다. 고르면 바로 알람 소리가 납니다.' : '다른 스피커가 보이지 않습니다. 오른쪽 버튼을 눌러 스피커 목록을 불러오세요 (브라우저가 마이크 허용을 한 번 묻습니다. 마이크는 바로 끄고 녹음하지 않으며, 스피커 이름을 읽기 위한 것입니다).';
      }).catch((err) => { // 거부/차단 이유를 보여준다 (사이트 설정에서 마이크가 "차단"이면 물어보지 않고 바로 실패함)
        const nm = (err && err.name) || '';
        sinkMsg.textContent = '스피커 목록을 읽지 못했습니다 (' + (nm || '오류') + '). ' + (nm === 'NotAllowedError' ? '마이크가 차단되어 있으면 물어보지 않습니다. 주소창 왼쪽 자물쇠 → 사이트 설정에서 마이크를 "허용"(또는 "묻기")으로 바꾼 뒤 다시 눌러 주세요.' : nm === 'NotFoundError' ? '마이크 장치가 없어서 목록 권한을 받을 수 없습니다.' : '시스템 기본 장치를 쓰세요.');
      });
    } catch (e) {}
  }
  if (!canSink) {
    sinkSel.disabled = true; setPanel.querySelector('#__kw_sink_pick').disabled = true;
    sinkMsg.textContent = '이 브라우저는 출력 장치 선택을 지원하지 않습니다 (Chrome 110 이상)';
  } else {
    fillSinks([]);
    loadSinks();
    try { navigator.mediaDevices.addEventListener('devicechange', () => loadSinks()); } catch (e) {} // 장치를 꽂거나 뽑으면 목록 갱신
    sinkSel.onchange = () => {
      try { localStorage.setItem(LS_SINK, sinkSel.value); localStorage.setItem(LS_SINK_NAME, sinkSel.options[sinkSel.selectedIndex].textContent || ''); } catch (e) {}
      applySink(sharedCtx);
      lastSoundAt = 0; playAlertSound();
    };
    setPanel.querySelector('#__kw_sink_pick').onclick = () => loadSinks(true); // 스피커 목록 불러오기(필요하면 권한 요청)
  }
  const setBody = setPanel.querySelector('#__kw_set_body');
  if (setBody) setBody.addEventListener('wheel', (e) => { // 페이지가 휠을 가로채도 설정 본문은 스크롤되게
    if (setBody.scrollHeight <= setBody.clientHeight) return;
    e.stopPropagation();
    e.preventDefault();
    setBody.scrollTop += e.deltaY;
  }, { passive: false });
  setPanel.querySelector('#__kw_mute').onchange = (e) => setMuted(e.target.checked);
  setPanel.querySelector('#__kw_redup').onchange = (e) => {
    let v = parseFloat(e.target.value);
    if (!isFinite(v) || v < 0) v = 0;
    if (v > 999) v = 999;
    try { localStorage.setItem(LS_REDUP, String(v)); } catch (err) {}
    e.target.value = v;
    dlog('redup', v);
  };
  // [BETA-TEST-ONLY:start] 테스트 버튼
  const tMsg = setPanel.querySelector('#__kw_t_msg');
  const tSay = (t) => { if (tMsg) tMsg.textContent = t; };
  const tDrops = setPanel.querySelector('#__kw_t_drops');
  if (tDrops) tDrops.onclick = () => tSay(dropsSimNext());
  const tBoss = setPanel.querySelector('#__kw_t_boss');
  if (tBoss) tBoss.onclick = () => {
    tSay(typeof window.__kwBdoTest === 'function' ? window.__kwBdoTest(30) : '검은사막 확장이 켜져 있어야 합니다 (설정 > 확장)');
  };
  // [BETA-TEST-ONLY:end]
  const updateCheckBtn = setPanel.querySelector('#__kw_update_check');
  if (updateCheckBtn) updateCheckBtn.onclick = () => checkUpdate();
  const updateGoBtn = setPanel.querySelector('#__kw_update_go');
  if (updateGoBtn) updateGoBtn.onclick = () => showReloadPopup(() => window.open(UPDATE_URL, '_blank')); // 확인 팝업 → 확인하면 설치 창
  applySetVisibility();
}
// ---------- 설정 창 떼어서 옮기기 + 자석 ----------
// 설정 창 오른쪽 위의 사방 화살표 아이콘(또는 "설정" 제목)을 끌면 화면 아무 곳으로 옮길 수 있다. 화면 가장자리·다른 창에 14px 안이면 자석처럼 붙고, 아이콘을 더블클릭하면 원래 자리로 돌아온다.
const LS_SETPOS = '__kw_set_pos';
const SNAP_TH = 14, SNAP_GAP = 8;
function loadSetPos() {
  try { const o = JSON.parse(localStorage.getItem(LS_SETPOS)); if (o && isFinite(o.x) && isFinite(o.y)) return o; } catch (e) {}
  return null;
}
function applySetPos() {
  if (!setPanel) return;
  const p = loadSetPos();
  if (!p) { setPanel.style.position = ''; setPanel.style.left = ''; setPanel.style.top = ''; setPanel.style.bottom = ''; return; }
  const w = setPanel.offsetWidth || 440, h = setPanel.offsetHeight || 320;
  setPanel.style.position = 'fixed';
  setPanel.style.left = Math.max(0, Math.min(window.innerWidth - w, p.x)) + 'px';
  setPanel.style.top = Math.max(0, Math.min(window.innerHeight - h, p.y)) + 'px';
  setPanel.style.bottom = 'auto';
}
// 자석 대상 창들의 rect 목록 (skipEl 자신은 제외). 이동(snapRect)·늘리기(snapLen) 공용.
// 우리 창만: id가 __kw_ 로 시작 + 지금 화면에 보이는 것(computed display/visibility)만. 뒷배경(치지직 페이지)은 절대 포함 안 됨.
// 기준은 창 테두리가 아니라 +원·리사이즈원 끝: 사방 6px(동그라미 돌출분) 확장해서 자석 후보로 삼는다.
const HANDLE_OVERHANG = 6;
function snapRects(skipEl) {
  const out = [];
  const seen = new Set();
  const pushEl = (el) => {
    if (!el || el === skipEl || (skipEl && skipEl.contains && skipEl.contains(el))) return;
    if (seen.has(el)) return;
    seen.add(el);
    try { if (!el.isConnected) return; } catch (e3) {}
    try { // 화면에 안 보이는 창(CSS로 숨김 포함)은 제외
      const cs = getComputedStyle(el);
      if (!cs || cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return;
    } catch (e4) {}
    let r = null;
    try { r = el.getBoundingClientRect(); } catch (e) { return; }
    if (!r || r.width < 20 || r.height < 20) return;
    out.push({ l: r.left - HANDLE_OVERHANG, t: r.top - HANDLE_OVERHANG, r: r.right + HANDLE_OVERHANG, b: r.bottom + HANDLE_OVERHANG, w: r.width, h: r.height });
  };
  ['__kw_panel', '__kw_dropsp', '__kw_histp', '__kw_bdop', '__kw_cpn', '__kw_bdo_party', '__kw_setp', '__kw_optwin'].forEach((id) => {
    try { pushEl(document.getElementById(id)); } catch (e) {}
  });
  try { // 신규 창 자동 포함 (KW.float/window으로 등록된 창). id가 __kw_ 로 시작하지 않으면 제외.
    document.querySelectorAll('[data-kw-float]').forEach((el) => {
      try { if (el.id && el.id.indexOf('__kw_') !== 0) return; } catch (e5) {}
      pushEl(el);
    });
  } catch (e) {}
  return out;
}
// 화면 가장자리·다른 창 가장자리에 자석처럼 맞춘다 (skipEl 자신은 제외)
// 통일 규격: 감시중(#__kw_panel)은 자석 대상이지만 이동 대상은 아니다.
// 신규 창은 id="__kw_*" 또는 data-kw-float="1"이면 자동으로 자석 대상에 포함된다.
function snapRect(x, y, w, h, skipEl) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const xs = [], ys = []; // 화면 끝 자석 제외: 우리 창끼리만 (화면 밖으로 나가지 않게 clamp는 유지)
  snapRects(skipEl).forEach((rc) => {
    xs.push(rc.l, rc.r - w, rc.r + SNAP_GAP, rc.l - SNAP_GAP - w);
    ys.push(rc.t, rc.b - h, rc.b + SNAP_GAP, rc.t - SNAP_GAP - h);
  });
  const best = (v, list) => {
    let bv = v, bd = SNAP_TH + 1;
    list.forEach((c) => { const d = Math.abs(c - v); if (d < bd) { bd = d; bv = c; } });
    return { v: bv, hit: bd <= SNAP_TH };
  };
  const bx = best(x, xs), by = best(y, ys);
  return { x: bx.v, y: by.v, hit: bx.hit || by.hit, hx: bx.hit ? bx.v : null, hy: by.hit ? by.v : null };
}
// ---------- 스냅 가이드라인: 드래그 중 자석이 걸린 기준선을 화면에 표시 ----------
// 이동·늘리기 드래그에서 snap hit된 축의 선만 그림. 드롭하면 지움.
function snapGuideShow(lines) {
  let g = null;
  try { g = document.getElementById('__kw_snapguide'); } catch (e) {}
  if (!g) {
    g = document.createElement('div');
    g.id = '__kw_snapguide';
    g.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;display:none';
    try { document.body.appendChild(g); } catch (e2) { return; }
  }
  try {
    g.innerHTML = (lines || []).map((L) => L.axis === 'v'
      ? '<div style="position:absolute;top:0;bottom:0;left:' + Math.round(L.pos) + 'px;width:1px;background:rgba(0,255,163,.85)"></div>'
      : '<div style="position:absolute;left:0;right:0;top:' + Math.round(L.pos) + 'px;height:1px;background:rgba(0,255,163,.85)"></div>').join('');
    g.style.display = (lines && lines.length) ? 'block' : 'none';
  } catch (e3) {}
}
function snapGuideHide() { try { const g = document.getElementById('__kw_snapguide'); if (g) g.style.display = 'none'; } catch (e) {} }
function applySetVisibility() {
  if (!setPanel) return;
  setPanel.style.display = (setOpen && panel && panel.classList.contains('show')) ? 'block' : 'none';
  applySetSize();
  applySetPos();
  try { const tb = document.getElementById('__kw_box'); if (tb) placeToastBox(tb); } catch (e) {} // 열려 있는 알람 토스트 위치 갱신
}
// ---------- 설정 창 크기 (대각 핸들, 가로는 225~600으로 감시중 창을 따름) ----------
const LS_SETSIZE = '__kw_set_size';
const SET_W_DEF = 440, SET_H_DEF = 320, SET_H_MIN = 200;
const setHMax = () => Math.max(SET_H_MIN, window.innerHeight - 16);
function loadSetSize() {
  try {
    const o = JSON.parse(localStorage.getItem(LS_SETSIZE));
    if (o && isFinite(o.w) && isFinite(o.h)) {
      return {
        w: Math.max(225, Math.min(600, Math.round(o.w))),
        h: Math.max(SET_H_MIN, Math.min(4000, Math.round(o.h))),
      };
    }
  } catch (e) {}
  return null;
}
function applySetSize() {
  if (!setPanel) return;
  const s = loadSetSize();
  if (!s) { setPanel.style.width = ''; setPanel.style.height = ''; return; }
  setPanel.style.width = Math.min(s.w, window.innerWidth - 16) + 'px';
  setPanel.style.height = Math.min(s.h, setHMax()) + 'px';
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
  document.addEventListener('mouseup', (ev) => {
    if (!isLivePage()) return; // 이 채널의 라이브 페이지가 아니면 아무 것도 하지 않음
    let sel = document.getElementById('__kw_sel');
    if (!sel) {
      sel = document.createElement('div');
      sel.id = '__kw_sel';
      document.body.appendChild(sel);
    }
    const s = window.getSelection();
    const text = s ? s.toString().trim() : '';
    // 우리 앱 창 안에서 끌었으면 아무 것도 띄우지 않는다
    const inApp = (n) => { try { const el = n && (n.nodeType === 1 ? n : n.parentElement); return !!(el && el.closest && el.closest('#__kw_stack,#__kw_upd,#__kw_ask,#__kw_box,#__kw_sel,#__kw_optwin,.__kw_rsz,.__kw_mv')); } catch (e) { return false; } };
    if (inApp(ev && ev.target) || (s && (inApp(s.anchorNode) || inApp(s.focusNode)))) { sel.style.display = 'none'; return; }
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
// 창의 X 버튼으로 옵션을 껐을 때, 열려 있는 설정 화면의 체크 상태도 맞춘다
function refreshSettingsIfOpen() {
  try { if (setPanel && setPanel.isConnected) renderSettings(); } catch (e) {}
}
// 새로고침 버튼 상태(눌렀는지 알 수 있게): 도는 중 / 완료 체크 / 마지막 갱신 시각 툴팁
let dropsSpinning = false, dropsFlashUntil = 0, dropsRefreshedAt = 0;
function refreshTitle(at) {
  if (!at) return '새로고침';
  const d = new Date(at), p = (n) => String(n).padStart(2, '0');
  return '새로고침 (마지막 갱신 ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + ')';
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
  dropsPanel.innerHTML = `<div class="__kw_dr">${img}<div class="__kw_dr_b"><div class="__kw_dr_tr"><div class="__kw_dr_t" title="${escapeHtml(dropsInfo.title || '')}" style="display:flex;align-items:center;min-width:0">${TI(TI_GIFT, '#ff9f1a')}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0">${escapeHtml(title || '드롭스')}</span></div><button class="__kw_ic${dropsSpinning ? ' __kw_spin' : ''}" id="__kw_dr_refresh" title="${escapeHtml(refreshTitle(dropsRefreshedAt))}" style="color:${Date.now() < dropsFlashUntil ? '#7dffb3' : '#ff9f1a'}">${Date.now() < dropsFlashUntil ? IC.check : IC.refresh}</button></div><div class="__kw_dr_s">${dropsSubHtml(elapsed, cur)}</div></div><button class="__kw_ic" id="__kw_dr_vault" title="보관함" style="color:#ff9f1a">${IC.box}</button><button class="__kw_ic __kw_xabs" id="__kw_dr_close" title="닫기 (설정 > 일반설정 > 드롭스 보기에서 다시 켤 수 있음)" style="color:#ff9f1a">${IC.close}</button></div>`;
  dropsPanel.querySelector('#__kw_dr_close').onclick = () => { // X = 설정의 "드롭스 보기" 체크를 끈 것과 같음
    try { localStorage.setItem(LS_DROPS, '0'); } catch (e) {}
    stopDrops();
    refreshSettingsIfOpen();
    dlog('drops-closed');
  };
  const rf = dropsPanel.querySelector('#__kw_dr_refresh');
  rf.onclick = () => { // 드롭스 정보와 서버 시청 시간을 바로 다시 가져옴
    if (dropsSpinning) return; // 이미 가져오는 중이면 연타 무시
    dropsSpinning = true;
    renderDrops(); // 아이콘이 돌기 시작 → 눌린 것이 보임
    // 너무 빨리 끝나도 돌아가는 모습이 보이도록 최소 0.7초는 유지
    Promise.all([pollDrops(), new Promise((r) => setTimeout(r, 700))]).catch(() => {}).then(() => {
      dropsSpinning = false;
      dropsRefreshedAt = Date.now();
      dropsFlashUntil = Date.now() + 1400; // 체크 표시로 완료를 알림
      renderDrops();
      setTimeout(renderDrops, 1500);
    });
  };
  dropsPanel.querySelector('#__kw_dr_vault').onclick = () => { try { window.open(DROPS_VAULT_URL, '_blank', 'noopener'); } catch (e) {} };
  kwWindow(dropsPanel, { color: '#ff9f1a', posKey: LS_DROPSPOS, rsz: 'h' }); // 드롭스: 가로 (dock=스택공유, float=자기너비)
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
  return Promise.all([get('challenges'), get('claims')]).then(([ch, cl]) => {
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
// [BETA-TEST-ONLY:start]
// 진단용: 서버 시청 분을 가짜 값으로 바꿔 시간 충족 알림/다음 보상 전환을 바로 시험한다 (다음 서버 갱신 때 원래 값으로 복귀)
function dropsSimMin(n) {
  if (!dropsInfo) return '드롭스 정보 없음 (드롭스가 있는 방송에서 창이 보일 때 사용)';
  const min = Math.max(0, Number(n) || 0);
  dropsSrv = { min, claimed: new Set() };
  dropsSrvSynced = true;
  dropsRewards().forEach((r) => { if (min < r.conditionForMinutes) dropsDone.delete(r.rewardNo); }); // 다시 넘으면 또 울리도록
  renderDrops();
  dropsCheck();
  return '드롭스 시청 ' + min + '분으로 시뮬레이션 (1분 안에 서버 값으로 복귀)';
}
// [BETA-TEST-ONLY] 테스트 버튼용: 누를 때마다 다음 보상 시간이 찬 것으로 가정, 모두 찼으면 처음으로 되돌림
let dropsFake = false; // 가짜 드롭스 창을 띄워 둔 상태 (실제 드롭스가 없는 방송에서 시험용)
function dropsSimNext() {
  if (!dropsInfo) { // 실제 드롭스가 없으면 가짜 드롭스 창을 먼저 띄운다
    dropsFake = true;
    dropsInfo = { campaignNo: -1, title: '테스트 드롭스', rewardList: [
      { rewardNo: -1, title: '테스트 보상 A', imageUrl: '', conditionForMinutes: 1 },
      { rewardNo: -2, title: '테스트 보상 B', imageUrl: '', conditionForMinutes: 2 } ] };
    dropsSrv = { min: 0, claimed: new Set() };
    dropsSrvSynced = true;
    dropsDone = new Set();
    renderDrops();
    return '가짜 드롭스 창을 띄웠습니다 (누를 때마다 다음 보상 시간 충족 알림)';
  }
  const cur = dropsNextReward(dropsElapsed());
  if (!cur && dropsFake) { // 가짜 드롭스는 끝까지 보면 정리
    dropsFake = false; dropsInfo = null; dropsSrv = null; dropsSrvSynced = false; dropsCurNo = null; dropsCid = '';
    removeDropsPanel();
    return '가짜 드롭스 종료 (다시 누르면 처음부터)';
  }
  if (!cur) { dropsSimMin(0); return '모두 달성 상태였음 → 처음으로 되돌림 (다시 누르면 첫 보상부터 시험)'; }
  return dropsSimMin(cur.conditionForMinutes) + ' [' + cur.conditionForMinutes + '분 보상]';
}
// [BETA-TEST-ONLY:end]
function pollDrops() { // 끝나면 resolve되는 Promise를 돌려준다 (새로고침 버튼이 완료를 알리기 위해)
  if (typeof dropsFake !== 'undefined' && dropsFake) return Promise.resolve(); // [BETA-ONLY-LINE] 가짜 드롭스(테스트) 동안은 실제 조회로 덮어쓰지 않음
  if (!dropsOn() || !isLivePage()) { dropsInfo = null; removeDropsPanel(); return Promise.resolve(); }
  const cid = pageChannelId();
  if (!cid) return Promise.resolve();
  if (cid !== dropsCid) { // 채널이 바뀌면 접속 시간 초기화
    dropsCid = cid; const jn = loadJoin(cid); dropsJoinAt = jn.joinAt; dropsDone = new Set(jn.done); saveJoinAt(); dropsNo = 0; dropsInfo = null; dropsSrv = null; dropsSrvSynced = false; removeDropsPanel();
  }
  return fetch(DROPS_API + 'v3.2/channels/' + cid + '/live-detail')
    .then((r) => { if (!r || !r.ok) throw new Error('http'); return r.json(); })
    .then((j) => {
      if (cid !== dropsCid) return;
      const no = j && j.content && j.content.dropsCampaignNo;
      if (!no) { dropsNo = 0; dropsInfo = null; dropsSrv = null; dropsSrvSynced = false; renderDrops(); return; }
      if (no === dropsNo && dropsInfo) return fetchDropsServer(cid, no);
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
          return fetchDropsServer(cid, no);
        });
    })
    .catch(() => {}) // 네트워크 오류 시 현재 표시 유지
    .then(() => { dropsRefreshedAt = Date.now(); });
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
