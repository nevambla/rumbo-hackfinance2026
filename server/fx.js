// Single currency-conversion layer (contexto.md §6).
// Amounts are always integer cents in their original currency; everything that
// needs a common unit converts here and only here.
// Demo rates (fixed) — replace with an official source (ECB) in production.
export const FX_SOURCE = 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html';

// Units of currency per 1 EUR.
const PER_EUR = {
  EUR: 1,
  USD: 1.08,
  MXN: 20.5,
  COP: 4500,
  THB: 38.5,
};

export function toEurCents(cents, currency) {
  const rate = PER_EUR[currency];
  if (!rate) throw new Error(`Unknown currency ${currency}`);
  return Math.round(cents / rate);
}

export function fromEurCents(eurCents, currency) {
  const rate = PER_EUR[currency];
  if (!rate) throw new Error(`Unknown currency ${currency}`);
  return Math.round(eurCents * rate);
}

export const CURRENCIES = Object.keys(PER_EUR);
