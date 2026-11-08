import { useEffect, useRef, useState } from 'react';
import { ConversationProvider, useConversation } from '@elevenlabs/react';
import { api } from '../lib/api.js';
import { canRecognize, listenOnce, speak, stopSpeaking } from '../lib/speech.js';
import Icon from './Icon.jsx';
import { Button, Skeleton } from './ui.jsx';

const PROMPTS = [
  'Me han ofrecido quedarme dos meses más en Lisboa. ¿Me afecta?',
  '¿Cuántos días llevo en Portugal?',
  '¿Dónde soy residente fiscal este año?',
  '¿Cuánto tengo apartado para impuestos?',
  '¿Me sale mejor el invierno en México o en Tailandia?',
  'Coworking en Medellín, 80 euros',
];

// Same names as the ElevenLabs server tools; also registered as client tools
// so the agent works in local dev without a public webhook URL.
const TOOL_NAMES = ['get_days_by_country', 'get_residency_status', 'simulate_stay', 'get_tax_reserve', 'register_expense', 'get_alerts', 'compare_scenarios'];

function ToolCalls({ tools }) {
  if (!tools?.length) return null;
  return (
    <details className="tools">
      <summary>Datos consultados: {tools.map((t) => t.name).join(', ')}</summary>
      {tools.map((t, i) => <pre key={i}>{`${t.name}(${JSON.stringify(t.args)})\n→ ${JSON.stringify(t.result, null, 2).slice(0, 1200)}`}</pre>)}
    </details>
  );
}

/** Big mic, ElevenLabs agent mode. */
function AgentMic({ onMessage, onTool, refresh }) {
  const [err, setErr] = useState(null);
  const conversation = useConversation({
    onMessage: (m) => onMessage({ role: m.source === 'user' ? 'user' : 'ai', text: m.message }),
    onError: (m) => setErr(String(m)),
  });
  const clientTools = Object.fromEntries(TOOL_NAMES.map((name) => [name, async (params) => {
    const r = await api.post(`/api/tools/${name}`, params || {});
    onTool({ name, args: params, result: r });
    if (name === 'register_expense') refresh();
    return JSON.stringify(r);
  }]));

  const live = conversation.status === 'connected';
  const connecting = conversation.status === 'connecting';
  const toggle = async () => {
    if (live) return conversation.endSession();
    setErr(null);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const s = await api.get('/api/elevenlabs/session');
      const opts = s.conversationToken ? { conversationToken: s.conversationToken, connectionType: 'webrtc' } : { agentId: s.agentId, connectionType: 'webrtc' };
      conversation.startSession({ ...opts, clientTools });
    } catch (e) { setErr(e.message); }
  };

  return (
    <>
      <button className={`mic-xl ${live ? (conversation.isSpeaking ? 'speaking' : 'live') : ''}`} onClick={toggle} disabled={connecting} aria-label={live ? 'Colgar' : 'Hablar con el asesor'}>
        {connecting ? <span className="spinner" style={{ width: 28, height: 28 }} /> : <Icon name={live ? 'phoneOff' : 'mic'} size={40} />}
      </button>
      <p className="voice-status" aria-live="polite">
        {err ? <span className="danger-text">{err}</span>
          : live ? (conversation.isSpeaking ? 'Rumbo está hablando' : 'Te escucho. Pulsa para colgar.')
            : connecting ? 'Conectando…' : 'Pulsa y pregunta en voz alta'}
      </p>
    </>
  );
}

/** Big mic, local mode (browser speech + same API). */
function LocalMic({ listening, speaking, onClick }) {
  return (
    <>
      <button className={`mic-xl ${listening ? 'live' : speaking ? 'speaking' : ''}`} onClick={onClick} disabled={!canRecognize() || listening} aria-label="Hablar con el asesor">
        <Icon name="mic" size={40} />
      </button>
      <p className="voice-status" aria-live="polite">
        {!canRecognize() ? 'Tu navegador no admite voz: escribe la pregunta abajo.' : listening ? 'Te escucho…' : 'Pulsa y pregunta en voz alta'}
      </p>
    </>
  );
}

export default function Advisor({ state, refresh }) {
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([
    { role: 'ai', text: `Hola, ${state.profile.name.split(' ')[0]}. Pregúntame si te afecta alargar una estancia, cuántos días llevas o dicta un gasto.` },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const chatRef = useRef(null);

  useEffect(() => { api.get('/api/elevenlabs/session').then(setSession).catch(() => setSession({ mode: 'local' })); }, []);
  useEffect(() => { chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, busy]);

  const add = (m) => setMessages((xs) => [...xs, m]);

  const send = async (text) => {
    const q = text.trim();
    if (!q) return;
    setInput('');
    add({ role: 'user', text: q });
    setBusy(true);
    try {
      const r = await api.post('/api/advisor/ask', { text: q });
      add({ role: 'ai', text: r.answer, tools: r.tools });
      if (voiceOn) {
        setSpeaking(true);
        speak(r.answer, { useElevenLabs: state.services.elevenlabs_key }).finally(() => setTimeout(() => setSpeaking(false), 1500));
      }
      if (r.intent === 'register_expense') refresh();
    } catch (e) {
      add({ role: 'ai', text: `No he podido responder: ${e.message}` });
    } finally { setBusy(false); }
  };

  const listen = async () => {
    stopSpeaking();
    setListening(true);
    try { const t = await listenOnce(); if (t) await send(t); }
    catch (e) { add({ role: 'ai', text: e.message }); }
    finally { setListening(false); }
  };

  const agentMode = session?.mode === 'agent';
  const hero = (
    <section className="card voice-hero">
      {!session ? <Skeleton lines={2} />
        : agentMode
          ? <AgentMic onMessage={add} onTool={(t) => add({ role: 'ai', text: `Consultado ${t.name}`, tools: [t] })} refresh={refresh} />
          : <LocalMic listening={listening} speaking={speaking} onClick={listen} />}
      <p className="small">Las cifras salen siempre de las reglas de Rumbo; el asistente solo las explica.</p>
    </section>
  );

  const body = (
    <div className="stack">
      {hero}
      <section className="card">
        <div className="group-head">
          <h2>Conversación</h2>
          <label className="toggle small"><input type="checkbox" checked={voiceOn} onChange={(e) => { setVoiceOn(e.target.checked); stopSpeaking(); }} /> Leer respuestas en voz alta</label>
        </div>
        <div className="chat" ref={chatRef} aria-live="polite">
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              {m.text}
              {m.role === 'ai' && <ToolCalls tools={m.tools} />}
            </div>
          ))}
          {busy && <div className="msg ai"><span className="typing" aria-label="Consultando"><i /><i /><i /></span></div>}
        </div>
        <div className="prompts">
          {PROMPTS.map((p) => <button key={p} className="chip" onClick={() => send(p)} disabled={busy}>{p}</button>)}
        </div>
        <form className="composer" onSubmit={(e) => { e.preventDefault(); send(input); }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="¿Me afecta quedarme tres semanas más en Lisboa?" aria-label="Pregunta" />
          <Button variant="primary" icon="send" busy={busy}>Enviar</Button>
        </form>
        {!agentMode && session && <p className="small muted">Voz del navegador. Añade las claves de ElevenLabs en .env para usar el agente real.</p>}
      </section>
    </div>
  );

  return agentMode ? <ConversationProvider>{body}</ConversationProvider> : body;
}
