// Build: node src/build.js
// src/*.js를 순서대로 이어붙여 beta/chzzk_alert.beta.user.js를 만든다.
// 분할 시 원본과 바이트 동일함을 검증했으므로, 이 빌드도 동일하게 재현된다.
const fs = require('fs');
const path = require('path');
const FILES = [
  'header.txt',
  'open.js',
  'storage.js',
  'debug.js',
  'ws.js',
  'env.js',
  'state.js',
  'style.js',
  'notify.js',
  'history.js',
  'watch.js',
  'allow.js',
  'panel.js',
  'settings.js',
  'askdrag.js',
  'route.js',
  'plugins.js',
  'boot.js',
];
const parts = FILES.map((f) => fs.readFileSync(path.join(__dirname, f), 'utf8'));
const out = parts.join('\n');
fs.writeFileSync(path.join(__dirname, '..', 'beta', 'chzzk_alert.beta.user.js'), out);
console.log('built beta/chzzk_alert.beta.user.js (' + Buffer.byteLength(out, 'utf8') + ' bytes)');
