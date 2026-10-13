// CHZZK Alert plugin: 1:1 대화방 — 공개 채팅의 "#채팅 상대닉 내용" 줄을 모아 보여준다.
// 전송로가 공개 채팅이라 별도 접속 없이 양쪽이 같은 채팅을 파싱해 같은 방을 복원한다.
// 이 플러그인은 읽기·표시만 한다. 보내기는 패널 입력 → 복사 → 채팅창에 붙여넣고 Enter (사용자가 직접 전송).
// 규격: "#채팅 상대닉 내용" (상대닉은 공백 없는 한 토큰). 나와 무관한 #채팅은 표시하지 않는다.
(function () {
  const KW = window.__KW;
  if (!KW || typeof KW.option !== 'function' || typeof KW.enabled !== 'function') return;
  if (window.__kwChatroomLoaded) return;
  window.__kwChatroomLoaded = true;
  try { if (KW && typeof KW.describe === 'function') KW.describe({ name: 'chatroom', version: '0.1.0' }); } catch (e) {}
  const ID = 'chatroom';
  const COLOR = '#3fd598';
  const ROOM_MAX = 20, MSG_MAX = 50;

  function opt(key, def) {
    try { const v = KW.option(ID, key); return v === undefined || v === null ? def : v; } catch (e) { return def; }
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const xBtn = (id, color, style) => '<button id="' + id + '" title="닫기 (설정 > 확장에서 다시 켤 수 있음)" style="border:0;background:transparent;color:' + color + ';cursor:pointer;padding:5px;border-radius:8px;display:inline-flex;align-items:center;' + (style || '') + '"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
  const turnOff = (key) => { try { if (typeof KW.setOption === 'function') KW.setOption(ID, key, false); } catch (e) {} };
  const TI_CHAT = '<path d="M4 5h16v11H9l-5 4Z"/><path d="M8 9.5h8M8 12.5h5"/>';

  function myNick() {
    try { return (localStorage.getItem('__kw_mynick') || '').trim(); } catch (e) { return ''; }
  }
  // "#채팅 상대닉 내용" 파싱. 아니면 null, 쓰는 법이 틀리면 { err }.
  function parseChatroom(text) {
    const m = /^\s*#\s*채팅([\s\S]*)$/.exec(String(text || ''));
    if (!m) return null;
    if (!m[1] || !/^\s/.test(m[1])) return { err: "'#채팅' 다음에 띄어쓰기를 하고 상대 이름을 적어 주세요. 예) #채팅 미리내 안녕하세요" };
    const body = m[1].trim();
    if (!body) return { err: "상대 이름을 적어 주세요. 예) #채팅 미리내 안녕하세요" };
    const sp = body.search(/\s/);
    const peer = sp < 0 ? body : body.slice(0, sp);
    const content = sp < 0 ? '' : body.slice(sp + 1).trim();
    if (!peer) return { err: "상대 이름을 적어 주세요. 예) #채팅 미리내 안녕하세요" };
    if (!content) return { err: "내용을 적어 주세요. 예) #채팅 미리내 안녕하세요" };
    return { peer, content };
  }
  const noteGuard = new Map();
  function notice(reason) {
    try {
      const now = Date.now();
      if (now - (noteGuard.get(reason) || 0) < 15000) return;
      noteGuard.set(reason, now);
      KW.toast('💬 1:1 대화 안내', reason);
    } catch (e) {}
  }

  // rooms: { [peer]: { peer, msgs: [{ t, from, mine, text }], last } — 새로고침하면 비워짐
  let rooms = {};
  let selPeer = '';
  function touchRoom(peer) {
    let r = rooms[peer];
    if (!r) {
      r = rooms[peer] = { peer, msgs: [], last: Date.now() };
      const keys = Object.keys(rooms);
      if (keys.length > ROOM_MAX) { // 오래된 방부터 정리
        keys.sort((a, b) => (rooms[a].last || 0) - (rooms[b].last || 0));
        for (let i = 0; i < keys.length - ROOM_MAX; i++) { try { delete rooms[keys[i]]; } catch (e) {} }
        if (selPeer && !rooms[selPeer]) selPeer = '';
      }
    }
    r.last = Date.now();
    return r;
  }
  function onChat(d) {
    try {
      if (!d || !KW.enabled(ID)) return;
      const p = parseChatroom(d.text);
      if (!p) return;
      if (p.err) { notice(p.err); return; }
      const me = myNick();
      if (!me) return; // 내 닉네임이 없으면 귀속 판단 불가 (패널에 안내 표시)
      const nick = String(d.nick || '익명');
      let peer = '';
      if (nick === me) peer = p.peer; // 내가 보냄 → 상대는 지목 닉
      else if (p.peer === me) peer = nick; // 나를 지목 → 상대는 작성자
      else return; // 나와 무관
      const r = touchRoom(peer);
      r.msgs.push({ t: Date.now(), from: nick, mine: nick === me, text: p.content });
      if (r.msgs.length > MSG_MAX) r.msgs.splice(0, r.msgs.length - MSG_MAX);
      if (!selPeer) selPeer = peer;
      roomSig = null;
      if (nick !== me && opt('toast', true)) {
        try { KW.toast('💬 ' + nick, p.content); } catch (er) {}
      }
    } catch (e) {}
  }
  try { KW.on('chat', onChat); } catch (e) {}

  // [BETA-TEST-ONLY:start]
  // 테스트: 콘솔에서 __kwChatroomTest() 를 호출하면 가짜 상대 메시지를 즉시 넣어 표시 경로를 시험 (옵션 무시 아님, 플러그인 켜져 있어야 함)
  if (KW.beta) {
    window.__kwChatroomTest = (peer, content) => {
      try {
        onChat({ nick: peer || '테스트상대', text: '#채팅 ' + (myNick() || '나') + ' ' + (content || '테스트 메시지입니다') });
        return '테스트 메시지 주입됨';
      } catch (e) { return '실패: ' + e; }
    };
  }
  // [BETA-TEST-ONLY:end]

  // 메시지 항목을 누르면 원본 채팅으로 스크롤 (불린 대화와 같은 방식)
  const collapse = (t) => String(t || '').replace(/\s+/g, '');
  function jumpToRaw(peer, idx) {
    try {
      const r = rooms[peer];
      const m = r && r.msgs[idx];
      if (!m) return;
      const want = collapse('#채팅 ' + (m.mine ? peer : (myNick() || '')) + ' ' + m.text).slice(0, 60);
      let found = null;
      document.querySelectorAll('[class*="chatting_message"]').forEach((el) => {
        const t = collapse(el.textContent);
        if (t.includes(want)) found = el;
      });
      if (!found) { try { KW.toast('💬 1:1 대화', '현재 대화창에 없음'); } catch (er) {} return; }
      try { found.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (er) { try { found.scrollIntoView(); } catch (er2) {} }
      try { if (typeof KW.highlight === 'function') KW.highlight(found); } catch (er) {}
    } catch (e) {}
  }

  let roomEl = null, roomSig = null;
  const LS_ROOMH = '__kw_chatroom_h';
  const ROOM_H_DEF = 220, ROOM_H_MIN = 120;
  const roomHMax = () => Math.max(ROOM_H_MIN, window.innerHeight);
  let roomH = ROOM_H_DEF;
  try { const hv = parseInt(localStorage.getItem(LS_ROOMH), 10); if (hv >= ROOM_H_MIN && hv <= 4000) roomH = hv; } catch (e) {}
  const LS_ROOMPOS = '__kw_chatroom_pos';

  function removeRoom() {
    if (roomEl) { try { roomEl.remove(); } catch (e) {} }
    roomEl = null;
    roomSig = null;
  }
  function copyDraft() {
    try {
      const inp = roomEl && roomEl.querySelector('[data-cr-inp]');
      const text = inp ? String(inp.value || '').trim() : '';
      if (!selPeer) { notice('먼저 대화 상대를 선택하세요.'); return; }
      if (!text) return;
      const draft = '#채팅 ' + selPeer + ' ' + text;
      const done = () => {
        try { KW.toast('💬 1:1 대화', '복사됨. 채팅창에 붙여넣고 Enter를 누르세요.'); } catch (e) {}
        if (inp) inp.value = '';
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(draft).then(done, () => notice('복사에 실패했습니다.'));
      else {
        const ta = document.createElement('textarea');
        ta.value = draft;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { notice('복사에 실패했습니다.'); }
        ta.remove();
      }
    } catch (e) {}
  }

  function render(now) {
    const stack = document.getElementById('__kw_stack');
    const panel = document.getElementById('__kw_panel');
    if (!opt('show', true) || !stack || !panel || !panel.classList.contains('show')) { removeRoom(); return; }
    const me = myNick();
    if (!roomEl || !roomEl.isConnected) {
      roomEl = document.createElement('div');
      roomEl.id = '__kw_chatroom';
      roomEl.onclick = (e) => {
        if (e.target && e.target.closest && e.target.closest('#__kw_chatroom_x')) { turnOff('show'); removeRoom(); return; }
        const rb = e.target && e.target.closest ? e.target.closest('[data-cr-room]') : null;
        if (rb) { selPeer = rb.getAttribute('data-cr-room'); roomSig = null; render(Date.now()); return; }
        const cp = e.target && e.target.closest ? e.target.closest('[data-cr-copy]') : null;
        if (cp) { copyDraft(); return; }
        const mj = e.target && e.target.closest ? e.target.closest('[data-cr-msg]') : null;
        if (mj) { jumpToRaw(mj.getAttribute('data-cr-peer'), Number(mj.getAttribute('data-cr-msg'))); return; }
      };
      const hist = document.getElementById('__kw_histp');
      try {
        if (hist && hist.parentNode === stack) stack.insertBefore(roomEl, hist);
        else stack.appendChild(roomEl);
      } catch (er) { try { stack.appendChild(roomEl); } catch (er2) { return; } }
      roomSig = null;
    }
    const css = 'position:relative;width:100%;height:' + Math.min(roomH, roomHMax()) + 'px;box-sizing:border-box;background:rgb(20,20,24);color:#fff;font:13px sans-serif;padding:8px 10px 18px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.5);border:1px solid ' + COLOR + ';display:flex;flex-direction:column;overflow:visible';
    if (roomEl.style.position !== 'fixed' && roomEl.getAttribute('data-css') !== css) { roomEl.style.cssText = css; roomEl.setAttribute('data-css', css); }

    const names = Object.keys(rooms).sort((a, b) => (rooms[b].last || 0) - (rooms[a].last || 0));
    if (selPeer && !rooms[selPeer]) selPeer = names[0] || '';
    const sig = [me, selPeer, names.map((n) => n + ':' + (rooms[n].msgs.length ? rooms[n].msgs[rooms[n].msgs.length - 1].t : 0)).join(',')].join('|');
    if (sig !== roomSig) {
      roomSig = sig;
      let h = '<div style="display:flex;align-items:center;min-height:26px;padding-right:28px;flex:none"><b style="font-size:12px;white-space:nowrap;display:inline-flex;align-items:center"><span style="display:inline-flex;align-items:center;color:' + COLOR + ';margin-right:5px"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + TI_CHAT + '</svg></span>1:1 대화&nbsp;<span style="color:' + COLOR + '">(' + names.length + ')</span></b></div>' +
        xBtn('__kw_chatroom_x', COLOR, 'position:absolute;top:2px;right:3px;z-index:2');
      if (!me) {
        h += '<div style="font-size:11px;color:#aaa;margin-top:6px;line-height:1.5">내 닉네임을 먼저 입력하세요.<br>설정 ⚙ → 단어설정 → 내 닉네임</div>';
      } else if (!names.length) {
        h += '<div style="font-size:11px;color:#aaa;margin-top:6px;line-height:1.5">아직 대화가 없습니다.<br>채팅에 <b>#채팅 상대이름 내용</b> 처럼 쓰면 여기 모입니다.</div>';
      } else {
        h += '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;flex:none">' + names.map((n) => {
          const on = n === selPeer;
          return '<button data-cr-room="' + esc(n) + '" style="border:1px solid ' + (on ? COLOR : '#555') + ';background:' + (on ? 'rgba(63,213,152,.15)' : 'transparent') + ';color:' + (on ? COLOR : '#ccc') + ';border-radius:8px;padding:3px 8px;font-size:12px;cursor:pointer">' + esc(n) + '</button>';
        }).join('') + '</div>';
        const r = rooms[selPeer];
        if (r) {
          h += '<div class="__kw_sb_cr" style="flex:1;min-height:0;overflow-y:auto;margin-top:6px;display:flex;flex-direction:column;gap:3px">' + r.msgs.map((m, i) => {
            const who = m.mine ? '나' : m.from;
            return '<div data-cr-msg="' + i + '" data-cr-peer="' + esc(selPeer) + '" title="누르면 원본 채팅으로 이동" style="font-size:12px;line-height:1.45;cursor:pointer;text-align:' + (m.mine ? 'right' : 'left') + '"><span style="color:' + (m.mine ? COLOR : '#ff9a7a') + '">' + esc(who) + '</span> <span style="color:#eee">' + esc(m.text) + '</span></div>';
          }).join('') + '</div>';
          h += '<div style="display:flex;gap:4px;margin-top:6px;flex:none"><input data-cr-inp placeholder="' + esc(selPeer) + '에게 보낼 내용" style="flex:1;min-width:0;background:rgba(255,255,255,.07);border:1px solid #555;border-radius:8px;color:#fff;font-size:12px;padding:5px 8px;outline:none"><button data-cr-copy title="채팅용 한 줄로 복사 (붙여넣고 Enter)" style="border:1px solid ' + COLOR + ';background:transparent;color:' + COLOR + ';border-radius:8px;padding:5px 10px;font-size:12px;cursor:pointer;flex:none">복사</button></div>';
        }
      }
      const sc = roomEl.querySelector('.__kw_sb_cr');
      const keepBottom = sc ? (sc.scrollHeight - sc.scrollTop - sc.clientHeight < 40) : true;
      roomEl.innerHTML = h;
      const sc2 = roomEl.querySelector('.__kw_sb_cr');
      if (sc2 && keepBottom) { try { sc2.scrollTop = sc2.scrollHeight; } catch (e) {} }
      const inp = roomEl.querySelector('[data-cr-inp]');
      if (inp) inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') copyDraft(); if (ev.stopPropagation) ev.stopPropagation(); });
    }
    try {
      if (KW && typeof KW.float === 'function') KW.float(roomEl, { color: COLOR, key: LS_ROOMPOS });
    } catch (e) {}
    try {
      if (KW && typeof KW.rsz === 'function') KW.rsz(roomEl, {
        dir: 'v',
        color: COLOR,
        getH: () => roomH,
        setH: (v) => {
          roomH = Math.max(ROOM_H_MIN, Math.min(roomHMax(), v));
          roomEl.style.height = Math.min(roomH, roomHMax()) + 'px';
          roomEl.setAttribute('data-css', roomEl.style.cssText);
        },
        save: () => { try { localStorage.setItem(LS_ROOMH, String(roomH)); } catch (er) {} },
      });
    } catch (e) {}
  }

  function tick() {
    try {
      if (!KW.enabled(ID)) { removeRoom(); return; }
      render(Date.now());
    } catch (e) {}
  }
  setInterval(tick, 1000);
})();
