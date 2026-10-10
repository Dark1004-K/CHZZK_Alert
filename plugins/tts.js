// CHZZK Alert plugin: 호출 TTS — 누가 불렀는지 음성으로 읽어준다.
// API: window.__KW.on('hit', ({nick, text, kw}) => ...)
(function () {
  if (!window.__KW || typeof window.__KW.on !== 'function') return;
  if (window.__kwTtsLoaded) return;
  window.__kwTtsLoaded = true;
  function speak(text, queue) { // queue=true면 앞에 읽던 것을 끊지 않고 이어서 읽는다
    try {
      if (!('speechSynthesis' in window)) return;
      if (!queue) { try { window.speechSynthesis.cancel(); } catch (e) {} }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ko-KR';
      u.rate = 1.1;
      try { if (typeof window.__KW.volume === 'function') u.volume = window.__KW.volume(); } catch (e) {}
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }
  // 우두머리 알림은 보스가 몇 명이든 한 문장으로 딱 한 번만 읽는다. 같은 우두머리 조합이 짧은 시간에 또 들어와도(중복 이벤트 등) 다시 읽지 않는다.
  const bossSpoken = new Map(); // 우두머리 조합 -> 마지막으로 읽은 시각
  function speakBoss(d) {
    if (!d || !Array.isArray(d.bosses) || !d.bosses.length) return;
    const key = d.bosses.slice().sort().join(',');
    const now = Date.now();
    if (now - (bossSpoken.get(key) || 0) < 60000) return;
    bossSpoken.set(key, now);
    speak(d.bosses.join(', ') + ' 우두머리가 ' + d.when + ' 뒤 출현합니다');
  }
  window.__KW.on('hit', (d) => speak((d && d.nick ? d.nick : '누군가') + '님이 불렀습니다'));
  window.__KW.on('ext:boss', speakBoss);
  window.__KW.on('ext:boss30', () => speak('보스 출현 30초 전입니다', true)); // 출현 30초 전에 한 번 더
  window.__KW.on('ext:party', (d) => d && speak((d.nick || '누군가') + '님이 ' + (d.kind || '') + ' 파티를 모집합니다'));
  window.__KW.on('drops', (d) => speak(d && d.last ? '드롭스 시간이 모두 충족되었습니다' : '드롭스 시간이 충족되었습니다. 다음 보상을 확인하세요'));
})();
