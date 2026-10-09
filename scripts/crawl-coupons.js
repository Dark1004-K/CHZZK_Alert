// 검은사막 "쿠폰 모두 모아보기" 페이지를 읽어서 coupons.json을 만든다.
//   node scripts/crawl-coupons.js
// 브라우저(치지직 페이지)에서는 검은사막 사이트가 CORS를 허용하지 않아 직접 읽을 수 없으므로,
// 이 스크립트를 (GitHub Actions 또는 직접) 돌려서 coupons.json을 저장소에 올리고, 앱은 그 파일을 받아온다.
// 가져오지 못하거나 쿠폰이 하나도 안 나오면 기존 coupons.json을 그대로 두고 오류로 종료한다.
const fs = require('fs');
const path = require('path');

const SOURCE = 'https://www.kr.playblackdesert.com/ko-KR/News/Detail?groupContentNo=10748';
const OUT = path.join(__dirname, '..', 'coupons.json');

const decode = (s) => String(s)
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;|&#160;/g, ' ')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim();

// "2026년 10월 10일(토) 13:59" → 한국시간 기준 ms. 날짜를 못 읽으면 null ("정기점검 전" 등은 expires 문구만 보여줌)
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
  // 본문 안의 조각을 나온 순서대로 훑는다: 제목 → 코드 → 보상들 → 유효 기간
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

async function main() {
  const res = await fetch(SOURCE, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChzzkAlertCouponBot)', 'Accept-Language': 'ko-KR' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const html = await res.text();
  const coupons = parse(html);
  if (!coupons.length) throw new Error('쿠폰을 하나도 읽지 못함 (페이지 구조가 바뀌었을 수 있음)');
  const out = { source: SOURCE, updatedAt: Date.now(), coupons };
  // 쿠폰 내용이 바뀌지 않았으면 파일을 다시 쓰지 않는다 (불필요한 커밋 방지)
  let same = false;
  try {
    const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    same = JSON.stringify(prev.coupons) === JSON.stringify(coupons);
  } catch (e) {}
  if (same) { console.log('변경 없음 (' + coupons.length + '개)'); return; }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log('coupons.json 갱신 (' + coupons.length + '개)');
}

if (require.main === module) {
  main().catch((e) => { console.error('쿠폰 가져오기 실패:', e.message); process.exit(1); });
}
module.exports = { parse, parseExpire };
