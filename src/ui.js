// ==========================================
// ui.js — ระบบเวลา SSE + YouTube Audio (Safari Direct Touch Unlock)
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
// 3. ระบบเสียง YouTube (รองรับทั้ง Safari iOS/iPadOS และ Chrome)
// ==========================================
let videoQueue = ['jfKfPfyJRdk'];
let currentTrackIndex = 0;
let isPlaying = false;
let failedTracksCount = 0;

const audioBtn = document.getElementById('audio-btn');
const playerContainer = document.getElementById('yt-player-container');

function sendYtCommand(func, args) {
  const iframe = document.getElementById('yt-iframe');
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage(
      JSON.stringify({ event: 'command', func: func, args: args || [] }),
      '*'
    );
  }
}

function setUIPlaying(playing) {
  isPlaying = playing;
  if (!audioBtn || !playerContainer) return;

  if (playing) {
    audioBtn.style.borderColor = 'rgba(255, 200, 100, 0.8)';
    audioBtn.innerHTML = '<span>◼</span> PAUSE';
    // เมื่อเสียงเล่นแล้ว ปิดการรับคลิกของ Iframe เพื่อให้กดปุ่ม PAUSE ได้
    playerContainer.classList.add('playing-mode');
  } else {
    audioBtn.style.borderColor = 'rgba(255, 255, 255, 0.15)';
    audioBtn.innerHTML = '<span>♪</span> SOUND';
    // เมื่อหยุดเพลง เปิดให้แตะโดน Iframe โดยตรงอีกครั้งเพื่อรองรับ Safari
    playerContainer.classList.remove('playing-mode');
  }
}

function mountIframe(videoId, autoPlay) {
  if (!playerContainer) return;

  const origin = encodeURIComponent(window.location.origin);
  const ap = autoPlay ? '1' : '0';
  let embedUrl =
    'https://www.youtube.com/embed/' +
    videoId +
    '?autoplay=' +
    ap +
    '&controls=0&playsinline=1&enablejsapi=1&rel=0&fs=0&origin=' +
    origin;

  if (videoQueue.length === 1) {
    embedUrl += '&loop=1&playlist=' + videoId;
  }

  playerContainer.innerHTML =
    '<iframe id="yt-iframe" width="140" height="60" src="' +
    embedUrl +
    '" frameborder="0" referrerpolicy="origin" allow="autoplay; encrypted-media; compute-pressure" playsinline></iframe>';

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

function applyMusicData(data, autoPlayNow) {
  if (!data) return;
  if (Array.isArray(data.videos) && data.videos.length > 0) {
    videoQueue = data.videos;
  } else if (data.id) {
    videoQueue = [data.id];
  }
  currentTrackIndex = 0;
  failedTracksCount = 0;

  mountIframe(videoQueue[0], !!autoPlayNow);
}

// ดึงเพลงที่ผ่านการคัดกรองจาก Server
fetch('/api/music')
  .then((r) => r.json())
  .then((data) => {
    applyMusicData(data, false);
  })
  .catch(() => {
    mountIframe(videoQueue[0], false);
  });

function playNextTrack() {
  if (videoQueue.length === 0) return;
  currentTrackIndex = (currentTrackIndex + 1) % videoQueue.length;
  const nextVideoId = videoQueue[currentTrackIndex];
  sendYtCommand('loadVideoById', [nextVideoId, 0]);
  sendYtCommand('playVideo');
}

// ดักฟังสถานะจาก YouTube Iframe
window.addEventListener('message', (event) => {
  if (!event.origin.includes('youtube.com')) return;
  try {
    const data = JSON.parse(event.data);

    if (data.event === 'onReady') {
      sendYtCommand('setVolume', [75]);
    }

    if (data.event === 'infoDelivery' && data.info) {
      // 1 = PLAYING (เมื่อผู้ใช้แตะโดน Iframe บน Safari แล้วเพลงเริ่มเล่น ปุ่มจะเปลี่ยนเป็น PAUSE อัตโนมัติ)
      if (data.info.playerState === 1) {
        failedTracksCount = 0;
        setUIPlaying(true);
      }
      // 2 = PAUSED
      else if (data.info.playerState === 2) {
        setUIPlaying(false);
      }
      // 0 = ENDED (เล่นจบ -> ไปเพลงถัดไป หรือวนซ้ำ)
      else if (data.info.playerState === 0) {
        if (videoQueue.length > 1) {
          playNextTrack();
        } else {
          sendYtCommand('seekTo', [0, true]);
          sendYtCommand('playVideo');
        }
      }
    }

    // ข้ามเพลงที่ติดลิขสิทธิ์
    if (data.event === 'onError') {
      failedTracksCount++;
      if (failedTracksCount < videoQueue.length) {
        playNextTrack();
      } else {
        setUIPlaying(false);
      }
    }
  } catch (e) {}
});

// เมื่อคลิกที่ปุ่ม (สำหรับหยุดเพลง หรือสั่งเล่นซ้ำหลังจากปลดล็อก Safari แล้ว)
if (audioBtn) {
  audioBtn.addEventListener('click', () => {
    if (isPlaying) {
      sendYtCommand('pauseVideo');
      setUIPlaying(false);
    } else {
      sendYtCommand('unMute');
      sendYtCommand('setVolume', [75]);
      sendYtCommand('playVideo');
      setUIPlaying(true);
    }
  });
}

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
          'เปลี่ยนเพลงสำเร็จแล้ว! (พร้อมเล่น ' +
            (data.music.videos ? data.music.videos.length : 1) +
            ' เพลง)'
        );
        modal.classList.remove('active');
        window.history.replaceState({}, '', '/');

        applyMusicData(data.music, true);
        setUIPlaying(true);
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