# Plan: descuento automático de filamento (Ender 3 V3 KE)

**Objetivo:** elegir un **filamento activo** y que cada impresión se descuente **sola**.
Sin modificar la impresora, sin root y sin depender de Creality Cloud.

```
Creality Print ──gcode──▶ Ender 3 V3 KE
                              │ WebSocket :9999 (red local, solo lectura)
                              ▼
                  Puente (PC de casa, Node.js)
                              │ HTTPS + token secreto
                              ▼
              Supabase ──▶ sitio Taller 3D (GitHub Pages)
```

**Referencias:** `[ ]` pendiente · `[x]` hecho · **Vos** = lo hacés vos · **Claude** = lo hago yo

---

## Fase 0: Diagnóstico (¿la KE responde como dicen los foros?)

- [x] **Claude:** script de diagnóstico de solo lectura (`puente/diagnostico.mjs`)
- [x] **Vos:** pasarme la IP de la impresora (`192.168.1.12`)
- [x] **Claude:** probar la conexión al puerto 9999 desde tu PC (OK: sin root ni contraseña)
- [x] **Claude:** confirmar el historial: `historyList` con `id`, `usagematerial` (mm), `printfinish` (1 = terminó, 0 = cancelada)
- [x] **Vos + Claude:** correr el diagnóstico durante una impresión corta (MiniPickleBuddy, 7m54s)
- [x] **Claude:** confirmar cómo cambia `state`: 1 = imprimiendo, 2 = terminada (y `deviceState` 1 → 0)
- [x] **Claude:** validar la conversión mm → gramos: **188,27 mm → 0,562 g, Creality Print decía 0,56 g** ✅

**✅ Fase 0 completa:** es viable sin modificar la impresora.

### Hallazgos de la Fase 0 (25/11/2026)
- Impresora: `Ender3V3KE-DC21`, modelo `F005`, firmware DWIN `V1.1.0.17`.
- Historial: últimas 50 impresiones. `id` = hora de inicio (Unix). Campos: `filename`, `usagetime` (s), `usagematerial` (mm), `printfinish`.
- Las cancelaciones registran solo el material realmente usado.
- `retGcodeFileInfo` trae los mm estimados por archivo, coinciden con lo real (976 vs 976,8 mm).
- Totales de la impresora: `totalUsageMaterial` 406.884 mm, `totalJob` 50.
- Ejemplo: 976,8 mm de PLA ≈ 2,91 g.
- `usedMaterialLength` (en vivo) también está en mm.
- **La impresora guarda solo las últimas 50 impresiones:** el puente tiene que correr al menos una vez cada 50 impresiones.
- La prueba del MiniPickleBuddy ya se descontó a mano: el puente arranca marcando todo el historial existente como "ya contado".

> Si algo de esta fase falla, frenamos y replanteamos antes de tocar el sitio.

## Fase 1: Base de datos (Supabase)

- [x] **Claude:** script `sql/04_impresiones.sql`:
  - [x] columnas `activo` (solo uno a la vez) y `densidad` (g/cm³, PLA = 1,24) en `filamentos`
  - [x] tabla `impresiones` (archivo, mm, gramos, filamento, fecha, origen, id del historial de la impresora sin duplicados, estado)
  - [x] función `puente_sincronizar(token, historial)` para el puente: descuenta del filamento activo y, en la 1ª vez, solo marca el historial existente
  - [x] funciones `activar_filamento` y `asignar_impresion` para el sitio; la manual `registrar_impresion` ahora también guarda historial
  - [x] tabla `puente_tokens` con el token guardado como hash, nunca en texto plano
  - [x] permisos: el sitio con login, el puente solo con su token
- [x] **Claude:** token del puente generado y guardado en `puente/config.json` (no se sube a GitHub)
- [x] **Vos:** correr el script en el SQL Editor
- [x] **Claude:** verificar desde acá que todo responda (token falso rechazado; tablas nuevas cerradas sin login)

**✅ Fase 1 completa.**

## Fase 2: Sitio web

- [x] **Claude:** botón **"Usar como activo"** en cada filamento, con insignia en el activo
- [x] **Claude:** campo **densidad** en el formulario de filamento
- [x] **Claude:** selector de filamento activo en el Dashboard
- [x] **Claude:** sección **Impresiones** (historial con filtros: todas / pendientes / automáticas / manuales)
- [x] **Claude:** "Agregar impresión" manual que también queda en el historial (con nombre de pieza opcional)
- [x] **Claude:** impresiones **pendientes de asignar**: botones "Asignar" e "Ignorar", y aviso en el Dashboard
- [x] **Claude:** sumar al Dashboard las impresiones del mes y los gramos consumidos
- [x] **Vos:** probar en el navegador
- [x] **Claude:** sacar "ver historial previo": el historial arranca desde ahora (las marcas previas quedan ocultas, solo evitan descontar dos veces)
- [x] **Claude:** subir a GitHub

**✅ Fase 2 completa.**

## Fase 3: Puente (programa en tu PC)

- [x] **Claude:** `puente/puente.mjs`: conexión, reconexión automática, detección de fin de impresión
- [x] **Claude:** sincronizar el historial al arrancar, para las impresiones hechas con la PC apagada
- [x] **Claude:** `puente/config.example.json` (IP + token), sin subir el real a GitHub
- [x] **Claude:** generar el token del puente
- [x] **Claude:** primera sincronización: 50 impresiones previas marcadas como vistas, nada descontado; la segunda corrida dio "Historial al día" (sin duplicados)
- [x] **Vos + Claude:** prueba real: Creeper_Head, 1.049,96 mm → **3,13 g descontados solos** (758,2 → 755,07 g; Creality Print estimaba 3,09 g)
- [x] **Claude:** bug encontrado en la prueba: la KE agrega la impresión al historial apenas EMPIEZA (0 mm). Corregido en el puente y en Supabase (`sql/05_fix_impresion_en_curso.sql`)
- [x] **Claude:** `iniciar-puente.vbs` / `detener-puente.vbs` (sin ventana, nunca dos puentes a la vez)
- [ ] **Vos:** acceso directo en la carpeta Inicio de Windows para que arranque solo

## Fase 4 (opcional): siempre encendido

- [ ] Mover el puente a un celular Android viejo (Termux) o a una Raspberry Pi
- [ ] Notificación cuando un filamento queda con poco stock

---

## Decisiones tomadas

- **Sin root ni Moonraker:** se usa el WebSocket que la KE ya trae (puerto 9999).
- **Sin servidor en la nube:** la impresora está en tu red local, y exponerla a internet sería inseguro (el puerto no tiene contraseña).
- **Sin duplicados ni pérdidas:** el puente usa el historial de la impresora, así que no hace falta que la PC esté prendida durante cada impresión.
- **Conversión:** `gramos = mm × 0,0024053 × densidad` (filamento de 1,75 mm). PLA ≈ 2,98 g por metro.
