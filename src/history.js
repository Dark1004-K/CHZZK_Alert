  // ---------- 불린 대화 목록 (저장/표시/클릭 이동) ----------
  function saveHits() {
    try {
      localStorage.setItem(LS_HITS, JSON.stringify(
        hitLog.slice(0, HITS_MAX).map(({ t, nick, text, kw, sig, gone }) => ({ t, nick, text, kw, sig, gone: !!gone }))
      ));
    } catch (e) {}
  }
  function fmtTime(t) {
    try { return new Date(t).toTimeString().slice(0, 8); } catch (e) { return ''; }
  }
  function recordHit(nick, text, kw, sig, el) {
    if (!histOn() && !dedupOn()) return;
    hitLog.unshift({ t: Date.now(), nick: nick || '', text: (text || '').slice(0, 120), kw, sig, el: el || null });
    while (hitLog.length > HITS_MAX) hitLog.pop();
    saveHits();
    renderHitsList();
  }
  // 목록 표시용: 본문 속 검출 단어만 노란색으로 (대소문자 무시, 여러 번 출현 전부)
  function hiKw(text, kw) {
    const t = text || '';
    if (!kw) return escapeHtml(t);
    const low = t.toLowerCase();
    const keys = [];
    for (const k of [kw, norm(kw)]) { if (k && !keys.includes(k)) keys.push(k); }
    let best = -1, bestK = '';
    for (const k of keys) {
      const i = low.indexOf(k.toLowerCase());
      if (i >= 0 && (best < 0 || i < best)) { best = i; bestK = k; }
    }
    if (best < 0) return escapeHtml(t);
    const kl = bestK.toLowerCase();
    const parts = [];
    let pos = 0;
    for (;;) {
      const i = low.indexOf(kl, pos);
      if (i < 0) { parts.push(escapeHtml(t.slice(pos))); break; }
      parts.push(escapeHtml(t.slice(pos, i)));
      parts.push('<span class="__kw_hit_kw">' + escapeHtml(t.slice(i, i + bestK.length)) + '</span>');
      pos = i + bestK.length;
    }
    return parts.join('');
  }
  function renderHitsList() {
    if (histCount) histCount.textContent = String(hitLog.length);
    if (!histBox || !histBox.isConnected) return;
    if (!histOn()) { histBox.innerHTML = ''; return; }
    histBox.innerHTML = hitLog.length ? hitLog.map((h, i) => {
      const body = splitBody(h.nick, h.text) || h.text;
      const nickHtml = h.nick ? `<b>${escapeHtml(h.nick)}</b> ` : '';
      return `<div class="__kw_hit${h.gone ? ' gone' : ''}" data-i="${i}" title="클릭하면 해당 채팅으로 이동"><span class="__kw_hit_t">${fmtTime(h.t)}</span>${nickHtml}<span>${hiKw(body, h.kw)}</span>${h.gone ? '<span class="__kw_hit_gone">사라짐</span>' : ''}</div>`;
    }).join('') : '<div style="font-size:11px;color:#666">아직 없음</div>';
  }
  function jumpToHit(i) {
    const h = hitLog[i];
    if (!h) return;
    // 원본이 살아있으면 그대로, 밀려났으면 같은 서명의 노드를 다시 찾아 채택.
    // 가상리스트에서 잠시 내려간 경우도 있어 못 찾았다고 지우지 않고 표시만 함.
    const el = (h.el && h.el.isConnected) ? h.el : findElBySig(h.sig, h.kw);
    if (el) {
      h.el = el;
      if (h.gone) { h.gone = false; saveHits(); }
      try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      catch (e) { try { el.scrollIntoView(); } catch (e2) {} }
      highlightMessage(el);
      renderHitsList();
      dlog('jump', JSON.stringify({ i, text: (h.text || '').slice(0, 40) }));
      return;
    }
    if (!h.gone) { h.gone = true; saveHits(); }
    renderHitsList();
    showToast('현재 화면에 없음 (목록 유지)' + (h.text ? ': ' + h.text.slice(0, 30) : ''));
    dlog('jump-gone', JSON.stringify({ i }));
  }
  function findElBySig(sig, kw) {
    if (!sig) return null;
    try {
      const list = document.querySelectorAll('[class*="chatting_message"]');
      for (const el of list) {
        if (!(el instanceof HTMLElement)) continue;
        if (hitSig(el.textContent || '') + '|' + kw === sig) return el;
      }
    } catch (e) {}
    return null;
  }
