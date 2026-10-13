// Google Apps Script — 검은사막 쿠폰 크롤러 (Cloudflare 대신. 가입 절차 없음, Google 계정으로 바로 시작)
// GitHub 예약 실행은 몇 시간씩 밀리므로, 정확한 시각에는 이 스크립트가 직접 돌고 GitHub API로 커밋한다.
//
// 설치:
//   1. script.google.com → 새 프로젝트 → 이 파일 내용 전체 붙여넣기
//   2. 아래 GITHUB_TOKEN에 토큰 입력 (GitHub Settings → Developer settings → Fine-grained PAT,
//      대상 repo CHZZK_Alert 1개, Contents 읽기/쓰기) 후 저장(Ctrl+S)
//   3. crawl() 함수를 1회 실행 → 권한 승인 (본인 계정 확인 화면에서 고급 → 이동)
//   4. 왼쪽 시계 아이콘(트리거) → 트리거 추가 → crawl / 시간 기반 / 분 타이머 / 15분마다 → 저장
// 확인: coupons.json의 updatedAt이 갱신되는지, 또는 GAS 실행 기록에서 성공 여부.

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
        cur.expires = decode_(m[4]);
        cur.expiresAt = parseExpire_(cur.expires);
      }
    }
  }
  return coupons.filter(function (c) { return c.code; });
}

function crawl() {
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
    Logger.log('변경 없음 (' + coupons.length + '개)');
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
  Logger.log('coupons.json 갱신 (' + coupons.length + '개)');
}
