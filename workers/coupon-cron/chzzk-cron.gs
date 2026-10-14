// Google Apps Script — 치지직 알림 크론 (쿠폰 + 보스 + 이벤트, 한 프로젝트)
// 같은 프로젝트에 이 파일 1개만 넣는다.
//
// 설치:
//   1. script.google.com → 새 프로젝트 → 이 파일 내용 전체 붙여넣기
//   2. 아래 GITHUB_TOKEN에 토큰 입력 (GitHub Fine-grained PAT, 대상 repo CHZZK_Alert 1개,
//      Contents 읽기/쓰기 + Issues 읽기/쓰기) 후 저장(Ctrl+S)
//   3. couponsCrawl() 1회 실행 → 권한 승인 → 로그에 변경 없음 또는 갱신 확인
//   4. bossCheck() 1회 실행 → 로그에 변경 없음 또는 상태 처음 기록 확인
//   5. eventsCrawl() 1회 실행 → 로그에 변경 없음 또는 갱신 확인
//   6. 트리거 추가 3개:
//      - couponsCrawl / 시간 기반 / 시간 타이머 / 매시간 (매시 00분 무렵)
//      - bossCheck / 시간 기반 / 주 타이머 / 수요일 / 12시~13시
//      - eventsCrawl / 시간 기반 / 주 타이머 / 수요일 / 12시~13시 (보스와 동일)
//   7. 프로젝트 시간대 확인: 왼쪽 톱니 → (GMT+09:00) 서울

const GITHUB_TOKEN = ''; // ← 여기에 토큰 붙여넣기
const OWNER = 'Dark1004-K';
const REPO = 'CHZZK_Alert';
const PATH = 'coupons.json';
const SOURCE = 'https://www.kr.playblackdesert.com/ko-KR/News/Detail?groupContentNo=10748';
function decode_(s) {
  return String(s)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}
function parseExpire_(text) {
  const m = /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일(?:\([^)]*\))?\s*(\d{1,2}):(\d{2})/.exec(text);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3], h = +m[4], mi = +m[5];
  return Date.UTC(y, mo - 1, d, h, mi) - 9 * 3600 * 1000;
}
function parse_(html) {
  const start = html.indexOf('editor_area');
  if (start < 0) throw new Error('본문(editor_area)을 찾지 못함');
  const body = html.slice(start);
  const re = /<h3[^>]*glance_subject_title[^>]*>([\s\S]*?)<\/h3>|<span class="js-couponNumber">([^<]*)<\/span>|<p[^>]*glance_reward_detail_text[^>]*>([\s\S]*?)<\/p>|쿠폰 유효 기간\s*:\s*([^<]+)</g;
  const coupons = [];
  let title = '';
  let cur = null;
  let m;
  while ((m = re.exec(body))) {
    if (m[1] !== undefined) {
      const t = decode_(m[1]);
      if (t && !/쿠폰을 한눈에|풍성한 보상/.test(t)) title = t;
    } else if (m[2] !== undefined) {
      cur = { name: title, code: decode_(m[2]), rewards: [], expires: '', expiresAt: null };
      coupons.push(cur);
      title = '';
    } else if (m[3] !== undefined) {
      const r = decode_(m[3]);
      if (cur && r) cur.rewards.push(r);
    } else if (m[4] !== undefined) {
      if (cur && !cur.expires) {
        // "정기점검 전"은 통상 그날 오전 05:00
        cur.expires = decode_(m[4]).replace(/정기점검\s*전/g, '05:00');
        cur.expiresAt = parseExpire_(cur.expires);
      }
    }
  }
  return coupons.filter(function (c) { return c.code; });
}

function couponsCrawl() {
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN을 입력하세요 (코드 맨 위)');
  const gh = { 'Authorization': 'Bearer ' + GITHUB_TOKEN, 'Accept': 'application/vnd.github+json', 'User-Agent': 'ChzzkAlertCouponBot' };
  // 1) 공식 페이지 읽기 (최대 3회 재시도)
  let html = '';
  let lastErr = null;
  for (let a = 1; a <= 3; a++) {
    try {
      const res = UrlFetchApp.fetch(SOURCE, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChzzkAlertCouponBot)', 'Accept-Language': 'ko-KR' },
        muteHttpExceptions: true,
      });
      if (res.getResponseCode() !== 200) throw new Error('HTTP ' + res.getResponseCode());
      html = res.getContentText('UTF-8');
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      if (a < 3) Utilities.sleep(3000 * a);
    }
  }
  if (lastErr) throw lastErr;
  const coupons = parse_(html);
  if (!coupons.length) throw new Error('쿠폰을 하나도 읽지 못함 (페이지 구조가 바뀌었을 수 있음)');
  // 2) 현재 파일과 비교 (다를 때만 커밋)
  const cur = UrlFetchApp.fetch(
    'https://api.github.com/repos/' + OWNER + '/' + REPO + '/contents/' + PATH + '?ref=main',
    { headers: gh, muteHttpExceptions: true }
  );
  if (cur.getResponseCode() !== 200) throw new Error('GitHub API ' + cur.getResponseCode());
  const curJson = JSON.parse(cur.getContentText());
  let same = false;
  try {
    const prev = JSON.parse(Utilities.newBlob(Utilities.base64Decode(curJson.content)).getDataAsString());
    same = JSON.stringify(prev.coupons) === JSON.stringify(coupons);
  } catch (e) {}
  if (same) {
    Logger.log('[쿠폰] 변경 없음 (' + coupons.length + '개)');
    return;
  }
  // 3) 커밋
  const out = { source: SOURCE, updatedAt: Date.now(), coupons: coupons };
  const body = JSON.stringify({
    message: 'chore: update coupons.json',
    content: Utilities.base64Encode(Utilities.newBlob(JSON.stringify(out, null, 2) + '\n').getBytes()),
    sha: curJson.sha,
  });
  const put = UrlFetchApp.fetch(
    'https://api.github.com/repos/' + OWNER + '/' + REPO + '/contents/' + PATH,
    { method: 'put', headers: gh, contentType: 'application/json', payload: body, muteHttpExceptions: true }
  );
  if (put.getResponseCode() !== 200 && put.getResponseCode() !== 201) {
    throw new Error('커밋 실패 HTTP ' + put.getResponseCode() + ': ' + put.getContentText().slice(0, 200));
  }
  Logger.log('[쿠폰] coupons.json 갱신 (' + coupons.length + '개)');
}

function bossCheck() {
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN을 입력하세요 (코드 맨 위)');
  const gh = { 'Authorization': 'Bearer ' + GITHUB_TOKEN, 'Accept': 'application/vnd.github+json', 'User-Agent': 'ChzzkAlertBossScheduleBot' };
  const SRC = 'https://www.kr.playblackdesert.com/ko-kr/Wiki?wikiNo=167';
  const STATE_PATH = 'data/boss-schedule-state.json';
  // 1) 위키 읽기 (최대 3회 재시도)
  let html = '';
  let lastErr = null;
  for (let a = 1; a <= 3; a++) {
    try {
      const res = UrlFetchApp.fetch(SRC, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChzzkAlertBossScheduleBot)', 'Accept-Language': 'ko-KR' },
        muteHttpExceptions: true,
      });
      if (res.getResponseCode() !== 200) throw new Error('HTTP ' + res.getResponseCode());
      html = res.getContentText('UTF-8');
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      if (a < 3) Utilities.sleep(3000 * a);
    }
  }
  if (lastErr) throw lastErr;
  const area = html.indexOf('detail_wrap editor_area');
  if (area < 0) throw new Error('본문을 찾지 못함 (페이지 구조가 바뀌었을 수 있음)');
  const img = /<img[^>]+src="([^"]+)"/.exec(html.slice(area));
  if (!img) throw new Error('시간표 이미지를 찾지 못함');
  const imageUrl = img[1];
  const mod = /최근 수정 일시\s*:\s*([0-9.]+\s*[0-9:]+)/.exec(html);
  const modified = mod ? mod[1].replace(/\s+/g, ' ').trim() : '';
  const state = { source: SRC, imageUrl: imageUrl, modified: modified, checkedAt: Date.now() };
  // 2) 저장된 상태 읽기 (없으면 처음 기록)
  const api = 'https://api.github.com/repos/' + OWNER + '/' + REPO + '/contents/' + STATE_PATH;
  const cur = UrlFetchApp.fetch(api + '?ref=main', { headers: gh, muteHttpExceptions: true });
  if (cur.getResponseCode() === 404) {
    UrlFetchApp.fetch(api, {
      method: 'put', headers: gh, contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({
        message: 'chore: update boss schedule state',
        content: Utilities.base64Encode(Utilities.newBlob(JSON.stringify(state, null, 2) + '\n').getBytes()),
      }),
    });
    Logger.log('[보스] 상태 처음 기록 (' + modified + ')');
    return;
  }
  if (cur.getResponseCode() !== 200) throw new Error('GitHub API ' + cur.getResponseCode());
  const curJson = JSON.parse(cur.getContentText());
  let prev = null;
  try {
    prev = JSON.parse(Utilities.newBlob(Utilities.base64Decode(curJson.content)).getDataAsString());
  } catch (e) {}
  if (prev && prev.imageUrl === imageUrl && prev.modified === modified) {
    Logger.log('[보스] 변경 없음 (' + modified + ')');
    return;
  }
  // 3) 상태 갱신 + Issue
  const put = UrlFetchApp.fetch(api, {
    method: 'put', headers: gh, contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({
      message: 'chore: update boss schedule state',
      content: Utilities.base64Encode(Utilities.newBlob(JSON.stringify(state, null, 2) + '\n').getBytes()),
      sha: curJson.sha,
    }),
  });
  if (put.getResponseCode() !== 200 && put.getResponseCode() !== 201) {
    throw new Error('상태 저장 실패 HTTP ' + put.getResponseCode());
  }
  const issue = UrlFetchApp.fetch('https://api.github.com/repos/' + OWNER + '/' + REPO + '/issues', {
    method: 'post', headers: gh, contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({
      title: '[우두머리 시간표] 위키 시간표가 바뀌었습니다 (' + modified + ')',
      body: '검은사막 위키의 월드 우두머리 레이드 시간표 이미지가 바뀌었습니다.\n\n'
        + '- 위키: https://www.kr.playblackdesert.com/ko-kr/Wiki?wikiNo=167\n'
        + '- 새 이미지(공식 사이트): ' + imageUrl + '\n'
        + '- 수정 일시: ' + modified + '\n\n'
        + '이미지를 보고 `bosses.json`의 시간표를 고쳐 주세요. (앱은 6시간마다 + 매주 수요일 12:27에 이 파일을 다시 받습니다)',
    }),
  });
  if (issue.getResponseCode() !== 201) throw new Error('Issue 생성 실패 HTTP ' + issue.getResponseCode());
  Logger.log('[보스] 시간표 변경 감지. 상태 갱신 + Issue 생성 완료 (' + modified + ')');
}

// ---- 진행중인 이벤트 모아보기 (보스와 동일 스케줄: 수요일 주 1회) ----
const EVENTS_PATH = 'events.json';
const EVENTS_SOURCE = 'https://www.kr.playblackdesert.com/ko-KR/News/Detail?groupContentNo=13733';
function isPeriod_(s) {
  return /(\d{4}\s*년|\d{1,2}\s*월\s*\d{1,2}\s*일|^~)/.test(s);
}
function parseEvents_(html) {
  const wrap = html.indexOf('tpl_glance_wrap');
  if (wrap < 0) throw new Error('모아보기 본문(tpl_glance_wrap)을 찾지 못함');
  const body = html.slice(wrap);
  const h3re = /<h3[^>]*>([\s\S]*?)<\/h3>/g;
  const h3s = [];
  let m;
  while ((m = h3re.exec(body))) h3s.push({ title: decode_(m[1]), start: m.index, end: m.index + m[0].length });
  if (!h3s.length) throw new Error('이벤트 카드(h3)를 찾지 못함');
  const cats = [];
  const catRe = /(NEW 이벤트|HOT 이벤트|상시 이벤트)/g;
  while ((m = catRe.exec(body))) cats.push({ name: m[1], at: m.index });
  const events = [];
  for (let i = 0; i < h3s.length; i++) {
    const segEnd = i + 1 < h3s.length ? h3s[i + 1].start : h3s[i].end + 12000;
    let seg = body.slice(h3s[i].end, segEnd);
    let link = '';
    const linkRe = /<a[^>]+href="([^"]*News\/Detail[^"]*)"/g;
    let lm;
    while ((lm = linkRe.exec(seg))) {
      const href = lm[1];
      if (/countryType=/.test(href)) continue;
      link = href.indexOf('http') === 0 ? href : 'https://www.kr.playblackdesert.com' + href;
      break;
    }
    if (!link) continue;
    let category = '';
    for (const c of cats) { if (c.at < h3s[i].start) category = c.name; else break; }
    seg = seg.replace(/<a[\s\S]*?<\/a>/gi, ' ');
    let period = '';
    const extra = [];
    const pRe = /<p[^>]*>([\s\S]*?)<\/p>/g;
    let pm;
    while ((pm = pRe.exec(seg))) {
      // "정기점검 전"은 통상 그날 오전 05:00
      const t = decode_(pm[1]).replace(/정기점검\s*전/g, '05:00');
      if (!t || /^(NEW|HOT)$/.test(t)) continue;
      if (!period && isPeriod_(t)) period = t;
      else extra.push(t);
    }
    const contentLines = [];
    const flat = seg.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p|li)>/gi, '\n').replace(/<[^>]+>/g, ' ');
    const flatLines = flat.split('\n');
    for (let li = 0; li < flatLines.length; li++) {
      const t = decode_(flatLines[li]);
      if (!t || /^(NEW|HOT)$/.test(t)) continue;
      if (t === decode_(h3s[i].title) || (period && t === period) || extra.indexOf(t) >= 0) continue;
      contentLines.push(t);
    }
    const title = h3s[i].title;
    if (!title) continue;
    events.push({ category: category, title: title, period: period, summary: extra.concat(contentLines).join(' / '), link: link });
  }
  return events;
}

function eventsCrawl() {
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN을 입력하세요 (코드 맨 위)');
  const gh = { 'Authorization': 'Bearer ' + GITHUB_TOKEN, 'Accept': 'application/vnd.github+json', 'User-Agent': 'ChzzkAlertEventBot' };
  // 1) 공식 페이지 읽기 (최대 3회 재시도)
  let html = '';
  let lastErr = null;
  for (let a = 1; a <= 3; a++) {
    try {
      const res = UrlFetchApp.fetch(EVENTS_SOURCE, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChzzkAlertEventBot)', 'Accept-Language': 'ko-KR' },
        muteHttpExceptions: true,
      });
      if (res.getResponseCode() !== 200) throw new Error('HTTP ' + res.getResponseCode());
      html = res.getContentText('UTF-8');
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      if (a < 3) Utilities.sleep(3000 * a);
    }
  }
  if (lastErr) throw lastErr;
  const events = parseEvents_(html);
  if (!events.length) throw new Error('이벤트를 하나도 읽지 못함 (페이지 구조가 바뀌었을 수 있음)');
  // 2) 현재 파일과 비교 (다를 때만 커밋)
  const cur = UrlFetchApp.fetch(
    'https://api.github.com/repos/' + OWNER + '/' + REPO + '/contents/' + EVENTS_PATH + '?ref=main',
    { headers: gh, muteHttpExceptions: true }
  );
  if (cur.getResponseCode() !== 200) throw new Error('GitHub API ' + cur.getResponseCode());
  const curJson = JSON.parse(cur.getContentText());
  let same = false;
  try {
    const prev = JSON.parse(Utilities.newBlob(Utilities.base64Decode(curJson.content)).getDataAsString());
    same = JSON.stringify(prev.events) === JSON.stringify(events);
  } catch (e) {}
  if (same) {
    Logger.log('[이벤트] 변경 없음 (' + events.length + '개)');
    return;
  }
  // 3) 커밋
  const out = { source: EVENTS_SOURCE, updatedAt: Date.now(), events: events };
  const body = JSON.stringify({
    message: 'chore: update events.json',
    content: Utilities.base64Encode(Utilities.newBlob(JSON.stringify(out, null, 2) + '\n').getBytes()),
    sha: curJson.sha,
  });
  const put = UrlFetchApp.fetch(
    'https://api.github.com/repos/' + OWNER + '/' + REPO + '/contents/' + EVENTS_PATH,
    { method: 'put', headers: gh, contentType: 'application/json', payload: body, muteHttpExceptions: true }
  );
  if (put.getResponseCode() !== 200 && put.getResponseCode() !== 201) {
    throw new Error('커밋 실패 HTTP ' + put.getResponseCode() + ': ' + put.getContentText().slice(0, 200));
  }
  Logger.log('[이벤트] events.json 갱신 (' + events.length + '개)');
}
