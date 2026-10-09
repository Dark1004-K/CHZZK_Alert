  // ---------- 실행 환경 판별 (사용자 스크립트 허용 여부) ----------
  // MAIN world면 주입 스크립트가 같은 window를 봐서 echo가 일치하고,
  // 격리 월드(허용 꺼짐)면 주입 스크립트가 userscript의 window 확장을 못 봐서 불일치.
  let limitedMode = false;
  function runWorldProbe() {
    try {
      const k = '__kwWorldProbe';
      const v = 'v' + Math.random().toString(36).slice(2);
      window[k] = v;
      const root = document.documentElement || document.head;
      if (!root) return;
      const s = document.createElement('script');
      s.textContent = 'window["' + k + 'Echo"]=window["' + k + '"];';
      root.appendChild(s);
      try { s.remove(); } catch (e) {}
      limitedMode = window[k + 'Echo'] !== v;
      try { delete window[k]; delete window[k + 'Echo']; } catch (e) {}
      dlog(limitedMode ? 'world-limited' : 'world-main');
    } catch (e) { limitedMode = true; try { dlog('world-probe-fail'); } catch (e2) {} }
    updateWarn();
  }
  function updateWarn() {
    if (!panel) return;
    const w = panel.querySelector('#__kw_warn');
    if (w) w.style.display = limitedMode ? 'block' : 'none';
  }