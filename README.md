# Pedilo

POS multi-tenant/multi-sucursal para restaurantes. Next.js 15 (App Router) +
Supabase (Postgres, Auth, RLS, Realtime) + Dexie (offline-first) + un agente
de impresión ESC/POS separado por sucursal.

## Estructura

```
supabase/migrations/     Esquema SQL + políticas RLS (fuente de verdad de la BD)
scripts/                 seed-tenant.mjs (bootstrap) y gen-types.mjs (regenerar tipos)
tests/                   vitest: fiscal/ (lógica), sql/ (migraciones + RLS), ui/ (componentes)
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
    fiscal/                Facturación con CAI: emisión offline, rangos, ISV, libro de ventas
  app/
    login/                 Login
    admin/                 Panel del dueño (sucursales, menú, inventario, mesas, usuarios, formas de pago, reportes)
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

## Facturación fiscal (CAI / SAR Honduras)

Emisión de facturas con CAI conforme al Reglamento del Régimen de Facturación
(Acuerdo 481-2017), modalidad "autoimpresor por sistema computarizado". Cada
negocio tramita su CAI ante el SAR; Pedilo solo carga y respeta esos rangos.
Está **apagada por defecto** por negocio (`tenants.facturacion_fiscal_activa`).

### Ponerla en marcha (una vez)

1. Aplicar en Supabase, en orden, `0017_datos_fiscales.sql`,
   `0018_cai_documentos_fiscales.sql` y `0020_ajustes_onboarding.sql` (SQL Editor).
   Necesitan las migraciones anteriores ya aplicadas.
2. **Actualizar el agente de impresión de cada sucursal** (`print-agent/index.js`,
   ver su README): el endpoint nuevo `/imprimir` es el que imprime factura,
   nota de crédito y pre-cuenta con logo.
3. **Negocio nuevo:** al registrarse, un asistente (`/configuracion-inicial`) pide los datos
   de cada sucursal, el logo y si factura con CAI (datos fiscales + rango por sucursal). Si
   no factura, queda todo listo y se activa después desde `/admin/fiscal`. Negocio ya
   existente: `/admin/fiscal` > **Emisor** → **Rangos CAI** → **Estado** > *Activar*
   (no deja activar si falta algo).
4. **La caja de cobro es automática:** cada sucursal recibe una (punto de emisión 001;
   establecimiento 000, 001, 002… por sucursal) y el cajero la vincula solo la primera
   vez que abre el POS. Si cambias de equipo, **Estado › Caja de cobro › Liberar**.
5. En **Menú digital**, marcar 18 % en bebidas alcohólicas y tabaco (el resto es
   15 %; hay opción *Exento*). Los precios del menú **incluyen** ISV.

### Cómo funciona

- **El correlativo lo asigna el dispositivo**, dentro de una transacción Dexie
  atómica, al cobrar (`src/lib/fiscal/emision.ts`); nunca al sincronizar. Sin
  rango vigente (agotado, vencido o ausente) el cobro se bloquea con un mensaje
  claro: no hay modo permisivo. El cobro + la factura son todo o nada.
- **El servidor valida** cada documento al sincronizar (rango, fecha límite,
  duplicado, total = base + ISV) en la RPC `sincronizar_documento_fiscal`. Si lo
  rechaza queda un **incidente** (Admin > Estado) y el documento se marca
  *conflicto* en el POS; nunca se descarta en silencio y no frena la cola.
- **Reuso imposible**: al vincular o reinstalar, la caja arranca en
  `max(local, servidor) + 1`; el navegador pide almacenamiento persistente.
- `documentos_fiscales` es inmutable (sin DELETE; solo `emitida → anulada` por la
  RPC `anular_documento_fiscal`, únicamente admin). Cada documento guarda un
  *snapshot* del emisor y del rango.
- La **pre-cuenta** y la comanda no son documentos fiscales ni consumen número.
  Reimprimir sale marcado *REIMPRESIÓN* y no consume número.
- Lógica en `src/lib/fiscal/` (ISV en centavos enteros, total en letras, rangos,
  emisión, notas, libro) y formato de 80 mm / 48 columnas en
  `src/lib/printing/documentoTexto.ts`.

### Límites conocidos

- Notas de crédito **totales** (una por factura); no hay notas parciales ni de
  débito desde la UI (el modelo ya las soporta). La factura debe estar en la caja
  (se guardan los últimos 7 días).
- La propina / cargo por servicio está soportada en el cálculo (fuera de la base
  gravable) pero el POS todavía no tiene dónde capturarla. Pendiente de confirmar
  con el contador.
- Los descuentos son ediciones de precio unitario; la factura sale con el precio
  final. El cálculo ya prorratea un descuento explícito si se agrega.
- Con la caja sin conexión desde su primer arranque tras actualizar, aún no
  conoce la configuración fiscal: se sincroniza sola al primer contacto con el servidor.
- La fecha del dispositivo decide la fecha de emisión; el servidor valida contra la
  fecha límite del rango pero no detecta un reloj atrasado a propósito.

### Pruebas

```bash
npm test          # vitest: ISV, letras, rangos, emisión, sync, impresión, SQL y UI
```

Las pruebas SQL aplican las migraciones reales sobre Postgres en memoria (PGlite)
y prueban triggers, RPCs y la RLS entre negocios; las de sincronización corren la
cola offline contra esa misma base.

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
