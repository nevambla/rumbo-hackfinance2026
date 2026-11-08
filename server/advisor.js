// Local advisor: used when no ElevenLabs agent is configured (offline demo).
// Mirrors the ElevenLabs agent behaviour: detects the intent, calls the SAME
// tool functions the agent would call, and explains the result. It never
// invents figures — every number comes from the engine.
import { COUNTRIES } from './rules/countries.js';
import * as E from './engine.js';

const NUM_WORDS = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, quince: 15, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, noventa: 90, cien: 100,
  medio: 0.5,
};
const COUNTRY_WORDS = [
  [/portugal|lisboa|oporto|porto/i, 'PT'],
  [/espa[ñn]a|madrid|barcelona|valencia/i, 'ES'],
  [/m[eé]xico|cdmx|oaxaca|tulum/i, 'MX'],
  [/colombia|medell[ií]n|bogot[aá]|cartagena/i, 'CO'],
  [/tailandia|bangkok|chiang mai|phuket/i, 'TH'],
];

function findCountries(text) {
  const found = [];
  for (const [re, c] of COUNTRY_WORDS) {
    const m = text.match(re);
    if (m) found.push({ c, at: m.index });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.c);
}

export function parseDuration(text) {
  const m = text.toLowerCase().match(/(\d+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte|treinta|cuarenta|cincuenta|sesenta|noventa|cien|medio)\s+(d[ií]as?|semanas?|mes(?:es)?|a[ñn]o)/);
  if (!m) return null;
  const n = /\d/.test(m[1]) ? Number(m[1]) : NUM_WORDS[m[1]];
  const unit = m[2];
  if (unit.startsWith('d')) return n;
  if (unit.startsWith('sem')) return n * 7;
  if (unit.startsWith('mes')) return Math.round(n * 30);
  return 365;
}

const say = (cents) => E.eur(cents);
const SYMBOL = { EUR: '€', USD: 'US$', MXN: 'MXN', COP: 'COP', THB: 'THB' };
const money = (cents, cur) => `${(cents / 100).toLocaleString('es-ES', { maximumFractionDigits: 2 })} ${SYMBOL[cur] || cur}`;

export function ask(db, asOf, text) {
  const t = text.toLowerCase();
  const countries = findCountries(text);
  const tools = [];
  const call = (name, args, fn) => { const result = fn(); tools.push({ name, args, result }); return result; };

  // 1) Expense: "Coworking en Medellín, 80 euros"
  if (/\d/.test(t) && /(euro|€|d[oó]lar|peso|baht|gasto|he gastado|apunta|registra)/.test(t) && !/qu[eé]date|quedarme|m[aá]s en/.test(t)) {
    const parsed = E.parseExpenseText(text, E.buildTimeline(db.trips).get(asOf) || 'ES');
    const r = call('register_expense', { concept: parsed.concept, amount: parsed.amount_cents / 100, country: parsed.country, currency: parsed.currency }, () => E.registerExpense(db, parsed, asOf));
    const answer = `Apuntado: "${r.concept}", ${money(r.amount_cents, r.currency)} en ${COUNTRIES[r.country].name}. Lo he clasificado como ${r.category}${r.deductible ? ' y es deducible' : ', y en principio no es deducible'}.${r.note ? ' ' + r.note : ''}`;
    return { answer, tools, intent: 'register_expense' };
  }

  // 2) Stay simulation: "¿me afecta quedarme dos meses más en Lisboa?"
  const extra = parseDuration(t);
  if (extra && countries.length && /(qued|alarg|m[aá]s|extender|afecta|pasar)/.test(t) && !/compar|mejor|o en/.test(t)) {
    const country = countries[0];
    const s = call('simulate_stay', { country, extra_days: extra }, () => E.simulateStay(db, asOf, country, extra));
    let answer = `Llevas ${s.current_days} días en ${s.country_name} este año. `;
    if (s.crosses_183) {
      answer += `Con ${extra} días más pasarías de ${s.threshold} (llegarías a ${s.days_after}) y serías residente fiscal allí. `;
      const delta = s.tax_delta_eur_cents;
      answer += delta === 0 ? 'La estimación de impuestos sería similar. ' : `Según mis cálculos pagarías unos ${say(Math.abs(delta))} ${delta > 0 ? 'más' : 'menos'} al año que con tu residencia actual (${COUNTRIES[s.previous_residency].name}). `;
      const regime = s.special_regimes.find((r) => r.status === 'posible');
      if (regime) answer += `Además, podrías estudiar el ${regime.name}. `;
      answer += '¿Quieres que compare cuánto pagarías en cada caso en el simulador?';
    } else if (s.already_crossing) {
      answer += `Ya ibas a superar el umbral de ${s.threshold} días con tus planes actuales, así que serías residente en ${s.country_name} igualmente.`;
    } else {
      answer += `Con ${extra} días más llegarías a ${s.days_after}: seguirías por debajo de ${s.threshold}. Te quedarían ${s.threshold - s.days_after} días de margen.`;
    }
    if (s.spill_next_year) answer += ` Ojo: ${s.spill_next_year} de esos días caen el año que viene y empiezan a contar para ese año.`;
    answer += ' Te recomiendo confirmarlo con un asesor.';
    return { answer, tools, intent: 'simulate_stay' };
  }

  // 3) Compare two places ("¿Me sale mejor el invierno en México o en Tailandia?")
  if (countries.length >= 2 && /(compar|mejor|o en|vs|frente)/.test(t)) {
    const days = extra || (/invierno/.test(t) ? 120 : 90);
    const year = Number(asOf.slice(0, 4)) + 1;
    const scen = countries.slice(0, 2).map((c) => ({ label: COUNTRIES[c].name, legs: [{ country: c, days }] }));
    const r = call('compare_scenarios', { scenarios: scen, year }, () => E.compareScenarios(db, asOf, scen, { year }));
    const [a, b] = r.results;
    let answer = `He simulado ${year}: ${days} días en cada destino y el resto del año en ${COUNTRIES[a.fill_country].name}. `;
    if (r.same_residency) {
      answer += `En los dos casos tu residencia fiscal probable seguiría siendo ${a.residency.name}, así que los impuestos serían prácticamente iguales (unos ${say(a.tax.total_eur_cents)} al año). Para que cambie, tendrías que pasar más de ${a.days.find((d) => d.country === a.legs[0].country)?.threshold || 183} días en uno de ellos. `;
    } else {
      answer += `En ${a.label} tu residencia probable sería ${a.residency.name} y pagarías unos ${say(a.tax.total_eur_cents)} al año; en ${b.label}, ${b.residency.name} y unos ${say(b.tax.total_eur_cents)}. Sale mejor ${r.cheapest}, por ${say(r.difference_eur_cents)}. `;
    }
    answer += 'Puedes ajustar los días en el simulador. Te recomiendo confirmarlo con un asesor.';
    return { answer, tools, intent: 'compare_scenarios' };
  }

  // 4) Days
  if (/(cu[aá]ntos d[ií]as|d[ií]as llevo|d[ií]as me quedan|d[ií]as tengo)/.test(t)) {
    const d = call('get_days_by_country', {}, () => E.daysByCountry(db, asOf));
    const list = d.countries.filter((c) => c.days > 0);
    if (countries.length) {
      const c = d.countries.find((x) => x.country === countries[0]);
      return { answer: `Llevas ${c.days} días en ${c.name} en ${d.year}. Te quedan ${c.days_left} días antes de ser residente fiscal allí (umbral ${c.threshold}).`, tools, intent: 'get_days_by_country' };
    }
    return { answer: `En ${d.year} llevas ${list.map((c) => `${c.days} días en ${c.name}`).join(', ')}. Ahora mismo estás en ${COUNTRIES[d.current_country]?.name || 'un país fuera del MVP'}.`, tools, intent: 'get_days_by_country' };
  }

  // 5) Residency
  if (/(residen|d[oó]nde tributo|d[oó]nde pago)/.test(t)) {
    const r = call('get_residency_status', {}, () => E.residencyStatus(db, asOf));
    return { answer: `Tu residencia fiscal estimada para ${r.year} es ${r.name}, con confianza ${r.confidence}. ${r.reason} Te recomiendo confirmarlo con un asesor.`, tools, intent: 'get_residency_status' };
  }

  // 6) Reserve
  if (/(apartad|reserv|ahorrad|cu[aá]nto (debo|tengo que) pagar|impuestos)/.test(t)) {
    const r = call('get_tax_reserve', {}, () => E.taxReserve(db, asOf));
    const gap = r.gap > 0 ? `Te faltan unos ${say(r.gap)} por apartar.` : `Vas bien: tienes ${say(-r.gap)} de colchón.`;
    return { answer: `Tienes ${say(r.reserved)} apartados y la estimación de impuestos para este año, si tributas en ${COUNTRIES[r.residency_country].name}, es de ${say(r.estimated_due)}. ${gap} ${E.VERIFY_NOTICE}`, tools, intent: 'get_tax_reserve' };
  }

  // 7) Special regimes
  if (/(beckham|ifici|r[eé]gimen|nhr|ltr|resico)/.test(t)) {
    const list = E.specialRegimes(db, asOf);
    const relevant = countries.length ? list.filter((r) => countries.includes(r.country)) : list.filter((r) => r.status === 'posible');
    const txt = relevant.map((r) => `${r.name}: ${r.status === 'posible' ? 'podrías encajar' : r.status === 'no_elegible' ? 'no encajas' : 'hay que revisarlo'} (${r.why})`).join(' ');
    return { answer: `${txt || 'No veo regímenes especiales claros para tu caso.'} Te recomiendo confirmarlo con un asesor.`, tools: [{ name: 'get_special_regimes', args: {}, result: relevant }], intent: 'special_regimes' };
  }

  // Red line
  if (/(fingir|ocultar|esconder|que no se enteren|sin declarar|empresa pantalla|testaferro)/.test(t)) {
    return { answer: 'Eso no puedo hacerlo: Rumbo planifica con dónde vives de verdad y no ayuda a fingir residencias ni a ocultar ingresos. Sí puedo ayudarte a ver qué opciones legales tienes según tus planes reales.', tools, intent: 'red_line' };
  }

  return {
    answer: 'Puedo ayudarte con: días por país, tu residencia fiscal estimada, cuánto tienes apartado, simular que te quedas más días en un país ("¿me afecta quedarme dos meses más en Lisboa?"), comparar dos destinos o apuntar un gasto ("Coworking en Medellín, 80 euros").',
    tools, intent: 'help',
  };
}
