  // ---------- 파티모집 ----------
  // 치지직 채팅에 "#파티 검은사당 10분 내용..." 이라고 쓰면 등록된다. 종류는 아래 7가지(그 밖의 말은 "기타").
  // 한 사람(닉네임)당 진행 중인 모집은 1개만, 모집 시간(최대 10분, 안 쓰면 10분)이 지나면 저절로 사라진다.
  // 선택한 종류가 등록되면 알림(토스트·알림음·TTS)이 울린다. 목록은 이 페이지에서만 기억한다(새로고침하면 비움).
  const PARTY_KINDS = ['항해일퀘', '검은사당', '피의제단', '파티사냥', '아토락시온', '솔라레', '기타'];
  const PARTY_MAX_MIN = 10;
  let parties = []; // { id, nick, kind, content, exp }
  let partyEl = null, partySig = null;
  // window.__KW_UI.partyShown/partyAlarmBlink는 코어(src/core.js)와 공유 (녹색창 버튼도 같은 값을 씀)
  function partyKindsSel() {
    const v = opt('partyKinds', null);
    return Array.isArray(v) ? v : PARTY_KINDS.slice();
  }
  // "#파티"로 시작하는 채팅을 읽는다. 쓰는 법이 틀리면 { err: '이유' }, 맞으면 { kind, mins, content, clamped }.
  function parseParty(text) {
    const m = /^\s*#\s*파티([\s\S]*)$/.exec(String(text || ''));
    if (!m) return null; // #파티 로 시작하지 않으면 파티모집 채팅이 아님
    if (m[1] && !/^\s/.test(m[1])) return { err: "'#파티' 다음에 띄어쓰기를 하고 종류를 적어 주세요. 예) #파티 검은사당 10분 내용" };
    const body = (m[1] || '').trim();
    if (!body) return { err: '종류를 적어 주세요. 예) #파티 검은사당 10분 내용' };
    const mk = /^(\S+)([\s\S]*)$/.exec(body);
    const kind = mk[1];
    if (!PARTY_KINDS.includes(kind)) { // 종류(#파티 다음 두 번째 말)가 목록에 없으면 오류
      return { err: "'" + kind.slice(0, 12) + "'은(는) 없는 종류입니다. " + PARTY_KINDS.join(' · ') + ' 중 하나를 써 주세요.' };
    }
    let rest = mk[2];
    // 시간(종류 다음 세 번째 말)은 꼭 "X분" 형태여야 한다 (생략 불가). 쓴 분이 모집 시간이고, 10분을 넘게 써도 10분까지.
    let clamped = false;
    const mm = /^\s*(\d{1,4})\s*분\s*([\s\S]*)$/.exec(rest);
    if (!mm) {
      if (/^\s*\d+(?:\s|$)/.test(rest)) return { err: "시간은 '10분'처럼 숫자 뒤에 '분'을 붙여 주세요." };
      return { err: "종류 다음에 시간을 '10분'처럼 꼭 써 주세요 (생략할 수 없어요). 예) #파티 " + kind + ' 10분 내용' };
    }
    const n = parseInt(mm[1], 10);
    if (n < 1) return { err: '시간은 1분 이상으로 적어 주세요. 예) 5분' };
    if (n > PARTY_MAX_MIN) clamped = true;
    const mins = Math.min(PARTY_MAX_MIN, n);
    rest = mm[2];
    return { kind, mins, clamped, content: rest.replace(/\s+/g, ' ').trim().slice(0, 60) };
  }
  // 등록이 안 될 때(쓰는 법 오류·이미 모집 중) 이유를 토스트로 안내한다(파티 창에는 표시하지 않음). 같은 사람이 같은 이유로 도배하면 15초에 한 번만.
  const partyNoteGuard = new Map();
  function partyNotice(nick, reason) {
    const now = Date.now();
    const key = nick + '|' + reason;
    if (now - (partyNoteGuard.get(key) || 0) < 15000) return;
    partyNoteGuard.set(key, now);
    if (partyNoteGuard.size > 100) { for (const [k, t] of partyNoteGuard) { if (now - t > 60000) partyNoteGuard.delete(k); } }
    try { KW.toast('👥 파티 모집 안내', nick + ' · ' + reason); } catch (e) {}
  }
  function onChat(d) {
    try {
      if (!d || !KW.enabled(ID) || !opt('party', true)) return;
      const p = parseParty(d.text);
      if (!p) return;
      const nick = String(d.nick || '익명');
      if (p.err) { partyNotice(nick, p.err); return; }
      const now = Date.now();
      parties = parties.filter((x) => x.exp > now);
      const mine = parties.find((x) => x.nick === nick);
      if (mine) { // 한 사람당 1회: 진행 중인 모집이 끝나야 다시 등록할 수 있다
        partyNotice(nick, '이미 모집 중입니다. ' + fmt(mine.exp - now) + ' 뒤에 다시 등록할 수 있어요.');
        return;
      }
      const e = { id: now + '-' + Math.random().toString(36).slice(2, 6), nick, kind: p.kind, content: p.content, raw: String(d.text || ''), exp: now + p.mins * 60000 };
      parties.push(e);
      partySig = null;
      if (p.clamped) partyNotice(nick, '모집 시간은 최대 ' + PARTY_MAX_MIN + '분이라 ' + PARTY_MAX_MIN + '분으로 등록했어요.');
      if (partyKindsSel().includes(e.kind)) { // 선택한 종류만 알림 + 창 자동 표시
        const pNick = nick, pKind = e.kind, pContent = e.content;
        try {
          palarm(0, () => {
            try { KW.toast('👥 ' + pKind + ' 파티 모집', pNick + (pContent ? ': ' + pContent : '')); } catch (er) {}
            if (opt('sound', true)) { if (typeof KW.sound === 'function') KW.sound(); else beep(); }
            try { if (typeof KW.emit === 'function') KW.emit('party', { nick: pNick, kind: pKind, content: pContent }); } catch (er) {}
          }, 1400);
        } catch (er) {}
        setPartyShown(true);
        window.__KW_UI.partyAlarmBlink = true; // 보이면 아래 updateParty가 바로 해제, 숨어있으면 메인 버튼 반짝임 유지
        try { updateParty(Date.now()); } catch (er) {}
        try { updateMain(Date.now()); } catch (er) {}
      }
    } catch (e) {}
  }
  try { KW.on('chat', onChat); } catch (e) {}
  let partyDelBtn = () => ''; // 항목별 삭제 버튼 HTML (정식에서는 없음)
  // [BETA-TEST-ONLY:start]
  // 베타에서만: 진행 중인 파티 모집을 임의로 지울 수 있는 ✕ 버튼 (한 사람 1회 제한도 같이 풀림)
  if (KW.beta) {
    partyDelBtn = (id) => '<button data-pdel="' + esc(id) + '" title="이 모집 삭제 (베타 전용)" style="border:0;background:transparent;color:#ff7a59;cursor:pointer;padding:0 2px;font-size:13px;line-height:1;flex:none">✕</button>';
  }
  // [BETA-TEST-ONLY:end]
  // 파티 항목을 누르면 불린 대화처럼 그 채팅으로 스크롤한다. 지금 대화창에 없으면 없다고만 알린다.
  const collapse = (t) => String(t || '').replace(/\s+/g, '');
  function findPartyChat(e) {
    const want = collapse(e.raw);
    const nick = collapse(e.nick);
    let found = null;
    try {
      document.querySelectorAll('[class*="chatting_message"]').forEach((el) => { // 같은 글이 여러 번이면 가장 아래(최근) 것
        const t = collapse(el.textContent);
        if (t.includes(want) && (!nick || t.includes(nick))) found = el;
      });
    } catch (er) {}
    return found;
  }
  function jumpToParty(id) {
    const e = parties.find((x) => x.id === id);
    if (!e) return;
    const el = findPartyChat(e);
    if (!el) { try { KW.toast('👥 파티 모집', '현재 대화창에 없음'); } catch (er) {} return; }
    try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (er) { try { el.scrollIntoView(); } catch (er2) {} }
    try { if (typeof KW.highlight === 'function') KW.highlight(el); } catch (er) {}
  }
  function removeParty() {
    if (partyEl) { try { partyEl.remove(); } catch (e) {} }
    partyEl = null;
    partySig = null;
  }
  function setPartyShown(v) { // 표시 전환 (바뀔 때만 녹색 버튼 갱신)
    v = !!v;
    if (window.__KW_UI.partyShown === v) return;
    window.__KW_UI.partyShown = v;
    if (!v) window.__KW_UI.partyAlarmBlink = false; // 닫힘=확인
    try { if (typeof renderPanel === 'function') renderPanel(); } catch (e) {}
  }
  function updateParty(now) {
    const stack = document.getElementById('__kw_stack');
    const panel = document.getElementById('__kw_panel');
    if (!opt('party', true)) { parties = []; setPartyShown(false); removeParty(); return; }
    if (!stack || !panel || !panel.classList.contains('show')) { removeParty(); return; }
    parties = parties.filter((x) => x.exp > now);
    const sel = partyKindsSel();
    const list = parties.filter((x) => sel.includes(x.kind));
    if (!window.__KW_UI.partyShown) { removeParty(); return; } // 기본 숨음 + X로 닫은 뒤: 새 알림까지 숨음 유지
    if (window.__KW_UI.partyAlarmBlink) { window.__KW_UI.partyAlarmBlink = false; try { if (typeof renderPanel === 'function') renderPanel(); } catch (e) {} } // 보이면 반짝임 해제
    if (!partyEl || !partyEl.isConnected) {
      partyEl = document.createElement('div');
      partyEl.id = '__kw_bdo_party';
      partyEl.onclick = (e) => {
        if (e.target && e.target.closest && e.target.closest('#__kw_bdo_party_x')) { setPartyShown(false); removeParty(); return; } // X = 창만 닫기 (알림 옵션 유지)
        if (e.target && e.target.closest && e.target.closest('[data-pdel]')) return; // 베타 삭제 버튼은 이동하지 않음
        const row = e.target && e.target.closest ? e.target.closest('[data-pjump]') : null;
        if (row) jumpToParty(row.getAttribute('data-pjump'));
      };
      stack.appendChild(partyEl);
      partySig = null;
      // [BETA-TEST-ONLY:start]
      partyEl.addEventListener('click', (e) => { // 베타 전용: ✕로 모집 삭제
        const b = e.target && e.target.closest ? e.target.closest('[data-pdel]') : null;
        if (!b) return;
        const id = b.getAttribute('data-pdel');
        parties = parties.filter((x) => x.id !== id);
        partySig = null;
        updateParty(Date.now());
      });
      // [BETA-TEST-ONLY:end]
    }
    // 스택 직속 1칸: 옆붙임 absolute 제거, 높이는 대각 핸들로 조절. 바깥은 overflow:visible이어야 좌상 +원과 우하 원이 잘리지 않음(목록 스크롤은 안쪽 .__kw_sb_pty가 담당)
    const css = 'position:relative;width:100%;height:' + Math.min(partyH, partyHMax()) + 'px;' + 'box-sizing:border-box;background:rgb(20,20,24);color:#fff;font:13px sans-serif;padding:8px 10px 18px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.5);border:1px solid #ff7a59;display:flex;flex-direction:column;overflow:visible';
    // 떠 있는 상태(fixed)에서는 손대지 않는다: cssText를 덮으면 left/top/width가 날아가 위치가 튐
    if (partyEl.style.position !== 'fixed' && partyEl.style.cssText !== css && partyEl.getAttribute('data-css') !== css) { partyEl.style.cssText = css; partyEl.setAttribute('data-css', css); }
    bdoOrder();
    const sig = list.map((x) => x.id).join(',');
    if (sig !== partySig) {
      partySig = sig;
      let h = '<div style="display:flex;align-items:center;min-height:26px;padding-right:28px;flex:none"><b style="font-size:12px;white-space:nowrap;display:inline-flex;align-items:center">' + TI(TI_USERS, '#ff7a59') + '파티 모집&nbsp;<span style="color:#ff7a59">(' + list.length + ')</span></b></div>' +
        xBtn('__kw_bdo_party_x', '#ff7a59', 'position:absolute;top:2px;right:3px;z-index:2') +
        '<div style="flex:none;height:1px;background:rgba(255,255,255,.14);margin:4px -10px 0"></div>' +
        '<div class="__kw_sb_pty" style="flex:1;min-height:0;overflow-y:auto;margin-top:4px">';
      if (!list.length) h += '<div style="font-size:11px;color:#aaa;margin-top:6px;line-height:1.5">모집 중인 파티가 없습니다.<br>채팅에 <b>#파티 검은사당 10분 내용</b> 처럼 쓰면 등록됩니다.</div>';
      list.forEach((x, xi) => {
        h += '<div data-pjump="' + esc(x.id) + '" title="클릭하면 해당 채팅으로 이동" style="' + (xi ? 'margin-top:7px;padding-top:6px;border-top:1px solid rgba(255,255,255,.12);' : 'margin-top:2px;') + 'cursor:pointer">' +
          '<div style="display:flex;align-items:center;gap:6px"><span style="background:#3a2a24;color:#ff9a7a;border-radius:6px;padding:1px 6px;font-size:11px;font-weight:bold;white-space:nowrap">' + esc(x.kind) + '</span>' +
          '<b style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0">' + esc(x.nick) + '</b>' +
          '<span data-pexp="' + x.exp + '" style="margin-left:auto;font-size:11px;color:#ff9a7a;white-space:nowrap"></span>' + partyDelBtn(x.id) + '</div>' +
          (x.content ? '<div style="font-size:12px;color:#ddd;margin-top:3px;word-break:break-all">' + esc(x.content) + '</div>' : '') + '</div>';
      });
      h += '</div>';
      const sc = partyEl.querySelector('.__kw_sb_pty');
      const top = sc ? sc.scrollTop : 0;
      partyEl.innerHTML = h;
      const sc2 = partyEl.querySelector('.__kw_sb_pty');
      if (sc2) sc2.scrollTop = top;
    }
    partyEl.querySelectorAll('[data-pexp]').forEach((el) => { el.textContent = fmt(Number(el.getAttribute('data-pexp')) - now) + ' 남음'; });
    try { // 창 기본형 상속: 파티=가로+세로
      if (KW && typeof KW.window === 'function') {
        KW.window(partyEl, {
          color: '#ff7a59', posKey: LS_PARTYPOS, rsz: 'd', dock: () => bdoOrder(),
          getH: () => partyH,
          setH: (v) => {
            partyH = Math.max(PARTY_H_MIN, Math.min(partyHMax(), v));
            partyEl.style.height = Math.min(partyH, partyHMax()) + 'px';
            partyEl.setAttribute('data-css', partyEl.style.cssText);
          },
          saveH: () => { try { localStorage.setItem(LS_PARTYH, String(partyH)); } catch (er) {} },
        });
      } else {
        if (KW && typeof KW.rsz === 'function') KW.rsz(partyEl, {
          dir: 'v', color: '#ff7a59',
          getH: () => partyH,
          setH: (v) => {
            partyH = Math.max(PARTY_H_MIN, Math.min(partyHMax(), v));
            partyEl.style.height = Math.min(partyH, partyHMax()) + 'px';
            partyEl.setAttribute('data-css', partyEl.style.cssText);
          },
          save: () => { try { localStorage.setItem(LS_PARTYH, String(partyH)); } catch (er) {} },
        });
        if (KW && typeof KW.float === 'function') KW.float(partyEl, { color: '#ff7a59', key: LS_PARTYPOS, dock: () => bdoOrder() });
      }
    } catch (e) {}
  }

