// 검은사막 모험가(가문) 정보를 읽어서 adventurers.json을 만든다.
//   node scripts/crawl-adventurers.js
// 브라우저(치지직 페이지)에서는 검은사막 사이트가 CORS를 허용하지 않아 직접 읽을 수 없으므로,
// 이 스크립트를 (GitHub Actions 또는 직접) 돌려서 adventurers.json을 저장소에 올리고, 앱(검은사막 확장)은 그 파일을 받아간다.
// data/adventure-targets.json의 가문만 수집한다. 하나라도 읽지 못하면 기존 파일을 유지하고 오류로 종료한다.
const fs = require('fs');
const path = require('path');

const TARGETS = path.join(__dirname, '..', 'data', 'adventure-targets.json');
const OUT = path.join(__dirname, '..', 'adventurers.json');
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; ChzzkAlertBdoBot)', 'Accept-Language': 'ko-KR' };
const SEARCH = 'https://www.kr.playblackdesert.com/ko-KR/Adventure?searchType=2&checkSearchText=False&searchKeyword=';
const PROFILE = 'https://www.kr.playblackdesert.com/Adventure/Profile?profileTarget=';

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

// 검색 페이지에서 가문명 정확히 일치하는 행의 profileTarget을 찾는다
function findTarget(searchHtml, family) {
  const re = /<a href="([^"]*?Profile\?profileTarget=([^"&]+))"[^>]*>([^<]+)<\/a>/g;
  let m;
  while ((m = re.exec(searchHtml))) {
    if (decode(m[3]) === family) return decode(m[2]);
  }
  return null;
}

// ul.line_list 안에서 제목(title)에 해당하는 값. 비공개면 null
function lineList(html, title) {
  const re = new RegExp('<span class="title">' + title + '<\\/span>\\s*<span class="desc[^"]*">([\\s\\S]*?)<\\/span>\\s*<\\/li>');
  const m = re.exec(html);
  if (!m) return null;
  if (/<em class="lock">/.test(m[1])) return null;
  const t = decode(m[1]);
  return t || null;
}

function parseProfile(html) {
  const created = lineList(html, '가문생성일');
  const guild = lineList(html, '가입길드');
  const characters = [];
  const liRe = /<p class="character_name">([\s\S]*?)<\/p>\s*<p class="character_info">([\s\S]*?)<\/p>/g;
  let m;
  while ((m = liRe.exec(html))) {
    const nameHtml = m[1];
    const main = /대표캐릭터/.test(nameHtml);
    const name = decode(nameHtml.replace(/대표캐릭터/g, ''));
    if (!name) continue;
    const info = m[2];
    const cm = /<em>([^<>]+)<\/em>/.exec(info);
    const cls = cm ? decode(cm[1]) : '';
    let level = null;
    const lm = /Lv(?:<em class="lock">[^<]*<\/em>|(\d+))/.exec(info);
    if (lm && lm[1]) level = parseInt(lm[1], 10);
    characters.push({ name, class: cls, level, main });
  }
  return { created, guild, characters };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function crawlOne(family) {
  const searchHtml = await get(SEARCH + encodeURIComponent(family));
  const target = findTarget(searchHtml, family);
  if (!target) throw new Error('검색 결과 없음: ' + family);
  await sleep(1000);
  const profileHtml = await get(PROFILE + target);
  const p = parseProfile(profileHtml);
  if (!p.characters.length) throw new Error('캐릭터를 읽지 못함: ' + family);
  return { family, profileTarget: target, created: p.created, guild: p.guild, characters: p.characters, fetchedAt: Date.now() };
}

async function main() {
  const targets = JSON.parse(fs.readFileSync(TARGETS, 'utf8'));
  if (!Array.isArray(targets) || !targets.length) throw new Error('targets 비어 있음');
  const families = [];
  for (const f of targets) families.push(await crawlOne(String(f)));
  const strip = (l) => l.map(({ fetchedAt, ...r }) => r);
  let same = false;
  try {
    const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    same = JSON.stringify(prev.families) === JSON.stringify(strip(families));
  } catch (e) {}
  if (same) { console.log('변경 없음 (' + families.length + '가문)'); return; }
  fs.writeFileSync(OUT, JSON.stringify({ source: SEARCH, updatedAt: Date.now(), families }, null, 2) + '\n');
  console.log('adventurers.json 갱신 (' + families.length + '가문, ' + families.reduce((n, f) => n + f.characters.length, 0) + '캐릭)');
}

if (require.main === module) {
  main().catch((e) => { console.error('가문 가져오기 실패:', e.message); process.exit(1); });
}
module.exports = { findTarget, lineList, parseProfile };
