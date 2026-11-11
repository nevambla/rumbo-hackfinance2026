import { useMemo, useState } from 'react';
import { Country, SourceLink } from './ui.jsx';

const STATUS = { resident: ['danger-text', 'Te considera residente'], not_resident: ['', 'No residente'], needs_answer: ['warn-text', 'Falta tu respuesta'], not_applicable: ['muted', 'No aplica'], pending: ['warn-text', 'Falta información'] };

/** Every conclusion comes from a rule with an official source: shown from the residency evaluation. */
export default function Rules({ state }) {
  const [filter, setFilter] = useState('ALL');
  const { residency, budget } = state;
  const rows = useMemo(() => {
    const thresholds = Object.fromEntries(budget.items.map((i) => [i.rule_id, i]));
    return residency.evaluations
      .filter((r) => filter === 'ALL' || r.country === filter)
      .map((r) => ({ ...r, budget: thresholds[r.rule_id] }));
  }, [residency, budget, filter]);
  const pending = residency.evaluations.filter((r) => !r.verified).length;
  const countries = ['ALL', ...new Set(residency.evaluations.map((r) => r.country))];

  return (
    <div className="stack">
      <p className="note">
        El asistente de voz nunca calcula: consulta estas reglas. Cada una enlaza a su fuente oficial.{' '}
        <strong className="warn-text">{pending} de {residency.evaluations.length} están pendientes de verificar.</strong>
      </p>
      <section className="card">
        <div className="group-head">
          <h2>{rows.length} reglas evaluadas para {residency.year}</h2>
          <div className="seg">
            {countries.map((c) => (
              <button key={c} className={filter === c ? 'on' : ''} onClick={() => setFilter(c)}>{c === 'ALL' ? 'Todas' : c}</button>
            ))}
          </div>
        </div>
        <div className="table-wrap">
          <table className="responsive">
            <thead><tr><th>País</th><th>Regla</th><th className="num">Días / umbral</th><th>Resultado</th><th>Fuente</th><th>Verificada</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const [cls, label] = STATUS[r.status] || ['', r.status];
                return (
                  <tr key={`${r.country}-${r.rule_id}`}>
                    <td data-label="País"><Country code={r.country} short /></td>
                    <td className="cell-title"><code className="small">{r.rule_id}</code><div className="small muted cell-block">{r.reason_es}</div></td>
                    <td data-label="Días / umbral" className="num">{r.days != null ? `${r.days} / ${r.threshold ?? '–'}` : '–'}</td>
                    <td data-label="Resultado" className={cls}>{label}</td>
                    <td data-label="Fuente"><SourceLink href={r.source_url}>Ver</SourceLink></td>
                    <td data-label="Verificada" className={r.verified ? 'ok-text' : 'warn-text'}>{r.verified ? 'Sí' : 'Pendiente'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="small muted">{residency.disclaimer_es}</p>
      </section>
    </div>
  );
}
