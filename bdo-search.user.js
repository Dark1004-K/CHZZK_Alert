// ==UserScript==
// @name         bdo-blackdesert
// @namespace    https://chzzk.naver.com/
// @version      1.0.1
// @description  검은사막 공식 홈페이지 검색을 GM_xmlhttpRequest로 호출해 CORS 없이 치지직 페이지에 전달합니다. 본체(CHZZK 채팅 호출 알림)의 동반 스크립트입니다.
// @author       DarkAngel
// @license      Proprietary - All rights reserved
// @match        https://chzzk.naver.com/live/*
// @grant        GM_xmlhttpRequest
// @connect      www.kr.playblackdesert.com
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/Dark1004-K/Chzzk_Alert/main/bdo-search.user.js
// @updateURL    https://raw.githubusercontent.com/Dark1004-K/Chzzk_Alert/main/bdo-search.user.js
// ==/UserScript==

// 동반 스크립트 사용법:
//  1. 이 스크립트를 Tampermonkey에 설치 (본체와 별개, 1회)
//  2. 본체는 CustomEvent 브릿지로 호출: detail { id, kind, params }
//     - kind: 'famSearch' {keyword} | 'charSearch' {keyword} | 'famProfile' {target}
//             'guildSearch' {keyword, page} | 'guildProfile' {guildName}
//     - 응답: 'bdo-search-res' { id, ok, data?, error?, maintenance? }
//  3. 준비 신호: 'bdo-search-ready' { version, name }. 본체가 'bdo-search-ping'을 보내면 다시 응답.
//  4. 콘솔 테스트: window.bdoSearch.searchGuild('미리내') 등.
// 파서 정본: scripts/crawl-adventurers.js, scripts/crawl-guilds.js (이 파일과 동기화 유지)
(function () {
  'use strict';
  const VERSION = '1.0.1';
  // 호출 측(플러그인)이 params.base 로 대상 사이트를 지정할 수 있다.
  // 반드시 아래 허용 목록 안에 있어야 하며, 새 사이트 추가時は @connect 도 함께 추가해야 한다.
  const ALLOWED_BASES = [
    'https://www.kr.playblackdesert.com',
  ];
  const DEFAULT_BASE = ALLOWED_BASES[0];
  function pickBase(req) {
    try {
      const b = String(req || '').replace(/\/+$/, '');
      if (ALLOWED_BASES.includes(b)) return b;
    } catch (e) {}
    return DEFAULT_BASE;
  }
  const TIMEOUT = 15000;

  const decode = (s) => String(s)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

  function xhr(url) {
    return new Promise((resolve, reject) => {
      try {
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          timeout: TIMEOUT,
          onload: (res) => {
            if (res.status === 200) return resolve(res.responseText);
            reject({ maintenance: res.status === 503 || res.status >= 500, error: 'HTTP ' + res.status });
          },
          onerror: () => reject({ error: 'network' }),
          ontimeout: () => reject({ error: 'timeout' }),
        });
      } catch (e) { reject({ error: String((e && e.message) || e) }); }
    });
  }

  // 점검 페이지 판별 (제목·본문 문구)
  function isMaintenance(html) {
    try {
      const t = /<title>([^<]*)<\/title>/i.exec(html || '');
      if (t && /점검|maintenance/i.test(t[1])) return true;
      return /서비스\s*점검|정기\s*점검|임시\s*점검/.test(String(html || '').slice(0, 20000));
    } catch (e) { return false; }
  }

  async function guarded(url) {
    const html = await xhr(url);
    if (isMaintenance(html)) {
      const e = new Error('maintenance');
      e.maintenance = true;
      throw e;
    }
    return html;
  }

  // --- 가문/캐릭터 검색 행 (정확히 일치 + 목록). 파서 정본: scripts/crawl-adventurers.js
  function adventurerRows(html) {
    const out = [];
    const re = /<a href="([^"]*?Profile\?profileTarget=([^"&]+))"[^>]*>([^<]+)<\/a>/g;
    let m;
    while ((m = re.exec(html))) {
      out.push({ family: decode(m[3]), profileTarget: decode(m[2]) });
    }
    return out;
  }

  // --- 가문 프로필. 파서 정본: scripts/crawl-adventurers.js
  function lineList(html, title) {
    const re = new RegExp('<span class="title">' + title + '<\\/span>([\\s\\S]*?)<\\/li>');
    const m = re.exec(html);
    if (!m) return null;
    if (/<em class="lock">/.test(m[1])) return null;
    const t = decode(m[1]);
    return t || null;
  }

  function parseFamilyProfile(html) {
    const created = lineList(html, '가문생성일');
    const guild = lineList(html, '가입길드');
    const characters = [];
    const liRe = /<p class="character_name">([\s\S]*?)<\/p>\s*<p class="character_info">([\s\S]*?)<\/p>/g;
    let m;
    while ((m = liRe.exec(html))) {
      const main = /대표캐릭터/.test(m[1]);
      const name = decode(m[1].replace(/대표캐릭터/g, ''));
      if (!name) continue;
      const cm = /<em>([^<>]+)<\/em>/.exec(m[2]);
      let level = null;
      const lm = /Lv(?:<em class="lock">[^<]*<\/em>|(\d+))/.exec(m[2]);
      if (lm && lm[1]) level = parseInt(lm[1], 10);
      characters.push({ name, class: cm ? decode(cm[1]) : '', level, main });
    }
    return { created, guild, characters };
  }

  // --- 길드 검색 행. 파서 정본: scripts/crawl-guilds.js
  function guildRows(html) {
    const out = [];
    const liRe = /<li>([\s\S]*?)<\/li>/g;
    let m;
    while ((m = liRe.exec(html))) {
      const block = m[1];
      const lm = /<a href="\/Adventure\/Guild\/GuildProfile\?[^"]*"[^>]*>([^<]+)<\/a>/.exec(block);
      if (!lm) continue; // 헤더행 등 링크 없는 줄 제외
      const mm = /<div class="guild_info">[\s\S]*?<a[^>]*>([^<]+)<\/a>/.exec(block);
      const dm = /<div class="date[^"]*">([^<]*)<\/div>/.exec(block);
      const cm = /<div class="member">([^<]*)<\/div>/.exec(block);
      out.push({ guild: decode(lm[1]), master: mm ? decode(mm[1]) : '', created: dm ? decode(dm[1]) : '', members: cm ? decode(cm[1]) : '' });
    }
    return out;
  }

  // --- 길드 프로필. 파서 정본: scripts/crawl-guilds.js
  function parseGuildProfile(html) {
    const created = lineList(html, '길드생성일');
    let master = null;
    const mm = /<span class="title">대장<\/span>[\s\S]*?<a[^>]*>([^<]+)<\/a>/.exec(html);
    if (mm) master = decode(mm[1]);
    let members = null;
    const cm = /<span class="title">인원<\/span>[\s\S]*?<em>(\d+)<\/em>\s*명/.exec(html);
    if (cm) members = parseInt(cm[1], 10);
    let siege = null;
    const sm = /점령현황<\/span>([\s\S]{0,300})/.exec(html);
    if (sm) siege = decode(sm[1]) || null;
    const boxIdx = html.indexOf('구성원</h3>');
    const box = boxIdx >= 0 ? html.slice(boxIdx) : html;
    const memberList = [];
    const seen = {};
    const re = /<a href="[^"]*Profile\?profileTarget=([^"&]+)"[^>]*>([^<]+)<\/a>/g;
    let m;
    while ((m = re.exec(box))) {
      const family = decode(m[2]);
      if (!family || seen[family]) continue;
      seen[family] = 1;
      memberList.push({ family, profileTarget: decode(m[1]), role: master && family === master ? '대장' : '' });
    }
    return { created, master, members, siege, memberList };
  }

  const api = {
    async famSearch(base, keyword) {
      const html = await guarded(base + '/ko-KR/Adventure?searchType=2&checkSearchText=False&searchKeyword=' + encodeURIComponent(keyword));
      return adventurerRows(html).filter((r) => r.family === keyword);
    },
    async charSearch(base, keyword) {
      const html = await guarded(base + '/ko-KR/Adventure?searchType=1&checkSearchText=False&searchKeyword=' + encodeURIComponent(keyword));
      return adventurerRows(html);
    },
    async famProfile(base, target) {
      const html = await guarded(base + '/Adventure/Profile?profileTarget=' + target);
      return parseFamilyProfile(html);
    },
    async guildSearch(base, keyword, page) {
      const html = await guarded(base + '/ko-KR/Adventure/Guild?searchText=' + encodeURIComponent(keyword) + '&page=' + (page || 1));
      return guildRows(html).filter((r) => r.guild && r.guild.includes(keyword));
    },
    async guildProfile(base, guildName) {
      const params = 'guildName=' + encodeURIComponent(guildName) + '&region=KR';
      const html = await guarded(base + '/Adventure/Guild/GuildProfile?' + params);
      return parseGuildProfile(html);
    },
  };

  async function handle(kind, params) {
    params = params || {};
    const base = pickBase(params.base);
    switch (kind) {
      case 'famSearch': return api.famSearch(base, params.keyword || '');
      case 'charSearch': return api.charSearch(base, params.keyword || '');
      case 'famProfile': return api.famProfile(base, params.target || '');
      case 'guildSearch': return api.guildSearch(base, params.keyword || '', params.page || 1);
      case 'guildProfile': return api.guildProfile(base, params.guildName || '');
      default: throw { error: 'unknown kind: ' + kind };
    }
  }

  function emit(name, detail) {
    try { document.dispatchEvent(new CustomEvent(name, { detail })); } catch (e) {}
  }

  document.addEventListener('bdo-search-req', (ev) => {
    const d = (ev && ev.detail) || {};
    if (!d || !d.id || !d.kind) return;
    Promise.resolve()
      .then(() => handle(d.kind, d.params))
      .then((data) => emit('bdo-search-res', { id: d.id, ok: true, data }))
      .catch((e) => emit('bdo-search-res', {
        id: d.id,
        ok: false,
        error: String((e && (e.error || e.message)) || e),
        maintenance: !!(e && e.maintenance),
      }));
  });
  // 동반 스크립트 이름: 메타데이터 우선, 없으면 폴백
  function scriptName() {
    try {
      if (typeof GM_info === 'object' && GM_info && GM_info.script && GM_info.script.name) return String(GM_info.script.name);
    } catch (e) {}
    return 'bdo-blackdesert';
  }
  function readyDetail() { return { version: VERSION, name: scriptName() }; }
  document.addEventListener('bdo-search-ping', () => emit('bdo-search-ready', readyDetail()));

  // 콘솔 테스트용 직접 호출 (base 생략 시 기본 사이트)
  const bdoSearch = {
    version: VERSION,
    searchAdventurer: (keyword, searchType, base) => api[searchType === 1 ? 'charSearch' : 'famSearch'](base || DEFAULT_BASE, keyword),
    searchGuild: (keyword, page, base) => api.guildSearch(base || DEFAULT_BASE, keyword, page),
    getFamily: (target, base) => api.famProfile(base || DEFAULT_BASE, target),
    getGuild: (guildName, base) => api.guildProfile(base || DEFAULT_BASE, guildName),
  };
  try { window.bdoSearch = bdoSearch; } catch (e) {}
  emit('bdo-search-ready', readyDetail());
  try { console.log('[bdo-blackdesert] 로드됨 v' + VERSION + '. window.bdoSearch.searchGuild("미리내") 로 테스트 가능'); } catch (e) {}
})();
