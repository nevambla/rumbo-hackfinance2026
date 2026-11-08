const SYMBOL = { EUR: '€', USD: 'US$', MXN: 'MXN', COP: 'COP', THB: 'THB' };
export const eur = (cents) => `${(cents / 100).toLocaleString('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' })} €`;
export const money = (cents, cur = 'EUR') =>
  `${(cents / 100).toLocaleString('es-ES', { useGrouping: 'always', minimumFractionDigits: cur === 'COP' ? 0 : 2, maximumFractionDigits: cur === 'COP' ? 0 : 2 })} ${SYMBOL[cur] || cur}`;
export const pct = (x) => `${(x * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;
export const date = (s) => new Date(`${s}T00:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
// Data colours tuned for the dark brand background. Lima is reserved for the brand accent.
export const COUNTRY_COLORS = { ES: '#FF7A6B', PT: '#4FC3D9', MX: '#F5B83D', CO: '#8C9CFF', TH: '#E37BD8' };
export const FLAGS = { ES: '🇪🇸', PT: '🇵🇹', MX: '🇲🇽', CO: '🇨🇴', TH: '🇹🇭', DE: '🇩🇪', US: '🇺🇸' };
