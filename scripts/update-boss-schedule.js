// 검은사막 "시간표 > 월드 우두머리 레이드" 위키 페이지의 시간표 이미지가 바뀌었으면
// 로컬 OCR(Python RapidOCR)로 표를 읽어 bosses.json을 갱신한다.
//   node scripts/update-boss-schedule.js                 (변경 감지 → OCR 판독 → 검증 → 갱신)
//   node scripts/update-boss-schedule.js --no-ai         (AI 교차 검증 생략, OCR 재확인만)
//   node scripts/update-boss-schedule.js --image <png> --force --dry-run   (로컬 테스트, 파일 미기록)
//
// 흐름:
//   1) 위키에서 이미지 주소 + "최근 수정 일시"를 긁어 data/boss-schedule-state.json과 비교
//   2) 바뀌었으면 scripts/parse-timetable.py(Python RapidOCR PP-OCRv5 mobile)로 표를 판독한다
//      - 보스명 사전은 "매 판독 전" 위키 목차(table_contents)에서 새로 추출
//      - 1차 전체 이미지 OCR + 2차 행 밴드 재인식 + 3차 머리글 직접크롭 (요일은 구조상 월~일 고정)
//      - 빈칸은 픽셀 잉크로 "진짜 빈칸 / 인식 실패"를 구분 → 오판으로 보스가 삭제되는 것을 막는다
//   3) 검증: 시각(HH:MM), 요일(월~일), 보스명은 plugins.json의 choices와 정확히 일치해야 함
//      + 기존과 달라진 칸은 "다른 판독기"로 2차 재확인 → 확정 규칙 적용
//        2차 판독기: AI Groq(GROQ_API_KEY) → 실패하거나 키가 없으면 OCR 집중 재확인
//        1차==2차 → 채택 / 2차==기존값 → 기존값 / 그 외 → 3판(행 열거, AI만) → 그래도 미확정이면 사람 확인
//        — 같은 판독기 2회 판독은 오류가 상관됨(2026-11 실측 33%) → 2차는 반드시 다른 판독기
//      + 이미지에서 시각 자체가 사라진 행(이벤트 종료 등)은 좌측 시각 열 재확인으로 삭제 확정
//      + 이벤트 종료로 칸이 사라진 정상 삭제는 1차·2차 모두 "없음"이라 자동 통과
//   4) 통과하면 bosses.json을 갱신하고 변경 내역을 GITHUB_OUTPUT으로 알림
//   5) 판독이 실패하면 자동 커밋하지 않고 needsReview=true로 사람을 부른다
//   6) AI 키가 없어도 OCR 판독은 계속 된다 (--no-ai와 동일 동작, 2차는 OCR 재확인)
//
// 기존(Groq 전체 판독 + Gemini 교차 검증) 방식은 scripts/update-boss-schedule.legacy.js 로 보관했다.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const SOURCE = 'https://www.kr.playblackdesert.com/ko-kr/Wiki?wikiNo=167';
const ROOT = path.join(__dirname, '..');
const STATE = path.join(ROOT, 'data', 'boss-schedule-state.json');
const BOSSES = path.join(ROOT, 'bosses.json');
const PLUGINS = path.join(ROOT, 'plugins.json');
const UA = 'Mozilla/5.0 (compatible; ChzzkAlertBossScheduleBot)';

// ---- OCR (1차 판독기): Python + RapidOCR PP-OCRv5 mobile (GPU 불필요, Actions CPU에서 수십 초)
const PYTHON = process.env.PYTHON_BIN || 'python';
const PARSE = path.join(__dirname, 'parse-timetable.py');

// ---- AI (2차/3판 교차 검증 전용): Groq 한 곳만 쓴다 (무료 티어, GROQ_API_KEY)
// 키가 없거나 Groq 판독이 실패하면 2차는 OCR 집중 재확인으로 내려간다 (오판 삭제 방지는 잉크 검사가 담당).
const MODEL = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
const API_BASE = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';
const TIMEOUT_MS = 60000; // 요청당 소켓 타임아웃 (멈춤으로 Job이 죽지 않도록)

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

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function tmpFile(ext) {
  return path.join(os.tmpdir(), 'boss-schedule-' + Date.now() + '-'
    + Math.random().toString(36).slice(2, 8) + ext);
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

async function fetchImage(imageUrl) {
  const res = await fetch(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error('이미지 다운로드 HTTP ' + res.status);
  return Buffer.from(await res.arrayBuffer());
}

// ---------------------------------------------------------------- OCR 실행
// parse-timetable.py를 subprocess로 돌려 JSON을 받는다 (모델 로딩이 process마다 있어
// 전체 판독 1회 + 필요할 때 재확인 1회만 호출한다).
function runOcr(args, label, outPath) {
  const out = outPath || tmpFile('.json');
  const t0 = Date.now();
  const res = spawnSync(PYTHON, [PARSE, ...args, '--out', out], {
    encoding: 'utf8',
    timeout: 600000, // 전체 판독(밴드 11행+머리글)은 1~2분
    env: Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' }),
  });
  const log = ((res.stdout || '') + (res.stderr || '')).trim()
    .split('\n').filter((l) => l && !/INFO|WARNING|RapidOCR/.test(l));
  if (log.length) console.log('[ocr] ' + log.join('\n[ocr] '));
  if (res.error) throw new Error(label + ' 실행 실패: ' + res.error.message);
  if (res.status !== 0 || !fs.existsSync(out)) {
    throw new Error(label + ' 실패(code ' + res.status + '): ' + log.slice(-4).join(' | '));
  }
  console.log('[ocr] ' + label + ' 완료 ' + ((Date.now() - t0) / 1000).toFixed(1) + '초');
  return { data: JSON.parse(fs.readFileSync(out, 'utf8')), out };
}

// ---------------------------------------------------------------- Groq (2차 폴백)
// 무료 티어는 OTPM(분당 출력 토큰) 한도가 낮아 429가 잦다 → retry-after/62초 대기 후 재시도.
let lastGroqAt = 0;
async function waitOtpmWindow() {
  const need = lastGroqAt ? lastGroqAt + 61000 - Date.now() : 0;
  if (need <= 0) return;
  console.log('OTPM 윈도우 대기 ' + Math.ceil(need / 1000) + '초 (직전 판독 출력이 분당 한도를 채운 상태)...');
  await sleep(need);
}

async function callGroq(buf, prompt, maxTokens) {
  if (!maxTokens) maxTokens = 4096;
  let last = '응답 없음';
  for (let attempt = 1; attempt <= 4; attempt++) {
    let res;
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
      if (attempt === 4) throw new Error('Groq 요청 실패(타임아웃/네트워크): ' + e.message);
      const wait = 10000 * attempt;
      console.log('Groq 요청 오류(' + e.message + ') (시도 ' + attempt + '/4) — ' + wait + 'ms 후 재시도...');
      await sleep(wait);
      continue;
    }
    const retryAfter = res.headers.get('retry-after');
    let raw = '';
    try { raw = await res.text(); } catch (e) { raw = ''; } // 수신 즉시 소비 (지연 읽기 금지)
    if (res.status === 429) {
      const ra = parseInt(retryAfter || '', 10);
      const wait = (ra > 0 ? Math.min(ra, 90) : 62) * 1000;
      last = 'Groq HTTP 429' + (raw ? ': ' + raw.slice(0, 300) : '');
      if (attempt === 4) break;
      console.log('Groq HTTP 429 (시도 ' + attempt + '/4) — ' + (wait / 1000) + '초 대기 후 재시도...');
      await sleep(wait);
      continue;
    }
    if (res.status === 503) {
      last = 'Groq HTTP 503' + (raw ? ': ' + raw.slice(0, 300) : '');
      if (attempt === 4) break;
      const wait = 10000 * attempt;
      console.log('Groq HTTP 503 (시도 ' + attempt + '/4) — ' + wait + 'ms 후 재시도...');
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error('Groq HTTP ' + res.status + (raw ? ': ' + raw.slice(0, 300) : ''));
    const data = JSON.parse(raw);
    const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error('Groq 응답에 텍스트 없음: ' + raw.slice(0, 300));
    return JSON.parse(text);
  }
  throw new Error(last + ' (재시도 소진)');
}

// 2차 판독기 선택: Groq(키 있음) → OCR 집중 재확인(--no-ai 이거나 키 없음)
function pickVia(noAi) {
  if (noAi) return 'ocr';
  return process.env.GROQ_API_KEY ? 'groq' : 'ocr';
}

function viaLabel(via) {
  if (via === 'groq') return 'AI Groq(' + MODEL + ')';
  return 'OCR 집중 재확인';
}

// 2차·3판 판독 요청 (Groq). OTPM 윈도우 대기까지 포함한다.
async function send(buf, prompt, maxTokens) {
  await waitOtpmWindow();
  return callGroq(buf, prompt, maxTokens);
}

// 기존과 달라진 칸만 이미지에 집중해서 다시 읽게 한다 (2차 판독).
// 모든 요청 칸을 반드시 출력하게 하고, 빈 칸이면 bosses=[] 로 오게 한다.
// 응답에 없는 칸은 undefined라 호출부에서 불일치로 다룬다.
async function askCells(buf, known, changed) {
  const prompt = [
    '이 이미지는 검은사막 한국 서버 위키의 "월드 우두머리 레이드" 시간표 표다.',
    '열 순서는 월, 화, 수, 목, 금, 토, 일 이며 각 열의 폭은 같다.',
    '아래 요청 칸만 집중해서 정확히 확인해 답하라. 요청한 모든 칸을 반드시 출력하고,'
    + ' 그 칸이 비어 있으면 bosses를 빈 배열로 출력한다 (생략하지 않는다).',
    'JSON 스키마: {"schedule":[{"time":"HH:MM","day":"월","bosses":["이름", ...]}, ...]}',
    '요청 칸: ' + changed.map((c) => c.time + ' ' + c.day).join(' / '),
    '- bosses는 그 칸의 보스 이름 배열. 다음 목록에 없는 이름을 쓰지 말고 철자를 그대로 복사한다:',
    known.join('·'),
    '- 반드시 칸의 세로선·가로선으로 경계를 확인할 것. 같은 시각 줄의 이웃 요일 칸 내용을 이 칸에'
    + ' 옮겨 적지 않고, 비어 있는 칸에 이웃 내용을 채우지 않는다.',
    '- 한글은 끝글자까지 정확히 읽는다. "우"/"유", "ㅓ"/"ㅜ"처럼 비슷한 낱간 글자나 마지막 글자를 틀리기 쉬우니 보스명 목록의 철자와 대조해 확인한다.',
    '- JSON 객체만 출력하고 설명 텍스트는 붙이지 않는다.',
  ].join('\n');
  const data = await send(buf, prompt, Math.min(900, 200 + changed.length * 60));
  const out = new Map();
  for (const c of data.schedule || []) {
    if (!/^\d{2}:\d{2}$/.test(c.time || '')) continue;
    const dayNo = DAY_NO[c.day];
    if (dayNo === undefined) continue;
    out.set(c.time + '|' + dayNo, (c.bosses || []).map((s) => String(s).trim()).filter(Boolean));
  }
  return out;
}

// 3판용: 해당 시각의 "행 전체 7칸"을 요일 순서로 열거하게 한다 (프롬프트 구조를 바꿔 오류 상관을 끊는다).
async function askRows(buf, known, times) {
  const prompt = [
    '이 이미지는 검은사막 한국 서버 위키의 "월드 우두머리 레이드" 시간표 표다.',
    '열 순서는 월, 화, 수, 목, 금, 토, 일 이며 각 열의 폭은 같다.',
    '아래 시각의 행을 요일 7칸 전부에 대해 왼쪽부터 월, 화, 수, 목, 금, 토, 일 순서로 빠짐없이 적어라.',
    '각 행의 cells 배열은 정확히 7개여야 하며, 비어 있는 칸은 빈 배열 []로 둔다 (건너뛰지 않는다).',
    'JSON 스키마: {"rows":[{"time":"HH:MM","cells":[[], ["이름"], ... (7개)]}]}',
    '확인할 시각: ' + times.join(', '),
    '- 보스 이름은 이 목록에서만 고르고 철자를 그대로 복사한다:',
    known.join('·'),
    '- 반드시 칸의 세로선으로 경계를 확인하고 이웃 칸의 내용을 옮기지 않는다.',
    '- JSON 객체만 출력하고 설명 텍스트는 붙이지 않는다.',
  ].join('\n');
  const data = await send(buf, prompt, Math.min(900, 200 + times.length * 90));
  const out = new Map();
  const ORDER = [1, 2, 3, 4, 5, 6, 0]; // cells[0]=월 … cells[6]=일
  for (const r of data.rows || []) {
    if (!/^\d{2}:\d{2}$/.test(r.time || '')) continue;
    (r.cells || []).slice(0, 7).forEach((cell, i) => {
      out.set(r.time + '|' + ORDER[i], (Array.isArray(cell) ? cell : []).map((s) => String(s).trim()).filter(Boolean));
    });
  }
  return out;
}

// ---------------------------------------------------------------- 검증·조립 (기존 로직 유지)
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
        // 근사 이름이 없는 완전히 새 이름은 통과 — 체크 목록은 아래에서 자동 동기화된다
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

// 1차(OCR 전체 판독)와 2차(재확인)가 다를 때 최종값을 정한다.
//   A == C        → 채택
//   C == 기존값   → 기존값 유지 (1차 판독이 누락/오독한 경우)
//   그 외         → null (미확정 → 3판 행 열거로 해결, 그래도 없으면 사람 확인)
// 빈 배열([])도 값으로 취급한다(삭제 확정). C가 undefined(확인 실패)면 항상 null.
function resolveCell(aVal, cVal, prevVal) {
  if (Array.isArray(cVal)) {
    if (sameBosses(aVal, cVal)) return aVal;
    if (sameBosses(cVal, prevVal)) return prevVal;
  }
  return null;
}

// 확정된 칸 값(Map 'time|dayNo' → bosses)을 schedule에 반영한다.
function applyResolutions(schedule, resolutions) {
  const rows = new Map(schedule.map((s) => [s.time, { time: s.time, days: { ...s.days } }]));
  for (const [key, val] of resolutions) {
    const [time, d] = key.split('|');
    let row = rows.get(time);
    if (!row) {
      if (!val.length) continue;
      row = { time, days: {} };
      rows.set(time, row);
    }
    if (val.length) row.days[d] = val;
    else delete row.days[d];
  }
  return [...rows.values()]
    .filter((r) => Object.keys(r.days).length)
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((r) => {
      const d = {};
      for (const k of Object.keys(r.days).sort((a, b) => a - b)) d[k] = r.days[k];
      return { time: r.time, days: d };
    });
}

// bosses.json의 schedule 배열 → 사람이 읽는 비교용 텍스트
function describe(schedule) {
  return schedule.map((s) => '  ' + s.time + ' ' + Object.keys(s.days)
    .sort((a, b) => a - b)
    .map((d) => ['일', '월', '화', '수', '목', '금', '토'][d] + ':' + s.days[d].join('+'))
    .join('  ')).join('\n');
}

// 시간표 기준으로 plugins.json(베타)과 release/plugins.json(정식)의 우두머리 체크 목록을 맞춘다.
function syncBossChoices(schedule, dryRun) {
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
    if (dryRun) {
      console.log('[dry-run] 체크 목록 동기화 예정: ' + path.relative(ROOT, mp) + ' → ' + next.join(', '));
      changedAny = true;
      continue;
    }
    fs.writeFileSync(mp, JSON.stringify(man, null, 2) + '\n');
    changedAny = true;
    console.log('체크 목록 동기화: ' + path.relative(ROOT, mp) + ' → ' + next.join(', '));
  }
  return changedAny;
}

// OCR 집중 재확인: 요청 칸만 (1) 셀 크롭 → (2) 행 밴드 순으로 재인식하고,
// 이미지에 없는 시각은 좌측 시각 열 전체로 "행 삭제"를 확인한다.
// Map('time|dayNo' → {bosses, emptyConfirmed}) + missingTimes(삭제 확정된 시각) 반환.
function ocrRecheck(imgFile, gridFile, changed) {
  const cellsFile = tmpFile('.cells.json');
  fs.writeFileSync(cellsFile, JSON.stringify(changed.map((c) => ({ time: c.time, day: c.day })), null, 1));
  const { data } = runOcr(['--image', imgFile, '--grid', gridFile, '--cells', cellsFile], '변경 칸 집중 재확인');
  const map = new Map();
  for (const r of data.recheck || []) {
    map.set(r.time + '|' + DAY_NO[r.day], { bosses: r.bosses || [], emptyConfirmed: !!r.emptyConfirmed });
  }
  return { map, missingTimes: data.missingTimes || [] };
}

// 검증 실패 → 자동 커밋하지 않고 상태도 갱신하지 않아 다음 실행에서 재시도한다
function emitReview(errors, schedule, imageUrl, modified) {
  console.error('판독 검증 실패:\n- ' + errors.join('\n- '));
  setOutput('changed', 'true');
  setOutput('needsReview', 'true');
  setOutput('aiUsed', 'true');
  setOutput('modified', modified);
  setOutput('imageUrl', imageUrl);
  setOutput('body', '자동 판독에 실패했습니다. 아래 오류를 보고 `bosses.json`을 확인해 주세요.\n\n'
    + '- 새 이미지(공식 사이트): ' + imageUrl + '\n- 수정 일시: ' + modified + '\n\n'
    + '검증 오류:\n' + errors.map((e) => '- ' + e).join('\n') + '\n\n'
    + '판독 원본(JSON):\n```json\n' + JSON.stringify(schedule, null, 2) + '\n```\n\n'
    + '확인 후 `data/boss-schedule-state.json`의 `modified` 값을 임의로 바꿔 저장하면 다음 실행에서 다시 판독합니다. (파일을 지우면 "처음 기록" 모드가 되어 판독하지 않음)');
  process.exit(0); // 실패해도 워크플로우는 Issue만 만들고 커밋하지 않음
}

async function main() {
  const noAi = process.argv.includes('--no-ai');
  const dryRun = process.argv.includes('--dry-run');
  const force = process.argv.includes('--force');
  const imgIdx = process.argv.indexOf('--image');
  const localImage = imgIdx >= 0 ? process.argv[imgIdx + 1] : null;
  const modIdx = process.argv.indexOf('--modified');
  const modifiedOverride = modIdx >= 0 ? process.argv[modIdx + 1] : null;

  // ---- 1) 위키 변경 감지 (로컬 이미지 테스트 모드에선 생략)
  let imageUrl, modified;
  if (localImage) {
    imageUrl = '(로컬 이미지: ' + path.basename(localImage) + ')';
    modified = modifiedOverride || '(로컬 테스트)';
    console.log('로컬 이미지 판독 모드: ' + localImage);
  } else {
    const wiki = await fetchWiki();
    imageUrl = wiki.imageUrl;
    modified = modifiedOverride || wiki.modified;
  }

  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) {}
  const changed = !!prev && (prev.imageUrl !== imageUrl || prev.modified !== modified);
  if (localImage || force) {
    console.log(force ? '--force: 상태와 무관하게 판독 진행' : '');
  } else if (!prev) {
    // 처음 기록 (판독하지 않음 — 이미지가 실제로 바뀐 것이 아닐 수 있음)
    if (!dryRun) {
      fs.mkdirSync(path.dirname(STATE), { recursive: true });
      fs.writeFileSync(STATE, JSON.stringify({ source: SOURCE, imageUrl, modified, checkedAt: Date.now() }, null, 2) + '\n');
      console.log('상태 처음 기록 (' + modified + ')');
      setOutput('changed', 'false');
      return;
    }
    console.log('상태 기록 없음 — dry-run이므로 판독 진행');
  } else if (!changed) {
    console.log('변경 없음 (' + modified + ')');
    setOutput('changed', 'false');
    return;
  } else {
    console.log('시간표 변경 감지: ' + prev.modified + ' → ' + modified);
  }

  // ---- 2) 이미지 확보 → OCR 전체 판독
  let imgFile = localImage;
  if (!imgFile) {
    const buf = await fetchImage(imageUrl);
    imgFile = tmpFile('.png');
    fs.writeFileSync(imgFile, buf);
  }
  console.log('OCR 판독 중 (RapidOCR PP-OCRv5, Python)...');
  const parsed = runOcr(['--image', imgFile], '전체 판독');
  const ocr = parsed.data;
  console.log('판독: 시각 ' + ocr.stats.times + '개, 머리글 ' + ocr.stats.header + '/7, 셀 ' + ocr.stats.cells
    + ', 빈칸 ' + ocr.stats.empties + ', 미인식 ' + ocr.stats.unread + ', 충돌 ' + ocr.stats.conflicts);

  // ---- 허용 목록: plugins.json + release/plugins.json + 기존 bosses.json + 위키 목차(OCR 사전)
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
  (ocr.vocab || []).forEach((v) => knownSet.add(v)); // 매 판독 전 위키 목차에서 추출한 사전
  const bosses = [...knownSet];
  if (!bosses.length) throw new Error('보스 목록을 찾지 못함 (plugins.json + 위키 목차)');

  // ---- 3) 검증용 조립 (같은 time+day의 2줄은 하나의 칸으로 병합)
  const old = JSON.parse(fs.readFileSync(BOSSES, 'utf8'));
  const merged = new Map();
  for (const c of ocr.cells) {
    const key = c.time + '|' + c.day;
    if (!merged.has(key)) merged.set(key, { time: c.time, day: c.day, bosses: [] });
    for (const b of c.bosses || []) if (!merged.get(key).bosses.includes(b)) merged.get(key).bosses.push(b);
  }
  const { schedule, errors } = buildSchedule([...merged.values()], bosses);

  // OCR 구조 오류: 머리글 누락 / 잉크 있는데 인식 실패 / 1·2차 충돌
  // — 기존 값이 있는 칸은 아래 2차 재확인이 처리하므로 여기서는 건너뛴다(오판 삭제 방지는 2차가 담당).
  const prevMap = cellMap(old.schedule);
  for (const h of ocr.headerMissing || []) errors.push('머리글 요일 "' + h + '" 인식 실패');
  for (const u of ocr.unread || []) {
    const key = u.time + '|' + DAY_NO[u.day];
    if (prevMap.has(key) && prevMap.get(key).length) continue; // 기존값 있음 → 2차 재확인이 재판독
    errors.push('이미지에 글자가 있으나 인식 실패: ' + u.time + ' ' + u.day
      + (u.line > 1 ? ' ' + u.line + '줄' : '') + (u.raw ? ' (원본 "' + u.raw + '")' : '') + ' — 사람이 확인 필요');
  }
  for (const c of ocr.conflicts || []) {
    errors.push('OCR 1·2차 판독 불일치: ' + c.time + ' ' + c.day + ' ' + c.line + '줄 — ' + c.a + '(' + c.srcA + ') vs ' + c.b + '(' + c.srcB + ')');
  }
  if (errors.length) emitReview(errors, schedule, imageUrl, modified); // AI 호출 낭비 없이 바로 사람 확인

  // ---- 4) 기존과 달라진 칸만 2차 재확인 (다른 판독기)
  const changedCells = diffCells(old.schedule, schedule);
  let finalSchedule = schedule;
  let usedVia = null;
  if (changedCells.length) {
    // OCR 집중 재확인은 항상 1회 돌린다 — 행 삭제(시각 소멸) 확정 + via='ocr' 때 C값으로 사용
    const rc = ocrRecheck(imgFile, parsed.out, changedCells);
    const resolutions = new Map();
    const rest = [];
    for (const c of changedCells) {
      if (rc.missingTimes.includes(c.time)) {
        // 시각 자체가 이미지에 없음(좌측 시각 열 재확인에서도 못 찾음) → 행 삭제 확정
        resolutions.set(c.time + '|' + c.dayNo, []);
        console.log('행 삭제 확정: ' + c.time + ' ' + c.day + ' (이미지에 시각 없음)');
      } else {
        rest.push(c);
      }
    }
    if (rest.length) {
      let via = pickVia(noAi);
      usedVia = via;
      console.log('기존과 달라진 칸 ' + rest.length + '개 — 2차 판독(' + viaLabel(via) + '): '
        + rest.map((c) => c.time + ' ' + c.day).join(', '));
      const buf = fs.readFileSync(imgFile);
      // OCR 집중 재확인 결과 → Map. 잉크가 있는데 아무것도 못 읽으면 "빈칸 확정"으로 채택하지 않는다 (오판 삭제 방지)
      const ocrSecond = () => {
        const m = new Map();
        for (const c of rest) {
          const r = rc.map.get(c.time + '|' + c.dayNo);
          if (!r) continue;
          m.set(c.time + '|' + c.dayNo, r.bosses.length ? r.bosses : (r.emptyConfirmed ? [] : undefined));
        }
        return m;
      };
      try {
        let second;
        if (via === 'groq') {
          try {
            second = await askCells(buf, bosses, rest);
          } catch (e) {
            // Groq 장애·타임아웃·키 문제 → OCR 집중 재확인으로 즉시 대체하고 계속 진행
            console.log('Groq 2차 판독 실패(' + e.message + ') — OCR 집중 재확인으로 대체');
            via = 'ocr';
            usedVia = 'ocr';
            second = ocrSecond();
          }
        } else {
          second = ocrSecond();
        }
        const fmt = (v) => (Array.isArray(v) ? (v.length ? v.join('+') : '(없음)') : '(확인 실패)');
        const unresolved = [];
        for (const c of rest) {
          const r = resolveCell(c.now, second.get(c.time + '|' + c.dayNo), c.was);
          if (r) resolutions.set(c.time + '|' + c.dayNo, r);
          else unresolved.push({ c, got: second.get(c.time + '|' + c.dayNo) });
        }
        // 3판: 프롬프트 구조를 바꾼 "행 전체 7칸 열거"로 재질의해 오류 상관을 끊는다 (AI일 때만)
        if (unresolved.length && via !== 'ocr') {
          console.log('2차 판독으로도 확정 못한 칸 ' + unresolved.length + '개 — 3판(행 열거): '
            + unresolved.map((u) => u.c.time + ' ' + u.c.day).join(', '));
          const third = await askRows(buf, bosses, [...new Set(unresolved.map((u) => u.c.time))]);
          for (const u of unresolved) {
            const k = u.c.time + '|' + u.c.dayNo;
            const d = third.get(k);
            let r = null;
            if (Array.isArray(d)) {
              if (sameBosses(d, u.c.now)) r = u.c.now;
              else if (sameBosses(d, u.c.was)) r = u.c.was;
              else if (Array.isArray(u.got) && sameBosses(d, u.got)) r = u.got;
            }
            if (r) resolutions.set(k, r);
            else errors.push('판독 불일치(미확정): ' + u.c.time + ' ' + u.c.day
              + ' — 1차=' + fmt(u.c.now) + ' / 2차=' + fmt(u.got) + ' / 3판=' + fmt(d)
              + ' / 기존값=' + fmt(u.c.was));
          }
        } else {
          for (const u of unresolved) {
            errors.push('판독 불일치(미확정): ' + u.c.time + ' ' + u.c.day
              + ' — 1차=' + fmt(u.c.now) + ' / 2차=' + fmt(u.got) + ' / 기존값=' + fmt(u.c.was)
              + ' (OCR 재확인으로는 확정 불가 — 사람이 확인 필요)');
          }
        }
        finalSchedule = applyResolutions(schedule, resolutions);
        console.log('2차 재확인 반영: ' + resolutions.size + '칸 확정'
          + (errors.length ? ', 미확정 ' + errors.filter((e) => e.startsWith('판독 불일치')).length + '칸' : ''));
      } catch (e) {
        errors.push('2차 판독 실패(' + via + '): ' + e.message);
      }
    } else {
      finalSchedule = applyResolutions(schedule, resolutions);
      console.log('변경 칸 전부 행 삭제로 확정 — AI 2차 생략');
    }
  } else {
    console.log('기존 시간표와 동일한 판독 — 2차 판독 생략');
  }

  // 최종 확정 시간표 기준으로 새 보스를 다시 계산한다
  const finalNames = new Set(finalSchedule.flatMap((s) => Object.values(s.days).flat()));
  const newBosses = [...finalNames].filter((b) => !bosses.includes(b));
  if (newBosses.length) console.log('목록에 없던 새 보스: ' + newBosses.join(', ') + ' (체크 목록에 자동 추가)');
  if (errors.length) emitReview(errors, finalSchedule, imageUrl, modified);

  const oldText = describe(old.schedule);
  const newText = describe(finalSchedule);
  if (!dryRun) {
    fs.mkdirSync(path.dirname(STATE), { recursive: true });
    fs.writeFileSync(STATE, JSON.stringify({ source: SOURCE, imageUrl, modified, checkedAt: Date.now() }, null, 2) + '\n');
  } else {
    console.log('[dry-run] 상태 파일 미기록');
  }
  setOutput('changed', 'true');
  setOutput('aiUsed', 'true');

  // 체크 목록도 함께 맞춘다 (배포된 앱이 plugins.json을 원격으로 받으므로 플러그인 코드 불필요)
  const pluginsChanged = syncBossChoices(finalSchedule, dryRun);

  if (oldText === newText && !pluginsChanged) {
    console.log('판독 결과가 기존 bosses.json과 동일 — 파일 변경 없음');
    setOutput('updated', 'false');
    return;
  }
  if (oldText !== newText) {
    if (dryRun) {
      console.log('[dry-run] bosses.json 갱신 예정');
    } else {
      old.schedule = finalSchedule;
      old.updatedAt = Date.now();
      old.source = SOURCE;
      fs.writeFileSync(BOSSES, JSON.stringify(old, null, 2) + '\n');
      console.log('bosses.json 갱신 완료');
    }
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
  console.log('변경 내역:\n' + diff);
  const newNote = newBosses.length ? '- 새 우두머리(체크 목록에 자동 추가): **' + newBosses.join(', ') + '**\n' : '';
  const syncNote = pluginsChanged ? '- `plugins.json` / `release/plugins.json`의 체크 목록도 함께 동기화했습니다 (앱 업데이트 없이 반영)\n' : '';
  const viaNote = '- 1차 판독: OCR(RapidOCR PP-OCRv5) / 2차 재확인: ' + (usedVia ? viaLabel(usedVia) : '불필요(변경 없음)') + '\n';
  setOutput('body', 'OCR 판독 + 변경 칸 재확인을 거쳐 `bosses.json`을 자동 갱신했습니다.\n\n'
    + '- 새 이미지(공식 사이트): ' + imageUrl + '\n- 수정 일시: ' + modified + '\n\n'
    + viaNote
    + (newNote || syncNote ? newNote + syncNote + '\n' : '')
    + '변경 내역:\n```\n' + diff + '\n```\n\n'
    + '시간대별 전체 시간표:\n```\n' + newText + '\n```\n\n'
    + '앱은 이 파일을 6시간마다 다시 받습니다. 값이 잘못됐다면 `bosses.json`을 고치고 이 Issue를 닫아 주세요.');
}

main().catch((e) => { console.error('실패:', e.message); process.exit(1); });
