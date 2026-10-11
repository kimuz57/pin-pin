// ==========================================
// ui.js — เวอร์ชันสำหรับ build (อ่านแล้วถูก obfuscate)
// ข้อมูลเวลา/ระยะทาง มาจาก Server ผ่าน SSE
// start date เก็บเฉพาะที่ฝั่ง server เท่านั้น
// ==========================================

// ==========================================
// 1. DOM elements
// ==========================================
const elDays = document.getElementById('days');
const elHours = document.getElementById('hours');
const elMinutes = document.getElementById('minutes');
const elSeconds = document.getElementById('seconds');
const elQuote = document.getElementById('display-quote');
const elDistance = document.getElementById('distance-travelled');

elQuote.innerText = '"Wait for something special to happen."';

function pad(n) {
  return n.toString().padStart(2, '0');
}

// ==========================================
// 2. รับข้อมูลนับเวลาจาก Server (SSE)
// ==========================================
const es = new EventSource('/api/events');

es.onmessage = (event) => {
  const d = JSON.parse(event.data);

  if (!d.started) {
    elDays.innerText = '00';
    elHours.innerText = '00';
    elMinutes.innerText = '00';
    elSeconds.innerText = '00';
    elDistance.innerText = '0';
    return;
  }

  elDays.innerText = pad(d.days);
  elHours.innerText = pad(d.hours);
  elMinutes.innerText = pad(d.minutes);
  elSeconds.innerText = pad(d.secs);
  elDistance.innerText = d.distance.toLocaleString();
};

// EventSource จะ reconnect อัตโนมัติเมื่อหลุด (เช่น server รีสตาร์ท)

// ==========================================
// 3. ระบบเสียงสังเคราะห์อวกาศ
// ==========================================
let audioCtx = null;
let isAudioPlaying = false;
let synthOsc1, synthOsc2, synthGain;

function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  synthGain = audioCtx.createGain();
  synthGain.gain.setValueAtTime(0.001, audioCtx.currentTime);

  synthOsc1 = audioCtx.createOscillator();
  synthOsc1.type = 'sine';
  synthOsc1.frequency.setValueAtTime(55, audioCtx.currentTime);

  synthOsc2 = audioCtx.createOscillator();
  synthOsc2.type = 'triangle';
  synthOsc2.frequency.setValueAtTime(110, audioCtx.currentTime);

  synthOsc1.connect(synthGain);
  synthOsc2.connect(synthGain);
  synthGain.connect(audioCtx.destination);

  synthOsc1.start();
  synthOsc2.start();
}

const audioBtn = document.getElementById('audio-btn');
audioBtn.addEventListener('click', () => {
  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  if (!isAudioPlaying) {
    synthGain.gain.exponentialRampToValueAtTime(0.2, audioCtx.currentTime + 2.5);
    audioBtn.style.borderColor = 'rgba(255, 200, 100, 0.8)';
    audioBtn.innerHTML = '<span>◼</span> PAUSE';
    isAudioPlaying = true;
  } else {
    synthGain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 1.5);
    audioBtn.style.borderColor = 'rgba(255, 255, 255, 0.15)';
    audioBtn.innerHTML = '<span>♪</span> SOUND';
    isAudioPlaying = false;
  }
});