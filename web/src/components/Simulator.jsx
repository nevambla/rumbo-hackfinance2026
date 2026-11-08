import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { eur, pct, COUNTRY_COLORS } from '../lib/format.js';
import Icon from './Icon.jsx';
import { Country, Skeleton, Spinner } from './ui.jsx';

const CODES = ['ES', 'PT', 'MX', 'CO', 'TH'];
const STATUS = { posible: ['ok', 'Podrías encajar'], no_elegible: ['danger', 'No encajas'], revisar: ['warning', 'Por revisar'], info: ['', 'Información'] };

const PRESETS = {
  winter: {
    label: 'Invierno: México o Tailandia', year: 'next',
    scenarios: [
      { label: 'Invierno en México', legs: [{ country: 'MX', days: 120 }], fill_country: 'ES' },
      { label: 'Invierno en Tailandia', legs: [{ country: 'TH', days: 120 }], fill_country: 'ES' },
    ],
  },
  half: {
    label: 'Medio año fuera', year: 'next',
    scenarios: [
      { label: 'México y luego Portugal', legs: [{ country: 'MX', days: 200 }], fill_country: 'PT' },
      { label: 'Tailandia y luego España', legs: [{ country: 'TH', days: 200 }], fill_country: 'ES' },
    ],
  },
  lisbon: {
    label: 'Resto del año: Lisboa o Bangkok', year: 'current',
    scenarios: [
      { label: 'Me quedo en Lisboa', legs: [{ country: 'PT', days: 53 }], fill_country: 'PT' },
      { label: 'Me voy a Bangkok', legs: [{ country: 'PT', days: 11 }, { country: 'TH', days: 42 }], fill_country: 'TH' },
    ],
  },
};

const CountrySelect = ({ value, onChange, label }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
    {CODES.map((c) => <option key={c} value={c}>{({ ES: 'España', PT: 'Portugal', MX: 'México', CO: 'Colombia', TH: 'Tailandia' })[c]}</option>)}
  </select>
);

function StaySim({ state }) {
  const [country, setCountry] = useState(state.trips.find((t) => t.start <= state.as_of && t.end >= state.as_of)?.country || 'PT');
  const [days, setDays] = useState(60);
  const [r, setR] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => api.post('/api/simulate/stay', { country, extra_days: days }).then(setR).finally(() => setLoading(false)), 180);
    return () => clearTimeout(t);
  }, [country, days]);

  const level = r ? (r.crosses_183 ? 'danger' : r.already_crossing ? 'warning' : 'ok') : '';
  const need = r ? r.threshold + (r.country === 'TH' ? 0 : 1) : 184;
  return (
    <section className="card">
      <h2>Si alargo mi estancia…</h2>
      <div className="row wrap" style={{ gap: 'var(--s-4)' }}>
        <label>País<CountrySelect value={country} onChange={setCountry} label="País" /></label>
        <label className="grow">{days} días más
          <input type="range" min="1" max="120" value={days} onChange={(e) => setDays(Number(e.target.value))} />
        </label>
      </div>
      {!r ? <Skeleton lines={3} /> : (
        <div className={`stay-result ${level} ${loading ? 'loading-fade' : ''}`}>
          <p className="stay-headline">
            {r.crosses_183 ? `Pasarías a ser residente fiscal en ${r.country_name}`
              : r.already_crossing ? `Ya ibas a ser residente en ${r.country_name}`
                : `Seguirías sin ser residente en ${r.country_name}`}
          </p>
          <div className="bar" role="img" aria-label={`${r.current_days} a ${r.days_after} días`}>
            <span className="plan" style={{ width: `${Math.min(100, (r.days_after / need) * 100)}%`, background: COUNTRY_COLORS[country] }} />
            <span style={{ width: `${Math.min(100, (r.current_days / need) * 100)}%`, background: COUNTRY_COLORS[country] }} />
          </div>
          <div className="kv"><span>Días en {r.country_name}</span><strong>{r.current_days} → {r.days_after} <span className="muted">/ {r.threshold}</span></strong></div>
          <div className="kv"><span>Residencia probable</span><strong><Country code={r.new_residency} /></strong></div>
          <div className="kv total"><span>Impuestos al año</span><strong>{eur(r.tax_after_eur_cents)} <span className={`small ${r.tax_delta_eur_cents > 0 ? 'danger-text' : 'ok-text'}`}>{r.tax_delta_eur_cents === 0 ? '' : `${r.tax_delta_eur_cents > 0 ? '+' : '−'}${eur(Math.abs(r.tax_delta_eur_cents))}`}</span></strong></div>
          {r.spill_next_year > 0 && <p className="small muted">{r.spill_next_year} de esos días caen en {Number(state.as_of.slice(0, 4)) + 1}.</p>}
          {r.special_regimes.filter((x) => x.status === 'posible').map((x) => <p key={x.id} className="small">Podrías estudiar el {x.name}.</p>)}
        </div>
      )}
    </section>
  );
}

function ScenarioEditor({ s, onChange }) {
  const setLeg = (i, patch) => onChange({ ...s, legs: s.legs.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  return (
    <div className="scenario-edit">
      <input className="scenario-title" value={s.label} onChange={(e) => onChange({ ...s, label: e.target.value })} aria-label="Nombre del escenario" />
      {s.legs.map((l, i) => (
        <div key={i} className="row">
          <CountrySelect value={l.country} onChange={(v) => setLeg(i, { country: v })} label="País del tramo" />
          <input type="number" min="1" max="365" value={l.days} onChange={(e) => setLeg(i, { days: Number(e.target.value) })} aria-label="Días" />
          <span className="small muted">días</span>
          {s.legs.length > 1 && <button className="btn ghost small" onClick={() => onChange({ ...s, legs: s.legs.filter((_, j) => j !== i) })} aria-label="Quitar tramo"><Icon name="x" size={14} /></button>}
        </div>
      ))}
      <div className="row wrap">
        <button className="link small" onClick={() => onChange({ ...s, legs: [...s.legs, { country: 'ES', days: 30 }] })}><Icon name="plus" size={14} /> Añadir tramo</button>
      </div>
      <label>Resto del año en<CountrySelect value={s.fill_country} onChange={(v) => onChange({ ...s, fill_country: v })} label="Resto del año" /></label>
    </div>
  );
}

export default function Simulator({ state }) {
  const currentYear = Number(state.as_of.slice(0, 4));
  const [preset, setPreset] = useState('winter');
  const [yearMode, setYearMode] = useState(PRESETS.winter.year);
  const [scenarios, setScenarios] = useState(PRESETS.winter.scenarios);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const loadPreset = (k) => { setPreset(k); setYearMode(PRESETS[k].year); setScenarios(PRESETS[k].scenarios); };

  useEffect(() => {
    const year = yearMode === 'next' ? currentYear + 1 : currentYear;
    setLoading(true);
    const t = setTimeout(() => api.post('/api/simulate/compare', { scenarios, year })
      .then((r) => { setResult(r); setErr(null); })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false)), 250);
    return () => clearTimeout(t);
  }, [scenarios, yearMode, currentYear]);

  return (
    <div className="stack">
      <StaySim state={state} />

      <section className="card">
        <div className="group-head">
          <h2>Compara dos planes {loading && <Spinner />}</h2>
          <div className="seg">
            <button className={yearMode === 'current' ? 'on' : ''} onClick={() => setYearMode('current')}>Resto de {currentYear}</button>
            <button className={yearMode === 'next' ? 'on' : ''} onClick={() => setYearMode('next')}>{currentYear + 1} completo</button>
          </div>
        </div>
        <div className="prompts">
          {Object.entries(PRESETS).map(([k, p]) => <button key={k} className={`chip ${preset === k ? 'on' : ''}`} onClick={() => loadPreset(k)}>{p.label}</button>)}
        </div>
        {err && <p className="small danger-text">{err}</p>}
        <div className={`grid-2 ${loading ? 'loading-fade' : ''}`}>
          {scenarios.map((s, i) => {
            const r = result?.results[i];
            const best = result && !result.same_residency && result.cheapest === s.label;
            return (
              <div key={i} className={`scenario ${best ? 'best' : ''}`}>
                <ScenarioEditor s={s} onChange={(ns) => setScenarios(scenarios.map((x, j) => (j === i ? ns : x)))} />
                {!r ? <Skeleton lines={4} /> : (
                  <div>
                    {r.days.map((d) => (
                      <div key={d.country} className="mini-day">
                        <Country code={d.country} />
                        <div className="bar"><span style={{ width: `${Math.min(100, (d.rule_days / d.threshold) * 100)}%`, background: COUNTRY_COLORS[d.country] }} /></div>
                        <span className={`num ${d.rule_days > d.threshold ? 'danger-text' : 'muted'}`}>{d.days} d</span>
                      </div>
                    ))}
                    <div className="kv"><span>Residencia probable</span><strong><Country code={r.residency.country} /></strong></div>
                    <div className="kv"><span>Renta</span><strong>{eur(r.tax.income_tax_eur_cents)}</strong></div>
                    <div className="kv"><span>Cotizaciones</span><strong>{eur(r.tax.social_security_eur_cents)}</strong></div>
                    <div className="kv"><span>Tipo efectivo</span><strong>{pct(r.tax.effective_rate)}</strong></div>
                    <div className="kv total"><span>Total al año</span><strong className={best ? 'ok-text' : ''}>{eur(r.tax.total_eur_cents)}</strong></div>
                    {best && <p className="small ok-text">{eur(result.difference_eur_cents)} menos que la otra opción</p>}
                    {r.warnings.map((w, k) => <p key={k} className="small warn-text">{w}</p>)}
                    {r.special_regimes.map((x) => <p key={x.id} className="small">{x.name}: <span className={`tag ${STATUS[x.status]?.[0]}`}>{STATUS[x.status]?.[1]}</span></p>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {result?.same_residency && <p className="note">Tu residencia sería la misma en los dos planes, así que pagarías prácticamente lo mismo. Solo cambia si superas el umbral de días en otro país.</p>}
        <p className="small muted">En Tailandia la renta extranjera solo tributa si la traes al país; aquí asumimos el caso más prudente.</p>
      </section>
    </div>
  );
}
