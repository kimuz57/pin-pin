// server.js — เสิร์ฟหน้าเว็บ + SSE + คัดกรองเพลงที่เปิด Embed บนเว็บจริงได้ 100%
const fs = require('fs');
const path = require('path');
const https = require('https');
const express = require('express');

const START_DATE = new Date('2025-07-24T21:38:00+07:00').getTime();
const MEMORY_QUOTE = '"Wait for something special to happen."';
const ORBIT_SPEED_KM_S = 230;

const ADMIN_PASSWORD = 'pin0711';
const MUSIC_FILE = path.join(__dirname, 'music.json');

function getSavedMusic() {
  try {
    if (fs.existsSync(MUSIC_FILE)) {
      return JSON.parse(fs.readFileSync(MUSIC_FILE, 'utf8'));
    }
  } catch (e) {}
  return { type: 'video', id: 'jfKfPfyJRdk', videos: ['jfKfPfyJRdk'] };
}

// ตรวจสอบว่าคลิปนั้นอนุญาตให้ Embed บนเว็บไซต์ภายนอกหรือไม่ (กรองช่อง - Topic ที่ติดบล็อกออก)
function checkVideoEmbeddable(videoId) {
  return new Promise((resolve) => {
    const url = `https://www.youtube.com/embed/${videoId}`;
    https
      .get(
        url,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            Referer: 'https://pin.tcmg.me/',
          },
        },
        (res) => {
          let html = '';
          res.on('data', (chunk) => (html += chunk));
          res.on('end', () => {
            // ถ้าในหน้า embed มีคำว่า UNPLAYABLE หรือไม่อนุญาตให้เล่นนอกเว็บ
            if (
              html.includes('"status":"UNPLAYABLE"') ||
              html.includes('"playableInEmbed":false')
            ) {
              resolve(false);
            } else {
              resolve(true);
            }
          });
        }
      )
      .on('error', () => resolve(true));
  });
}

// ดึงรหัส Video ID ทั้งหมดจาก Playlist พร้อมกรองเฉพาะเพลงที่เล่นบนเว็บจริงได้
function fetchPlaylistVideoIds(playlistId) {
  return new Promise((resolve) => {
    const url = `https://www.youtube.com/playlist?list=${playlistId}`;
    https
      .get(
        url,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        },
        (res) => {
          let html = '';
          res.on('data', (chunk) => (html += chunk));
          res.on('end', async () => {
            const regex = /"playlistVideoRenderer":\{"videoId":"([a-zA-Z0-9_-]{11})"/g;
            const rawIds = [];
            let match;
            while ((match = regex.exec(html)) !== null) {
              if (!rawIds.includes(match[1])) {
                rawIds.push(match[1]);
              }
            }

            if (rawIds.length === 0) {
              const fallbackRegex = /"videoId":"([a-zA-Z0-9_-]{11})"/g;
              while ((match = fallbackRegex.exec(html)) !== null) {
                if (!rawIds.includes(match[1])) {
                  rawIds.push(match[1]);
                }
              }
            }

            // ตรวจสอบทุกเพลงในลิสต์ คัดเฉพาะเพลงที่ไม่ติด Error 150 บนโดเมนจริง
            const checks = await Promise.all(
              rawIds.map(async (id) => ({
                id,
                ok: await checkVideoEmbeddable(id),
              }))
            );

            const playableIds = checks.filter((item) => item.ok).map((item) => item.id);
            resolve(playableIds.length > 0 ? playableIds : rawIds);
          });
        }
      )
      .on('error', () => resolve([]));
  });
}

function parseYouTubeUrl(url) {
  if (!url) return null;
  url = url.trim();

  const playlistMatch = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  const videoMatch = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|live\/|shorts\/))([a-zA-Z0-9_-]{11})/
  );

  if (playlistMatch && !playlistMatch[1].startsWith('RD')) {
    return {
      type: 'playlist',
      id: playlistMatch[1],
      firstVideoId: videoMatch ? videoMatch[1] : null,
    };
  }

  if (videoMatch) {
    return { type: 'video', id: videoMatch[1], videos: [videoMatch[1]] };
  }

  if (url.startsWith('PL') && url.length >= 15) {
    return { type: 'playlist', id: url, firstVideoId: null };
  }

  if (url.length === 11) {
    return { type: 'video', id: url, videos: [url] };
  }

  return null;
}

const app = express();
app.use(express.json());

function cliArg(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const HOST = cliArg('--host') || process.env.HOST || '127.0.0.1';
const PORT = Number(cliArg('--port') || process.env.PORT || 3002);

// ปิดการจำแคชสำหรับไฟล์ HTML และ JS เพื่อไม่ให้ Cloudflare/Safari จำโค้ดเก่า
app.use(
  express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html') || filePath.endsWith('.js')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      }
    },
  })
);

app.get('/change-bg-sound', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/music', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const saved = getSavedMusic();
  if (saved.type === 'playlist' && (!saved.videos || !saved.filtered)) {
    const videos = await fetchPlaylistVideoIds(saved.id);
    if (videos.length > 0) {
      saved.videos = videos;
      saved.filtered = true;
      fs.writeFileSync(MUSIC_FILE, JSON.stringify(saved, null, 2), 'utf8');
    }
  }
  res.json(saved);
});

app.post('/api/music/verify', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    return res.json({ success: true });
  }
  return res.status(401).json({ success: false, message: 'รหัสผ่านไม่ถูกต้อง' });
});

app.post('/api/music', async (req, res) => {
  const { password, url } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'รหัสผ่านไม่ถูกต้อง' });
  }

  const musicData = parseYouTubeUrl(url);
  if (!musicData) {
    return res.status(400).json({ success: false, message: 'ลิงก์หรือรหัส YouTube ไม่ถูกต้อง' });
  }

  if (musicData.type === 'playlist') {
    const videos = await fetchPlaylistVideoIds(musicData.id);
    if (videos.length > 0) {
      musicData.videos = videos;
      musicData.filtered = true;
    } else {
      return res.status(400).json({
        success: false,
        message: 'ไม่พบเพลงในเพลย์ลิสต์ที่อนุญาตให้เล่นนอกเว็บ',
      });
    }
  }

  fs.writeFileSync(MUSIC_FILE, JSON.stringify(musicData, null, 2), 'utf8');
  res.json({ success: true, music: musicData });
});

function currentState() {
  const diffMs = Date.now() - START_DATE;
  const started = diffMs > 0;
  const diffSecs = started ? Math.floor(diffMs / 1000) : 0;

  return {
    started,
    quote: MEMORY_QUOTE,
    days: Math.floor(diffSecs / 86400),
    hours: Math.floor(diffSecs / 3600) % 24,
    minutes: Math.floor(diffSecs / 60) % 60,
    secs: diffSecs % 60,
    distance: diffSecs * ORBIT_SPEED_KM_S,
  };
}

app.get('/api/state', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(currentState());
});

app.get('/api/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  const send = () => {
    res.write(`data: ${JSON.stringify(currentState())}\n\n`);
  };

  send();
  const timer = setInterval(send, 1000);
  req.on('close', () => clearInterval(timer));
});

app.listen(PORT, HOST, () => {
  console.log(`Deep Space server running at http://${HOST}:${PORT}`);
});