import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { Country, Skeleton, SourceLink } from './ui.jsx';

const RULE_LABEL = {
  residency_days: 'Residencia por días', income_tax_brackets: 'Tramos de renta', self_employed_ss: 'Cotización de autónomos',
  vat_standard: 'IVA', special_regime: 'Régimen especial', tax_haven_quarantine: 'Cuarentena por paraíso fiscal',
  no_residency: 'Sin residencia', place_of_effective_management: 'Sede de dirección efectiva', exit_tax: 'Impuesto de salida',
};

export default function Rules() {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('ALL');
  useEffect(() => { api.get('/api/rules').then(setData); }, []);
  const rules = useMemo(() => (data?.rules || []).filter((r) => filter === 'ALL' || r.country === filter), [data, filter]);
  const pending = data ? data.rules.filter((r) => !r.verified_at).length : 0;

  return (
    <div className="stack">
      <p className="note">
        El asistente de voz nunca calcula: consulta estas reglas. Cada una enlaza a su fuente oficial.{' '}
        {data && <strong className="warn-text">{pending} de {data.rules.length} están pendientes de verificar.</strong>}
      </p>
      <section className="card">
        <div className="group-head">
          <h2>{rules.length} reglas</h2>
          <div className="seg">
            {['ALL', 'ES', 'PT', 'MX', 'CO', 'TH'].map((c) => (
              <button key={c} className={filter === c ? 'on' : ''} onClick={() => setFilter(c)}>{c === 'ALL' ? 'Todas' : c}</button>
            ))}
          </div>
        </div>
        {!data ? <Skeleton lines={8} /> : (
          <div className="table-wrap">
            <table className="responsive">
              <thead><tr><th>País</th><th>Regla</th><th className="num">Umbral o tipo</th><th>Descripción</th><th>Fuente</th><th>Verificada</th></tr></thead>
              <tbody>
                {rules.map((r, i) => (
                  <tr key={i}>
                    <td data-label="País">{r.country ? <Country code={r.country} short /> : 'Todos'}</td>
                    <td className="cell-title">{r.name || r.title || RULE_LABEL[r.rule] || r.rule}</td>
                    <td data-label="Umbral o tipo" className="num">{r.rate != null ? `${Math.round(r.rate * 1000) / 10} %` : r.threshold != null ? r.threshold.toLocaleString('es-ES') : r.brackets ? `${r.brackets.length} tramos` : '–'}</td>
                    <td className="muted cell-block">{r.description || r.summary || r.text}</td>
                    <td data-label="Fuente"><SourceLink href={r.source_url}>Ver</SourceLink></td>
                    <td data-label="Verificada" className={r.verified_at ? 'ok-text' : 'warn-text'}>{r.verified_at || 'Pendiente'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <SourceLink href={data.fx_source}>Tipos de cambio: BCE</SourceLink>}
      </section>
    </div>
  );
}
