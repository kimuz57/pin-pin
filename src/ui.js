// ==========================================
// ui.js — ระบบเวลา SSE + ระบบคิวเพลงอัจฉริยะ (เล่น Playlist แบบ Single Video Queue)
// ==========================================

// 1. DOM Elements
const elDays = document.getElementById('days');
const elHours = document.getElementById('hours');
const elMinutes = document.getElementById('minutes');
const elSeconds = document.getElementById('seconds');
const elQuote = document.getElementById('display-quote');
const elDistance = document.getElementById('distance-travelled');

if (elQuote) elQuote.innerText = '"Wait for something special to happen."';

function pad(n) {
  return n.toString().padStart(2, '0');
}

// 2. Server-Sent Events (SSE)
const es = new EventSource('/api/events');
es.onmessage = (event) => {
  const d = JSON.parse(event.data);
  if (!d.started) {
    if (elDays) elDays.innerText = '00';
    if (elHours) elHours.innerText = '00';
    if (elMinutes) elMinutes.innerText = '00';
    if (elSeconds) elSeconds.innerText = '00';
    if (elDistance) elDistance.innerText = '0';
    return;
  }
  if (elDays) elDays.innerText = pad(d.days);
  if (elHours) elHours.innerText = pad(d.hours);
  if (elMinutes) elMinutes.innerText = pad(d.minutes);
  if (elSeconds) elSeconds.innerText = pad(d.secs);
  if (elDistance) elDistance.innerText = d.distance.toLocaleString();
};

// ==========================================
// 3. ระบบคิวเสียง YouTube (เล่นทีละ Video ID วนลูป)
// ==========================================
let videoQueue = ['tGv7CUutzqU'];
let currentTrackIndex = 0;
let isPlaying = false;
let failedTracksCount = 0;

const audioBtn = document.getElementById('audio-btn');
const playerContainer =
  document.getElementById('yt-player-container') || document.getElementById('yt-player');

function applyMusicData(data) {
  if (!data) return;
  if (Array.isArray(data.videos) && data.videos.length > 0) {
    videoQueue = data.videos;
  } else if (data.id) {
    videoQueue = [data.id];
  }
  currentTrackIndex = 0;
  failedTracksCount = 0;
}

// ดึงรายการเพลงจาก Server ตอนเปิดเว็บ
fetch('/api/music')
  .then((r) => r.json())
  .then((data) => {
    applyMusicData(data);
  })
  .catch(() => {});

function sendYtCommand(func, args) {
  const iframe = document.getElementById('yt-iframe');
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage(
      JSON.stringify({ event: 'command', func: func, args: args || [] }),
      '*'
    );
  }
}

// เล่นเพลงถัดไปในคิว (วนลูปกลับไปเพลงแรกเมื่อครบ)
function playNextTrack() {
  if (!isPlaying || videoQueue.length === 0) return;
  currentTrackIndex = (currentTrackIndex + 1) % videoQueue.length;
  loadTrackAtIndex(currentTrackIndex);
}

// ดักฟังข้อความจาก YouTube Iframe
window.addEventListener('message', (event) => {
  if (!event.origin.includes('youtube.com')) return;
  try {
    const data = JSON.parse(event.data);

    if (data.event === 'onReady') {
      sendYtCommand('setVolume', [65]);
      sendYtCommand('playVideo');
    }

    if (data.event === 'infoDelivery' && data.info) {
      // 1 = กำลังเล่นปกติ
      if (data.info.playerState === 1) {
        failedTracksCount = 0;
      }
      // 0 = เพลงจบ -> เล่นเพลงถัดไปในคิว (หรือวนซ้ำถ้ามีเพลงเดียว)
      if (data.info.playerState === 0) {
        if (videoQueue.length > 1) {
          playNextTrack();
        } else {
          sendYtCommand('seekTo', [0, true]);
          sendYtCommand('playVideo');
        }
      }
    }

    // หากเพลงติดลิขสิทธิ์ (Error 150 / 101 / 100) ให้ข้ามไปเพลงถัดไปในคิวทันที!
    if (data.event === 'onError') {
      const badVideoId = videoQueue[currentTrackIndex];
      console.warn(
        `[Audio] เพลง ${badVideoId} ติดลิขสิทธิ์ Embed (Error ${data.info}) -> กำลังข้ามไปเพลงถัดไป...`
      );
      failedTracksCount++;

      if (failedTracksCount < videoQueue.length) {
        playNextTrack();
      } else {
        stopAudio();
        alert(
          'เพลงทั้งหมดในรายการนี้ถูกค่ายเพลงปิดกั้นไม่ให้เล่นนอกแอป YouTube (Error 150)\nกรุณาใช้ลิงก์เพลงที่เป็น MV หรือช่องทั่วไปที่ไม่ใช่ช่อง - Topic'
        );
      }
    }
  } catch (e) {}
});

function loadTrackAtIndex(index) {
  if (!playerContainer || videoQueue.length === 0) return;

  const videoId = videoQueue[index] || videoQueue[0];
  const origin = encodeURIComponent(window.location.origin);

  // ใช้ URL แบบเพลงเดี่ยวเสมอ เพราะเบราว์เซอร์ยอมให้ Autoplay 100%
  let embedUrl =
    'https://www.youtube.com/embed/' +
    videoId +
    '?autoplay=1&controls=0&playsinline=1&enablejsapi=1&rel=0&origin=' +
    origin;

  // ถ้ามีแค่เพลงเดียว ให้ใส่ loop=1&playlist=videoId กำกับไว้ด้วย
  if (videoQueue.length === 1) {
    embedUrl += '&loop=1&playlist=' + videoId;
  }

  playerContainer.innerHTML =
    '<iframe id="yt-iframe" width="200" height="200" src="' +
    embedUrl +
    '" frameborder="0" allow="autoplay; encrypted-media; compute-pressure" allowfullscreen></iframe>';

  const iframe = document.getElementById('yt-iframe');
  if (iframe) {
    iframe.addEventListener('load', () => {
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage(
          JSON.stringify({ event: 'listening', id: 1 }),
          '*'
        );
      }
    });
  }
}

function startAudio() {
  if (!playerContainer) return;
  isPlaying = true;
  failedTracksCount = 0;

  if (audioBtn) {
    audioBtn.style.borderColor = 'rgba(255, 200, 100, 0.8)';
    audioBtn.innerHTML = '<span>◼</span> PAUSE';
  }

  loadTrackAtIndex(currentTrackIndex);
}

function stopAudio() {
  if (!playerContainer) return;
  playerContainer.innerHTML = '';
  isPlaying = false;

  if (audioBtn) {
    audioBtn.style.borderColor = 'rgba(255, 255, 255, 0.15)';
    audioBtn.innerHTML = '<span>♪</span> SOUND';
  }
}

if (audioBtn) {
  audioBtn.addEventListener('click', () => {
    if (!isPlaying) {
      startAudio();
    } else {
      stopAudio();
    }
  });
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && isPlaying) {
    sendYtCommand('playVideo');
  }
});

// ==========================================
// 4. ระบบหน้าต่างลับ /change-bg-sound
// ==========================================
const modal = document.getElementById('music-modal');
const stepPassword = document.getElementById('step-password');
const stepLink = document.getElementById('step-link');
const inputPass = document.getElementById('admin-pass');
const inputUrl = document.getElementById('yt-url');
const btnVerify = document.getElementById('btn-verify-pass');
const btnSave = document.getElementById('btn-save-music');

let verifiedPasscode = '';

if (window.location.pathname === '/change-bg-sound') {
  if (modal) {
    modal.classList.add('active');
    setTimeout(() => inputPass && inputPass.focus(), 300);
  }
}

function checkPasscode() {
  const pass = inputPass.value.trim();
  if (!pass) return;

  btnVerify.innerText = 'VERIFYING...';
  btnVerify.disabled = true;

  fetch('/api/music/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pass }),
  })
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      btnVerify.innerText = 'VERIFY';
      btnVerify.disabled = false;

      if (res.ok && data.success) {
        verifiedPasscode = pass;
        stepPassword.style.display = 'none';
        stepLink.style.display = 'block';
        inputUrl.focus();
      } else {
        alert('รหัสผ่านไม่ถูกต้อง!');
        window.location.href = '/';
      }
    })
    .catch(() => {
      btnVerify.innerText = 'VERIFY';
      btnVerify.disabled = false;
      alert('รหัสผ่านไม่ถูกต้อง!');
      window.location.href = '/';
    });
}

if (btnVerify) {
  btnVerify.addEventListener('click', checkPasscode);
  inputPass.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') checkPasscode();
  });
}

function saveNewMusic() {
  const url = inputUrl.value.trim();
  if (!url) return;

  btnSave.innerText = 'APPLYING...';
  btnSave.disabled = true;

  fetch('/api/music', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: verifiedPasscode, url: url }),
  })
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      btnSave.innerText = 'APPLY & PLAY';
      btnSave.disabled = false;

      if (res.ok && data.success && data.music) {
        alert(
          'เปลี่ยนเพลงสำเร็จแล้ว! (พบเพลงทั้งหมด ' +
            (data.music.videos ? data.music.videos.length : 1) +
            ' เพลง)'
        );
        modal.classList.remove('active');
        window.history.replaceState({}, '', '/');

        applyMusicData(data.music);
        startAudio();
      } else {
        alert(data.message || 'เกิดข้อผิดพลาดในการบันทึกเพลง');
      }
    })
    .catch(() => {
      btnSave.innerText = 'APPLY & PLAY';
      btnSave.disabled = false;
      alert('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    });
}

if (btnSave) {
  btnSave.addEventListener('click', saveNewMusic);
  inputUrl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') saveNewMusic();
  });
}