  // ---------- 채팅 감시 ----------
  // 현재 페이지의 라이브 채널 ID (32자리 hex). 인가 목록과 대조한다.
  const pageChannelId = () => {
    try { const m = location.pathname.match(/\/live\/([0-9a-f]{32})/i); return m ? m[1].toLowerCase() : ''; } catch (e) { return ''; }
  };
  const isLivePage = () => !!pageChannelId();
  // 패널에 굵게 보여줄 채널명. 탭 제목 "채널명 - ... - CHZZK"의 첫 토막을 쓴다.
  const pageChannelName = () => {
    try {
      const t = (document.title || '').split(' - ')[0].trim();
      if (t && t !== '치지직' && !/CHZZK/i.test(t)) return t;
    } catch (e) {}
    const cid = pageChannelId();
    return cid ? cid.slice(0, 8) + '…' : '';
  };

  // 우리 자체 UI(패널/프롬프트/토스트/선택버튼)에서 발생한 변화는 절대 관리하지 않아야 무한루프를 막을 수 있음
  const isOwnUi = (node) =>
    node.id && ['__kw_panel', '__kw_ask', '__kw_box', '__kw_sel', '__kw_stack', '__kw_histp', '__kw_setp', '__kw_midrow', '__kw_grip'].includes(node.id);

  let statsRaf = null;
  function scheduleStatsUpdate() {
    if (statsRaf) return;
    statsRaf = requestAnimationFrame(() => {
      statsRaf = null;
      updateStatsText();
    });
  }

  function scanSingle(el) {
    if (!(el instanceof HTMLElement)) return false;
    if (seen.has(el)) return false;
    seen.add(el);
    checked++;
    const text = el.textContent || '';
    // 발신자 닉네임만 따로 뽑아 비교한다. (기존 버그: 메시지 "본문"에 내 닉네임 글자가
    // 포함되기만 해도 "내 채팅"으로 오인해서 걸러버렸음 → 남이 정확히 내 닉네임으로
    // 불러도 감지가 안 됐던 원인. 반드시 "보낸 사람"이 나일 때만 제외하도록 수정.)
    const nickBtn = el.querySelector('button[class*="_nickname_"], [class*="nickname"]');
    const senderName = nickBtn ? (nickBtn.textContent || '') : '';
    const isMine = normMyNick && norm(senderName) === normMyNick;
    if (isMine) return true; // 확인 카운트는 올리되 알림만 제외
    // 1차: 공백 유지 매칭 (경계 보호) — "그런데 아"는 "데아"와 다름
    const tl = normLoose(text);
    // 2차용: 어절 단위 타이트 토큰 (같은 어절 안에서만 공백무시 매칭 허용)
    let tightTokens = null; // 필요할 때만 계산 (지연 평가로 CPU 절감)
    for (const { tight: kt, loose: kl } of kwCache) {
      if (kl && tl.includes(kl)) {
        const sig = hitSig(text) + '|' + kt;
        // 기록에 있는 건 경로/시점 불문 재알림 생략 (스크롤 백필·접힘 리렌더·WS 리플레이 대응)
        if (histSuppressed(sig)) { dlog('DUP-hist-skip', JSON.stringify({ kw: kl })); break; }
        if (!takeHit(sig)) { dlog('DUP-dom-skip', JSON.stringify({ kw: kl })); break; }
        hits++;
        recordHit(senderName, text, kl, sig, el);
        dlog('HIT-loose', JSON.stringify({ kw: kl, nick: senderName.slice(0, 30), text: text.slice(0, 60) }));
        fireAlert(senderName, text, el, kl);
        break;
      }
      // 1차가 실패하면 같은 어절 안에서만 타이트 매칭 시도.
      // 예: 키워드 "데아" vs "데아님ㅋㅋ" → 토큰 "데아님ㅋㅋ"가 "데아" 포함 → 검출 O
      // 예: 키워드 "데아" vs "그런데 아~~" → 토큰 "그런데"/"아~~" 어디에도 "데아" 없음 → 검출 X
      if (!tightTokens) {
        tightTokens = tl.split(' ').map((t) => norm(t)).filter(Boolean);
        if (tightTokens.length === 0) break;
      }
      let inToken = false;
      for (const tt of tightTokens) {
        if (tt.includes(kt)) { inToken = true; break; }
      }
      if (inToken) {
        const sig = hitSig(text) + '|' + kt;
        if (histSuppressed(sig)) { dlog('DUP-hist-skip', JSON.stringify({ kw: kt })); break; }
        if (!takeHit(sig)) { dlog('DUP-dom-skip', JSON.stringify({ kw: kt })); break; }
        hits++;
        recordHit(senderName, text, kt, sig, el);
        dlog('HIT-token', JSON.stringify({ kw: kt, nick: senderName.slice(0, 30), text: text.slice(0, 60) }));
        fireAlert(senderName, text, el, kt);
        break;
      }
    }
    return true;
  }

  function scanNode(node) {
    if (!(node instanceof HTMLElement)) return;
    if (isOwnUi(node) || node.closest?.('#__kw_panel,#__kw_ask,#__kw_box,#__kw_sel,#__kw_stack,#__kw_histp,#__kw_setp,#__kw_midrow,#__kw_grip')) return;
    // 가장 흔한 경로: 추가된 노드 자체가 메시지 1개
    if (node.matches?.('[class*="chatting_message"]')) {
      if (scanSingle(node)) scheduleStatsUpdate();
      return;
    }
    if (!node.querySelectorAll) return;
    // 자식이 적으면 전체 querySelectorAll 대신 자식만 훑어서 비용 절감
    if (node.childElementCount <= 3) {
      let changed = false;
      for (const child of node.children) {
        if (!(child instanceof HTMLElement)) continue;
        if (child.matches?.('[class*="chatting_message"]')) {
          if (scanSingle(child)) changed = true;
        } else if (child.querySelectorAll) {
          const found = child.querySelectorAll('[class*="chatting_message"]');
          for (const el of found) { if (scanSingle(el)) changed = true; }
        }
      }
      if (changed) scheduleStatsUpdate();
      return;
    }
    const list = node.querySelectorAll('[class*="chatting_message"]');
    if (list.length === 0) return;
    let changed = false;
    for (const el of list) { if (scanSingle(el)) changed = true; }
    if (changed) scheduleStatsUpdate();
  }

  // 채팅 메시지 요소에서 위로 올라가며 실제 채팅 목록을 감싸는 컨테이너를 찾는다.
  // document.body 전체를 감시하면 타이머/시청자수/영상 플레이어 등 무관한 변화까지 다 감지되어 CPU를 과도하게 쓰게 된다.
  function findChatContainer() {
    const msg = document.querySelector('[class*="chatting_message"]');
    if (!msg) return null;
    let node = msg.parentElement;
    for (let i = 0; i < 6 && node && node !== document.body; i++) {
      if (node.children.length > 3) return node; // 여러 채팅 아이템을 가진 목록 컨테이너로 판단
      node = node.parentElement;
    }
    return msg.parentElement;
  }

  let watchedContainer = null;
  let containerCheckTimer = null;

  function attachObserverTo(container) {
    if (!container || container === document.body) return; // body 전체 감시 금지 (CPU 폭증 원인)
    if (container === watchedContainer && observer) return;
    if (observer) observer.disconnect();
    watchedContainer = container;
    dlog('attach', JSON.stringify({ kids: container.children?.length ?? -1, dom: domMsgCount(), folded: isChatFolded() }));
    observer = new MutationObserver((muts) => {
      mutBatches++;
      for (const m of muts) {
        // 패널/프롬프트 자체의 변화는 무시 (무한루프 방지)
        if (m.target && (isOwnUi(m.target) || m.target.closest?.('#__kw_panel,#__kw_ask,#__kw_box,#__kw_sel,#__kw_stack,#__kw_histp,#__kw_setp,#__kw_midrow,#__kw_grip'))) continue;
        for (const n of m.addedNodes) {
          if (!(n instanceof HTMLElement)) continue; // 텍스트노드 스킵
          mutNodes++;
          scanNode(n);
        }
      }
    });
    observer.observe(container, { childList: true, subtree: true });
  }
