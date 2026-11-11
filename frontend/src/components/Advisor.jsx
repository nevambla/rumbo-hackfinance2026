import { useEffect, useRef, useState } from 'react';
import { Conversation, stripAudioTags } from '@elevenlabs/client';
import { api } from '../lib/api.js';
import Icon from './Icon.jsx';
import { Button } from './ui.jsx';

const PROMPTS = [
  'Me han ofrecido quedarme dos meses más en Lisboa. ¿Me afecta?',
  '¿Dónde soy residente fiscal este año?',
  '¿Cuántos días me quedan en Portugal?',
  '¿Cuánto tengo apartado para impuestos?',
  'Coworking en Lisboa, 80 euros',
  '¿Tengo algún aviso?',
];

// Client tools: same names as the agent in ElevenLabs and backend/contract/client_tools.json.
// The agent asks the browser to run them; each one calls our API and returns the JSON.
const TOOLS = {
  get_days_by_country: { method: 'GET', path: '/api/tools/days', params: 'query' },
  get_residency_status: { method: 'GET', path: '/api/tools/residency', params: 'query' },
  get_day_budget: { method: 'GET', path: '/api/tools/budget' },
  simulate_stay: { method: 'POST', path: '/api/tools/simulate', params: 'body' },
  get_tax_reserve: { method: 'GET', path: '/api/tools/reserve' },
  register_expense: { method: 'POST', path: '/api/tools/expenses', params: 'body', writes: true },
  answer_question: { method: 'POST', path: '/api/tools/answers', params: 'body', writes: true },
  get_alerts: { method: 'GET', path: '/api/tools/alerts' },
  generate_dossier: { method: 'POST', path: '/api/tools/dossier' },
};

async function runTool(name, params = {}) {
  const t = TOOLS[name];
  const clean = Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== null && v !== undefined && v !== ''));
  let path = t.path;
  if (t.params === 'query' && Object.keys(clean).length) path += `?${new URLSearchParams(clean)}`;
  return t.method === 'GET' ? api.get(path) : api.post(path, t.params === 'body' ? clean : {});
}

/** Short human summary of a tool result, shown in the chat. */
function toolSummary(name, r) {
  if (r?.error) return `Error: ${r.error}`;
  switch (name) {
    case 'simulate_stay': return r.explanation_es;
    case 'get_tax_reserve': return r.summary_es;
    case 'register_expense': return r.message_es;
    case 'generate_dossier': return 'Expediente generado';
    case 'get_days_by_country': return Object.entries(r.days || {}).map(([c, d]) => `${c} ${d}`).join(' · ');
    case 'get_residency_status': return `Residente en: ${r.claims?.filter((c) => c.status === 'resident').map((c) => c.country_name_es).join(', ') || 'ninguno'} · confianza ${r.confidence}`;
    case 'get_day_budget': return r.items?.map((i) => i.message_es).join(' ');
    case 'get_alerts': return `${r.alerts?.length ?? 0} avisos`;
    case 'answer_question': return 'Respuesta guardada';
    default: return '';
  }
}

function ToolCall({ t }) {
  return (
    <details className="tools">
      <summary>Datos consultados: <code>{t.name}</code>{t.args && Object.keys(t.args).length ? `(${Object.values(t.args).join(', ')})` : ''} · {t.ms} ms</summary>
      <pre>{`${t.name}(${JSON.stringify(t.args || {})})\n→ ${JSON.stringify(t.result, null, 2).slice(0, 1500)}`}</pre>
    </details>
  );
}

export default function Advisor({ state, refresh, notify }) {
  const firstName = state.user.name.split(' ')[0];
  const [status, setStatus] = useState('idle'); // idle | connecting | live
  const [speaking, setSpeaking] = useState(false);
  const [err, setErr] = useState(null);
  const [messages, setMessages] = useState([
    { role: 'ai', text: `Hola, ${firstName}. Pulsa el micrófono y pregúntame si te afecta alargar una estancia, cuántos días llevas o dicta un gasto.` },
  ]);
  const [input, setInput] = useState('');
  const conv = useRef(null);
  const queued = useRef(null);
  const chatRef = useRef(null);

  const add = (m) => setMessages((xs) => [...xs, m]);
  useEffect(() => { chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' }); }, [messages]);
  // Hang up when leaving the screen.
  useEffect(() => () => { conv.current?.endSession(); conv.current = null; }, []);

  const clientTools = Object.fromEntries(Object.keys(TOOLS).map((name) => [name, async (params) => {
    const t0 = performance.now();
    let result;
    try { result = await runTool(name, params); } catch (e) { result = { error: e.message }; }
    const ms = Math.round(performance.now() - t0);
    add({ role: 'tool', text: toolSummary(name, result), tool: { name, args: params, result, ms } });
    if (TOOLS[name].writes && !result.error) refresh();
    if (name === 'generate_dossier' && result.path) window.open(result.path, '_blank', 'noopener');
    return JSON.stringify(result);
  }]));

  const start = async () => {
    setErr(null);
    setStatus('connecting');
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const { signed_url } = await api.get('/api/voice/signed-url');
      conv.current = await Conversation.startSession({
        signedUrl: signed_url,
        clientTools,
        onConnect: () => {
          setStatus('live');
          if (queued.current) { conv.current?.sendUserMessage(queued.current); queued.current = null; }
        },
        onDisconnect: () => { conv.current = null; setStatus('idle'); setSpeaking(false); },
        onMessage: (m) => {
          const text = stripAudioTags(m.message || '');
          if (text) add({ role: (m.role || m.source) === 'user' ? 'user' : 'ai', text });
        },
        onModeChange: ({ mode }) => setSpeaking(mode === 'speaking'),
        onError: (msg) => setErr(String(msg)),
        onUnhandledClientToolCall: (c) => setErr(`El agente pidió una herramienta desconocida: ${c?.tool_name}`),
      });
    } catch (e) {
      setStatus('idle');
      setErr(e.status === 404
        ? 'El asesor por voz no está configurado: faltan ELEVENLABS_API_KEY y ELEVENLABS_AGENT_ID en backend/.env.'
        : e.name === 'NotAllowedError' ? 'Permiso de micrófono denegado. Actívalo en el navegador.' : e.message);
    }
  };

  const toggle = () => (conv.current ? conv.current.endSession() : start());

  const send = (text) => {
    const q = text.trim();
    if (!q) return;
    setInput('');
    add({ role: 'user', text: q });
    if (conv.current && status === 'live') conv.current.sendUserMessage(q);
    else { queued.current = q; if (status === 'idle') start(); }
  };

  const live = status === 'live';
  return (
    <div className="stack">
      <section className="card voice-hero">
        <button className={`mic-xl ${live ? (speaking ? 'speaking' : 'live') : ''}`} onClick={toggle} disabled={status === 'connecting'} aria-label={live ? 'Colgar' : 'Hablar con el asesor'}>
          {status === 'connecting' ? <span className="spinner" style={{ width: 28, height: 28 }} /> : <Icon name={live ? 'phoneOff' : 'mic'} size={40} />}
        </button>
        <p className="voice-status" aria-live="polite">
          {err ? <span className="danger-text">{err}</span>
            : live ? (speaking ? 'Rumbo está hablando' : 'Te escucho. Pulsa para colgar.')
              : status === 'connecting' ? 'Conectando…' : 'Pulsa y pregunta en voz alta'}
        </p>
        <p className="small">Las cifras salen siempre de las reglas de Rumbo; el asistente solo las explica.</p>
      </section>

      <section className="card">
        <div className="group-head">
          <h2>Conversación</h2>
          {!state.modes.elevenlabs && <span className="small warn-text">Sin claves de ElevenLabs</span>}
        </div>
        <div className="chat" ref={chatRef} aria-live="polite">
          {messages.map((m, i) => (
            m.role === 'tool'
              ? <div key={i} className="msg ai tool-msg"><span className="small muted">{m.text}</span><ToolCall t={m.tool} /></div>
              : <div key={i} className={`msg ${m.role}`}>{m.text}</div>
          ))}
          {status === 'connecting' && <div className="msg ai"><span className="typing" aria-label="Conectando"><i /><i /><i /></span></div>}
        </div>
        <div className="prompts">
          {PROMPTS.map((p) => <button key={p} className="chip" onClick={() => send(p)} disabled={status === 'connecting'}>{p}</button>)}
        </div>
        <form className="composer" onSubmit={(e) => { e.preventDefault(); send(input); }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="¿Me afecta quedarme tres semanas más en Lisboa?" aria-label="Pregunta" />
          <Button variant="primary" icon="send" disabled={status === 'connecting'}>Enviar</Button>
        </form>
        <p className="small muted">Las preguntas escritas se envían al mismo agente; la respuesta llega por voz y por escrito.</p>
      </section>
    </div>
  );
}
