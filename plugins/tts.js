// CHZZK Alert plugin: 호출 TTS — 누가 불렀는지 음성으로 읽어준다.
// API: window.__KW.on('hit', ({nick, text, kw}) => ...)
(function () {
  if (!window.__KW || typeof window.__KW.on !== 'function') return;
  if (window.__kwTtsLoaded) return;
  window.__kwTtsLoaded = true;
  function speak(nick) {
    try {
      if (!('speechSynthesis' in window)) return;
      try { window.speechSynthesis.cancel(); } catch (e) {}
      const u = new SpeechSynthesisUtterance((nick || '누군가') + '님이 불렀습니다');
      u.lang = 'ko-KR';
      u.rate = 1.1;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }
  window.__KW.on('hit', (d) => speak(d && d.nick));
})();
