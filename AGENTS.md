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
