import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { eur, money, pct, date } from '../lib/format.js';
import { Button, Country, Skeleton } from './ui.jsx';

const REGIME = { domestic: 'IVA nacional', reverse_charge: 'Inversión del sujeto pasivo', not_subject: 'No sujeta a IVA', eu_consumer: 'IVA a consumidor UE', export: 'Exportación de servicios' };

function InvoicePreview({ inv }) {
  return (
    <div className="invoice-doc" id="invoice-print">
      <div className="inv-head">
        <div>
          <strong className="nowrap">Factura {inv.id}</strong>
          <div className="small muted">{date(inv.date)}</div>
        </div>
        <div className="right">
          <strong>{inv.issuer.name}</strong>
          <div className="small muted">NIF-IVA {inv.issuer.vat_id}</div>
        </div>
      </div>
      <div className="inv-to">
        <span className="small muted">Cliente</span>
        <strong>{inv.client.name}</strong>
        <span className="small muted"><Country code={inv.client.country} />{inv.client.vat_id && ` · VAT ${inv.client.vat_id}`}</span>
      </div>
      <table>
        <tbody>
          <tr><td>{inv.concept}</td><td className="num">{money(inv.net_cents, inv.currency)}</td></tr>
          <tr><td>IVA {pct(inv.vat_rate)}</td><td className="num">{money(inv.vat_cents, inv.currency)}</td></tr>
          <tr className="total"><td>Total</td><td className="num">{money(inv.total_cents, inv.currency)}</td></tr>
        </tbody>
      </table>
      <p className="legend-text">{inv.vat_legend}</p>
      {inv.vat_warning && <p className="small warn-text">{inv.vat_warning}</p>}
    </div>
  );
}

export default function Reserve({ state, reserve, refresh, notify }) {
  const [form, setForm] = useState({ client_id: 'c1', concept: 'Diseño de landing page', amount: '2500', currency: 'EUR' });
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flashId, setFlashId] = useState(null);
  const [err, setErr] = useState(null);

  const body = () => ({ client_id: form.client_id, concept: form.concept, net_cents: Math.round(Number(form.amount) * 100), currency: form.currency });

  useEffect(() => {
    if (!form.amount || Number(form.amount) <= 0) { setPreview(null); return; }
    setPreviewing(true);
    const t = setTimeout(() => api.post('/api/invoices/preview', body())
      .then((p) => { setPreview(p); setErr(null); })
      .catch((e) => setErr(e.message))
      .finally(() => setPreviewing(false)), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const onClient = (id) => {
    const c = state.clients.find((x) => x.id === id);
    setForm({ ...form, client_id: id, currency: c.currency });
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const inv = await api.post('/api/invoices', body());
      await refresh();
      setFlashId(inv.id);
      notify(`${inv.id} registrada · ${eur(inv.reserve_eur_cents)} apartados`);
    } catch (x) { notify(x.message, 'error'); }
    setSaving(false);
  };

  const year = state.as_of.slice(0, 4);
  const invoices = [...state.invoices].filter((i) => i.date.startsWith(year)).reverse();
  const next = reserve.next_invoice_rate;

  return (
    <div className="stack">
      <section className="grid-4">
        <div className="card stat"><span className="label">Facturado en {year}</span><div className="big">{eur(reserve.ytd_income)}</div></div>
        <div className="card stat"><span className="label">Apartado</span><div className="big">{eur(reserve.reserved)}</div></div>
        <div className="card stat"><span className="label">Estimación a pagar</span><div className="big">{eur(reserve.estimated_due)}</div><span className="small muted">Tributando en {state.countries[reserve.residency_country].name} ({pct(reserve.effective_rate)})</span></div>
        <div className="card stat"><span className="label">{reserve.gap > 0 ? 'Falta por apartar' : 'Margen'}</span><div className={`big ${reserve.gap > 0 ? 'danger-text' : 'ok-text'}`}>{eur(Math.abs(reserve.gap))}</div></div>
      </section>

      <section className="grid-2">
        <form className="card form" onSubmit={save}>
          <div className="group">
            <h2>Registrar un cobro</h2>
            <p className="small muted">Aplicamos el IVA según dónde está tu cliente y apartamos el {pct(next.rate)} para impuestos en {state.countries[next.country].name}, tu residencia probable.</p>
          </div>
          <label>Cliente
            <select value={form.client_id} onChange={(e) => onClient(e.target.value)}>
              {state.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Concepto
            <input value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })} required />
          </label>
          <div className="row">
            <label className="grow">Importe neto
              <input type="number" min="1" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
            </label>
            <label>Moneda
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                {['EUR', 'USD', 'MXN', 'COP', 'THB'].map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          </div>
          {preview && (
            <div className={`callout ${previewing ? 'loading-fade' : ''}`}>
              <div><span className="small muted">IVA</span><strong>{REGIME[preview.vat_regime]}</strong></div>
              <div><span className="small muted">A apartar</span><strong>{eur(preview.reserve_eur_cents)}</strong></div>
              <div><span className="small muted">Libre para ti</span><strong>{eur(Math.round(preview.reserve_eur_cents / preview.reserve_rate) - preview.reserve_eur_cents)}</strong></div>
            </div>
          )}
          {err && <p className="small danger-text">{err}</p>}
          <div className="row wrap">
            <Button variant="primary" type="submit" busy={saving}>Registrar y apartar</Button>
            {preview && <Button type="button" icon="printer" onClick={() => window.print()}>Imprimir factura</Button>}
          </div>
        </form>
        <div className="card">
          <h2>Vista previa</h2>
          {preview ? <div className={previewing ? 'loading-fade' : ''}><InvoicePreview inv={preview} /></div> : previewing ? <Skeleton lines={6} /> : <p className="muted">Introduce un importe.</p>}
        </div>
      </section>

      <section className="card">
        <div className="group-head">
          <h2>Facturas de {year}</h2>
          <span className="small muted">Las primeras se apartaron a un tipo más bajo; de ahí la diferencia</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nº</th><th>Fecha</th><th>Cliente</th><th>Concepto</th><th className="num">Neto</th><th className="num">En EUR</th><th className="num">% apartado</th><th className="num">Apartado</th></tr></thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id} className={i.id === flashId ? 'flash' : ''}>
                  <td className="nowrap">{i.id}</td>
                  <td className="nowrap">{date(i.date)}</td>
                  <td>{i.client?.name}</td>
                  <td>{i.concept}</td>
                  <td className="num">{money(i.net_cents, i.currency)}</td>
                  <td className="num">{eur(i.eur_cents)}</td>
                  <td className="num">{pct(i.reserve_rate)}</td>
                  <td className="num">{eur(i.reserve_eur_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
