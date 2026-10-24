# Deep Space Wait

เว็บแอป 3D แบบนับเวลา (count-up) ที่แสดงฉากอวกาศพร้อมดวงอาทิตย์ โลก และนาฬิกานับขึ้นจากเวลาที่กำหนดไว้

## คุณสมบัติหลัก

- **เวลาจากฝั่งเซิร์ฟเวอร์** - คำนวณเวลานับขึ้นจาก `START_DATE` ที่เซิร์ฟเวอร์ และส่งผ่าน Server-Sent Events (SSE) `/api/events`
- **ฉาก 3D ด้วย Three.js** - แสดงดวงอาทิตย์พร้อม shader (corona, solar flare, solar wind), โลก, ดาว, และแสงอันน่าทึ่ง
- **ระบบเสียงจาก YouTube** - เล่นเพลงพื้นหลังจาก YouTube (รองรับทั้ง single video และ playlist) สามารถเปลี่ยนได้ผ่านหน้า `/change-bg-sound`
- **ความปลอดภัย** - เวลาที่แสดงคำนวณจากนาฬิกาเซิร์ฟเวอร์เท่านั้น ไม่ขึ้นกับเวลาของผู้ใช้ และเวลาเริ่มต้นไม่ถูกเปิดเผยในโค้ดฝั่ง client
- **โค้ดถูก obfuscate** - ไฟล์ JS ใน `src/` จะถูก obfuscate ก่อนเสิร์ฟที่ `public/`
- **Texture ถูกปรับขนาด** - รูป texture จะถูก resize เป็น 2048x1024 เพื่อลดภาระ GPU

## เทคโนโลยีที่ใช้

- **Backend:** Node.js + Express.js
- **Frontend:** Three.js (r128) + vanilla JavaScript
- **Build Tools:** javascript-obfuscator, Python + Pillow
- **Realtime:** Server-Sent Events (SSE)

## โครงสร้างโปรเจกต์

```text
deep-space-wait/
├── server.js              # เซิร์ฟเวอร์ Express, SSE, API เพลง, คำนวณเวลา
├── package.json           # Dependencies และ scripts
├── music.json             # การตั้งค่าเพลงปัจจุบัน
├── src/                   # โค้ดต้นฉบับ (แก้ไขที่นี่)
│   ├── intext.html        # HTML หลัก
│   ├── space3d.js         # ฉาก Three.js + shaders
│   └── ui.js              # UI, SSE client, ระบบเสียง YouTube
├── scripts/               # สคริปต์สำหรับ build
│   ├── obfuscate.js       # Obfuscate ไฟล์ JS
│   └── resize-textures.py # Resize texture เป็น 2K
├── public/                # ไฟล์ที่เสิร์ฟจริง (สร้างจาก build)
│   ├── index.html
│   ├── space3d.js         # (obfuscated)
│   ├── ui.js              # (obfuscated)
│   └── textures/          # Texture 2048x1024
└── textures/              # Texture ต้นฉบับความละเอียดสูง (ไม่ commit)
```

## การติดตั้งและรัน

### ความต้องการระบบ

- Node.js 18 ขึ้นไป
- Python 3 + Pillow (สำหรับ build texture)

### ติดตั้ง

```bash
npm install
pip install Pillow  # ถ้ายังไม่ได้ติดตั้ง
```

### รันเซิร์ฟเวอร์

```bash
npm start
```

เปิดเบราว์เซอร์ที่ [http://127.0.0.1:3002](http://127.0.0.1:3002)

> **หมายเหตุ:** ต้องรันผ่านเซิร์ฟเวอร์เท่านั้น เพราะใช้ SSE สำหรับส่งเวลา

สามารถเปลี่ยน host/port ได้:

```bash
# ผ่าน CLI arguments
npm start -- --host 0.0.0.0 --port 8080

# ผ่าน environment variables (PowerShell)
$env:PORT=8080; npm start
```

## Build

แก้ไขไฟล์ใน `src/` แล้วต้อง build ก่อน:

```bash
npm run build       # Build ทั้ง texture และ JS
npm run build:img   # Resize texture จาก textures/ -> public/textures/
npm run build:js    # Obfuscate src/*.js -> public/ และคัดลอก HTML
```

## การตั้งค่า

### เปลี่ยนวันที่เริ่มต้น

แก้ไขใน `server.js` บรรทัด 7:

```js
const START_DATE = new Date('2025-07-24T21:38:00+07:00').getTime();
```

ค่านี้อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น ไม่ถูกส่งไปยัง client

### เปลี่ยนเพลงพื้นหลัง

1. เปิด [http://127.0.0.1:3002/change-bg-sound](http://127.0.0.1:3002/change-bg-sound)
2. ใส่รหัสผ่าน (ดูที่ `ADMIN_PASSWORD` ใน `server.js`)
3. วางลิงก์ YouTube Video หรือ Playlist
4. กด Apply & Play

ระบบจะกรองอัตโนมัติว่าเพลงนั้นเล่นบนเว็บได้หรือไม่

## API Endpoints

| Endpoint | Method | คำอธิบาย |
| --- | --- | --- |
| `/api/state` | GET | สถานะปัจจุบัน (JSON) - ไม่ cache |
| `/api/events` | GET | SSE stream ส่งสถานะทุก 1 วินาที |
| `/api/music` | GET | ดึงข้อมูลเพลงปัจจุบัน |
| `/api/music/verify` | POST | ยืนยันรหัสผ่านสำหรับเปลี่ยนเพลง |
| `/api/music` | POST | เปลี่ยนเพลง (ต้องยืนยันรหัสผ่าน) |
| `/change-bg-sound` | GET | หน้าเปลี่ยนเพลง |

### ตัวอย่างข้อมูล `/api/state`

```json
{
  "started": true,
  "quote": "\"Wait for something special to happen.\"",
  "days": 444,
  "hours": 5,
  "minutes": 15,
  "secs": 3,
  "distance": 8827515690
}
```

`distance` คำนวณจากความเร็ว 230 กม./วินาที (ความเร็วของระบบสุริยะรอบศูนย์กลางทางช้างเผือก)

## หมายเหตุ

- **Cache Control** - เซิร์ฟเวอร์ตั้ง `no-store` สำหรับไฟล์ HTML, JS และ API เพื่อป้องกัน browser cache
- **Texture ต้นฉบับ** - โฟลเดอร์ `textures/` ไม่ถูก commit ขึ้น git (ดู `.gitignore`) ให้วางไฟล์ต้นฉบับไว้ที่นั่นก่อน build
- **Obfuscation** - แต่ละครั้งที่รัน `npm run build:js` จะได้โค้ด obfuscated ที่แตกต่างกัน แต่พฤติกรรมยังคงเหมือนเดิม
- **YouTube Embedding** - ระบบจะตรวจสอบว่า video นั้นสามารถ embed บนเว็บภายนอกได้หรือไม่ (กรองช่องที่มีข้อจำกัด)
