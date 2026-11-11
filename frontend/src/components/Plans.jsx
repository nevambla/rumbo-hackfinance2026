import { useState } from 'react';
import { residentClaims } from '../lib/format.js';
import Icon from './Icon.jsx';
import { Button } from './ui.jsx';

const PLANS = [
  { id: 'free', name: 'Gratis', price: '0 €', features: ['Contador de días por país', 'Alertas de umbral de días', 'Reserva de impuestos por factura'] },
  { id: 'pro', name: 'Pro', price: '9,90 € / mes', highlight: true, features: ['Todo lo de Gratis', 'Asesor por voz', 'Simulador de escenarios', 'Desempate de convenios', 'Expediente de residencia en PDF', 'Gastos dictados'] },
  { id: 'advisors', name: 'Asesores', price: '15 % del primer año', features: ['Por cada cliente derivado', 'Casos complejos ya documentados', 'Doble residencia, sociedades, impuesto de salida'] },
];

export default function Plans({ state, notify }) {
  const { residency } = state;
  const where = residentClaims(residency).map((c) => c.country_name_es).join(' y ') || 'ningún país';
  const [form, setForm] = useState({ name: state.user.name, email: '', message: `Mi residencia estimada para ${residency.year} es ${where}${residency.dual_residency ? ' (doble residencia)' : ''}, con confianza ${residency.confidence}. Quiero confirmarlo.` });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    // Demo: no backend endpoint yet; nothing is sent anywhere.
    await new Promise((r) => setTimeout(r, 500));
    setSent(true);
    notify('Solicitud registrada. Un asesor colaborador te escribirá.');
    setSending(false);
  };

  return (
    <div className="stack">
      <section className="grid-3">
        {PLANS.map((p) => (
          <div key={p.id} className={`card plan ${p.highlight ? 'highlight' : ''}`}>
            <h2>{p.name}</h2>
            <div className="big">{p.price}</div>
            <ul>{p.features.map((f) => <li key={f}><Icon name="check" size={16} />{f}</li>)}</ul>
          </div>
        ))}
      </section>

      <section className="grid-2">
        <form className="card form" onSubmit={submit}>
          <div className="group">
            <h2>Confirma tu caso con un asesor</h2>
            <p className="small muted">Cuando el caso es complejo (confianza baja, doble residencia, sociedades extranjeras) te ponemos en contacto con un asesor colaborador.</p>
          </div>
          <label>Nombre<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>Email<input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="tu@email.com" /></label>
          <label>Tu caso<textarea rows="4" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></label>
          <div className="row wrap">
            <Button variant="primary" busy={sending} disabled={sent}>{sent ? 'Solicitud enviada' : 'Solicitar asesor'}</Button>
          </div>
          <p className="small muted">Demo: la solicitud no se envía a nadie.</p>
        </form>
        <div className="card">
          <h2>Lo que Rumbo no hará</h2>
          <ul className="redline">
            <li>Fingir una residencia que no es la tuya.</li>
            <li>Ocultar ingresos o montar estructuras ficticias.</li>
            <li>Darte una conclusión fiscal sin aviso de verificación.</li>
            <li>Inventarse cifras: todas salen de reglas con fuente oficial.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
