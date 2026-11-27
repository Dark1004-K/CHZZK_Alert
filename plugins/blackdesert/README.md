# plugins/blackdesert — 검은사막 플러그인 소스 조각

`plugins/blackdesert.js`(약 3,200줄)를 기능별로 나눈 조각이다. **`plugins/blackdesert.js`는 이 조각들을 이름순으로 이어 붙여 만든 결과물**이므로 직접 고치지 말고 조각을 고친 뒤 빌드한다.

```
node src/build.js --plugins     # 조립만 (plugins/blackdesert.js 갱신)
node src/build.js               # 베타 빌드 (조립 포함)
node src/build.js --release X.Y.Z   # 정식 빌드 (조립 포함)
```

조각은 하나의 IIFE `(function () { … })();` 를 자른 것이라 **단독으로는 실행되지 않는다** (첫 조각이 `(function () {` 를 열고 마지막 조각이 닫는다). 조각 사이에 import/export 는 없고 같은 스코프를 공유한다.

| 조각 | 내용 |
|---|---|
| `01-head.js` | 상수·옵션·시간표 로드(`fetchData`)·알림 |
| `02-main-window.js` | 검은사막 메인창 + 서브창 |
| `03-coupon.js` | 마감 임박 깜빡임 · 쿠폰 모아보기 |
| `04-event.js` | 이벤트 모아보기 |
| `05-party.js` | 파티모집 |
| `06-family.js` | 가문검색 · 데이터 출처 안내창 |
| `07-search.js` | 검색 결과창 · 실시간 검색 |
| `08-calc-detail.js` | calculator 1차 상세 |
| `09-recipe.js` | 제작 레시피 창 |
| `10-market-tick.js` | 거래소 현황창 · 1초 틱 · IIFE 닫기 |

`[BETA-TEST-ONLY:start/end]` 표식은 한 조각 안에서 여닫는다. 새 조각은 번호를 붙여 추가한다.
