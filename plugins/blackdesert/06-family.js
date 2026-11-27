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

