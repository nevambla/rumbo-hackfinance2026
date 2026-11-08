# Rumbo API · backend

API del copiloto fiscal Rumbo para nómadas digitales (hackathon HackFinance 2026, BEST UC3M). Calcula de forma **determinista** dónde es residente fiscal el usuario, cuántos días le quedan en cada país, cuánto apartar para impuestos y qué pasa si alarga una estancia. Cada conclusión trae la regla aplicada (`rule_id`) y su fuente (`source_url`).

Funciona sola y **sin claves** (modo mock). Cualquier frontend se integra a través de HTTP siguiendo [API.md](API.md) y el contrato de [`contract/`](contract/).

## Requisitos
- Python 3.11 o superior
- `make` (opcional; los comandos equivalentes están en el `Makefile`)

## Arranque

```bash
make install     # crea .venv, instala dependencias y copia .env.example a .env
make dev         # http://localhost:8000  ·  Swagger en http://localhost:8000/docs
make test        # pytest
```

Sin `make`:

```bash
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/uvicorn app.main:app --reload --port 8000
```

Configuración en `.env` (ver [.env.example](.env.example)). Todo es opcional:

| Variable | Sin valor | Con valor |
|---|---|---|
| `ANTHROPIC_API_KEY` | `/api/trips/parse` usa un extractor local | Extracción con Claude (`ANTHROPIC_MODEL`, por defecto `claude-sonnet-5-5`) |
| `ELEVENLABS_API_KEY` + `ELEVENLABS_AGENT_ID` | `/api/voice/signed-url` devuelve 404 y el frontend usa la voz simulada | Devuelve la URL firmada del agente |
| `DEMO_TODAY` | Fecha real | Reloj de demo (por defecto `2026-08-18`) |
| `CORS_ORIGINS` | Puertos 5173 y 3000 de localhost | Lista separada por comas, o `*` |
| `PUBLIC_BASE_URL` | `http://localhost:8000` | URL pública para los enlaces a los PDF |

## Para el frontend
- **[API.md](API.md):** guía de integración (convenciones, endpoints, client tools del agente y de dónde sale cada dato en pantalla).
- **[`contract/openapi.json`](contract/openapi.json):** esquema completo. Puedes generar tipos TypeScript, por ejemplo con `npx openapi-typescript contract/openapi.json -o src/api-types.ts`.
- **[`contract/examples/`](contract/examples/):** respuestas reales para maquetar sin backend.
- **[`contract/client_tools.json`](contract/client_tools.json):** las 9 client tools del agente de voz y el endpoint de cada una.

Si cambias la API, ejecuta `make contract` y sube `contract/`. Los tests fallan si el contrato no coincide con el código.

## Estructura

```
app/
├── main.py, config.py        FastAPI, CORS y settings (.env)
├── clock.py                  reloj de demo inyectable (nadie usa date.today())
├── money.py                  céntimos enteros y tipos de cambio fijos de demo
├── models.py                 modelos Pydantic (contrato)
├── store.py, services.py     estado de la usuaria demo (JSON) y orquestación
├── engine/                   days · rules · residency · budget · tax · simulate (funciones puras)
├── banking/                  BankingProvider + MyInvestorMock (intereses diarios)
├── booking/parser.py         "pega tu reserva" (Claude o mock)
├── dossier/pdf.py            expediente PDF (reportlab)
├── voice/signed_url.py       signed URL de ElevenLabs
└── routers/                  tools, state, trips, invoices, clock, dossier
data/
├── rules/{ES,PT,MX,CO,TH}.json   reglas con source_url y verified_at
├── tax/                          tramos ES/PT y tipos efectivos de demo
├── treaties.json                 criterios de desempate (art. 4 OCDE)
├── demo_user_ana.json            persona de la demo
└── samples/                      emails de reserva de ejemplo
contract/                     openapi.json, client_tools.json, examples/
scripts/export_contract.py    regenera contract/
tests/                        escenas de Ana, reglas, dinero, latencia y contrato
```

## Datos de la demo (Ana, a 18/08/2026)
- **Estado actual:** España reclama la residencia porque Ana no tiene certificado de residencia fiscal en otro país y se suman sus ausencias (`ES_183_SPORADIC`). Lleva 140 días en Portugal y le quedan 43.
- **`simulate_stay(PT, 60)`:** 200 días; cruza el umbral el **01/10/2026** y tiene **doble residencia** con España.
- **`answer_question(has_habitual_home_in_PT, true)`:** Portugal reclama la residencia por vivienda habitual.

## Limitaciones
- **Todas las reglas tienen `verified_at: null`**, pendientes de verificar en la fuente oficial; los tests las listan. Por eso la confianza sale "baja".
- Los tramos de Portugal son un placeholder. Los de España (estatal + autonómica supletoria) están sin verificar. México, Colombia y Tailandia usan tipos efectivos de demo. Todo importe de impuesto es una estimación (`is_estimate`).
- El estado es de una sola usuaria demo, en memoria, y se guarda en `data/runtime/`.

## Aviso legal
Rumbo es un copiloto de planificación, no un asesor fiscal; sus resultados son estimaciones orientativas. No ayuda a fingir residencias, ocultar ingresos ni crear estructuras ficticias.
