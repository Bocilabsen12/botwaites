export function getTimeText() {
  const timezone = process.env.TIMEZONE || 'Asia/Jakarta';
  const now = new Date();

  const longDate = new Intl.DateTimeFormat('id-ID', {
    timeZone: timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(now);

  const time = new Intl.DateTimeFormat('id-ID', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short'
  }).format(now);

  return `🕒 Sekarang: ${time}
📅 Hari/Tanggal: ${longDate}
🌏 Zona waktu: ${timezone}`;
}
