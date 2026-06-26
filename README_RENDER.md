# Cara Deploy AI LUKY WhatsApp Bot ke Render

## Upload ke GitHub

Upload isi folder ini ke repo GitHub. Jangan upload ZIP-nya saja.

File penting:
- package.json
- src/index.js
- render.yaml
- src/
- data/
- workflows/

## Setting Render

New > Web Service > pilih repo GitHub.

Gunakan:

Build Command:
npm install

Start Command:
npm start

Runtime:
Node

Plan:
Free

## Setelah deploy

Buka:

https://NAMA-SERVICE.onrender.com/qr

Scan QR WhatsApp.

## Catatan penting

Fitur yang memakai localhost di PC tidak otomatis jalan di Render:
- Ollama: http://127.0.0.1:11434
- Stable Diffusion / Forge: http://127.0.0.1:7860
- ComfyUI: http://127.0.0.1:8188

Agar fitur itu jalan di Render, alamatnya harus diganti ke server/API publik yang bisa diakses Render.

Render Free juga bisa sleep/restart, jadi session WhatsApp bisa hilang dan kadang perlu scan QR ulang.
