import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { Spinner } from './ui.jsx';
import { ACCEPT, uploadPhoto, deletePhoto, fileSize } from '../lib/images.js';

/** Full-screen viewer: arrows / Esc on keyboard, delete with confirmation. */
export function Lightbox({ photos, index, onClose, onIndex, onDelete, title }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const closeRef = useRef(null);
  const photo = photos[index];

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && photos.length > 1) onIndex((index + 1) % photos.length);
      if (e.key === 'ArrowLeft' && photos.length > 1) onIndex((index - 1 + photos.length) % photos.length);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [index, photos.length, onClose, onIndex]);

  useEffect(() => setConfirming(false), [index]);
  if (!photo) return null;

  const remove = async () => {
    if (!confirming) return setConfirming(true);
    setDeleting(true);
    try { await onDelete(photo); } finally { setDeleting(false); setConfirming(false); }
  };

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={`Foto de ${title}`} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lightbox-bar">
        <div className="lightbox-title">
          <strong>{title}</strong>
          <span>{photo.name} · {fileSize(photo.size)}{photos.length > 1 && ` · ${index + 1} de ${photos.length}`}</span>
        </div>
        <a className="btn small" href={photo.url} download={photo.name}>Descargar</a>
        {onDelete && (
          <button className={`btn small ${confirming ? 'danger' : ''}`} onClick={remove} disabled={deleting}>
            {deleting ? <Spinner /> : <Icon name="trash" size={14} />}{confirming ? '¿Borrar?' : 'Borrar'}
          </button>
        )}
        <button ref={closeRef} className="btn small ghost" onClick={onClose} aria-label="Cerrar"><Icon name="x" size={18} /></button>
      </div>
      <figure className="lightbox-stage">
        <img key={photo.id} src={photo.url} alt={photo.name} />
      </figure>
      {photos.length > 1 && (
        <>
          <button className="lightbox-nav prev" onClick={() => onIndex((index - 1 + photos.length) % photos.length)} aria-label="Anterior"><Icon name="chevronLeft" size={22} /></button>
          <button className="lightbox-nav next" onClick={() => onIndex((index + 1) % photos.length)} aria-label="Siguiente"><Icon name="chevronRight" size={22} /></button>
        </>
      )}
    </div>
  );
}

const MAX_THUMBS = 2;

/** Thumbnails + "add photo" for one invoice. Uploads immediately. */
export default function InvoicePhotos({ invoice, onChanged, notify }) {
  const [uploading, setUploading] = useState(0);
  const [open, setOpen] = useState(null);
  const inputRef = useRef(null);
  const photos = invoice.attachments || [];

  const onFiles = async (files) => {
    const list = [...files];
    if (!list.length) return;
    setUploading((n) => n + list.length);
    let ok = 0;
    for (const f of list) {
      try { await uploadPhoto(invoice.id, f); ok++; }
      catch (e) { notify?.(e.message, 'error'); }
      finally { setUploading((n) => n - 1); }
    }
    if (inputRef.current) inputRef.current.value = '';
    if (ok) { await onChanged?.(); notify?.(ok === 1 ? `Foto añadida a ${invoice.id}` : `${ok} fotos añadidas a ${invoice.id}`); }
  };

  const onDelete = async (photo) => {
    try {
      await deletePhoto(invoice.id, photo.id);
      await onChanged?.();
      notify?.('Foto borrada');
      const remaining = photos.length - 1;
      setOpen(remaining ? Math.min(open, remaining - 1) : null);
    } catch (e) { notify?.(e.message, 'error'); }
  };

  return (
    <div className="photos">
      {photos.slice(0, MAX_THUMBS).map((p, i) => (
        <button key={p.id} className="thumb" onClick={() => setOpen(i)} aria-label={`Ver ${p.name}`}>
          <img src={p.url} alt="" loading="lazy" />
        </button>
      ))}
      {photos.length > MAX_THUMBS && (
        <button className="thumb more" onClick={() => setOpen(MAX_THUMBS)} aria-label={`Ver ${photos.length - MAX_THUMBS} fotos más`}>
          +{photos.length - MAX_THUMBS}
        </button>
      )}
      {Array.from({ length: uploading }, (_, i) => <span key={`u${i}`} className="thumb uploading" aria-label="Subiendo foto"><Spinner /></span>)}
      <label className="thumb add" title="Adjuntar fotos">
        <Icon name="camera" size={16} />
        <span className="sr-only">Adjuntar fotos a {invoice.id}</span>
        <input ref={inputRef} type="file" accept={ACCEPT} multiple onChange={(e) => onFiles(e.target.files)} />
      </label>
      {open !== null && photos[open] && (
        <Lightbox photos={photos} index={open} onIndex={setOpen} onClose={() => setOpen(null)} onDelete={onDelete} title={`Factura ${invoice.id}`} />
      )}
    </div>
  );
}

/** Local picker used before the invoice exists (new-invoice form). */
export function PendingPhotos({ files, onChange }) {
  const [previews, setPreviews] = useState([]);
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  return (
    <div className="group">
      <span className="label">Fotos de la factura (opcional)</span>
      <div className="photos">
        {previews.map((u, i) => (
          <span key={u} className="thumb pending">
            <img src={u} alt="" />
            <button type="button" className="thumb-remove" onClick={() => onChange(files.filter((_, j) => j !== i))} aria-label={`Quitar ${files[i]?.name}`}><Icon name="x" size={12} /></button>
          </span>
        ))}
        <label className="thumb add wide">
          <Icon name="camera" size={16} />
          <span>{files.length ? 'Añadir más' : 'Hacer foto o elegir'}</span>
          <input type="file" accept={ACCEPT} multiple onChange={(e) => { onChange([...files, ...e.target.files]); e.target.value = ''; }} />
        </label>
      </div>
    </div>
  );
}
