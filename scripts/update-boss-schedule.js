// 검은사막 "시간표 > 월드 우두머리 레이드" 위키 페이지의 시간표 이미지가 바뀌었으면
// Gemini로 읽어 bosses.json을 갱신한다.
//   node scripts/update-boss-schedule.js        (GEMINI_API_KEY 필요)
//   node scripts/update-boss-schedule.js --no-ai   (키 없이 이미지 비교만 — 기존 동작)
//
// 흐름:
//   1) 위키에서 이미지 주소 + "최근 수정 일시"를 긁어 data/boss-schedule-state.json과 비교
//   2) 바뀌었으면 이미지를 Gemini(gemini-2.5-flash 기본)에 보내 표를 JSON으로 읽게 함
//   3) 검증: 시각(HH:MM), 요일(월~일), 보스명은 plugins.json의 choices와 정확히 일치해야 함
//   4) 통과하면 bosses.json을 갱신하고 변경 내역을 GITHUB_OUTPUT으로 알림
//   5) 판독이 실패하면 자동 커밋하지 않고 needsReview=true로 사람을 부른다
//   6) GEMINI_API_KEY가 없으면 AI 없이(기존 방식) 이미지 변경 알림만 한다
const fs = require('fs');
const path = require('path');

const SOURCE = 'https://www.kr.playblackdesert.com/ko-kr/Wiki?wikiNo=167';
const ROOT = path.join(__dirname, '..');
const STATE = path.join(ROOT, 'data', 'boss-schedule-state.json');
const BOSSES = path.join(ROOT, 'bosses.json');
const PLUGINS = path.join(ROOT, 'plugins.json');
const UA = 'Mozilla/5.0 (compatible; ChzzkAlertBossScheduleBot)';
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const API_BASE = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta'; // 테스트용 오버라이드 가능

// 이미지의 요일 순서(월~일) → bosses.json의 day 번호(0=일 1=월 … 6=토)
const DAY_NO = { '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6, '일': 0 };

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    schedule: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          time: { type: 'STRING', description: 'HH:MM (24시간제, KST)' },
          day: { type: 'STRING', enum: ['월', '화', '수', '목', '금', '토', '일'] },
          bosses: { type: 'ARRAY', items: { type: 'STRING' }, description: '그 칸의 보스 이름 (위 목록의 철자 그대로)' },
        },
        required: ['time', 'day', 'bosses'],
      },
    },
  },
  required: ['schedule'],
};

function setOutput(k, v) {
  const f = process.env.GITHUB_OUTPUT;
  if (!f) return;
  const s = String(v);
  if (s.includes('\n')) fs.appendFileSync(f, k + '<<EOF\n' + s + '\nEOF\n');
  else fs.appendFileSync(f, k + '=' + s + '\n');
}

function levenshtein(a, b) {
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return m[a.length][b.length];
}

async function fetchWiki() {
  const res = await fetch(SOURCE, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const html = await res.text();
  const area = html.indexOf('detail_wrap editor_area');
  if (area < 0) throw new Error('본문을 찾지 못함 (페이지 구조가 바뀌었을 수 있음)');
  const img = /<img[^>]+src="([^"]+)"/.exec(html.slice(area));
  if (!img) throw new Error('시간표 이미지를 찾지 못함');
  const mod = /최근 수정 일시\s*:\s*([0-9.]+\s*[0-9:]+)/.exec(html);
  const modified = mod ? mod[1].replace(/\s+/g, ' ').trim() : '';
  return { imageUrl: img[1], modified };
}

async function askGemini(imageUrl, known) {
  const buf = Buffer.from(await (await fetch(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })).arrayBuffer());
  const prompt = [
    '이 이미지는 검은사막 한국 서버 위키의 "월드 우두머리 레이드" 시간표 표다.',
    '세로 머리글은 시작 시각(KST), 가로 머리글은 요일이며 열 순서는 월, 화, 수, 목, 금, 토, 일이다.',
    '각 칸에는 그 시각·요일에 등장하는 우두머리 이름이 적혀 있다(칸당 1~2명, 비어 있으면 없음).',
    '표에서 보이는 모든 시각·요일 칸을 빠짐없이 나열한 JSON을 만들어라.',
    '- time은 이미지에 적힌 시각을 HH:MM 24시간제로 고쳐 쓴다 (예: 오전 2:00 → "02:00").',
    '- day는 해당 칸의 요일 이름(월~일) 하나.',
    '- bosses는 그 칸의 보스 이름 배열. 다음 목록에 없는 이름을 쓰지 말고 철자를 그대로 복사한다:',
    known.join('·'),
    '- 표에 없는 시각이나 보스를 만들지 않는다. 확실히 읽지 못한 칸은 생략한다.',
  ].join('\n');
  const res = await fetch(API_BASE + '/models/' + MODEL + ':generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: 'image/png', data: buf.toString('base64') } },
        ],
      }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0 },
    }),
  });
  if (!res.ok) throw new Error('Gemini HTTP ' + res.status + ': ' + (await res.text()).slice(0, 300));
  const data = await res.json();
  const text = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0].text;
  if (!text) throw new Error('Gemini 응답에 텍스트 없음: ' + JSON.stringify(data).slice(0, 300));
  return JSON.parse(text).schedule || [];
}

// 판독 결과 검증 + {time: {dayNo: [bosses]}} 로 조립. errors에 사유를 담는다.
function buildSchedule(cells, known) {
  const errors = [];
  const byTime = new Map();
  for (const c of cells || []) {
    if (!/^\d{2}:\d{2}$/.test(c.time || '') || +c.time.slice(0, 2) > 23 || +c.time.slice(3) > 59) {
      errors.push('잘못된 시각: ' + JSON.stringify(c.time));
      continue;
    }
    const dayNo = DAY_NO[c.day];
    if (dayNo === undefined) { errors.push('잘못된 요일: ' + JSON.stringify(c.day)); continue; }
    const bosses = (c.bosses || []).map((s) => String(s).trim()).filter(Boolean);
    if (!bosses.length) continue;
    for (const b of bosses) {
      if (!known.includes(b)) {
        const near = known.filter((k) => levenshtein(k, b) <= 1);
        errors.push('목록에 없는 보스명 "' + b + '"' + (near.length ? ' (비슷한 이름: ' + near.join(', ') + ')' : ''));
      }
    }
    if (bosses.length > 2) errors.push(c.time + ' ' + c.day + ': 칸당 보스가 2명을 넘음 ' + JSON.stringify(bosses));
    const day = byTime.get(c.time) || {};
    if (day[dayNo]) errors.push('중복 칸: ' + c.time + ' ' + c.day);
    day[dayNo] = bosses;
    byTime.set(c.time, day);
  }
  if (byTime.size < 5) errors.push('시각이 너무 적음 (' + byTime.size + '개) — 표를 다 못 읽었을 수 있음');
  const schedule = [...byTime.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([time, days]) => {
      const d = {};
      for (const k of Object.keys(days).sort((a, b) => a - b)) d[k] = days[k];
      return { time, days: d };
    });
  return { schedule, errors };
}

// bosses.json의 schedule 배열 → 사람이 읽는 비교용 텍스트
function describe(schedule) {
  return schedule.map((s) => '  ' + s.time + ' ' + Object.keys(s.days)
    .sort((a, b) => a - b)
    .map((d) => ['일', '월', '화', '수', '목', '금', '토'][d] + ':' + s.days[d].join('+'))
    .join('  ')).join('\n');
}

async function main() {
  const noAi = process.argv.includes('--no-ai');
  const apiKey = process.env.GEMINI_API_KEY;
  const { imageUrl, modified } = await fetchWiki();

  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) {}
  const changed = !!prev && (prev.imageUrl !== imageUrl || prev.modified !== modified);
  if (!prev) {
    // 처음 기록 (AI로 판독하지 않음 — 이미지가 실제로 바뀐 것이 아닐 수 있음)
    fs.mkdirSync(path.dirname(STATE), { recursive: true });
    fs.writeFileSync(STATE, JSON.stringify({ source: SOURCE, imageUrl, modified, checkedAt: Date.now() }, null, 2) + '\n');
    console.log('상태 처음 기록 (' + modified + ')');
    setOutput('changed', 'false');
    return;
  }
  if (!changed) { console.log('변경 없음 (' + modified + ')'); setOutput('changed', 'false'); return; }
  console.log('시간표 변경 감지: ' + prev.modified + ' → ' + modified);

  if (noAi || !apiKey) {
    // AI 없이도 기존 알림은 유지한다 (상태는 갱신하지 않아 다음 실행에서 다시 감지)
    console.log(noAi ? '--no-ai 지정' : 'GEMINI_API_KEY 없음');
    setOutput('changed', 'true');
    setOutput('needsReview', 'true');
    setOutput('aiUsed', 'false');
    setOutput('modified', modified);
    setOutput('imageUrl', imageUrl);
    setOutput('body', '위키 시간표 이미지가 바뀌었습니다. AI 키가 없어 자동 판독하지 못했습니다.\n\n- 새 이미지(공식 사이트): ' + imageUrl + '\n- 수정 일시: ' + modified + '\n\n이미지를 보고 `bosses.json`을 고쳐 주세요.');
    return;
  }

  const known = JSON.parse(fs.readFileSync(PLUGINS, 'utf8')).plugins
    .flatMap((p) => p.options || [])
    .find((o) => Array.isArray(o.choices) && o.choices.includes('크자카'));
  if (!known || !known.choices.length) throw new Error('plugins.json에서 보스 목록을 찾지 못함');
  const bosses = known.choices;

  console.log('Gemini(' + MODEL + ')로 판독 중...');
  const cells = await askGemini(imageUrl, bosses);
  console.log('판독 칸 수: ' + cells.length);
  const { schedule, errors } = buildSchedule(cells, bosses);
  if (errors.length) {
    // 판독 실패 — 자동 커밋하지 않고 상태도 갱신하지 않아 다음 실행에서 재시도한다
    console.error('판독 검증 실패:\n- ' + errors.join('\n- '));
    setOutput('changed', 'true');
    setOutput('needsReview', 'true');
    setOutput('aiUsed', 'true');
    setOutput('modified', modified);
    setOutput('imageUrl', imageUrl);
    setOutput('body', 'AI 자동 판독에 실패했습니다. 아래 오류를 보고 `bosses.json`을 확인해 주세요.\n\n'
      + '- 새 이미지(공식 사이트): ' + imageUrl + '\n- 수정 일시: ' + modified + '\n\n'
      + '검증 오류:\n' + errors.map((e) => '- ' + e).join('\n') + '\n\n'
      + 'AI 판독 원본(JSON):\n```json\n' + JSON.stringify(schedule, null, 2) + '\n```\n\n'
      + '확인 후 `data/boss-schedule-state.json`을 지우면 다음 실행에서 다시 판독합니다.');
    process.exit(0); // 실패해도 워크플로우는 Issue만 만들고 커밋하지 않음
  }

  const old = JSON.parse(fs.readFileSync(BOSSES, 'utf8'));
  const oldText = describe(old.schedule);
  const newText = describe(schedule);
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify({ source: SOURCE, imageUrl, modified, checkedAt: Date.now() }, null, 2) + '\n');
  setOutput('changed', 'true');
  setOutput('aiUsed', 'true');

  if (oldText === newText) {
    console.log('판독 결과가 기존 bosses.json과 동일 — 파일 변경 없음');
    setOutput('updated', 'false');
    return;
  }
  old.schedule = schedule;
  old.updatedAt = Date.now();
  old.source = SOURCE;
  fs.writeFileSync(BOSSES, JSON.stringify(old, null, 2) + '\n');
  console.log('bosses.json 갱신 완료');
  setOutput('updated', 'true');
  setOutput('modified', modified);
  setOutput('imageUrl', imageUrl);
  const removed = oldText.split('\n').filter((l) => !newText.includes(l.trim()));
  const added = newText.split('\n').filter((l) => !oldText.includes(l.trim()));
  const diff = [...removed.map((l) => '-' + l), ...added.map((l) => '+' + l)].join('\n') || '(내부 순서만 바뀜)';
  setOutput('diff', diff);
  setOutput('body', 'AI(Gemini)가 위키 시간표 이미지를 판독해 `bosses.json`을 자동 갱신했습니다.\n\n'
    + '- 새 이미지(공식 사이트): ' + imageUrl + '\n- 수정 일시: ' + modified + '\n\n'
    + '변경 내역:\n```\n' + diff + '\n```\n\n'
    + '시간대별 전체 시간표:\n```\n' + newText + '\n```\n\n'
    + '앱은 이 파일을 6시간마다 다시 받습니다. 값이 잘못됐다면 `bosses.json`을 고치고 이 Issue를 닫아 주세요.');
}

main().catch((e) => { console.error('실패:', e.message); process.exit(1); });
