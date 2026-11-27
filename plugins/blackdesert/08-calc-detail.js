  // ---------- calculator 1차 상세 (crafting 페이지와 동일 소스, database.getItem 대체) ----------
  // /ko/crafting/:id 가 쓰는 3종: getCraftingRecipes(990) + getMaterialGroups(105) + getCraftingItemMetadata(1663)
  // 최초 1회만 받아 캐시하고, 이후 상세·버튼·하위 레시피는 메모리에서 해결 (항목당 추가 호출 없음)
  let calcRecipes = null, calcGroups = null, calcMeta = null, calcInflight = null;
  function ensureCalcData() {
    if (calcRecipes && calcGroups && calcMeta) return Promise.resolve(true);
    if (calcInflight) return calcInflight;
    const ru = BDOLY_BASE + '/api/trpc/calculator.getCraftingRecipes?input=' + encodeURIComponent(JSON.stringify(null));
    const gu = BDOLY_BASE + '/api/trpc/calculator.getMaterialGroups?input=' + encodeURIComponent(JSON.stringify(null));
    const mu = BDOLY_BASE + '/api/trpc/calculator.getCraftingItemMetadata?input=' + encodeURIComponent(JSON.stringify({ language: 'ko' }));
    calcInflight = Promise.all([
      bdoFetch(ru, 12000, BDOLY_BASE),
      bdoFetch(gu, 12000, BDOLY_BASE),
      bdoFetch(mu, 12000, BDOLY_BASE),
    ]).then((arr) => {
      let r = null, g = null, m = null;
      try { r = JSON.parse(arr[0]).result.data; } catch (e) { r = null; }
      try { g = JSON.parse(arr[1]).result.data; } catch (e) { g = null; }
      try { m = JSON.parse(arr[2]).result.data; } catch (e) { m = null; }
      const ok = !!(r && g && m);
      calcRecipes = ok ? r : null; calcGroups = ok ? g : null; calcMeta = ok ? m : null;
      calcInflight = null;
      return ok;
    }).catch(() => { calcRecipes = calcGroups = calcMeta = null; calcInflight = null; return false; });
    return calcInflight;
  }
  function calcMetaOf(id) { // meta[id] -> { name, icon(상대경로), grade, ... } | null
    try {
      const m = calcMeta && calcMeta[String(id)];
      return (m && typeof m === 'object') ? m : null;
    } catch (e) { return null; }
  }
  function calcIcon(m) {
    let ic = String((m && m.icon) || '');
    if (ic && ic.charAt(0) === '/') ic = BDOLY_IMG + ic;
    return ic;
  }
  function calcGroupOf(gid) { // groupId -> [{ itemId, value }] | null
    try {
      gid = Number(gid);
      for (const g of (calcGroups || [])) {
        if (g && Number(g.groupId) === gid) return g.items || g.candidates || null;
      }
    } catch (e) {}
    return null;
  }
  function calcIngToRow(ing) { // calculator 재료 1개 -> { name, amount, id, icon, grade, alt } (id 확정, 검색 불필요)
    if (!ing) return null;
    if (ing.type === 'item') {
      const m = calcMetaOf(ing.itemId);
      const nm = (m && m.name) || String(ing.itemId);
      return { name: nm, amount: ing.quantity, id: String(ing.itemId), icon: calcIcon(m), grade: (m && m.grade != null ? m.grade : null) };
    }
    if (ing.groupId != null) { // 대체재 그룹: crafting과 동일하게 value===1인 항목을 대표로 (없으면 첫 항목)
      const items = calcGroupOf(ing.groupId) || [];
      if (!items.length) return { name: '재료 그룹 ' + ing.groupId, amount: ing.quantity, id: '', icon: '', grade: null };
      const rep = items.find((x) => Number(x.value) === 1) || items[0], m0 = calcMetaOf(rep.itemId);
      const alts = items.filter((x) => x !== rep).map((x) => {
        const mm = calcMetaOf(x.itemId);
        return { name: (mm && mm.name) || String(x.itemId), amount: ing.quantity, id: String(x.itemId), icon: calcIcon(mm), grade: (mm && mm.grade != null ? mm.grade : null), value: x.value };
      });
      return { name: (m0 && m0.name) || String(rep.itemId), amount: ing.quantity, id: String(rep.itemId), icon: calcIcon(m0), grade: (m0 && m0.grade != null ? m0.grade : null), value: rep.value, alt: alts };
    }
    return null;
  }
  function calcRecipesByProduct(id) { // productItemId == id 인 레시피 목록 (보통 0~1개)
    const out = [];
    try {
      const nid = Number(id);
      for (const r of (calcRecipes || [])) {
        if (r && Number(r.productItemId) === nid) out.push(r);
      }
    } catch (e) {}
    return out;
  }
  function buildCalcDetail(id) { // 1차 상세: 메타(종류·무게·가격) + 대표 레시피 (id 확정 행)
    const m = calcMetaOf(id);
    const recs = calcRecipesByProduct(id);
    const rows = [];
    if (recs.length) {
      for (const ing of (recs[0].ingredients || [])) {
        const row = calcIngToRow(ing);
        if (row) rows.push(row);
      }
    }
    const stats = [];
    if (m) {
      const cat = [m.mainCategory, m.subCategory].filter((x) => x).join(' · ');
      if (cat) stats.push('종류: ' + cat);
      if (m.weight != null && Number(m.weight) > 0) stats.push('무게: ' + m.weight + ' LT');
      try {
        if (m.buyPrice != null && Number(m.buyPrice) > 0) stats.push('구입가: ' + Number(m.buyPrice).toLocaleString('ko-KR'));
        if (m.vendorPrice != null && Number(m.vendorPrice) > 0) stats.push('판매가: ' + Number(m.vendorPrice).toLocaleString('ko-KR'));
      } catch (e) {}
    }
    return { icon: calcIcon(m), eng: '', stats, flags: [], desc: '', effects: [], hasRecipe: recs.length > 0, recipes: rows };
  }
  function parseCodexRecipe(html) { // bdocodex "- 제작 재료" 섹션 → [{ name, amount }] (이 아이템의 제작법, 정방향)
    try {
      let t = String(html || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
      t = t.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '\n');
      t = t.replace(/&nbsp;|&#160;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      const lines = t.split('\n').map((s) => s.replace(/\s+/g, ' ').trim());
      const out = [];
      let on = false;
      for (const ln of lines) {
        if (!on) { if (/^-\s*제작\s*재료/.test(ln)) on = true; continue; }
        if (!ln) continue;
        if (/^[※-]/.test(ln) || /대량 제작/.test(ln)) break;
        const m = /^(.+?)\s*x\s*(\d+)\s*$/.exec(ln);
        if (m) out.push({ name: m[1].trim(), amount: parseInt(m[2], 10) });
        else break;
      }
      return out;
    } catch (e) { return []; }
  }
  const ingCache = {}; // 재료명 -> { id, icon, grade } | null (bdolytics 검색 정확일치)
  function resolveIng(name) { // 재료명 → id/아이콘/등급 (캐시, 실패해도 null)
    name = String(name || '').trim();
    if (!name) return Promise.resolve(null);
    if (ingCache[name] !== undefined) return Promise.resolve(ingCache[name]);
    const su = BDOLY_BASE + '/api/trpc/database.searchEntities?input=' + encodeURIComponent(JSON.stringify({ searchTerm: name, language: 'ko', extendSearch: true }));
    return bdoFetch(su, 12000, BDOLY_BASE).then((txt) => {
      let found = null;
      try {
        const items = parseBdolyticsItems(String(txt || '')) || [];
        const cands = items.filter((x) => x && decHtml(String(x.name || '')) === name);
        // 동명 item 중복 시 플레이스홀더 아이콘(00000000_*)이 아닌 진짜를 우선
        found = cands.find((x) => x.icon && String(x.icon).indexOf('00000000_') < 0) || cands[0] || null;
      } catch (e) { found = null; }
      const out = found ? { id: String(found.id), icon: found.icon || '', grade: found.grade } : null;
      ingCache[name] = out;
      return out;
    });
  }
  function enrichIngs(ings) { // [{ name, amount }]에 id/icon/grade 부착 (직접 수정, 실패해도 이름은 표시)
    ings = Array.isArray(ings) ? ings : [];
    return Promise.all(ings.map((g) => {
      if (!g || g.id) return Promise.resolve(g);
      return resolveIng(g.name).then((o) => {
        if (o) { g.id = o.id; g.icon = o.icon; g.grade = o.grade; }
        return g;
      }).catch(() => g);
    }));
  }
  function normLine(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function mergeDetail(first, second) { // 1차(bdolytics)+2차(bdocodex) 합치기 — 중복 줄은 하나만
    const f = first || { stats: [], flags: [], desc: '', effects: [] };
    const s = second || { stats: [], flags: [], desc: '', effects: [] };
    const seen = {};
    (f.stats || []).concat(f.flags || []).concat(f.effects || []).forEach((x) => { const n = normLine(x); if (n) seen[n] = 1; });
    if (f.desc) { const n = normLine(f.desc); if (n) seen[n] = 1; }
    const stats = (f.stats || []).slice();
    const hasWeight = stats.some((x) => /^무게\s*:/.test(normLine(x)));
    (s.stats || []).forEach((x) => {
      const n = normLine(x);
      if (!n || seen[n]) return;
      if (hasWeight && /무\s*게\s*:|적재량\s*:/.test(n)) return; // 1차 무게와 중복
      seen[n] = 1; stats.push(x);
    });
    const flags = (f.flags || []).slice();
    (s.flags || []).forEach((x) => { const n = normLine(x); if (n && !seen[n]) { seen[n] = 1; flags.push(x); } });
    const effects = (f.effects || []).slice();
    (s.effects || []).forEach((x) => {
      const n = normLine(x);
      if (!n || seen[n]) return;
      let dup = false; // 한쪽이 다른 쪽을 포함하면 같은 내용으로 간주
      for (const k in seen) { if (k && (k.includes(n) || n.includes(k))) { dup = true; break; } }
      if (!dup) { seen[n] = 1; effects.push(x); }
    });
    let desc = f.desc || '';
    const sd = s.desc || '';
    if (sd) {
      const n1 = normLine(desc), n2 = normLine(sd);
      if (!n1) desc = sd;
      else if (n1 !== n2 && !n1.includes(n2) && !n2.includes(n1)) desc = desc + '\n' + sd;
      else if (n2.length > n1.length) desc = sd;
    }
    return { icon: f.icon || s.icon || '', eng: s.eng || f.eng || '', stats, flags, desc, effects, hasRecipe: !!(((f && f.recipes) || []).length || ((s && s.recipes) || []).length), recipes: ((f && f.recipes) || []).length ? f.recipes : ((s && s.recipes) || []) };
  }
  function parseCodexDetail(html) { // bdocodex 상세: 스탯·특성·설명·효과 (ID·구입/판매/수리비·강화 시뮬레이터 제외)
    html = String(html || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, ''); // 시세 스크립트(edescription 아님) 제거
    const card = html.split('<div class="addon_info')[0];
    let icon = '';
    const im = /<td class="icon_cell"><img src="([^"]+)"/.exec(card);
    if (im) icon = im[1].charAt(0) === '/' ? CODEX_BASE + im[1] : im[1];
    let eng = '';
    const em = /영어 이름:\s*<span[^>]*><b>([^<]+)<\/b>/.exec(card);
    if (em) eng = decHtml(em[1]);
    const stats = [];
    const tm = /<td class="titles_cell">([\s\S]*?)<\/td>/.exec(card);
    if (tm) {
      let t = tm[1];
      for (let k = 0; k < 5 && /<span class=" ?hide_me">/.test(t); k++) t = t.replace(/<span class=" ?hide_me">[\s\S]*?<\/span>/, ''); // 숨김 스탯(0 표시)은 제외
      t.split(/<br\s*\/?>/).forEach((ln) => { const s = decHtml(ln); if (s) stats.push(s); });
    }
    const flags = [];
    let desc = '';
    const effects = [];
    let bodyHtml = ''; // 본문 td (장비 페이지는 <tr>이 중첩되어 있어 가격 블록이 있는 쪽을 고름)
    try {
      let work = card;
      work = work.replace(/<div id="enchant_item_block"[\s\S]*?<\/div>/, ''); // 강화 재료 줄
      work = work.replace(/<div id="pe_block"[\s\S]*?<div id="cron_stones"[\s\S]*?<\/div>\s*<\/div>/, ''); // 퍼펙트·크론석 시뮬레이터
      work = work.replace(/일반 강화:/, ''); // 시뮬레이터 제목 잔재
      const bodies = [];
      const bre = /<tr><td colspan="2">([\s\S]*?)<\/td><\/tr>/g;
      let bmx;
      while ((bmx = bre.exec(work))) bodies.push(bmx[1]);
      for (const b of bodies) { if (/가격을 구입/.test(b)) { bodyHtml = b; break; } }
      if (!bodyHtml && bodies.length) bodyHtml = bodies[bodies.length - 1];
    } catch (e) {}
    if (bodyHtml) {
      const segs = bodyHtml.split(/<hr[^>]*>/);
      for (const sg of segs) {
        if (/가격을 구입/.test(sg)) continue; // 구입 가격·판매 가격·수리비 제외 (calculator 가격 표시)
        if (/real_price|게임 내 시장 가격|iconset_wrapper/.test(sg)) { // 시장 가격·지식 블록: 가격 줄만 빼고 지식 등은 유지
          sg.split(/<br\s*\/?>/).forEach((ln) => {
            const s = decHtml(ln);
            if (!s) return;
            if (/게임 내 시장 가격/.test(s)) return;
            if (/^KR:\s*[\d,]+/.test(s)) return;
            if (/재고:\s*[\d,]+\s*$/.test(s)) return;
            flags.push(s);
          });
          continue;
        }
        if (/id="edescription"/.test(sg) || /아이템 효과/.test(sg)) {
          sg.split(/<br\s*\/?>/).forEach((ln) => {
            const s = decHtml(ln);
            if (s && s !== '아이템 효과' && !/^[A-Z_0-9]+$/.test(s)) effects.push(s); // 섹션 제목·내부 코드만 제외, '- ...' 내용은 그대로
          });
          continue;
        }
        if (/-\s*설명/.test(sg)) {
          desc = sg.replace(/[\s\S]*?-\s*설명\s*:?/, '').split(/<br\s*\/?>/).map((ln) => decHtml(ln)).filter((s) => s).join('\n').trim();
          continue;
        }
        sg.split(/<br\s*\/?>/).forEach((ln) => { const s = decHtml(ln); if (!s) return; if (/^\s*-?\s*획득\s*시\s*귀속\s*$/.test(s)) return; flags.push(s); }); // '(-) 획득 시 귀속' 표기는 빼고 하위 내용은 유지
      }
    }
    return { icon, eng, stats, flags, desc, effects };
  }
  const selCache = {}; // [itemId] -> { t, data } 상세 캐시 (1+2차 병합 결과)
  const recipeCache = {}; // [itemId] -> { has, recipes } 제작 레시피 존재 여부 (calculator + bdocodex 기준)
  function fetchCalcDetail(id) { // 1차: calculator 메타+레시피 (상세 미리 표시 + 버튼 활성화용)
    return ensureCalcData().then((ok) => {
      if (!ok) return null;
      let d = null;
      try { d = buildCalcDetail(id); } catch (e) { d = null; }
      if (!d || (!d.stats.length && !d.icon && !d.hasRecipe)) return null;
      return d;
    }).catch(() => null);
  }
  function fetchCodexDetail(id) { // 2차: bdocodex 상세 (설명 보충 + 제작 재료, 로딩이 김)
    return bdoFetch(CODEX_BASE + '/kr/item/' + encodeURIComponent(id) + '/', 15000, CODEX_BASE).then((html) => {
      if (!html) return null;
      const d = parseCodexDetail(html);
      if (!d || (!d.stats.length && !d.flags.length && !d.desc && !d.effects.length)) return null;
      let recs = [];
      try { recs = parseCodexRecipe(html); } catch (e) { recs = []; }
      d.recipes = recs;
      d.hasRecipe = recs.length > 0;
      try { recipeCache[String(id)] = { has: recs.length > 0, recipes: recs }; } catch (e) {}
      return d;
    }).catch(() => null);
  }
  function searchLiveItem(q) {
    const run = () => {
      const su = BDOLY_BASE + '/api/trpc/database.searchEntities?input=' + encodeURIComponent(JSON.stringify({ searchTerm: q, language: 'ko', extendSearch: true }));
      let p = null;
      try { p = KW.bridge('fetch', { url: su, base: BDOLY_BASE }, 12000); } catch (e) { p = null; }
      if (!p || typeof p.then !== 'function') return Promise.resolve({ miss: true, error: '호출 실패' });
      return p.then((r) => {
      if (!r || !r.ok || !r.data || typeof r.data.html !== 'string') {
        if (r && r.maintenance) {
          if (!bdoMaintTold) { bdoMaintTold = true; try { KW.toast('검은사막 검색', '점검중입니다'); } catch (e) {} }
          return { miss: true, error: '점검중' };
        }
        return { miss: true, error: '브릿지 응답 오류' + (r && r.error ? ' (' + r.error + ')' : '') };
      }
      let items = null;
      try { items = parseBdolyticsItems(r.data.html); } catch (e) { items = null; }
      if (!items || !items.length) return { miss: true, error: '일치 항목 없음' };
      return { query: q, items };
      }).catch(() => ({ miss: true, error: '예외 발생' }));
    };
    if (KW.bridgeReady && KW.bridgeReady()) return run();
    return ensureBridge(1500).then((ok) => (ok ? run() : { miss: true, error: '브릿지 없음' }));
  }
  function openCodexDetail(id) { // 목록 클릭 → 1차(calculator) 먼저 표시 → 설명은 2차(bdocodex) 로딩 표시 후 병합
    id = String(id || '');
    if (!id) return;
    selId = id; selPhase = 'loading'; selData = null;
    try { if (typeof marketPrefetch === 'function') marketPrefetch(id); } catch (e) {}
    resKind = 'item';
    resSig = null;
    try { renderRes(); } catch (e) {}
    try { // 상세를 옆에 붙이므로 창이 좁으면 넓힘
      if (resEl && resEl.isConnected) {
        const w = resEl.getBoundingClientRect().width;
        if (w && w < 520) resEl.style.width = Math.min(560, window.innerWidth - 32) + 'px';
      }
    } catch (e) {}
    try {
      const c = selCache[id];
      const cHas = c && c.data && typeof c.data.hasRecipe === 'boolean';
      if (c && Date.now() - c.t < 3600000 && cHas) { selPhase = 'ok'; selData = c.data; resSig = null; try { renderRes(); } catch (e) {} return; }
    } catch (e) {}
    fetchCalcDetail(id).then((d1) => {
      if (selId !== id) return; // 다른 항목으로 넘어감
      if (!d1) { // 1차가 비면 2차만 시도
        fetchCodexDetail(id).then((d2) => {
          if (selId !== id) return;
          if (d2) { selPhase = 'ok'; selData = d2; try { selCache[id] = { t: Date.now(), data: d2 }; } catch (e) {} }
          else selPhase = 'miss';
          resSig = null;
          try { renderRes(); } catch (e2) {}
        });
        return;
      }
      selPhase = 'loading-desc'; selData = mergeDetail(d1, null); selData.descState = 'loading';
      resSig = null;
      try { renderRes(); } catch (e) {}
      setTimeout(() => { // 2차 무한 대기 방지: 20초 넘으면 실패 박스로 확정
        try {
          if (selId !== id || !selData || selData.descState !== 'loading') return;
          selData.descState = 'fail';
          resSig = null;
          renderRes();
        } catch (e) {}
      }, 20000);
      fetchCodexDetail(id).then((d2) => {
        if (selId !== id) return; // 다른 항목으로 넘어감
        const merged = mergeDetail(d1, d2);
        merged.descState = d2 ? 'ok' : 'fail';
        selPhase = 'ok'; selData = merged;
        try { selCache[id] = { t: Date.now(), data: merged }; } catch (e) {}
        resSig = null;
        try { renderRes(); } catch (e2) {}
      });
    });
  }
  function startLive(kind, q) {
    const isGuild = kind === 'guild', isItem = kind === 'item';
    const upd = updateRes;
    const ren = renderRes;
    const getLive = () => (isGuild ? liveGuild : isItem ? liveItem : liveFam);
    const setLive = (v) => { if (isGuild) liveGuild = v; else if (isItem) liveItem = v; else liveFam = v; };
    const bump = () => { if (isGuild) liveGuildRev++; else if (isItem) liveItemRev++; else liveFamRev++; };
    const hit = liveCached(kind, q);
    if (hit) { setLive({ kind, q, phase: 'ok', data: hit }); }
    else {
      const cur = { kind, q, phase: 'loading', data: null };
      setLive(cur);
      // 안전망: 20초 안에 응답이 없으면 miss로 확정 (무한 로딩 방지)
      try {
        setTimeout(() => {
          try {
            if (getLive() !== cur) return;
            setLive({ kind, q, phase: 'miss', data: { miss: true, timeout: true } });
            bump(); resSig = null; renderRes();
          } catch (e) {}
        }, 20000);
      } catch (e) {}
      let run = null;
      try { run = isGuild ? searchLiveGuild(q) : isItem ? searchLiveItem(q) : searchLiveFam(q); } catch (e) { run = null; }
      if (!run || typeof run.then !== 'function') {
        setLive({ kind, q, phase: 'miss', data: { miss: true, error: '호출 실패' } });
      } else {
      run.then((data) => {
        if (getLive() !== cur) return; // 같은 종류의 다른 검색으로 넘어감
        if (data && !data.miss) {
          setLive({ kind, q, phase: 'ok', data });
          try { liveCache[kind + ':' + q] = { t: Date.now(), data }; } catch (e) {}
        } else {
          setLive({ kind, q, phase: 'miss', data: (data && data.miss) ? data : null }); // 실패 사유(error) 유지
        }
        bump();
        resSig = null;
        try { ren(); } catch (e2) {}
      });
      }
    }
    bump();
    upd(Date.now());
  }
  function recipeBtnHtml(nm, icon) { // 제작 레시피 버튼 3상태 (거래소 버튼 아래)
    if (!selId || selPhase === 'miss') return '';
    const base = 'margin-top:8px;width:100%;box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:6px;border-radius:8px;padding:6px;font-size:11px;font-weight:bold;';
    const cv = recipeCache[selId];
    const v = (selData && typeof selData.hasRecipe === 'boolean') ? selData.hasRecipe
      : (cv && typeof cv === 'object' ? !!cv.has : cv);
    if (v === true) return '<button data-recipe-id="' + esc(selId) + '" data-recipe-name="' + esc(nm || itemResQ || '제작 레시피') + '" data-recipe-icon="' + esc(icon || '') + '" title="제작 레시피 보기" style="' + base + 'background:rgba(122,184,255,.08);border:1px solid rgba(122,184,255,.35);color:#7ab8ff;cursor:pointer">제작 레시피 보기</button>';
    if (v === false) return '<button disabled title="레시피 존재 하지 않음" style="' + base + 'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.14);color:#777;cursor:default">레시피 존재 하지 않음</button>';
    return '<button disabled title="레시피 확인 중" style="' + base + 'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.14);color:#888;cursor:default">레시피 확인 중...</button>';
  }
