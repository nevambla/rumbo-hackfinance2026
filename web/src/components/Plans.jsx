import { useState } from 'react';
import { api } from '../lib/api.js';
import Icon from './Icon.jsx';
import { Button } from './ui.jsx';

const PLANS = [
  { id: 'free', name: 'Gratis', price: '0 €', features: ['Contador de días por país', 'Alertas de umbral, A1 y visados', 'Reserva de impuestos por factura'] },
  { id: 'pro', name: 'Pro', price: '[€__] / mes', highlight: true, features: ['Todo lo de Gratis', 'Asesor por voz', 'Simulador de escenarios', 'Facturas con el IVA correcto', 'Regímenes especiales', 'Gastos dictados'] },
  { id: 'advisors', name: 'Asesores', price: '[__] % de comisión', features: ['Derivación de casos complejos', 'Asesores colaboradores verificados', 'Doble residencia, sociedades, impuesto de salida'] },
];

export default function Plans({ state, residency, notify }) {
  const [form, setForm] = useState({ name: state.profile.name, email: '', message: `Mi residencia estimada para ${residency.year} es ${residency.name}, con confianza ${residency.confidence}. Quiero confirmarlo.` });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    try { const r = await api.post('/api/referral', form); setSent(true); notify(r.text); }
    catch (x) { notify(x.message, 'error'); }
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
          <p className="small muted">Demo: la solicitud se guarda en el servidor y no se envía a nadie.</p>
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
