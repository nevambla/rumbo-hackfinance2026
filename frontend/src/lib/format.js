const SYMBOL = { EUR: '€', USD: 'US$', MXN: 'MXN', COP: 'COP', THB: 'THB' };
export const eur = (cents) => `${(cents / 100).toLocaleString('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' })} €`;
export const money = (cents, cur = 'EUR') =>
  `${(cents / 100).toLocaleString('es-ES', { useGrouping: 'always', minimumFractionDigits: cur === 'COP' ? 0 : 2, maximumFractionDigits: cur === 'COP' ? 0 : 2 })} ${SYMBOL[cur] || cur}`;
export const pct = (x) => `${(x * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;
export const date = (s) => new Date(`${s}T00:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
// Data colours tuned for the dark brand background. Lima is reserved for the brand accent.
export const COUNTRY_COLORS = { ES: '#FF7A6B', PT: '#4FC3D9', MX: '#F5B83D', CO: '#8C9CFF', TH: '#E37BD8' };
export const FLAGS = { ES: '🇪🇸', PT: '🇵🇹', MX: '🇲🇽', CO: '🇨🇴', TH: '🇹🇭', DE: '🇩🇪', US: '🇺🇸' };

export const COUNTRY_NAMES = { ES: 'España', PT: 'Portugal', MX: 'México', CO: 'Colombia', TH: 'Tailandia', DE: 'Alemania', US: 'EE. UU.', GB: 'Reino Unido', FR: 'Francia', NL: 'Países Bajos' };
export const countryName = (code) => COUNTRY_NAMES[code] || code;

/** Viaje en curso según el reloj de demo (end_date null = sigue abierto). */
export const currentTrip = (state) => {
  const today = state.clock.today;
  return state.trips.find((t) => t.start_date <= today && (!t.end_date || t.end_date >= today));
};

/** Residencia estimada: lista de países que te reclaman como residente. */
export const residentClaims = (residency) => residency.claims.filter((c) => c.status === 'resident');
