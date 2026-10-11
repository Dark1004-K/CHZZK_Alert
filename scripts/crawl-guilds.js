// 검은사막 길드 정보를 읽어서 guilds.json을 만든다.
//   node scripts/crawl-guilds.js
// 브라우저(치지직 페이지)에서는 검은사막 사이트가 CORS를 허용하지 않아 직접 읽을 수 없으므로,
// 이 스크립트를 (GitHub Actions 또는 직접) 돌려서 guilds.json을 저장소에 올리고, 앱(검은사막 확장)은 그 파일을 받아간다.
// data/guild-targets.json의 길드만 수집한다. 하나라도 읽지 못하면 기존 파일을 유지하고 오류로 종료한다.
const fs = require('fs');
const path = require('path');

const TARGETS = path.join(__dirname, '..', 'data', 'guild-targets.json');
const OUT = path.join(__dirname, '..', 'guilds.json');
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; ChzzkAlertBdoBot)', 'Accept-Language': 'ko-KR' };
const SEARCH = 'https://www.kr.playblackdesert.com/ko-KR/Adventure/Guild?searchText=';
const PROFILE = 'https://www.kr.playblackdesert.com/Adventure/Guild/GuildProfile?';

const decode = (s) => String(s)
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;|&#160;/g, ' ')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim();

async function get(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
  return res.text();
}

// 검색 페이지(여러 쪽 훑음)에서 길드명 정확히 일치하는 행이 있으면 true
async function existsExact(guild) {
  for (let page = 1; page <= 5; page++) {
    const html = await get(SEARCH + encodeURIComponent(guild) + '&page=' + page);
    const re = /<a href="\/Adventure\/Guild\/GuildProfile\?[^"]*"[^>]*>([^<]+)<\/a>/g;
    let m;
    let found = false;
    let anyRow = false;
    while ((m = re.exec(html))) {
      anyRow = true;
      if (decode(m[1]) === guild) return true;
    }
    if (!anyRow) return false; // 더 이상 결과 없음
    await sleep(500);
  }
  return false;
}

// ul.line_list 안에서 제목(title)에 해당하는 값. 비공개면 null
function lineList(html, title) {
  const re = new RegExp('<span class="title">' + title + '<\\/span>([\\s\\S]*?)<\\/li>');
  const m = re.exec(html);
  if (!m) return null;
  if (/<em class="lock">/.test(m[1])) return null;
  const t = decode(m[1]);
  return t || null;
}

function parseGuildProfile(html) {
  const created = lineList(html, '길드생성일');
  let master = null;
  const mm = /<span class="title">대장<\/span>[\s\S]*?<a[^>]*>([^<]+)<\/a>/.exec(html);
  if (mm) master = decode(mm[1]);
  let members = null;
  const cm = /<span class="title">인원<\/span>[\s\S]*?<em>(\d+)<\/em>\s*명/.exec(html);
  if (cm) members = parseInt(cm[1], 10);
  let siege = null;
  const sm = /<span class="title">점령현황<\/span>[\s\S]*?<span class="desc">([\s\S]*?)<\/span>\s*<\/li>/.exec(html)
    || /점령현황<\/span>([\s\S]{0,300})/.exec(html);
  if (sm) { const t = decode(sm[1]); siege = t || null; }
  // 구성원: 길드원 목록 영역의 프로필 링크 (가문명 + profileTarget)
  const boxIdx = html.indexOf('구성원</h3>');
  const box = boxIdx >= 0 ? html.slice(boxIdx) : html;
  const members2 = [];
  const seen = new Set();
  const re = /<a href="[^"]*Profile\?profileTarget=([^"&]+)"[^>]*>([^<]+)<\/a>/g;
  let m;
  while ((m = re.exec(box))) {
    const family = decode(m[2]);
    if (!family || seen.has(family)) continue;
    seen.add(family);
    members2.push({ family, profileTarget: decode(m[1]), role: master && family === master ? '대장' : '' });
  }
  return { created, master, members, siege, memberList: members2 };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function crawlOne(guild) {
  if (!(await existsExact(guild))) throw new Error('검색 결과 없음: ' + guild);
  await sleep(1000);
  const params = new URLSearchParams({ guildName: guild, region: 'KR' });
  const html = await get(PROFILE + params.toString());
  const p = parseGuildProfile(html);
  if (!p.memberList.length) throw new Error('구성원을 읽지 못함: ' + guild);
  return { guild, created: p.created, master: p.master, members: p.members, siege: p.siege, memberList: p.memberList, fetchedAt: Date.now() };
}

async function main() {
  const targets = JSON.parse(fs.readFileSync(TARGETS, 'utf8'));
  if (!Array.isArray(targets) || !targets.length) throw new Error('targets 비어 있음');
  const guilds = [];
  for (const g of targets) guilds.push(await crawlOne(String(g)));
  const strip = (l) => l.map(({ fetchedAt, ...r }) => r);
  let same = false;
  try {
    const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    same = JSON.stringify(prev.guilds) === JSON.stringify(strip(guilds));
  } catch (e) {}
  if (same) { console.log('변경 없음 (' + guilds.length + '길드)'); return; }
  fs.writeFileSync(OUT, JSON.stringify({ source: SEARCH, updatedAt: Date.now(), guilds }, null, 2) + '\n');
  console.log('guilds.json 갱신 (' + guilds.length + '길드, ' + guilds.reduce((n, g) => n + g.memberList.length, 0) + '명)');
}

if (require.main === module) {
  main().catch((e) => { console.error('길드 가져오기 실패:', e.message); process.exit(1); });
}
module.exports = { lineList, parseGuildProfile };
