# AI LUKY WhatsApp Bot

Fitur:
- Nama bot default: AI LUKY
- Metadata sticker default: AI LUKY
- Balas chat pakai Ollama lokal
- Search internet otomatis kalau pertanyaan butuh info terbaru
- Memori per kontak di `data/memory.json`
- Generate gambar via Stable Diffusion WebUI/Forge API
- Buat sticker WhatsApp dari foto/GIF/video pendek
- Download MP3/video dengan yt-dlp untuk konten milik sendiri/berizin
- Analisis gambar/screenshot dengan `qwen3-vl:8b`

## 1. Install kebutuhan

### Node.js
Install Node.js LTS.

### Ollama
Install Ollama, lalu pull model:

```bash
ollama pull qwen3:4b
# opsional kalau mau yang lebih berat:
# ollama pull qwen3:8b
ollama pull qwen3-vl:8b
```

### yt-dlp + FFmpeg
Windows:

```powershell
winget install yt-dlp
winget install Gyan.FFmpeg
```

Cek:

```bash
yt-dlp --version
ffmpeg -version
```

### Stable Diffusion WebUI / Forge
Jalankan WebUI/Forge dengan API aktif.
Di `webui-user.bat`, isi contoh:

```bat
set COMMANDLINE_ARGS=--api
```

Lalu buka:

```text
http://127.0.0.1:7860/docs
```

Kalau docs muncul, API sudah aktif.

## 2. Install project

```bash
npm install
copy .env.example .env
npm start
```

Scan QR WhatsApp yang muncul di terminal. Default `.env` dan `.env.example` sudah memakai `BOT_NAME=AI LUKY`, `STICKER_AUTHOR=AI LUKY`, dan `STICKER_NAME=AI LUKY`. Prompt AI juga dikunci agar memakai gaya bahasa aku/kamu, bukan gua/lo.

## 3. Command bot

```text
!menu
!ai siapa kamu?
!search harga RTX 5060 terbaru
!img anime girl cyberpunk holding birthday cake
!sticker
!mp3 https://...
!video https://...
!lihat
!remember namaku Luky
!clear
```

## 4. Catatan penting

- Jangan spam kontak/grup.
- Fitur download hanya untuk konten milik sendiri, public domain, atau yang kamu punya izin.
- Instagram/Facebook/TikTok kadang butuh cookies/login dan bisa gagal. Jangan pakai untuk bypass konten private atau DRM.
- Kalau WhatsApp Web minta scan ulang, jalankan `npm start` lagi.
- Kalau `yt-dlp` tidak dikenali, restart terminal/PC atau pastikan PATH benar.


## Log PowerShell dan file

Versi ini menampilkan log chat dan error di PowerShell. File log juga otomatis dibuat:

```text
logs/chat.log   = chat masuk/keluar
logs/error.log  = detail error/stack trace
logs/app.log    = status bot, search, download, generate image
```

Kalau ada error, kirim isi bagian terbaru dari `logs/error.log` supaya mudah dicek.


## Update persona AI LUKY

Versi ini sudah mengunci persona agar model menjawab sebagai **AI LUKY** dan memakai bahasa **aku/kamu**. Kalau sebelumnya masih muncul nama lama, hapus/replace file `.env` lama dengan file `.env` dari ZIP ini, lalu restart bot.

```powershell
CTRL + C
copy .env.example .env
npm.cmd start
```


## Fitur tambahan: convert sticker jadi foto

Balas/reply sticker WhatsApp dengan command `!img` tanpa prompt. Bot akan mengubah sticker WEBP menjadi foto PNG dan mengirimnya kembali.

Catatan: untuk sticker animasi, hasil foto biasanya memakai frame pertama.


Fitur baru: kirim gambar dengan caption pertanyaan, atau reply gambar lalu ketik pertanyaan biasa (tanpa !lihat), maka AI otomatis menganalisis gambar.


Catatan: fitur ubah sticker ke foto membutuhkan package `sharp`. Jalankan `npm.cmd install` setelah extract ZIP ini.


## Memori per ruang chat
Memori dipisah per grup/kontak. Gunakan `!scope` untuk melihat ruang aktif, `!memori` untuk melihat memori ruang ini, dan `!clearobrolan` untuk reset konteks ruang ini.
