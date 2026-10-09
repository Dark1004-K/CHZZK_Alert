  // ---------- TEST1 진단 로그 (콘솔 입력 없이 보기용, 10s 하트비트) ----------
  const KW_TEST_TAG = '[KW-BETA]';
  function dlog(...a) { try { console.log(KW_TEST_TAG, ...a); } catch (e) {} }
  function domMsgCount() {
    try { return document.querySelectorAll('[class*="chatting_message"]').length; }
    catch (e) { return -1; }
  }
  function isChatFolded() {
    try { return !!document.querySelector('[class*="_is_folded"]'); }
    catch (e) { return false; }
  }
  function hb(reason) {
    dlog('HB(' + reason + ')', JSON.stringify({
      running, checked, hits,
      dom: domMsgCount(), folded: isChatFolded(),
      watched: !!watchedContainer, kw: keywords.length,
      mut: mutBatches, mutNodes, catchup: catchupFound,
      ws: wsTracked, wsMsgs, hist: hitLog.length, limited: limitedMode, w: curWidth, allow: allowState,
    }));
    mutBatches = 0; mutNodes = 0; catchupFound = 0; wsMsgs = 0;
  }
  let hbTimer = null;
  function startHeartbeat() {
    if (hbTimer) return;
    dlog('loaded', location.href);
    hb('init');
    hbTimer = setInterval(() => {
      try { if (isLivePage()) hb('tick'); } catch (e) {}
    }, 10000);
  }
