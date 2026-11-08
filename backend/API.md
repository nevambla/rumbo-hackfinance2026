# Guía de integración del frontend con la API de Rumbo

Lo que necesita un frontend para integrarse con el backend sin leer su código.

- **Tipos y endpoints:** [`contract/openapi.json`](contract/openapi.json). En vivo: `http://localhost:8000/docs` (Swagger) y `/openapi.json`.
- **Respuestas reales de ejemplo:** [`contract/examples/`](contract/examples/). Cada fichero trae la petición y la respuesta para la usuaria de demo (Ana, a 18/08/2026). Sirven como *fixtures* para maquetar sin backend.
- **Client tools del agente de voz:** [`contract/client_tools.json`](contract/client_tools.json).

Si cambia la API, ejecuta `make contract` y sube los ficheros de `contract/`. Un test falla si `openapi.json` no está al día.

## Convenciones

| Tema | Regla |
|---|---|
| Base URL | `http://localhost:8000` en local; todas las rutas empiezan por `/api` |
| CORS | Orígenes permitidos en `CORS_ORIGINS` (por defecto, los puertos 5173 y 3000). `CORS_ORIGINS=*` permite cualquiera. Alternativa: un proxy de `/api` en el servidor de desarrollo del frontend |
| Dinero | **Siempre céntimos enteros** (`*_cents`), en euros salvo que se indique `currency`. El frontend solo formatea (`cents / 100`), nunca calcula importes. La única entrada en euros es `register_expense.amount_eur` |
| Fechas | ISO `AAAA-MM-DD`. "Hoy" es el **reloj de demo** (`GET /api/clock`), no la fecha del navegador |
| Textos | Los campos `*_es` son texto para el usuario, ya redactado en español. Muéstralos tal cual |
| Fuentes | Las conclusiones traen `rule_id` y `source_url`. Si `verified` es `false`, muestra "pendiente de verificar". Si `is_estimate` es `true`, muestra "estimación" |
| Errores | HTTP 4xx/5xx con `{"detail": ...}`. Un error 422 trae la lista de validación de FastAPI |
| Latencia | Todos los `/api/tools/*` calculan en memoria (unos pocos ms). Solo `/api/trips/parse` puede tardar (llama a Claude si hay clave) |

## Endpoints

### Panel
| Método | Ruta | Para qué |
|---|---|---|
| GET | `/api/state` | **Todo el panel en una llamada**: reloj, usuaria, viajes, residencia, presupuesto de días, hucha, alertas y modos (`modes.anthropic`, `modes.elevenlabs`). Vuelve a pedirlo después de cualquier escritura |
| GET | `/api/health` | `{ok, version, modes}` |

### Tools del agente (también se usan desde la interfaz)
| Tool | Método y ruta | Entrada | Devuelve (campos clave) |
|---|---|---|---|
| `get_days_by_country` | GET `/api/tools/days?year=` | — | `days: {ES: 90, PT: 140}` |
| `get_residency_status` | GET `/api/tools/residency?year=` | — | `claims[]`, `pending_questions[]`, `dual_residency`, `tie_breakers[]`, `warnings_es[]`, `confidence`, `disclaimer_es` |
| `get_day_budget` | GET `/api/tools/budget` | — | `items[]`: `days_used`, `days_left`, `threshold`, `days_used_with_planned`, `projected_cross_date`, `status` (`ok`/`warn`/`crossed`), `message_es` |
| `simulate_stay` | POST `/api/tools/simulate` | `{country, extra_days, start_date?}` | `days_before/after`, `crosses_threshold`, `cross_date`, `before`/`after` (residencia), `tax_*_cents`, `tax_by_country_after_cents`, `explanation_es`. **No guarda nada** |
| `get_tax_reserve` | GET `/api/tools/reserve` | — | `reserved_cents`, `estimated_cents`, `pending_cents`, `interest_cents`, `summary_es` |
| `register_expense` | POST `/api/tools/expenses` | `{concept, amount_eur, country}` | `expense`, `message_es` |
| `answer_question` | POST `/api/tools/answers` | `{question_key, value}` | `residency` recalculada |
| `get_alerts` | GET `/api/tools/alerts` | — | `alerts[]`: `level` (`info`/`warn`/`danger`), `title_es`, `message_es` |
| `generate_dossier` | POST `/api/tools/dossier` | — | `url` (absoluta, para abrir el PDF), `path`, `missing_documents_es[]` |

`answer_question.value`:
- Preguntas pendientes: `true` o `false`.
- Criterios de desempate (`question_key` = `tiebreak_*`): código de país (`"PT"`) o `"both"`.

### Resto
| Método | Ruta | Para qué |
|---|---|---|
| POST | `/api/trips/parse` | `{text}` → **propuesta** de viajes (`trips[]` con `country_iso2`, fechas, `confidence`, `evidence_text`, `needs_review`, y `warnings_es`). **No guarda nada**: el usuario confirma |
| GET | `/api/trips/samples` | Emails de ejemplo para la demo (`{id, label, text}`) |
| POST | `/api/trips` | Guarda un viaje confirmado: `{country, city, start_date, end_date, source: "parsed"}`. Si empieza después de hoy, se guarda como planificado |
| POST | `/api/invoices` | `{client, client_country, amount_cents, currency}` → aparta la reserva en la hucha |
| GET | `/api/clock` | `{today, base_date, offset_days}` |
| POST | `/api/clock/advance` | `{days}` → avanza el reloj de demo (botón "Avanzar 30 días") |
| POST | `/api/demo/reset` | Vuelve al estado inicial y devuelve el `/api/state` completo |
| GET | `/api/dossier/{id}.pdf` | Descarga del expediente |
| GET | `/api/voice/signed-url` | `{signed_url}` para iniciar el agente privado de ElevenLabs. **Error 404 si no hay claves**: en ese caso, usa el modo de voz simulado |

## Cómo conectar el agente de voz (client tools)

El agente de ElevenLabs no llama a la API: pide al **navegador** que ejecute una *client tool*, y el frontend llama al endpoint.

1. Para cada tool de `contract/client_tools.json`, registra en el SDK de React (`@elevenlabs/react`) un handler **con el mismo `name`**.
2. El handler llama a `endpoint.method` + `endpoint.path`. Los parámetros van en la query (`params_in: "query"`), en el cuerpo JSON (`"body"`) o no hay (`null`).
3. Pinta una tarjeta con el resultado completo en pantalla.
4. Devuelve al agente un **string JSON compacto** con los campos útiles (incluidos `rule_id` y `source_url`). El agente no calcula: solo lee lo que le devuelves.
5. Después de `register_expense` o `answer_question`, vuelve a pedir `/api/state` para refrescar el panel.

Para iniciar la sesión: `GET /api/voice/signed-url` → `startSession({ signedUrl })`. Revisa la API vigente del paquete instalado: en la versión 1.x es `ConversationProvider` + `useConversationClientTool`.

Para crear las tools en el panel de ElevenLabs, usa el mismo JSON sin la clave `endpoint`.

Sin claves de ElevenLabs, la interfaz debe ofrecer un **modo simulado**: un campo de texto cuyo guion local llama a los mismos endpoints.

## Pantallas sugeridas y de dónde sale cada dato

| Bloque | Fuente |
|---|---|
| Cabecera: fecha de demo, "Avanzar 30 días", "Reiniciar demo" | `state.clock`, `POST /api/clock/advance`, `POST /api/demo/reset` |
| Residencia del año (países, motivo, confianza, preguntas, desempate) | `state.residency` + `POST /api/tools/answers` |
| Baterías de días ("te quedan 43 días en Portugal") | `state.budget.items` |
| Hucha fiscal | `state.reserve` + `POST /api/invoices` |
| Alertas | `state.alerts.alerts` |
| Pega tu reserva | `GET /api/trips/samples`, `POST /api/trips/parse`, `POST /api/trips` |
| Simulador | `POST /api/tools/simulate` |
| Expediente | `POST /api/tools/dossier` → abrir `url` |
