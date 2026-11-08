import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './lib/api.js';
import { date, eur } from './lib/format.js';
import Icon from './components/Icon.jsx';
import { Skeleton, Toast, Button, RumboLogo } from './components/ui.jsx';
import Dashboard from './components/Dashboard.jsx';
import Alerts from './components/Alerts.jsx';
import Reserve from './components/Reserve.jsx';
import Advisor from './components/Advisor.jsx';
import Expenses from './components/Expenses.jsx';
import Simulator from './components/Simulator.jsx';
import Regimes from './components/Regimes.jsx';
import Rules from './components/Rules.jsx';
import Plans from './components/Plans.jsx';

const SECTIONS = [
  { id: 'rastrea', label: 'Días y residencia', icon: 'pin' },
  { id: 'avisa', label: 'Avisos', icon: 'bell' },
  { id: 'aparta', label: 'Facturas e impuestos', icon: 'wallet' },
  { id: 'asesor', label: 'Asesor por voz', icon: 'mic' },
  { id: 'gastos', label: 'Gastos', icon: 'receipt' },
  { id: 'simulador', label: 'Simulador', icon: 'shuffle' },
  { id: 'regimenes', label: 'Regímenes y trampas', icon: 'scale' },
  { id: 'reglas', label: 'Reglas y fuentes', icon: 'book' },
  { id: 'planes', label: 'Planes', icon: 'briefcase' },
];

const TABS = [
  { id: 'rastrea', label: 'Días', icon: 'pin' },
  { id: 'avisa', label: 'Avisos', icon: 'bell' },
  { id: 'asesor', label: 'Asesor', icon: 'mic' },
  { id: 'aparta', label: 'Facturas', icon: 'wallet' },
  { id: 'more', label: 'Más', icon: 'menu' },
];

/** Specific, data-driven headline per section. */
function headline(id, d) {
  const here = d.days.countries.find((c) => c.country === d.days.current_country);
  const urgent = d.alerts.filter((a) => a.level !== 'info').length;
  const deductible = d.state.expenses.filter((e) => e.deductible).reduce((s, e) => s + e.eur_cents, 0);
  switch (id) {
    case 'rastrea': return here ? <>Te quedan <em>{here.days_left} días</em> en {here.name} antes de ser residente</> : 'Tus días por país';
    case 'avisa': return urgent ? <><em>{urgent} {urgent === 1 ? 'aviso' : 'avisos'}</em> {urgent === 1 ? 'necesita' : 'necesitan'} tu atención</> : 'Sin avisos urgentes';
    case 'aparta': return d.reserve.gap > 0 ? <>Te faltan <em>{eur(d.reserve.gap)}</em> por apartar</> : <>Llevas <em>{eur(-d.reserve.gap)}</em> de margen</>;
    case 'asesor': return here ? `Pregunta antes de alargar tu estancia en ${here.name}` : 'Pregunta a tu asesor';
    case 'gastos': return <><em>{eur(deductible)}</em> en gastos deducibles este año</>;
    case 'simulador': return '¿Dónde te sale mejor pasar los próximos meses?';
    case 'regimenes': return 'Qué puedes aprovechar legalmente y qué debes evitar';
    case 'reglas': return 'Cada cifra sale de una regla con fuente oficial';
    case 'planes': return 'Empieza gratis; pasa a Pro para el asesor por voz';
    default: return '';
  }
}

export default function App() {
  const [section, setSection] = useState(() => {
    const fromHash = window.location.hash.replace('#/', '');
    if (SECTIONS.some((s) => s.id === fromHash)) return fromHash;
    try { return localStorage.getItem('rumbo.section') || 'rastrea'; } catch { return 'rastrea'; }
  });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [resetting, setResetting] = useState(false);
  const toastTimer = useRef(null);

  const notify = useCallback((text, kind = 'ok') => {
    clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text, kind });
    toastTimer.current = setTimeout(() => setToast(null), 3300);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [state, days, residency, alerts, reserve] = await Promise.all([
        api.get('/api/state'), api.get('/api/days'), api.get('/api/residency'), api.get('/api/alerts'), api.get('/api/reserve'),
      ]);
      setData({ state, days, residency, alerts, reserve });
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const go = (id) => {
    setSection(id);
    setMenuOpen(false);
    try { localStorage.setItem('rumbo.section', id); } catch { /* ignore */ }
    window.history.replaceState(null, '', `#/${id}`);
    window.scrollTo({ top: 0 });
  };

  const reset = async () => {
    setResetting(true);
    await api.post('/api/reset');
    await refresh();
    setResetting(false);
    notify('Datos de demo restaurados');
  };

  if (error && !data) {
    return (
      <div className="boot">
        <h1>No puedo conectar con la API</h1>
        <p className="muted">{error}. Arranca el proyecto con npm run dev.</p>
        <div><Button onClick={refresh} icon="refresh">Reintentar</Button></div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="boot">
        <Skeleton lines={1} height={28} />
        <div className="hero"><div className="card"><Skeleton lines={5} /></div><div className="card"><Skeleton lines={4} /></div></div>
        <div className="card"><Skeleton lines={6} /></div>
      </div>
    );
  }

  const { state } = data;
  const urgent = data.alerts.filter((a) => a.level !== 'info').length;
  const here = data.days.current_country;
  const ctx = { ...data, refresh, go, notify };

  return (
    <div className="layout">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand">
          <RumboLogo size={28} />
        </div>
        <nav>
          {SECTIONS.map((s) => (
            <button key={s.id} className={`nav-item ${section === s.id ? 'active' : ''}`} onClick={() => go(s.id)} aria-current={section === s.id ? 'page' : undefined}>
              <Icon name={s.icon} />
              <span>{s.label}</span>
              {s.id === 'avisa' && urgent > 0 && <span className="count">{urgent}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="user">
            <div className="avatar">{state.profile.name[0]}</div>
            <div>
              <strong>{state.profile.name}</strong>
              <small>{state.profile.occupation}</small>
            </div>
          </div>
          <Button variant="ghost small" icon="refresh" busy={resetting} onClick={reset}>Reiniciar demo</Button>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <button className="btn ghost menu-btn" onClick={() => setMenuOpen(!menuOpen)} aria-label="Abrir menú"><Icon name="menu" /></button>
          <div className="topbar-title">
            <h1 key={section} className="enter">{headline(section, data)}</h1>
            <span className="context">{date(state.as_of)} · {state.countries[here]?.name}</span>
          </div>
          {section !== 'asesor' && (
            <button className="btn primary cta topbar-cta" onClick={() => go('asesor')}>
              <Icon name="mic" size={18} /><span className="talk-label">Habla con tu asesor</span>
            </button>
          )}
        </header>

        <div className="content" key={section}>
          <div className="enter">
            {section === 'rastrea' && <Dashboard {...ctx} />}
            {section === 'avisa' && <Alerts {...ctx} />}
            {section === 'aparta' && <Reserve {...ctx} />}
            {section === 'asesor' && <Advisor {...ctx} />}
            {section === 'gastos' && <Expenses {...ctx} />}
            {section === 'simulador' && <Simulator {...ctx} />}
            {section === 'regimenes' && <Regimes {...ctx} />}
            {section === 'reglas' && <Rules {...ctx} />}
            {section === 'planes' && <Plans {...ctx} />}
          </div>
        </div>

        <footer className="disclaimer">
          Rumbo es un copiloto, no un asesor fiscal. Planificamos con dónde vives de verdad: no ayudamos a fingir residencias,
          ocultar ingresos ni montar estructuras ficticias. Reglas simplificadas, pendientes de verificar con fuentes oficiales. Datos de viaje simulados.
        </footer>
      </main>
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}

      {/* Mobile: bottom tab bar within thumb reach */}
      <nav className="tabbar" aria-label="Navegación principal">
        {TABS.map((t) => {
          const active = t.id === 'more' ? menuOpen || !TABS.some((x) => x.id === section) : section === t.id && !menuOpen;
          return (
            <button
              key={t.id}
              className={`tab ${t.id === 'asesor' ? 'tab-main' : ''} ${active ? 'active' : ''}`}
              onClick={() => (t.id === 'more' ? setMenuOpen(!menuOpen) : go(t.id))}
              aria-current={active && t.id !== 'more' ? 'page' : undefined}
            >
              <span className="tab-icon">
                <Icon name={t.icon} size={t.id === 'asesor' ? 24 : 22} />
                {t.id === 'avisa' && urgent > 0 && <span className="count dot-count">{urgent}</span>}
              </span>
              <span className="tab-label">{t.label}</span>
            </button>
          );
        })}
      </nav>
      <Toast toast={toast} />
    </div>
  );
}
