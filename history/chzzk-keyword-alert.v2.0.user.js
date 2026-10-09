// ==UserScript==
// @name         CHZZK 채팅 호출 알림 (Keyword Alert)
// @namespace    https://chzzk.naver.com/
// @version      2.0
// @description  치지직(CHZZK) 생방송 채팅에서 등록한 단어(닉네임 등)가 언급되면 브라우저 알림 + 화면 토스트를 띄워줍니다.
// @author       shared-by-user
// @match        https://chzzk.naver.com/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  if (window.__kwAlertLoaded) return;
  window.__kwAlertLoaded = true;

  // ---------- 저장 (localStorage: 새로고침 후에도 유지) ----------
  const LS_KEYWORDS = '__kw_keywords';
  const LS_NICK = '__kw_nick';
  const LS_AUTO = '__kw_auto_start';

  const loadKeywords = () => {
    try { return JSON.parse(localStorage.getItem(LS_KEYWORDS)) || []; } catch (e) { return []; }
  };
  const saveKeywords = (list) => localStorage.setItem(LS_KEYWORDS, JSON.stringify(list));
  const loadNick = () => localStorage.getItem(LS_NICK) || '';
  const saveNick = (v) => localStorage.setItem(LS_NICK, v);
  const norm = (s) => (s || '').replace(/\s+/g, '').toLowerCase();

  let keywords = loadKeywords();
  let myNick = loadNick();
  let running = false;
  let checked = 0;
  let hits = 0;
  let observer = null;
  const seen = new WeakSet();

  // ---------- 스타일 (원본과 동일한 색/구조) ----------
  const style = document.createElement('style');
  style.textContent = `
  @keyframes __kwpulse{0%{box-shadow:0 0 0 0 rgba(0,255,163,.8)}70%{box-shadow:0 0 0 8px rgba(0,255,163,0)}100%{box-shadow:0 0 0 0 rgba(0,255,163,0)}}
  #__kw_panel{position:fixed;bottom:14px;left:14px;z-index:2147483647;background:rgba(20,20,24,.94);color:#fff;font:13px sans-serif;padding:10px 12px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.5);border:2px solid #00ffa3;user-select:none;min-width:250px;max-width:330px;display:none}
  #__kw_panel.show{display:block}
  #__kw_panel.off{border-color:#777}
  #__kw_row{display:flex;align-items:center;gap:8px}
  #__kw_dot{width:11px;height:11px;border-radius:50%;background:#00ffa3;animation:__kwpulse 1.4s infinite;flex:none}
  #__kw_panel.off #__kw_dot{background:#ff4d4d;animation:none}
  #__kw_sub{font-size:11px;color:#aaa;margin-top:2px}
  .__kw_b{border:0;border-radius:8px;padding:5px 9px;font:bold 12px sans-serif;cursor:pointer}
  #__kw_btn{background:#ff4d4d;color:#fff}
  #__kw_panel.off #__kw_btn{background:#00ffa3;color:#000}
  #__kw_gear{background:#444;color:#fff}
  #__kw_edit{display:none;margin-top:8px;border-top:1px solid #444;padding-top:8px}
  #__kw_panel.open #__kw_edit{display:block}
  .__kw_chip{display:inline-flex;align-items:center;gap:4px;background:#333;border-radius:12px;padding:3px 8px;margin:2px;font-size:12px}
  .__kw_chip b{cursor:pointer;color:#ff7b7b}
  .__kw_in{background:#222;border:1px solid #555;color:#fff;border-radius:6px;padding:4px 6px;font-size:12px;user-select:text}
  .__kw_lbl{font-size:11px;color:#aaa;margin:8px 0 3px}
  #__kw_box{position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:2147483647;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none}
  .__kw_toast{background:#ffd400;color:#000;font:bold 15px sans-serif;padding:12px 18px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.4);max-width:520px;pointer-events:auto;cursor:pointer}
  #__kw_ask{position:fixed;bottom:14px;left:14px;z-index:2147483647;background:rgba(20,20,24,.96);color:#fff;font:13px sans-serif;padding:12px 14px;border-radius:12px;border:2px solid #ffd400;box-shadow:0 4px 16px rgba(0,0,0,.5);max-width:320px}
  #__kw_ask .__kw_b{margin-top:8px;margin-right:6px}
  #__kw_sel{position:absolute;z-index:2147483647;background:#00ffa3;color:#000;font:bold 12px sans-serif;padding:5px 9px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.5);cursor:pointer;display:none;white-space:nowrap}
  `;
  document.head.appendChild(style);

  // ---------- 알림 ----------
  function ensurePermission() {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') Notification.requestPermission();
  }
  function fireAlert(text) {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('CHZZK 채팅 호출', { body: text });
    }
    showToast(text);
  }
  function showToast(text) {
    let box = document.getElementById('__kw_box');
    if (!box) {
      box = document.createElement('div');
      box.id = '__kw_box';
      document.body.appendChild(box);
    }
    const t = document.createElement('div');
    t.className = '__kw_toast';
    t.textContent = '🔔 ' + text.slice(0, 80);
    t.onclick = () => t.remove();
    box.appendChild(t);
    setTimeout(() => t.remove(), 5000);
  }

  // ---------- 채팅 감시 ----------
  const isLivePage = () => /\/live\//.test(location.pathname);

  function scanNode(node) {
    if (!(node instanceof HTMLElement)) return;
    const els = node.matches && node.matches('[class*="chatting_message"]')
      ? [node]
      : (node.querySelectorAll ? Array.from(node.querySelectorAll('[class*="chatting_message"]')) : []);
    for (const el of els) {
      if (seen.has(el)) continue;
      seen.add(el);
      checked++;
      const text = el.textContent || '';
      const nt = norm(text);
      if (myNick && nt.includes(norm(myNick))) continue;
      for (const kw of keywords) {
        if (kw && nt.includes(norm(kw))) {
          hits++;
          fireAlert(text);
          break;
        }
      }
    }
    renderPanel();
  }

  function start() {
    if (running) return;
    ensurePermission();
    observer = new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) scanNode(n);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    running = true;
    renderPanel();
  }
  function stop() {
    if (observer) observer.disconnect();
    observer = null;
    running = false;
    renderPanel();
  }

  // ---------- 패널 (#__kw_panel, 원본과 동일한 구조) ----------
  let panel;
  function buildPanel() {
    panel = document.createElement('div');
    panel.id = '__kw_panel';
    document.body.appendChild(panel);
    renderPanel();
  }

  function renderPanel() {
    if (!panel) return;
    const wasOpen = panel.classList.contains('open');
    panel.className = 'show' + (running ? '' : ' off') + (wasOpen ? ' open' : '');

    panel.innerHTML = `
      <div id="__kw_row"><div id="__kw_dot"></div>
        <div style="flex:1"><div id="__kw_title"><b style="color:${running ? '#00ffa3' : '#ff4d4d'}">${running ? '감시중' : '중지됨'}</b> · 단어 ${keywords.length}개</div><div id="__kw_sub">확인 ${checked}개 · 감지 ${hits}회 · 내 채팅 제외</div></div>
        <button class="__kw_b" id="__kw_gear" title="설정">단어</button>
        <button class="__kw_b" id="__kw_btn">${running ? '정지' : '시작'}</button></div>
      <div id="__kw_edit">
        <div class="__kw_lbl">호출 단어 (×로 삭제, 페이지 글자를 드래그해서도 추가 가능)</div>
        <div id="__kw_chips">${keywords.map((k, i) => `<span class="__kw_chip"><span>${escapeHtml(k)}</span><b data-i="${i}" title="삭제">×</b></span>`).join('')}</div>
        <div style="margin-top:6px"><input class="__kw_in" id="__kw_in" placeholder="추가할 단어" style="width:150px">
          <button class="__kw_b" id="__kw_add" style="background:#00ffa3;color:#000">추가</button></div>
        <div class="__kw_lbl">내 닉네임 (이 닉네임의 채팅은 알림 제외)</div>
        <input class="__kw_in" id="__kw_nick" style="width:150px" value="${escapeHtml(myNick)}">
        <div class="__kw_lbl"><label style="cursor:pointer"><input type="checkbox" id="__kw_auto" ${localStorage.getItem(LS_AUTO) === '1' ? 'checked' : ''}> 방송 들어가면 묻지 않고 자동으로 켜기</label></div>
      </div>`;

    panel.querySelector('#__kw_btn').onclick = () => (running ? stop() : start());
    panel.querySelector('#__kw_gear').onclick = () => panel.classList.toggle('open');
    panel.querySelectorAll('#__kw_chips b').forEach((b) => {
      b.onclick = () => {
        keywords.splice(Number(b.dataset.i), 1);
        saveKeywords(keywords);
        renderPanel();
      };
    });
    const addBtn = panel.querySelector('#__kw_add');
    const addInput = panel.querySelector('#__kw_in');
    const doAdd = () => {
      const v = addInput.value.trim();
      if (v && !keywords.includes(v)) { keywords.push(v); saveKeywords(keywords); renderPanel(); }
    };
    addBtn.onclick = doAdd;
    addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
    panel.querySelector('#__kw_nick').onchange = (e) => { myNick = e.target.value; saveNick(myNick); };
    panel.querySelector('#__kw_auto').onchange = (e) => localStorage.setItem(LS_AUTO, e.target.checked ? '1' : '0');
  }

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- 방송 진입 시 시작 여부 프롬프트 (#__kw_ask) ----------
  function showAskPrompt() {
    if (localStorage.getItem(LS_AUTO) === '1') { start(); return; }
    if (panel) panel.classList.remove('show');
    const box = document.createElement('div');
    box.id = '__kw_ask';
    box.innerHTML = `<div><b>🔔 채팅 호출 알림을 켤까요?</b></div>
      <div style="font-size:12px;color:#bbb;margin-top:4px">단어: <span>${keywords.join(', ') || '(없음, 단어를 먼저 등록하세요)'}</span></div>
      <button class="__kw_b" id="__kw_yes" style="background:#00ffa3;color:#000">켜기</button>
      <button class="__kw_b" id="__kw_no" style="background:#444;color:#fff">이번엔 안 함</button>
      <div style="font-size:11px;margin-top:8px"><label style="cursor:pointer"><input type="checkbox" id="__kw_ask_auto"> 다음부터 묻지 않고 자동으로 켜기</label></div>`;
    document.body.appendChild(box);
    box.querySelector('#__kw_yes').onclick = () => {
      if (box.querySelector('#__kw_ask_auto').checked) localStorage.setItem(LS_AUTO, '1');
      start();
      box.remove();
      if (panel && isLivePage()) panel.classList.add('show');
    };
    box.querySelector('#__kw_no').onclick = () => {
      box.remove();
      if (panel && isLivePage()) panel.classList.add('show');
    };
  }

  // ---------- 드래그 선택으로 단어 추가 (#__kw_sel) ----------
  function setupDragToAdd() {
    const sel = document.createElement('div');
    sel.id = '__kw_sel';
    document.body.appendChild(sel);
    document.addEventListener('mouseup', () => {
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
        if (!keywords.includes(text)) { keywords.push(text); saveKeywords(keywords); renderPanel(); }
        sel.style.display = 'none';
      };
    });
  }

  // ---------- SPA 라우트 변경 감지 ----------
  let lastPath = location.pathname;
  function checkRoute() {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      if (isLivePage()) {
        panel.classList.add('show');
        if (!running) showAskPrompt();
      } else {
        panel.classList.remove('show');
      }
    }
  }

  function init() {
    buildPanel();
    setupDragToAdd();
    if (isLivePage()) {
      panel.classList.add('show');
      showAskPrompt();
    }
    setInterval(checkRoute, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

