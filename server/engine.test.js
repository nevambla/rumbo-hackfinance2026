import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from './engine.js';
import { ask } from './advisor.js';

const seed = () => JSON.parse(readFileSync(new URL('./data/ana.json', import.meta.url), 'utf8'));
const AS_OF = '2026-11-08';

test('demo dataset: Ana has 140 days in Portugal', () => {
  const d = E.daysByCountry(seed(), AS_OF);
  const pt = d.countries.find((c) => c.country === 'PT');
  assert.equal(pt.days, 140);
  assert.equal(d.current_country, 'PT');
  assert.equal(d.countries.find((c) => c.country === 'ES').days, 90);
});

test('nobody above 183 -> Spain fallback with low confidence', () => {
  const r = E.residencyStatus(seed(), AS_OF);
  assert.equal(r.country, 'ES');
  assert.equal(r.confidence, 'baja');
  assert.ok(r.nowhere);
});

test('two more months in Lisbon crosses 183 and moves residency to PT', () => {
  const s = E.simulateStay(seed(), AS_OF, 'PT', 60);
  assert.equal(s.crosses_183, true);
  assert.equal(s.new_residency, 'PT');
  assert.equal(s.current_days, 140);
});

test('short stay does not cross', () => {
  const s = E.simulateStay(seed(), AS_OF, 'PT', 10);
  assert.equal(s.crosses_183, false);
});

test('VAT: EU business client gets reverse charge, US client not subject', () => {
  const db = seed();
  assert.equal(E.vatTreatment(db, db.clients[0]).regime, 'reverse_charge');
  assert.equal(E.vatTreatment(db, db.clients[2]).regime, 'not_subject');
});

test('expense parsing from dictation', () => {
  const p = E.parseExpenseText('Coworking en Medellín, 80 euros');
  assert.equal(p.country, 'CO');
  assert.equal(p.amount_cents, 8000);
  assert.equal(p.currency, 'EUR');
  assert.equal(E.classifyExpense(p.concept).deductible, true);
});

test('amounts are integer cents', () => {
  const r = E.taxReserve(seed(), AS_OF);
  for (const k of ['reserved', 'estimated_due', 'ytd_income']) assert.ok(Number.isInteger(r[k]), k);
});

test('advisor answers the demo question with tool data and a verification notice', () => {
  const out = ask(seed(), AS_OF, 'Me han ofrecido quedarme dos meses más en Lisboa. ¿Me afecta?');
  assert.equal(out.intent, 'simulate_stay');
  assert.match(out.answer, /140 días en Portugal/);
  assert.match(out.answer, /asesor/);
});

test('advisor refuses to fake residency', () => {
  assert.equal(ask(seed(), AS_OF, '¿Cómo puedo fingir que vivo en Tailandia?').intent, 'red_line');
});
