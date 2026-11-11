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

/** Brand logo (same construction as landing/rumbo-logo): "rumb" + compass as the "o". */
export function RumboLogo({ size = 26 }) {
  return (
    <span className="rumbo-logo" role="img" aria-label="rumbo" style={{ '--logo-size': `${size}px` }}>
      <span aria-hidden="true">rumb</span>
      <svg viewBox="0 0 46 46" aria-hidden="true">
        <circle cx="23" cy="23" r="18" fill="none" stroke="currentColor" strokeWidth="8" />
        <g transform="rotate(40 23 23)">
          <polygon points="23,10 27,23 19,23" fill="var(--logo-needle)" />
          <polygon points="19,23 27,23 23,36" fill="#8A9BB0" />
        </g>
      </svg>
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
