  // ---------- 방송 진입 시 시작 여부 프롬프트 (#__kw_ask) ----------
  function showAskPrompt() {
    if (localStorage.getItem(LS_AUTO) === '1') { start(); return; }
    if (panel) panel.classList.remove('show');
    applyHistVisibility(); // 질문창이 떠 있는 동안 목록 화면도 함께 숨김
    applySetVisibility();
    const box = document.createElement('div');
    box.id = '__kw_ask';
    box.innerHTML = `<div><b>🔔 채팅 호출 알림을 켤까요?</b></div>
      <div style="font-size:12px;color:#bbb;margin-top:4px">단어: <span>${escapeHtml(keywords.join(', ')) || '(없음, 단어를 먼저 등록하세요)'}</span></div>
      <button class="__kw_b" id="__kw_yes" style="background:#00ffa3;color:#000">켜기</button>
      <button class="__kw_b" id="__kw_no" style="background:#444;color:#fff">이번엔 안 함</button>
      <div style="font-size:11px;margin-top:8px"><label style="cursor:pointer"><input type="checkbox" id="__kw_ask_auto"> 다음부터 묻지 않고 자동으로 켜기</label></div>`;
    document.body.appendChild(box);
    box.querySelector('#__kw_yes').onclick = () => {
      if (box.querySelector('#__kw_ask_auto').checked) localStorage.setItem(LS_AUTO, '1');
      start();
      box.remove();
      if (panel && isLivePage()) panel.classList.add('show');
      applyHistVisibility();
      applySetVisibility();
    };
    box.querySelector('#__kw_no').onclick = () => {
      box.remove();
      if (panel && isLivePage()) panel.classList.add('show');
      applyHistVisibility();
      applySetVisibility();
    };
  }

  // ---------- 드래그 선택으로 단어 추가 (#__kw_sel) ----------
  // 문서 전역 리스너는 한 번만 등록하고, 실제 버튼 DOM은 라이브 페이지에서 텍스트를
  // 드래그했을 때만 그때그때 만든다. (다른 URL에서는 UI 요소 자체가 존재하지 않도록)
  let dragListenerAdded = false;
  function setupDragToAdd() {
    if (dragListenerAdded) return;
    dragListenerAdded = true;
    document.addEventListener('mouseup', () => {
      if (!isLivePage()) return; // 이 채널의 라이브 페이지가 아니면 아무 것도 하지 않음
      let sel = document.getElementById('__kw_sel');
      if (!sel) {
        sel = document.createElement('div');
        sel.id = '__kw_sel';
        document.body.appendChild(sel);
      }
      const s = window.getSelection();
      const text = s ? s.toString().trim() : '';
      if (!text || text.length > 30 || text.includes('\n')) { sel.style.display = 'none'; return; }
      const range = s.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) { sel.style.display = 'none'; return; }
      sel.textContent = '＋ 호출 단어로 추가';
      sel.style.left = (rect.left + window.scrollX) + 'px';
      sel.style.top = (rect.top + window.scrollY - 30) + 'px';
      sel.style.display = 'block';
      sel.onclick = () => {
        if (!keywords.includes(text)) { keywords.push(text); saveKeywords(keywords); refreshNormCache(); renderPanel(); }
        sel.style.display = 'none';
      };
    });
  }
