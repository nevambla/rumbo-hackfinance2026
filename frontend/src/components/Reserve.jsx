import { useState } from 'react';
import { api } from '../lib/api.js';
import { eur, money, pct, date, countryName } from '../lib/format.js';
import { Button, Country, SourceLink } from './ui.jsx';

const CLIENT_COUNTRIES = ['DE', 'ES', 'PT', 'US', 'GB', 'FR', 'NL', 'MX', 'CO'];

export default function Reserve({ state, refresh, notify }) {
  const { reserve } = state;
  const [form, setForm] = useState({ client: 'Studio Kreuzberg GmbH', client_country: 'DE', amount: '2500', currency: 'EUR' });
  const [saving, setSaving] = useState(false);
  const [flashId, setFlashId] = useState(null);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await api.post('/api/invoices', {
        client: form.client, client_country: form.client_country,
        amount_cents: Math.round(Number(form.amount) * 100), currency: form.currency,
      });
      await refresh();
      setFlashId(r.invoice.id);
      notify(r.message_es || `Factura registrada · ${eur(r.reserved_cents)} apartados`);
    } catch (x) { notify(x.message, 'error'); }
    setSaving(false);
  };

  const year = state.clock.today.slice(0, 4);
  const invoices = state.invoices.filter((i) => i.date.startsWith(year)).sort((a, b) => b.date.localeCompare(a.date));
  const rate = Number(reserve.effective_rate);
  const amount = Number(form.amount) || 0;

  return (
    <div className="stack">
      <section className="grid-4">
        <div className="card stat"><span className="label">Ingresos previstos {year}</span><div className="big">{eur(reserve.projected_annual_income_cents)}</div></div>
        <div className="card stat"><span className="label">Apartado</span><div className="big">{eur(reserve.reserved_cents)}</div></div>
        <div className="card stat">
          <span className="label">Estimación a pagar</span><div className="big">{eur(reserve.estimated_cents)}</div>
          <span className="small muted">Tributando en {reserve.tax_country_name_es} ({pct(rate)}){reserve.is_estimate ? ' · estimación' : ''}</span>
        </div>
        <div className="card stat"><span className="label">{reserve.pending_cents > 0 ? 'Falta por apartar' : 'Margen'}</span><div className={`big ${reserve.pending_cents > 0 ? 'danger-text' : 'ok-text'}`}>{eur(Math.abs(reserve.pending_cents))}</div></div>
      </section>

      <section className="grid-2">
        <form className="card form" onSubmit={save}>
          <div className="group">
            <h2>Registrar un cobro</h2>
            <p className="small muted">Apartamos el {pct(rate)} para impuestos en {reserve.tax_country_name_es}, tu residencia probable, y lo movemos a tu hucha fiscal.</p>
          </div>
          <label>Cliente
            <input value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} required />
          </label>
          <label>País del cliente
            <select value={form.client_country} onChange={(e) => setForm({ ...form, client_country: e.target.value })}>
              {CLIENT_COUNTRIES.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
            </select>
          </label>
          <div className="row">
            <label className="grow">Importe
              <input type="number" min="1" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
            </label>
            <label>Moneda
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                {['EUR', 'USD', 'MXN', 'COP', 'THB'].map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          </div>
          {form.currency === 'EUR' && amount > 0 && (
            <div className="callout">
              <div><span className="small muted">A apartar (aprox.)</span><strong>{eur(Math.round(amount * 100 * rate))}</strong></div>
              <div><span className="small muted">Libre para ti</span><strong>{eur(Math.round(amount * 100 * (1 - rate)))}</strong></div>
            </div>
          )}
          <div className="row wrap">
            <Button variant="primary" type="submit" busy={saving}>Registrar y apartar</Button>
          </div>
        </form>

        <div className="card">
          <h2>Hucha fiscal</h2>
          <div className="big">{eur(reserve.balance_cents)}</div>
          <p className="small muted">{reserve.provider_name} · {pct(Number(reserve.savings_rate))} anual · +{eur(reserve.interest_cents)} de intereses</p>
          <p className="small muted">{reserve.provider_note_es}</p>
          <SourceLink href={reserve.source_url}>Tipo de la estimación</SourceLink>
        </div>
      </section>

      <section className="card">
        <div className="group-head">
          <h2>Facturas de {year}</h2>
          <span className="small muted">Cada cobro aparta el % del país donde tributarás</span>
        </div>
        <div className="table-wrap">
          <table className="responsive">
            <thead><tr><th>Fecha</th><th>Cliente</th><th>País</th><th className="num">Importe</th><th className="num">% apartado</th><th className="num">Apartado</th></tr></thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id} className={i.id === flashId ? 'flash' : ''}>
                  <td data-label="Fecha" className="nowrap">{date(i.date)}</td>
                  <td className="cell-title">{i.client}</td>
                  <td data-label="País"><Country code={i.client_country} /></td>
                  <td data-label="Importe" className="num">{money(i.amount_cents, i.currency)}</td>
                  <td data-label="% apartado" className="num">{i.reserve_rate != null ? pct(Number(i.reserve_rate)) : '–'}</td>
                  <td data-label="Apartado" className="num">{i.reserved_cents != null ? eur(i.reserved_cents) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
