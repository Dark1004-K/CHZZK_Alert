// Google Apps Script — 크지직 알림 크론 (쿠폰 + 보스 + 이벤트, 한 프로젝트)
// 같은 프로젝트에 이 파일 1개만 넣는다.
//
// 역할: "정확한 시각"에 공식 페이지를 확인(감지)하고, 내용이 실제로 바뀌었을 때만
//       GitHub Actions를 디스패처한다. 파싱 확정·AI 판독·커밋·이슈는 Actions가 맡는다.
//       (GitHub의 예약 실행(schedule)은 몇 시간씩 밀릴 수 있어서, 시각은 이 GAS 타이머가 보장한다)
//
// 설치:
//   1. script.google.com → 새 프로젝트 → 이 파일 내용 전체 붙여넣기
//   2. 아래 GITHUB_TOKEN에 토큰 입력 후 저장(Ctrl+S).
//      GitHub Fine-grained PAT, 대상 repo CHZZK_Alert 1개:
//      - Contents: 읽기 (coupons.json / state 파일 비교용)
//      - Actions: 읽기·쓰기 (workflow_dispatch 호출용) ← 꼭 필요
//   3. couponsCrawl() 1회 실행 → 권한 승인 → 로그에 변경 없음 또는 디스패치 확인
//   4. bossCheck() 1회 실행 → 로그에 변경 없음 또는 디스패치 확인
//   5. eventsCrawl() 1회 실행 → 로그에 변경 없음 또는 디스패치 확인
//   6. 트리거 추가 3개:
//      - couponsCrawl / 시간 기반 / 시간 타이머 / 매시간 (매시 00분 무렵)
//      - bossCheck / 시간 기반 / 일 타이머 / 오전 11시~12시
//      - eventsCrawl / 시간 기반 / 일 타이머 / 오전 11시~12시 (보스와 동일)
//   7. 프로젝트 시간대 확인: 왼쪽 톱니 → (GMT+09:00) 서울

const GITHUB_TOKEN = ''; // ← 여기에 토큰 붙여넣기
const OWNER = 'Dark1004-K';
const REPO = 'CHZZK_Alert';
const PATH = 'coupons.json';
const SOURCE = 'https://www.kr.playblackdesert.com/ko-KR/News/Detail?groupContentNo=10748';

// Actions 워크플로우를 실행시킨다 (workflow_dispatch API, 성공 코드는 204)
function dispatch_(workflowFile) {
  const res = UrlFetchApp.fetch(
    'https://api.github.com/repos/' + OWNER + '/' + REPO + '/actions/workflows/' + workflowFile + '/dispatches',
    {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + GITHUB_TOKEN,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'ChzzkAlertCronBot',
      },
      contentType: 'application/json',
      payload: JSON.stringify({ ref: 'main' }),
      muteHttpExceptions: true,
    }
  );
  const code = res.getResponseCode();
  if (code !== 204) throw new Error('디스패치 실패 HTTP ' + code + ': ' + res.getContentText().slice(0, 200));
}

// 저장소의 JSON 파일을 읽는다 (없으면 null)
function readFile_(path) {
  const gh = { 'Authorization': 'Bearer ' + GITHUB_TOKEN, 'Accept': 'application/vnd.github+json', 'User-Agent': 'ChzzkAlertCronBot' };
  const res = UrlFetchApp.fetch(
    'https://api.github.com/repos/' + OWNER + '/' + REPO + '/contents/' + path + '?ref=main',
    { headers: gh, muteHttpExceptions: true }
  );
  if (res.getResponseCode() === 404) return null;
  if (res.getResponseCode() !== 200) throw new Error('GitHub API ' + res.getResponseCode());
  const json = JSON.parse(res.getContentText());
  try {
    return JSON.parse(Utilities.newBlob(Utilities.base64Decode(json.content)).getDataAsString());
  } catch (e) {
    return null;
  }
}

// ---- 쿠폰 (매시간): 페이지가 바뀌었을 때만 crawl-coupons Actions를 실행 ----
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
  // 2) 파싱해서 저장소의 coupons.json과 비교
  const coupons = parse_(html);
  if (!coupons.length) throw new Error('쿠폰을 하나도 읽지 못함 (페이지 구조가 바뀌었을 수 있음)');
  const prev = readFile_(PATH);
  if (prev && JSON.stringify(prev.coupons) === JSON.stringify(coupons)) {
    Logger.log('[쿠폰] 변경 없음 (' + coupons.length + '개)');
    return;
  }
  // 3) 바뀌었으면 Actions를 실행시킨다 (정확한 파싱·커밋·이슈는 거기서)
  dispatch_('crawl-coupons.yml');
  Logger.log('[쿠폰] 변경 감지 → crawl-coupons Actions 디스패치 (' + coupons.length + '개)');
}

// ---- 우두머리 시간표 (매일): 위키 이미지가 바뀌었을 때만 check-boss-schedule Actions를 실행 ----
function bossCheck() {
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN을 입력하세요 (코드 맨 위)');
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
  // 2) 저장된 상태와 비교 (상태 파일은 Actions가 갱신한다 — 여기서는 읽기만)
  const prev = readFile_(STATE_PATH);
  if (!prev) {
    // 상태가 아직 없으면 Actions가 처음 기록하게 둔다 (AI로 판독하지는 않음)
    dispatch_('check-boss-schedule.yml');
    Logger.log('[보스] 상태 파일 없음 → check-boss-schedule Actions 디스패치 (초기 기록용)');
    return;
  }
  if (prev.imageUrl === imageUrl && prev.modified === modified) {
    Logger.log('[보스] 변경 없음 (' + modified + ')');
    return;
  }
  // 3) 바뀌었으면 Actions를 실행시킨다 (AI 판독·검증·커밋·이슈는 거기서)
  dispatch_('check-boss-schedule.yml');
  Logger.log('[보스] 시간표 변경 감지 (' + prev.modified + ' → ' + modified + ') → check-boss-schedule Actions 디스패치');
}

// ---- 진행중인 이벤트 모아보기 (매일): 내용이 바뀌었을 때만 crawl-events Actions를 실행 ----
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
  // 2) 파싱해서 저장소의 events.json과 비교
  const events = parseEvents_(html);
  if (!events.length) throw new Error('이벤트를 하나도 읽지 못함 (페이지 구조가 바뀌었을 수 있음)');
  const prev = readFile_(EVENTS_PATH);
  if (prev && JSON.stringify(prev.events) === JSON.stringify(events)) {
    Logger.log('[이벤트] 변경 없음 (' + events.length + '개)');
    return;
  }
  // 3) 바뀌었으면 Actions를 실행시킨다
  dispatch_('crawl-events.yml');
  Logger.log('[이벤트] 변경 감지 → crawl-events Actions 디스패치 (' + events.length + '개)');
}
