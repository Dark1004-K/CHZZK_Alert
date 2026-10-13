// Cloudflare Workers Cron — 검은사막 쿠폰 크롤러 (GitHub Actions 스케줄 대체).
// GitHub 예약 실행은 몇 시간씩 밀리므로, 정확한 시각에는 이 워커가 직접 돌고 GitHub API로 커밋한다.
// Actions 워크플로우(crawl-coupons.yml)는 수동 백업용으로만 남김.
//
// 배포: Cloudflare 대시보드 → Workers → Create → 아래 코드 전체 붙여넣기.
// Secrets: GITHUB_TOKEN (repo Contents 읽기/쓰기 PAT) 1개.
// Triggers → Cron: 7,27,47 * * * * (20분 간격)
// 테스트: 대시보드에서 Cron 수동 실행, 또는 coupons.json updatedAt 확인.

const SOURCE = 'https://www.kr.playblackdesert.com/ko-KR/News/Detail?groupContentNo=10748';
const OWNER = 'Dark1004-K';
const REPO = 'CHZZK_Alert';
const PATH = 'coupons.json';

function decode(s) {
  return String(s)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}
function parseExpire(text) {
  const m = /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일(?:\([^)]*\))?\s*(\d{1,2}):(\d{2})/.exec(text);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  return Date.UTC(y, mo - 1, d, h, mi) - 9 * 3600 * 1000;
}
function parse(html) {
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
      const t = decode(m[1]);
      if (t && !/쿠폰을 한눈에|풍성한 보상/.test(t)) title = t;
    } else if (m[2] !== undefined) {
      cur = { name: title, code: decode(m[2]), rewards: [], expires: '', expiresAt: null };
      coupons.push(cur);
      title = '';
    } else if (m[3] !== undefined) {
      const r = decode(m[3]);
      if (cur && r) cur.rewards.push(r);
    } else if (m[4] !== undefined) {
      if (cur && !cur.expires) {
        cur.expires = decode(m[4]);
        cur.expiresAt = parseExpire(cur.expires);
      }
    }
  }
  return coupons.filter((c) => c.code);
}
function b64encodeUnicode(s) {
  const b = new TextEncoder().encode(s);
  let t = '';
  for (let i = 0; i < b.length; i++) t += String.fromCharCode(b[i]);
  return btoa(t);
}
function b64decodeUnicode(b64) {
  const bin = atob(String(b64 || '').replace(/\s+/g, ''));
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(b);
}

async function crawl(env) {
  if (!env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN 시크릿이 없음');
  const gh = { 'Authorization': 'Bearer ' + env.GITHUB_TOKEN, 'Accept': 'application/vnd.github+json', 'User-Agent': 'ChzzkAlertCouponWorker' };
  // 1) 공식 페이지 읽기 (최대 3회 재시도)
  let html = '', lastErr = null;
  for (let a = 1; a <= 3; a++) {
    try {
      const res = await fetch(SOURCE, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChzzkAlertCouponBot)', 'Accept-Language': 'ko-KR' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      html = await res.text();
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      if (a < 3) await new Promise((r) => setTimeout(r, 3000 * a));
    }
  }
  if (lastErr) throw lastErr;
  const coupons = parse(html);
  if (!coupons.length) throw new Error('쿠폰을 하나도 읽지 못함 (페이지 구조가 바뀌었을 수 있음)');
  // 2) 현재 파일과 비교 (다를 때만 커밋)
  const cur = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}?ref=main`, { headers: gh });
  if (!cur.ok) throw new Error('GitHub API ' + cur.status);
  const curJson = await cur.json();
  let same = false;
  try {
    const prev = JSON.parse(b64decodeUnicode(curJson.content));
    same = JSON.stringify(prev.coupons) === JSON.stringify(coupons);
  } catch (e) {}
  if (same) return { changed: false, count: coupons.length };
  // 3) 커밋
  const out = { source: SOURCE, updatedAt: Date.now(), coupons };
  const put = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}`, {
    method: 'PUT',
    headers: { ...gh, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'chore: update coupons.json',
      content: b64encodeUnicode(JSON.stringify(out, null, 2) + '\n'),
      sha: curJson.sha,
    }),
  });
  if (!put.ok) throw new Error('커밋 실패 HTTP ' + put.status + ': ' + (await put.text()).slice(0, 200));
  return { changed: true, count: coupons.length };
}

export default {
  async scheduled(event, env, ctx) {
    try {
      const r = await crawl(env);
      console.log('coupons ' + (r.changed ? '갱신' : '변경 없음') + ' (' + r.count + '개)');
    } catch (e) {
      console.error('쿠폰 가져오기 실패:', e && e.message ? e.message : e);
      throw e; // 실패로 기록 (대시보드에서 확인)
    }
  },
  async fetch() {
    return new Response('coupon-cron worker. Cron: 7,27,47 * * * * (20분 간격). 수동 실행은 대시보드의 Cron 테스트.', {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  },
};
