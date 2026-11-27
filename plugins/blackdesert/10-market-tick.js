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
      bdoTop(marketEl, true); // 열린 창을 최상단으로
      placeMarket();
    }
    renderMarket();
    bdoTop(marketEl, false); // z만 유지 (순서는 클릭 때만 변경)
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
    bdoTopWire(marketEl); // 클릭 리스너는 KW.window 뒤에 배선 (z 덮기 순서 보장)
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
      if (!KW.enabled(ID)) { clearAll(); removeMain(); removeCoupons(); removeEvents(); removeParty(); removeFamily(); removeRes(); marketData = null; marketPhase = 'idle'; try { if (typeof removeMarket === 'function') removeMarket(); } catch (e) {} return; }
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
          const b30 = bosses.slice();
          try { palarm(1, () => { try { if (typeof KW.emit === 'function') KW.emit('boss30', { bosses: b30 }); } catch (e) {} }, 400); } catch (e) {}
        }
        if (dismissed.has(o.t)) continue;
        active.add(o.t);
        if (!items.has(o.t)) {
          addItem(o);
          const bBs = bosses.slice();
          const bMs = o.t - now;
          const bWhen = bMs >= 60000 ? Math.round(bMs / 60000) + '분' : Math.max(1, Math.ceil(bMs / 1000)) + '초';
          try {
            palarm(1, () => {
              if (opt('sound', true)) { if (typeof KW.sound === 'function') KW.sound(); else beep(); } // 설정의 알림 소리 사용
              // TTS 확장이 켜져 있으면 우두머리 이름을 읽는다 (구독: on('ext:boss'))
              try { if (typeof KW.emit === 'function') KW.emit('boss', { bosses: bBs, when: bWhen }); } catch (e) {}
            }, 1400);
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
