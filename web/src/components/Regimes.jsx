import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import Icon from './Icon.jsx';
import { Country, Skeleton, SourceLink } from './ui.jsx';

const STATUS = { posible: ['ok', 'Podrías encajar'], no_elegible: ['danger', 'No encajas'], revisar: ['warning', 'Por revisar'], info: ['', 'Información'] };
const CODES = ['ES', 'PT', 'MX', 'CO', 'TH'];

export default function Regimes({ go }) {
  const [regimes, setRegimes] = useState(null);
  const [traps, setTraps] = useState(null);
  const [treaties, setTreaties] = useState(null);
  useEffect(() => {
    api.get('/api/regimes').then(setRegimes);
    api.get('/api/traps').then(setTraps);
    api.get('/api/rules').then((r) => setTreaties(r.treaties));
  }, []);

  const treaty = (a, b) => treaties.find((t) => t.countries.includes(a) && t.countries.includes(b));
  // Most relevant first
  const order = { posible: 0, revisar: 1, info: 2, no_elegible: 3 };
  const sortedRegimes = regimes && [...regimes].sort((a, b) => order[a.status] - order[b.status]);
  const sortedTraps = traps && [...traps].sort((a, b) => Number(b.applies) - Number(a.applies));

  return (
    <div className="stack">
      <section className="group">
        <h2>Regímenes especiales según tu historial</h2>
        {!sortedRegimes ? <div className="card"><Skeleton lines={5} /></div> : (
          <div className="grid-2">
            {sortedRegimes.map((r) => (
              <article key={r.id} className="card">
                <div className="row between">
                  <h3>{r.name}</h3>
                  <span className={`tag ${STATUS[r.status][0]}`}>{STATUS[r.status][1]}</span>
                </div>
                <span className="small"><Country code={r.country} /></span>
                <p className="small muted">{r.summary}</p>
                {r.why !== r.summary && <p className="small">{r.why}</p>}
                <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>{r.requirements.map((q) => <li key={q}>{q}</li>)}</ul>
                <SourceLink href={r.source_url} />
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="group">
        <h2>Trampas que vigilamos</h2>
        {!sortedTraps ? <div className="card"><Skeleton lines={4} /></div> : (
          <div className="grid-2">
            {sortedTraps.map((t) => (
              <article key={t.id} className={`card ${t.applies ? 'item applies' : ''}`}>
                <div className="row between">
                  <h3>{t.title}</h3>
                  {t.applies && <span className="tag danger"><Icon name="alert" size={12} />Te afecta</span>}
                </div>
                <p className="small muted">{t.text}</p>
                <SourceLink href={t.source_url} />
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Convenios para evitar la doble imposición</h2>
        {!treaties ? <Skeleton lines={5} /> : (
          <div className="table-wrap">
            <table className="matrix">
              <thead><tr><th />{CODES.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>
                {CODES.map((a) => (
                  <tr key={a}>
                    <th><Country code={a} /></th>
                    {CODES.map((b) => {
                      if (a === b) return <td key={b} className="muted">–</td>;
                      const t = treaty(a, b);
                      return (
                        <td key={b}>
                          {t?.in_force
                            ? <a href={t.source_url} target="_blank" rel="noreferrer" className="ok-text" aria-label="Convenio en vigor"><Icon name="check" size={16} className="" /></a>
                            : <span className="muted small">No</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="small muted">Sin convenio, tu país de residencia aplica su propia deducción por doble imposición. Si tienes un caso complejo, <button className="link" onClick={() => go('planes')}>habla con un asesor</button>.</p>
      </section>
    </div>
  );
}
