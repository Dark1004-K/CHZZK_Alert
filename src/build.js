// Build: node src/build.js
// src/*.js를 순서대로 이어붙여 beta/chzzk_alert.beta.user.js를 만든다.
// 분할 시 원본과 바이트 동일함을 검증했으므로, 이 빌드도 동일하게 재현된다.
const fs = require('fs');
const path = require('path');
const FILES = [
  '00-header.txt',
  '01-open.js',
  '10-storage.js',
  '11-debug.js',
  '12-ws.js',
  '13-env.js',
  '14-state.js',
  '15-style.js',
  '16-notify.js',
  '17-history.js',
  '18-watch.js',
  '19-allow.js',
  '20-panel.js',
  '21-settings.js',
  '22-askdrag.js',
  '23-route.js',
  '24-plugins.js',
  '25-boot.js',
];
const parts = FILES.map((f) => fs.readFileSync(path.join(__dirname, f), 'utf8'));
const out = parts.join('\n');
fs.writeFileSync(path.join(__dirname, '..', 'beta', 'Chzzk_Alert.beta.user.js'), out);
console.log('built beta/Chzzk_Alert.beta.user.js (' + Buffer.byteLength(out, 'utf8') + ' bytes)');
