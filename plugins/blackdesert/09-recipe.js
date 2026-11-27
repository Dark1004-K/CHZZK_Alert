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
      bdoTop(rcpEl, true); // 열린 창을 최상단으로
      placeRecipe();
    }
    renderRecipe();
    bdoTop(rcpEl, false); // z만 유지 (순서는 클릭 때만 변경)
    wireRecipeWindow();
    bdoTopWire(rcpEl); // 클릭 리스너는 KW.window 뒤에 배선 (z 덮기 순서 보장)
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
      bdoTop(resEl, true); // 열린 창을 최상단으로
      placeRes();
      resSig = null;
    }
    renderRes();
    bdoTop(resEl, false); // z만 유지 (순서는 클릭 때만 변경)
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
    bdoTopWire(resEl); bdoTop(resEl, false); // 클릭 리스너는 KW.window 뒤에 배선 (z 덮기 순서 보장)
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
