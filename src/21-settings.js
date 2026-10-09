  // ---------- 설정 별도 화면 (#__kw_setp, 감시 패널 아래) ----------
  // 버전 비교: 같은 계열이면 숫자/베타번호로, 정식은 같은 번호의 베타보다 항상 새로움
  function parseVer(v) {
    const m = String(v || '').match(/(\d+)\.(\d+)(?:[-_]([A-Za-z]+)(\d*))?/);
    if (!m) return null;
    return { major: +m[1], minor: +m[2], pre: m[3] || '', preN: m[4] === '' || m[4] == null ? 0 : +m[4] };
  }
  function isNewer(remote, local) {
    const r = parseVer(remote), l = parseVer(local);
    if (!r || !l) return false;
    if (r.major !== l.major) return r.major > l.major;
    if (r.minor !== l.minor) return r.minor > l.minor;
    const rs = r.pre === '', ls = l.pre === '';
    if (rs !== ls) return rs;
    if (r.pre !== l.pre) return false;
    return r.preN > l.preN;
  }
  // 수동 업데이트 확인: 새 버전이 있을 때만 파란 업데이트 버튼을 켜줌
  function checkUpdate() {
    const msg = setPanel ? setPanel.querySelector('#__kw_update_msg') : null;
    const btn = setPanel ? setPanel.querySelector('#__kw_update_check') : null;
    const go = setPanel ? setPanel.querySelector('#__kw_update_go') : null;
    const say = (t, hot) => {
      if (!msg) return;
      msg.textContent = t;
      if (hot) msg.classList.add('hot');
      else msg.classList.remove('hot');
    };
    if (btn) btn.disabled = true;
    say('확인 중...');
    const done = () => { if (btn) btn.disabled = false; };
    try {
      fetch(UPDATE_URL + '?t=' + Date.now(), { cache: 'no-store' })
        .then((r) => { if (!r || !r.ok) throw new Error('http'); return r.text(); })
        .then((t) => {
          const m = t.match(/@version\s+([^\s]+)/);
          if (!m) throw new Error('parse');
          const remote = m[1].trim();
          if (isNewer(remote, SCRIPT_VERSION)) {
            say('새 버전 있음: ' + SCRIPT_VERSION + ' → ' + remote, true);
            if (go) go.disabled = false;
            dlog('update-avail', remote);
          } else {
            say('최신 버전입니다 (' + SCRIPT_VERSION + ')', false);
            dlog('update-latest', remote);
          }
        })
        .catch(() => say('확인 실패 (네트워크)'))
        .then(done);
    } catch (e) {
      say('확인 실패 (네트워크)');
      done();
    }
  }
  function renderSettings() {
    if (!setPanel) return;
    setPanel.innerHTML = `
      <div style="display:flex;gap:14px;height:100%">
        <div class="__kw_tabs">
          <button class="__kw_tab${setTab === 'general' ? ' on' : ''}" data-tab="general">일반설정</button>
          <button class="__kw_tab${setTab === 'words' ? ' on' : ''}" data-tab="words">단어설정</button>
          <button class="__kw_tab${setTab === 'about' ? ' on' : ''}" data-tab="about">앱 정보</button>
        </div>
        <div id="__kw_set_body" style="flex:1;min-width:0;min-height:0;overflow-y:auto">
          <div id="__kw_set_general" style="display:${setTab === 'general' ? 'block' : 'none'}">
            <div class="__kw_lbl"><label style="cursor:pointer"><input type="checkbox" id="__kw_auto" ${localStorage.getItem(LS_AUTO) === '1' ? 'checked' : ''}> 방송 들어가면 묻지 않고 자동으로 켜기</label></div>
            <div class="__kw_lbl"><label style="cursor:pointer"><input type="checkbox" id="__kw_hist" ${histOn() ? 'checked' : ''}> 불린 대화 목록 별도 표시 (클릭 이동)</label></div>
            <div class="__kw_lbl"><label style="cursor:pointer"><input type="checkbox" id="__kw_dedup" ${dedupOn() ? 'checked' : ''}> 이미 울린 대화 재알림 방지</label></div>
            <div class="__kw_lbl"><label style="cursor:pointer"><input type="checkbox" id="__kw_mute" ${muted() ? 'checked' : ''}> 알람 끄기 (감지·기록은 유지)</label></div>
            <div class="__kw_lbl">같은 호출 다시 울리기까지 (분, 0이면 항상 울림)</div>
            <input class="__kw_in" id="__kw_redup" type="number" min="0" max="120" step="1" style="width:80px" value="${redupMin()}">
          </div>
          <div id="__kw_set_words" style="display:${setTab === 'words' ? 'block' : 'none'}">
            <div class="__kw_lbl">호출 단어 (×로 삭제, 페이지 글자를 드래그해서도 추가 가능)</div>
            <div id="__kw_chips">${keywords.map((k, i) => `<span class="__kw_chip"><span>${escapeHtml(k)}</span><b data-i="${i}" title="삭제">×</b></span>`).join('')}</div>
            <div style="margin-top:6px"><input class="__kw_in" id="__kw_in" placeholder="추가할 단어" style="width:130px">
              <button class="__kw_b" id="__kw_add" style="background:#00ffa3;color:#000">추가</button></div>
            <div class="__kw_lbl">내 닉네임 (이 닉네임의 채팅은 알림 제외)</div>
            <input class="__kw_in" id="__kw_nick" style="width:130px" value="${escapeHtml(myNick)}">
          </div>
          <div id="__kw_set_about" style="display:${setTab === 'about' ? 'block' : 'none'}">
            <div class="__kw_lbl">프로그램</div>
            <div><b>CHZZK Alert</b></div>
            <div class="__kw_lbl">제작자</div>
            <div><b>비류라미</b></div>
            <div style="margin-top:6px;font-size:12px;color:#eee">검은사막 게임을 하다 미리내ES 님과 놀다 심심해서 만듬</div>
            <div class="__kw_lbl">현재 버전</div>
            <div><b>${escapeHtml(SCRIPT_VERSION)}</b> <span style="color:#888">(Beta 채널)</span><button class="__kw_ic" id="__kw_update_check" title="업데이트 확인">${IC.refresh}</button><button class="__kw_upbtn" id="__kw_update_go" disabled>업데이트</button></div>
            <div id="__kw_update_msg" class="__kw_lbl"></div>
            <div class="__kw_lbl"><a href="https://github.com/Dark1004-K/chizizic_call_nickname" target="_blank" rel="noopener" style="color:#00ffa3">GitHub 리포지토리</a> · <a href="https://github.com/Dark1004-K/chizizic_call_nickname/blob/main/UPDATE.md" target="_blank" rel="noopener" style="color:#00ffa3">업데이트 내용</a></div>
          </div>
        </div>
      </div>`;

    setPanel.querySelectorAll('.__kw_tab').forEach((t) => {
      t.onclick = () => {
        setTab = t.dataset.tab;
        try { localStorage.setItem(LS_TAB, setTab); } catch (e) {}
        renderSettings();
      };
    });

    setPanel.querySelectorAll('#__kw_chips b').forEach((b) => {
      b.onclick = () => {
        keywords.splice(Number(b.dataset.i), 1);
        saveKeywords(keywords);
        refreshNormCache();
        renderPanel();
        renderSettings();
      };
    });
    const addBtn = setPanel.querySelector('#__kw_add');
    const addInput = setPanel.querySelector('#__kw_in');
    const doAdd = () => {
      const v = addInput.value.trim();
      if (v && !keywords.includes(v)) { keywords.push(v); saveKeywords(keywords); refreshNormCache(); renderPanel(); renderSettings(); }
    };
    addBtn.onclick = doAdd;
    addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
    setPanel.querySelector('#__kw_nick').onchange = (e) => { myNick = e.target.value; saveNick(myNick); refreshNormCache(); };
    setPanel.querySelector('#__kw_auto').onchange = (e) => localStorage.setItem(LS_AUTO, e.target.checked ? '1' : '0');
    setPanel.querySelector('#__kw_hist').onchange = (e) => {
      try { localStorage.setItem(LS_HIST, e.target.checked ? '1' : '0'); } catch (err) {}
      applyHistVisibility();
      renderHitsList();
    };
    setPanel.querySelector('#__kw_dedup').onchange = (e) => {
      try { localStorage.setItem(LS_DEDUP, e.target.checked ? '1' : '0'); } catch (err) {}
    };
    setPanel.querySelector('#__kw_mute').onchange = (e) => {
      try { localStorage.setItem(LS_MUTE, e.target.checked ? '1' : '0'); } catch (err) {}
      dlog('mute', e.target.checked);
    };
    setPanel.querySelector('#__kw_redup').onchange = (e) => {
      let v = parseFloat(e.target.value);
      if (!isFinite(v) || v < 0) v = 0;
      if (v > 120) v = 120;
      try { localStorage.setItem(LS_REDUP, String(v)); } catch (err) {}
      e.target.value = v;
      dlog('redup', v);
    };
    const updateCheckBtn = setPanel.querySelector('#__kw_update_check');
    if (updateCheckBtn) updateCheckBtn.onclick = () => checkUpdate();
    const updateGoBtn = setPanel.querySelector('#__kw_update_go');
    if (updateGoBtn) updateGoBtn.onclick = () => { try { window.open(UPDATE_URL, '_blank'); } catch (e) {} };
    applySetVisibility();
  }
  function applySetVisibility() {
    if (!setPanel) return;
    setPanel.style.display = (setOpen && panel && panel.classList.contains('show')) ? 'block' : 'none';
  }

  // start()/stop()이나 단어 추가/삭제처럼 구조가 바뀌는 경우만 renderPanel()을 쓰고,
  // 채팅을 한 줄씩 훔을 때는 updateStatsText()만 쓰므로 이제 무한루프 위험이 없음.

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
