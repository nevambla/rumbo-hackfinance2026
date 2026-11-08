import { useState } from 'react';
import { api } from '../lib/api.js';
import { speak, stopSpeaking } from '../lib/speech.js';
import { date } from '../lib/format.js';
import Icon from './Icon.jsx';
import { Button, Country, SourceLink } from './ui.jsx';

const TYPE = { residency: 'Umbral de días', a1: 'Seguridad Social', visa: 'Visado', reserve: 'Reserva', trap: 'Trampa fiscal', vat: 'IVA' };

export default function Alerts({ alerts, state }) {
  const [playing, setPlaying] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summary, setSummary] = useState(null);
  const useEl = state.services.elevenlabs_key;

  const play = async (id, text) => {
    setPlaying(id);
    await speak(text, { useElevenLabs: useEl });
    setTimeout(() => setPlaying((p) => (p === id ? null : p)), 2500);
  };
  const stop = () => { stopSpeaking(); setPlaying(null); };

  const weekly = async () => {
    setLoadingSummary(true);
    const { text } = await api.get('/api/summary');
    setSummary(text);
    setLoadingSummary(false);
    play('weekly', text);
  };

  return (
    <div className="stack">
      <section className="alerts">
        {alerts.map((a, i) => (
          <article key={a.id} className={`card alert ${a.level} enter`} style={{ animationDelay: `${i * 40}ms` }}>
            <span className="status-icon"><Icon name={a.level === 'info' ? 'info' : 'alert'} size={16} /></span>
            <div className="alert-body">
              <h3>{a.title}</h3>
              <p className="muted">{a.text}</p>
              <div className="alert-meta">
                <span>{TYPE[a.type] || a.type}</span>
                {a.country && <Country code={a.country} />}
                <SourceLink href={a.source_url} />
              </div>
            </div>
            <div className="alert-actions">
              {playing === a.id
                ? <Button variant="small" icon="stop" onClick={stop}>Parar</Button>
                : <Button variant="small" icon="volume" onClick={() => play(a.id, `${a.title}. ${a.text}`)}>Escuchar</Button>}
            </div>
          </article>
        ))}
      </section>

      <section className="card weekly">
        <div className="summary">
          <h2>Resumen semanal en audio</h2>
          <p>{summary || 'Días por país, impuestos apartados y riesgos de la semana en una nota de voz.'}</p>
        </div>
        {playing === 'weekly'
          ? <Button icon="stop" onClick={stop}>Parar</Button>
          : <Button variant="primary" icon="headphones" busy={loadingSummary} onClick={weekly}>Escuchar resumen</Button>}
      </section>

      <section className="card">
        <h2>Documentos que vigilamos</h2>
        <div className="table-wrap">
          <table className="responsive">
            <thead><tr><th>Documento</th><th>País</th><th>Desde</th><th>Hasta</th></tr></thead>
            <tbody>
              {state.documents.map((d) => {
                const expired = d.valid_until < state.as_of;
                return (
                  <tr key={d.id} className={expired ? 'muted' : ''}>
                    <td className="cell-title">{d.name}</td>
                    <td data-label="País"><Country code={d.country} /></td>
                    <td data-label="Desde">{date(d.valid_from)}</td>
                    <td data-label="Hasta">{date(d.valid_until)}{expired && ' (vencido)'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
