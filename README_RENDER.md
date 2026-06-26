# Deploy AI LUKY WhatsApp Bot ke Render - executablePath Fix

ZIP ini memperbaiki error:

Could not find Chrome

Perbaikan:
- package.json memakai postinstall: npx puppeteer install chrome@stable
- render.yaml memakai buildCommand: npm install && npx puppeteer install chrome@stable
- src/index.js memakai executablePath dari puppeteer.executablePath()
- .puppeteerrc.cjs mengatur cache Chrome ke folder project

## Setting Render

Runtime:
Node

Build Command:
npm install && npx puppeteer install chrome@stable

Start Command:
npm start

Environment Variables:
PUPPETEER_CACHE_DIR=/opt/render/project/src/.cache/puppeteer
PUPPETEER_SKIP_DOWNLOAD=false

## Setelah upload ke GitHub

Klik:
Manual Deploy > Clear build cache & deploy

Buka:
https://NAMA-SERVICE.onrender.com/qr

## Catatan

Upload isi hasil extract ke GitHub, bukan ZIP-nya saja.
