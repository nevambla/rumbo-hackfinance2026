// Client-side photo handling: phone photos are 3–8 MB, so we downscale to
// ≤1600px JPEG before uploading. Formats the browser can't decode (e.g. HEIC
// outside Safari) and GIFs are uploaded as-is.
const MAX_SIDE = 1600;
const QUALITY = 0.82;

export const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif';

export async function prepareImage(file) {
  if (!file.type.startsWith('image/')) throw new Error(`"${file.name}" no es una imagen`);
  if (file.type === 'image/gif') return { blob: file, name: file.name };
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024 && file.type !== 'image/heic') return { blob: file, name: file.name };
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob) return { blob: file, name: file.name };
    return { blob, name: file.name.replace(/\.[^.]+$/, '') + '.jpg' };
  } catch {
    return { blob: file, name: file.name };
  }
}

export async function uploadPhoto(invoiceId, file) {
  const { blob, name } = await prepareImage(file);
  const r = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}/attachments`, {
    method: 'POST',
    headers: { 'Content-Type': blob.type || file.type, 'X-File-Name': encodeURIComponent(name) },
    body: blob,
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 413) throw new Error(`"${name}" es demasiado grande (máx. 10 MB)`);
  if (!r.ok) throw new Error(data.error || `No se pudo subir "${name}"`);
  return data;
}

export async function deletePhoto(invoiceId, attachmentId) {
  const r = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}/attachments/${attachmentId}`, { method: 'DELETE' });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'No se pudo borrar la foto');
  return data;
}

export const fileSize = (bytes) => (bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);
