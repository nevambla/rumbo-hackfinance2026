// Invoice photo attachments.
// Files live on disk (UPLOAD_DIR, default server/uploads) and an index.json maps
// invoice id -> attachment metadata, so photos survive `node --watch` restarts.
import { mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const INDEX = path.join(UPLOAD_DIR, 'index.json');

export const MAX_BYTES = 10 * 1024 * 1024;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif' };
export const ALLOWED_TYPES = Object.keys(EXT);

mkdirSync(UPLOAD_DIR, { recursive: true });
let index = existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, 'utf8')) : {};
const save = () => writeFileSync(INDEX, JSON.stringify(index, null, 2));

/** Check the magic bytes so a renamed non-image is rejected. */
function looksLikeImage(buf, type) {
  if (buf.length < 12) return false;
  const hex = buf.subarray(0, 12).toString('hex');
  if (type === 'image/jpeg') return hex.startsWith('ffd8ff');
  if (type === 'image/png') return hex.startsWith('89504e47');
  if (type === 'image/gif') return hex.startsWith('47494638');
  if (type === 'image/webp') return hex.startsWith('52494646') && buf.subarray(8, 12).toString() === 'WEBP';
  if (type === 'image/heic' || type === 'image/heif') return buf.subarray(4, 8).toString() === 'ftyp';
  return false;
}

export function list(invoiceId) {
  return (index[invoiceId] || []).map(publicView);
}

function publicView(a) {
  return { id: a.id, name: a.name, type: a.type, size: a.size, uploaded_at: a.uploaded_at, url: `/api/attachments/${a.id}` };
}

export function add(invoiceId, buffer, type, name) {
  if (!ALLOWED_TYPES.includes(type)) throw new Error('Solo se pueden adjuntar imágenes (JPG, PNG, WEBP, GIF o HEIC)');
  if (!buffer?.length) throw new Error('El archivo está vacío');
  if (buffer.length > MAX_BYTES) throw new Error('La foto supera los 10 MB');
  if (!looksLikeImage(buffer, type)) throw new Error('El archivo no parece una imagen válida');
  const id = randomUUID();
  const file = `${id}.${EXT[type]}`;
  writeFileSync(path.join(UPLOAD_DIR, file), buffer);
  const meta = { id, file, name: String(name || `foto.${EXT[type]}`).slice(0, 120), type, size: buffer.length, uploaded_at: new Date().toISOString() };
  (index[invoiceId] ||= []).push(meta);
  save();
  return publicView(meta);
}

/** Find an attachment by id across invoices (ids are UUIDs, never paths). */
export function find(attachmentId) {
  for (const [invoiceId, items] of Object.entries(index)) {
    const a = items.find((x) => x.id === attachmentId);
    if (a) return { invoiceId, ...a, path: path.join(UPLOAD_DIR, a.file) };
  }
  return null;
}

export function remove(invoiceId, attachmentId) {
  const items = index[invoiceId] || [];
  const a = items.find((x) => x.id === attachmentId);
  if (!a) throw new Error('Foto no encontrada');
  index[invoiceId] = items.filter((x) => x.id !== attachmentId);
  if (!index[invoiceId].length) delete index[invoiceId];
  save();
  try { unlinkSync(path.join(UPLOAD_DIR, a.file)); } catch { /* already gone */ }
  return { ok: true };
}

/** Demo reset: drop every photo. */
export function reset() {
  rmSync(UPLOAD_DIR, { recursive: true, force: true });
  mkdirSync(UPLOAD_DIR, { recursive: true });
  index = {};
  save();
}
