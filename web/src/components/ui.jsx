import { COUNTRY_COLORS } from '../lib/format.js';
import Icon from './Icon.jsx';

const NAMES = { ES: 'España', PT: 'Portugal', MX: 'México', CO: 'Colombia', TH: 'Tailandia', DE: 'Alemania', US: 'EE. UU.' };

/** Country marker: colour dot + name. Replaces flag emoji (they render as letters on Windows). */
export function Country({ code, short = false }) {
  if (!code) return null;
  return (
    <span className="country">
      <i style={{ background: COUNTRY_COLORS[code] || 'var(--text-3)' }} />
      {short ? code : NAMES[code] || code}
    </span>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

/** Button with a built-in loading state. */
export function Button({ busy, children, variant = '', icon, className = '', ...rest }) {
  return (
    <button className={`btn ${variant} ${className}`} disabled={busy || rest.disabled} aria-busy={busy || undefined} {...rest}>
      {busy ? <Spinner /> : icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </button>
  );
}

export function Skeleton({ lines = 3, height }) {
  return (
    <div className="skeleton-group" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton" style={{ height, width: `${100 - (i % 3) * 14}%` }} />
      ))}
    </div>
  );
}

export function SourceLink({ href, children = 'Fuente oficial' }) {
  if (!href) return null;
  return (
    <a className="link small" href={href} target="_blank" rel="noreferrer">
      {children} <Icon name="external" size={13} />
    </a>
  );
}

export function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`toast ${toast.kind || 'ok'}`} role="status" key={toast.id}>
      <Icon name={toast.kind === 'error' ? 'alert' : 'check'} size={16} />
      {toast.text}
    </div>
  );
}
