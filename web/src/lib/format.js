const SYMBOL = { EUR: '€', USD: 'US$', MXN: 'MXN', COP: 'COP', THB: 'THB' };
export const eur = (cents) => `${(cents / 100).toLocaleString('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' })} €`;
export const money = (cents, cur = 'EUR') =>
  `${(cents / 100).toLocaleString('es-ES', { useGrouping: 'always', minimumFractionDigits: cur === 'COP' ? 0 : 2, maximumFractionDigits: cur === 'COP' ? 0 : 2 })} ${SYMBOL[cur] || cur}`;
export const pct = (x) => `${(x * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;
export const date = (s) => new Date(`${s}T00:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const COUNTRY_COLORS = { ES: '#e5484d', PT: '#30a46c', MX: '#e79d13', CO: '#0894b3', TH: '#d6409f' };
export const FLAGS = { ES: '🇪🇸', PT: '🇵🇹', MX: '🇲🇽', CO: '🇨🇴', TH: '🇹🇭', DE: '🇩🇪', US: '🇺🇸' };
