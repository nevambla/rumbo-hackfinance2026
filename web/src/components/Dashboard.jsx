import { useMemo } from 'react';
import { COUNTRY_COLORS, eur, date } from '../lib/format.js';
import Icon from './Icon.jsx';
import { Country } from './ui.jsx';

const CONF = { alta: 'ok', media: 'warning', baja: 'danger' };
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function YearStrip({ trips, year, asOf, countries }) {
  const { cells, monthCols, weeks } = useMemo(() => {
    const map = new Map();
    for (const t of trips) {
      for (let d = new Date(`${t.start}T00:00:00Z`); d <= new Date(`${t.end}T00:00:00Z`); d = new Date(d.getTime() + 86400000)) {
        map.set(d.toISOString().slice(0, 10), t);
      }
    }
    // Week columns (Mon–Sun rows), like a contribution calendar, so months line up horizontally.
    const first = new Date(`${year}-01-01T00:00:00Z`);
    const offset = (first.getUTCDay() + 6) % 7;
    const out = Array.from({ length: offset }, (_, i) => ({ key: `pad${i}`, pad: true }));
    const monthCols = [];
    for (let d = first; d.getUTCFullYear() === year; d = new Date(d.getTime() + 86400000)) {
      const key = d.toISOString().slice(0, 10);
      if (d.getUTCDate() === 1) monthCols.push(Math.floor(out.length / 7));
      out.push({ key, trip: map.get(key), future: key > asOf, today: key === asOf });
    }
    return { cells: out, monthCols, weeks: Math.ceil(out.length / 7) };
  }, [trips, year, asOf]);

  return (
    <div className="group">
      <div className="strip" role="img" aria-label={`Calendario de ${year} por país`}>
        {cells.map((c) => (
          <span
            key={c.key}
            className={`cell ${c.pad ? 'pad' : ''} ${c.future ? 'future' : ''} ${c.today ? 'today' : ''}`}
            style={c.pad ? undefined : { background: c.trip ? COUNTRY_COLORS[c.trip.country] : 'var(--surface-2)' }}
            title={c.pad ? undefined : `${date(c.key)} · ${c.trip ? `${countries[c.trip.country].name}, ${c.trip.city}` : 'sin datos'}${c.future ? ' (planificado)' : ''}`}
          />
        ))}
      </div>
      <div className="strip-months" aria-hidden="true">
        {MONTHS.map((m, i) => <span key={m} style={{ left: `${(monthCols[i] / weeks) * 100}%` }}>{m}</span>)}
      </div>
      <div className="legend">
        {Object.keys(COUNTRY_COLORS).map((c) => <Country key={c} code={c} />)}
        <span className="country faded"><i style={{ background: 'var(--text-2)' }} />Planificado</span>
      </div>
    </div>
  );
}

export default function Dashboard({ state, days, residency, alerts, reserve, go }) {
  const here = days.countries.find((c) => c.country === days.current_country);
  const others = days.countries;
  const trips = state.trips.filter((t) => t.end >= `${days.year}-01-01`);
  const currentTrip = trips.find((t) => t.start <= days.as_of && t.end >= days.as_of);
  const urgent = alerts.filter((a) => a.level !== 'info').slice(0, 3);
  const needed = here ? here.threshold + (here.country === 'TH' ? 0 : 1) : 184;

  return (
    <div className="stack">
      {/* Main feature, enlarged: how many days left where you are now */}
      <section className="hero">
        {here && (
          <div className="card hero-main">
            <span className="label">Días en {here.name} en {days.year}</span>
            <div className="hero-num">
              <strong>{here.days}</strong>
              <span>días · te quedan <em>{here.days_left}</em></span>
            </div>
            <div className="group">
              <div className="meter" style={{ '--t': `${(needed / 365) * 100}%` }} data-t={needed} role="img" aria-label={`${here.days} días de ${needed} para ser residente; con tu plan ${here.rule_projected_days}`}>
                <span className="plan" style={{ width: `${Math.min(100, (here.rule_projected_days / 365) * 100)}%` }} />
                <span style={{ width: `${Math.min(100, (here.rule_days / 365) * 100)}%` }} />
              </div>
              <div className="hero-scale"><span>1 ene</span><span>31 dic</span></div>
            </div>
            <p className="hero-text">
              {here.crosses_projected
                ? <>Con tu plan llegarás a <strong>{here.rule_projected_days} días</strong> y serás residente fiscal en {here.name}.</>
                : <>Con tu plan{currentTrip ? ` (hasta el ${date(currentTrip.end)})` : ''} terminarás con <strong>{here.rule_projected_days} días</strong>: {needed - here.rule_projected_days} por debajo del umbral.</>}
            </p>
            <div className="row wrap">
              <button className="btn primary" onClick={() => go('simulador')}>Simular quedarme más <Icon name="arrowRight" size={16} /></button>
            </div>
          </div>
        )}

        <div className="card residency-card">
          <span className="label">Residencia fiscal estimada {residency.year}</span>
          <div className="big"><Country code={residency.country} /></div>
          <span className={`tag ${CONF[residency.confidence]}`}>Confianza {residency.confidence}</span>
          <p className="small muted">{residency.reason}</p>
          {residency.confidence !== 'alta' && (
            <button className="link small" onClick={() => go('planes')}>Confirmarlo con un asesor <Icon name="arrowRight" size={14} /></button>
          )}
        </div>
      </section>

      <section className="grid-2">
        <div className="card stat">
          <span className="label">Apartado para impuestos</span>
          <div className="big">{eur(reserve.reserved)}</div>
          <p className="small muted">de {eur(reserve.estimated_due)} estimados si tributas en {state.countries[reserve.residency_country].name}</p>
          <div className="bar"><span style={{ width: `${Math.min(100, (reserve.reserved / reserve.estimated_due) * 100)}%`, background: 'var(--cian)' }} /></div>
          <button className="link small" onClick={() => go('aparta')}>Ver facturas <Icon name="arrowRight" size={14} /></button>
        </div>
        <div className="card">
          <span className="label">Avisos</span>
          {urgent.length === 0 ? <p className="muted">Nada urgente.</p> : (
            <ul className="alert-list">
              {urgent.map((a) => (
                <li key={a.id}>
                  <Icon name="alert" size={16} className={a.level === 'danger' ? 'danger-text' : 'warn-text'} />
                  {a.title}
                </li>
              ))}
            </ul>
          )}
          <button className="link small" onClick={() => go('avisa')}>Ver todos <Icon name="arrowRight" size={14} /></button>
        </div>
      </section>

      <section className="card">
        <div className="group-head">
          <h2>Todos los países</h2>
          <span className="small muted">{days.total_days_elapsed} días transcurridos</span>
        </div>
        <div className="counter-list">
          {others.map((c) => {
            const need = c.threshold + (c.country === 'TH' ? 0 : 1);
            const level = c.crosses_projected ? 'danger-text' : c.rule_days > 0 && c.days_left <= 60 ? 'warn-text' : '';
            return (
              <div key={c.country} className="counter-row">
                <Country code={c.country} />
                <div className="bar">
                  <span className="plan" style={{ width: `${Math.min(100, (c.rule_projected_days / need) * 100)}%`, background: COUNTRY_COLORS[c.country] }} />
                  <span style={{ width: `${Math.min(100, (c.rule_days / need) * 100)}%`, background: COUNTRY_COLORS[c.country] }} />
                </div>
                <span className={`num ${level}`}><strong>{c.days}</strong> / {c.threshold}</span>
              </div>
            );
          })}
        </div>
        <YearStrip trips={trips} year={days.year} asOf={days.as_of} countries={state.countries} />
      </section>

      <section className="card">
        <h2>Viajes</h2>
        <div className="table-wrap">
          <table className="responsive">
            <thead><tr><th>País</th><th>Ciudad</th><th>Desde</th><th>Hasta</th><th>Origen del dato</th></tr></thead>
            <tbody>
              {trips.map((t) => (
                <tr key={t.id} className={t.start > days.as_of ? 'muted' : ''}>
                  <td className="cell-title"><Country code={t.country} /> <span className="mobile-only">· {t.city}</span></td>
                  <td data-label="Ciudad" className="desktop-only">{t.city}{t.start <= days.as_of && t.end >= days.as_of ? ' (ahora)' : ''}</td>
                  <td data-label="Desde">{date(t.start < `${days.year}-01-01` ? `${days.year}-01-01` : t.start)}</td>
                  <td data-label="Hasta">{date(t.end)}</td>
                  <td data-label="Origen">{t.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
