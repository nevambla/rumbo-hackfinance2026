import { useState } from 'react';
import { api } from '../lib/api.js';
import { canRecognize, listenOnce } from '../lib/speech.js';
import { money, date, countryName, currentTrip } from '../lib/format.js';
import Icon from './Icon.jsx';
import { Button, Country } from './ui.jsx';

const CODES = ['ES', 'PT', 'MX', 'CO', 'TH'];
const CITY_COUNTRY = {
  madrid: 'ES', barcelona: 'ES', valencia: 'ES', sevilla: 'ES', españa: 'ES',
  lisboa: 'PT', oporto: 'PT', porto: 'PT', portugal: 'PT',
  medellín: 'CO', medellin: 'CO', bogotá: 'CO', bogota: 'CO', cartagena: 'CO', colombia: 'CO',
  'ciudad de méxico': 'MX', cdmx: 'MX', méxico: 'MX', mexico: 'MX', oaxaca: 'MX',
  bangkok: 'TH', 'chiang mai': 'TH', tailandia: 'TH',
};

/** Lightweight local reading of "Coworking en Medellín, 80 euros". The backend classifies it. */
function readExpense(text, fallbackCountry) {
  const lower = text.toLowerCase();
  const amount = lower.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:€|euros?|eur)?/);
  const city = Object.keys(CITY_COUNTRY).find((c) => lower.includes(c));
  const concept = text.replace(/,?\s*\d+(?:[.,]\d{1,2})?\s*(?:€|euros?|eur)?\.?\s*$/i, '').trim() || text.trim();
  return { concept, amount: amount ? amount[1].replace(',', '.') : '', country: city ? CITY_COUNTRY[city] : fallbackCountry };
}

export default function Expenses({ state, refresh, notify }) {
  const here = currentTrip(state)?.country || 'ES';
  const [text, setText] = useState('Coworking en Medellín, 80 euros');
  const [form, setForm] = useState(null);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [flashId, setFlashId] = useState(null);

  const interpret = (t) => setForm(readExpense(t, here));

  const dictate = async () => {
    try {
      setListening(true);
      setStatus('Te escucho…');
      const t = await listenOnce();
      setStatus('');
      if (t) { setText(t); interpret(t); }
    } catch (e) { setStatus(e.message); }
    finally { setListening(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.post('/api/tools/expenses', { concept: form.concept, amount_eur: Number(form.amount), country: form.country });
      await refresh();
      setForm(null);
      setFlashId(r.expense.id);
      notify(r.message_es || `Gasto registrado: ${r.expense.category}`);
    } catch (e) { notify(e.message, 'error'); }
    setSaving(false);
  };

  const expenses = [...state.expenses].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="stack">
      <section className="card">
        <div className="dictate">
          <button className={`mic-xl ${listening ? 'live' : ''}`} onClick={dictate} disabled={!canRecognize() || listening} aria-label="Dictar gasto">
            <Icon name="mic" size={30} />
          </button>
          <form className="grow group" onSubmit={(e) => { e.preventDefault(); interpret(text); }}>
            <h2>Dicta un gasto</h2>
            <p className="small muted">Di el concepto, la ciudad y el importe. También puedes decírselo al asesor por voz.</p>
            <div className="row">
              <input className="grow" value={text} onChange={(e) => setText(e.target.value)} aria-label="Gasto" />
              <Button>Interpretar</Button>
            </div>
            {status && <p className="small muted">{status}</p>}
          </form>
        </div>

        {form && (
          <div className="parsed enter">
            <label className="full">Concepto<input value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })} /></label>
            <label>Importe (€)<input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
            <label>País
              <select value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
                {CODES.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
              </select>
            </label>
            <div className="full"><Button variant="primary" onClick={save} busy={saving} disabled={!(Number(form.amount) > 0) || !form.concept}>Registrar gasto</Button></div>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Gastos registrados</h2>
        <div className="table-wrap">
          <table className="responsive">
            <thead><tr><th>Fecha</th><th>Concepto</th><th>País</th><th>Categoría</th><th className="num">Importe</th><th>Deducible</th></tr></thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className={e.id === flashId ? 'flash' : ''}>
                  <td data-label="Fecha" className="nowrap">{date(e.date)}</td>
                  <td className="cell-title">{e.concept}</td>
                  <td data-label="País"><Country code={e.country} /></td>
                  <td data-label="Categoría">{e.category}</td>
                  <td data-label="Importe" className="num">{money(e.amount_cents, e.currency)}</td>
                  <td data-label="Deducible" className={e.deductible ? '' : 'warn-text'}>{e.deductible ? 'Sí' : 'Revisar'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
