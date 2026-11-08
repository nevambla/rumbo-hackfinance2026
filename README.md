# 🧭 Rumbo

> Copiloto fiscal por voz para nómadas digitales. **Trabaja desde donde quieras. Tributa sabiendo dónde.**

Proyecto de hackathon (noviembre de 2026). Contexto completo en [`contexto.md`](contexto.md).

## Arrancar

```bash
npm install
npm run dev        # API en :8787 + web en http://localhost:5173
npm test           # tests del motor de reglas
npm start          # build de producción servido por Express en :8787
```

Funciona sin claves: en **modo local** el asesor usa el reconocimiento y la síntesis de voz del navegador (mejor en Chrome) con las mismas herramientas de la API.
Para usar ElevenLabs, copia `.env.example` a `.env` y rellena `ELEVENLABS_API_KEY` y `ELEVENLABS_AGENT_ID`. La configuración del agente está en [`elevenlabs/agent.md`](elevenlabs/agent.md).

## Funcionalidades

| Sección | Qué hace |
|---|---|
| **Rastrea** | Días por país (año natural o ventana de 365 días según el país), calendario del año, viajes y residencia fiscal estimada con motivo y nivel de confianza |
| **Avisa** | Alertas por umbral de 183/180 días, caducidad del A1 y de visados, falta de dinero apartado y trampas fiscales. Notas de voz y resumen semanal en audio |
| **Aparta** | Facturas con el IVA correcto (nacional, inversión del sujeto pasivo o no sujeta), reserva del % de impuestos por cobro y vista de impresión de la factura |
| **Asesor por voz** | Agente de ElevenLabs (`@elevenlabs/react`) o modo local. Responde a "¿me afecta quedarme X días más en Y?" |
| **Gastos** | Gastos dictados (Scribe o voz del navegador), clasificados y marcados como deducibles |
| **Simulador** | "¿Me afecta quedarme más?" y comparación de dos escenarios (resto del año o año siguiente) |
| **Regímenes y trampas** | Ley Beckham, IFICI, LTR, RESICO y visado nómada de Colombia; trampas fiscales; matriz de convenios |
| **Reglas y fuentes** | Todas las reglas con `source_url` y `verified_at` |
| **Planes y asesores** | Planes Gratis, Pro y Asesores, y derivación a un asesor colaborador |

## Arquitectura

```
server/
  rules/countries.js   reglas de los 5 países (cada una con source_url y verified_at)
  fx.js                única capa de conversión de moneda (importes en céntimos)
  engine.js            motor determinista: días, residencia, impuestos, IVA, simulaciones, alertas
  advisor.js           asesor local: detecta la intención → llama a las herramientas → explica
  index.js             API REST + webhooks /api/tools/* + proxys a ElevenLabs (TTS, Scribe, token)
  data/ana.json        persona de demo (140 días en Portugal el 2026-11-08)
web/src/               React (Vite)
elevenlabs/agent.md    prompt y herramientas del agente
```

**Principio clave:** las cifras salen siempre del motor de reglas. El agente de voz solo consulta la API y explica el resultado.

> ⚠️ Las reglas fiscales están simplificadas y todas tienen `verified_at: null` (pendientes de verificar con fuentes oficiales). Rumbo es un copiloto, no un asesor fiscal.
