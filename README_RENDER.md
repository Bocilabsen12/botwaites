# Deploy AI LUKY WhatsApp Bot ke Render - Puppeteer Install Fix

ZIP ini sudah memperbaiki error build Render karena command Puppeteer salah.

## Setting Render

Runtime:
Node

Build Command:
npm install && npx puppeteer install chrome

Start Command:
npm start

Plan:
Free

Environment Variable:
PUPPETEER_CACHE_DIR=/opt/render/project/src/.cache/puppeteer

## Setelah upload ke GitHub

Di Render klik:

Manual Deploy > Clear build cache & deploy

Lalu buka:

https://NAMA-SERVICE.onrender.com/qr

## Catatan

Upload isi hasil extract ke GitHub, bukan ZIP-nya saja.
Render Free bisa sleep/restart, jadi bot WA kadang perlu scan QR ulang.
