// 검은사막 "시간표 > 월드 우두머리 레이드" 위키 페이지의 시간표 이미지가 바뀌었으면
// AI(Groq)로 읽어 bosses.json을 갱신한다.
//   node scripts/update-boss-schedule.js        (GROQ_API_KEY 필요)
//   node scripts/update-boss-schedule.js --no-ai   (키 없이 이미지 비교만 — 기존 동작)
//
// 흐름:
//   1) 위키에서 이미지 주소 + "최근 수정 일시"를 긁어 data/boss-schedule-state.json과 비교
//   2) 바뀌었으면 이미지를 Groq(qwen/qwen3.8-27b 비전 기본, GROQ_MODEL로 교체 가능)에 보내 표를 JSON으로 읽게 함
//   3) 검증: 시각(HH:MM), 요일(월~일), 보스명은 plugins.json의 choices와 정확히 일치해야 함
//      + 기존 시간표와 달라진 칸은 이미지에 "그 칸만" 다시 물어 재확인
//        — AI가 행·칸을 통째로 누락한 사고는 잡고, 이벤트 종료로 칸이 사라진 정상 변경은 통과시킨다
//        (2026-11 이전 방식: "이전에 있던 칸이 빠졌으면 무조건 오류" → 정상 삭제까지 모두 막아
//         이벤트 보스(동심 12호) 종료 후 갱신이 영구히 중단되는 사고 발생 → 이 방식으로 교체)
//   4) 통과하면 bosses.json을 갱신하고 변경 내역을 GITHUB_OUTPUT으로 알림
//   5) 판독이 실패하면 자동 커밋하지 않고 needsReview=true로 사람을 부른다
//   6) GROQ_API_KEY가 없으면 AI 없이(기존 방식) 이미지 변경 알림만 한다
const fs = require('fs');
const path = require('path');

const SOURCE = 'https://www.kr.playblackdesert.com/ko-kr/Wiki?wikiNo=167';
const ROOT = path.join(__dirname, '..');
const STATE = path.join(ROOT, 'data', 'boss-schedule-state.json');
const BOSSES = path.join(ROOT, 'bosses.json');
const PLUGINS = path.join(ROOT, 'plugins.json');
const UA = 'Mozilla/5.0 (compatible; ChzzkAlertBossScheduleBot)';
// Gemini 무료 티어는 429/503이 잦고 응답이 멈춰 타임아웃으로 Job 전체가 죽는 일이 반복되어
// Groq 무료 티어(qwen3.8-27b 비전, 한국어·JSON 모드 지원)로 교체 (2026-10-30).
const MODEL = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
const API_BASE = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1'; // 테스트용 오버라이드 가능
const TIMEOUT_MS = 60000; // 응답이 멈춰도 무한 대기하지 않도록 요청당 소켓 타임아웃

// 이미지의 요일 순서(월~일) → bosses.json의 day 번호(0=일 1=월 … 6=토)
const DAY_NO = { '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6, '일': 0 };

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
  const res = await fetch(SOURCE, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
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

// 시간표 이미지를 내려받는다 (전체 판독 + 변경 칸 재확인에서 한 번만 받아 재사용)
// Groq 응답 시각 (OTPM = 분당 출력 토큰 윈도우 관리용)
let lastGroqAt = 0;

// 전체 판독 직후엔 방금 생성한 출력 토큰이 OTPM 윈도우를 채우고 있어 재확인 요청이
// 429("Request too large ... output tokens per minute")로 거절된다. 마지막 Groq 응답부터
// 61초가 지나도록 기다려 윈도우를 비운 뒤 요청한다.
async function waitOtpmWindow() {
  const need = lastGroqAt ? lastGroqAt + 61000 - Date.now() : 0;
  if (need <= 0) return;
  console.log('OTPM 윈도우 대기 ' + Math.ceil(need / 1000) + '초 (직전 판독 출력이 분당 한도를 채운 상태)...');
  await new Promise((r) => setTimeout(r, need));
}

async function fetchImage(imageUrl) {
  const res = await fetch(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error('이미지 다운로드 HTTP ' + res.status);
  return Buffer.from(await res.arrayBuffer());
}

// Groq(OpenAI 호환 API)로 이미지+프롬프트를 보내 JSON 객체를 돌려준다.
// maxTokens: 응답 상한. 이 오가는 OTPM(분당 출력 토큰) 한도가 낮아(예: 1000) 상한이 크면
// 429("Request too large ... output tokens per minute")로 거절될 수 있다.
async function callGroq(buf, prompt, maxTokens) {
  if (!maxTokens) maxTokens = 4096;
  let res = null;
  // 무료 티어는 429(속도 제한)·503이 잦으니 재시도 (최대 4회)
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      res = await fetch(API_BASE + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.GROQ_API_KEY },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0,
          max_completion_tokens: maxTokens,
          response_format: { type: 'json_object' },
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: 'data:image/png;base64,' + buf.toString('base64') } },
            ],
          }],
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      lastGroqAt = Date.now();
    } catch (e) {
      // 타임아웃·네트워크 오류도 재시도 대상 (Gemini 시절 "멈춤"의 주원인)
      if (attempt === 4) throw new Error('Groq 요청 실패(타임아웃/네트워크): ' + e.message);
      const wait = 10000 * attempt;
      console.log('Groq 요청 오류(' + e.message + ') (시도 ' + attempt + '/4) — ' + wait + 'ms 후 재시도...');
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (res.status === 429) {
      // OTPM/TPM은 1분 단위 윈도우라 짧은 재시도로는 안 빠진다 → retry-after(초) 또는 62초 대기
      const ra = parseInt(res.headers.get('retry-after') || '', 10);
      const wait = (ra > 0 ? Math.min(ra, 90) : 62) * 1000;
      if (attempt === 4) break; // 마지막 시도는 오류 본문을 그대로 흘려보냄
      console.log('Groq HTTP 429 (시도 ' + attempt + '/4) — ' + (wait / 1000) + '초 대기 후 재시도...');
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (res.status === 503) {
      const wait = 10000 * attempt;
      console.log('Groq HTTP 503 (시도 ' + attempt + '/4) — ' + wait + 'ms 후 재시도...');
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    break;
  }
  if (!res.ok) throw new Error('Groq HTTP ' + res.status + ': ' + (await res.text()).slice(0, 300));
  const data = await res.json();
  const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!text) throw new Error('Groq 응답에 텍스트 없음: ' + JSON.stringify(data).slice(0, 300));
  return JSON.parse(text);
}

// 시간표 전체를 한 번에 읽는다.
async function askAI(buf, known) {
  const prompt = [
    '이 이미지는 검은사막 한국 서버 위키의 "월드 우두머리 레이드" 시간표 표다.',
    '세로 머리글은 시작 시각(KST), 가로 머리글은 요일이며 열 순서는 월, 화, 수, 목, 금, 토, 일이다.',
    '각 칸에는 그 시각·요일에 등장하는 우두머리 이름이 적혀 있다(칸당 1~2명, 비어 있으면 없음).',
    '표에서 보이는 모든 시각·요일 칸을 빠짐없이 나열한 JSON을 만들어라.',
    'JSON 스키마: {"schedule":[{"time":"HH:MM","day":"월","bosses":["이름", ...]}, ...]}',
    '- time은 이미지에 적힌 시각을 HH:MM 24시간제로 고쳐 쓴다 (예: 오전 2:00 → "02:00").',
    '- day는 해당 칸의 요일 이름(월~일) 하나.',
    '- bosses는 그 칸의 보스 이름 배열. 다음 목록에 없는 이름을 쓰지 말고 철자를 그대로 복사한다:',
    known.join('·'),
    '- 표에 없는 시각이나 보스를 만들지 않는다. 확실히 읽지 못한 칸은 생략한다.',
    '- 한글은 끝글자까지 정확히 읽는다. 특히 "우"/"유", "ㅓ"/"ㅜ"처럼 비슷한 낱간 글자나 마지막 글자를 틀리기 쉬우니 보스명 목록의 철자와 대조해 확인한다.',
    '- JSON 객체만 출력하고 설명 텍스트는 붙이지 않는다.',
  ].join('\n');
  const data = await callGroq(buf, prompt);
  return data.schedule || [];
}

// 기존과 달라진 칸만 이미지에 집중해서 다시 읽게 한다 (재확인용 2차 판독).
// changed: [{time, dayNo, day, was, now}] — 요청한 모든 칸을 반드시 출력하게 하고,
// 빈 칸이면 bosses=[] 로 오게 한다. 응답에 없는 칸은 undefined라 호출부에서 오류로 다룬다.
async function askCells(buf, known, changed) {
  const prompt = [
    '이 이미지는 검은사막 한국 서버 위키의 "월드 우두머리 레이드" 시간표 표다.',
    '열 순서는 월, 화, 수, 목, 금, 토, 일이다.',
    '아래 요청 칸만 집중해서 정확히 읽어라. 요청한 모든 칸을 반드시 출력하되, 그 칸이 비어 있거나'
    + ' 표에 존재하지 않으면 bosses를 빈 배열로 출력한다 (생략하지 않는다).',
    'JSON 스키마: {"schedule":[{"time":"HH:MM","day":"월","bosses":["이름", ...]}, ...]}',
    '요청 칸: ' + changed.map((c) => c.time + ' ' + c.day).join(' / '),
    '- bosses는 그 칸의 보스 이름 배열. 다음 목록에 없는 이름을 쓰지 말고 철자를 그대로 복사한다:',
    known.join('·'),
    '- 한글은 끝글자까지 정확히 읽는다. "우"/"유", "ㅓ"/"ㅜ"처럼 비슷한 낱간 글자나 마지막 글자를 틀리기 쉬우니 보스명 목록의 철자와 대조해 확인한다.',
    '- JSON 객체만 출력하고 설명 텍스트는 붙이지 않는다.',
  ].join('\n');
  const data = await callGroq(buf, prompt, Math.min(900, 200 + changed.length * 60));
  const out = new Map();
  for (const c of data.schedule || []) {
    if (!/^\d{2}:\d{2}$/.test(c.time || '')) continue;
    const dayNo = DAY_NO[c.day];
    if (dayNo === undefined) continue;
    out.set(c.time + '|' + dayNo, (c.bosses || []).map((s) => String(s).trim()).filter(Boolean));
  }
  return out;
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
        if (near.length) {
          errors.push('목록에 없는 보스명 "' + b + '" (비슷한 이름: ' + near.join(', ') + ') — 오탈자로 보임');
        } else if (!/^[가-힣A-Za-z0-9 ]{2,15}$/.test(b)) {
          errors.push('새 보스명 형식 이상: ' + JSON.stringify(b));
        }
        // 근사 이름이 없는 완전히 새 이름(예: 동심 12호)은 통과 — 체크 목록은 아래에서 자동 동기화된다
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

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

function sameBosses(a, b) {
  return a.slice().sort().join('|') === b.slice().sort().join('|');
}

// schedule 배열 -> Map('time|dayNo' -> bosses). 없는 칸은 키가 없다.
function cellMap(schedule) {
  const m = new Map();
  for (const s of schedule || []) for (const k of Object.keys(s.days || {})) m.set(s.time + '|' + k, s.days[k]);
  return m;
}

// 기존 시간표(prev)와 새 판독에서 값이 달라진 칸 목록 (삭제·추가·보스 구성 변경 모두 포함).
// 달라진 칸만 이미지에 재확인을 요청한다 - 값이 그대로인 칸은 기존 데이터가 이미 검증된 것이므로 제외.
function diffCells(prevSchedule, schedule) {
  const a = cellMap(prevSchedule);
  const b = cellMap(schedule);
  const out = [];
  for (const key of new Set([...a.keys(), ...b.keys()])) {
    const was = a.get(key) || [];
    const now = b.get(key) || [];
    if (sameBosses(was, now)) continue;
    const [time, d] = key.split('|');
    out.push({ time, dayNo: +d, day: DAY_NAMES[+d], was, now });
  }
  out.sort((x, y) => x.time.localeCompare(y.time) || x.dayNo - y.dayNo);
  return out;
}

// bosses.json의 schedule 배열 → 사람이 읽는 비교용 텍스트
function describe(schedule) {
  return schedule.map((s) => '  ' + s.time + ' ' + Object.keys(s.days)
    .sort((a, b) => a - b)
    .map((d) => ['일', '월', '화', '수', '목', '금', '토'][d] + ':' + s.days[d].join('+'))
    .join('  ')).join('\n');
}

// 시간표 기준으로 plugins.json(베타)과 release/plugins.json(정식)의 우두머리 체크 목록을 맞춘다.
// 배포된 앱은 plugins.json을 원격으로 받으므로, 플러그인 코드는 건드리지 않고 이 파일만 맞추면
// 앱 업데이트 없이 "알림받을 우두머리" 체크 항목이 바뀐다. 새 보스는 마지막 그룹에 추가된다.
function syncBossChoices(schedule) {
  const names = [];
  for (const s of schedule) for (const k of Object.keys(s.days)) for (const n of s.days[k]) if (n && !names.includes(n)) names.push(n);
  if (!names.length) return false;
  let changedAny = false;
  for (const mp of [PLUGINS, path.join(ROOT, 'release', 'plugins.json')]) {
    let man;
    try { man = JSON.parse(fs.readFileSync(mp, 'utf8')); } catch (e) { continue; }
    const opt = (man.plugins || []).flatMap((p) => p.options || [])
      .find((o) => Array.isArray(o.choices) && o.choices.includes('크자카'));
    if (!opt) continue;
    const before = JSON.stringify({ c: opt.choices, d: opt.default, g: opt.groups });
    // choices: 기존 순서 유지 + 새 이름 추가 + 시간표에서 빠진 이름 제거
    const kept = (opt.choices || []).filter((c) => names.includes(c));
    const added = names.filter((n) => !kept.includes(n));
    const next = kept.concat(added);
    // groups: 빠진 이름 제거(빈 그룹 삭제), 새 이름은 마지막 그룹에 추가
    let groups = (Array.isArray(opt.groups) ? opt.groups : []).map((g) => g.filter((c) => next.includes(c))).filter((g) => g.length);
    if (added.length) {
      if (!groups.length) groups = [added.slice()];
      else added.forEach((n) => groups[groups.length - 1].push(n));
    }
    opt.choices = next;
    opt.default = next.slice();
    opt.groups = groups;
    if (before === JSON.stringify({ c: opt.choices, d: opt.default, g: opt.groups })) continue;
    fs.writeFileSync(mp, JSON.stringify(man, null, 2) + '\n');
    changedAny = true;
    console.log('체크 목록 동기화: ' + path.relative(ROOT, mp) + ' → ' + next.join(', '));
  }
  return changedAny;
}

async function main() {
  const noAi = process.argv.includes('--no-ai');
  const apiKey = process.env.GROQ_API_KEY;
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
    console.log(noAi ? '--no-ai 지정' : 'GROQ_API_KEY 없음');
    setOutput('changed', 'true');
    setOutput('needsReview', 'true');
    setOutput('aiUsed', 'false');
    setOutput('modified', modified);
    setOutput('imageUrl', imageUrl);
    setOutput('body', '위키 시간표 이미지가 바뀌었습니다. AI 키가 없어 자동 판독하지 못했습니다.\n\n- 새 이미지(공식 사이트): ' + imageUrl + '\n- 수정 일시: ' + modified + '\n\n이미지를 보고 `bosses.json`을 고쳐 주세요.');
    return;
  }

  // 허용 목록: plugins.json(베타) + release/plugins.json(정식) + 기존 bosses.json의 보스명 합집합
  // (이미 검증된 데이터에 실린 이름은 목록이 어긋나 있어도 판독·갱신 가능하게)
  const knownSet = new Set();
  for (const mp of [PLUGINS, path.join(ROOT, 'release', 'plugins.json')]) {
    try {
      JSON.parse(fs.readFileSync(mp, 'utf8')).plugins
        .flatMap((p) => p.options || [])
        .filter((o) => Array.isArray(o.choices) && o.choices.includes('크자카'))
        .forEach((o) => o.choices.forEach((c) => knownSet.add(c)));
    } catch (e) {}
  }
  try {
    JSON.parse(fs.readFileSync(BOSSES, 'utf8')).schedule
      .forEach((s) => Object.keys(s.days).forEach((k) => s.days[k].forEach((n) => knownSet.add(n))));
  } catch (e) {}
  const bosses = [...knownSet];
  if (!bosses.length) throw new Error('plugins.json에서 보스 목록을 찾지 못함');

  console.log('Groq(' + MODEL + ')로 판독 중...');
  const buf = await fetchImage(imageUrl);
  const cells = await askAI(buf, bosses);
  console.log('판독 칸 수: ' + cells.length);
  const old = JSON.parse(fs.readFileSync(BOSSES, 'utf8'));
  const { schedule, errors } = buildSchedule(cells, bosses);
  const newBosses = [...new Set(cells.flatMap((c) => (c.bosses || []).map((s) => String(s).trim()).filter(Boolean)))]
    .filter((b) => !bosses.includes(b));
  if (newBosses.length) console.log('목록에 없던 새 보스: ' + newBosses.join(', ') + ' (체크 목록에 자동 추가)');

  // 기존과 달라진 칸은 이미지에 "그 칸만" 다시 물어 재확인한다.
  // - AI가 행·칸을 통째로 누락한 사고(다음 보스가 멀리 뛰는 문제)는 재확인이 기존 값과 일치해 잡힌다.
  // - 반대로 이벤트 종료로 칸이 실제로 사라진 경우에는 재확인도 "없음"이라 새 판독과 일치해 통과한다.
  //   (2026-11 이전: 빠진 칸을 무조건 오류로 잡아 정상 삭제까지 막고 갱신이 영구 중단되는 사고 발생)
  const changedCells = diffCells(old.schedule, schedule);
  if (changedCells.length) {
    console.log('기존과 달라진 칸 ' + changedCells.length + '개 — 이미지 재확인: '
      + changedCells.map((c) => c.time + ' ' + c.day).join(', '));
    // 직전 전체 판독이 OTPM(분당 출력 토큰) 윈도우를 채운 상태라 바로 보내면 429("Request too large")가 난다.
    // 1분 이상 기다렸다가 윈도우가 비는 것을 확인하고 재확인 요청을 보낸다.
    await waitOtpmWindow();
    try {
      const checked = await askCells(buf, bosses, changedCells);
      for (const c of changedCells) {
        const v = checked.get(c.time + '|' + c.dayNo);
        if (!v) {
          errors.push('재확인 응답에 칸 누락: ' + c.time + ' ' + c.day);
        } else if (!sameBosses(v, c.now)) {
          errors.push('재확인 불일치: ' + c.time + ' ' + c.day
            + ' — 전체 판독=' + (c.now.length ? c.now.join('+') : '(없음)')
            + ' / 재확인=' + (v.length ? v.join('+') : '(없음)')
            + ' / 기존값=' + (c.was.length ? c.was.join('+') : '(없음)'));
        }
      }
    } catch (e) {
      errors.push('변경 칸 재확인 실패: ' + e.message);
    }
  } else {
    console.log('기존 시간표와 동일한 판독 — 재확인 생략');
  }
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
      + '확인 후 `data/boss-schedule-state.json`의 `modified` 값을 임의로 바꿔 저장하면 다음 실행에서 다시 판독합니다. (파일을 지우면 "처음 기록" 모드가 되어 판독하지 않음)');
    process.exit(0); // 실패해도 워크플로우는 Issue만 만들고 커밋하지 않음
  }

  const oldText = describe(old.schedule);
  const newText = describe(schedule);
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify({ source: SOURCE, imageUrl, modified, checkedAt: Date.now() }, null, 2) + '\n');
  setOutput('changed', 'true');
  setOutput('aiUsed', 'true');

  // 체크 목록도 함께 맞춘다 (배포된 앱이 plugins.json을 원격으로 받으므로 플러그인 코드 불필요)
  const pluginsChanged = syncBossChoices(schedule);

  if (oldText === newText && !pluginsChanged) {
    console.log('판독 결과가 기존 bosses.json과 동일 — 파일 변경 없음');
    setOutput('updated', 'false');
    return;
  }
  if (oldText !== newText) {
    old.schedule = schedule;
    old.updatedAt = Date.now();
    old.source = SOURCE;
    fs.writeFileSync(BOSSES, JSON.stringify(old, null, 2) + '\n');
    console.log('bosses.json 갱신 완료');
    setOutput('updated', 'true');
  } else {
    setOutput('updated', 'false');
    console.log('bosses.json 동일 — plugins.json 체크 목록만 동기화');
  }
  setOutput('modified', modified);
  setOutput('imageUrl', imageUrl);
  const removed = oldText.split('\n').filter((l) => !newText.includes(l.trim()));
  const added = newText.split('\n').filter((l) => !oldText.includes(l.trim()));
  const diff = [...removed.map((l) => '-' + l), ...added.map((l) => '+' + l)].join('\n') || '(내부 순서만 바뀜)';
  setOutput('diff', diff);
  const newNote = newBosses.length ? '- 새 우두머리(체크 목록에 자동 추가): **' + newBosses.join(', ') + '**\n' : '';
  const syncNote = pluginsChanged ? '- `plugins.json` / `release/plugins.json`의 체크 목록도 함께 동기화했습니다 (앱 업데이트 없이 반영)\n' : '';
  setOutput('body', 'AI(Groq)가 위키 시간표 이미지를 판독해 `bosses.json`을 자동 갱신했습니다.\n\n'
    + '- 새 이미지(공식 사이트): ' + imageUrl + '\n- 수정 일시: ' + modified + '\n\n'
    + (newNote || syncNote ? newNote + syncNote + '\n' : '')
    + '변경 내역:\n```\n' + diff + '\n```\n\n'
    + '시간대별 전체 시간표:\n```\n' + newText + '\n```\n\n'
    + '앱은 이 파일을 6시간마다 다시 받습니다. 값이 잘못됐다면 `bosses.json`을 고치고 이 Issue를 닫아 주세요.');
}

main().catch((e) => { console.error('실패:', e.message); process.exit(1); });
