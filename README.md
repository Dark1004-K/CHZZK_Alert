# chizizic_call_nickname

치지직(CHZZK) 생방송 채팅 호출 알림 Tampermonkey 사용자 스크립트.

## 설치

1. Tampermonkey 확장 설치 후 개발자 모드에서 **사용자 스크립트 허용** 켜기
   (`chrome://extensions` → Tampermonkey 상세).
2. 설치할 파일의 Raw URL을 브라우저로 열기
   (예: `https://raw.githubusercontent.com/Dark1004-K/chizizic_call_nickname/main/chzzk-keyword-alert.user.js`)
   → Tampermonkey 설치 확인에서 **설치**.
   (또는 Tampermonkey 대시보드 → Utilities → Install from URL에 붙여넣기)
3. 방송 페이지 새로고침. `@match` 변경 후에는 재설치(또는 업데이트 확인) 필요.

## 자동 업데이트

루트 `chzzk-keyword-alert.user.js`에만 `@downloadURL`/`@updateURL`이
붙어 있어서, `@version`이 오르면 Tampermonkey가 자동 갱신 (기본 1일 1회 확인).
`v2.8_testN` 같은 테스트 파일은 수동 설치용이라 업데이트 헤더 없음.

## 인가 채널 (allowlist.json)

`channels`에 있는 채널 ID의 라이브에서만 동작. 목록에 없으면
`인가되지 않은 채널입니다` 토스트 후 감시 안 함.
오프라인이면 마지막 캐시 사용, 캐시도 없으면 이번만 허용.
클라이언트 코드라 강제력은 없음 (관리용 + 원격 킬스위치).
