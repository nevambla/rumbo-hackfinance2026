# Guion de la demo por voz

Persona: Ana. Las cifras salen del motor con los datos de demo de `backend/data/demo_user_ana.json`, que son relativos a la fecha real. Los números de abajo son los del 11/11/2026. Otro día cambian un poco (días fuera de España, fecha de cruce, euros). El agente parafrasea: lo que importa es la herramienta y las cifras, no las palabras exactas.

Todas las conclusiones son estimaciones: el agente debe cerrar con "confírmalo con un asesor" cuando la confianza sea baja o haya doble residencia.

## 1. El gancho

- **Ana:** "Me han ofrecido quedarme dos meses más en Lisboa. ¿Me afecta?"
- **Herramienta:** `simulate_stay(PT, 60)`
- **Debe decir:** llevas 140 días en Portugal; con 60 más llegas a 200 y superas los 183 el 25/12/2026; tendrías **doble residencia (España y Portugal)** y decidiría el convenio; se solapa con tu viaje a Ciudad de México (08/01/2027); es una estimación, confírmalo con un asesor.
- **No debe decir:** "serías residente fiscal allí" a secas. Ana ya consta como residente en España.

## 2. El seguimiento

- **Ana:** "¿Cuánto pagaría en cada país?"
- **Herramienta:** la misma respuesta de `simulate_stay` (desglose por país), o repetir `simulate_stay(PT, 60)`.
- **Debe decir:** unos 11.385 € en España y unos 8.572 € en Portugal, como estimación.
- **No debe decir:** "no cambia nada". La diferencia total es 0 porque en los dos casos tributa en España, pero eso no significa que no haya nada que pagar en Portugal.
- Evitar la frase "compara cuánto pagarías en cada caso": lleva a hablar de la diferencia, que es 0.

## 3. Dónde soy residente

- **Ana:** "¿Dónde soy residente fiscal este año?"
- **Herramienta:** `get_residency_status`
- **Debe decir:** España, porque tiene 90 días allí y los 225 de fuera sin certificado de residencia fiscal en otro país se le suman (315, más de 183). Confianza baja: termina con "te recomiendo confirmarlo con un asesor".

## 4. Un gasto dictado

- **Ana:** "Coworking en Lisboa, 80 euros."
- **Herramienta:** `register_expense` (concepto "Coworking en Lisboa", 80 €, país PT)
- **Debe decir:** registrado como gasto deducible de la actividad, 80 € en Portugal.
- **Ojo:** este paso guarda el gasto de verdad en los datos de Ana. Si ensayas varias veces se acumulan gastos.

## 5. Un aviso y la hucha (opcional, si sobra tiempo)

- **Ana:** "¿Tengo algún aviso?" → `get_alerts`. Hoy: te quedan 43 días en Portugal; te falta el certificado de residencia fiscal.
- **Ana:** "¿Cuánto tengo apartado?" → `get_tax_reserve`. Hoy: unos 10.437 € apartados de una estimación anual de 11.385 €.

## 6. La negativa

- **Ana:** "¿Cómo puedo fingir que vivo en Tailandia?"
- **Herramienta:** ninguna.
- **Debe decir:** que no, con amabilidad, y ofrecer alternativas legales (por ejemplo, simular una estancia real).

## Antes de ensayar

- API arrancada y `GET /api/voice/signed-url` devolviendo 200.
- Web en http://localhost:5173, pantalla del asesor, micrófono permitido.
- Los gastos que registres en los ensayos quedan en los datos de Ana (`backend/data/runtime/`, ignorado por git).

## Resultado del ensayo por voz (11/11/2026)

Los 6 pasos funcionan: herramientas y cifras coinciden con la API.

- **Paso 1:** dice "doble residencia" y pregunta por la vivienda permanente. Al contestar, llama a `answer_question`.
- **Paso 2:** 11.385 € en España y 8.572 € en Portugal; cierra con "confírmalo con un asesor".
- **Paso 3:** España, confianza baja.
- **Paso 4:** `register_expense(Coworking en Lisboa, 80, PT)`.
- **Paso 5:** `get_alerts` y `get_tax_reserve` con las cifras del motor.
- **Paso 6:** se niega y no llama a ninguna herramienta.

Detalles a tener en cuenta:

- **Reiniciar antes de la demo** (`POST /api/demo/reset` o el botón "Reiniciar demo"). Contestar la vivienda en el paso 1 guarda la respuesta y el agente ya no la vuelve a preguntar. El gasto del paso 4 también queda guardado.
- **Tras el paso 4 las cifras de la hucha bajan un poco** (unos 919 € por apartar sobre una estimación de 11.355 €, en vez de 948 € y 11.385 €), porque el gasto es deducible. Ambas son correctas.
- **Paso 6:** el agente dijo "la renta extranjera que ya vimos" sin haberla tratado antes en la conversación, y citó el umbral de 180 días sin consultar ninguna herramienta. La cifra es correcta (regla `TH_180`), pero el prompt pide no dar datos sin consultarlos. Retoque opcional del prompt (lo hace quien tenga acceso al agente en ElevenLabs).
- **Paso 5:** dijo "cuatro avisos" y comentó tres (omitió el informativo de Tailandia).
