// ==UserScript==
// @name         CHZZK Alert (Dev)
// @namespace    https://chzzk.naver.com/
// @version      0.0.0
// @description  로컬 개발용 로더. 배포 금지. repo 루트에서 python3 -m http.server 8077 실행 후 이 스크립트만 켜고 F5.
// @match        https://chzzk.naver.com/live/*
// @match        https://chzzk.naver.com/0a3deecf0fa1652445e3c97bc118272e*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// ==/UserScript==

// 사용법:
//   1. repo 루트에서: python3 -m http.server 8077
//   2. Tampermonkey에 이 파일을 새 스크립트로 붙여넣기 (URL 설치 아님, 로컬 붙여넣기)
//   3. 베타/정식 스크립트는 끄고 이것만 켜기
//   4. src/*.js 수정 → 저장 → 방송 페이지 F5. 끝 (커밋·push·버전 bump 불필요)
// 끝난 뒤에는 이 스크립트를 끄고 베타를 다시 켤 것.
(function () {
  'use strict';
  const BASE = 'http://127.0.0.1:8077/'; // repo 루트 기준
  const MODS = ['core', 'chat', 'ui', 'app', 'room'];
  const bust = Date.now(); // 매 새로고침마다 새로 받음
  let i = 0;
  function next() {
    if (i >= MODS.length) return;
    const m = MODS[i++];
    try {
      GM_xmlhttpRequest({
        method: 'GET',
        url: BASE + 'src/' + m + '.js?t=' + bust,
        onload: (res) => {
          if (!res || res.status !== 200) {
            console.error('[KW-DEV] load fail:', m, res && res.status);
            return;
          }
          const s = document.createElement('script');
          s.textContent = '\n;try{\n' + res.responseText + '\n}catch(e){ console.error("[KW-DEV]", e); }';
          (document.head || document.documentElement).appendChild(s);
          try { s.remove(); } catch (e) {}
          next(); // 순서 보장: 하나씩 차례로
        },
        onerror: () => console.error('[KW-DEV] http://127.0.0.1:8077 연결 실패. repo 루트에서 `python3 -m http.server 8077` 실행 필요.'),
        ontimeout: () => console.error('[KW-DEV] localhost 응답 없음. 서버가 켜져 있는지 확인.'),
      });
    } catch (e) { console.error('[KW-DEV]', e); }
  }
  next();
})();
