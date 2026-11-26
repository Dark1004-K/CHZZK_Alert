// Google Apps Script — 크지직 알림 크론 (쿠폰 + 이벤트 + 우두머리, 한 프로젝트)
// 같은 프로젝트에 이 파일 1개만 넣는다.
//
// 역할: "정확한 시각"에 아래 작업을 깨운다 (GitHub 예약 실행(schedule)은 몇 시간씩 밀릴 수 있어서 시각은 이 GAS 타이머가 보장한다).
//   - couponsCrawl / eventsCrawl : BDO_Alert(Vercel) 크롤러 /api/cron/{coupons|events} 호출 → Supabase 에 저장. (GitHub Actions·coupons.json·events.json 은 v2.0.1 에서 제거)
//   - bossCheck : 위키 시간표 이미지가 바뀌었을 때만 GitHub Actions(check-boss-schedule, OCR)를 디스패치한다.
//
// 설치/갱신:
//   1. script.google.com → 기존 프로젝트 → 이 파일 내용 전체 붙여넣기 (함수 이름이 같아 기존 트리거는 그대로 동작)
//   2. 스크립트 속성(프로젝트 설정 → 스크립트 속성): VERCEL_BASE, CRON_SECRET (Vercel 환경변수 CRON_SECRET 과 같은 값)
//   3. bossCheck 전용 GitHub 토큰: 스크립트 속성 GITHUB_TOKEN 에 입력 (기존 코드에 직접 넣어 둔 값을 옮기면 된다).
//      GitHub Fine-grained PAT, 대상 repo CHZZK_Alert 1개:
//      - Contents: 읽기 (data/boss-schedule-state.json 비교용)
//      - Actions: 읽기·쓰기 (workflow_dispatch 호출용) ← 꼭 필요
//   4. couponsCrawl() · eventsCrawl() · bossCheck() 각각 1회 실행 → 로그 확인
//   5. 트리거 3개:
//      - couponsCrawl / 시간 기반 / 시간 타이머 / 매시간 (매시 00분 무렵)
//      - eventsCrawl / 시간 기반 / 일 타이머 / 오전 11시~12시
//      - bossCheck / 시간 기반 / 일 타이머 / 오전 11시~12시
//   6. 프로젝트 시간대 확인: 왼쪽 톱니 → (GMT+09:00) 서울

const GITHUB_TOKEN = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN') || ''; // 스크립트 속성 GITHUB_TOKEN (또는 '' 자리에 직접 입력) — bossCheck 에서만 사용
const OWNER = 'Dark1004-K';
const REPO = 'CHZZK_Alert';

// ---- BDO_Alert(Vercel) 호출 — 쿠폰·이벤트를 Vercel 크롤러가 읽어 Supabase에 저장하게 한다 ----
// 스크립트 속성에 넣으면 코드에 비밀이 남지 않는다: VERCEL_BASE (끝 슬래시 없이), CRON_SECRET
const VERCEL_BASE = PropertiesService.getScriptProperties().getProperty('VERCEL_BASE') || '';
const CRON_SECRET = PropertiesService.getScriptProperties().getProperty('CRON_SECRET') || '';

// 실패하면 예외를 던진다 → GAS 트리거 실패 알림(메일)으로 알 수 있다
function callVercel_(job) {
  if (!VERCEL_BASE || !CRON_SECRET) throw new Error('스크립트 속성 VERCEL_BASE / CRON_SECRET 을 설정하세요');
  const res = UrlFetchApp.fetch(VERCEL_BASE.replace(/\/+$/, '') + '/api/cron/' + job, {
    method: 'get',
    headers: { 'Authorization': 'Bearer ' + CRON_SECRET },
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  Logger.log('[Vercel] ' + job + ' → HTTP ' + code + ' ' + res.getContentText().slice(0, 160));
  if (code < 200 || code >= 300) throw new Error('Vercel ' + job + ' 실패 HTTP ' + code);
}

function couponsCrawl() { callVercel_('coupons'); } // 매시간
function eventsCrawl() { callVercel_('events'); }   // 매일 오전 11시대

// Actions 워크플로우를 실행시킨다 (workflow_dispatch API, 성공 코드는 204)
function dispatch_(workflowFile) {
  const res = UrlFetchApp.fetch(
    'https://api.github.com/repos/' + OWNER + '/' + REPO + '/actions/workflows/' + workflowFile + '/dispatches',
    {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + GITHUB_TOKEN,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'ChzzkAlertCronBot',
      },
      contentType: 'application/json',
      payload: JSON.stringify({ ref: 'main' }),
      muteHttpExceptions: true,
    }
  );
  const code = res.getResponseCode();
  if (code !== 204) throw new Error('디스패치 실패 HTTP ' + code + ': ' + res.getContentText().slice(0, 200));
}

// 저장소의 JSON 파일을 읽는다 (없으면 null)
function readFile_(path) {
  const gh = { 'Authorization': 'Bearer ' + GITHUB_TOKEN, 'Accept': 'application/vnd.github+json', 'User-Agent': 'ChzzkAlertCronBot' };
  const res = UrlFetchApp.fetch(
    'https://api.github.com/repos/' + OWNER + '/' + REPO + '/contents/' + path + '?ref=main',
    { headers: gh, muteHttpExceptions: true }
  );
  if (res.getResponseCode() === 404) return null;
  if (res.getResponseCode() !== 200) throw new Error('GitHub API ' + res.getResponseCode());
  const json = JSON.parse(res.getContentText());
  try {
    return JSON.parse(Utilities.newBlob(Utilities.base64Decode(json.content)).getDataAsString());
  } catch (e) {
    return null;
  }
}

// ---- 우두머리 시간표 (매일): 위키 이미지가 바뀌었을 때만 check-boss-schedule Actions를 실행 ----
function bossCheck() {
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN을 입력하세요 (코드 맨 위)');
  const SRC = 'https://www.kr.playblackdesert.com/ko-kr/Wiki?wikiNo=167';
  const STATE_PATH = 'data/boss-schedule-state.json';
  // 1) 위키 읽기 (최대 3회 재시도)
  let html = '';
  let lastErr = null;
  for (let a = 1; a <= 3; a++) {
    try {
      const res = UrlFetchApp.fetch(SRC, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChzzkAlertBossScheduleBot)', 'Accept-Language': 'ko-KR' },
        muteHttpExceptions: true,
      });
      if (res.getResponseCode() !== 200) throw new Error('HTTP ' + res.getResponseCode());
      html = res.getContentText('UTF-8');
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      if (a < 3) Utilities.sleep(3000 * a);
    }
  }
  if (lastErr) throw lastErr;
  const area = html.indexOf('detail_wrap editor_area');
  if (area < 0) throw new Error('본문을 찾지 못함 (페이지 구조가 바뀌었을 수 있음)');
  const img = /<img[^>]+src="([^"]+)"/.exec(html.slice(area));
  if (!img) throw new Error('시간표 이미지를 찾지 못함');
  const imageUrl = img[1];
  const mod = /최근 수정 일시\s*:\s*([0-9.]+\s*[0-9:]+)/.exec(html);
  const modified = mod ? mod[1].replace(/\s+/g, ' ').trim() : '';
  // 2) 저장된 상태와 비교 (상태 파일은 Actions가 갱신한다 — 여기서는 읽기만)
  const prev = readFile_(STATE_PATH);
  if (!prev) {
    // 상태가 아직 없으면 Actions가 처음 기록하게 둔다 (AI로 판독하지는 않음)
    dispatch_('check-boss-schedule.yml');
    Logger.log('[보스] 상태 파일 없음 → check-boss-schedule Actions 디스패치 (초기 기록용)');
    return;
  }
  if (prev.imageUrl === imageUrl && prev.modified === modified) {
    Logger.log('[보스] 변경 없음 (' + modified + ')');
    return;
  }
  // 3) 바뀌었으면 Actions를 실행시킨다 (AI 판독·검증·커밋·이슈는 거기서)
  dispatch_('check-boss-schedule.yml');
  Logger.log('[보스] 시간표 변경 감지 (' + prev.modified + ' → ' + modified + ') → check-boss-schedule Actions 디스패치');
}
