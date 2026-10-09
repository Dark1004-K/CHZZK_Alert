// Build
//   node src/build.js                  → 베타: beta/chzzk_alert.beta.user.js (헤더 + @require 로더, 로직은 src/*.js)
//   node src/build.js --release 3.1.0  → 정식: chzzk_alert.user.js (단일 파일, 베타 전용 코드 제거)
//
// 베타: header.txt의 @version이 단일 기준. core.js의 SCRIPT_VERSION을 맞추고 @require URL에 ?v=버전을 붙여 캐시를 갱신한다.
// 정식: src/*.js를 이어붙여 하나의 IIFE로 감싼다. [BETA-TEST-ONLY:start]~[BETA-TEST-ONLY:end] 구간과 [BETA-ONLY-LINE] 줄은 지우고,
//       콘솔 로그·하트비트를 끄고, 업데이트 주소/문구를 정식용으로 바꾼다. src/ 원본은 건드리지 않는다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const MODULES = ['core', 'chat', 'ui', 'app']; // 순서 중요 (상위 스코프를 공유하는 조각)
const RAW = 'https://raw.githubusercontent.com/Dark1004-K/Chzzk_Alert/main/';
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\r\n/g, '\n');
const header = read('header.txt');

function checkSyntax(name, code) { new vm.Script(code, { filename: name }); }

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

function buildRelease(ver) {
  if (!/^\d+\.\d+\.\d+$/.test(ver || '')) throw new Error('정식 버전은 3자리여야 함 (예: --release 3.1.0)');
  const must = (label, before, after, from, to) => {
    if (!before.includes(from)) throw new Error('정식 변환 실패: ' + label);
    return before.split(from).join(to);
  };
  let body = MODULES.map((m) => read(m + '.js').replace(/^'use strict';\n\n?/, '')).join('\n');

  // 1) 베타 전용 코드 제거
  body = body.replace(/^[^\n]*\[BETA-TEST-ONLY:start\][^\n]*\n[\s\S]*?^[^\n]*\[BETA-TEST-ONLY:end\][^\n]*\n/gm, '');
  body = body.replace(/^[^\n]*\[BETA-ONLY-LINE\][^\n]*\n/gm, '');

  // 2) 정식용 값으로 치환
  body = body.replace(/(SCRIPT_VERSION = ')[^']*(')/, '$1' + ver + '$2');
  body = must('UPDATE_URL', body, null, RAW + 'beta/chzzk_alert.beta.user.js', RAW + 'chzzk_alert.user.js');
  body = must('dlog', body, null,
    "const KW_TEST_TAG = '[KW-BETA]';\nfunction dlog(...a) { try { console.log(KW_TEST_TAG, ...a); } catch (e) {} }",
    'function dlog() {} // 정식: 콘솔 로그 없음');
  body = must('startHeartbeat', body, null,
    'function startHeartbeat() {\n  if (hbTimer) return;',
    'function startHeartbeat() {\n  return; // 정식: 진단 하트비트 없음\n  if (hbTimer) return;');
  body = must('Beta 채널 표기', body, null, '(Beta 채널)', '(정식)');
  body = must('업데이트 내용 링크', body, null, '/blob/main/beta/UPDATE.md', '/blob/main/UPDATE.md');

  // 3) 헤더: 정식 이름/버전/주소, @require 제거
  let head = header;
  head = must('header name', head, null, '// @name         CHZZK Alert (Beta)', '// @name         CHZZK 채팅 호출 알림 (Keyword Alert)');
  head = head.replace(/(@version\s+)\S+/, '$1' + ver);
  head = must('header urls', head, null, RAW + 'beta/chzzk_alert.beta.user.js', RAW + 'chzzk_alert.user.js');
  head = must('header requires', head, null, '{{REQUIRES}}\n', '');
  head = head.replace(/\s*$/, '\n');

  const out = head + '\n(function () {\n' + body.replace(/\s*$/, '\n') + '})();\n';

  // 4) 검증: 문법 + 베타 흔적이 남지 않았는지
  checkSyntax('chzzk_alert.user.js', out);
  const left = out.match(/BETA-TEST|BETA-ONLY|__kwDebug|dropsSimMin|dropsSimNext|__kwBdoTest|KW-BETA|beta\/|Beta/g);
  if (left) throw new Error('정식 파일에 베타 흔적이 남음: ' + [...new Set(left)].join(', '));
  fs.writeFileSync(path.join(ROOT, 'chzzk_alert.user.js'), out);
  console.log('built chzzk_alert.user.js (' + ver + ', ' + Buffer.byteLength(out, 'utf8') + ' bytes)');
}

const ri = process.argv.indexOf('--release');
if (ri >= 0) buildRelease(process.argv[ri + 1]);
else buildBeta();
