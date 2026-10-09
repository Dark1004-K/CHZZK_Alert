  // ---------- 저장 (localStorage: 새로고침 후에도 유지) ----------
  const LS_KEYWORDS = '__kw_keywords';
  const LS_NICK = '__kw_mynick'; // 원본 스크립트가 쓴 키 이름과 동일하게 맞춤 (기존에 저장된 닉네임 그대로 불러옵)
  const LS_NICK_OLD = '__kw_nick'; // 이전 버전에서 잘못 쓴 키 (혼용성 폴백)
  const LS_AUTO = '__kw_auto_start';
  const LS_HITS = '__kw_hits'; // 불린 대화 기록 (최대 30개, 새로고침 후에도 유지)
  const LS_HIST = '__kw_hist_on'; // 불린 대화 목록 옵션 ('0'=끔, 그 외=켬)
  const LS_SET = '__kw_set_open'; // 설정 화면 열림 상태
  const LS_TAB = '__kw_set_tab'; // 설정 탭 ('general' | 'words' | 'about')
  // 런타임에 보이는 버전/업데이트 주소 (@version 헤더와 함께 올릴 것)
  const SCRIPT_VERSION = '2.8-beta29';
  const UPDATE_URL = 'https://raw.githubusercontent.com/Dark1004-K/chizizic_call_nickname/main/beta/chzzk-keyword-alert.beta.user.js';
  const LS_W = '__kw_width'; // 스택 가로 (드래그 리사이즈, 기본 350)
  const HITS_MAX = 30;

  const loadKeywords = () => {
    try { return JSON.parse(localStorage.getItem(LS_KEYWORDS)) || []; } catch (e) { return []; }
  };
  const saveKeywords = (list) => localStorage.setItem(LS_KEYWORDS, JSON.stringify(list));
  const loadNick = () => localStorage.getItem(LS_NICK) ?? localStorage.getItem(LS_NICK_OLD) ?? '';
  const saveNick = (v) => localStorage.setItem(LS_NICK, v);
  const histOn = () => { try { return localStorage.getItem(LS_HIST) !== '0'; } catch (e) { return true; } };
  const LS_DEDUP = '__kw_dedup'; // 재알림 방지 옵션. 미설정 시 기존 목록옵션 값을 물려받음
  const dedupOn = () => {
    try {
      const v = localStorage.getItem(LS_DEDUP);
      if (v === null) return localStorage.getItem(LS_HIST) !== '0';
      return v !== '0';
    } catch (e) { return true; }
  };
  const LS_MUTE = '__kw_mute'; // 알람 끄기 (감지·기록은 유지, 알림/토스트/소리만 생략)
  const muted = () => { try { return localStorage.getItem(LS_MUTE) === '1'; } catch (e) { return false; } };
  const LS_REDUP = '__kw_redup_min'; // 같은 호출 재알림 간격 (분, 기본 5, 0이면 항상 울림)
  function redupMin() {
    try {
      const v = parseFloat(localStorage.getItem(LS_REDUP));
      if (isFinite(v) && v >= 0 && v <= 120) return v;
    } catch (e) {}
    return 5;
  }
  const redupMs = () => redupMin() * 60000;
  const loadHits = () => {
    try {
      const a = JSON.parse(localStorage.getItem(LS_HITS)) || [];
      return Array.isArray(a) ? a.filter((h) => h && h.sig).slice(0, HITS_MAX).map((h) => ({ ...h, el: null })) : [];
    } catch (e) { return []; }
  };
  const norm = (s) => (s || '').replace(/\s+/g, '').toLowerCase();
  const normLoose = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

  let keywords = loadKeywords();
  let myNick = loadNick();
  // CPU 절감 + 경계 오탐 방지: 타이트(공백제거)/루즈(공백유지) 두 형태를 미리 캐시
  // 타이트만 쓰면 "그런데 아"가 "그런데아"로 합쳐져서 키워드 "데아"에 오탐됨.
  let kwCache = keywords.map((k) => ({ tight: norm(k), loose: normLoose(k) })).filter((o) => o.tight);
  let normMyNick = norm(myNick);
  function refreshNormCache() {
    kwCache = keywords.map((k) => ({ tight: norm(k), loose: normLoose(k) })).filter((o) => o.tight);
    normMyNick = norm(myNick);
  }
