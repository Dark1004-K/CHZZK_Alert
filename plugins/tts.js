// CHZZK Alert plugin: 호출 TTS — 누가 불렀는지 음성으로 읽어준다.
// API: window.__KW.on('hit', ({nick, text, kw}) => ...)
(function () {
  if (!window.__KW || typeof window.__KW.on !== 'function') return;
  if (window.__kwTtsLoaded) return;
  window.__kwTtsLoaded = true;
  try { if (typeof window.__KW.describe === 'function') window.__KW.describe({ name: 'tts', version: '1.0.1' }); } catch (e) {}
  let ttsQ = []; // 대기 중인 음성 (알람 큐가 순서를 정하므로 항상 순서대로 읽는다)
  let ttsSpeaking = false;
  function ttsSetBusy(v) { ttsSpeaking = !!v; try { window.__kwTtsBusy = ttsSpeaking; } catch (e) {} }
  function speak(text, queue) { // queue 인자는 호환용 (항상 큐잉)
    try {
      if (!('speechSynthesis' in window)) return;
      // 다른 탭이 이미 같은 알람을 낸 경우 스킵 (코어가 window.__kwXQuietUntil로 알려줌)
      try { if (Date.now() < (Number(window.__kwXQuietUntil) || 0)) return; } catch (e) {}
      ttsQ.push(String(text || ''));
      if (ttsQ.length > 6) ttsQ.splice(0, ttsQ.length - 6); // 밀리면 오래된 것부터 버림
      ttsNext();
    } catch (e) {}
  }
  function ttsNext() {
    try {
      if (ttsSpeaking) return;
      const text = ttsQ.shift();
      if (!text) { ttsSetBusy(false); return; }
      let u;
      try { u = new SpeechSynthesisUtterance(text); } catch (e) { setTimeout(ttsNext, 200); return; }
      u.lang = 'ko-KR';
      u.rate = 1.1;
      try { if (typeof window.__KW.volume === 'function') u.volume = window.__KW.volume(); } catch (e) {}
      let done = false;
      const fin = () => { if (done) return; done = true; ttsSetBusy(false); setTimeout(ttsNext, 150); };
      try { u.onend = fin; u.onerror = fin; } catch (e) {}
      ttsSetBusy(true);
      try { window.speechSynthesis.speak(u); } catch (e) { fin(); return; }
      setTimeout(fin, 15000); // failsafe: 끝 이벤트를 못 잡아도 다음으로
    } catch (e) { try { ttsSetBusy(false); } catch (e2) {} }
  }
  try { window.__kwTtsBusy = false; } catch (e) {}
  try {
    window.__kwTtsCancel = () => { // 보스 선점용: 재생 중 음성 끊기 (코어 큐가 호출)
      try { ttsQ = []; } catch (e) {}
      try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch (e2) {}
      try { ttsSetBusy(false); } catch (e3) {}
    };
  } catch (e) {}
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
  // 새 쿠폰·이벤트 알림 읽기 (임박 진입 알람은 urgent로 구분)
  window.__KW.on('ext:coupon', (d) => {
    const l = d && Array.isArray(d.coupons) ? d.coupons : [];
    if (!l.length) return;
    const names = l.slice(0, 3).map((c) => c.name || '쿠폰').join(', ');
    speak(d && d.urgent ? '마감 임박 쿠폰 ' + l.length + '개. ' + names : '새 쿠폰 ' + l.length + '개가 등록되었습니다. ' + names, true);
  });
  window.__KW.on('ext:event', (d) => {
    const l = d && Array.isArray(d.events) ? d.events : [];
    if (!l.length) return;
    const names = l.slice(0, 3).map((c) => c.title || '이벤트').join(', ');
    speak(d && d.urgent ? '마감 임박 이벤트 ' + l.length + '개. ' + names : '새 이벤트 ' + l.length + '개가 등록되었습니다. ' + names, true);
  });
})();
