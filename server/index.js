import 'dotenv/config';
import express from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as E from './engine.js';
import { ask } from './advisor.js';
import { ALL_RULES, COUNTRIES, TREATIES } from './rules/countries.js';
import { toEurCents, FX_SOURCE } from './fx.js';
import * as attachments from './attachments.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED = JSON.parse(readFileSync(path.join(__dirname, 'data', 'ana.json'), 'utf8'));
const PORT = Number(process.env.PORT || 8787);
// Demo date: Ana has 140 days in Portugal on 2026-11-08 (contexto.md §5 demo script).
const DEMO_DATE = process.env.DEMO_DATE || '2026-11-08';
const XI_KEY = process.env.ELEVENLABS_API_KEY || '';
const AGENT_ID = process.env.ELEVENLABS_AGENT_ID || '';
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';

let db = structuredClone(SEED);
const referrals = [];
const asOf = () => DEMO_DATE;

const app = express();
app.use(express.json({ limit: '1mb' }));

// Small helper: params from JSON body (ElevenLabs webhooks) or query string.
const params = (req) => ({ ...(req.query || {}), ...(req.body && typeof req.body === 'object' ? req.body : {}) });
const wrap = (fn) => (req, res) => {
  try { res.json(fn(req, res)); } catch (e) { res.status(400).json({ error: e.message }); }
};

// ---------------------------------------------------------------------------
// App API
// ---------------------------------------------------------------------------
app.get('/api/state', wrap(() => ({
  as_of: asOf(),
  profile: db.profile,
  countries: COUNTRIES,
  clients: db.clients,
  trips: db.trips,
  invoices: db.invoices.map((i) => ({ ...i, client: db.clients.find((c) => c.id === i.client_id), eur_cents: E.invoiceEurCents(i), reserve_eur_cents: Math.round(E.invoiceEurCents(i) * i.reserve_rate), attachments: attachments.list(i.id) })),
  expenses: db.expenses.map((e) => ({ ...e, eur_cents: toEurCents(e.amount_cents, e.currency) })),
  documents: db.documents,
  services: { elevenlabs_key: !!XI_KEY, elevenlabs_agent: !!AGENT_ID },
})));

app.get('/api/days', wrap(() => E.daysByCountry(db, asOf())));
app.get('/api/residency', wrap(() => E.residencyStatus(db, asOf())));
app.get('/api/alerts', wrap(() => E.alerts(db, asOf())));
app.get('/api/reserve', wrap(() => ({ ...E.taxReserve(db, asOf()), next_invoice_rate: E.currentReserveRate(db, asOf()) })));
app.get('/api/regimes', wrap(() => E.specialRegimes(db, asOf())));
app.get('/api/traps', wrap(() => E.activeTraps(db, asOf())));
app.get('/api/rules', wrap(() => ({ rules: ALL_RULES, treaties: TREATIES, fx_source: FX_SOURCE })));
app.get('/api/summary', wrap(() => ({ text: E.weeklySummary(db, asOf()) })));

app.post('/api/simulate/stay', wrap((req) => {
  const { country, extra_days } = params(req);
  return E.simulateStay(db, asOf(), String(country).toUpperCase(), Number(extra_days));
}));
app.post('/api/simulate/compare', wrap((req) => E.compareScenarios(db, asOf(), req.body.scenarios, { year: req.body.year })));

app.post('/api/invoices/preview', wrap((req) => E.buildInvoice(db, req.body, asOf())));
app.post('/api/invoices', wrap((req) => {
  const inv = E.buildInvoice(db, req.body, asOf());
  const { client, issuer, ...stored } = inv;
  db.invoices.push(stored);
  return inv;
}));

app.post('/api/expenses/parse', wrap((req) => {
  const parsed = E.parseExpenseText(req.body.text || '', E.buildTimeline(db.trips).get(asOf()) || 'ES');
  return { ...parsed, ...E.classifyExpense(parsed.concept) };
}));
app.post('/api/expenses', wrap((req) => E.registerExpense(db, req.body, asOf())));

app.post('/api/advisor/ask', wrap((req) => ask(db, asOf(), String(req.body.text || ''))));

app.post('/api/referral', wrap((req) => {
  const { name, email, message } = req.body || {};
  if (!email) throw new Error('Falta el email');
  const r = { id: `r${referrals.length + 1}`, name, email, message, created_at: new Date().toISOString() };
  referrals.push(r);
  return { ok: true, referral: r, text: 'Un asesor colaborador te escribirá en menos de 48 h laborables.' };
}));

app.post('/api/reset', wrap(() => { db = structuredClone(SEED); attachments.reset(); return { ok: true }; }));

// ---------------------------------------------------------------------------
// Invoice photos. Upload = raw image body; file name in X-File-Name (URI-encoded).
// ---------------------------------------------------------------------------
const findInvoice = (id) => db.invoices.find((i) => i.id === id);

app.get('/api/invoices/:id/attachments', wrap((req) => {
  if (!findInvoice(req.params.id)) throw new Error('Factura no encontrada');
  return attachments.list(req.params.id);
}));

app.post('/api/invoices/:id/attachments', express.raw({ type: 'image/*', limit: attachments.MAX_BYTES }), wrap((req) => {
  if (!findInvoice(req.params.id)) throw new Error('Factura no encontrada');
  const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  let name = 'foto';
  try { name = decodeURIComponent(String(req.headers['x-file-name'] || 'foto')); } catch { /* keep default */ }
  return attachments.add(req.params.id, Buffer.isBuffer(req.body) ? req.body : null, type, name);
}));

app.delete('/api/invoices/:id/attachments/:aid', wrap((req) => attachments.remove(req.params.id, req.params.aid)));

app.get('/api/attachments/:aid', (req, res) => {
  const a = attachments.find(req.params.aid);
  if (!a) return res.status(404).json({ error: 'Foto no encontrada' });
  res.set({ 'Content-Type': a.type, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
  res.sendFile(a.path);
});

// ---------------------------------------------------------------------------
// ElevenLabs server tools (webhooks). Configure the agent with these URLs.
// Accept GET (query) or POST (JSON body).
// ---------------------------------------------------------------------------
const TOOLS = {
  get_days_by_country: () => {
    const d = E.daysByCountry(db, asOf());
    return Object.fromEntries(d.countries.filter((c) => c.days > 0).map((c) => [c.country, c.days]));
  },
  get_residency_status: () => {
    const r = E.residencyStatus(db, asOf());
    return { country: r.country, reason: r.reason, confidence: r.confidence, notice: r.notice };
  },
  simulate_stay: (p) => {
    const s = E.simulateStay(db, asOf(), String(p.country).toUpperCase(), Number(p.extra_days));
    return { new_residency: s.new_residency, crosses_183: s.crosses_183, tax_delta: s.tax_delta, current_days: s.current_days, days_after: s.days_after, threshold: s.threshold, previous_residency: s.previous_residency, spill_next_year: s.spill_next_year, notice: s.notice };
  },
  get_tax_reserve: () => {
    const r = E.taxReserve(db, asOf());
    return { reserved: Math.round(r.reserved / 100), estimated_due: Math.round(r.estimated_due / 100), currency: 'EUR', residency_country: r.residency_country, notice: r.notice };
  },
  register_expense: (p) => {
    const e = E.registerExpense(db, { concept: p.concept, amount: p.amount, country: p.country && String(p.country).toUpperCase(), currency: p.currency }, asOf());
    return { id: e.id, deductible: e.deductible, category: e.category, note: e.note };
  },
  get_alerts: () => E.alerts(db, asOf()).map((a) => ({ level: a.level, title: a.title, text: a.text })),
  compare_scenarios: (p) => {
    const year = Number(p.year || Number(asOf().slice(0, 4)) + 1);
    const r = E.compareScenarios(db, asOf(), [
      { label: p.country_a, legs: [{ country: String(p.country_a).toUpperCase(), days: Number(p.days || 90) }] },
      { label: p.country_b, legs: [{ country: String(p.country_b).toUpperCase(), days: Number(p.days || 90) }] },
    ], { year });
    return { cheapest: r.cheapest, difference_eur: Math.round(r.difference_eur_cents / 100), results: r.results.map((x) => ({ label: x.label, residency: x.residency.country, total_tax_eur: Math.round(x.tax.total_eur_cents / 100), warnings: x.warnings })), notice: r.notice };
  },
};
app.all('/api/tools/:name', (req, res) => {
  const fn = TOOLS[req.params.name];
  if (!fn) return res.status(404).json({ error: `Unknown tool ${req.params.name}` });
  try { res.json(fn(params(req))); } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---------------------------------------------------------------------------
// ElevenLabs proxies (keep the API key on the server)
// ---------------------------------------------------------------------------
app.get('/api/elevenlabs/session', async (_req, res) => {
  if (!AGENT_ID) return res.json({ mode: 'local' });
  if (!XI_KEY) return res.json({ mode: 'agent', agentId: AGENT_ID }); // public agent
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(AGENT_ID)}`, { headers: { 'xi-api-key': XI_KEY } });
    if (!r.ok) throw new Error(`ElevenLabs ${r.status}`);
    const { token } = await r.json();
    res.json({ mode: 'agent', conversationToken: token });
  } catch (e) {
    res.json({ mode: 'agent', agentId: AGENT_ID, warning: e.message });
  }
});

app.post('/api/tts', async (req, res) => {
  if (!XI_KEY) return res.status(501).json({ error: 'ELEVENLABS_API_KEY no configurada' });
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': XI_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: String(req.body.text || '').slice(0, 2500), model_id: 'eleven_multilingual_v2' }),
    });
    if (!r.ok) throw new Error(`ElevenLabs ${r.status}`);
    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.post('/api/scribe', express.raw({ type: () => true, limit: '20mb' }), async (req, res) => {
  if (!XI_KEY) return res.status(501).json({ error: 'ELEVENLABS_API_KEY no configurada' });
  try {
    const form = new FormData();
    form.append('model_id', process.env.SCRIBE_MODEL || 'scribe_v1');
    form.append('language_code', 'spa');
    form.append('file', new Blob([req.body], { type: req.headers['content-type'] || 'audio/webm' }), 'audio.webm');
    const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': XI_KEY }, body: form });
    if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${await r.text()}`);
    const data = await r.json();
    res.json({ text: data.text });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// ---------------------------------------------------------------------------
// Static build (npm start)
// ---------------------------------------------------------------------------
const dist = path.join(__dirname, '..', 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const server = app.listen(PORT, () => {
  console.log(`Rumbo API on http://localhost:${PORT}  (demo date ${DEMO_DATE}, ElevenLabs agent: ${AGENT_ID ? 'yes' : 'local mode'})`);
});
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[api] El puerto ${PORT} ya está en uso: probablemente hay otro "npm run dev" abierto.`);
    console.error('[api] Ciérralo (Ctrl+C en su terminal) y vuelve a lanzar "npm run dev".\n');
    process.exit(1);
  }
  throw err;
});
