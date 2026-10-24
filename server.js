// server.js — เสิร์ฟหน้าเว็บ + จัดการนับเวลา/ระยะทางผ่าน SSE + ดึงรายการเพลงจาก Playlist
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
  return { type: 'video', id: 'tGv7CUutzqU', videos: ['tGv7CUutzqU'] };
}

// ดึงรหัส Video ID ทั้งหมดจากหน้า Playlist ของ YouTube
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
          res.on('end', () => {
            // ดึง videoId เฉพาะที่อยู่ในโครงสร้าง playlistVideoRenderer
            const regex = /"playlistVideoRenderer":\{"videoId":"([a-zA-Z0-9_-]{11})"/g;
            const ids = [];
            let match;
            while ((match = regex.exec(html)) !== null) {
              if (!ids.includes(match[1])) {
                ids.push(match[1]);
              }
            }
            // Fallback หากโครงสร้างหน้าเว็บเปลี่ยน
            if (ids.length === 0) {
              const fallbackRegex = /"videoId":"([a-zA-Z0-9_-]{11})"/g;
              while ((match = fallbackRegex.exec(html)) !== null) {
                if (!ids.includes(match[1])) {
                  ids.push(match[1]);
                }
              }
            }
            resolve(ids);
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
const HOST = cliArg('--host') || process.env.HOST || '0.0.0.0';
const PORT = Number(cliArg('--port') || process.env.PORT || 3002);

app.use(
  express.static(path.join(__dirname, 'public'), {
    maxAge: '1h',
    immutable: false,
  })
);

app.get('/change-bg-sound', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/music', async (req, res) => {
  const saved = getSavedMusic();
  // ถ้าเป็น playlist ที่ยังไม่มีรายการ videos ให้ดึงให้อัตโนมัติ
  if (saved.type === 'playlist' && (!saved.videos || saved.videos.length === 0)) {
    const videos = await fetchPlaylistVideoIds(saved.id);
    if (videos.length > 0) {
      saved.videos = videos;
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

  // ถ้าเป็น Playlist ให้ดึง Video ID ทุกเพลงในเพลย์ลิสต์มาเก็บไว้เลย
  if (musicData.type === 'playlist') {
    const videos = await fetchPlaylistVideoIds(musicData.id);
    if (videos.length > 0) {
      musicData.videos = videos;
    } else if (musicData.firstVideoId) {
      musicData.videos = [musicData.firstVideoId];
    } else {
      return res.status(400).json({
        success: false,
        message: 'ไม่พบเพลงในเพลย์ลิสต์นี้ (ตรวจสอบว่าตั้งเป็นสาธารณะหรือไม่เป็นสาธารณะแล้ว)',
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