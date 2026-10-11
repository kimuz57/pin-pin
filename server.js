// server.js — เสิร์ฟหน้าเว็บ + จัดการนับเวลา/ระยะทางผ่าน SSE
// จุดเริ่มต้น (start date) อยู่ที่นี่เท่านั้น ไม่ถูกส่งลงไปในโค้ดฝั่ง client

const path = require('path');
const express = require('express');

// -------------------------------------------------------------
// ตั้งค่า: เปลี่ยนวันเริ่มต้นความทรงจำได้ที่นี่ (รูปแบบ ISO 8601 + timezone)
// -------------------------------------------------------------
const START_DATE = new Date('2025-07-24T21:38:00+07:00').getTime();
const MEMORY_QUOTE = '"Wait for something special to happen."';
const ORBIT_SPEED_KM_S = 230; // ความเร็วระบบสุริยะรอบทางช้างเผือก (กม./วินาที)

const app = express();

// host/port: ใช้ CLI arg ก่อน -> env -> ค่า default (127.0.0.1:3002)
function cliArg(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
const HOST = cliArg('--host') || process.env.HOST || '127.0.0.1';
const PORT = Number(cliArg('--port') || process.env.PORT || 3002);

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h',
  immutable: false
}));

// -------------------------------------------------------------
// คำนวณค่าปัจจุบัน (ฝั่ง server เป็นตัวกำหนดเวลา ไม่พึ่งนาฬิกา client)
// -------------------------------------------------------------
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
    distance: diffSecs * ORBIT_SPEED_KM_S
  };
}

// -------------------------------------------------------------
// REST: ดึงค่า ณ ตอนนี้ (ใช้ตอนโหลด / สำรอง SSE ได้)
// -------------------------------------------------------------
app.get('/api/state', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(currentState());
});

// -------------------------------------------------------------
// SSE: server push ค่าใหม่ทุก 1 วินาที
// -------------------------------------------------------------
app.get('/api/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
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