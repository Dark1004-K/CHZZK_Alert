// Cloudflare Workers Cron — 검은사막 쿠폰 감지기 (GAS couponsCrawl과 같은 역할).
// 역할: "정확한 시각"에 공식 페이지를 확인하고, 쿠폰이 실제로 바뀌었을 때만
//       GitHub Actions(crawl-coupons.yml)를 디스패처한다. 파싱 확정·커밋·이슈는 Actions가 맡는다.
//       (GAS를 쓰면 이 워커는 불필요 — 둘 중 하나만 켜 두면 된다)
//
// 배포: Cloudflare 대시보드 → Workers → Create → 아래 코드 전체 붙여넣기.
// Secrets: GITHUB_TOKEN (Contents 읽기 + Actions 읽기/쓰기 PAT) 1개.
// Triggers → Cron: 7,27,47 * * * * (20분 간격)
// 테스트: 대시보드에서 Cron 수동 실행 → 로그에 "디스패치" 또는 "변경 없음" 확인.

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
  const y = +m[1], mo = +m[2], d = +m[3], h = +m[4], mi = +m[5];
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
        // "정기점검 전"은 통상 그날 오전 05:00
        cur.expires = decode(m[4]).replace(/정기점검\s*전/g, '05:00');
        cur.expiresAt = parseExpire(cur.expires);
      }
    }
  }
  return coupons.filter((c) => c.code);
}
function b64decodeUnicode(b64) {
  const bin = atob(String(b64 || '').replace(/\s+/g, ''));
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(b);
}

async function checkAndDispatch(env) {
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
  // 2) 저장소의 coupons.json과 비교 (다를 때만 디스패치)
  const cur = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}?ref=main`, { headers: gh });
  if (!cur.ok) throw new Error('GitHub API ' + cur.status);
  const curJson = await cur.json();
  let same = false;
  try {
    const prev = JSON.parse(b64decodeUnicode(curJson.content));
    same = JSON.stringify(prev.coupons) === JSON.stringify(coupons);
  } catch (e) {}
  if (same) return { changed: false, count: coupons.length };
  // 3) 바뀌었으면 Actions를 실행시킨다 (workflow_dispatch API, 성공 코드는 204)
  const dis = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/crawl-coupons.yml/dispatches`, {
    method: 'POST',
    headers: { ...gh, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main' }),
  });
  if (dis.status !== 204) throw new Error('디스패치 실패 HTTP ' + dis.status + ': ' + (await dis.text()).slice(0, 200));
  return { changed: true, count: coupons.length };
}

export default {
  async scheduled(event, env, ctx) {
    try {
      const r = await checkAndDispatch(env);
      console.log('coupons ' + (r.changed ? '변경 감지 → Actions 디스패치' : '변경 없음') + ' (' + r.count + '개)');
    } catch (e) {
      console.error('쿠폰 확인 실패:', e && e.message ? e.message : e);
      throw e; // 실패로 기록 (대시보드에서 확인)
    }
  },
  async fetch() {
    return new Response('coupon-cron worker (dispatcher). Cron: 7,27,47 * * * * (20분 간격). 수동 실행은 대시보드의 Cron 테스트.', {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  },
};
