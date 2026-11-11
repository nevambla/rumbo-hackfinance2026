import { useState } from 'react';
import { api } from '../lib/api.js';
import { speak, stopSpeaking } from '../lib/speech.js';
import Icon from './Icon.jsx';
import { Button, Country, SourceLink } from './ui.jsx';
import Mascot from './Mascot.jsx';

export default function Alerts({ state, notify }) {
  const { alerts } = state.alerts;
  const { residency } = state;
  const [playing, setPlaying] = useState(null);
  const [dossier, setDossier] = useState(null);
  const [generating, setGenerating] = useState(false);

  const play = async (id, text) => {
    setPlaying(id);
    await speak(text);
    setTimeout(() => setPlaying((p) => (p === id ? null : p)), 2500);
  };
  const stop = () => { stopSpeaking(); setPlaying(null); };

  const generate = async () => {
    setGenerating(true);
    try {
      const d = await api.post('/api/tools/dossier');
      setDossier(d);
      window.open(d.path, '_blank', 'noopener');
    } catch (e) { notify(e.message, 'error'); }
    setGenerating(false);
  };

  const urgent = alerts.filter((a) => a.level !== 'info');
  return (
    <div className="stack">
      <section className="card mascot-banner">
        <Mascot state={urgent.length ? 'aviso' : 'celebrando'} size={96} />
        <div>
          <h2>{urgent.length ? `Ojo, ${state.user.name.split(' ')[0]}: ${urgent.length === 1 ? 'hay algo' : 'hay cosas'} que revisar` : 'Todo en orden'}</h2>
          <p className="small muted">{urgent.length ? urgent.map((a) => a.title_es).join(' · ') : 'No tienes avisos urgentes. Te avisaré antes de que cruces un umbral.'}</p>
        </div>
      </section>
      <section className="alerts">
        {alerts.length === 0 && <p className="muted">Sin avisos.</p>}
        {alerts.map((a, i) => (
          <article key={a.id} className={`card alert ${a.level} enter`} style={{ animationDelay: `${i * 40}ms` }}>
            <span className="status-icon"><Icon name={a.level === 'info' ? 'info' : 'alert'} size={16} /></span>
            <div className="alert-body">
              <h3>{a.title_es}</h3>
              <p className="muted">{a.message_es}</p>
              <div className="alert-meta">
                {a.country && <Country code={a.country} />}
                <SourceLink href={a.source_url} />
              </div>
            </div>
            <div className="alert-actions">
              {playing === a.id
                ? <Button variant="small" icon="stop" onClick={stop}>Parar</Button>
                : <Button variant="small" icon="volume" onClick={() => play(a.id, `${a.title_es}. ${a.message_es}`)}>Escuchar</Button>}
            </div>
          </article>
        ))}
      </section>

      {residency.notices_es.length > 0 && (
        <section className="card">
          <h2>Trampas que vigilamos</h2>
          <ul className="redline">
            {residency.notices_es.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </section>
      )}

      <section className="card weekly">
        <div className="summary">
          <h2>Expediente de residencia</h2>
          <p>{dossier
            ? <>Expediente listo. <a className="link" href={dossier.path} target="_blank" rel="noreferrer">Abrir PDF <Icon name="external" size={13} /></a></>
            : 'Un PDF con tus días por país, viajes, residencia estimada y las fuentes, para llevárselo a tu asesor o a Hacienda.'}</p>
          {dossier?.missing_documents_es?.length > 0 && (
            <>
              <p className="small muted">Te falta por reunir:</p>
              <ul className="small">{dossier.missing_documents_es.map((m, i) => <li key={i}>{m}</li>)}</ul>
            </>
          )}
        </div>
        <Button variant="primary" icon="book" busy={generating} onClick={generate}>Generar expediente</Button>
      </section>
    </div>
  );
}
