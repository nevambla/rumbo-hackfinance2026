// Deterministic rules engine. The voice agent NEVER computes figures: it calls
// the API, and the API calls this module (contexto.md §4).
import {
  COUNTRIES, RESIDENCY_RULES, INCOME_TAX_RULES, SOCIAL_SECURITY_RULES, VAT_RULES,
  SPECIAL_REGIMES, TRAPS, TREATIES,
} from './rules/countries.js';
import { toEurCents, fromEurCents } from './fx.js';

export const VERIFY_NOTICE = 'Estimación orientativa con reglas simplificadas: te recomiendo confirmarlo con un asesor.';

// ---------------------------------------------------------------------------
// Date helpers (ISO yyyy-mm-dd, UTC)
// ---------------------------------------------------------------------------
const DAY = 86400000;
export const parseDate = (s) => new Date(`${s}T00:00:00Z`);
export const fmt = (d) => d.toISOString().slice(0, 10);
export const addDays = (s, n) => fmt(new Date(parseDate(s).getTime() + n * DAY));
export const diffDays = (a, b) => Math.round((parseDate(b) - parseDate(a)) / DAY);
const yearStart = (y) => `${y}-01-01`;
const yearEnd = (y) => `${y}-12-31`;

/** Expand trips into a Map date -> country. Later trips override earlier ones. */
export function buildTimeline(trips) {
  const map = new Map();
  for (const t of trips) {
    for (let d = t.start; d <= t.end; d = addDays(d, 1)) map.set(d, t.country);
  }
  return map;
}

/** Count days per country between [from, to] inclusive. */
export function countDays(timeline, from, to) {
  const counts = {};
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const c = timeline.get(d);
    if (c) counts[c] = (counts[c] || 0) + 1;
  }
  return counts;
}

/** Max days in `country` within any 365-day window that overlaps `year`, up to `until`. */
function rollingMax(timeline, country, year, until) {
  const start = addDays(yearStart(year), -364);
  const end = until < yearEnd(year) ? until : yearEnd(year);
  const days = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(timeline.get(d) === country ? 1 : 0);
  let sum = 0, best = 0;
  for (let i = 0; i < days.length; i++) {
    sum += days[i];
    if (i >= 365) sum -= days[i - 365];
    best = Math.max(best, sum);
  }
  return best;
}

const residencyRule = (c) => RESIDENCY_RULES.find((r) => r.country === c);
// "more than 183 days" -> resident on day 184. Thailand: "180 days or more".
const daysToBecomeResident = (rule) => (rule.country === 'TH' ? rule.threshold : rule.threshold + 1);

/**
 * Day counters per country.
 * - `actual`: days up to `asOf` (inclusive)
 * - `projected`: actual + planned trips until year end
 * - `rule_days`: days measured with each country's window (calendar or rolling 365)
 */
export function daysByCountry(db, asOf, timelineOverride) {
  const year = Number(asOf.slice(0, 4));
  const tl = timelineOverride || buildTimeline(db.trips);
  const actual = countDays(tl, yearStart(year), asOf);
  const projected = countDays(tl, yearStart(year), yearEnd(year));
  const countries = Object.keys(COUNTRIES).map((code) => {
    const rule = residencyRule(code);
    const ruleActual = rule.window === 'rolling_365' ? rollingMax(tl, code, year, asOf) : actual[code] || 0;
    const ruleProjected = rule.window === 'rolling_365' ? rollingMax(tl, code, year, yearEnd(year)) : projected[code] || 0;
    const needed = daysToBecomeResident(rule);
    return {
      country: code,
      name: COUNTRIES[code].name,
      flag: COUNTRIES[code].flag,
      days: actual[code] || 0,
      projected_days: projected[code] || 0,
      rule_days: ruleActual,
      rule_projected_days: ruleProjected,
      threshold: rule.threshold,
      window: rule.window,
      days_left: Math.max(0, needed - ruleActual),
      crosses_now: ruleActual >= needed,
      crosses_projected: ruleProjected >= needed,
      source_url: rule.source_url,
    };
  });
  const current = tl.get(asOf) || null;
  return { year, as_of: asOf, current_country: current, total_days_elapsed: diffDays(yearStart(year), asOf) + 1, countries };
}

/** Residency estimate for the year, with reason and confidence. */
export function residencyStatus(db, asOf, timelineOverride) {
  const days = daysByCountry(db, asOf, timelineOverride);
  const projectedCrossers = days.countries.filter((c) => c.crosses_projected);
  const prevYear = String(days.year - 1);
  const previousResidence = db.profile.residency_history?.[prevYear] || db.profile.nationality;
  let result;

  if (projectedCrossers.length === 1) {
    const c = projectedCrossers[0];
    const margin = c.rule_projected_days - c.threshold;
    const confidence = margin > 30 ? 'alta' : 'media';
    let reason = `Con tus viajes registrados y planificados superarás ${c.threshold} días en ${c.name} (${c.rule_projected_days} días${c.window === 'rolling_365' ? ' en un periodo de 365' : ''}).`;
    if (c.country !== 'ES' && previousResidence === 'ES') {
      reason += ' España podría seguir reclamándote por centro de intereses económicos; el convenio de doble imposición resolvería el conflicto.';
    }
    result = { country: c.country, name: c.name, reason, confidence, dual: false };
  } else if (projectedCrossers.length > 1) {
    const names = projectedCrossers.map((c) => c.name).join(' y ');
    result = {
      country: projectedCrossers.sort((a, b) => b.rule_projected_days - a.rule_projected_days)[0].country,
      name: null,
      reason: `Superas el umbral en ${names} (las ventanas de 365 días se solapan). Habrá que aplicar las reglas de desempate del convenio: vivienda permanente, centro de intereses vitales, residencia habitual y nacionalidad.`,
      confidence: 'baja',
      dual: true,
      candidates: projectedCrossers.map((c) => c.country),
    };
    result.name = COUNTRIES[result.country].name;
  } else {
    // Nowhere above threshold: Spain usually keeps claiming (trap: nowhere_resident)
    const fallback = previousResidence;
    result = {
      country: fallback,
      name: COUNTRIES[fallback]?.name || fallback,
      reason: `No superas el umbral de días en ningún país. ${COUNTRIES[fallback]?.name || fallback} es tu última residencia fiscal y probablemente siga considerándote residente por centro de intereses económicos (clientes, cuentas, alta de autónomo). "No ser residente en ningún sitio" no es una opción real.`,
      confidence: 'baja',
      dual: false,
      nowhere: true,
    };
  }
  return { ...result, year: days.year, as_of: asOf, notice: VERIFY_NOTICE };
}

// ---------------------------------------------------------------------------
// Taxes
// ---------------------------------------------------------------------------
function progressiveTax(amount, brackets) {
  let tax = 0, prev = 0;
  for (const [limit, rate] of brackets) {
    if (amount <= prev) break;
    const slice = Math.min(amount, limit) - prev;
    tax += slice * rate;
    prev = limit;
  }
  return tax;
}

/** Annual tax estimate (income tax + social security) for a EUR-cents gross income in a country. */
export function estimateTax(country, grossEurCents, deductibleEurCents = 0) {
  const it = INCOME_TAX_RULES.find((r) => r.country === country);
  const ss = SOCIAL_SECURITY_RULES.find((r) => r.country === country);
  const netEurCents = Math.max(0, grossEurCents - deductibleEurCents);
  // Convert to local currency units (not cents) for bracket math
  const localCents = fromEurCents(netEurCents, it.currency);
  const taxableLocal = (localCents / 100) * it.taxable_share;
  const incomeTaxLocal = progressiveTax(taxableLocal, it.brackets);
  const incomeTax = toEurCents(Math.round(incomeTaxLocal * 100), it.currency);
  const socialSecurity = Math.round(netEurCents * ss.rate);
  const total = incomeTax + socialSecurity;
  return {
    country,
    gross_eur_cents: grossEurCents,
    deductible_eur_cents: deductibleEurCents,
    income_tax_eur_cents: incomeTax,
    social_security_eur_cents: socialSecurity,
    total_eur_cents: total,
    effective_rate: grossEurCents ? total / grossEurCents : 0,
    sources: [it.source_url, ss.source_url],
  };
}

export function invoiceEurCents(inv) {
  return toEurCents(inv.net_cents, inv.currency);
}

function ytdIncome(db, asOf) {
  const year = asOf.slice(0, 4);
  return db.invoices
    .filter((i) => i.status === 'paid' && i.date.startsWith(year) && i.date <= asOf)
    .reduce((s, i) => s + invoiceEurCents(i), 0);
}

function ytdDeductible(db, asOf) {
  const year = asOf.slice(0, 4);
  return db.expenses
    .filter((e) => e.deductible && e.date.startsWith(year) && e.date <= asOf)
    .reduce((s, e) => s + toEurCents(e.amount_cents, e.currency), 0);
}

/** Annualised income/deductions, used for effective rates. */
export function annualised(db, asOf) {
  const elapsed = diffDays(yearStart(asOf.slice(0, 4)), asOf) + 1;
  const factor = 365 / elapsed;
  return {
    income: Math.round(ytdIncome(db, asOf) * factor),
    deductible: Math.round(ytdDeductible(db, asOf) * factor),
    ytd_income: ytdIncome(db, asOf),
    ytd_deductible: ytdDeductible(db, asOf),
  };
}

/** Current reserve rate for a new invoice: effective rate in the projected residency country. */
export function currentReserveRate(db, asOf) {
  const res = residencyStatus(db, asOf);
  const a = annualised(db, asOf);
  const est = estimateTax(res.country, a.income, a.deductible);
  return { rate: Math.round(est.effective_rate * 1000) / 1000, country: res.country };
}

export function taxReserve(db, asOf) {
  const res = residencyStatus(db, asOf);
  const a = annualised(db, asOf);
  const annual = estimateTax(res.country, a.income, a.deductible);
  const year = asOf.slice(0, 4);
  const paid = db.invoices.filter((i) => i.status === 'paid' && i.date.startsWith(year) && i.date <= asOf);
  const reserved = paid.reduce((s, i) => s + Math.round(invoiceEurCents(i) * i.reserve_rate), 0);
  const estimatedDue = Math.round(a.ytd_income * annual.effective_rate);
  return {
    currency: 'EUR',
    reserved: reserved,
    estimated_due: estimatedDue,
    gap: estimatedDue - reserved,
    ytd_income: a.ytd_income,
    ytd_deductible: a.ytd_deductible,
    residency_country: res.country,
    effective_rate: annual.effective_rate,
    breakdown: annual,
    notice: VERIFY_NOTICE,
    unit: 'cents',
  };
}

// ---------------------------------------------------------------------------
// VAT on invoices
// ---------------------------------------------------------------------------
export function vatTreatment(db, client) {
  const issuer = db.profile.tax_registration;
  const issuerEu = COUNTRIES[issuer]?.eu;
  const vat = VAT_RULES.find((r) => r.country === issuer);
  if (client.country === issuer) {
    return { regime: 'domestic', rate: vat.rate, legend: `IVA ${Math.round(vat.rate * 100)}%`, source_url: vat.source_url };
  }
  if (issuerEu && client.eu && client.business) {
    return {
      regime: 'reverse_charge', rate: 0,
      legend: 'Operación con inversión del sujeto pasivo (art. 196 Directiva 2006/112/CE). IVA 0%.',
      warning: db.profile.vies_registered ? null : 'Necesitas estar dado de alta en el ROI/VIES para facturar sin IVA a empresas de la UE.',
      source_url: vat.source_url,
    };
  }
  if (issuerEu && client.eu && !client.business) {
    return { regime: 'eu_consumer', rate: vat.rate, legend: `IVA ${Math.round(vat.rate * 100)}% (por debajo del umbral OSS de 10.000 €)`, source_url: vat.source_url };
  }
  if (issuer === 'ES') {
    return { regime: 'not_subject', rate: 0, legend: 'Operación no sujeta a IVA por reglas de localización (art. 69 Ley 37/1992).', source_url: vat.source_url };
  }
  return { regime: 'export', rate: 0, legend: 'Exportación de servicios: IVA 0% / exenta (verificar requisitos).', source_url: vat.source_url };
}

export function buildInvoice(db, { client_id, concept, net_cents, currency, date }, asOf) {
  const client = db.clients.find((c) => c.id === client_id);
  if (!client) throw new Error('Cliente no encontrado');
  const vat = vatTreatment(db, client);
  const vatCents = Math.round(net_cents * vat.rate);
  const { rate, country } = currentReserveRate(db, asOf);
  const eur = toEurCents(net_cents, currency);
  const year = (date || asOf).slice(0, 4);
  const n = db.invoices.filter((i) => i.id.startsWith(`F-${year}`)).length + 1;
  return {
    id: `F-${year}-${String(n).padStart(3, '0')}`,
    client_id,
    client,
    issuer: { name: db.profile.name, vat_id: db.profile.vat_id, country: db.profile.tax_registration },
    date: date || asOf,
    concept,
    net_cents,
    currency,
    vat_rate: vat.rate,
    vat_cents: vatCents,
    total_cents: net_cents + vatCents,
    vat_regime: vat.regime,
    vat_legend: vat.legend,
    vat_warning: vat.warning || null,
    status: 'paid',
    reserve_rate: rate,
    reserve_country: country,
    reserve_eur_cents: Math.round(eur * rate),
  };
}

// ---------------------------------------------------------------------------
// Simulations
// ---------------------------------------------------------------------------
/**
 * Build a timeline where, starting the day after `asOf`, the given legs are
 * inserted and the remaining planned trips are shifted after them.
 * mode 'insert' keeps the rest of the plan; mode 'replace' fills the rest with `fill_country`.
 */
function timelineWithLegs(db, asOf, legs, { mode = 'insert', fillCountry = null } = {}) {
  const year = Number(asOf.slice(0, 4));
  const base = buildTimeline(db.trips);
  const tl = new Map();
  for (const [d, c] of base) if (d <= asOf) tl.set(d, c);
  const sequence = [];
  for (const leg of legs) for (let i = 0; i < leg.days; i++) sequence.push(leg.country);
  if (mode === 'insert') {
    for (let d = addDays(asOf, 1); d <= yearEnd(year); d = addDays(d, 1)) sequence.push(base.get(d) || null);
  }
  let d = addDays(asOf, 1);
  let spill = 0;
  for (const c of sequence) {
    if (d > yearEnd(year)) { if (c && legs.length) spill++; continue; }
    if (c) tl.set(d, c);
    d = addDays(d, 1);
  }
  if (fillCountry) for (; d <= yearEnd(year); d = addDays(d, 1)) tl.set(d, fillCountry);
  const legDays = legs.reduce((s, l) => s + l.days, 0);
  const daysLeftInYear = diffDays(asOf, yearEnd(year));
  return { tl, spill_next_year: Math.max(0, legDays - daysLeftInYear) };
}

export function simulateStay(db, asOf, country, extraDays) {
  if (!COUNTRIES[country]) throw new Error(`País no soportado: ${country}`);
  const a = annualised(db, asOf);
  const baseRes = residencyStatus(db, asOf);
  const baseDays = daysByCountry(db, asOf);
  const baseTax = estimateTax(baseRes.country, a.income, a.deductible);
  const { tl, spill_next_year } = timelineWithLegs(db, asOf, [{ country, days: extraDays }]);
  const newDays = daysByCountry(db, asOf, tl);
  const newRes = residencyStatus(db, asOf, tl);
  const newTax = estimateTax(newRes.country, a.income, a.deductible);
  const before = baseDays.countries.find((c) => c.country === country);
  const after = newDays.countries.find((c) => c.country === country);
  return {
    country,
    country_name: COUNTRIES[country].name,
    extra_days: extraDays,
    current_days: before.rule_days,
    days_after: after.rule_projected_days,
    threshold: after.threshold,
    crosses_183: !before.crosses_projected && after.crosses_projected,
    already_crossing: before.crosses_projected,
    days_left_before_threshold: before.days_left,
    spill_next_year,
    previous_residency: baseRes.country,
    new_residency: newRes.country,
    new_residency_reason: newRes.reason,
    confidence: newRes.confidence,
    tax_before_eur_cents: baseTax.total_eur_cents,
    tax_after_eur_cents: newTax.total_eur_cents,
    tax_delta: Math.round((newTax.total_eur_cents - baseTax.total_eur_cents) / 100),
    tax_delta_eur_cents: newTax.total_eur_cents - baseTax.total_eur_cents,
    special_regimes: regimesFor(db, newRes.country, asOf),
    notice: VERIFY_NOTICE,
  };
}

/** Timeline for a whole future year: legs from Jan 1, rest filled with `fillCountry`. */
function timelineForYear(db, year, legs, fillCountry) {
  const tl = buildTimeline(db.trips);
  for (let d = yearStart(year); d <= yearEnd(year); d = addDays(d, 1)) tl.delete(d);
  let d = yearStart(year);
  let spill = 0;
  for (const leg of legs) for (let i = 0; i < leg.days; i++) {
    if (d > yearEnd(year)) { spill++; continue; }
    tl.set(d, leg.country); d = addDays(d, 1);
  }
  for (; d <= yearEnd(year); d = addDays(d, 1)) tl.set(d, fillCountry);
  return { tl, spill_next_year: spill };
}

/**
 * Compare scenarios. Each scenario: { label, legs: [{country, days}], fill_country }.
 * `year`: current year (legs start tomorrow) or a future year (legs start on Jan 1).
 */
export function compareScenarios(db, asOf, scenarios, { year } = {}) {
  const a = annualised(db, asOf);
  const currentYear = Number(asOf.slice(0, 4));
  const targetYear = Number(year || currentYear);
  const future = targetYear > currentYear;
  const evalDate = future ? yearEnd(targetYear) : asOf;
  const results = scenarios.map((s) => {
    const fill = s.fill_country || db.profile.nationality;
    const { tl, spill_next_year } = future
      ? timelineForYear(db, targetYear, s.legs, fill)
      : timelineWithLegs(db, asOf, s.legs, { mode: 'replace', fillCountry: fill });
    const days = daysByCountry(db, evalDate, tl);
    const res = residencyStatus(db, evalDate, tl);
    const tax = estimateTax(res.country, a.income, a.deductible);
    const warnings = [];
    for (const leg of s.legs) {
      const c = days.countries.find((x) => x.country === leg.country);
      if (c.crosses_projected) warnings.push(`Serías residente fiscal en ${c.name} (${c.rule_projected_days} días).`);
      else if (c.rule_projected_days > c.threshold - 30) warnings.push(`Te quedarías a ${c.threshold - c.rule_projected_days} días del umbral en ${c.name}.`);
    }
    if (res.nowhere) warnings.push('No superas el umbral en ningún país: España probablemente siga reclamándote.');
    if (res.dual) warnings.push('Doble residencia posible: se aplicarían las reglas de desempate del convenio.');
    if (spill_next_year) warnings.push(`${spill_next_year} días caen en ${targetYear + 1} y cuentan para el año siguiente.`);
    return {
      label: s.label,
      legs: s.legs,
      fill_country: fill,
      days: days.countries.filter((c) => c.projected_days > 0).map((c) => ({ country: c.country, name: c.name, flag: c.flag, days: c.projected_days, rule_days: c.rule_projected_days, threshold: c.threshold })),
      residency: res,
      tax,
      warnings,
      special_regimes: regimesFor(db, res.country, evalDate),
    };
  });
  const sorted = [...results].sort((x, y) => x.tax.total_eur_cents - y.tax.total_eur_cents);
  return {
    year: targetYear,
    results,
    cheapest: sorted[0].label,
    same_residency: new Set(results.map((r) => r.residency.country)).size === 1,
    difference_eur_cents: sorted.length > 1 ? sorted[sorted.length - 1].tax.total_eur_cents - sorted[0].tax.total_eur_cents : 0,
    income_basis_eur_cents: a.income,
    notice: VERIFY_NOTICE,
  };
}

// ---------------------------------------------------------------------------
// Special regimes, traps, treaties
// ---------------------------------------------------------------------------
export function regimesFor(db, country, asOf) {
  return SPECIAL_REGIMES.filter((r) => r.country === country).map((r) => evaluateRegime(db, r, asOf));
}

export function evaluateRegime(db, regime, asOf) {
  const year = Number(asOf.slice(0, 4));
  const hist = db.profile.residency_history || {};
  const lastYears = (n) => Array.from({ length: n }, (_, i) => hist[String(year - 1 - i)]);
  let status = 'revisar';
  let why = '';
  if (regime.id === 'beckham' || regime.id === 'ifici') {
    const wasResident = lastYears(regime.threshold).includes(regime.country);
    status = wasResident ? 'no_elegible' : 'posible';
    why = wasResident
      ? `Has sido residente fiscal en ${COUNTRIES[regime.country].name} en los últimos ${regime.threshold} años.`
      : `No consta residencia en ${COUNTRIES[regime.country].name} en los últimos ${regime.threshold} años. Falta comprobar el resto de requisitos.`;
  } else if (regime.id === 'ltr') {
    const a = annualised(db, asOf);
    const usd = fromEurCents(a.income, 'USD') / 100;
    status = usd >= 80000 ? 'posible' : usd >= 40000 ? 'revisar' : 'no_elegible';
    why = `Ingresos anualizados ≈ ${Math.round(usd).toLocaleString('es-ES')} USD (requisito general 80.000 USD; 40.000 con condiciones).`;
  } else if (regime.id === 'mx_resico') {
    status = 'revisar';
    why = 'Solo aplica si pasas a ser residente fiscal en México.';
  } else {
    status = 'info';
    why = regime.summary;
  }
  return { ...regime, status, why };
}

export function specialRegimes(db, asOf) {
  return SPECIAL_REGIMES.map((r) => evaluateRegime(db, r, asOf));
}

export function activeTraps(db, asOf) {
  const res = residencyStatus(db, asOf);
  return TRAPS.map((t) => {
    let applies = false;
    if (t.id === 'nowhere_resident') applies = !!res.nowhere;
    if (t.id === 'exit_tax') applies = (db.profile.portfolio_eur_cents || 0) / 100 >= t.threshold;
    if (t.id === 'foreign_company') applies = !!db.profile.foreign_company;
    return { ...t, applies };
  });
}

export function treaty(a, b) {
  return TREATIES.find((t) => t.countries.includes(a) && t.countries.includes(b)) || null;
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------
export function alerts(db, asOf) {
  const out = [];
  const days = daysByCountry(db, asOf);
  for (const c of days.countries) {
    if (c.crosses_now) {
      out.push({ id: `res-${c.country}`, level: 'danger', type: 'residency', country: c.country, title: `Ya superas el umbral en ${c.name}`, text: `Llevas ${c.rule_days} días: probablemente seas residente fiscal en ${c.name} este año.`, source_url: c.source_url });
    } else if (c.crosses_projected) {
      out.push({ id: `res-${c.country}`, level: 'danger', type: 'residency', country: c.country, title: `Vas a superar ${c.threshold} días en ${c.name}`, text: `Te quedan ${c.days_left} días antes de ser residente en ${c.name}, y tus planes te llevan a ${c.rule_projected_days}.`, source_url: c.source_url });
    } else if (c.rule_days > 0 && c.days_left <= 60) {
      out.push({ id: `res-${c.country}`, level: 'warning', type: 'residency', country: c.country, title: `Te quedan ${c.days_left} días antes de ser residente en ${c.name}`, text: `Llevas ${c.rule_days} días${c.window === 'rolling_365' ? ' (ventana de 365 días)' : ' este año'}. Con tu plan actual terminarías con ${c.rule_projected_days}.`, source_url: c.source_url });
    }
  }
  for (const d of db.documents) {
    const left = diffDays(asOf, d.valid_until);
    if (left < 0) continue;
    const isFuture = d.valid_from > asOf;
    if (left <= 60 && !isFuture) {
      out.push({ id: `doc-${d.id}`, level: left <= 30 ? 'danger' : 'warning', type: d.type, country: d.country, title: `${d.type === 'a1' ? 'Tu certificado A1' : d.name} caduca en ${left} días`, text: d.type === 'a1' ? 'Sin A1 vigente, el país donde trabajas puede exigirte cotizar allí. Pide la prórroga a la Seguridad Social.' : `Vence el ${d.valid_until}. Revisa la renovación o la salida del país.`, source_url: d.type === 'a1' ? 'https://www.seg-social.es/wps/portal/wss/internet/Trabajadores/Afiliacion/10817/10819' : null });
    }
  }
  // Upcoming trip to a country with a short visa
  const tl = buildTimeline(db.trips);
  for (const d of db.documents.filter((x) => x.type === 'visa' && x.valid_until >= asOf)) {
    const plannedAfter = [...tl.entries()].filter(([date, c]) => c === d.country && date > d.valid_until);
    if (plannedAfter.length) out.push({ id: `visa-gap-${d.id}`, level: 'warning', type: 'visa', country: d.country, title: `Tu plan supera la validez de ${d.name}`, text: `${plannedAfter.length} días planificados después del ${d.valid_until}.`, source_url: null });
  }
  const reserve = taxReserve(db, asOf);
  if (reserve.gap > 0) {
    out.push({ id: 'reserve-gap', level: 'warning', type: 'reserve', country: reserve.residency_country, title: `Te faltan ${eur(reserve.gap)} por apartar`, text: `Has reservado ${eur(reserve.reserved)} y la estimación para tu residencia probable (${COUNTRIES[reserve.residency_country].name}) es ${eur(reserve.estimated_due)}.`, source_url: null });
  }
  for (const t of activeTraps(db, asOf).filter((x) => x.applies)) {
    out.push({ id: `trap-${t.id}`, level: 'info', type: 'trap', country: t.country, title: t.title, text: t.text, source_url: t.source_url });
  }
  const order = { danger: 0, warning: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

export const eur = (cents) => `${(cents / 100).toLocaleString('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' })} €`;

// ---------------------------------------------------------------------------
// Expenses (dictated by voice)
// ---------------------------------------------------------------------------
const CATEGORY_KEYWORDS = [
  { re: /cowork|oficina|despacho|alquiler de escritorio/i, category: 'Oficina y coworking', deductible: true },
  { re: /figma|adobe|software|licencia|suscripci|notion|canva|dominio|hosting/i, category: 'Software', deductible: true },
  { re: /port[aá]til|ordenador|monitor|tableta|ipad|c[aá]mara|teclado|rat[oó]n/i, category: 'Equipos (amortizable)', deductible: true },
  { re: /internet|wifi|tel[eé]fono|m[oó]vil|sim|datos/i, category: 'Telecomunicaciones', deductible: true },
  { re: /vuelo|avi[oó]n|tren|billete|uber|taxi|transporte/i, category: 'Viajes de trabajo', deductible: true, note: 'Deducible si el viaje es por la actividad; guarda la justificación.' },
  { re: /seguro m[eé]dico|seguro de salud/i, category: 'Seguro de salud', deductible: true, note: 'En España, hasta 500 € al año por persona.' },
  { re: /curso|formaci[oó]n|libro|conferencia/i, category: 'Formación', deductible: true },
  { re: /comida|cena|restaurante|almuerzo|caf[eé]/i, category: 'Manutención', deductible: false, note: 'Solo deducible en desplazamientos y pagado con medios electrónicos (con límites).' },
  { re: /gestor|asesor|abogado/i, category: 'Servicios profesionales', deductible: true },
];

export function classifyExpense(concept) {
  const hit = CATEGORY_KEYWORDS.find((k) => k.re.test(concept));
  return hit ? { category: hit.category, deductible: hit.deductible, note: hit.note || null } : { category: 'Otros (revisar)', deductible: false, note: 'No hemos podido clasificarlo: revísalo con tu asesor.' };
}

const CITY_COUNTRY = [
  [/madrid|barcelona|valencia|sevilla|m[aá]laga|bilbao|espa[ñn]a/i, 'ES'],
  [/lisboa|oporto|porto|madeira|faro|portugal/i, 'PT'],
  [/m[eé]xico|cdmx|oaxaca|tulum|guadalajara|playa del carmen|puerto escondido/i, 'MX'],
  [/medell[ií]n|bogot[aá]|cartagena|cali|colombia/i, 'CO'],
  [/bangkok|chiang mai|phuket|koh|krabi|tailandia/i, 'TH'],
];
const LOCAL_CURRENCY = { ES: 'EUR', PT: 'EUR', MX: 'MXN', CO: 'COP', TH: 'THB' };

/** Parse a dictated sentence like "Coworking en Medellín, 80 euros". */
export function parseExpenseText(text, fallbackCountry = 'ES') {
  const clean = text.trim().replace(/\s+/g, ' ');
  const amountMatch = clean.match(/(\d+(?:[.,]\d{1,2})?)\s*(euros?|€|eur|d[oó]lares?|usd|\$|pesos?|mxn|cop|baht|bahts|thb)?/i);
  let country = fallbackCountry;
  for (const [re, c] of CITY_COUNTRY) if (re.test(clean)) { country = c; break; }
  let currency = LOCAL_CURRENCY[country];
  const cur = amountMatch?.[2]?.toLowerCase() || '';
  if (/eur|€/.test(cur)) currency = 'EUR';
  else if (/d[oó]lar|usd|\$/.test(cur)) currency = 'USD';
  else if (/peso|mxn|cop/.test(cur)) currency = country === 'CO' ? 'COP' : country === 'MX' ? 'MXN' : cur === 'cop' ? 'COP' : 'MXN';
  else if (/baht|thb/.test(cur)) currency = 'THB';
  const amount = amountMatch ? Math.round(parseFloat(amountMatch[1].replace(',', '.')) * 100) : null;
  let concept = clean.replace(amountMatch?.[0] || '', '').replace(/[,.;:]+\s*$/g, '').replace(/\s*,\s*$/, '').trim();
  concept = concept.replace(/^(he gastado|gasto( de)?|apunta|registra)\s*/i, '').replace(/,\s*$/, '').trim();
  concept = concept.charAt(0).toUpperCase() + concept.slice(1);
  return { concept: concept || 'Gasto', amount_cents: amount, currency, country };
}

export function registerExpense(db, { concept, amount, amount_cents, currency, country, date }, asOf) {
  const cents = amount_cents ?? Math.round(Number(amount) * 100);
  if (!concept || !Number.isFinite(cents) || cents <= 0) throw new Error('Faltan el concepto o el importe');
  const c = country && COUNTRIES[country] ? country : (buildTimeline(db.trips).get(asOf) || 'ES');
  const cls = classifyExpense(concept);
  const exp = {
    id: `g${Date.now().toString(36)}`,
    date: date || asOf,
    concept,
    amount_cents: cents,
    currency: currency || LOCAL_CURRENCY[c],
    country: c,
    category: cls.category,
    deductible: cls.deductible,
    note: cls.note,
  };
  db.expenses.push(exp);
  return { ...exp, eur_cents: toEurCents(exp.amount_cents, exp.currency) };
}

// ---------------------------------------------------------------------------
// Weekly summary (text for TTS)
// ---------------------------------------------------------------------------
export function weeklySummary(db, asOf) {
  const d = daysByCountry(db, asOf);
  const res = residencyStatus(db, asOf);
  const r = taxReserve(db, asOf);
  const al = alerts(db, asOf).filter((a) => a.level !== 'info');
  const daysTxt = d.countries.filter((c) => c.days > 0).map((c) => `${c.days} días en ${c.name}`).join(', ');
  const parts = [
    `Hola, ${db.profile.name.split(' ')[0]}. Este es tu resumen semanal de Rumbo.`,
    `En ${d.year} llevas ${daysTxt}.`,
    `Tu residencia fiscal estimada es ${res.name}, con confianza ${res.confidence}.`,
    `Tienes ${eur(r.reserved)} apartados para impuestos, frente a una estimación de ${eur(r.estimated_due)}.`,
  ];
  if (al.length) parts.push(`Riesgos de la semana: ${al.slice(0, 3).map((a) => a.title).join('. ')}.`);
  parts.push(VERIFY_NOTICE);
  return parts.join(' ');
}
