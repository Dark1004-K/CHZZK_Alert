  // ---------- 스타일 (원본과 동일한 색/구조) ----------
  // document-start 실행이므로 head가 없을 수 있어 지연 주입
  function ensureStyle() {
    try {
      if (document.getElementById('__kw_style') || !document.head) return;
      const style = document.createElement('style');
      style.id = '__kw_style';
      style.textContent = `
  @keyframes __kwpulse{0%{box-shadow:0 0 0 0 rgba(0,255,163,.8)}70%{box-shadow:0 0 0 8px rgba(0,255,163,0)}100%{box-shadow:0 0 0 0 rgba(0,255,163,0)}}
  #__kw_panel{position:fixed;bottom:14px;left:14px;z-index:2147483647;background:rgba(20,20,24,.94);color:#fff;font:13px sans-serif;padding:10px 12px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.5);border:2px solid #00ffa3;user-select:none;min-width:250px;max-width:330px;display:none}
  #__kw_panel.show{display:block}
  #__kw_panel.off{border-color:#777}
  #__kw_row{display:flex;align-items:center;gap:8px}
  #__kw_dot{display:inline-block;width:11px;height:11px;border-radius:50%;background:#00ffa3;animation:__kwpulse 1.4s infinite;margin-right:8px;vertical-align:middle}
  #__kw_ch{display:flex;align-items:center;justify-content:space-between;gap:6px;font-weight:bold;font-size:13px;margin-bottom:1px}
  #__kw_links{display:inline-flex;gap:2px;align-items:center}
  #__kw_titlerow{display:flex;align-items:center;gap:8px}
  #__kw_panel.off #__kw_dot{background:#ff4d4d;animation:none}
  #__kw_sub{font-size:11px;color:#aaa;margin-top:2px}
  .__kw_b{border:0;border-radius:8px;padding:5px 9px;font:bold 12px sans-serif;cursor:pointer}
  .__kw_chip{display:inline-flex;align-items:center;gap:4px;background:#333;border-radius:12px;padding:3px 8px;margin:2px;font-size:12px}
  .__kw_chip b{cursor:pointer;color:#ff7b7b}
  .__kw_in{background:#222;border:1px solid #555;color:#fff;border-radius:6px;padding:4px 6px;font-size:12px;user-select:text}
  .__kw_lbl{font-size:11px;color:#aaa;margin:8px 0 3px}
  #__kw_box{position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:2147483647;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none}
  .__kw_toast{background:#ffd400;color:#000;font:bold 15px sans-serif;padding:12px 18px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.4);max-width:520px;pointer-events:auto;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #__kw_ask{position:fixed;bottom:14px;left:14px;z-index:2147483647;background:rgba(20,20,24,.96);color:#fff;font:13px sans-serif;padding:12px 14px;border-radius:12px;border:2px solid #ffd400;box-shadow:0 4px 16px rgba(0,0,0,.5);max-width:320px}
  #__kw_ask .__kw_b{margin-top:8px;margin-right:6px}
  #__kw_sel{position:absolute;z-index:2147483647;background:#00ffa3;color:#000;font:bold 12px sans-serif;padding:5px 9px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.5);cursor:pointer;display:none;white-space:nowrap}
  .__kw_hl{outline:3px solid #ffd400 !important;background:rgba(255,212,0,.18) !important;border-radius:4px;transition:background 2.5s ease,outline-color 2.5s ease}
  .__kw_hl.__kw_hl_fade{background:rgba(255,212,0,0) !important;outline-color:rgba(255,212,0,0) !important}
  .__kw_hit{padding:4px 6px;border-radius:6px;cursor:pointer;font-size:12px;line-height:1.4;word-break:break-all}
  .__kw_hit:hover{background:#2c2c31}
  .__kw_hit_t{color:#888;font-size:11px;margin-right:4px}
  .__kw_hit_k{color:#00ffa3;font-size:11px;margin-left:4px}
  .__kw_hit_kw{color:#ffd400;font-weight:bold}
  .__kw_hit.gone{opacity:.55}
  .__kw_hit_gone{color:#ff7b7b;font-size:11px;margin-left:4px}
  #__kw_stack{position:fixed;bottom:14px;left:14px;z-index:2147483647;display:flex;flex-direction:column;gap:8px;align-items:stretch;width:350px;max-width:calc(100vw - 28px)}
  #__kw_stack #__kw_panel{position:static;width:100%;box-sizing:border-box;min-width:0;max-width:none}
  #__kw_histp{width:100%;box-sizing:border-box;background:rgba(20,20,24,.94);color:#fff;font:13px sans-serif;padding:8px 10px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.5);border:1px solid #ffd400}
  #__kw_setp{position:absolute;left:calc(100% + 8px);bottom:0;width:360px;height:320px;box-sizing:border-box;background:rgba(20,20,24,.94);color:#fff;font:13px sans-serif;padding:8px 10px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.5);border:1px solid #777}
  .__kw_tabs{display:flex;flex-direction:column;gap:4px;flex:none}
  .__kw_tab{border:1px solid #555;background:#222;color:#bbb;border-radius:8px;padding:6px 8px;font-size:12px;cursor:pointer;white-space:nowrap}
  .__kw_tab.on{background:#00ffa3;color:#000;border-color:#00ffa3;font-weight:bold}
  .__kw_ic{background:transparent;border:0;padding:5px;border-radius:8px;cursor:pointer;color:#ddd;display:inline-flex;align-items:center;justify-content:center;flex:none;vertical-align:middle}
  #__kw_row .__kw_ic{align-self:center}
  #__kw_stack input[type="checkbox"], #__kw_ask input[type="checkbox"]{accent-color:#00ffa3;width:14px;height:14px;vertical-align:-2px}
  .__kw_ic:hover{background:rgba(255,255,255,.12)}
  .__kw_ic:disabled{opacity:.3;cursor:default;background:transparent}
  .__kw_ic svg{width:16px;height:16px;display:block}
  .__kw_upbtn{background:#1f6feb;color:#fff;border:0;border-radius:8px;padding:5px 12px;font:bold 12px sans-serif;cursor:pointer;margin-left:6px}
  .__kw_upbtn:disabled{background:#333;color:#777;cursor:default}
  #__kw_update_msg{font-size:12px;color:#ddd;margin-top:4px}
  #__kw_update_msg.hot{color:#00ffa3;font-weight:bold}
  #__kw_set_about .__kw_ic{margin-left:6px}
  #__kw_set_body .__kw_lbl:first-child{margin-top:0}
  #__kw_midrow{position:relative;width:100%}
  #__kw_grip{position:absolute;top:0;bottom:0;right:-6px;width:12px;cursor:ew-resize;z-index:1}
  #__kw_grip:hover{background:rgba(0,255,163,.25)}
  #__kw_stack #__kw_box{position:static;transform:none;width:100%;max-width:none;margin:0;display:none;align-items:stretch}
  #__kw_box.fs{position:absolute;top:12px;left:50%;transform:translateX(-50%);width:min(520px,90%);z-index:2147483647}
  #__kw_hist_head{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;font-weight:bold}
  #__kw_hits{max-height:150px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;user-select:text}
  #__kw_hits_clear{background:#444;color:#fff;padding:2px 7px;font-size:11px}
  `;
    document.head.appendChild(style);
    } catch (e) {}
  }
