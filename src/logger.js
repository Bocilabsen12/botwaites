import fs from 'fs-extra';
import path from 'path';

const ROOT = process.cwd();
const LOG_DIR = path.join(ROOT, 'logs');
const ERROR_LOG = path.join(LOG_DIR, 'error.log');
const CHAT_LOG = path.join(LOG_DIR, 'chat.log');
const APP_LOG = path.join(LOG_DIR, 'app.log');

function time() {
  return new Date().toISOString();
}

function clean(value) {
  if (value === undefined || value === null) return '';
  if (value instanceof Error) {
    return value.stack || value.message || String(value);
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function oneLine(value, max = 500) {
  const text = clean(value).replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max) + '...' : text;
}

async function append(file, line) {
  await fs.ensureDir(LOG_DIR);
  await fs.appendFile(file, line + '\n', 'utf8');
}

export async function initLogger() {
  await fs.ensureDir(LOG_DIR);
  await append(APP_LOG, `\n===== BOT START ${time()} =====`);
}

export async function logInfo(message, meta = null) {
  const line = `[${time()}] INFO ${message}${meta ? ' ' + oneLine(meta, 1200) : ''}`;
  console.log(line);
  await append(APP_LOG, line);
}

export async function logChat(direction, data = {}) {
  const icon = direction === 'in' ? '📩 IN ' : '📤 OUT';
  const fromTo = data.from || data.to || '-';
  const body = oneLine(data.body || data.caption || data.type || '', 1000);
  const command = data.command ? ` cmd=${data.command}` : '';
  const media = data.hasMedia ? ' media=true' : '';
  const line = `[${time()}] ${icon} ${fromTo}${command}${media} :: ${body}`;
  console.log(line);
  await append(CHAT_LOG, line);
}

export async function logError(error, context = {}) {
  const errText = clean(error);
  const short = oneLine(error?.message || error, 700);
  const line = `[${time()}] ❌ ERROR ${context.command ? 'cmd=' + context.command + ' ' : ''}${context.from ? 'from=' + context.from + ' ' : ''}${short}`;
  console.error(line);
  await append(APP_LOG, line);
  await append(ERROR_LOG, `${line}\nContext: ${clean(context)}\n${errText}\n---`);
}

export function getLogPaths() {
  return { LOG_DIR, CHAT_LOG, ERROR_LOG, APP_LOG };
}
