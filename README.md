# Pedilo

POS multi-tenant/multi-sucursal para restaurantes. Next.js 15 (App Router) +
Supabase (Postgres, Auth, RLS, Realtime) + Dexie (offline-first) + un agente
de impresión ESC/POS separado por sucursal.

## Estructura

```
supabase/migrations/     Esquema SQL + políticas RLS (fuente de verdad de la BD)
scripts/                 seed-tenant.mjs (bootstrap) y gen-types.mjs (regenerar tipos)
src/
  middleware.ts          Refresca la sesión de Supabase en cada request
  lib/
    supabase/            Clientes browser / server / admin (service role)
    auth/session.ts      getSesion/requireAdmin/requireSucursal (rol + tenant + sucursal)
    types/                Tipos generados desde la BD + helpers
    offline/              Dexie (db.ts), outbox.ts (cola de escrituras), sync.ts (pull + realtime)
    pos/acciones.ts       Flujo de la orden (abrir, agregar ítem, enviar a cocina, cobrar)
    printing/              Interfaz enviarComanda() desacoplada de ESC/POS
    reportes/              Cierre diario (consulta, no tabla)
  app/
    login/                 Login
    admin/                 Panel del dueño (sucursales, menú, mesas, usuarios, formas de pago, reportes)
    pos/                   Vista de mesero/cajero (mapa de mesas + detalle de orden)
print-agent/              Servicio Node standalone que corre EN la sucursal e imprime ESC/POS
```

## Puesta en marcha

```bash
npm install
npm run dev
```

Las variables de `.env.local` ya apuntan al proyecto real de Supabase
("POS Market"). El esquema y las políticas de RLS (`supabase/migrations/`) ya
están aplicados ahí.

### 1. Crear el primer tenant + admin

Antes de que exista cualquier usuario, hay que sembrar el tenant, sus dos
sucursales y el primer admin (esto es lo único que se toca "a mano"; de ahí
en adelante todo se administra desde `/admin`):

```bash
TENANT_NOMBRE="Nombre del negocio" \
ADMIN_EMAIL="dueno@correo.com" ADMIN_NOMBRE="Nombre del dueño" ADMIN_PASSWORD="una-clave-temporal-segura" \
SUCURSAL_1="Fondita — barrio" SUCURSAL_2="Taquería San Pedro Sula" \
npm run seed
```

Con eso ya puedes entrar en `/login` con ese correo/contraseña. Desde
`/admin` el dueño da de alta cajeros/meseros, el menú, las mesas y las
formas de pago por sucursal — no hace falta tocar la base de nuevo.

### 2. El agente de impresión (por sucursal)

Ver [print-agent/README.md](print-agent/README.md). Corre en una PC/mini-PC
dentro de cada local, en la misma red que la impresora térmica. Su URL
pública (recomendado: un Cloudflare Tunnel) se registra en
`/admin/sucursales` → "URL del agente de impresión".

### 3. Regenerar los tipos de la base (si cambias el esquema)

```bash
SUPABASE_ACCESS_TOKEN=sbp_xxx SUPABASE_PROJECT_REF=xxxxxxxx npm run db:types
```

## Notas de arquitectura

- **RLS, no código de app, hace el aislamiento multi-tenant.** Toda tabla de
  negocio lleva `tenant_id`; las que cuelgan de una orden llevan además
  `sucursal_id` denormalizado (por trigger) para que las policies filtren por
  columna simple sin JOIN.
- **Offline-first real:** el mapa de mesas y el detalle de una orden se
  renderizan desde Dexie (IndexedDB), no desde la red. Cada escritura del
  mesero/cajero se guarda primero en Dexie y se encola en un outbox que la
  manda a Supabase (y al agente de impresión) en cuanto hay conexión — ver
  `src/lib/offline/`.
- **Impresión desacoplada:** el navegador nunca le habla a la impresora.
  `src/lib/printing/enviarComanda.ts` define la interfaz; hoy hace un POST al
  agente de la sucursal. Cambiar de protocolo/proveedor es tocar solo ese
  archivo (y `print-agent/index.js`, que es quien sabe de ESC/POS).
- **El cierre diario no es una tabla:** `src/lib/reportes/cierreDiario.ts`
  agrega los `pagos` del rango de fechas por sucursal.

## Seguridad — pendiente de tu parte

- El token de acceso de Supabase que compartiste en el chat quedó en el
  historial de esta conversación. Recomiendo **regenerarlo** en
  supabase.com/dashboard/account/tokens en cuanto puedas; no se guardó en
  ningún archivo del repo.
- Esta carpeta hoy NO tiene su propio repositorio git — el `git` de esta
  máquina está inicializado en `C:\Users\Milton Sandres` (todo tu perfil de
  Windows). Antes de hacer el primer commit de este proyecto, corre
  `git init` **dentro de esta carpeta** para que tenga su propio repo
  aislado; si compartes o subes el repo del home completo por error quedarían
  expuestos SSH keys, credenciales de otras apps, etc.
- `.env.local` ya tiene la anon key y la service_role key reales — está en
  `.gitignore`, pero verifícalo antes del primer commit.
