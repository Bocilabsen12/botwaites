const express = require("express");
const qrcode = require("qrcode");
const axios = require("axios");
const cheerio = require("cheerio");
const { Client, LocalAuth } = require("whatsapp-web.js");

const app = express();
const PORT = process.env.PORT || 3000;

let lastQR = null;
let botStatus = "starting";
let startTime = Date.now();

app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Bot WhatsApp Render</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; background:#111; color:#eee; }
          .card { max-width: 600px; margin:auto; background:#1d1d1d; padding:20px; border-radius:16px; }
          a { color:#4da3ff; }
          code { background:#333; padding:3px 6px; border-radius:6px; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Bot WhatsApp Aktif</h2>
          <p>Status: <b>${botStatus}</b></p>
          <p>Uptime: ${Math.floor((Date.now() - startTime) / 1000)} detik</p>
          <p>Kalau belum login, buka <a href="/qr">/qr</a> untuk scan QR.</p>
          <p>Test command di WhatsApp: <code>!ping</code></p>
        </div>
      </body>
    </html>
  `);
});

app.get("/qr", async (req, res) => {
  try {
    if (!lastQR) {
      return res.send(`
        <html>
          <head>
            <title>QR Bot WA</title>
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; background:#111; color:#eee; }
              .card { max-width: 600px; margin:auto; background:#1d1d1d; padding:20px; border-radius:16px; }
              a { color:#4da3ff; }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>QR belum tersedia / bot sudah login</h2>
              <p>Status: <b>${botStatus}</b></p>
              <p>Kembali ke <a href="/">halaman utama</a>.</p>
            </div>
          </body>
        </html>
      `);
    }

    const qrImage = await qrcode.toDataURL(lastQR);
    res.send(`
      <html>
        <head>
          <title>Scan QR Bot WA</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; background:#111; color:#eee; text-align:center; }
            .card { max-width: 600px; margin:auto; background:#1d1d1d; padding:20px; border-radius:16px; }
            img { width: 280px; max-width: 100%; background:white; padding:10px; border-radius:12px; }
            a { color:#4da3ff; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Scan QR WhatsApp</h2>
            <img src="${qrImage}" />
            <p>Buka WhatsApp &gt; Perangkat tertaut &gt; Tautkan perangkat.</p>
            <p>Status: <b>${botStatus}</b></p>
            <p><a href="/">Kembali</a></p>
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send("Gagal membuat QR: " + err.message);
  }
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    status: botStatus,
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000)
  });
});

app.listen(PORT, () => {
  console.log("Web server jalan di port:", PORT);
});

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: "bot-wa-render"
  }),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
      "--no-zygote",
      "--single-process"
    ]
  }
});

client.on("qr", (qr) => {
  lastQR = qr;
  botStatus = "need_scan";
  console.log("QR tersedia. Buka URL Render kamu lalu /qr");
});

client.on("authenticated", () => {
  botStatus = "authenticated";
  console.log("WhatsApp authenticated");
});

client.on("ready", () => {
  lastQR = null;
  botStatus = "ready";
  console.log("Bot WhatsApp siap!");
});

client.on("auth_failure", (msg) => {
  botStatus = "auth_failure";
  console.log("Auth gagal:", msg);
});

client.on("disconnected", (reason) => {
  botStatus = "disconnected";
  console.log("Bot terputus:", reason);
});

// Fungsi search internet sederhana.
// Catatan: ini scraping ringan, bisa berubah sewaktu-waktu.
async function cariInternet(query) {
  try {
    const url = "https://duckduckgo.com/html/?q=" + encodeURIComponent(query);
    const { data } = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      },
      timeout: 15000
    });

    const $ = cheerio.load(data);
    const results = [];

    $(".result").each((i, el) => {
      if (i >= 5) return;
      const title = $(el).find(".result__title").text().trim().replace(/\s+/g, " ");
      const link = $(el).find(".result__a").attr("href");
      const snippet = $(el).find(".result__snippet").text().trim().replace(/\s+/g, " ");

      if (title) {
        results.push({
          title,
          link,
          snippet
        });
      }
    });

    if (results.length === 0) return "Tidak menemukan hasil.";

    return results.map((r, i) => {
      return `${i + 1}. ${r.title}\n${r.snippet || "-"}\n${r.link || ""}`;
    }).join("\n\n");
  } catch (err) {
    return "Gagal search internet: " + err.message;
  }
}

client.on("message", async (msg) => {
  try {
    const body = msg.body || "";
    const text = body.trim();
    const lower = text.toLowerCase();

    if (lower === "!ping") {
      return msg.reply("pong ✅");
    }

    if (lower === "!menu") {
      return msg.reply(
`🤖 Menu Bot WA

!ping
Cek bot hidup.

!menu
Lihat menu.

!status
Cek status bot.

!cari <kata kunci>
Cari informasi di internet.

Contoh:
!cari harga rtx 5060`
      );
    }

    if (lower === "!status") {
      return msg.reply(`Status bot: ${botStatus}\nUptime: ${Math.floor((Date.now() - startTime) / 1000)} detik`);
    }

    if (lower.startsWith("!cari ")) {
      const query = text.slice(6).trim();
      if (!query) return msg.reply("Masukkan kata kunci.\nContoh: !cari harga rtx 5060");

      await msg.reply("Mencari sebentar...");
      const hasil = await cariInternet(query);
      return msg.reply(hasil.slice(0, 3500));
    }

  } catch (err) {
    console.error("Error handle message:", err);
    try {
      await msg.reply("Terjadi error: " + err.message);
    } catch {}
  }
});

client.initialize();
