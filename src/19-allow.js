  // ---------- 채널 인가 (allowlist.json, git에서 관리) ----------
  // 강제력은 없음(클라이언트 코드라 고치면 우회됨). 정직한 사용자용 관리 + 원격 킬스위치.
  const ALLOW_URL = 'https://raw.githubusercontent.com/Dark1004-K/chizizic_call_nickname/main/allowlist.json';
  const LS_ALLOW = '__kw_allow';
  let allowState = 'pending'; // pending | ok | denied
  function readAllowCache() {
    try {
      const o = JSON.parse(localStorage.getItem(LS_ALLOW));
      if (o && Array.isArray(o.channels)) return o;
    } catch (e) {}
    return null;
  }
  function noteDenied(cid) {
    if (noteDenied._id === cid) return;
    noteDenied._id = cid;
    showToast('인가되지 않은 채널입니다');
    dlog('allow-denied-notice', cid);
  }
  function refreshAllowlist(silent, done) {
    const cid = pageChannelId();
    const finish = (st) => { allowState = st; if (done) { try { done(); } catch (e) {} } };
    try {
      fetch(ALLOW_URL + '?t=' + Math.floor(Date.now() / 3600000), { cache: 'no-store' })
        .then((r) => { if (!r || !r.ok) throw new Error('http'); return r.json(); })
        .then((j) => {
          const list = j && Array.isArray(j.channels) ? j.channels.map(String) : null;
          if (!list) throw new Error('format');
          try { localStorage.setItem(LS_ALLOW, JSON.stringify({ channels: list, at: Date.now() })); } catch (e) {}
          const ok = list.map((s) => s.toLowerCase()).includes(cid);
          if (!silent) dlog(ok ? 'allow-ok' : 'allow-denied', cid);
          if (!ok) noteDenied(cid);
          finish(ok ? 'ok' : 'denied');
        })
        .catch(() => {
          const c = readAllowCache();
          if (c) {
            const ok = c.channels.map(String).map((s) => s.toLowerCase()).includes(cid);
            if (!silent) dlog(ok ? 'allow-cache-ok' : 'allow-cache-denied', cid);
            if (!ok) noteDenied(cid);
            finish(ok ? 'ok' : 'denied');
          } else {
            if (!silent) { dlog('allow-offline-open', cid); showToast('인가 목록 확인 불가(오프라인), 이번만 허용'); }
            finish('ok');
          }
        });
    } catch (e) { finish('ok'); }
  }

  function start() {
    if (running) return;
    const cid = pageChannelId();
    if (!cid) return;
    if (allowState === 'denied') { noteDenied(cid); renderPanel(); return; }
    if (allowState !== 'ok') {
      refreshAllowlist(false, () => {
        if (allowState === 'ok') start();
        else renderPanel();
      });
      return;
    }
    ensurePermission();
    running = true;
    renderPanel();
    // 인가 철회 대응: 10분마다 목록 재확인 (조용히)
    if (allowTimer) { clearInterval(allowTimer); allowTimer = null; }
    allowTimer = setInterval(() => {
      if (!running) return;
      refreshAllowlist(true, () => {
        if (allowState === 'denied' && running) {
          stop();
          noteDenied(pageChannelId());
          renderPanel();
        }
      });
    }, 600000);
    dlog('start', JSON.stringify({ dom: domMsgCount(), folded: isChatFolded(), hasContainer: !!findChatContainer() }));
    hb('start');

    // body를 절대 observe하지 않음. 컨테이너가 생길 때까지 1.5s 폴링만 수행.
    const first = findChatContainer();
    if (first && first !== document.body) {
      attachObserverTo(first);
      scanNode(first); // 시작 전 쌓인 메시지 1회 회수 (기록에 있으면 재알림 생략됨)
    } else {
      dlog('start-nocontainer', JSON.stringify({ dom: domMsgCount(), folded: isChatFolded() }));
    }
    if (containerCheckTimer) { clearInterval(containerCheckTimer); containerCheckTimer = null; }
    containerCheckTimer = setInterval(() => {
      if (!running) { clearInterval(containerCheckTimer); containerCheckTimer = null; return; }
      const better = findChatContainer();
      if (better && better !== document.body && better !== watchedContainer) {
        dlog('reattach', JSON.stringify({ dom: domMsgCount(), folded: isChatFolded() }));
        attachObserverTo(better);
        scanNode(better); // 재접속/refill 과거분: 기록에 있으면 재알림 생략됨
      } else if (!better && !watchedContainer) {
        dlog('nocontainer-tick', JSON.stringify({ dom: domMsgCount(), folded: isChatFolded() }));
      }
      // TEST2 보완: 옵저버가 죽거나 접힘 리렌더를 놓쳐도 최대 1.5s 지연으로 회수.
      // seen WeakSet 덕분에 이미 본 건 스킵이라 평소 비용은 querySelectorAll 1회뿐.
      try {
        const list = document.querySelectorAll('[class*="chatting_message"]');
        let fresh = 0;
        for (const el of list) { if (!seen.has(el)) fresh++; }
        if (fresh > 0) {
          catchupFound += fresh;
          let changed = false;
          for (const el of list) { if (scanSingle(el)) changed = true; }
          if (changed) scheduleStatsUpdate();
          dlog('catchup', JSON.stringify({ fresh, dom: list.length, folded: isChatFolded() }));
        }
      } catch (e) {}
    }, 1500);
  }
  let allowTimer = null;
  function stop() {
    if (observer) observer.disconnect();
    observer = null;
    watchedContainer = null;
    if (containerCheckTimer) { clearInterval(containerCheckTimer); containerCheckTimer = null; }
    if (allowTimer) { clearInterval(allowTimer); allowTimer = null; }
    running = false;
    dlog('stop');
    renderPanel();
  }
