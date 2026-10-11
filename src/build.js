// Build
//   node src/build.js                           → 베타: beta/chzzk_alert.beta.user.js (헤더 + @require 로더) — 로직은 src/*.js를 직접 로드
//   node src/build.js --release 3.1.2           → 정식: chzzk_alert.user.js (헤더 + @require 로더)
//                                                  + release/{core,chat,ui,app}.js (src를 정식용으로 변환 + 강한 난독화)
//                                                  + release/plugins/*.js, release/plugins.json (플러그인도 같은 방식)
//   node src/build.js --release 3.1.2 --no-obfuscate   → 난독화 없이(디버깅용). 커밋/배포용으로는 쓰지 말 것.
//
// 베타: header.txt의 @version이 단일 기준. core.js의 SCRIPT_VERSION을 맞추고 @require URL에 ?v=버전을 붙여 캐시를 갱신한다.
// 정식: 베타와 파일을 공유하면 베타 개발이 정식에 섞이므로, 변환한 고정 사본을 release/에 두고 정식 로더/앱이 그것만 불러온다.
//   변환: [BETA-TEST-ONLY:start]~[BETA-TEST-ONLY:end] 구간과 [BETA-ONLY-LINE] 줄 제거, 콘솔 로그·하트비트 끄기, 업데이트/플러그인 주소를 정식용으로.
//   난독화: javascript-obfuscator. 모듈들이 최상위 이름(함수·변수)을 서로 공유하므로 renameGlobals를 끄고, 모듈마다 접두사를 달리해
//          난독화 도구가 만드는 보조 이름이 모듈 사이에서 겹치지 않게 한다.
//   src/와 plugins/ 원본은 건드리지 않는다. release/는 정식 릴리즈 때만 다시 만든다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const MODULES = ['core', 'chat', 'ui', 'app']; // 순서 중요 (상위 스코프를 공유하는 조각)
const RAW = 'https://raw.githubusercontent.com/Dark1004-K/Chzzk_Alert/main/';
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\r\n/g, '\n');
const readRoot = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const header = read('header.txt');

function checkSyntax(name, code) { new vm.Script(code, { filename: name }); }
function replaceMust(label, text, from, to) {
  if (!text.includes(from)) throw new Error('정식 변환 실패: ' + label);
  return text.split(from).join(to);
}
function stripBetaMarkers(t) {
  t = t.replace(/^[^\n]*\[BETA-TEST-ONLY:start\][^\n]*\n[\s\S]*?^[^\n]*\[BETA-TEST-ONLY:end\][^\n]*\n/gm, '');
  return t.replace(/^[^\n]*\[BETA-ONLY-LINE\][^\n]*\n/gm, '');
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

// src 모듈 하나를 정식용으로 변환 (난독화 전)
function toRelease(name, ver) {
  let t = stripBetaMarkers(read(name + '.js'));
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
  if (name === 'app') {
    t = replaceMust('플러그인 목록 주소', t, RAW + 'plugins.json', RAW + 'release/plugins.json');
  }
  return t;
}

// 강한 난독화 설정. renameGlobals:false 가 핵심 — 모듈 사이에서 공유하는 최상위 이름을 바꾸면 연결이 끊긴다.
function obfOptions(prefix) {
  return {
    target: 'browser',
    compact: true,
    renameGlobals: false,
    renameProperties: false, // window.__KW.on/option/... 같은 외부(플러그인) 공개 이름은 그대로
    identifierNamesGenerator: 'hexadecimal',
    identifiersPrefix: prefix,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayCallsTransformThreshold: 0.75,
    stringArrayEncoding: ['rc4'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersCount: 2,
    stringArrayWrappersChainedCalls: true,
    stringArrayWrappersParametersMaxCount: 4,
    stringArrayWrappersType: 'function',
    stringArrayThreshold: 1,
    splitStrings: true,
    splitStringsChunkLength: 8,
    transformObjectKeys: true,
    numbersToExpressions: true,
    simplify: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.6,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.25,
    selfDefending: false, // 코드가 감싸지거나 다시 포맷되면 스스로 멈추는 기능이라 사용하지 않음
    debugProtection: false,
    disableConsoleOutput: false,
    unicodeEscapeSequence: false,
    log: false,
  };
}
function obfuscate(code, prefix) {
  const JavaScriptObfuscator = require('javascript-obfuscator');
  return JavaScriptObfuscator.obfuscate(code, obfOptions(prefix)).getObfuscatedCode();
}

function buildRelease(ver, doObfuscate) {
  if (!/^\d+\.\d+\.\d+$/.test(ver || '')) throw new Error('정식 버전은 3자리여야 함 (예: --release 3.1.2)');
  const pluginDir = path.join(ROOT, 'plugins');
  const pluginFiles = fs.readdirSync(pluginDir).filter((f) => f.endsWith('.js'));

  // 1) 변환 (난독화 전)
  const mods = {};
  for (const m of MODULES) { mods[m] = toRelease(m, ver); checkSyntax('release/' + m + '.js', mods[m]); }
  const plugins = {};
  for (const f of pluginFiles) { plugins[f] = stripBetaMarkers(readRoot('plugins/' + f)); checkSyntax('release/plugins/' + f, plugins[f]); }
  const manifest = JSON.parse(readRoot('plugins.json'));
  manifest.plugins.forEach((p) => {
    p.url = replaceMust('플러그인 주소 ' + p.id, p.url, RAW + 'plugins/', RAW + 'release/plugins/');
    // 동반은 베타용(beta/)을 정식용(루트)으로 되돌림. 정식 파일에 beta/ 흔적이 남으면 아래 검증에서 실패함.
    if (p.companion && typeof p.companion.url === 'string' && p.companion.url.includes('beta/chzzk_bridge.beta.user.js')) {
      p.companion.url = p.companion.url.split('beta/chzzk_bridge.beta.user.js').join('chzzk_bridge.user.js');
    }
  });

  // 2) 헤더: 정식 이름/버전/주소 + 정식 모듈 @require
  let head = header;
  head = replaceMust('header name', head, '// @name         CHZZK Alert (Beta)', '// @name         CHZZK Alert (정식)');
  head = head.replace(/(@version\s+)\S+/, '$1' + ver);
  head = replaceMust('header urls', head, RAW + 'beta/chzzk_alert.beta.user.js', RAW + 'chzzk_alert.user.js');
  const requires = MODULES.map((m) => '// @require      ' + RAW + 'release/' + m + '.js?v=' + ver).join('\n');
  head = replaceMust('header requires', head, '{{REQUIRES}}', requires).replace(/\s*$/, '\n');

  // 3) 검증(난독화 전 원문 기준): 베타 흔적이 남지 않았는지
  const all = head + Object.values(mods).join('\n') + Object.values(plugins).join('\n') + JSON.stringify(manifest);
  const left = all.match(/BETA-TEST|BETA-ONLY|__kwDebug|dropsSimMin|dropsSimNext|__kwBdoTest|KW-BETA|beta\/|Beta/g);
  if (left) throw new Error('정식 파일에 베타 흔적이 남음: ' + [...new Set(left)].join(', '));

  // 4) 난독화 (모듈마다, 플러그인마다 접두사를 달리함)
  let outMods = mods, outPlugins = plugins;
  if (doObfuscate) {
    outMods = {}; outPlugins = {};
    MODULES.forEach((m, i) => { outMods[m] = obfuscate(mods[m], '_m' + i); checkSyntax('release/' + m + '.js(난독화)', outMods[m]); });
    pluginFiles.forEach((f, i) => { outPlugins[f] = obfuscate(plugins[f], '_p' + i); checkSyntax('release/plugins/' + f + '(난독화)', outPlugins[f]); });
  }

  fs.mkdirSync(path.join(ROOT, 'release', 'plugins'), { recursive: true });
  for (const m of MODULES) fs.writeFileSync(path.join(ROOT, 'release', m + '.js'), outMods[m]);
  for (const f of pluginFiles) fs.writeFileSync(path.join(ROOT, 'release', 'plugins', f), outPlugins[f]);
  fs.writeFileSync(path.join(ROOT, 'release', 'plugins.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(ROOT, 'chzzk_alert.user.js'), head);
  const size = MODULES.reduce((n, m) => n + Buffer.byteLength(outMods[m], 'utf8'), 0);
  console.log('built chzzk_alert.user.js + release/{' + MODULES.join(',') + '}.js + release/plugins/ (' + ver + ', ' +
    (doObfuscate ? '난독화' : '난독화 안 함') + ', 모듈 ' + size + ' bytes)');
}

const ri = process.argv.indexOf('--release');
if (ri >= 0) buildRelease(process.argv[ri + 1], !process.argv.includes('--no-obfuscate'));
else buildBeta();
