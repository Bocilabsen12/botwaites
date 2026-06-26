# Bot WhatsApp Render

Bot WhatsApp Node.js menggunakan `whatsapp-web.js`, Express, QR via browser, dan command dasar.

## Fitur

- `/` halaman status bot
- `/qr` halaman scan QR WhatsApp
- `/health` cek status JSON
- Command WhatsApp:
  - `!ping`
  - `!menu`
  - `!status`
  - `!cari <kata kunci>`

## Jalankan di PC

```bash
npm install
npm start
```

Buka:

```text
http://localhost:3000/qr
```

Scan QR dari WhatsApp.

## Deploy ke Render

1. Upload semua file ke GitHub.
2. Masuk Render.
3. Pilih **New > Web Service**.
4. Connect repo GitHub.
5. Isi:

```text
Build Command: npm install
Start Command: npm start
```

6. Deploy.
7. Setelah selesai, buka:

```text
https://nama-service.onrender.com/qr
```

## Penting

Render Free bisa sleep dan session WhatsApp bisa hilang saat restart/redeploy.
Kalau bot sering minta scan QR ulang, itu normal di hosting free.

Untuk bot WA 24 jam lebih stabil, gunakan VPS seperti Oracle Cloud Free Tier.
