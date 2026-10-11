#!/usr/bin/env python3
"""Resize 8K texture maps -> 2048x1024 (2:1 2K) into public/textures/.

Usage:  python scripts/resize-textures.py
Original 8K masters in ./textures are NOT modified.
"""

import os
from PIL import Image

# อนุญาตให้อ่านภาพความละเอียดสูงมาก (เช่น 21600x10800) ได้
Image.MAX_IMAGE_PIXELS = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, "textures")
OUT_DIR = os.path.join(ROOT, "public", "textures")

TARGET_W, TARGET_H = 2048, 1024  # 2:1 equirectangular = 2K
QUALITY = 82

os.makedirs(OUT_DIR, exist_ok=True)

for name in sorted(os.listdir(SRC_DIR)):
    if not name.lower().endswith((".jpg", ".jpeg", ".png")):
        continue
    src = os.path.join(SRC_DIR, name)
    out = os.path.join(OUT_DIR, name)

    img = Image.open(src).convert("RGB")
    orig = img.size
    if img.width % 2 == 1:
        img = img.crop((0, 0, img.width - 1, img.height))

    resized = img.resize((TARGET_W, TARGET_H), Image.LANCZOS)
    resized.save(out, "JPEG", quality=QUALITY, optimize=True, progressive=True)

    print(f"{name}: {orig[0]}x{orig[1]} -> {TARGET_W}x{TARGET_H}  "
          f"({os.path.getsize(src) // 1024} KB -> {os.path.getsize(out) // 1024} KB)")

print("done.")