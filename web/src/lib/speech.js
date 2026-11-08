// Browser voice helpers. ElevenLabs is used when the server has a key;
// otherwise we fall back to the Web Speech API so the demo always works.

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

/** Record audio with MediaRecorder; returns { stop(): Promise<Blob> }. */
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = new MediaRecorder(stream);
  const chunks = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  rec.start();
  return {
    stop: () => new Promise((resolve) => {
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
      };
      rec.stop();
    }),
  };
}

/** Transcribe with ElevenLabs Scribe via our server. */
export async function scribe(blob) {
  const r = await fetch('/api/scribe', { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Scribe no disponible');
  return data.text;
}

let currentAudio = null;
/** Speak text: ElevenLabs TTS through our server, else speechSynthesis. */
export async function speak(text, { useElevenLabs = false } = {}) {
  stopSpeaking();
  if (useElevenLabs) {
    try {
      const r = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      if (r.ok) {
        const url = URL.createObjectURL(await r.blob());
        currentAudio = new Audio(url);
        await currentAudio.play();
        return;
      }
    } catch { /* fall back */ }
  }
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
