# 작업 규칙

* 응답은 한국어로, 짧고 간결하게.
* 버전·빌드·커밋 규칙의 정본은 `README.md`(부록 D付近)와 `beta/UPDATE.md` 상단이다. 이 파일은 요약·포인터만 둔다.

## 코드 변경 시 (항상 커밋까지 마무리)

사용자가 따로 말하지 않아도, `src/`·`plugins/` 코드를 바꾸면 아래를 끝까지 수행한다:

1. `src/header.txt`의 `@version` 베타 번호 +1 (예: `3.6.0-beta041` → `beta042`)
2. `node src/build.js` 실행 (베타 로더·`core.js` 버전 동기화)
3. `beta/UPDATE.md` 최상단에 `## vX` 항목 추가
4. 커밋. 메시지 형식: `v3.6.0-beta042: 요약(변경점은 ·로 구분)`

## 베타 전용 코드

테스트용 코드는 반드시 `[BETA-TEST-ONLY:start]` ~ `[BETA-TEST-ONLY:end]`로 감싼다.
정식 변환(`--release`)에서 제거되므로, 릴리즈 strip 후에도 문법이 유효해야 한다.

## BDO_Alert(DB) 연동 메모

- 쿠폰·이벤트·우두머리 시간표는 BDO_Alert의 Supabase에도 저장된다. 구조·환경변수·운영 정본은 BDO_Alert 저장소의 `docs/ARCHITECTURE.md`.
- v4.3.2 부터 userscript 는 `bdo-alert.vercel.app/data/*.json`만 읽는다. 쿠폰·이벤트 크롤러(`crawl-*` 워크플로우·스크립트)와 `coupons.json`/`events.json` 은 삭제했다. v4.3.3 부터 `bosses.json` 도 삭제했다 — 우두머리 시간표는 Supabase 가 유일한 저장소이고 OCR(`update-boss-schedule.js`)이 `bdo_sync_bosses` RPC 로 직접 기록한다(이전 시간표는 RPC `bdo_bosses_json` → 실패 시 공개 `/data/bosses.json`).
- `scripts/update-boss-schedule.js`의 `syncDb()`: 시간표 갱신 시 Supabase RPC `bdo_sync_bosses`에도 기록(시크릿 `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` 없으면 건너뜀, 실패해도 커밋은 계속). `sb_` 새 방식 키는 `apikey` 헤더로만 보낸다.
- `workers/coupon-cron/chzzk-cron.gs`: `couponsCrawl()`/`eventsCrawl()`은 Vercel `/api/cron/*` 호출만 한다(스크립트 속성 `VERCEL_BASE`, `CRON_SECRET`). `bossCheck()`만 GitHub Actions(`check-boss-schedule`)를 디스패치하며 스크립트 속성 `GITHUB_TOKEN`이 필요하다. 공식 페이지 파서는 BDO_Alert `src/crawl/` 한 곳뿐.
