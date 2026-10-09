  // ---------- 플러그인 (plugins.json 매니페스트 기반 동적 로딩) ----------
  // MAIN world(사용자 스크립트 허용 켜짐)에서만 동작. 주입 <script>가 같은 window를 공유한다.
  // 플러그인은 window.__KW.on('hit', ({nick, text, kw}) => ...) 형태로 구독한다.
  const PLUGIN_MANIFEST_URL = 'https://raw.githubusercontent.com/Dark1004-K/Chzzk_Alert/main/plugins.json';
  const __kwListeners = {};
  try {
    window.__KW = window.__KW || {
      version: SCRIPT_VERSION,
      on(evt, fn) {
        if (typeof fn !== 'function') return;
        (__kwListeners[evt] = __kwListeners[evt] || []).push(fn);
      },
      toast(nick, body) { showCallToast(nick, body); },
    };
  } catch (e) {}
  function kwEmit(evt, data) {
    try {
      const arr = __kwListeners[evt] || [];
      for (const fn of arr) { try { fn(data); } catch (e) {} }
    } catch (e) {}
  }
  function loadPlugins() {
    if (limitedMode) { dlog('plugin-skip-limited'); return; }
    try {
      fetch(PLUGIN_MANIFEST_URL + '?t=' + Math.floor(Date.now() / 3600000), { cache: 'no-store' })
        .then((r) => { if (!r || !r.ok) throw new Error('http'); return r.json(); })
        .then((j) => {
          const list = j && Array.isArray(j.plugins) ? j.plugins : [];
          for (const p of list) {
            if (!p || !p.url || p.on === false) continue;
            injectPlugin(p);
          }
        })
        .catch(() => {});
    } catch (e) {}
  }
  function injectPlugin(p) {
    try {
      fetch(p.url, { cache: 'no-store' })
        .then((r) => { if (!r || !r.ok) throw new Error('http'); return r.text(); })
        .then((code) => {
          if (!code || code.length < 10) return;
          const s = document.createElement('script');
          s.textContent = '\n;try{\n' + code + '\n}catch(e){}';
          (document.head || document.documentElement).appendChild(s);
          try { s.remove(); } catch (e) {}
          dlog('plugin-loaded', p.id || p.url);
        })
        .catch(() => {});
    } catch (e) {}
  }

  function init() {
    ensureStyle();
    startHeartbeat();
    if (isLivePage()) {
      buildUi();
    } else {
      dlog('init-notlive', location.pathname);
    }
    runWorldProbe();
    loadPlugins();
    try {
      document.addEventListener('pointerdown', unlockAudio);
      document.addEventListener('keydown', unlockAudio);
    } catch (e) {}
    setInterval(checkRoute, 1000);
  }

  // 베타 진단용 후크 (정식에서는 제거): 콘솔에서 __kwDebug.jump(0) 등으로 직접 검증 가능
  try { window.__kwDebug = { jump: jumpToHit, find: findElBySig, log: () => hitLog }; } catch (e) {}
