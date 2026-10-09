// Build
//   node src/build.js                  → 베타: beta/chzzk_alert.beta.user.js (헤더 + @require 로더) — 로직은 src/*.js를 직접 로드
//   node src/build.js --release 3.1.0  → 정식: chzzk_alert.user.js (헤더 + @require 로더) + release/*.js (src를 정식용으로 변환한 모듈)
//
// 베타: header.txt의 @version이 단일 기준. core.js의 SCRIPT_VERSION을 맞추고 @require URL에 ?v=버전을 붙여 캐시를 갱신한다.
// 정식: 베타와 모듈을 공유하면 베타 개발이 정식에 섞이므로, src를 변환한 고정 사본을 release/에 두고 정식 로더가 그 사본을 @require 한다.
//       변환: [BETA-TEST-ONLY:start]~[BETA-TEST-ONLY:end] 구간과 [BETA-ONLY-LINE] 줄 제거, 콘솔 로그·하트비트 끄기, 업데이트 주소/문구를 정식용으로.
//       src/ 원본은 건드리지 않는다. release/는 정식 릴리즈 때만 다시 만든다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const MODULES = ['core', 'chat', 'ui', 'app']; // 순서 중요 (상위 스코프를 공유하는 조각)
const RAW = 'https://raw.githubusercontent.com/Dark1004-K/Chzzk_Alert/main/';
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\r\n/g, '\n');
const header = read('header.txt');

function checkSyntax(name, code) { new vm.Script(code, { filename: name }); }
function replaceMust(label, text, from, to) {
  if (!text.includes(from)) throw new Error('정식 변환 실패: ' + label);
  return text.split(from).join(to);
}

function buildBeta() {
  const ver = (header.match(/@version\s+(\S+)/) || [])[1];
  if (!ver) throw new Error('header.txt에 @version이 없음');
  const corePath = path.join(__dirname, 'core.js');
  const core = read('core.js');
  const synced = core.replace(/(SCRIPT_VERSION = ')[^']*(')/, '$1' + ver + '$2');
  if (synced !== core) fs.writeFileSync(corePath, synced);
  for (const m of MODULES) checkSyntax(m + '.js', read(m + '.js')); // 문법 검사
  const requires = MODULES.map((m) => '// @require      ' + RAW + 'src/' + m + '.js?v=' + ver).join('\n');
  const out = header.replace('{{REQUIRES}}', requires).replace(/\s*$/, '\n');
  fs.writeFileSync(path.join(ROOT, 'beta', 'chzzk_alert.beta.user.js'), out);
  console.log('built beta/chzzk_alert.beta.user.js (' + ver + ', ' + MODULES.join('+') + ')');
}

// src 모듈 하나를 정식용으로 변환
function toRelease(name, ver) {
  let t = read(name + '.js');
  // 1) 베타 전용 코드 제거
  t = t.replace(/^[^\n]*\[BETA-TEST-ONLY:start\][^\n]*\n[\s\S]*?^[^\n]*\[BETA-TEST-ONLY:end\][^\n]*\n/gm, '');
  t = t.replace(/^[^\n]*\[BETA-ONLY-LINE\][^\n]*\n/gm, '');
  // 2) 정식용 값으로 치환
  if (name === 'core') {
    t = t.replace(/(SCRIPT_VERSION = ')[^']*(')/, '$1' + ver + '$2');
    t = replaceMust('UPDATE_URL', t, RAW + 'beta/chzzk_alert.beta.user.js', RAW + 'chzzk_alert.user.js');
    t = replaceMust('dlog', t,
      "const KW_TEST_TAG = '[KW-BETA]';\nfunction dlog(...a) { try { console.log(KW_TEST_TAG, ...a); } catch (e) {} }",
      'function dlog() {} // 정식: 콘솔 로그 없음');
    t = replaceMust('startHeartbeat', t,
      'function startHeartbeat() {\n  if (hbTimer) return;',
      'function startHeartbeat() {\n  return; // 정식: 진단 하트비트 없음\n  if (hbTimer) return;');
  }
  if (name === 'ui') {
    t = replaceMust('Beta 채널 표기', t, '(Beta 채널)', '(정식)');
    t = replaceMust('업데이트 내용 링크', t, '/blob/main/beta/UPDATE.md', '/blob/main/UPDATE.md');
  }
  return t;
}

function buildRelease(ver) {
  if (!/^\d+\.\d+\.\d+$/.test(ver || '')) throw new Error('정식 버전은 3자리여야 함 (예: --release 3.1.0)');
  const mods = {};
  for (const m of MODULES) { mods[m] = toRelease(m, ver); checkSyntax('release/' + m + '.js', mods[m]); }

  // 헤더: 정식 이름/버전/주소 + 정식 모듈 @require
  let head = header;
  head = replaceMust('header name', head, '// @name         CHZZK Alert (Beta)', '// @name         CHZZK 채팅 호출 알림 (Keyword Alert)');
  head = head.replace(/(@version\s+)\S+/, '$1' + ver);
  head = replaceMust('header urls', head, RAW + 'beta/chzzk_alert.beta.user.js', RAW + 'chzzk_alert.user.js');
  const requires = MODULES.map((m) => '// @require      ' + RAW + 'release/' + m + '.js?v=' + ver).join('\n');
  head = replaceMust('header requires', head, '{{REQUIRES}}', requires).replace(/\s*$/, '\n');

  // 검증: 베타 흔적이 남지 않았는지
  const all = head + Object.values(mods).join('\n');
  const left = all.match(/BETA-TEST|BETA-ONLY|__kwDebug|dropsSimMin|dropsSimNext|__kwBdoTest|KW-BETA|beta\/|Beta/g);
  if (left) throw new Error('정식 파일에 베타 흔적이 남음: ' + [...new Set(left)].join(', '));

  fs.mkdirSync(path.join(ROOT, 'release'), { recursive: true });
  for (const m of MODULES) fs.writeFileSync(path.join(ROOT, 'release', m + '.js'), mods[m]);
  fs.writeFileSync(path.join(ROOT, 'chzzk_alert.user.js'), head);
  console.log('built chzzk_alert.user.js + release/{' + MODULES.join(',') + '}.js (' + ver + ')');
}

const ri = process.argv.indexOf('--release');
if (ri >= 0) buildRelease(process.argv[ri + 1]);
else buildBeta();
