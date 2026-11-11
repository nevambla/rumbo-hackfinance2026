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
/** Speak text with the browser's speechSynthesis. */
export async function speak(text) {
  stopSpeaking();
  if ('speechSynthesis' in window) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'es-ES';
    const v = speechSynthesis.getVoices().find((x) => x.lang?.startsWith('es'));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  }
}
export function stopSpeaking() {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}
