// 검은사막 "진행중인 이벤트 모아보기" 페이지를 읽어서 events.json을 만든다.
//   node scripts/crawl-events.js
// 브라우저(치지직 페이지)에서는 검은사막 사이트가 CORS를 허용하지 않아 직접 읽을 수 없으므로,
// 이 스크립트를 (Google Apps Script 또는 직접) 돌려서 events.json을 저장소에 올리고, 앱은 그 파일을 받아온다.
// 가져오지 못하거나 이벤트가 하나도 안 나오면 기존 events.json을 그대로 두고 오류로 종료한다.
const fs = require('fs');
const path = require('path');

const SOURCE = 'https://www.kr.playblackdesert.com/ko-KR/News/Detail?groupContentNo=13733';
const OUT = path.join(__dirname, '..', 'events.json');
const BASE = 'https://www.kr.playblackdesert.com';

const decode = (s) => String(s)
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;|&#160;/g, ' ')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim();

// "~ 2026년 11월 4일(수) 정기점검 전" 같은 날짜 패턴 (브라우저 추출 스크립트와 동일 규칙)
function isPeriod(s) {
  return /(\d{4}\s*년|\d{1,2}\s*월\s*\d{1,2}\s*일|^~)/.test(s);
}

// "정기점검 전"은 통상 그날 오전 05:00이므로 시각으로 바꿔 적는다 ("~ 11월 4일(수) 정기점검 전" → "~ 11월 4일(수) 05:00")
function normalizeTime(s) {
  return String(s).replace(/정기점검\s*전/g, '05:00');
}

function parse(html) {
  const wrap = html.indexOf('tpl_glance_wrap');
  if (wrap < 0) throw new Error('모아보기 본문(tpl_glance_wrap)을 찾지 못함');
  const body = html.slice(wrap);
  // 카드 경계: h3 하나당 카드 하나
  const h3re = /<h3[^>]*>([\s\S]*?)<\/h3>/g;
  const h3s = [];
  let m;
  while ((m = h3re.exec(body))) h3s.push({ title: decode(m[1]), start: m.index, end: m.index + m[0].length });
  if (!h3s.length) throw new Error('이벤트 카드(h3)를 찾지 못함');
  // 카테고리 표식 (본문 안에서만, 카드보다 앞에 있는 마지막 표식을 씀)
  const cats = [];
  const catRe = /(NEW 이벤트|HOT 이벤트|상시 이벤트)/g;
  while ((m = catRe.exec(body))) cats.push({ name: m[1], at: m.index });
  const events = [];
  for (let i = 0; i < h3s.length; i++) {
    const segEnd = i + 1 < h3s.length ? h3s[i + 1].start : h3s[i].end + 12000;
    let seg = body.slice(h3s[i].end, segEnd);
    // 링크: 카드 안의 News/Detail 바로가기 (관련글 countryType 링크는 제외)
    let link = '';
    const linkRe = /<a[^>]+href="([^"]*News\/Detail[^"]*)"/g;
    let lm;
    while ((lm = linkRe.exec(seg))) {
      const href = lm[1];
      if (/countryType=/.test(href)) continue;
      link = href.startsWith('http') ? href : BASE + href;
      break;
    }
    if (!link) continue; // 바로가기 없는 h3(바깥 영역)는 카드가 아님
    // 카테고리: 이 카드보다 앞에 있는 마지막 표식
    let category = '';
    for (const c of cats) { if (c.at < h3s[i].start) category = c.name; else break; }
    // 바로가기 버튼 텍스트가 요약에 섞이지 않게 앵커 블록 제거
    seg = seg.replace(/<a[\s\S]*?<\/a>/gi, ' ');
    // 기간: h3 뒤의 p 중 날짜 패턴이 있는 것, 날짜가 아니면 부제로 취급
    let period = '';
    const extra = [];
    const pRe = /<p[^>]*>([\s\S]*?)<\/p>/g;
    let pm;
    while ((pm = pRe.exec(seg))) {
      const t = normalizeTime(decode(pm[1]));
      if (!t || /^(NEW|HOT)$/.test(t)) continue;
      if (!period && isPeriod(t)) period = t;
      else extra.push(t);
    }
    // 간단한 내용: 보상/혜택 박스(div)의 텍스트
    const contentLines = [];
    // 중첩 div 때문에 한 번에 못 자르므로: 태그를 줄바꿈으로 바꿔 줄 단위로 정리
    const flat = seg.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p|li)>/gi, '\n').replace(/<[^>]+>/g, ' ');
    for (const line of flat.split('\n')) {
      const t = decode(line);
      if (!t || /^(NEW|HOT)$/.test(t)) continue;
      if (t === decode(h3s[i].title) || (period && t === period) || extra.includes(t)) continue;
      contentLines.push(t);
    }
    const title = h3s[i].title;
    if (!title) continue;
    const summary = [...extra, ...contentLines].join(' / ');
    events.push({ category, title, period, summary, link });
  }
  return events;
}

async function main() {
  // 일시적 네트워크 오류는 여기서 재시도한다.
  let html = '';
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(SOURCE, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChzzkAlertEventBot)', 'Accept-Language': 'ko-KR' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      html = await res.text();
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
  if (lastErr) throw lastErr;
  const events = parse(html);
  if (!events.length) throw new Error('이벤트를 하나도 읽지 못함 (페이지 구조가 바뀌었을 수 있음)');
  const out = { source: SOURCE, updatedAt: Date.now(), events };
  // 내용이 바뀌지 않았으면 파일을 다시 쓰지 않는다 (불필요한 커밋 방지)
  let same = false;
  try {
    const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    same = JSON.stringify(prev.events) === JSON.stringify(events);
  } catch (e) {}
  if (same) { console.log('변경 없음 (' + events.length + '개)'); return; }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log('events.json 갱신 (' + events.length + '개)');
}

if (require.main === module) {
  main().catch((e) => { console.error('이벤트 가져오기 실패:', e.message); process.exit(1); });
}
module.exports = { parse, isPeriod };
