// Google Apps Script — 우두머리 시간표 변경 감지 (프로젝트 2: 보스 전용)
// 위키 시간표는 이미지라 값을 읽을 수 없어서, 이미지 주소+수정 일시가 바뀌면
// 상태 파일(data/boss-schedule-state.json)만 갱신하고 Issue로 알린다.
// 시간표 값(bosses.json)은 새 이미지를 보고 사람이 고친다.
//
// 설치:
//   1. script.google.com → 새 프로젝트 → 이 파일 내용 전체 붙여넣기 (쿠폰 프로젝트와 별개)
//   2. 아래 GITHUB_TOKEN에 토큰 입력 (쿠폰과 같은 토큰이면 Issues 읽기/쓰기 권한도 추가) 후 저장
//   3. bossCheck() 함수를 1회 실행 → 권한 승인 → 로그에 `변경 없음` 또는 `상태 처음 기록` 확인
//   4. 왼쪽 시계 아이콘(트리거) → 트리거 추가 → bossCheck / 시간 기반 / 주 타이머 / 수요일 / 12시~13시 → 저장
//      (GAS 주 타이머는 시간 단위라 12:10 정각 지정 불가. 앱 6시간 폴링이 흡수)
//   5. 프로젝트 시간대 확인: 왼쪽 톱니 → 시간대 (GMT+09:00) 서울.

const GITHUB_TOKEN = ''; // ← 여기에 토큰 붙여넣기
const OWNER = 'Dark1004-K';
const REPO = 'CHZZK_Alert';

function bossCheck() {
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN을 입력하세요 (코드 맨 위)');
  const gh = { 'Authorization': 'Bearer ' + GITHUB_TOKEN, 'Accept': 'application/vnd.github+json', 'User-Agent': 'ChzzkAlertBossScheduleBot' };
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
  const state = { source: SRC, imageUrl: imageUrl, modified: modified, checkedAt: Date.now() };
  // 2) 저장된 상태 읽기 (없으면 처음 기록)
  const api = 'https://api.github.com/repos/' + OWNER + '/' + REPO + '/contents/' + STATE_PATH;
  const cur = UrlFetchApp.fetch(api + '?ref=main', { headers: gh, muteHttpExceptions: true });
  if (cur.getResponseCode() === 404) {
    UrlFetchApp.fetch(api, {
      method: 'put', headers: gh, contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({
        message: 'chore: update boss schedule state',
        content: Utilities.base64Encode(Utilities.newBlob(JSON.stringify(state, null, 2) + '\n').getBytes()),
      }),
    });
    Logger.log('상태 처음 기록 (' + modified + ')');
    return;
  }
  if (cur.getResponseCode() !== 200) throw new Error('GitHub API ' + cur.getResponseCode());
  const curJson = JSON.parse(cur.getContentText());
  let prev = null;
  try {
    prev = JSON.parse(Utilities.newBlob(Utilities.base64Decode(curJson.content)).getDataAsString());
  } catch (e) {}
  if (prev && prev.imageUrl === imageUrl && prev.modified === modified) {
    Logger.log('변경 없음 (' + modified + ')');
    return;
  }
  // 3) 상태 갱신 + Issue
  const put = UrlFetchApp.fetch(api, {
    method: 'put', headers: gh, contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({
      message: 'chore: update boss schedule state',
      content: Utilities.base64Encode(Utilities.newBlob(JSON.stringify(state, null, 2) + '\n').getBytes()),
      sha: curJson.sha,
    }),
  });
  if (put.getResponseCode() !== 200 && put.getResponseCode() !== 201) {
    throw new Error('상태 저장 실패 HTTP ' + put.getResponseCode());
  }
  const issue = UrlFetchApp.fetch('https://api.github.com/repos/' + OWNER + '/' + REPO + '/issues', {
    method: 'post', headers: gh, contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({
      title: '[우두머리 시간표] 위키 시간표가 바뀌었습니다 (' + modified + ')',
      body: '검은사막 위키의 월드 우두머리 레이드 시간표 이미지가 바뀌었습니다.\n\n'
        + '- 위키: https://www.kr.playblackdesert.com/ko-kr/Wiki?wikiNo=167\n'
        + '- 새 이미지(공식 사이트): ' + imageUrl + '\n'
        + '- 수정 일시: ' + modified + '\n\n'
        + '이미지를 보고 `bosses.json`의 시간표를 고쳐 주세요. (앱은 6시간마다 + 매주 수요일 12:27에 이 파일을 다시 받습니다)',
    }),
  });
  if (issue.getResponseCode() !== 201) throw new Error('Issue 생성 실패 HTTP ' + issue.getResponseCode());
  Logger.log('시간표 변경 감지. 상태 갱신 + Issue 생성 완료 (' + modified + ')');
}
