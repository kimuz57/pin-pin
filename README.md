# Deep Space — Count-up Scene

ฉากอวกาศ 3D ด้วย **Three.js** — ดวงอาทิตย์ขนาดยักษ์ (พื้นผิวแบบ procedural shader, โคโรนา, เปลวสุริยะ, ลมสุริยะ) และโลกเต็มดวง พร้อม**นาฬิกานับขึ้น**และระยะทางที่ระบบสุริยะเดินทาง

จุดเด่นของสถาปัตยกรรม:
- **เวลาจัดการที่ฝั่ง Server** แล้วส่งให้หน้าเว็บผ่าน **SSE** — จุดเริ่มต้น (start date) ไม่ถูกส่งลงไปในโค้ดฝั่ง client ทำให้เปิด F12 ก็แก้ต้นทางไม่ได้
- โค้ดฝั่ง client ถูก **obfuscate** (javascript-obfuscator) ก่อนนำไปเสิร์ฟ เพื่อให้อ่าน/แกะยาก แต่ยังรันบนเบราว์เซอร์ของผู้ใช้
- รูปภาพ texture ถูกย่อเป็น **1920x960 (Full HD)** เพื่อลดขนาดและภาระของ GPU

---

## ความต้องการของระบบ

- **Node.js** 18 ขึ้นไป (ทดสอบกับ v24)
- **Python 3 + Pillow** — ใช้เฉพาะตอน build รูปภาพ (`pip install Pillow`)

---

## โครงสร้างโปรเจกต์

```
server.js                 Express: เสิร์ฟ static + endpoint SSE (เวลาอยู่ที่นี่)
package.json

src/                      โค้ดต้นฉบับ (อ่านง่าย) — แก้ที่นี่เสมอ
  intext.html             หน้าเว็บ
  space3d.js              ซีน Three.js + shader ทั้งหมด
  ui.js                   รับค่าจาก SSE + อัปเดต DOM + ระบบเสียง

scripts/
  obfuscate.js            build: obfuscate src/*.js -> public/
  resize-textures.py      build: ย่อภาพ texture -> public/textures/

public/                   เอาต์พุตที่เสิร์ฟจริง (สร้างจาก build)
  index.html
  space3d.js              (obfuscated)
  ui.js                   (obfuscated)
  textures/               (1920x960)

textures/                 ภาพต้นฉบับความละเอียดสูง (8K/16K) — ใช้ตอน build
                          *ไม่ถูก commit ขึ้น git (ดู .gitignore)
```

---

## ติดตั้ง & รัน

```bash
npm install
npm start
```

เปิดเบราว์เซอร์ที่ **http://localhost:3000**

> ⚠️ ต้องรันผ่าน server เสมอ เพราะใช้ SSE ในการส่งเวลา — เปิดไฟล์ HTML แบบ static ตรง ๆ จะไม่ทำงาน

เปลี่ยนพอร์ตได้ผ่าน environment variable:

```bash
# PowerShell
$env:PORT=8080; npm start
```

---

## Build

```bash
npm run build       # รันทั้ง build:img และ build:js
npm run build:img   # ย่อภาพจาก textures/ -> public/textures/ (1920x960)
npm run build:js    # obfuscate src/*.js -> public/ พร้อมคัดลอก index.html
```

หลังแก้โค้ดใน `src/` หรือ `scripts/resize-textures.py` ให้รัน build แล้วรีสตาร์ท server

---

## เปลี่ยนวันเริ่มต้น

แก้ที่ `server.js`:

```js
const START_DATE = new Date('2025-07-24T21:38:00+07:00').getTime();
```

ค่านี้อยู่ฝั่ง server เท่านั้น ไม่ปรากฏในโค้ดที่ส่งไปเบราว์เซอร์

---

## API

| Endpoint | คำอธิบาย |
|---|---|
| `GET /api/state` | ค่าปัจจุบัน ณ ตอนนั้น (JSON) |
| `GET /api/events` | SSE stream ส่งค่าใหม่ทุก 1 วินาที |

ตัวอย่างข้อมูลที่ส่ง:

```json
{
  "started": true,
  "quote": "\"Wait for something special to happen.\"",
  "days": 444, "hours": 5, "minutes": 15, "secs": 3,
  "distance": 8827515690
}
```

`distance` เป็นกิโลเมตร คำนวณจากอัตรา 230 กม./วินาที (ความเร็วระบบสุริยะรอบทางช้างเผือก)

---

## หมายเหตุ

- **ความปลอดภัย**: เวลาที่แสดงคำนวณจากนาฬิกาของ server โดยสมบูรณ์ จึงไม่ขึ้นกับเวลาที่ผู้ใช้ตั้งในเครื่อง และตัวเลขวันเริ่มต้นไม่ถูกเปิดเผยในโค้ด client
- **ภาพต้นฉบับ**: โฟลเดอร์ `textures/` ไม่ถูก commit (ไฟล์ใหญ่) หากต้องการ build ภาพใหม่ ให้วางไฟล์ต้นฉบับไว้ใน `textures/` แล้วรัน `npm run build:img`
- **obfuscate**: การรัน `build:js` แต่ละครั้งจะได้ผลลัพธ์ไม่เหมือนเดิม (สุ่ม) แต่พฤติกรรมคงเดิม
