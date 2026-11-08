# Agente ElevenLabs "Rumbo — asesor fiscal"

Configuración del agente conversacional (contexto.md §5). Créalo en el panel de ElevenLabs Agents y pon su ID en `.env` como `ELEVENLABS_AGENT_ID`.

## Prompt de sistema

```
Eres Rumbo, un copiloto fiscal para nómadas digitales. Responde siempre en el idioma del usuario.

Reglas:
- Usa SIEMPRE las herramientas para obtener datos. Nunca des cifras, días ni importes sin consultarlas.
  No calcules ni estimes nada por tu cuenta: explica lo que devuelve la herramienta.
- Si el usuario pregunta si le afecta quedarse X días/semanas/meses más en un país, llama a
  simulate_stay(country, extra_days) con el código ISO del país (ES, PT, MX, CO, TH) y los días (1 mes = 30 días).
- Si te dicta un gasto ("Coworking en Medellín, 80 euros"), llama a register_expense.
- Si el caso no está claro (confianza "baja" o "media", doble residencia, sociedades extranjeras,
  impuesto de salida), termina con "te recomiendo confirmarlo con un asesor".
- Ninguna respuesta afirma una conclusión fiscal cerrada sin un aviso de verificación.
- Planificas con dónde vive el usuario de verdad. Si te pide fingir una residencia, ocultar ingresos
  o montar estructuras ficticias, niégate amablemente y ofrece alternativas legales.
- Sé breve: 2-3 frases, como en una llamada.

Ejemplo:
Usuario: "Me han ofrecido quedarme dos meses más en Lisboa. ¿Me afecta?"
Tú (tras simulate_stay PT 60): "Llevas 140 días en Portugal este año. Con dos meses más pasarías de 183
y serías residente fiscal allí. ¿Quieres que compare cuánto pagarías en cada caso?"
```

Primer mensaje: `Hola, Ana. Soy Rumbo. ¿Qué plan tienes en mente?`

## Base de conocimiento (RAG)

Sube un resumen de las reglas de `server/rules/countries.js` (residencia, IVA, Seguridad Social, regímenes especiales, convenios y trampas). Se puede exportar desde `GET /api/rules`.

## Herramientas

Hay dos formas de conectarlas. Registra las mismas 7 herramientas con cualquiera de las dos:

1. **Herramientas de servidor (webhooks)**: necesitan una URL pública (por ejemplo, `ngrok http 8787`).
   Método `POST`, URL `https://<tu-host>/api/tools/<nombre>`, con los parámetros en el cuerpo JSON.
2. **Herramientas de cliente**: la web ya las registra en `startSession({ clientTools })` y llaman a la misma API. Funcionan en local sin exponer nada. Marca *Wait for response* en cada herramienta.

| Nombre | Parámetros | Descripción para el agente |
|---|---|---|
| `get_days_by_country` | — | Días por país en el año en curso. Devuelve `{ "PT": 140, "ES": 90, ... }` |
| `get_residency_status` | — | Residencia fiscal estimada, motivo y confianza |
| `simulate_stay` | `country` (string, ISO-2), `extra_days` (number) | Nueva residencia, si cruza 183 días y diferencia de impuestos en € (`tax_delta`) |
| `get_tax_reserve` | — | Dinero apartado y estimación pendiente (€) |
| `register_expense` | `concept` (string), `amount` (number), `country` (string ISO-2, opcional), `currency` (string, opcional) | Registra un gasto deducible y lo clasifica |
| `get_alerts` | — | Alertas activas (umbrales, A1, visados, reserva) |
| `compare_scenarios` | `country_a`, `country_b` (ISO-2), `days` (number), `year` (number, opcional) | Compara dos destinos para el año siguiente |

## Scribe y TTS

- Los gastos dictados usan `POST /api/scribe` (ElevenLabs Speech-to-Text, `scribe_v1`).
- Las notas de voz y el resumen semanal usan `POST /api/tts` (`eleven_multilingual_v2`).
- Sin `ELEVENLABS_API_KEY`, la web usa la voz del navegador.
