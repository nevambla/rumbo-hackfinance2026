// Browser voice helpers (Web Speech API): reading alerts aloud and dictating expenses.
// The voice advisor itself uses the ElevenLabs agent (see components/Advisor.jsx).

export const canRecognize = () => typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

/** One-shot speech recognition (browser). Resolves with the transcript. */
export function listenOnce(lang = 'es-ES') {
  return new Promise((resolve, reject) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return reject(new Error('Tu navegador no soporta reconocimiento de voz. Usa Chrome o escribe la pregunta.'));
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => resolve(e.results[0][0].transcript);
    rec.onerror = (e) => reject(new Error(e.error === 'not-allowed' ? 'Permiso de micrófono denegado' : `Error de voz: ${e.error}`));
    rec.onend = () => resolve('');
    rec.start();
  });
}

let currentAudio = null;
let ttsUnavailable = null; // reason the agent's voice is not available (set after the first failure)

/** Why the ElevenLabs voice is not being used, or null. */
export const ttsFallbackReason = () => ttsUnavailable;

function browserSpeak(text) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'es-ES';
    const v = speechSynthesis.getVoices().find((x) => x.lang?.startsWith('es'));
    if (v) u.voice = v;
    u.onend = resolve;
    u.onerror = resolve;
    speechSynthesis.speak(u);
  });
}

/**
 * Speak text with the SAME voice as the ElevenLabs agent (POST /api/voice/tts).
 * Falls back to the browser voice if the backend has no keys or the key lacks the TTS permission.
 * Resolves when playback ends.
 */
export async function speak(text) {
  stopSpeaking();
  if (!ttsUnavailable) {
    try {
      const r = await fetch('/api/voice/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      if (r.ok) {
        const url = URL.createObjectURL(await r.blob());
        const audio = new Audio(url);
        currentAudio = audio;
        await new Promise((resolve) => {
          audio.onended = resolve;
          audio.onerror = resolve;
          audio.onpause = resolve;
          audio.play().catch(resolve);
        });
        URL.revokeObjectURL(url);
        if (currentAudio === audio) currentAudio = null;
        return;
      }
      const data = await r.json().catch(() => ({}));
      // 404 = no keys, 503 = key without text_to_speech permission: don't retry on every click.
      if (r.status === 404 || r.status === 503) ttsUnavailable = data.detail || `Error ${r.status}`;
    } catch { /* network error: fall back this time */ }
  }
  await browserSpeak(text);
}

export function stopSpeaking() {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}
