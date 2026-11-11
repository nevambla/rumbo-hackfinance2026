import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { eur, date, countryName, currentTrip, residentClaims } from '../lib/format.js';
import { Country, Skeleton, Spinner } from './ui.jsx';

const CODES = ['ES', 'PT', 'MX', 'CO', 'TH'];

const CountrySelect = ({ value, onChange, label }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
    {CODES.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
  </select>
);

/** Calls POST /api/tools/simulate (never saves anything) with a small debounce. */
function useSimulation(country, days) {
  const [r, setR] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => api.post('/api/tools/simulate', { country, extra_days: days })
      .then((x) => { setR(x); setErr(null); })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false)), 200);
    return () => clearTimeout(t);
  }, [country, days]);
  return { r, loading, err };
}

function Residency({ res }) {
  const claims = residentClaims(res);
  if (!claims.length) return <span className="muted">Ninguno</span>;
  return <span className="row wrap">{claims.map((c) => <Country key={c.country} code={c.country} />)}</span>;
}

function Result({ r, loading, compact = false }) {
  const level = r.crosses_threshold ? 'danger' : r.days_after > r.threshold * 0.85 ? 'warning' : 'ok';
  const name = countryName(r.country);
  return (
    <div className={`stay-result ${level} ${loading ? 'loading-fade' : ''}`}>
      <p className="stay-headline">
        {r.crosses_threshold ? `Pasarías a ser residente fiscal en ${name}` : `Seguirías sin ser residente en ${name}`}
      </p>
      <div className="meter" style={{ '--t': `${(r.threshold / 365) * 100}%` }} data-t={r.threshold} role="img" aria-label={`${r.days_before} a ${r.days_after} días; umbral ${r.threshold}`}>
        <span className="plan" style={{ width: `${Math.min(100, (r.days_after / 365) * 100)}%` }} />
        <span style={{ width: `${Math.min(100, (r.days_before / 365) * 100)}%` }} />
      </div>
      <div className="kv"><span>Días en {name}</span><strong>{r.days_before} → {r.days_after} <span className="muted">/ {r.threshold}</span></strong></div>
      {r.cross_date && <div className="kv"><span>Cruzarías el umbral</span><strong className="danger-text">{date(r.cross_date)}</strong></div>}
      <div className="kv"><span>Residencia {r.after.year}</span><strong><Residency res={r.after} /></strong></div>
      {r.after.dual_residency && <div className="kv"><span>Doble residencia</span><strong className="danger-text">Decide el convenio</strong></div>}
      <div className="kv total">
        <span>Impuestos al año</span>
        <strong>{eur(r.tax_after_cents)} <span className={`small ${r.tax_delta_cents > 0 ? 'danger-text' : 'ok-text'}`}>{r.tax_delta_cents === 0 ? '' : `${r.tax_delta_cents > 0 ? '+' : '−'}${eur(Math.abs(r.tax_delta_cents))}`}</span></strong>
      </div>
      {Object.keys(r.tax_by_country_after_cents).length > 1 && (
        <p className="small muted">Si tributases en cada país: {Object.entries(r.tax_by_country_after_cents).map(([c, v]) => `${countryName(c)} ${eur(v)}`).join(' · ')}</p>
      )}
      {!compact && <p className="small">{r.explanation_es}</p>}
      {r.overlaps_planned_es.length > 0 && <p className="small warn-text">Se solapa con: {r.overlaps_planned_es.join(', ')}</p>}
    </div>
  );
}

function StaySim({ state }) {
  const [country, setCountry] = useState(currentTrip(state)?.country || 'PT');
  const [days, setDays] = useState(60);
  const { r, loading, err } = useSimulation(country, days);
  return (
    <section className="card">
      <h2>Si alargo mi estancia… {loading && <Spinner />}</h2>
      <div className="row wrap" style={{ gap: 'var(--s-4)' }}>
        <label>País<CountrySelect value={country} onChange={setCountry} label="País" /></label>
        <label className="grow">{days} días más
          <input type="range" min="1" max="120" value={days} onChange={(e) => setDays(Number(e.target.value))} />
        </label>
      </div>
      {err && <p className="small danger-text">{err}</p>}
      {!r ? <Skeleton lines={3} /> : <Result r={r} loading={loading} />}
    </section>
  );
}

function Option({ value, onChange }) {
  const { r, loading } = useSimulation(value.country, value.days);
  return (
    <div className="scenario">
      <div className="scenario-edit">
        <div className="row">
          <CountrySelect value={value.country} onChange={(c) => onChange({ ...value, country: c })} label="País" />
          <input type="number" min="1" max="365" value={value.days} onChange={(e) => onChange({ ...value, days: Math.max(1, Number(e.target.value) || 1) })} aria-label="Días" />
          <span className="small muted">días desde hoy</span>
        </div>
      </div>
      {!r ? <Skeleton lines={4} /> : <Result r={r} loading={loading} compact />}
    </div>
  );
}

export default function Simulator({ state }) {
  const [a, setA] = useState({ country: 'PT', days: 60 });
  const [b, setB] = useState({ country: 'TH', days: 60 });
  return (
    <div className="stack">
      <StaySim state={state} />
      <section className="card">
        <div className="group-head">
          <h2>Compara dos planes</h2>
          <span className="small muted">¿Me quedo o me voy? Misma duración, distinto país</span>
        </div>
        <div className="grid-2">
          <Option value={a} onChange={setA} />
          <Option value={b} onChange={setB} />
        </div>
        <p className="small muted">Estimaciones con reglas simplificadas y pendientes de verificar. En Tailandia la renta extranjera solo tributa si la traes al país.</p>
      </section>
    </div>
  );
}
