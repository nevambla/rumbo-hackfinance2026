# Rumbo · estado y siguientes pasos

Rama de trabajo: **`integracion`**. Entrega: **11/11/2026 a las 23:59**. Demo: **12/11/2026**.

## Qué hay en cada rama

| | `lucas/motor-fiscal` | `feature/initial-backend` | **`integracion`** |
|---|---|---|---|
| Agente en ElevenLabs | Solo `elevenlabs/agent.md` con un prompt y 7 tools para crearlo a mano | Solo la definición de 9 tools en `client_tools.json` | **Creado y configurado** (español, Claude Sonnet 5, privado) |
| Tools en el agente | Descritas, sin dar de alta | Definidas, sin dar de alta | **Las 9 dadas de alta en el panel** |
| Conexión con ElevenLabs | Código que la usaría si hubiera claves | Endpoint de URL firmada sin probar | **Probada**: `GET /api/voice/signed-url` devuelve 200 |
| Motor fiscal | Más simple, en JavaScript | El bueno, en Python (FastAPI) | El de `feature/initial-backend`, con datos de demo relativos a hoy |
| Web | Completa (React + Vite) | No tiene | **Pendiente**: hay que traerla de `lucas/motor-fiscal` |

En resumen: la rama de Lucas aporta la web y el código del navegador que habla con el agente; la del backend, el motor; `integracion` junta ese motor con el agente ya creado y probado.

## Hecho

- **Base:** el backend Python de `feature/initial-backend`. Es el mejor motor de reglas y ya tenía los endpoints para el agente.
- **Datos de Ana relativos a la fecha real** (`backend/data/demo_user_ana.json`). La demo cuenta la misma historia cualquier día del 19/08 al 17/11: 90 días en España, Medellín desde abril y 140 días en Portugal. Con 60 días más en Lisboa cruza los 183 en 44 días y pasa a doble residencia con España. `DEMO_TODAY` solo sirve para fijar un día.
- **Tests:** 52 en verde (`make test`).
- **Agente de ElevenLabs «Rumbo»** (`agent_9101m73rbyzqff5t396qjhm7g16k`), en la cuenta de Sofía, con el prompt, las 9 client tools y la autenticación activada. La guía y las tools listas para pegar están en [`backend/elevenlabs/`](backend/elevenlabs/agent.md).

## Pendiente, por orden

1. **Web:** traer `web/` de `lucas/motor-fiscal` a `integracion` y conectarla a la API de Python (puerto 8000). Los formatos de respuesta son distintos: `claims[]` en vez de `country`, importes en `*_cents` y `GET /api/state` para todo el panel.
2. **Asesor por voz, antes que el resto:** en `Advisor.jsx`, iniciar la sesión con `GET /api/voice/signed-url` y registrar las 9 tools con los **mismos nombres** que en [`backend/contract/client_tools.json`](backend/contract/client_tools.json). Cada tool llama a su endpoint y devuelve el JSON al agente.
3. **Pantallas:** días y residencia, avisos, hucha y simulador. Todos los datos salen de `GET /api/state`.
4. **Landing:** recuperar la de `main`. La de esta rama es la versión antigua.
5. **Ensayar el guion completo por voz** y ajustarlo a lo que diga el motor.

Integración del frontend: [`backend/API.md`](backend/API.md). Respuestas de ejemplo: [`backend/contract/examples/`](backend/contract/examples/).

## Arrancar

Requisito: Python 3.11 o superior.

```bash
git fetch && git switch integracion
cd backend && make install && make test && make dev
```

La API queda en http://localhost:8000 y Swagger en http://localhost:8000/docs.

**Claves:** no están en el repo. Cada uno crea `backend/.env` a partir de `.env.example` y rellena `ELEVENLABS_API_KEY` y `ELEVENLABS_AGENT_ID`. Pedidle la clave a Sofía por un canal privado. Para trabajar en la web no hace falta: sin claves, `/api/voice/signed-url` devuelve 404 y el resto de la API funciona igual.
