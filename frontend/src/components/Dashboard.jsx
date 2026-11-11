import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { COUNTRY_COLORS, eur, date, countryName, currentTrip, residentClaims } from '../lib/format.js';
import Icon from './Icon.jsx';
import { Button, Country, SourceLink } from './ui.jsx';
import Mascot from './Mascot.jsx';

// Low confidence is an honest caveat, not an alarm: neutral tag plus the reason. Red stays for dual residency.
function ConfidenceTag({ residency }) {
  const pending = residency.pending_questions?.length > 0;
  const cls = residency.confidence === 'alta' ? 'ok' : '';
  return <span className={`tag ${cls}`}>Confianza {residency.confidence}{pending ? ' · faltan respuestas' : ''}</span>;
}
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const SOURCE = { seed: 'Historial', manual: 'Manual', booking: 'Reserva', parsed: 'Reserva pegada' };

function YearStrip({ trips, year, asOf }) {
  const { cells, monthCols, weeks } = useMemo(() => {
    const map = new Map();
    for (const t of trips) {
      const end = t.end_date || (t.planned ? t.start_date : asOf);
      for (let d = new Date(`${t.start_date}T00:00:00Z`); d <= new Date(`${end}T00:00:00Z`); d = new Date(d.getTime() + 86400000)) {
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
            style={c.pad ? undefined : { background: c.trip ? COUNTRY_COLORS[c.trip.country] || 'var(--text-3)' : 'var(--surface-2)' }}
            title={c.pad ? undefined : `${date(c.key)} · ${c.trip ? `${countryName(c.trip.country)}, ${c.trip.city}` : 'sin datos'}${c.future ? ' (planificado)' : ''}`}
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

/** Preguntas pendientes y criterios de desempate del convenio: se contestan aquí o por voz. */
function Questions({ residency, refresh, notify }) {
  const [busy, setBusy] = useState(null);
  const answer = async (question_key, value) => {
    setBusy(question_key);
    try {
      await api.post('/api/tools/answers', { question_key, value });
      await refresh();
      notify('Respuesta guardada; residencia recalculada');
    } catch (e) { notify(e.message, 'error'); }
    setBusy(null);
  };
  const tie = residency.tie_breakers.find((t) => t.answer == null && !t.points_to);
  const claimCountries = residentClaims(residency).map((c) => c.country);
  if (!residency.pending_questions.length && !tie) return null;
  return (
    <div className="group">
      {residency.pending_questions.map((q) => (
        <div key={q.question_key} className="callout stacked">
          <div className="grow">
            <span className="small muted">Pregunta pendiente · <Country code={q.country} /></span>
            <p className="small">{q.question_es}</p>
          </div>
          <div className="row">
            <Button variant="small" busy={busy === q.question_key} onClick={() => answer(q.question_key, true)}>Sí</Button>
            <Button variant="small" disabled={busy === q.question_key} onClick={() => answer(q.question_key, false)}>No</Button>
          </div>
        </div>
      ))}
      {tie && (
        <div className="callout stacked">
          <div className="grow">
            <span className="small muted">Desempate del convenio · {tie.order}. {tie.criterion_es}</span>
            <p className="small">{tie.question_es}</p>
          </div>
          <div className="row wrap">
            {claimCountries.map((c) => <Button key={c} variant="small" busy={busy === tie.question_key} onClick={() => answer(tie.question_key, c)}>{countryName(c)}</Button>)}
            <Button variant="small" disabled={busy === tie.question_key} onClick={() => answer(tie.question_key, 'both')}>En ambos</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ResidencyCard({ residency, go, refresh, notify }) {
  const claims = residentClaims(residency);
  const decided = residency.tie_breakers.find((t) => t.points_to);
  return (
    <div className="card residency-card">
      <span className="label">Residencia fiscal estimada {residency.year}</span>
      <div className="big row wrap">
        {claims.length ? claims.map((c) => <Country key={c.country} code={c.country} />) : <span className="muted">Ningún país</span>}
      </div>
      {residency.dual_residency && <div className="row wrap"><span className="tag danger">Doble residencia</span></div>}
      {claims.map((c) => (
        <p key={c.country} className="small muted">
          {c.reason_es} <SourceLink href={c.source_url}>Fuente</SourceLink>
        </p>
      ))}
      {decided && <p className="small ok-text">El convenio apunta a {countryName(decided.points_to)} ({decided.criterion_es.toLowerCase()}).</p>}
      {residency.treaty_hint_es && <p className="small">{residency.treaty_hint_es}</p>}
      {residency.warnings_es.map((w, i) => <p key={i} className="small warn-text">{w}</p>)}
      <Questions residency={residency} refresh={refresh} notify={notify} />
      <div className="row wrap">
        <ConfidenceTag residency={residency} />
        {residency.confidence !== 'alta' && (
          <button className="link small" onClick={() => go('planes')}>Confirmarlo con un asesor <Icon name="arrowRight" size={14} /></button>
        )}
      </div>
    </div>
  );
}

/** "Pega tu reserva": el backend propone viajes a partir de un email; el usuario confirma. */
function PasteBooking({ refresh, notify }) {
  const [samples, setSamples] = useState([]);
  const [text, setText] = useState('');
  const [proposal, setProposal] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get('/api/trips/samples').then(setSamples).catch(() => {}); }, []);

  const parse = async (t = text) => {
    if (!t.trim()) return;
    setParsing(true);
    try { setProposal(await api.post('/api/trips/parse', { text: t })); } catch (e) { notify(e.message, 'error'); }
    setParsing(false);
  };
  const save = async () => {
    setSaving(true);
    try {
      for (const t of proposal.trips) {
        await api.post('/api/trips', { country: t.country_iso2, city: t.city, start_date: t.start_date, end_date: t.end_date, source: 'parsed' });
      }
      await refresh();
      notify(`${proposal.trips.length === 1 ? 'Viaje añadido' : `${proposal.trips.length} viajes añadidos`}`);
      setProposal(null);
      setText('');
    } catch (e) { notify(e.message, 'error'); }
    setSaving(false);
  };

  return (
    <section className="card">
      <div className="group-head">
        <h2>Pega tu reserva</h2>
        <span className="small muted">Vuelos o alojamientos: proponemos el viaje y tú lo confirmas</span>
      </div>
      <div className="prompts">
        {samples.map((s) => <button key={s.id} className="chip" onClick={() => { setText(s.text); parse(s.text); }}>{s.label}</button>)}
      </div>
      <form className="group" onSubmit={(e) => { e.preventDefault(); parse(); }}>
        <textarea rows="4" value={text} onChange={(e) => setText(e.target.value)} placeholder="Pega aquí el email de confirmación" aria-label="Email de la reserva" />
        <div className="row"><Button busy={parsing} disabled={!text.trim()}>Interpretar</Button></div>
      </form>
      {proposal && (
        <div className="group enter">
          {proposal.trips.length === 0 && <p className="small muted">No he encontrado ningún viaje en el texto.</p>}
          {proposal.trips.map((t, i) => (
            <div key={i} className="callout stacked">
              <div className="grow">
                <strong><Country code={t.country_iso2} /> · {t.city}</strong>
                <p className="small">{date(t.start_date)} → {t.end_date ? date(t.end_date) : 'sin fecha de vuelta'} · confianza {Math.round(t.confidence * 100)} %</p>
                <p className="small muted">«{t.evidence_text}»</p>
                {t.needs_review && <p className="small warn-text">Revísalo antes de guardarlo.</p>}
              </div>
            </div>
          ))}
          {proposal.warnings_es.map((w, i) => <p key={i} className="small warn-text">{w}</p>)}
          {proposal.trips.length > 0 && (
            <div className="row wrap">
              <Button variant="primary" busy={saving} onClick={save}>Confirmar y añadir</Button>
              <Button variant="ghost" onClick={() => setProposal(null)}>Descartar</Button>
            </div>
          )}
          {proposal.mode === 'mock' && <p className="small muted">Extractor local (sin clave de Claude).</p>}
        </div>
      )}
    </section>
  );
}

export default function Dashboard({ state, go, refresh, notify }) {
  const { residency, budget, reserve } = state;
  const asOf = state.clock.today;
  const year = Number(asOf.slice(0, 4));
  const trip = currentTrip(state);
  const here = trip && budget.items.find((i) => i.country === trip.country);
  const urgent = state.alerts.alerts.filter((a) => a.level !== 'info').slice(0, 3);
  const trips = [...state.trips, ...state.planned_trips.map((t) => ({ ...t, planned: true }))]
    .filter((t) => (t.end_date || asOf) >= `${year}-01-01`)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const reservePct = reserve.estimated_cents ? Math.min(100, (reserve.reserved_cents / reserve.estimated_cents) * 100) : 0;
  const elapsed = Math.round((new Date(`${asOf}T00:00:00Z`) - new Date(`${year}-01-01T00:00:00Z`)) / 86400000) + 1;

  return (
    <div className="stack">
      {/* Main feature, enlarged: how many days left where you are now */}
      <section className="hero">
        {here && (
          <div className="card hero-main">
            <span className="label">Días en {here.country_name_es} {here.window_days ? '(últimos 12 meses)' : `en ${year}`}</span>
            <div className="hero-num">
              <strong>{here.days_used}</strong>
              <span>días · te quedan <em>{here.days_left}</em></span>
            </div>
            <div className="group">
              <div className="meter" style={{ '--t': `${(here.threshold / 365) * 100}%` }} data-t={here.threshold} role="img" aria-label={`${here.days_used} días de ${here.threshold}; con tu plan ${here.days_used_with_planned}`}>
                <span className="plan" style={{ width: `${Math.min(100, (here.days_used_with_planned / 365) * 100)}%` }} />
                <span style={{ width: `${Math.min(100, (here.days_used / 365) * 100)}%` }} />
              </div>
              <div className="hero-scale"><span>0</span><span>365 días</span></div>
            </div>
            <p className="hero-text">
              {here.projected_cross_date
                ? <>Con tu plan superarás el umbral de {here.threshold} días el <strong>{date(here.projected_cross_date)}</strong> y serás residente fiscal en {here.country_name_es}.</>
                : <>Con tu plan{trip?.end_date ? ` (hasta el ${date(trip.end_date)})` : ''} llegarás a <strong>{here.days_used_with_planned} días</strong>: {here.days_left_with_planned} por debajo del umbral.</>}
            </p>
            {here.note_es && <p className="small muted">{here.note_es}</p>}
            <div className="row wrap">
              <button className="btn primary" onClick={() => go('simulador')}>Simular quedarme más <Icon name="arrowRight" size={16} /></button>
            </div>
          </div>
        )}
        <ResidencyCard residency={residency} go={go} refresh={refresh} notify={notify} />
      </section>

      <section className="card mascot-banner talk-banner">
        <Mascot state="saludando" size={92} />
        <div className="grow">
          <h2>{here ? `¿Te han ofrecido quedarte más en ${trip.city || here.country_name_es}?` : '¿Tienes un viaje en mente?'}</h2>
          <p className="small muted">Pregúntame antes de decidir. Consulto tus días y las reglas de cada país, y te lo explico en voz alta.</p>
        </div>
        <button className="btn primary" onClick={() => go('asesor')}><Icon name="mic" size={16} /> Habla con Rumbo</button>
      </section>

      <section className="grid-2">
        <div className="card stat">
          <span className="label">Apartado para impuestos</span>
          <div className="big">{eur(reserve.reserved_cents)}</div>
          <p className="small muted">de {eur(reserve.estimated_cents)} estimados si tributas en {reserve.tax_country_name_es}</p>
          <div className="bar"><span style={{ width: `${reservePct}%`, background: 'var(--cian)' }} /></div>
          <button className="link small" onClick={() => go('aparta')}>Ver facturas <Icon name="arrowRight" size={14} /></button>
        </div>
        <div className="card">
          <span className="label">Avisos</span>
          {urgent.length === 0 ? <p className="muted">Nada urgente.</p> : (
            <ul className="alert-list">
              {urgent.map((a) => (
                <li key={a.id}>
                  <Icon name="alert" size={16} className={a.level === 'danger' ? 'danger-text' : 'warn-text'} />
                  {a.title_es}
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
          <span className="small muted">{elapsed} días transcurridos</span>
        </div>
        <div className="counter-list">
          {budget.items.map((c) => {
            const level = c.status === 'crossed' || c.projected_cross_date ? 'danger-text' : c.status === 'warn' ? 'warn-text' : '';
            return (
              <div key={c.country} className="counter-row" title={c.message_es}>
                <Country code={c.country} />
                <div className="bar">
                  <span className="plan" style={{ width: `${Math.min(100, (c.days_used_with_planned / c.threshold) * 100)}%`, background: COUNTRY_COLORS[c.country] }} />
                  <span style={{ width: `${Math.min(100, (c.days_used / c.threshold) * 100)}%`, background: COUNTRY_COLORS[c.country] }} />
                </div>
                <span className={`num ${level}`}><strong>{c.days_used}</strong> / {c.threshold}</span>
              </div>
            );
          })}
        </div>
        <YearStrip trips={trips} year={year} asOf={asOf} />
      </section>

      <section className="card">
        <h2>Viajes</h2>
        <div className="table-wrap">
          <table className="responsive">
            <thead><tr><th>País</th><th>Ciudad</th><th>Desde</th><th>Hasta</th><th>Origen del dato</th></tr></thead>
            <tbody>
              {trips.map((t) => {
                const now = t.start_date <= asOf && (!t.end_date || t.end_date >= asOf);
                return (
                  <tr key={t.id} className={t.planned ? 'muted' : ''}>
                    <td className="cell-title"><Country code={t.country} /> <span className="mobile-only">· {t.city}</span></td>
                    <td data-label="Ciudad" className="desktop-only">{t.city}{now ? ' (ahora)' : ''}{t.planned ? ' (planificado)' : ''}</td>
                    <td data-label="Desde">{date(t.start_date < `${year}-01-01` ? `${year}-01-01` : t.start_date)}</td>
                    <td data-label="Hasta">{t.end_date ? date(t.end_date) : 'abierto'}</td>
                    <td data-label="Origen">{SOURCE[t.source] || t.source}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <PasteBooking refresh={refresh} notify={notify} />
    </div>
  );
}
