  let running = false;
  let checked = 0;
  let hits = 0;
  let observer = null;
  let mutBatches = 0; // TEST2: 옵저버 콜백 발화 횟수 (10s 하트비트마다 리셋)
  let mutNodes = 0;   // TEST2: 옵저버가 본 addedNodes 중 HTMLElement 수
  let catchupFound = 0; // TEST2: 폴링 보완스캔이 찾아낸 미확인 메시지 수
  let wsTracked = 0;  // 2.8: 추적 중인 채팅 WS 수
  let wsMsgs = 0;     // 2.8: WS로 받은 채팅 패킷 수 (10s마다 리셋)
  const seen = new WeakSet();
  // DOM/WS 중복 발화 방지: 같은 본문 서명은 8초 내 1회만 알림
  const hitTimes = new Map();
  // 불린 대화 목록: 클릭 이동용 + 같은 호출 재알림 간격 계산용
  let hitLog = loadHits();
  // 기록에 같은 서명이 간격 안에 있으면 재알림 생략 (스크롤 백필·접힘 리렌더·WS 리플레이 대응)
  function histSuppressed(sig) {
    if (!dedupOn() || !sig) return false;
    const now = Date.now();
    const ttl = redupMs();
    for (const h of hitLog) {
      if (h.sig === sig && now - h.t < ttl) return true;
    }
    return false;
  }
  function hitSig(text) { try { return norm(text).slice(0, 80); } catch (e) { return ''; } }
  function takeHit(sig) {
    const now = Date.now();
    const prev = hitTimes.get(sig) || 0;
    if (now - prev < 8000) return false;
    hitTimes.set(sig, now);
    if (hitTimes.size > 200) {
      for (const [k, t] of hitTimes) { if (now - t > 30000) hitTimes.delete(k); }
    }
    return true;
  }
