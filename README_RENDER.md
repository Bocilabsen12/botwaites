# Deploy AI LUKY WhatsApp Bot ke Render - Chrome Fix

ZIP ini sudah ditambah fix untuk error:

Could not find Chrome

## Upload ke GitHub

Upload SEMUA isi folder hasil extract ke GitHub, bukan ZIP-nya saja.

File penting:
- package.json
- render.yaml
- .puppeteerrc.cjs
- src/index.js
- src/
- data/
- workflows/

## Setting Render

New > Web Service > pilih repo GitHub.

Gunakan:

Runtime:
Node

Build Command:
npm install && npx puppeteer browsers install chrome

Start Command:
npm start

Plan:
Free

Environment Variable:
PUPPETEER_CACHE_DIR=/opt/render/project/src/.cache/puppeteer

## Deploy ulang

Kalau sebelumnya sudah deploy dan error Chrome:

Manual Deploy > Clear build cache & deploy

## Setelah deploy

Buka:

https://NAMA-SERVICE.onrender.com/qr

Scan QR WhatsApp.

## Catatan penting

Render Free bisa sleep/restart. Bot WA bisa putus dan kadang perlu scan QR ulang.

Fitur lokal seperti Ollama, ComfyUI, dan Stable Diffusion di PC tidak otomatis jalan di Render kalau masih pakai 127.0.0.1/localhost.
