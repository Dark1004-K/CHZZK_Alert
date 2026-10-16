// 1:1 대화방 (코어) — 페어링은 공개 채팅 1줄 + 릴레이 내부 교환, 내용은 E2E 암호화 후 릴레이.
// 비밀(개인키·방키)은 어디에도 올리지 않는다. 공개키 자체는 공개돼도 무해.
//   1. A: "#채팅 X" (초대. 채팅에 직접 입력. 5분 유효)
//      - 공백 닉: #채팅 "홍 길동" / #채팅 [홍 길동] (따옴표 필수)
//      - 여러 명: #채팅 "홍 길동", 김철수 (쉼표 구분, 각각 1:1방. 그룹방 아님)
//      - 대화겸: #채팅 "홍 길동" 안녕 (초대+평문 1줄 동시 기록)
//   2. X: 패널 [참가] 클릭 → X공개키를 릴레이로 내부 전송 (채팅에 안 씀)
//   3. A가 폴링으로 X공개키를 받으면 A공개키를 릴레이로 자동 답신 → 양쪽이 ECDH(X25519)로 같은 방키 유도
//   4. 이후 릴레이에 AES-GCM 암호문만. X의 [참가] 한 번이면 양쪽 🔒.
// 초대 인증은 치지직 채팅(발신 닉이 서버 보장)이 담당. 릴레이 토픽은 닉으로 계산돼 누구나 알 수 있으니,
// 먼저 도착한 hello 1개만 키로 인정(first-wins)하고, 필요하면 콘솔 지문(shortKey 8자)으로 대조.
// 구형 "#채팅 X <A공개키>" / "#참가 <X공개키>" / "#키 <A공개키>" 채팅 방식도 폴백으로 계속 인식.
// 수락에 공개키가 없으면(수동 #참가) 평문 공개방으로 동작 (필터 뷰).
// 보내기(초대)는 사용자가 Enter로 직접. 수락·키교환·암호전송은 패널 클릭 → 내부 처리.
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
  const fmtT = (t) => { try { const d = new Date(Number(t) || Date.now()); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); } catch (e) { return ''; } };
  const xBtn = (id, color, style) => '<button id="' + id + '" title="닫기 (새로고침하면 다시 표시)" style="border:0;background:transparent;color:' + color + ';cursor:pointer;padding:5px;border-radius:8px;display:inline-flex;align-items:center;' + (style || '') + '"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
  const TI_CHAT = '<path d="M4 5h16v11H9l-5 4Z"/><path d="M8 9.5h8M8 12.5h5"/>';
  let sessionHidden = false;

  function myNick() {
    try {
      const v = (localStorage.getItem('__kw_mynick') || '').trim();
      if (v) return v; // 수동 입력 우선
      if (typeof detectedNick === 'function') return String(detectedNick() || '').trim();
      return '';
    } catch (e) { return ''; }
  }
  const rlog = (...a) => { try { if (typeof dlog === 'function') dlog('room', ...a); } catch (e) {} };
  const shortKey = (k) => String(k || '').slice(0, 8) + (String(k || '').length > 8 ? '…' : '');
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
  // 공백 닉네임 지원: 띄어쓰기가 있으면 따옴표/대괄호로 묶는다.
  //   1인: #채팅 "홍 길동" / #채팅 "홍 길동" 안녕 / #채팅 [홍 길동]
  //   다인(각각 1:1방): #채팅 "홍 길동", 김철수 / #채팅 홍길동, 김철수
  // 따옴표 없는 "홍 길동" (미등록)은 첫 토큰만 닉으로 보고 나머지는 내용으로 처리하므로,
  // 공백 닉은 첫 초대부터 꼭 따옴표를 쓴다. 이미 아는 이름(내 닉·방·초대기록)은 따옴표 없이도 최장일치로 복원.
  const isPubkey = (s) => /^[A-Za-z0-9+/]{40,60}={0,2}$/.test(String(s || ''));
  function unquotePeer(s) {
    const t = String(s || '').trim();
    if (t.length >= 2) {
      const a = t[0], b = t[t.length - 1];
      if ((a === '"' && b === '"') || (a === "'" && b === "'") || (a === '[' && b === ']')) return t.slice(1, -1).trim();
    }
    return t;
  }
  function quotePeer(s) {
    const t = String(s || '').trim();
    if (!t) return t;
    if (/[\s,;"'\[\]]/.test(t)) {
      if (!t.includes('"')) return '"' + t + '"';
      if (!t.includes("'")) return "'" + t + "'";
      return '"' + t.replace(/"/g, '') + '"';
    }
    return t;
  }
  // 따옴표/대괄호 안의 쉼표는 나누지 않는다.
  function splitPeerList(s) {
    const out = [];
    let cur = '', q = '', depth = 0;
    const str = String(s || '');
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (q) {
        cur += c;
        if (c === q) q = '';
      } else if (c === '"' || c === "'") {
        q = c;
        cur += c;
      } else if (c === '[') {
        depth++;
        cur += c;
      } else if (c === ']') {
        depth = Math.max(0, depth - 1);
        cur += c;
      } else if ((c === ',' || c === ';') && depth === 0) {
        out.push(cur);
        cur = '';
      } else {
        cur += c;
      }
    }
    out.push(cur);
    return out.map((x) => unquotePeer(x)).map((x) => String(x || '').trim()).filter(Boolean);
  }
  function extractQuotedHead(rest) { // rest 선두의 "A B" / 'A B' / [A B] 1개를 떼어낸다
    const s = String(rest || '');
    if (!s) return null;
    const a = s[0];
    if (a !== '"' && a !== "'" && a !== '[') return null;
    const close = a === '[' ? ']' : a;
    const j = s.indexOf(close, 1);
    if (j < 0) return null;
    return { peer: s.slice(1, j).trim(), after: s.slice(j + 1).trim() };
  }
  function knownCandidates() {
    const set = [];
    const push = (v) => { v = String(v || '').trim(); if (v && !set.includes(v)) set.push(v); };
    try { push(myNick()); } catch (e) {}
    try { Object.keys(rooms || {}).forEach(push); } catch (e) {}
    try { (invites || []).forEach((x) => { push(x.from); push(x.peer); }); } catch (e) {}
    return set.sort((a, b) => b.length - a.length); // 최장일치 우선
  }
  function parseChatLine(text, candidates) { // "#채팅 ..." → { peers, peer, key, content } | { err } | null
    const m = /^\s*#\s*채팅([\s\S]*)$/.exec(String(text || ''));
    if (!m) return null;
    if (!m[1] || !/^\s/.test(m[1])) return { err: "'#채팅' 다음에 띄어쓰기를 하고 상대 이름을 적어 주세요. 예) #채팅 미리내 / #채팅 \"홍 길동\"" };
    let rest = m[1].trim();
    if (!rest) return { err: "상대 이름을 적어 주세요. 예) #채팅 미리내 / #채팅 \"홍 길동\"" };
    // 끝 토큰이 공개키면 분리 (구방식 "#채팅 X <공개키>" 호환, X에 공백이 있어도 됨)
    let key = '';
    const lastSp = rest.search(/\s+(\S+)\s*$/);
    if (lastSp >= 0) {
      const lastTok = rest.slice(lastSp).trim();
      if (isPubkey(lastTok)) {
        key = lastTok;
        rest = rest.slice(0, lastSp).trim();
        if (!rest) return { err: "상대 이름을 적어 주세요. 예) #채팅 미리내 / #채팅 \"홍 길동\"" };
      }
    } else if (isPubkey(rest)) {
      return { err: "상대 이름을 적어 주세요. 예) #채팅 미리내 / #채팅 \"홍 길동\"" };
    }
    // 1) 선두가 따옴표/대괄호 → ("A B", "C D" 내용) 형태. 쉼표로 여러 명 가능.
    if (rest[0] === '"' || rest[0] === "'" || rest[0] === '[') {
      const peers = [];
      let cur = rest;
      for (;;) {
        const h = extractQuotedHead(cur);
        if (!h || !h.peer) return { err: '따옴표가 닫히지 않았습니다. 예) #채팅 "홍 길동"' };
        peers.push(h.peer);
        cur = h.after;
        if (!cur) break;
        if (cur[0] === ',' || cur[0] === ';') {
          cur = cur.slice(1).trim();
          if (!cur) break;
          const nh = extractQuotedHead(cur);
          if (nh && nh.peer) continue; // 다음도 따옴표
          // "A B", 김철수 — 쉼표 뒤 맨 앞 토큰 1개가 다음 상대
          const mm = /^([^\s,;]+)\s*(.*)$/.exec(cur);
          if (mm && mm[1]) {
            peers.push(unquotePeer(mm[1]));
            cur = (mm[2] || '').trim();
            if (cur && (cur[0] === ',' || cur[0] === ';')) { cur = cur.slice(1).trim(); continue; }
            break;
          }
          break;
        }
        break; // 쉼표가 없으면 나머지는 내용
      }
      return { peers, peer: peers[0] || '', key, content: cur || '' };
    }
    // 2) 쉼표/세미콜론이 있으면 다인 초대 (각각 1:1방). 내용은 없음.
    if (/[,;]/.test(rest)) {
      const peers = splitPeerList(rest);
      if (!peers.length) return { err: "상대 이름을 적어 주세요. 예) #채팅 \"홍 길동\", 김철수" };
      return { peers, peer: peers[0] || '', key, content: '' };
    }
    // 3) 따옴표 없는 단일 표기. 아는 이름은 공백 포함 최장일치로 복원.
    const cands = candidates || knownCandidates();
    for (const c of cands) {
      if (!c) continue;
      if (rest === c) return { peers: [c], peer: c, key, content: '' };
      if (rest.startsWith(c + ' ') || rest.startsWith(c + '\t')) {
        return { peers: [c], peer: c, key, content: rest.slice(c.length).trim() };
      }
    }
    // 4) 구방식 폴백: 첫 토큰이 닉, 나머지는 내용
    const toks = rest.split(/\s+/).filter(Boolean);
    const peer = toks[0] || '';
    if (!peer) return { err: "상대 이름을 적어 주세요. 예) #채팅 미리내 / #채팅 \"홍 길동\"" };
    const afterFirst = rest.slice(rest.indexOf(toks[0]) + toks[0].length).trim();
    return { peers: [peer], peer, key, content: afterFirst || '' };
  }
  function parseInvite(text) { // "#채팅 X [A공개키]" (X에 공백 가능, 여러 명은 쉼표)
    const r = parseChatLine(text);
    if (!r || r.err) return r;
    return { peers: r.peers, peer: r.peer, key: r.key, content: r.content };
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
    try {
      for (const k of dismissed) {
        const t = Number(String(k).slice(String(k).lastIndexOf('|') + 1));
        if (!isFinite(t) || now - t >= INVITE_MS) dismissed.delete(k);
      }
    } catch (e) {}
  }
  async function trySecure(room) {
    // 양쪽 공개키가 모이면 방키 유도 (어느 쪽에서든 호출 가능, 같은 값)
    if (room.aesKey || !room.peerPub || !idkPubB64) return;
    try {
      room.aesKey = await roomKeyFor(room.peerPub, room.tag);
      room.secure = true;
      roomSig = null;
      rlog('secure-ok', room.peer, 'peerPub=' + shortKey(room.peerPub), 'tag=' + room.tag);
    } catch (e) { rlog('secure-fail', room.peer, String((e && e.message) || e)); }
  }

  async function onChat(d) {
    try {
      if (!d) return;
      const me = myNick();
      const nick = String(d.nick || '익명');
      const now = Date.now();
      pruneInvites(now);
      // 1) 초대 (+ 같은 줄에 내용이 있으면 평문 메시지로도 기록)
      const inv = parseInvite(d.text);
      if (inv && !inv.err) {
        const peerList = (inv.peers && inv.peers.length ? inv.peers : [inv.peer]).filter(Boolean);
        for (const onePeer of peerList) {
          invites.push({ from: nick, peer: onePeer, pub: inv.key || '', t: now });
        }
        rlog('invite', nick + '->' + peerList.join(','), 'key=' + (inv.key ? shortKey(inv.key) : '(일반)'), 'me=' + (me || '(미설정)') + (inv.content ? ' msg=' + String(inv.content).slice(0, 20) : ''));
        if (me && nick === me && peerList.includes(me)) {
          // 셀프 호출 = 자가진단. 가상 상대를 상대로 초대·암호·릴레이 왕복 전체를 시험 (베타만).
          rlog('selftest-trigger', '내가 나를 부름');
          try {
            if (KW && KW.beta && typeof runSelfTest === 'function') {
              try { KW.toast('💬 1:1 대화', '셀프 호출 감지. 자가진단을 시작합니다.'); } catch (er) {}
              runSelfTest();
            }
          } catch (e) {}
          roomSig = null;
          return;
        }
        if (me && nick === me) {
          // 내가 직접 친 초대: 수락 전이라도 내 방 바로 열기 (준비 중 상태, 여러 개 가능)
          for (const onePeer of peerList) {
            if (onePeer === me) continue;
            touchRoom(onePeer, !!inv.key);
            if (!selPeer) selPeer = onePeer;
            if (inv.content) {
              const rr = touchRoom(onePeer, false);
              rr.msgs.push({ t: now, from: me, mine: true, text: inv.content });
              if (rr.msgs.length > MSG_MAX) rr.msgs.splice(0, rr.msgs.length - MSG_MAX);
            }
            rlog('invite-mine', 'room=' + onePeer);
          }
        } else if (me && peerList.includes(me) && nick !== me) {
          try { KW.toast('💬 1:1 대화 초대', nick + '님이 초대했습니다. 알림 카드에서 [참가]를 누르세요.'); } catch (er) {}
          // 수신측은 방을 미리 만들지 않음. 알림 카드의 [참가]를 눌러야 방이 열림.
          if (inv.key) {
            // 구방식 호환: 초대에 공개키가 실려 오면 바로 방키 유도
            const r = touchRoom(nick, true);
            if (!r.peerPub) r.peerPub = inv.key;
            try { await myKeypair(); } catch (e) {}
            await trySecure(r);
          }
          if (inv.content) pushMsg(nick, nick, false, inv.content);
        } else if (me && inv.content && peerList.includes(me)) {
          pushMsg(nick, nick, false, inv.content);
        }
        roomSig = null;
        return;
      }
      if (inv && inv.err && me && nick === me) { notice(inv.err); return; }
      // 2) 수락
      const acc = parseAccept(d.text);
      if (acc && !acc.err) {
        if (!me) return;
        rlog('accept', 'from=' + nick, 'key=' + (acc.key ? shortKey(acc.key) : '(없음)'), 'me=' + me);
        if (nick === me && acc.key) {
          // 자기 수락 에코 (X 입장): 방은 초대 수신 때 이미 만들어짐. 혹시 없으면 초대자로 보정.
          const myInv = myInvite();
          if (myInv) touchRoom(myInv.from, true);
          roomSig = null;
          return;
        }
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
            rlog('accept-x', 'room=' + nick, 'key=' + (acc.key ? shortKey(acc.key) : '(없음)'));
            if (acc.key) {
              if (!r.peerPub) r.peerPub = acc.key;
              try { await myKeypair(); } catch (e) {}
              await trySecure(r);
            }
          }
          return;
        }
        // A 입장: 초대 상대가 수락
        const r = touchRoom(nick, !!acc.key);
        rlog('accept-a', 'room=' + nick, 'key=' + (acc.key ? shortKey(acc.key) : '(없음)'));
        if (acc.key) {
          r.peerPub = acc.key;
          try { await myKeypair(); } catch (e) {}
          await trySecure(r);
          r.awaitingKey = !r.aesKey; // 옛날방식 초대에만 해당. 신방식은 바로 유도되므로 false.
          if (!r.aesKey) {
            try { KW.toast('💬 1:1 대화', nick + '님이 수락했습니다. 패널에서 [키 보내기]를 누르세요.'); } catch (er) {}
          } else {
            try { KW.toast('💬 1:1 대화', nick + '님과 암호방이 열렸습니다.'); } catch (er) {}
          }
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
        rlog('pubkey', 'from=' + nick, 'key=' + shortKey(kp.key), 'hasRoom=' + (!!rooms[nick]));
        // 옛날방식 폴백 (#키): 방이 없어도 상대로 생성 후 확정
        const r = touchRoom(nick, true);
        if (!r.peerPub) r.peerPub = kp.key;
        try { await myKeypair(); } catch (e) {}
        await trySecure(r);
        r.awaitingKey = false;
        roomSig = null;
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
  function parseRoomMsg(text) { // "#채팅 X 내용" (X는 공백 가능, 따옴표 권장. 내용이 있을 때만 대화)
    const r = parseChatLine(text);
    if (!r || r.err || !r.peer) return null;
    if (!r.content || (r.key && r.content === '')) return null;
    if (r.key && r.content === r.key) return null;
    return { peers: r.peers, peer: r.peer, content: r.content };
  }
  try { KW.on('chat', onChat); } catch (e) {}

  // 진단 결과 표시용 변수 (베타에서만 값이 들어감. 정식에서도 무해)
  let selfTestResult = '', selfTestBusy = false;
  // [BETA-TEST-ONLY:start]
  // 자가진단 (패널 [자가진단] 버튼용, 콘솔 불필요). 순서: 암호 자가검증 → 페어링·E2E·릴레이 왕복.
  // 상대 키쌍을 테스트 안에서 생성해 상대 브라우저 역할을 대신한다.
  async function roomCryptoTest() {
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
  }
  async function roomSoloTest(peer) {
    // 신방식 솔로 시뮬레이션: 초대 기록 → 상대 hello 릴레이 전송 → 내 폴링(유도·자동답신) → 키 대조 → 암호문 왕복.
    const log = [];
    try {
      const me = myNick();
      if (!me) return '실패: 내 닉네임 먼저 입력 (설정 > 단어설정 → 내 닉네임)';
      peer = String(peer || ('솔로상대' + Math.floor(Math.random() * 10000)));
      try { await myKeypair(); } catch (e) {}
      // 0) 상대 키쌍 (상대 브라우저 역할)
      const kp = await crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
      const peerPubB64 = b64e(await crypto.subtle.exportKey('raw', kp.publicKey));
      log.push('0 상대 키쌍 생성: OK');
      // 1) 내가 초대 (클립보드 없이 내부 기록만)
      pruneInvites(Date.now());
      invites.push({ from: me, peer, pub: '', t: Date.now() });
      const r = touchRoom(peer, false);
      if (!selPeer) selPeer = peer;
      r.helloSent = false; r.openNotified = false; r.aesKey = null; r.peerPub = ''; r.lastRelayId = '';
      log.push('1 초대 기록: OK');
      // 2) 상대가 [참가] → hello를 릴레이로 내부 전송
      const url = await topicUrl(r.tag);
      const hpr = await fetch(url, { method: 'POST', body: JSON.stringify({ v: 1, type: 'hello', from: peer, pub: peerPubB64, t: Date.now() }) });
      log.push('2 상대 수락(hello 발송): ' + (hpr.ok ? 'OK' : 'FAIL(' + hpr.status + ')'));
      if (!hpr.ok) return log.join('\n');
      // 3) 내 폴링이 hello를 받아 방키 유도 + 자동 답신
      await pollRooms();
      const okSecure = !!(r.aesKey && r.helloSent);
      log.push('3 방키 유도·자동 답신: ' + (okSecure ? 'OK' : 'FAIL'));
      if (!okSecure) return log.join('\n');
      // 4) 상대 입장에서 같은 방키인지 대조 후 암호문 발송
      const myPub = await crypto.subtle.importKey('raw', b64d(idkPubB64), { name: 'X25519' }, false, []);
      const peerShared = await crypto.subtle.deriveBits({ name: 'X25519', public: myPub }, kp.privateKey, 256);
      const seed = new Uint8Array([...new Uint8Array(peerShared), ...te('kwr1|' + r.tag)]);
      const peerKey = await crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', seed), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const plain = '솔로테스트 ' + Date.now();
      const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, peerKey, te(plain));
      const pr = await fetch(url, { method: 'POST', body: JSON.stringify({ v: 1, from: peer, iv: b64e(iv), ct: b64e(ct), t: Date.now() }) });
      log.push('4 릴레이 발송: ' + (pr.ok ? 'OK' : 'FAIL(' + pr.status + ')'));
      if (!pr.ok) return log.join('\n');
      // 5) 내 폴링이 받아서 복호화
      const before = r.msgs.length;
      await pollRooms();
      const got = r.msgs.slice(before).some((m) => !m.mine && m.text === plain);
      log.push('5 릴레이 수신·복호화: ' + (got ? 'OK' : 'FAIL'));
      log.push(got ? '전체 통과' : '수신 실패 (잠시 후 자가진단 재실행)');
      try { delete rooms[peer]; if (selPeer === peer) selPeer = ''; roomSig = null; } catch (e) {}
      return log.join('\n');
    } catch (e) { return log.join('\n') + '\n예외: ' + e; }
  }
  async function runSelfTest() {
    if (selfTestBusy) return;
    selfTestBusy = true;
    selfTestResult = '진단 중…';
    roomSig = null;
    try {
      const c = await roomCryptoTest();
      const s = await roomSoloTest();
      selfTestResult = c + '\n' + s;
    } catch (e) { selfTestResult = '진단 실패: ' + e; }
    selfTestBusy = false;
    roomSig = null;
  }

  // #채팅 테스터 (고정값, 베타 전용). 상대=테스트상대 고정, 내 닉네임은 설정값.
  // B 역할을 이 브라우저가 대행: B 키쌍 생성 → hello/암호문 릴레이 전송 → 내 폴링이 수신.
  // 단계 버튼 그대로 실제 방·릴레이·암호 경로를 타서, 결과는 아래 1:1 대화 패널에 실제 말풍선으로 남는다.
  const CT_PEER = '테스트상대';
  const CT_MSG_B2A = '안녕하세요! 여기는 테스트상대입니다';
  const CT_MSG_A2B = '반갑습니다! 연결됐어요';
  let ctLog = [], ctBusy = false, ctBkp = null, testEl = null, testSig = null;
  function ctPush(who, msg) {
    ctLog.push('[' + who + '] ' + msg);
    if (ctLog.length > 60) ctLog.splice(0, ctLog.length - 60);
    testSig = null;
  }
  async function ctInvite() {
    if (ctBusy) return;
    ctBusy = true; testSig = null;
    try {
      const me = myNick();
      if (!me) { ctPush('안내', '실패: 내 닉네임 먼저 입력 (설정 > 단어설정 → 내 닉네임)'); return; }
      try { await myKeypair(); } catch (e) {}
      pruneInvites(Date.now());
      invites.push({ from: me, peer: CT_PEER, pub: '', t: Date.now() });
      const r = touchRoom(CT_PEER, false);
      if (selPeer !== CT_PEER) selPeer = CT_PEER;
      r.helloSent = false; r.openNotified = false; r.aesKey = null; r.peerPub = ''; r.lastRelayId = '';
      ctPush('A(' + me + ')', '#채팅 ' + CT_PEER + ' 발송 → 초대 기록 (방 준비 중)');
      ctPush('B(' + CT_PEER + ')', '공개 채팅에서 초대 확인 → [2. 참가 응답]을 눌러 [참가] 대행');
      roomSig = null;
    } finally { ctBusy = false; testSig = null; }
  }
  async function ctAccept() {
    if (ctBusy) return;
    ctBusy = true; testSig = null;
    try {
      const me = myNick();
      if (!me) { ctPush('안내', '실패: 내 닉네임 먼저 입력'); return; }
      const r = rooms[CT_PEER];
      if (!r) { ctPush('안내', '방이 없음 → [1. 초대]부터 실행'); return; }
      try { await myKeypair(); } catch (e) {}
      if (!ctBkp) {
        ctBkp = await crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
        ctPush('B(' + CT_PEER + ')', 'B 키쌍 생성 OK (B 브라우저 역할 대행)');
      }
      const pubB64 = b64e(await crypto.subtle.exportKey('raw', ctBkp.publicKey));
      const url = await topicUrl(r.tag);
      let hpr = null;
      try { hpr = await fetch(url, { method: 'POST', body: JSON.stringify({ v: 1, type: 'hello', from: CT_PEER, pub: pubB64, t: Date.now() }) }); } catch (e) { hpr = null; }
      ctPush('B(' + CT_PEER + ')', '[참가] 클릭 대행 → hello 전송: ' + (hpr && hpr.ok ? 'OK' : 'FAIL'));
      if (!hpr || !hpr.ok) return;
      await pollRooms();
      const ok = !!(r.aesKey && r.helloSent);
      ctPush('A(' + me + ')', 'hello 수신 → 방키 유도·자동 답신: ' + (ok ? 'OK (🔒 암호방 열림)' : 'FAIL (잠시 후 [2] 재실행)'));
      roomSig = null;
    } catch (e) { ctPush('안내', '예외: ' + e); }
    finally { ctBusy = false; testSig = null; }
  }
  async function ctChat() {
    if (ctBusy) return;
    ctBusy = true; testSig = null;
    try {
      const me = myNick();
      const r = rooms[CT_PEER];
      if (!r) { ctPush('안내', '방이 없음 → [1. 초대]부터 실행'); return; }
      if (!r.aesKey) { ctPush('안내', '암호방 미완성 → [2. 참가 응답]부터 실행'); return; }
      if (!ctBkp) { ctPush('안내', 'B 키 없음 → [2. 참가 응답]부터 실행'); return; }
      const myPub = await crypto.subtle.importKey('raw', b64d(idkPubB64), { name: 'X25519' }, false, []);
      const shared = await crypto.subtle.deriveBits({ name: 'X25519', public: myPub }, ctBkp.privateKey, 256);
      const seed = new Uint8Array([...new Uint8Array(shared), ...te('kwr1|' + r.tag)]);
      const bKey = await crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', seed), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, bKey, te(CT_MSG_B2A));
      const url = await topicUrl(r.tag);
      let pr = null;
      try { pr = await fetch(url, { method: 'POST', body: JSON.stringify({ v: 1, from: CT_PEER, iv: b64e(iv), ct: b64e(ct), t: Date.now() }) }); } catch (e) { pr = null; }
      ctPush('B(' + CT_PEER + '→A)', '암호문 발송: ' + (pr && pr.ok ? 'OK' : 'FAIL') + ' — "' + CT_MSG_B2A + '"');
      if (pr && pr.ok) {
        const before = r.msgs.length;
        await pollRooms();
        const got = r.msgs.slice(before).some((m) => !m.mine && m.text === CT_MSG_B2A);
        ctPush('A(' + me + ')', '수신·복호화: ' + (got ? 'OK (회색 말풍선 확인)' : 'FAIL (5초 후 폴링 대기)'));
      }
      const s = await seal(r.aesKey, CT_MSG_A2B);
      let ar = null;
      try {
        const u2 = await topicUrl(r.tag);
        ar = await fetch(u2, { method: 'POST', body: JSON.stringify({ v: 1, from: me, iv: s.iv, ct: s.ct, t: Date.now() }) });
      } catch (e) { ar = null; }
      if (ar && ar.ok) {
        r.msgs.push({ t: Date.now(), from: me, mine: true, text: CT_MSG_A2B });
        if (r.msgs.length > MSG_MAX) r.msgs.splice(0, r.msgs.length - MSG_MAX);
        ctPush('A(' + me + '→B)', '전송 OK (노랑 말풍선 확인) — "' + CT_MSG_A2B + '"');
      } else ctPush('A(' + me + '→B)', '전송 FAIL');
      roomSig = null;
    } catch (e) { ctPush('안내', '예외: ' + e); }
    finally { ctBusy = false; testSig = null; }
  }
  async function ctAll() {
    if (ctBusy) return;
    await ctInvite();
    await ctAccept();
    const r = rooms[CT_PEER];
    if (r && r.aesKey) await ctChat();
  }
  function ctReset() {
    try { delete rooms[CT_PEER]; } catch (e) {}
    if (selPeer === CT_PEER) selPeer = '';
    ctBkp = null; ctLog = [];
    ctPush('안내', '초기화됨. [1. 초대]부터 다시 실행하세요.');
    roomSig = null; testSig = null;
  }
  function renderChatTester(stack, me) {
    const sig = [me, ctBusy ? '1' : '0', ctLog.length, ctLog.length ? ctLog[ctLog.length - 1] : ''].join('|');
    if (sig === testSig && testEl && testEl.isConnected) return;
    testSig = sig;
    if (!testEl || !testEl.isConnected) {
      if (testEl) { try { testEl.remove(); } catch (e) {} }
      testEl = document.createElement('div');
      testEl.id = '__kw_chattest';
      testEl.onclick = (e) => {
        const b = e.target && e.target.closest ? e.target.closest('[data-ct]') : null;
        if (!b) return;
        const k = b.getAttribute('data-ct');
        if (k === 'invite') ctInvite();
        else if (k === 'accept') ctAccept();
        else if (k === 'chat') ctChat();
        else if (k === 'all') ctAll();
        else if (k === 'reset') ctReset();
      };
      try {
        const hist = document.getElementById('__kw_histp');
        if (hist && hist.parentNode === stack) stack.insertBefore(testEl, hist);
        else stack.appendChild(testEl);
      } catch (er) { try { stack.appendChild(testEl); } catch (er2) { return; } }
    }
    const btn = (k, label, hl) => '<button data-ct="' + k + '"' + (ctBusy ? ' disabled' : '') + ' style="border:1px solid ' + (hl ? COLOR : '#555') + ';background:' + (hl ? 'rgba(63,213,152,.15)' : 'transparent') + ';color:' + (hl ? COLOR : '#ccc') + ';border-radius:8px;padding:3px 8px;font-size:11px;cursor:pointer;flex:none">' + label + '</button>';
    testEl.style.cssText = 'position:relative;width:100%;box-sizing:border-box;background:rgb(20,20,24);color:#fff;font:12px sans-serif;padding:8px 10px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.5);border:1px dashed ' + COLOR + ';display:flex;flex-direction:column;gap:6px';
    testEl.innerHTML = '<div style="display:flex;align-items:center;gap:6px;font-size:12px"><b>#채팅 테스터</b><span style="color:#888">고정값·베타 전용</span></div>' +
      '<div style="font-size:11px;color:#aaa">A(나): <b style="color:#fff">' + esc(me || '(미설정)') + '</b> · B(상대): <b style="color:#fff">' + CT_PEER + '</b></div>' +
      '<div style="display:flex;gap:4px;flex-wrap:wrap">' + btn('invite', '1. 초대', true) + btn('accept', '2. 참가 응답', true) + btn('chat', '3. 대화 왕복', true) + btn('all', '전체 실행', false) + btn('reset', '초기화', false) + '</div>' +
      (ctLog.length ? '<div style="font-size:11px;line-height:1.6;color:#ccc;background:rgba(255,255,255,.05);border-radius:8px;padding:6px 8px;max-height:140px;overflow-y:auto;white-space:pre-wrap">' + esc(ctLog.join('\n')) + '</div>'
        : '<div style="font-size:11px;color:#666">버튼을 순서대로 눌러 진행. 결과 방은 아래 1:1 대화 패널에 실제 말풍선으로 표시됨.</div>');
  }
  if (KW.beta) {
    window.__kwChatTest = () => { ctAll(); return '테스터 실행 중 (패널 로그 확인)'; };
    window.__kwChatTestReset = () => { ctReset(); return '초기화됨'; };
  }
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
  let invCard = null, invSig = null;
  const dismissed = new Set(); // 이번 세션에 닫은 초대 (from|t). 만료되면 함께 비움.
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
      if (x.peer === me && x.from !== me && !dismissed.has(x.from + '|' + x.t)) return x;
    }
    return null;
  }
  function removeInviteCard() {
    if (invCard) { try { invCard.remove(); } catch (e) {} }
    invCard = null;
    invSig = null;
  }
  // 유효 초대를 끈적이는 알림 카드로 (토스트처럼 사라지지 않음). [참가]를 눌러야 방이 열림.
  function renderInviteCard(stack, me, inv) {
    const show = !!(inv && me && !(rooms[inv.from] && (rooms[inv.from].aesKey || rooms[inv.from].helloSent)));
    const sig = show ? inv.from + '|' + inv.t : '';
    if (sig === invSig) return;
    invSig = sig;
    removeInviteCard();
    if (!show) return;
    invCard = document.createElement('div');
    invCard.id = '__kw_invite';
    invCard.onclick = (e) => {
      if (e.target && e.target.closest && e.target.closest('[data-qi-accept]')) { acceptInvite(); return; }
      if (e.target && e.target.closest && e.target.closest('[data-qi-dismiss]')) {
        try { dismissed.add(inv.from + '|' + inv.t); } catch (er) {}
        rlog('invite-dismiss', inv.from);
        removeInviteCard();
        return;
      }
    };
    invCard.style.cssText = 'position:relative;width:100%;box-sizing:border-box;background:rgb(26,23,14);color:#fff;font:13px sans-serif;padding:8px 10px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.5);border:1px dashed #ffd400';
    invCard.innerHTML = '<div style="display:flex;align-items:center;gap:6px;font-size:12px"><span>💬 <b>' + esc(inv.from) + '</b>님의 1:1 대화 초대</span><span style="flex:1"></span><button data-qi-accept style="border:1px solid #ffd400;background:rgba(255,212,0,.15);color:#ffd400;border-radius:8px;padding:3px 10px;font-size:12px;cursor:pointer;flex:none">참가</button><button data-qi-dismiss title="이번 초대는 그만 보기 (5분 뒤 만료)" style="border:1px solid #555;background:transparent;color:#aaa;border-radius:8px;padding:3px 10px;font-size:12px;cursor:pointer;flex:none">닫기</button></div>' +
      '<div style="font-size:11px;color:#aaa;margin-top:3px">[참가]를 누르면 암호방이 열립니다</div>';
    try { stack.insertBefore(invCard, stack.firstChild); } catch (er) { try { stack.appendChild(invCard); } catch (er2) { return; } }
  }
  async function acceptInvite() {
    try {
      const inv = myInvite();
      if (!inv) { notice('수락할 초대가 없습니다.'); rlog('accept-click', '초대없음'); return; }
      const me = await myKeypair();
      const r = touchRoom(inv.from, false);
      if (!selPeer) selPeer = inv.from;
      rlog('accept-click', 'invite-from=' + inv.from, 'myPub=' + shortKey(me.pubB64));
      if (!r.helloSent) {
        const ok = await relayPost(r, { v: 1, type: 'hello', from: myNick(), pub: me.pubB64, t: Date.now() });
        rlog('hello-post', 'to=' + inv.from, ok ? 'ok' : 'fail');
        if (ok) {
          r.helloSent = true;
          try { KW.toast('💬 1:1 대화', inv.from + '님에게 수락을 보냈습니다. 연결 중…'); } catch (er) {}
        } else notice('전송 실패. 잠시 후 다시 [참가]를 눌러 주세요.');
      }
      roomSig = null;
    } catch (e) { notice('키 생성 실패. 브라우저를 확인하세요.'); }
  }
  async function sendMyKey(peer) { // 옛날방식 폴백용. 신방식(초대에 키 포함)에서는 표시되지 않음.
    try {
      const me = await myKeypair();
      rlog('key-click', 'to=' + peer, 'myPub=' + shortKey(me.pubB64));
      copyText('#키 ' + me.pubB64, '복사됨. 채팅창에 붙여넣고 Enter를 누르세요.');
      const r = rooms[peer];
      if (r) { r.awaitingKey = false; roomSig = null; }
    } catch (e) { notice('키 생성 실패. 브라우저를 확인하세요.'); }
  }
  async function invitePeer() {
    try {
      const inp = roomEl && roomEl.querySelector('[data-cr-invite-peer]');
      const raw = String((inp && inp.value) || '').trim();
      if (!raw) { notice('상대 이름을 입력하세요.'); return; }
      // 여러 명이면 쉼표로 구분. 공백 닉은 따옴표 그대로 두면 자동 인식.
      const peers = /[,;]/.test(raw) ? splitPeerList(raw) : [unquotePeer(raw)].filter(Boolean);
      if (!peers.length) { notice('상대 이름을 입력하세요.'); return; }
      if (peers.includes(myNick())) { notice('자기 자신은 초대할 수 없습니다.'); return; }
      pruneInvites(Date.now());
      for (const peer of peers) {
        invites.push({ from: myNick(), peer, pub: '', t: Date.now() });
        touchRoom(peer, false);
        if (!selPeer) selPeer = peer;
      }
      rlog('invite-click', 'to=' + peers.join(','));
      copyText('#채팅 ' + peers.map(quotePeer).join(', '), '복사됨. 채팅창에 붙여넣고 Enter를 누르세요. 상대가 [참가]를 누르면 자동으로 연결됩니다.');
      roomSig = null;
    } catch (e) { notice('초대에 실패했습니다.'); }
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
      rlog('send', 'to=' + selPeer, ok ? 'ok' : 'fail', 'len=' + text.length);
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
      copyText('#채팅 ' + quotePeer(selPeer) + ' ' + text, '복사됨. 채팅창에 붙여넣고 Enter를 누르세요.');
      if (inp) inp.value = '';
    } catch (e) {}
  }

  async function pollRooms() {
    for (const peer of Object.keys(rooms)) {
      const r = rooms[peer];
      try {
        const msgs = await relayPoll(r);
        let changed = false;
        for (const j of msgs) {
          if (j.id && r.lastRelayId && j.id === r.lastRelayId) continue;
          let o = null;
          try { o = typeof j.message === 'string' ? JSON.parse(j.message) : j.message; } catch (e) {}
          if (j.id) r.lastRelayId = j.id;
          if (!o || o.v !== 1) continue;
          const from = String(o.from || '').slice(0, 30);
          if (from === myNick()) continue; // 내 발신 에코는 무시
          if (o.type === 'hello' && o.pub) {
            // 릴레이 경유 키교환 (채팅에 #참가/#키를 안 씀). 먼저 온 키 1개만 인정.
            if (!r.peerPub) {
              r.peerPub = o.pub;
              rlog('hello-recv', 'room=' + peer, 'from=' + from, 'key=' + shortKey(o.pub));
              try { await myKeypair(); } catch (e) {}
              await trySecure(r);
              changed = true;
            } else if (r.peerPub !== o.pub) {
              rlog('hello-dup', 'room=' + peer, '무시(먼저 온 키 유지)');
            }
            if (r.aesKey && !r.helloSent) {
              try {
                const me2 = await myKeypair();
                const ok = await relayPost(r, { v: 1, type: 'hello', from: myNick(), pub: me2.pubB64, t: Date.now() });
                rlog('hello-reply', 'room=' + peer, ok ? 'ok' : 'fail');
                if (ok) r.helloSent = true;
              } catch (e) {}
            }
            if (r.aesKey && !r.openNotified) {
              r.openNotified = true;
              rlog('open', 'room=' + peer, '🔒 암호방 열림');
              try { KW.toast('💬 1:1 대화', peer + '님과 암호방이 열렸습니다.'); } catch (er) {}
            }
            continue;
          }
          if (!r.aesKey || !o.iv || !o.ct) continue;
          let body = null;
          try { body = await open(r.aesKey, o.iv, o.ct); } catch (e) {}
          if (body == null) continue;
          if (from === myNick()) continue; // 내 발신은 전송 시 이미 표시
          rlog('recv', 'room=' + peer, 'from=' + from, 'len=' + String(body || '').length);
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
    if (sessionHidden || !stack || !panel || !panel.classList.contains('show')) {
      removeRoom(); removeInviteCard();
      // [BETA-TEST-ONLY:start]
      try { if (testEl) testEl.remove(); } catch (e) {}
      testEl = null; testSig = null;
      // [BETA-TEST-ONLY:end]
      return;
    }
    const me = myNick();
    for (const k of Object.keys(rooms)) { if (k.indexOf('솔로상대') === 0) { try { delete rooms[k]; } catch (e) {} } }
    const names = Object.keys(rooms).sort((a, b) => (rooms[b].last || 0) - (rooms[a].last || 0));
    if (selPeer && !rooms[selPeer]) selPeer = names[0] || '';
    const inv = myInvite();
    renderInviteCard(stack, me, inv);
    // [BETA-TEST-ONLY:start]
    try { renderChatTester(stack, me); } catch (e) {}
    // [BETA-TEST-ONLY:end]
    const panelActive = names.length > 0;
    if (!panelActive) { removeRoom(); return; }
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
    const css = panelActive
      ? 'position:relative;width:100%;height:' + Math.min(roomH, roomHMax()) + 'px;box-sizing:border-box;background:rgb(20,20,24);color:#fff;font:13px sans-serif;padding:8px 10px 18px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.5);border:1px solid ' + COLOR + ';display:flex;flex-direction:column;overflow:visible'
      : 'position:relative;width:100%;height:auto;box-sizing:border-box;background:rgb(20,20,24);color:#fff;font:13px sans-serif;padding:8px 10px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.5);border:1px solid ' + COLOR + ';display:flex;flex-direction:column;overflow:visible';
    if (roomEl.style.position !== 'fixed' && roomEl.getAttribute('data-css') !== css) { roomEl.style.cssText = css; roomEl.setAttribute('data-css', css); }

    const sig = [me, selPeer, inv ? inv.from + inv.t : '', names.map((n) => n + ':' + (rooms[n].msgs.length ? rooms[n].msgs[rooms[n].msgs.length - 1].t : 0) + (rooms[n].aesKey ? '1' : '0')).join(',')].join('|');
    if (sig !== roomSig) {
      roomSig = sig;
      let h = '<div style="display:flex;align-items:center;min-height:26px;padding-right:28px;flex:none"><b style="font-size:12px;white-space:nowrap;display:inline-flex;align-items:center"><span style="display:inline-flex;align-items:center;color:' + COLOR + ';margin-right:5px"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + TI_CHAT + '</svg></span>1:1 대화&nbsp;<span style="color:' + COLOR + '">(' + names.length + ')</span></b></div>' +
        xBtn('__kw_chatroom_x', COLOR, 'position:absolute;top:2px;right:3px;z-index:2');
      // 상용 표시이지만 아직 테스트 중임을 알림 (베타·정식 공통)
      if (panelActive) h += '<div style="flex:none;font-size:10px;color:#888;margin-top:1px;padding-left:19px">베타 버전 테스트 중입니다</div>';
      if (inv) {
        h += '<div style="margin-top:6px;flex:none;display:flex;align-items:center;gap:6px;font-size:12px;color:#ffd400"><span><b>' + esc(inv.from) + '</b>님이 초대했습니다</span><button data-cr-accept style="border:1px solid ' + COLOR + ';background:rgba(63,213,152,.15);color:' + COLOR + ';border-radius:8px;padding:3px 10px;font-size:12px;cursor:pointer;flex:none">참가</button></div>';
      }
      if (!me) {
        h += '<div style="font-size:11px;color:#aaa;margin-top:6px;line-height:1.5">내 닉네임을 먼저 입력하세요.<br>설정 ⚙ → 단어설정 → 내 닉네임</div>';
      } else if (!names.length && !inv) {
        h += '<div style="font-size:11px;color:#aaa;margin-top:6px;line-height:1.5">채팅에 <b>#채팅 상대이름</b> 을 치면 방이 열립니다.<br>띄어쓰기 닉네임은 <b>#채팅 "홍 길동"</b> (여러 명은 쉼표로).</div>';
      }
      if (me && (names.length || inv)) {
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
          h += '<div class="__kw_sb_cr" style="flex:1;min-height:0;overflow-y:auto;margin-top:6px;display:flex;flex-direction:column;gap:8px;padding:2px">' + r.msgs.map((m, i, arr) => {
            const key = m.mine ? 'me' : ('t:' + m.from);
            const prevSame = i > 0 && (arr[i - 1].mine ? 'me' : ('t:' + arr[i - 1].from)) === key;
            const nextSame = i + 1 < arr.length && (arr[i + 1].mine ? 'me' : ('t:' + arr[i + 1].from)) === key;
            const time = '<span style="font-size:10px;color:#888;flex:none">' + fmtT(m.t) + '</span>';
            if (m.mine) {
              // 내 말풍선 (카톡 노랑)
              return '<div data-cr-msg="' + i + '" data-cr-peer="' + esc(selPeer) + '" title="누르면 원본 채팅으로 이동" style="display:flex;flex-direction:column;align-items:flex-end;cursor:pointer">' +
                '<div style="display:flex;align-items:flex-end;gap:4px;max-width:100%;justify-content:flex-end">' + (nextSame ? '' : time) +
                '<div style="max-width:78%;background:#FEE500;color:#191919;font-size:12px;line-height:1.5;padding:6px 10px;border-radius:14px 14px 4px 14px;word-break:break-word;white-space:pre-wrap">' + esc(m.text) + '</div></div></div>';
            }
            // 상대 말풍선 (짙은 회색) + 연속이 아닐 때만 닉네임·시간
            return '<div data-cr-msg="' + i + '" data-cr-peer="' + esc(selPeer) + '" title="누르면 원본 채팅으로 이동" style="display:flex;flex-direction:column;align-items:flex-start;cursor:pointer">' +
              (prevSame ? '' : '<div style="font-size:11px;color:#aaa;margin:0 0 2px 4px">' + esc(m.from) + '</div>') +
              '<div style="display:flex;align-items:flex-end;gap:4px;max-width:100%">' +
              '<div style="max-width:78%;background:#2F2F35;color:#fff;font-size:12px;line-height:1.5;padding:6px 10px;border-radius:4px 14px 14px 14px;word-break:break-word;white-space:pre-wrap">' + esc(m.text) + '</div>' + (nextSame ? '' : time) + '</div></div>';
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
      if (panelActive && KW && typeof KW.rsz === 'function') KW.rsz(roomEl, {
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
