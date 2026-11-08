import { useState } from 'react';
import { api } from '../lib/api.js';
import { canRecognize, listenOnce, startRecording, scribe } from '../lib/speech.js';
import { eur, money, date } from '../lib/format.js';
import Icon from './Icon.jsx';
import { Button, Country } from './ui.jsx';

export default function Expenses({ state, refresh, notify }) {
  const [text, setText] = useState('Coworking en Medellín, 80 euros');
  const [parsed, setParsed] = useState(null);
  const [recording, setRecording] = useState(null);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState('');
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flashId, setFlashId] = useState(null);
  const useScribe = state.services.elevenlabs_key;

  const parse = async (t) => {
    setParsing(true);
    try { setParsed(await api.post('/api/expenses/parse', { text: t })); } finally { setParsing(false); }
  };

  const dictate = async () => {
    setStatus('');
    if (useScribe) {
      if (!recording) {
        try { setRecording(await startRecording()); setStatus('Grabando. Pulsa otra vez para terminar.'); }
        catch (e) { setStatus(e.message); }
        return;
      }
      const blob = await recording.stop();
      setRecording(null);
      setStatus('Transcribiendo…');
      try { const t = await scribe(blob); setText(t); setStatus(''); await parse(t); }
      catch (e) { setStatus(e.message); }
      return;
    }
    try {
      setListening(true);
      setStatus('Te escucho…');
      const t = await listenOnce();
      setStatus('');
      if (t) { setText(t); await parse(t); }
    } catch (e) { setStatus(e.message); }
    finally { setListening(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.post('/api/expenses', { concept: parsed.concept, amount_cents: parsed.amount_cents, currency: parsed.currency, country: parsed.country });
      await refresh();
      setParsed(null);
      setFlashId(r.id);
      notify(`Gasto registrado: ${r.category}`);
    } catch (e) { notify(e.message, 'error'); }
    setSaving(false);
  };

  const expenses = [...state.expenses].reverse();
  const live = !!recording || listening;

  return (
    <div className="stack">
      <section className="card">
        <div className="dictate">
          <button className={`mic-xl ${live ? 'live' : ''}`} onClick={dictate} disabled={!useScribe && !canRecognize()} aria-label={live ? 'Parar' : 'Dictar gasto'}>
            <Icon name={recording ? 'stop' : 'mic'} size={30} />
          </button>
          <form className="grow group" onSubmit={(e) => { e.preventDefault(); parse(text); }}>
            <h2>Dicta un gasto</h2>
            <p className="small muted">Di el concepto, la ciudad y el importe. Lo registramos y lo clasificamos.</p>
            <div className="row">
              <input className="grow" value={text} onChange={(e) => setText(e.target.value)} aria-label="Gasto" />
              <Button busy={parsing}>Interpretar</Button>
            </div>
            {status && <p className="small muted">{status}</p>}
          </form>
        </div>

        {parsed && (
          <div className="parsed enter">
            <label className="full">Concepto<input value={parsed.concept} onChange={(e) => setParsed({ ...parsed, concept: e.target.value })} /></label>
            <div><span className="small muted">Importe</span><strong>{parsed.amount_cents ? money(parsed.amount_cents, parsed.currency) : 'Sin importe'}</strong></div>
            <div><span className="small muted">País</span><strong><Country code={parsed.country} /></strong></div>
            <div><span className="small muted">Categoría</span><strong>{parsed.category}</strong></div>
            <div><span className="small muted">Deducible</span><strong className={parsed.deductible ? 'ok-text' : 'warn-text'}>{parsed.deductible ? 'Sí' : 'Revisar'}</strong></div>
            {parsed.note && <p className="small muted full">{parsed.note}</p>}
            <div className="full"><Button variant="primary" onClick={save} busy={saving} disabled={!parsed.amount_cents}>Registrar gasto</Button></div>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Gastos registrados</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Concepto</th><th>País</th><th>Categoría</th><th className="num">Importe</th><th className="num">En EUR</th><th>Deducible</th></tr></thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className={e.id === flashId ? 'flash' : ''}>
                  <td className="nowrap">{date(e.date)}</td>
                  <td>{e.concept}</td>
                  <td><Country code={e.country} /></td>
                  <td>{e.category}</td>
                  <td className="num">{money(e.amount_cents, e.currency)}</td>
                  <td className="num">{eur(e.eur_cents)}</td>
                  <td className={e.deductible ? '' : 'warn-text'}>{e.deductible ? 'Sí' : 'Revisar'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
