// scripts/obfuscate.js
// Build: obfuscate src/*.js ไปยัง public/ และคัดลอก html
// Usage: node scripts/obfuscate.js

const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const ROOT = path.join(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src');
const PUB_DIR = path.join(ROOT, 'public');

fs.mkdirSync(PUB_DIR, { recursive: true });

const obfuscateOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  stringArray: true,
  stringArrayThreshold: 1,
  stringArrayEncoding: ['base64'],
  shuffleStringArray: true,
  rotateStringArray: true,
  identifierNamesGenerator: 'hexadecimal',
  transformObjectKeys: false,
  selfDefending: true,
  renameGlobals: false,
  disableConsoleOutput: true,
  simplify: true
};

function obfuscateFile(file) {
  const srcPath = path.join(SRC_DIR, file);
  const outPath = path.join(PUB_DIR, file);
  const code = fs.readFileSync(srcPath, 'utf8');
  const result = JavaScriptObfuscator.obfuscate(code, obfuscateOptions);
  const obfuscated = result.getObfuscatedCode();

  // syntax check ก่อนเขียนทับไฟล์จริง
  new Function(obfuscated); // throws ถ้า syntax ผิด
  new Function(code);       // ตรวจ src เดิมด้วย (debug)

  fs.writeFileSync(outPath, obfuscated);
  console.log(`built ${file}: ${(code.length / 1024).toFixed(1)} KB -> ${(obfuscated.length / 1024).toFixed(1)} KB`);
}

// คัดลอก HTML ต้นฉบับเป็น index.html (ชื่อ script/texture เดิมใช้เหมือนกัน)
fs.copyFileSync(path.join(SRC_DIR, 'intext.html'), path.join(PUB_DIR, 'index.html'));
console.log('copied intext.html -> public/index.html');

obfuscateFile('space3d.js');
obfuscateFile('ui.js');

console.log('build:js done.');