Taruh file workflow API ComfyUI di folder ini.

Nama wajib default:
animatediff-api.json

Cara membuat:
1. Buka ComfyUI http://127.0.0.1:8188
2. Buat workflow AnimateDiff sampai bisa Run dan keluar MP4.
3. Export/Save workflow dalam format API.
4. Simpan/copy file itu ke:
   E:\lywbu-wa-ai-bot\workflows\animatediff-api.json

Bot command:
!animasi mobil besar melaju kencang di jalan tol malam hari
!animasi orang berjalan pelan di trotoar, cinematic

Catatan:
- Bot otomatis mengganti prompt, width, height, frames, fps, steps, cfg jika node-nya terdeteksi.
- Kalau prompt tidak terganti benar, isi ID node di .env:
  COMFY_POSITIVE_NODE=
  COMFY_NEGATIVE_NODE=
