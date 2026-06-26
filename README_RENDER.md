# Deploy AI LUKY WhatsApp Bot ke Render - Startup Chrome Fix

ZIP ini memperbaiki error:

Browser was not found at the configured executablePath

Perbaikan:
- Chrome Puppeteer diinstall saat build.
- Chrome Puppeteer juga dicek/install ulang saat startup sebelum bot berjalan.
- Bot memakai PUPPETEER_EXECUTABLE_PATH otomatis dari file Chrome yang ditemukan.

## File yang harus diganti di GitHub

Ganti/timpa:
- package.json
- render.yaml
- .puppeteerrc.cjs
- src/index.js
- scripts/start-render.js
- README_RENDER.md

Atau paling aman: hapus isi repo lama lalu upload semua isi ZIP ini.

## Setting Render

Runtime:
Node

Build Command:
npm install && npm run install:chrome

Start Command:
npm start

Environment Variables:
PUPPETEER_CACHE_DIR=/opt/render/project/src/.cache/puppeteer
PUPPETEER_SKIP_DOWNLOAD=false

## Deploy ulang

Manual Deploy > Clear build cache & deploy

Setelah deploy sukses, buka:

https://NAMA-SERVICE.onrender.com/qr
