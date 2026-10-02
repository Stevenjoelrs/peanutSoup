# Deudas técnicas y fallas no implementadas

Registro vivo de lo que quedó fuera del sprint al corte del 2-oct-2026. No es una lista de deseos: son cosas que el código o la verificación siguen señalando como incompletas. Cuando algo se resuelva, se quita y se deja el PR de referencia.

---

## 1. Falta / inasistencia — sin endpoint ni vista de estudiante

- **Estado**: `fichas_reservadas` admite `ASISTIO`, pero la "falta" por no presentarse **no existe como operación**: nadie la registra salvo la clínica, a mano, en la BD.
- **Por qué es deuda**: el estudiante recibe la falta sin poder verla en el portal; la ficha queda `ASISTIO`/`CANCELADA_USUARIO` en la tabla pero la UI (`/reserva`, `/mis-fichas`) no distingue una inasistencia de un estado normal. No hay columna ni estado `FALTA`, ni `motivoInasistencia`.
- **Qué falta (decisión de producto)**: si la clínica marca la falta, el backend debería poder leerla y el frontend mostrarla en el historial ("No asistió — falta registrada"). Hasta que eso exista, la regla solo vive del lado del personal.

## 2. F7 — cancelación: la regla de 2h implementada, la parte "no asiste" no

- **Estado**: `POST /api/fichas/:id/cancelar` está hecho y probado (~2h antes de la cita).
- **Deuda residual**: la segunda parte de la regla — *"si no asiste se le pone falta directamente"* — no tiene ninguna representación en código. El estudiante nunca ve esa marca (ver punto 1).

## 3. Eliminado el redirect stale de `armazon.js`, pero no verificado en navegador

- **Estado**: `armazon.js` refresca el perfil con `/api/auth/me` antes de vigilar la cobertura (PR #92).
- **Deuda de verificación**: se validó por build, por orden de ejecución invisible al DOM y por `curl`. **No hay prueba de navegador**: no hay Playwright ni Puppeteer en el stack, y el único assert real es el build + el bundle emitido. Un redirect espurio podría seguir vivo sin que el CI lo atrape.

## 4. F15 — los tests de navegador / e2e siguen sin existir

- **Estado**: hay `integracion-reserva.mjs`, `integracion-reserva-stress.mjs`, `integracion-laboratorio-seguridad.mjs`, `integracion-fechas-calendario` — todos contra la **API/base de datos**, ninguno contra el **DOM**.
- **Deuda**: no existe ninguna prueba de navegador que monte la app y haga un click real (p.ej. cancelar una ficha y ver que el botón pasa a `CANCELADA_USUARIO`, o que el redirect de cobertura respeta cobertura vencida). Sin dependencia de e2e instalada.

## 5. Migración 004 del compañero: práctica aplicada pero no commiteada

- **Estado**: `db/migrations/004_evitar_afiliaciones_solapadas.sql` (EXCLUDE USING gist) **no está en git** — vive en la working tree de `feature/evitar-afiliaciones-activas-solapadas`.
- **Deuda**: en Supabase la restricción **ya existe**, pero el repo no la declara. En una base que se replante desde las migraciones, ese constraint no existiría → drift repo/BD. Mientras 004 viva en una rama ajena, cualquier corrida de `pnpm migrate` en una rama que incluya migraciones aplicadas puede mezclar trabajo no integrado. Además, `pnpm migrate` en una rama como la actual (sin 004 commiteada) **tampoco lo aplicaría** — o lo aplicaría, pero sin commitearlo.

## 6. `.env` vs `.env.example`: el pooler en modo sesión muerde dos veces

- **Estado**: `.env` apunta a Supavisor modo sesión (`pooler.supabase.com:5432`, tope 15 conexiones por proyecto). El `.env.example` documenta el host directo `db.[project-ref].supabase.co:5432`, que no tiene ese tope.
- **Deuda**: por eso `PG_POOL_MAX=20` en `.env` reventaba con `EMAXCONNSESSION` y hubo que partir el presupuesto a mano en los 4 archivos de prueba (PR #89 y PR #92). Mientras `.env` siga en el pooler, cualquier archivo de prueba nuevo vuelve a fallar si no declara su tope. La solución estructural es mover `.env` al host directo que ya documenta el ejemplo.

## 7. Comentario stale en `db.js`

- **Ubicación**: `backend/src/shared/config/db.js:100`.
- Dice que *"Migrar el módulo de reservas a `conTransaccion` es el follow-up pendiente"*. El módulo de reservas **ya usa** `conTransaccion` (`reserva.service.js`, `reserva.repository.js`). El comentario quedó desfasado: Falso positivo si alguien lee ese TODO y piensa que falta algo. Hay que borrar el comentario o reescribirlo (lo que falta no es el follow-up, es quitar `getClient` del menú del día a día).

## 8. SVG <4 KB se inlinean, PNG/asset sí van a `dist`: documentado pero invisible

- **Ubicación**: comportamiento de Vite (`assetsInlineLimit` por defecto 4096 bytes).
- **Deuda de conocimiento**: `dist/renovacion/` (y `dist/auth/login/` por la misma regla) quedan **sin archivos de assets** porque todos los SVG son <4 KB. No es un bug, pero lo parece. Ya está escrito en el cuerpo del PR #90, y nadie lo va a encontrar salvo que lea el PR. Conviene un `docs/frontend.md` o una nota en `docs/ARQUITECTURA.md`.

## 9. Stashes huérfanos del frente viejo

- `stash@{1}: On views/maquetado-final: wip: assets nuevos renovacion (globals, img, maqueta)`
- `stash@{2}: On views/maquetado-final: wip: vendoriza assets renovacion para build docker`
- **Deuda**: eran intentos de portar `views/renovacion` antes de saber que el repo ya no guardaba `views/`. Nunca se aplicaron y ya no son necesarios — el contenido se incorporó de otra forma en PR #90. Conviene `git stash drop` para que no confundan a nadie. *(Los dejé para no descartar trabajo sin confirmar.)*

---

## Resumen de lo que **sí** quedó resuelto

| Ítem | Dónde ver |
|---|---|
| Redirect stale de `armazon.js` con `sesion.usuario` | PR #92 |
| Tests de estres con 4 fallos encadenados (fixtures, pool, cleanup) | PR #89 |
| Maquetas `views/` mezcladas con app | PR #89 |
| `INACTIVA` y especialista-sin-cobertura sin probar | PR #92 |
| Presupuesto de conexiones de los 4 tests explotando | PR #92 |
| `/renovacion` servía el placeholder en vez del módulo | PR #90 |
| `cerrarSesion` redirigía a `/` en vez de `/login` (verificado en develop) | PR #88 documentado |
| Click real de cancelar ficha → endpoint `/api/fichas/:id/cancelar` | PR #93 |
