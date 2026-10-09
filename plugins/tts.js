// CHZZK Alert plugin: 호출 TTS — 누가 불렀는지 음성으로 읽어준다.
// API: window.__KW.on('hit', ({nick, text, kw}) => ...)
(function () {
  if (!window.__KW || typeof window.__KW.on !== 'function') return;
  if (window.__kwTtsLoaded) return;
  window.__kwTtsLoaded = true;
  function speak(text) {
    try {
      if (!('speechSynthesis' in window)) return;
      try { window.speechSynthesis.cancel(); } catch (e) {}
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ko-KR';
      u.rate = 1.1;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }
  window.__KW.on('hit', (d) => speak((d && d.nick ? d.nick : '누군가') + '님이 불렀습니다'));
  window.__KW.on('ext:boss', (d) => d && d.bosses && speak(d.bosses.join(', ') + ' 우두머리가 ' + d.when + ' 뒤 출현합니다'));
  window.__KW.on('drops', (d) => speak(d && d.last ? '드롭스 시간이 모두 충족되었습니다' : '드롭스 시간이 충족되었습니다. 다음 보상을 확인하세요'));
})();
