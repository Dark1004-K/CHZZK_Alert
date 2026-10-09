// Build: node src/build.js
// beta/chzzk_alert.beta.user.js는 헤더 + @require 로더만 가진 얇은 파일이다.
// 실제 로직은 src/*.js(MODULES 순서대로 @require)에서 로드된다.
// header.txt의 @version이 단일 기준: core.js의 SCRIPT_VERSION을 맞추고 @require URL에 ?v=버전을 붙여 캐시를 갱신한다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const MODULES = ['core', 'chat', 'ui', 'app']; // 순서 중요 (상위 스코프를 공유하는 조각)
const RAW = 'https://raw.githubusercontent.com/Dark1004-K/Chzzk_Alert/main/src/';
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const header = read('header.txt');
const ver = (header.match(/@version\s+(\S+)/) || [])[1];
if (!ver) throw new Error('header.txt에 @version이 없음');
const corePath = path.join(__dirname, 'core.js');
const core = read('core.js');
const synced = core.replace(/(SCRIPT_VERSION = ')[^']*(')/, '$1' + ver + '$2');
if (synced !== core) fs.writeFileSync(corePath, synced);
for (const m of MODULES) new vm.Script(read(m + '.js'), { filename: m + '.js' }); // 문법 검사
const requires = MODULES.map((m) => '// @require      ' + RAW + m + '.js?v=' + ver).join('\n');
const out = header.replace('{{REQUIRES}}', requires).replace(/\s*$/, '\n');
fs.writeFileSync(path.join(__dirname, '..', 'beta', 'chzzk_alert.beta.user.js'), out);
console.log('built beta/chzzk_alert.beta.user.js (' + ver + ', ' + MODULES.join('+') + ')');
