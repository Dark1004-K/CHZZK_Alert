  // ---------- WS 스니핑 (히든/접힘 상태 대응, DOM과 무관) ----------
  // 채팅 서버: wss://*.chat.naver.com/chat, 일반 93101 / 후원 93102
  const WS_URL_RE = /chat\.naver\.com\/chat/i;
  let wsHooked = false;
  function wsMatch(nick, msg) {
    if (!running || kwCache.length === 0) return;
    const text = (nick ? nick + ' ' : '') + (msg || '');
    const sig = hitSig(text);
    if (!sig) return;
    const tl = normLoose(text);
    let tightTokens = null;
    for (const { tight: kt, loose: kl } of kwCache) {
      let hit = false;
      if (kl && tl.includes(kl)) hit = true;
      else {
        if (!tightTokens) tightTokens = tl.split(' ').map((t) => norm(t)).filter(Boolean);
        for (const tt of tightTokens) { if (tt.includes(kt)) { hit = true; break; } }
      }
      if (hit) {
        const fullSig = sig + '|' + kt;
        if (histSuppressed(fullSig)) { dlog('DUP-hist-skip', JSON.stringify({ kw: kt })); return; }
        if (!takeHit(fullSig)) { dlog('DUP-ws-skip', JSON.stringify({ kw: kt })); return; }
        hits++;
        recordHit(nick, text, kt, fullSig, null);
        scheduleStatsUpdate();
        dlog('HIT-ws', JSON.stringify({ kw: kt, nick: (nick || '').slice(0, 30), text: text.slice(0, 60) }));
        fireAlert(nick, text, null, kt);
        return;
      }
    }
  }
  function handleWsPayload(data) {
    if (typeof data !== 'string') return;
    let obj;
    try { obj = JSON.parse(data); } catch (e) { return; }
    if (!obj || (obj.cmd !== 93101 && obj.cmd !== 93102)) return;
    const bdy = obj.bdy;
    if (!Array.isArray(bdy)) return;
    wsMsgs++;
    for (const m of bdy) {
      if (!m) continue;
      const msg = m.msg || '';
      if (!msg) continue;
      let nick = '';
      try {
        if (typeof m.profile === 'string' && m.profile) nick = JSON.parse(m.profile).nickname || '';
        else if (m.profile && typeof m.profile === 'object') nick = m.profile.nickname || '';
      } catch (e) {}
      if (normMyNick && nick && norm(nick) === normMyNick) continue;
      wsMatch(nick, msg);
    }
  }
  function patchWebSocket() {
    if (wsHooked) return;
    wsHooked = true;
    try {
      const OrigWS = window.WebSocket;
      if (!OrigWS) { dlog('ws-noapi'); return; }
      function HookedWS(url, protocols) {
        const ws = (protocols !== undefined) ? new OrigWS(url, protocols) : new OrigWS(url);
        try {
          if (typeof url === 'string' && WS_URL_RE.test(url)) {
            wsTracked++;
            dlog('ws-track', String(url).slice(0, 90));
            ws.addEventListener('message', (ev) => {
              try { handleWsPayload(ev.data); } catch (e) {}
            });
          }
        } catch (e) {}
        return ws;
      }
      HookedWS.prototype = OrigWS.prototype;
      try {
        ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach((k) => { HookedWS[k] = OrigWS[k]; });
      } catch (e) {}
      window.WebSocket = HookedWS;
      dlog('ws-hooked');
    } catch (e) { try { dlog('ws-hook-fail'); } catch (e2) {} }
  }
  patchWebSocket(); // document-start 최우선 실행 (페이지 소켓 생성 전에 가로채야 함)
