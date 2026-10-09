// 검은사막 "시간표 > 월드 우두머리 레이드" 위키 페이지의 시간표 이미지가 바뀌었는지 확인한다.
//   node scripts/check-boss-schedule.js
// 시간표는 글자가 아니라 이미지로 올라와 있어서 값을 자동으로 읽을 수 없다(OCR 안 함).
// 대신 이미지 주소와 "최근 수정 일시"가 이전과 다르면 새 이미지를 data/boss-schedule.png로 저장하고
// data/boss-schedule-state.json을 갱신한 뒤, GitHub Actions에 changed=true를 알려 Issue를 만들게 한다.
// 시간표 값(bosses.json)은 새 이미지를 보고 사람이(또는 도우미가) 고친다.
// 처음 실행(상태 파일 없음)이거나 변경이 없으면 changed=false.
const fs = require('fs');
const path = require('path');

const SOURCE = 'https://www.kr.playblackdesert.com/ko-kr/Wiki?wikiNo=167';
const ROOT = path.join(__dirname, '..');
const STATE = path.join(ROOT, 'data', 'boss-schedule-state.json');
const IMAGE = path.join(ROOT, 'data', 'boss-schedule.png');
const UA = 'Mozilla/5.0 (compatible; ChzzkAlertBossScheduleBot)';

function setOutput(k, v) {
  const f = process.env.GITHUB_OUTPUT;
  if (f) fs.appendFileSync(f, k + '=' + String(v).replace(/\r?\n/g, ' ') + '\n');
}

async function main() {
  const res = await fetch(SOURCE, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const html = await res.text();
  const area = html.indexOf('detail_wrap editor_area');
  if (area < 0) throw new Error('본문을 찾지 못함 (페이지 구조가 바뀌었을 수 있음)');
  const img = /<img[^>]+src="([^"]+)"/.exec(html.slice(area));
  if (!img) throw new Error('시간표 이미지를 찾지 못함');
  const imageUrl = img[1];
  const mod = /최근 수정 일시\s*:\s*([0-9.]+\s*[0-9:]+)/.exec(html);
  const modified = mod ? mod[1].replace(/\s+/g, ' ').trim() : '';

  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) {}
  const changed = !!prev && (prev.imageUrl !== imageUrl || prev.modified !== modified);
  if (prev && !changed) { console.log('변경 없음 (' + modified + ')'); setOutput('changed', 'false'); return; }

  // 처음 기록하거나 바뀐 경우: 이미지를 저장하고 상태를 갱신
  const imgRes = await fetch(imageUrl, { headers: { 'User-Agent': UA } });
  if (!imgRes.ok) throw new Error('이미지 HTTP ' + imgRes.status);
  fs.mkdirSync(path.dirname(IMAGE), { recursive: true });
  fs.writeFileSync(IMAGE, Buffer.from(await imgRes.arrayBuffer()));
  fs.writeFileSync(STATE, JSON.stringify({ source: SOURCE, imageUrl, modified, checkedAt: Date.now() }, null, 2) + '\n');

  if (!prev) { console.log('상태 처음 기록 (' + modified + ')'); setOutput('changed', 'false'); return; }
  console.log('시간표 변경 감지: ' + prev.modified + ' → ' + modified);
  setOutput('changed', 'true');
  setOutput('modified', modified);
  setOutput('imageUrl', imageUrl);
}

main().catch((e) => { console.error('시간표 확인 실패:', e.message); process.exit(1); });
