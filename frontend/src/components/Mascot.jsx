// Rumbo, the fennec mascot: the face of the voice agent.
// All poses share the same canvas (viewBox 240x280), so they are stacked and cross-faded
// without the character jumping. Assets live in public/mascota/.
const STATES = ['saludando', 'escuchando', 'pensando', 'hablando', 'aviso', 'celebrando'];
const LABELS = {
  saludando: 'Rumbo saludando', escuchando: 'Rumbo escuchando', pensando: 'Rumbo pensando',
  hablando: 'Rumbo hablando', aviso: 'Rumbo avisando', celebrando: 'Rumbo celebrando',
};

export default function Mascot({ state = 'saludando', size = 160, className = '' }) {
  const current = STATES.includes(state) ? state : 'saludando';
  return (
    <div className={`rumbo-avatar ${className}`} style={{ width: size }} role="img" aria-label={LABELS[current]}>
      {STATES.map((s) => (
        <img key={s} src={`/mascota/rumbo-${s}.svg`} alt="" className={s === current ? 'is-active' : ''} draggable="false" />
      ))}
    </div>
  );
}
