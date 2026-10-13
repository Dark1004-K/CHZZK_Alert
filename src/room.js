// 1:1 대화방 (코어) — 페어링은 공개 채팅, 내용은 E2E 암호화 후 릴레이.
// 비밀(개인키·방키)은 어디에도 올리지 않는다. 공개 채팅에 오가는 것은 초대·수락·공개키뿐.
//   1. A: "#채팅 X" (초대, X는 공백 없는 한 토큰, 5분 유효)
//   2. X: "#참가 <X공개키44>" (수락. 패널 [참가] 클릭 시 자동 생성·복사)
//   3. A: "#키 <A공개키44>" (패널 [키 보내기] 클릭 시 복사. X만 아는 게 아니라 공개키라 공개돼도 무해)
//   4. 양쪽이 ECDH(X25519)로 같은 방키 유도 → 이후 릴레이에 AES-GCM 암호문만.
// 수락에 공개키가 없으면(수동 #참가) 평문 공개방으로 동작 (필터 뷰).
// 보내기(초대·수락·키·복사)는 전부 사용자가 Enter/클릭으로 직접. 스크립트는 읽기·생성·표시만.
(function () {
  const KW = window.__KW;
  if (!KW || typeof KW.on !== 'function') return;
  if (window.__kwRoomLoaded) return;
  window.__kwRoomLoaded = true;
  const COLOR = '#3fd598';
  const ROOM_MAX = 20, MSG_MAX = 50;
  const INVITE_MS = 5 * 60000;
  const POLL_MS = 5000;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const xBtn = (id, color, style) => '<button id="' + id + '" title="닫기 (새로고침하면 다시 표시)" style="border:0;background:transparent;color:' + color + ';cursor:pointer;padding:5px;border-radius:8px;display:inline-flex;align-items:center;' + (style || '') + '"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
  const TI_CHAT = '<path d="M4 5h16v11H9l-5 4Z"/><path d="M8 9.5h8M8 12.5h5"/>';
  let sessionHidden = false;

  function myNick() {
    try { return (localStorage.getItem('__kw_mynick') || '').trim(); } catch (e) { return ''; }
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
  function copyText(draft, okMsg) {
    try {
      const done = () => { try { KW.toast('💬 1:1 대화', okMsg || '복사됨. 채팅창에 붙여넣고 Enter를 누르세요.'); } catch (e) {} };
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

  // ---------- 규격 파싱 ----------
  function parseInvite(text) { // "#채팅 X" (내용이 뒤에 붙어도 첫 토큰만 상대)
    const m = /^\s*#\s*채팅([\s\S]*)$/.exec(String(text || ''));
    if (!m) return null;
    if (!m[1] || !/^\s/.test(m[1])) return { err: "'#채팅' 다음에 띄어쓰기를 하고 상대 이름을 적어 주세요. 예) #채팅 미리내" };
    const peer = m[1].trim().split(/\s+/)[0] || '';
    if (!peer) return { err: "상대 이름을 적어 주세요. 예) #채팅 미리내" };
    return { peer };
  }
  function parseAccept(text) { // "#참가" 또는 "#참가 <공개키>"
    const m = /^\s*#\s*참가([\s\S]*)$/.exec(String(text || ''));
    if (!m) return null;
    if (m[1] && !/^\s*$/.test(m[1]) && !/^\s/.test(m[1])) return { err: "'#참가'는 띄어쓰기 없이 쓰거나, 비워 두세요." };
    const key = (m[1] || '').trim().split(/\s+/)[0] || '';
    return { key };
  }
  function parsePubkeyPost(text) { // "#키 <공개키>"
    const m = /^\s*#\s*키([\s\S]*)$/.exec(String(text || ''));
    if (!m) return null;
    const key = (m[1] || '').trim().split(/\s+/)[0] || '';
    if (!key) return { err: "'#키' 다음에 공개키를 적어 주세요." };
    return { key };
  }

  // ---------- 암호 (WebCrypto X25519 + AES-GCM. 전부 로컬, 비밀 송신 없음) ----------
  const b64e = (buf) => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); };
  const b64d = (s) => { const bin = atob(String(s || '')); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b.buffer; };
  const te = (s) => new TextEncoder().encode(String(s || ''));
  const LS_IDK = '__kw_room_idk'; // 내 신원 키쌍 (JWK, 이 브라우저에만)
  let idkPubB64 = '', idkCache = null;
  async function myKeypair() {
    if (idkCache) return idkCache;
    try {
      const saved = JSON.parse(localStorage.getItem(LS_IDK) || 'null');
      if (saved && saved.priv && saved.pub) {
        const priv = await crypto.subtle.importKey('jwk', saved.priv, { name: 'X25519' }, true, ['deriveBits']);
        idkPubB64 = saved.pub;
        idkCache = { priv, pubB64: saved.pub };
        return idkCache;
      }
    } catch (e) {}
    const kp = await crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
    const raw = await crypto.subtle.exportKey('raw', kp.publicKey);
    const pubB64 = b64e(raw);
    try {
      const privJwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
      localStorage.setItem(LS_IDK, JSON.stringify({ priv: privJwk, pub: pubB64 }));
    } catch (e) {}
    idkPubB64 = pubB64;
    idkCache = { priv: kp.privateKey, pubB64 };
    return idkCache;
  }
  async function roomKeyFor(peerPubB64, pairTag) {
    const me = await myKeypair();
    const peerPub = await crypto.subtle.importKey('raw', b64d(peerPubB64), { name: 'X25519' }, false, []);
    const shared = await crypto.subtle.deriveBits({ name: 'X25519', public: peerPub }, me.priv, 256);
    const seed = new Uint8Array([...new Uint8Array(shared), ...te('kwr1|' + pairTag)]);
    const raw = await crypto.subtle.digest('SHA-256', seed);
    return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }
  async function seal(aesKey, text) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, te(text));
    return { iv: b64e(iv), ct: b64e(ct) };
  }
  async function open(aesKey, ivB64, ctB64) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(b64d(ivB64)) }, aesKey, b64d(ctB64));
    return new TextDecoder().decode(pt);
  }
  async function shaHex(s) {
    const d = await crypto.subtle.digest('SHA-256', te(s));
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // ---------- 릴레이 (ntfy 공개 토픽. 내용은 전부 암호문) ----------
  const RELAY = 'https://ntfy.sh';
  const topicCache = {};
  async function topicUrl(pairTag) {
    if (!topicCache[pairTag]) {
      const h = await shaHex('kwr1|' + pairTag);
      topicCache[pairTag] = RELAY + '/kwr-' + h.slice(0, 16);
    }
    return topicCache[pairTag];
  }
  async function relayFetch(url, opt) {
    // 직접 fetch 우선, 실패(CORS 등)하면 동반 브릿지 경유
    try {
      const r = await fetch(url, opt);
      if (!r.ok) throw new Error('http ' + r.status);
      return r;
    } catch (e) {
      if (KW && typeof KW.bridge === 'function' && (!opt || !opt.method || opt.method === 'GET')) {
        const res = await KW.bridge('fetch', { url, base: RELAY }, 12000);
        if (!res || !res.ok) throw new Error('bridge ' + ((res && res.error) || 'fail'));
        return { text: async () => (res.data && res.data.html) || '' };
      }
      throw e;
    }
  }
  async function relayPoll(room) {
    const url = await topicUrl(room.tag);
    const since = room.lastRelayId ? room.lastRelayId : 'all';
    const r = await relayFetch(url + '/json?poll=1&since=' + encodeURIComponent(since));
    const txt = await r.text();
    const out = [];
    for (const line of String(txt || '').split('\n')) {
      const s = line.trim();
      if (!s) continue;
      try {
        const j = JSON.parse(s);
        if (j && j.id && j.message) out.push(j);
      } catch (e) {}
    }
    return out;
  }
  async function relayPost(room, obj) {
    const url = await topicUrl(room.tag);
    const body = JSON.stringify(obj);
    try {
      const r = await fetch(url, { method: 'POST', body });
      if (!r.ok) throw new Error('http ' + r.status);
      return true;
    } catch (e) {
      notice('전송 실패. 동반 브릿지가 있으면 다시 시도하세요.');
      return false;
    }
  }

  // ---------- 방 상태 ----------
  // rooms: { [peer]: { peer, tag, secure, aesKey, peerPub, msgs, last, lastRelayId, awaitingKey } }
  let rooms = {};
  let selPeer = '';
  let invites = []; // [{ from, peer, t }] 내가 보내거나 받은 초대 (5분 유효)
  function pairTag(a, b) { return [a, b].sort().join('◈'); }
  function touchRoom(peer, secure) {
    const tag = pairTag(myNick(), peer);
    let r = rooms[peer];
    if (!r) {
      r = rooms[peer] = { peer, tag, secure: !!secure, aesKey: null, peerPub: '', msgs: [], last: Date.now(), lastRelayId: '', awaitingKey: false };
      const keys = Object.keys(rooms);
      if (keys.length > ROOM_MAX) {
        keys.sort((a, b) => (rooms[a].last || 0) - (rooms[b].last || 0));
        for (let i = 0; i < keys.length - ROOM_MAX; i++) { try { delete rooms[keys[i]]; } catch (e) {} }
        if (selPeer && !rooms[selPeer]) selPeer = '';
      }
    }
    if (secure) r.secure = true;
    r.last = Date.now();
    return r;
  }
  function pushMsg(peer, from, mine, text) {
    const r = touchRoom(peer, false);
    r.msgs.push({ t: Date.now(), from, mine: !!mine, text: String(text || '') });
    if (r.msgs.length > MSG_MAX) r.msgs.splice(0, r.msgs.length - MSG_MAX);
    if (!selPeer) selPeer = peer;
    roomSig = null;
  }
  function pruneInvites(now) {
    invites = invites.filter((x) => now - x.t < INVITE_MS);
  }
  async function trySecure(room) {
    // 양쪽 공개키가 모이면 방키 유도 (어느 쪽에서든 호출 가능, 같은 값)
    if (room.aesKey || !room.peerPub || !idkPubB64) return;
    try {
      room.aesKey = await roomKeyFor(room.peerPub, room.tag);
      room.secure = true;
      roomSig = null;
    } catch (e) {}
  }

  async function onChat(d) {
    try {
      if (!d) return;
      const me = myNick();
      const nick = String(d.nick || '익명');
      const now = Date.now();
      pruneInvites(now);
      // 1) 초대
      const inv = parseInvite(d.text);
      if (inv && !inv.err) {
        invites.push({ from: nick, peer: inv.peer, t: now });
        if (me && inv.peer === me && nick !== me) {
          try { KW.toast('💬 1:1 대화 초대', nick + '님이 초대했습니다. 패널에서 [참가]를 누르세요.'); } catch (er) {}
        }
        roomSig = null;
        return;
      }
      if (inv && inv.err && me && nick === me) { notice(inv.err); return; }
      // 2) 수락
      const acc = parseAccept(d.text);
      if (acc && !acc.err) {
        if (!me) return;
        // 내가 보낸 초대 중 이 사람이 수락한 것 찾기 (가장 최근)
        let m = null;
        for (let i = invites.length - 1; i >= 0; i--) {
          const x = invites[i];
          if (x.from === me && x.peer === nick) { m = x; break; }
        }
        if (!m) {
          // 나를 지목한 초대가 있으면 내가 수락한 것 (X 입장)
          let inv2 = null;
          for (let i = invites.length - 1; i >= 0; i--) {
            const x = invites[i];
            if (x.peer === me && x.from === nick) { inv2 = x; break; }
          }
          if (inv2 && nick !== me) {
            const r = touchRoom(nick, !!acc.key);
            if (acc.key) {
              r.peerPub = acc.key;
              try { await myKeypair(); } catch (e) {}
              trySecure(r);
            }
          }
          return;
        }
        // A 입장: 초대 상대가 수락
        const r = touchRoom(nick, !!acc.key);
        if (acc.key) {
          r.peerPub = acc.key;
          try { await myKeypair(); } catch (e) {}
          trySecure(r);
          r.awaitingKey = !r.aesKey; // 내 공개키를 아직 안 보냈으면 패널에 [키 보내기]
          try { KW.toast('💬 1:1 대화', nick + '님이 수락했습니다. 패널에서 [키 보내기]를 누르세요.'); } catch (er) {}
        } else {
          pushMsg(nick, nick, false, '(평문 참가)');
        }
        roomSig = null;
        return;
      }
      if (acc && acc.err && me && nick === me) { notice(acc.err); return; }
      // 3) 공개키 게시 (#키)
      const kp = parsePubkeyPost(d.text);
      if (kp && !kp.err) {
        if (!me || nick === me) return;
        // 내가 그 사람에게 보낸 초대가 있고, 아직 키 교환 전이면 상대 공개키 확정
        const r = rooms[nick];
        if (r) {
          if (!r.peerPub) r.peerPub = kp.key;
          try { await myKeypair(); } catch (e) {}
          trySecure(r);
          r.awaitingKey = false;
          roomSig = null;
        }
        return;
      }
      // 4) 평문 공개방 메시지 (#채팅 X 내용 — 초대 형식이 아니라 대화 형식)
      const dm = parseRoomMsg(d.text);
      if (dm && me) {
        if (nick === me) {
          const r = touchRoom(dm.peer, false);
          r.msgs.push({ t: now, from: me, mine: true, text: dm.content });
          if (r.msgs.length > MSG_MAX) r.msgs.splice(0, r.msgs.length - MSG_MAX);
          if (!selPeer) selPeer = dm.peer;
          roomSig = null;
        } else if (dm.peer === me) {
          pushMsg(nick, nick, false, dm.content);
        }
      }
    } catch (e) {}
  }
  function parseRoomMsg(text) { // "#채팅 X 내용" (X 뒤에 내용이 있을 때만 대화)
    const m = /^\s*#\s*채팅\s+(\S+)\s+([\s\S]+)$/.exec(String(text || ''));
    if (!m) return null;
    return { peer: m[1], content: m[2].trim() };
  }
  try { KW.on('chat', onChat); } catch (e) {}

  // [BETA-TEST-ONLY:start]
  window.__kwRoomTest = (peer, content) => {
    try {
      onChat({ nick: peer || '테스트상대', text: '#채팅 ' + (myNick() || '나') + ' ' + (content || '테스트 메시지입니다') });
      return '테스트 메시지 주입됨';
    } catch (e) { return '실패: ' + e; }
  };
  window.__kwRoomCryptoTest = async () => {
    try {
      const a = await crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
      const b = await crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
      const rawA = await crypto.subtle.exportKey('raw', a.publicKey);
      const rawB = await crypto.subtle.exportKey('raw', b.publicKey);
      const pubA = await crypto.subtle.importKey('raw', rawB, { name: 'X25519' }, false, []);
      const pubB = await crypto.subtle.importKey('raw', rawA, { name: 'X25519' }, false, []);
      const sa = await crypto.subtle.deriveBits({ name: 'X25519', public: pubA }, a.privateKey, 256);
      const sb = await crypto.subtle.deriveBits({ name: 'X25519', public: pubB }, b.privateKey, 256);
      const ka = await crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', sa), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
      const kb = await crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', sb), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, ka, te('hello'));
      const pt = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, kb, ct));
      return pt === 'hello' ? 'E2E 자가검증 통과' : '복호화 불일치';
    } catch (e) { return '미지원/실패: ' + e; }
  };
  // [BETA-TEST-ONLY:end]

  const collapse = (t) => String(t || '').replace(/\s+/g, '');
  function jumpToRaw(peer, idx) {
    try {
      const r = rooms[peer];
      const m = r && r.msgs[idx];
      if (!m) return;
      const want = collapse(m.text).slice(0, 40);
      let found = null;
      document.querySelectorAll('[class*="chatting_message"]').forEach((el) => {
        const t = collapse(el.textContent);
        if (want && t.includes(want)) found = el;
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
  // 패널의 초대 1건 (나를 지목한 가장 최근 유효 초대)
  function myInvite() {
    const me = myNick();
    if (!me) return null;
    const now = Date.now();
    pruneInvites(now);
    for (let i = invites.length - 1; i >= 0; i--) {
      const x = invites[i];
      if (x.peer === me && x.from !== me) return x;
    }
    return null;
  }
  async function acceptInvite() {
    try {
      const inv = myInvite();
      if (!inv) { notice('수락할 초대가 없습니다.'); return; }
      const me = await myKeypair();
      copyText('#참가 ' + me.pubB64, '복사됨. 채팅창에 붙여넣고 Enter를 누르세요.');
    } catch (e) { notice('키 생성 실패. 브라우저를 확인하세요.'); }
  }
  async function sendMyKey(peer) {
    try {
      const me = await myKeypair();
      copyText('#키 ' + me.pubB64, '복사됨. 채팅창에 붙여넣고 Enter를 누르세요.');
      const r = rooms[peer];
      if (r) { r.awaitingKey = false; roomSig = null; }
    } catch (e) { notice('키 생성 실패. 브라우저를 확인하세요.'); }
  }
  async function sendSecure() {
    try {
      const r = rooms[selPeer];
      const inp = roomEl && roomEl.querySelector('[data-cr-inp]');
      const text = inp ? String(inp.value || '').trim() : '';
      if (!r || !r.aesKey) { notice('암호방이 아직 준비되지 않았습니다.'); return; }
      if (!text) return;
      const s = await seal(r.aesKey, text);
      const ok = await relayPost(r, { v: 1, from: myNick(), iv: s.iv, ct: s.ct, t: Date.now() });
      if (ok) {
        r.msgs.push({ t: Date.now(), from: myNick(), mine: true, text });
        if (r.msgs.length > MSG_MAX) r.msgs.splice(0, r.msgs.length - MSG_MAX);
        roomSig = null;
        if (inp) inp.value = '';
      }
    } catch (e) { notice('전송 실패.'); }
  }
  function copyDraft() { // 평문방용: #채팅 상대 내용 한 줄 복사
    try {
      const inp = roomEl && roomEl.querySelector('[data-cr-inp]');
      const text = inp ? String(inp.value || '').trim() : '';
      if (!selPeer) { notice('먼저 대화 상대를 선택하세요.'); return; }
      if (!text) return;
      copyText('#채팅 ' + selPeer + ' ' + text, '복사됨. 채팅창에 붙여넣고 Enter를 누르세요.');
      if (inp) inp.value = '';
    } catch (e) {}
  }

  async function pollRooms() {
    for (const peer of Object.keys(rooms)) {
      const r = rooms[peer];
      if (!r.aesKey) continue;
      try {
        const msgs = await relayPoll(r);
        let changed = false;
        for (const j of msgs) {
          if (j.id && r.lastRelayId && j.id === r.lastRelayId) continue;
          let body = null;
          try {
            const o = typeof j.message === 'string' ? JSON.parse(j.message) : j.message;
            if (o && o.v === 1 && o.iv && o.ct) body = await open(r.aesKey, o.iv, o.ct);
          } catch (e) {}
          if (j.id) r.lastRelayId = j.id;
          if (body == null) continue;
          const from = String((typeof j.message === 'string' ? JSON.parse(j.message) : j.message).from || '').slice(0, 30) || peer;
          if (from === myNick()) continue; // 내 발신은 전송 시 이미 표시
          r.msgs.push({ t: Date.now(), from, mine: false, text: body });
          if (r.msgs.length > MSG_MAX) r.msgs.splice(0, r.msgs.length - MSG_MAX);
          changed = true;
          try { KW.toast('💬 ' + from, body); } catch (er) {}
        }
        if (changed) { r.last = Date.now(); roomSig = null; }
      } catch (e) {}
    }
  }

  function render(now) {
    const stack = document.getElementById('__kw_stack');
    const panel = document.getElementById('__kw_panel');
    if (sessionHidden || !stack || !panel || !panel.classList.contains('show')) { removeRoom(); return; }
    const me = myNick();
    if (!roomEl || !roomEl.isConnected) {
      roomEl = document.createElement('div');
      roomEl.id = '__kw_chatroom';
      roomEl.onclick = (e) => {
        if (e.target && e.target.closest && e.target.closest('#__kw_chatroom_x')) { sessionHidden = true; removeRoom(); return; }
        if (e.target && e.target.closest && e.target.closest('[data-cr-accept]')) { acceptInvite(); return; }
        if (e.target && e.target.closest && e.target.closest('[data-cr-key]')) { sendMyKey(selPeer); return; }
        if (e.target && e.target.closest && e.target.closest('[data-cr-send]')) { const r = rooms[selPeer]; if (r && r.aesKey) sendSecure(); else copyDraft(); return; }
        const rb = e.target && e.target.closest ? e.target.closest('[data-cr-room]') : null;
        if (rb) { selPeer = rb.getAttribute('data-cr-room'); roomSig = null; render(Date.now()); return; }
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
    const inv = myInvite();
    const sig = [me, selPeer, inv ? inv.from + inv.t : '', names.map((n) => n + ':' + (rooms[n].msgs.length ? rooms[n].msgs[rooms[n].msgs.length - 1].t : 0) + (rooms[n].aesKey ? '1' : '0')).join(',')].join('|');
    if (sig !== roomSig) {
      roomSig = sig;
      let h = '<div style="display:flex;align-items:center;min-height:26px;padding-right:28px;flex:none"><b style="font-size:12px;white-space:nowrap;display:inline-flex;align-items:center"><span style="display:inline-flex;align-items:center;color:' + COLOR + ';margin-right:5px"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + TI_CHAT + '</svg></span>1:1 대화&nbsp;<span style="color:' + COLOR + '">(' + names.length + ')</span></b></div>' +
        xBtn('__kw_chatroom_x', COLOR, 'position:absolute;top:2px;right:3px;z-index:2');
      if (inv) {
        h += '<div style="margin-top:6px;flex:none;display:flex;align-items:center;gap:6px;font-size:12px;color:#ffd400"><span><b>' + esc(inv.from) + '</b>님이 초대했습니다</span><button data-cr-accept style="border:1px solid ' + COLOR + ';background:rgba(63,213,152,.15);color:' + COLOR + ';border-radius:8px;padding:3px 10px;font-size:12px;cursor:pointer;flex:none">참가</button></div>';
      }
      if (!me) {
        h += '<div style="font-size:11px;color:#aaa;margin-top:6px;line-height:1.5">내 닉네임을 먼저 입력하세요.<br>설정 ⚙ → 단어설정 → 내 닉네임</div>';
      } else if (!names.length && !inv) {
        h += '<div style="font-size:11px;color:#aaa;margin-top:6px;line-height:1.5">아직 대화가 없습니다.<br>채팅에 <b>#채팅 상대이름</b> 으로 초대하면 여기 모입니다.</div>';
      } else {
        if (names.length) {
          h += '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;flex:none">' + names.map((n) => {
            const on = n === selPeer;
            const lock = rooms[n].aesKey ? '🔒' : '';
            return '<button data-cr-room="' + esc(n) + '" style="border:1px solid ' + (on ? COLOR : '#555') + ';background:' + (on ? 'rgba(63,213,152,.15)' : 'transparent') + ';color:' + (on ? COLOR : '#ccc') + ';border-radius:8px;padding:3px 8px;font-size:12px;cursor:pointer">' + lock + esc(n) + '</button>';
          }).join('') + '</div>';
        }
        const r = rooms[selPeer];
        if (r) {
          if (r.awaitingKey) {
            h += '<div style="margin-top:6px;flex:none;font-size:12px;color:#ffd400">상대가 수락했습니다. <button data-cr-key style="border:1px solid ' + COLOR + ';background:rgba(63,213,152,.15);color:' + COLOR + ';border-radius:8px;padding:3px 10px;font-size:12px;cursor:pointer">키 보내기</button></div>';
          }
          h += '<div class="__kw_sb_cr" style="flex:1;min-height:0;overflow-y:auto;margin-top:6px;display:flex;flex-direction:column;gap:3px">' + r.msgs.map((m, i) => {
            const who = m.mine ? '나' : m.from;
            return '<div data-cr-msg="' + i + '" data-cr-peer="' + esc(selPeer) + '" title="누르면 원본 채팅으로 이동" style="font-size:12px;line-height:1.45;cursor:pointer;text-align:' + (m.mine ? 'right' : 'left') + '"><span style="color:' + (m.mine ? COLOR : '#ff9a7a') + '">' + esc(who) + '</span> <span style="color:#eee">' + esc(m.text) + '</span></div>';
          }).join('') + '</div>';
          const ready = !!r.aesKey;
          h += '<div style="display:flex;gap:4px;margin-top:6px;flex:none"><input data-cr-inp placeholder="' + (ready ? esc(selPeer) + '에게 보낼 내용 (암호화 전송)' : '방 준비 중…') + '" style="flex:1;min-width:0;background:rgba(255,255,255,.07);border:1px solid #555;border-radius:8px;color:#fff;font-size:12px;padding:5px 8px;outline:none"><button data-cr-send title="' + (ready ? '암호화해서 전송' : '채팅용 한 줄로 복사 (붙여넣고 Enter)') + '" style="border:1px solid ' + COLOR + ';background:transparent;color:' + COLOR + ';border-radius:8px;padding:5px 10px;font-size:12px;cursor:pointer;flex:none">' + (ready ? '전송' : '복사') + '</button></div>';
        }
      }
      const sc = roomEl.querySelector('.__kw_sb_cr');
      const keepBottom = sc ? (sc.scrollHeight - sc.scrollTop - sc.clientHeight < 40) : true;
      roomEl.innerHTML = h;
      const sc2 = roomEl.querySelector('.__kw_sb_cr');
      if (sc2 && keepBottom) { try { sc2.scrollTop = sc2.scrollHeight; } catch (e) {} }
      const inp = roomEl.querySelector('[data-cr-inp]');
      if (inp) inp.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { const rr = rooms[selPeer]; if (rr && rr.aesKey) sendSecure(); else copyDraft(); }
        if (ev.stopPropagation) ev.stopPropagation();
      });
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

  let lastPoll = 0;
  function tick() {
    try {
      if (sessionHidden) { removeRoom(); return; }
      render(Date.now());
      const now = Date.now();
      if (now - lastPoll >= POLL_MS) {
        lastPoll = now;
        try { pollRooms(); } catch (e) {}
      }
    } catch (e) {}
  }
  setInterval(tick, 1000);
})();
