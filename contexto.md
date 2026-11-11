# Rumbo — Contexto del proyecto

> Copiloto fiscal por voz para nómadas digitales.
> **Trabaja desde donde quieras. Tributa sabiendo dónde.**

Especificación de producto con la que arrancamos el proyecto en HackFinance 2026: qué problema resolvemos, por qué y con qué límites. Lo que está construido, cómo se instala y cómo se prueba está en el [README](README.md).

---

## 1. Problema

Los nómadas digitales cambian de país cada pocas semanas o meses. Saben dónde trabajan, pero no dónde tributan. Tienen tres preguntas sin responder:

1. **¿Dónde soy residente fiscal este año?** Pueden acabar siendo residentes en dos países a la vez, o en ninguno. En este último caso, Hacienda española suele seguir reclamando.
2. **¿Cuántos días me quedan?** Si alargan una estancia y pasan de 183 días en un país, pueden cambiar de residencia fiscal sin darse cuenta.
3. **¿Cómo facturo y cotizo?** IVA a clientes de otros países (inversión del sujeto pasivo), Seguridad Social (certificado A1) y visados de nómada digital: cada país tiene sus normas.

**Idea clave:** los impuestos no cambian cada semana aunque cambies de país. La residencia fiscal se determina **por año**, con reglas como los 183 días, el centro de intereses vitales y los convenios de doble imposición. El producto rastrea y avisa; no "cobra impuestos por semana".

### Persona de ejemplo (la que usamos en la demo)

Ana, diseñadora freelance con clientes en tres países. En 2026: Madrid (ene–mar, 90 días), Lisboa (abr–jun, 91), Medellín (jul–sep, 92), Bangkok (oct–dic, 92). No llega a 183 días en ningún país.

---

## 2. Solución

Rumbo hace tres cosas:

| Pilar | Qué hace |
|---|---|
| **Rastrea** | Cuenta los días en cada país (ubicación del móvil, vuelos) y dice dónde es residente fiscal el usuario este año. |
| **Avisa** | Alerta antes de cruzar un umbral: 183 días, obligaciones de IVA, A1 que caduca, visado que vence. |
| **Aparta** | Con cada factura cobrada, reserva el % de impuestos del país donde va a tributar y genera la factura con el IVA correcto. |

Además, una capa de **optimización fiscal legal**:

- **Simulador de escenarios:** "¿Me sale mejor el invierno en México o en Tailandia?"
- **Regímenes especiales:** detectar antes de mudarse si el usuario podría acogerse a la Ley Beckham (España), al IFICI (Portugal; sustituye al antiguo régimen de residente no habitual), etc.
- **Deducciones por voz:** "Coworking en Medellín, 80 euros" → gasto registrado y clasificado.
- **Evitar la doble imposición:** aplicar convenios y recuperar retenciones de otros países.

### Línea roja (no negociable)

- Rumbo planifica con **dónde vive el usuario de verdad**. No ayuda a fingir una residencia, ocultar ingresos ni montar estructuras ficticias.
- Rumbo es un **copiloto**, no un asesor fiscal. Cuando el caso es complejo, deriva a un asesor colaborador.
- Trampas que la app debe **avisar**, no esquivar:
  - España: si te vas a un paraíso fiscal, puedes seguir siendo residente español durante el año del cambio y los cuatro siguientes.
  - No ser residente en ningún sitio no es una opción real.
  - Una sociedad extranjera (p. ej. una OÜ estonia) gestionada desde España puede acabar tributando en España.
  - Impuesto de salida si tienes una cartera de inversión grande.

---

## 3. Alcance del MVP (hackathon)

- **5 países:** España, Portugal, México, Colombia y Tailandia.
- Datos de viajes **simulados** (historial de Ana) en lugar de geolocalización real.
- Funcionalidades que deben funcionar en la demo:
  1. Contador de días por país y estimación de residencia fiscal del año.
  2. Alertas de umbral (como mínimo, los 183 días).
  3. Reserva de impuestos por factura.
  4. Asesor por voz (ElevenLabs) que responde a "¿me afecta quedarme X días más en Y?".
  5. Simulador de dos escenarios.
- **Fuera del MVP:** pagos reales, conexión bancaria, OCR de tickets, presentación de impuestos, más de 5 países.

> ⚠️ Las reglas fiscales de cada país cambian a menudo. Verificad cada regla con fuentes oficiales antes de meterla en el motor y anotad la fuente en el código (ver §6).

---

## 4. Arquitectura

```
[Datos]                 [Motor de reglas]          [Salidas]               [Interfaz]
ubicación / vuelos  →   residencia por año     →   reserva de impuestos →  app web / móvil
facturas            →   umbrales y alertas     →   alertas              →  asesor por voz (ElevenLabs)
gastos dictados     →   convenios (5 países)   →   simulaciones
```

**Principio clave:** los cálculos fiscales los hace **nuestra API con reglas deterministas**. El agente de voz solo consulta la API y explica el resultado. Nunca calcula ni se inventa cifras.

### Stack

- **Frontend:** React + Vite, con `@elevenlabs/client` para el asesor por voz.
- **Backend:** Python con FastAPI; motor de reglas determinista.
- **Datos:** ficheros JSON con el historial de Ana y las reglas de los 5 países, cada una con su fuente.
- **Voz:** agente conversacional de ElevenLabs con Claude como modelo y *client tools* conectadas a la API.

---

## 5. Integración con ElevenLabs

### 5.1 Agente "asesor fiscal" (núcleo de la demo)

- **Prompt de sistema:** asistente fiscal para nómadas. Responde en el idioma del usuario. Siempre usa herramientas para obtener datos y nunca da cifras sin consultarlas. Cuando un caso no está claro, termina con "te recomiendo confirmarlo con un asesor".
- **Base de conocimiento (RAG):** resumen de las reglas de residencia, IVA, Seguridad Social y regímenes especiales de los 5 países, y de los convenios entre ellos.
- **Herramientas** (*client tools*: el agente las pide y el navegador las ejecuta contra nuestra API):

| Tool | Descripción | Respuesta (ejemplo) |
|---|---|---|
| `get_days_by_country` | Días por país en el año en curso | `{ "PT": 140, "ES": 90 }` |
| `get_residency_status` | Residencia fiscal estimada y motivo | `{ "country": "ES", "reason": "...", "confidence": "media" }` |
| `simulate_stay` | `(country, extra_days)` → nueva residencia y diferencia de impuestos | `{ "new_residency": "PT", "crosses_183": true, "tax_delta": 1234 }` |
| `get_tax_reserve` | Dinero apartado y estimación pendiente | `{ "reserved": 5400, "estimated_due": 6100 }` |
| `register_expense` | `(concept, amount, country)` → gasto deducible registrado | `{ "id": "...", "deductible": true }` |

### 5.2 Alertas proactivas

Nota de voz o llamada saliente cuando el usuario se acerca a un umbral: "Te quedan 12 días antes de ser residente en México."

### 5.3 Gastos dictados

Scribe (voz a texto) → `register_expense`. Sustituye al OCR en el MVP.

### 5.4 (Opcional) Resumen semanal en audio

Texto a voz con los días por país, los impuestos apartados y los riesgos.

### Guion de la demo

> **Ana:** "Me han ofrecido quedarme dos meses más en Lisboa. ¿Me afecta?"
> **Rumbo:** "Llevas 140 días en Portugal este año. Con dos meses más pasarías de 183 y serías residente fiscal allí. ¿Quieres que compare cuánto pagarías en cada caso?"

Para que esta conversación funcione, el dataset de demo debe poner a Ana con **140 días en Portugal** en el momento de la demo. Ajustadlo respecto al calendario de la persona del §1 si hace falta.

---

## 6. Convenciones para el código

- Cada regla fiscal es un objeto con `country`, `rule`, `threshold`, `source_url` y `verified_at`. **Ninguna regla sin fuente.**
- Los importes van en céntimos (enteros) y en la moneda de origen; las conversiones se hacen en una sola capa.
- Los textos que ve el usuario van en español. Las claves y el código, en inglés.
- Ninguna respuesta del agente afirma una conclusión fiscal cerrada sin un aviso de verificación.

---

## 7. Modelo de negocio

| Plan | Precio | Incluye |
|---|---|---|
| Gratis | 0 € | Contador de días, alertas de umbral, reserva de impuestos |
| Pro | Por definir | Asesor por voz, simulador, facturas con IVA correcto, regímenes especiales |
| Asesores | Comisión por definir | Derivación de casos complejos a asesores colaboradores |
