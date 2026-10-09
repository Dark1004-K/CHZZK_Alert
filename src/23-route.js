  // ---------- SPA 라우트 변경 감지 ----------
  let lastPath = location.pathname;
  let lastCid = pageChannelId();

  // 이 채널의 라이브 페이지가 아니면 패널/토스트박스/선택버튼 등 UI DOM을 통째로 제거한다.
  // (CSS display:none으로 숨기는 게 아니라 실제로 DOM에서 없애서 "UI 자체가 안 보이게" 함)

  // 이 채널의 라이브 페이지가 아니면 패널/토스트박스/선택버튼 등 UI DOM을 통째로 제거한다.
  // (CSS display:none으로 숨기는 게 아니라 실제로 DOM에서 없애서 "UI 자체가 안 보이게" 함)
  function teardownUi() {
    dlog('teardown', location.pathname);
    stop();
    try { document.getElementById('__kw_stack')?.remove(); } catch (e) {}
    panel = null; stackEl = null; midRowEl = null; histPanel = null; histBox = null; histCount = null; setPanel = null;
    document.getElementById('__kw_ask')?.remove();
    document.getElementById('__kw_box')?.remove();
    document.getElementById('__kw_sel')?.remove();
  }

  function buildUi() {
    ensureStyle();
    ensureStack();
    ensureHistPanel();
    if (!panel || !panel.isConnected) buildPanel();
    ensureSettingsPanel();
    setupDragToAdd();
    setupFsReloc();
    panel.classList.add('show');
    applyHistVisibility();
    applySetVisibility();
    dlog('buildui', JSON.stringify({ running, dom: domMsgCount(), folded: isChatFolded() }));
    if (!running) showAskPrompt();
  }

  function checkRoute() {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      const cid = pageChannelId();
      if (cid) {
        if (cid !== lastCid) { // 다른 채널로 이동: 감시 중단 + 인가 재확인
          lastCid = cid;
          allowState = 'pending';
          try { stop(); } catch (e) {}
        }
        buildUi();
      } else {
        lastCid = '';
        teardownUi();
      }
    }
  }
