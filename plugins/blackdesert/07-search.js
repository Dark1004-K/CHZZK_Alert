  // ---------- 검색 결과창 (단일 창 + 종류탭 + 아이템 드릴다운) ----------
  // 가문·길드·아이템이 하나의 창을 공유. 탭으로 전환, 아이템은 목록→상세로 파고듦.
  const LS_RESPOS = '__kw_family_r_pos'; // 기존 가문 결과창 위치 승계
  const LS_RESH = '__kw_family_r_h';
  const RES_H_DEF = 300, RES_H_MIN = 120;
  const resHMax = () => Math.max(RES_H_MIN, window.innerHeight);
  let resH = RES_H_DEF;
  try { const rhv = parseInt(localStorage.getItem(LS_RESH), 10); if (rhv >= RES_H_MIN && rhv <= 4000) resH = rhv; } catch (e) {}
  let resEl = null, resSig = null;
  let resKind = 'fam'; // 'fam' | 'guild' | 'item' (현재 탭)
  let famResQ = ''; // 결과창 가문 검색어
  let guildResQ = ''; // 결과창 길드 검색어
  let itemResQ = ''; // 결과창 아이템 검색어
  let selId = null, selPhase = '', selData = null; // 옆 상세 pane: 선택된 아이템 (null=목록만)
  function removeRes() {
    if (resEl) { try { resEl.remove(); } catch (e) {} }
    resEl = null;
    resSig = null;
    marketData = null; marketPhase = 'idle'; // 결과창이 닫히면 현황창도 함께 닫음
    try { if (typeof removeMarket === 'function') removeMarket(); } catch (e) {}
    try { removeRecipe(); } catch (e) {}
  }
  // 결과창 위치: 저장된 곳, 없으면 검색창 오른쪽
  function placeRes() {
    if (!resEl) return;
    let done = false;
    try {
      const o = JSON.parse(localStorage.getItem(LS_RESPOS));
      if (o && isFinite(o.x) && isFinite(o.y)) {
        const w = isFinite(o.w) ? Math.max(225, Math.min(600, Math.round(o.w))) : 300;
        resEl.style.position = 'fixed';
        resEl.style.left = Math.max(0, Math.min(window.innerWidth - w, o.x)) + 'px';
        resEl.style.top = Math.max(0, Math.min(window.innerHeight - 100, o.y)) + 'px';
        resEl.style.bottom = 'auto';
        resEl.style.width = w + 'px';
        done = true;
      }
    } catch (e) {}
    if (done) return;
    try {
      const r = famEl && famEl.isConnected ? famEl.getBoundingClientRect() : null;
      const w = 300;
      resEl.style.position = 'fixed';
      resEl.style.width = w + 'px';
      resEl.style.bottom = 'auto';
      if (r && r.width > 0) {
        resEl.style.left = Math.max(0, Math.min(window.innerWidth - w, Math.round(r.right + 8))) + 'px';
        resEl.style.top = Math.max(0, Math.min(window.innerHeight - 100, Math.round(r.top))) + 'px';
      } else {
        resEl.style.left = Math.max(0, window.innerWidth - w - 16) + 'px';
        resEl.style.top = '70px';
      }
    } catch (e2) {}
  }
  // ---------- 실시간 검색 (동반 브릿지 fetch + 플러그인 파싱) ----------
  const BDO_BASE = 'https://www.kr.playblackdesert.com';
  // 동반이 뒤늦게 깔리거나 load 시점 ready를 놓치면 검색이 '브릿지 없음'으로 끝나버린다. 그때는 ping 후 잠깐 기다렸다가 다시 확인.
  function ensureBridge(waitMs) {
    if (KW.bridgeReady && KW.bridgeReady()) return Promise.resolve(true);
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        try { clearTimeout(to); } catch (e) {}
        try { document.removeEventListener('bdo-search-ready', onReady); } catch (e) {}
        resolve(v);
      };
      function onReady() { finish(true); }
      const to = setTimeout(() => finish(!!(KW.bridgeReady && KW.bridgeReady())), waitMs || 1500);
      try { document.addEventListener('bdo-search-ready', onReady); } catch (e) {}
      try { document.dispatchEvent(new CustomEvent('bdo-search-ping', {})); } catch (e) {}
    });
  }
  let bdoMaintTold = false;
  const decHtml = (s) => String(s)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  const CODEX_BASE = 'https://bdocodex.com'; // 아이템 상세 설명 (2차)
  const BDOLY_BASE = 'https://bdolytics.com'; // 아이템 목록·상세 (1차)
  const BDOLY_IMG = 'https://cdn.questlog.gg/black-desert'; // bdolytics 아이콘 호스트 (API의 /assets/... 를 앞에 붙임)
  const CODEX_GRADE = { 0: '#c8c8c8', 1: '#3fb950', 2: '#58a6ff', 3: '#bc8cff', 4: '#f0883e' }; // 등급별 이름 색
  function bdoFetch(url, timeoutMs, base) {
    const call = () => KW.bridge('fetch', { url, base: base || BDO_BASE }, timeoutMs || 12000).then((r) => {
      if (!r || !r.ok || !r.data || typeof r.data.html !== 'string') {
        if (r && r.maintenance) {
          if (!bdoMaintTold) { bdoMaintTold = true; try { KW.toast('검은사막 검색', '점검중입니다'); } catch (e) {} }
        }
        return null;
      }
      return r.data.html;
    }).catch(() => null);
    if (KW.bridgeReady && KW.bridgeReady()) return call();
    return ensureBridge(1500).then((ok) => (ok ? call() : null)); // 뒤늦은 동반 대비 ping 후 재확인
  }
  function famRowsOf(html) {
    const out = [];
    const re = /<a href="([^"]*?Profile\?profileTarget=([^"&]+))"[^>]*>([^<]+)<\/a>/g;
    let m;
    while ((m = re.exec(html))) out.push({ family: decHtml(m[3]), profileTarget: decHtml(m[2]) });
    return out;
  }
  function lineListOf(html, title) {
    const re = new RegExp('<span class="title">' + title + '<\\/span>([\\s\\S]*?)<\\/li>');
    const m = re.exec(html);
    if (!m) return null;
    if (/<em class="lock">/.test(m[1])) return null;
    const t = decHtml(m[1]);
    return t || null;
  }
  function parseFamHtml(html) {
    const created = lineListOf(html, '가문생성일');
    const guild = lineListOf(html, '가입길드');
    const characters = [];
    const liRe = /<p class="character_name">([\s\S]*?)<\/p>\s*<p class="character_info">([\s\S]*?)<\/p>/g;
    let m;
    while ((m = liRe.exec(html))) {
      const main = /대표캐릭터/.test(m[1]);
      const name = decHtml(m[1].replace(/대표캐릭터/g, ''));
      if (!name) continue;
      const cm = /<em>([^<>]+)<\/em>/.exec(m[2]);
      let level = null;
      const lm = /Lv(?:<em class="lock">[^<]*<\/em>|(\d+))/.exec(m[2]);
      if (lm && lm[1]) level = parseInt(lm[1], 10);
      characters.push({ name, class: cm ? decHtml(cm[1]) : '', level, main });
    }
    return { created, guild, characters };
  }
  function guildRowsOf(html) {
    const out = [];
    const liRe = /<li>([\s\S]*?)<\/li>/g;
    let m;
    while ((m = liRe.exec(html))) {
      const block = m[1];
      const lm = /<a href="\/Adventure\/Guild\/GuildProfile\?[^"]*"[^>]*>([^<]+)<\/a>/.exec(block);
      if (!lm) continue;
      const mm = /<div class="guild_info">[\s\S]*?<a[^>]*>([^<]+)<\/a>/.exec(block);
      const dm = /<div class="date[^"]*">([^<]*)<\/div>/.exec(block);
      const cm = /<div class="member">([^<]*)<\/div>/.exec(block);
      out.push({ guild: decHtml(lm[1]), master: mm ? decHtml(mm[1]) : '', created: dm ? decHtml(dm[1]) : '', members: cm ? decHtml(cm[1]) : '' });
    }
    return out;
  }
  function parseGuildHtml(html) {
    const created = lineListOf(html, '길드생성일');
    let master = null;
    const mm = /<span class="title">대장<\/span>[\s\S]*?<a[^>]*>([^<]+)<\/a>/.exec(html);
    if (mm) master = decHtml(mm[1]);
    let members = null;
    const cm = /<span class="title">인원<\/span>[\s\S]*?<em>(\d+)<\/em>\s*명/.exec(html);
    if (cm) members = parseInt(cm[1], 10);
    let siege = null;
    const sm = /점령현황<\/span>([\s\S]{0,300})/.exec(html);
    if (sm) siege = decHtml(sm[1]) || null;
    const boxIdx = html.indexOf('구성원</h3>');
    const box = boxIdx >= 0 ? html.slice(boxIdx) : html;
    const memberList = [];
    const seen = {};
    const re = /<a href="[^"]*Profile\?profileTarget=([^"&]+)"[^>]*>([^<]+)<\/a>/g;
    let m;
    while ((m = re.exec(box))) {
      const family = decHtml(m[2]);
      if (!family || seen[family]) continue;
      seen[family] = 1;
      memberList.push({ family, profileTarget: decHtml(m[1]), role: master && family === master ? '대장' : '' });
    }
    return { created, master, members, siege, memberList };
  }
  let liveFamRev = 0, liveGuildRev = 0, liveItemRev = 0;
  let liveFam = null, liveGuild = null, liveItem = null; // { kind, q, phase:'loading'|'ok'|'miss', data } — 가문·길드·아이템 독립 (공유 시 한쪽 검색이 다른 쪽 결과를 덮음)
  const liveCache = {}; // "kind:Q" -> { t, data }
  function liveCached(kind, q) {
    try {
      const c = liveCache[kind + ':' + q];
      if (c && Date.now() - c.t < 3600000) return c.data;
    } catch (e) {}
    return null;
  }
  function searchLiveFam(q) {
    if (!KW.bridgeReady || !KW.bridgeReady()) return Promise.resolve(null);
    const su = BDO_BASE + '/ko-KR/Adventure?searchType=2&checkSearchText=False&searchKeyword=' + encodeURIComponent(q);
    return bdoFetch(su, 12000).then((html) => {
      if (!html) return null;
      const row = famRowsOf(html).find((x) => x && x.family === q) || null;
      if (!row || !row.profileTarget) return { miss: true };
      return bdoFetch(BDO_BASE + '/Adventure/Profile?profileTarget=' + row.profileTarget, 12000).then((ph) => {
        if (!ph) return null;
        const p = parseFamHtml(ph);
        if (!p.characters.length) return null;
        return { family: row.family, created: p.created, guild: p.guild, characters: p.characters };
      });
    }).catch(() => null);
  }
  function searchLiveGuild(q) {
    if (!KW.bridgeReady || !KW.bridgeReady()) return Promise.resolve(null);
    const su = BDO_BASE + '/ko-KR/Adventure/Guild?searchText=' + encodeURIComponent(q) + '&page=1';
    return bdoFetch(su, 12000).then((html) => {
      if (!html) return null;
      const row = guildRowsOf(html).find((x) => x && x.guild === q) || null;
      if (!row) return { miss: true };
      const params = 'guildName=' + encodeURIComponent(row.guild) + '&region=KR';
      return bdoFetch(BDO_BASE + '/Adventure/Guild/GuildProfile?' + params, 12000).then((ph) => {
        if (!ph) return null;
        const p = parseGuildHtml(ph);
        if (!p.memberList.length) return null;
        return { guild: row.guild, created: p.created, master: p.master || row.master || null, members: (p.members != null ? p.members : (parseInt(row.members, 10) || null)), siege: p.siege, memberList: p.memberList };
      });
    }).catch(() => null);
  }
  function parseBdolyticsItems(text) { // bdolytics 목록: {result:{data:[{id,name(icon 상대경로),grade,dbType}]}} — dbType:"item"만
    let j = null;
    try { j = JSON.parse(text); } catch (e) { return null; }
    const rows = (j && j.result && Array.isArray(j.result.data)) ? j.result.data : [];
    const out = [];
    for (const r of rows) {
      if (!r || r.dbType !== 'item') continue;
      const id = String((r.id == null ? '' : r.id));
      if (!id) continue;
      let iconUrl = String(r.icon || '');
      if (iconUrl && iconUrl.charAt(0) === '/') iconUrl = BDOLY_IMG + iconUrl;
      let grade = null;
      try { grade = (r.grade == null || r.grade === '' ? null : parseInt(r.grade, 10)); if (!isFinite(grade)) grade = null; } catch (e) { grade = null; }
      out.push({
        id,
        name: decHtml(String(r.name || '')),
        icon: iconUrl,
        href: BDOLY_BASE + '/ko/db/item/' + encodeURIComponent(id),
        grade,
      });
    }
    return out;
  }
