# Configurar Supabase para Taller 3D

Guía paso a paso para conectar Taller 3D con Supabase. Lleva unos 10 minutos.

> **¿Ya tenías Productos y Filamentos funcionando?** Solo te falta el **login**: andá directo al
> [paso 6](#6-activar-el-login-obligatorio-antes-de-publicar).

### Scripts SQL (correrlos en orden)

| Script | Crea |
|---|---|
| `sql/01_productos.sql` | Tabla `productos` |
| `sql/02_filamentos.sql` | Tabla `filamentos` y función `registrar_impresion` (descuenta gramos) |
| `sql/03_login.sql` | Seguridad: solo tu usuario puede ver y modificar datos |

> La carpeta `sql/` no se sube a GitHub (está en `.gitignore`). Los scripts están solo en tu computadora.

---

## 1. Crear el proyecto

1. Entrá a <https://supabase.com> e iniciá sesión (podés usar tu cuenta de GitHub).
2. Hacé clic en **New project**.
3. Completá:
   - **Name:** `taller-3d`
   - **Database Password:** generá una y **guardala en un lugar seguro** (no la vas a necesitar para el sitio, pero sí si algún día querés conectarte a la base directamente).
   - **Region:** `South America (São Paulo)`, la más cercana a Argentina.
4. Hacé clic en **Create new project** y esperá 1 o 2 minutos a que termine de prepararse.

---

## 2. Crear la tabla con el script SQL

1. En el menú izquierdo del proyecto, abrí **SQL Editor**.
2. Hacé clic en **New query**.
3. Copiá **todo** el contenido del archivo [`sql/01_productos.sql`](sql/01_productos.sql) y pegalo en el editor.
4. Hacé clic en **Run** (o `Ctrl + Enter`).
5. Abajo tiene que aparecer **"Success. No rows returned"**.
6. Repetí los pasos 2 a 5 con [`sql/02_filamentos.sql`](sql/02_filamentos.sql).
7. Para confirmar: abrí **Table Editor** en el menú izquierdo. Tienen que aparecer las tablas **`productos`** y **`filamentos`**.

> Si Supabase te muestra un aviso de "operación potencialmente destructiva" es por los `drop policy if exists`. Es seguro: solo borra las políticas de permisos de esta tabla para volver a crearlas. Confirmá con **Run this query**.

### Qué guarda la tabla

| Columna | Qué es |
|---|---|
| `nombre` | Nombre del producto (obligatorio, hasta 120 caracteres) |
| `descripcion` | Descripción (opcional, hasta 1000 caracteres) |
| `precio_cobrar` | Total a cobrar |
| `precio_ml` | Precio MercadoLibre |
| `costo_total` | Costo total sin insumos (referencia) |
| `multiplicador` | Multiplicador usado |
| `detalle` | Todos los datos que cargaste en la calculadora, para poder recalcular a futuro |
| `created_at` | Fecha en que se guardó |

---

## 3. Copiar la URL y la clave pública

1. Hacé clic en el botón **Connect**, arriba en el panel del proyecto, o andá a **Project Settings → API Keys**.
2. Copiá estos dos datos:
   - **Project URL**: tiene la forma `https://abcdefghijklm.supabase.co`
   - **Publishable key**: empieza con `sb_publishable_...`. Si tu proyecto muestra claves "legacy", usá la **`anon` `public`**, que empieza con `eyJ...`.

> **No copies nunca la `secret` key ni la `service_role` key.** Esas dan acceso total a la base sin restricciones y no deben estar en el código de una página web.

---

## 4. Qué tenés que pasarme

Pasame estos **2 datos**:

```
Project URL:     https://xxxxxxxx.supabase.co
Publishable key: sb_publishable_xxxxxxxxxxxx   (o la anon key eyJ...)
```

Si preferís cargarlos vos, abrí [`js/supabase.config.js`](js/supabase.config.js) y pegalos entre las comillas:

```js
export const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_xxxxxxxxxxxx';
```

---

## 5. Probar que funciona

1. Abrí el sitio con **Live Server**.
2. En **Calculadora 3D**, cargá una pieza y hacé clic en **Guardar como producto**.
3. Poné un nombre y una descripción y hacé clic en **Guardar**.
4. Andá a **Productos** en el menú: tiene que aparecer.
5. En Supabase, en **Table Editor → productos**, también vas a ver la fila.

### Si algo falla

| Mensaje | Causa probable |
|---|---|
| "Supabase no está configurado" | Faltan la URL o la clave en `js/supabase.config.js` |
| "Falta crear la tabla" / "Falta crear la función" | No se corrió algún script SQL (paso 2) |
| "Sin permisos" / "row-level security" | El email de `sql/03_login.sql` no coincide con el de tu usuario, o el script se corrió a medias |
| "Email o contraseña incorrectos" | Revisá los datos o cambiá la contraseña en Authentication → Users |
| "Invalid API key" | La clave está mal copiada o es la secret en vez de la publishable |
| "No se pudo conectar" | No hay internet o el proyecto está pausado (Supabase pausa los proyectos gratis tras 7 días sin uso; se reactiva desde el panel) |

---

## 6. Activar el login (obligatorio antes de publicar)

Sin este paso, cualquiera que abra el sitio publicado puede ver, editar y borrar tus datos.

### 6.1 Crear tu usuario
1. En el panel de Supabase, andá a **Authentication → Users**.
2. Hacé clic en **Add user → Create new user**.
3. Poné tu **email** y una **contraseña** fuerte.
4. Dejá tildado **Auto Confirm User**, para no tener que confirmar por mail.
5. Hacé clic en **Create user**.

### 6.2 Desactivar el registro de usuarios nuevos
1. Andá a **Authentication → Sign In / Providers**. En algunos paneles está en **Authentication → Settings**.
2. Desactivá **Allow new users to sign up**.
3. Hacé clic en **Save**.

### 6.3 Correr el script de seguridad
1. Abrí `sql/03_login.sql` en VS Code.
2. Buscá `TU_EMAIL@ejemplo.com` y **reemplazalo por el email del usuario que creaste en 6.1**.
3. En **SQL Editor → New query**, pegá el script completo y hacé clic en **Run**.

> Si te olvidás de cambiar el email, no se rompe nada, pero nadie va a poder ver los datos. Corregilo y volvé a correr el script.

### 6.4 Probar
1. Abrí el sitio: tiene que aparecer la pantalla **Iniciar sesión**.
2. Entrá con tu email y contraseña. Tienen que aparecer tus productos y filamentos.
3. El botón **Cerrar sesión** está abajo de todo en el menú lateral.

### Olvidé la contraseña
En **Authentication → Users**, buscá tu usuario, abrí el menú **⋯** y cambiá la contraseña desde ahí.
