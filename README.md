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
    delivery/              Pedidos a domicilio: validaciones, recálculo, tablero del POS, liquidación, reportes
    location/              Interfaz de ubicación (GPS) desacoplada: hoy navegador, mañana Capacitor
    repartidor/            PWA del repartidor: sesión por PIN, cola offline, rastreo
  app/
    login/                 Login
    admin/                 Panel del dueño (sucursales, equipo de trabajo con roles admin/cajero/mesero/cocina, menú, inventario, mesas, formas de pago, fiscal, reportes)
    pos/                   Vista de mesero/cajero (mapa de mesas + detalle de orden + delivery)
    [slug]/                Menú público de delivery y seguimiento del pedido (sin sesión)
    repartidor/            PWA del repartidor (instalable)
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

## Delivery (pedidos a domicilio)

Módulo de pedidos a domicilio con tres caras: **menú público** para el cliente
(sin cuenta ni app), **gestión en el POS** (aceptar, facturar, despachar,
liquidar) y **PWA del repartidor** (PIN, cobro, GPS en vivo). Reutiliza el
módulo CAI para facturar: no hay otro flujo fiscal.

### Ponerlo en marcha

1. Aplicar en Supabase, en orden, `0022` a `0029` (SQL Editor). Necesitan las
   anteriores ya aplicadas (incluidas `0017`, `0018`, `0021`).
   `0029_realtime_flota.sql` solo crea sus políticas si existe
   `realtime.messages` (Supabase Realtime Authorization).
2. Variables de entorno nuevas (ver `.env.example`):
   - `SUPABASE_JWT_SECRET`: el **JWT Secret** del proyecto (Project Settings ›
     API). Con él se firma la sesión del repartidor (ver más abajo). Sin ella
     los repartidores no pueden entrar. Si tu proyecto ya usa *JWT Signing Keys*
     asimétricas, deja activo el secreto legado (HS256) o adapta `jwt.ts` a tu clave.
   - `CRON_SECRET`: secreto para el endpoint de retención del rastro.
3. En **Admin › Delivery**: elegir sucursal → código del restaurante (la
   dirección del menú), zonas con tarifa, horario, métodos de pago y
   repartidores con su PIN. Compartir los dos enlaces que muestra la pantalla
   (menú del cliente y enlace del repartidor).
4. Si el negocio factura, tener la caja vinculada y el CAI vigente
   (**Admin › Facturación fiscal**) y el agente de impresión de la sucursal al día.
5. Programar una vez al día la purga del rastro GPS:
   `curl -X POST https://TU-DOMINIO/api/delivery/purgar-rastro -H "Authorization: Bearer $CRON_SECRET"`
   (borra los puntos más viejos que la retención de cada sucursal, 90 días por
   omisión, y deja solo el punto de entrega).

### Qué hace cada cara

| Cara | Ruta | Quién |
|---|---|---|
| Menú + checkout | `/[slug]` | cliente, sin cuenta |
| Seguimiento | `/[slug]/pedido/[token]` (+ `/factura` en PDF) | cliente, solo con el token |
| Tablero del POS | `/pos/delivery` (+ `/flota`, `/liquidacion`) | cajero y mesero (despacho y liquidación: solo cajero) |
| Admin | `/admin/delivery` (+ `/reporte`) | administrador |
| App del repartidor | `/repartidor` (PWA instalable) | repartidor, código + PIN |

**Flujo del pedido:** `recibido → aceptado → en_cocina → listo → en_camino → entregado`
(más `rechazado` y `cancelado`). «Llegué» no es un estado: es `llegado_at` mientras
va en camino. Las transiciones las valida el servidor (trigger
`fn_delivery_antes_update`), no solo la pantalla.

- **Aceptar** manda la comanda a cocina con el flujo de siempre; **Rechazar** pide
  motivo y el cliente lo ve en su seguimiento.
- **Listo / Despachar** (cajero): emite la factura en el punto de emisión **de esa
  caja** (Consumidor Final o con RTN; el envío va como línea con ISV configurable,
  15 % por omisión, *pendiente de confirmar con el contador*), imprime factura y
  **comprobante de entrega** (no fiscal, no consume correlativo) y asigna
  repartidor (sugiere al que tenga menos pedidos activos). Respeta todos los
  bloqueos del módulo CAI: sin rango vigente no se despacha.
- **Cancelar tras facturar** emite la nota de crédito del módulo CAI; la factura
  nunca se borra.
- Lo cobrado entra a `pagos` **al entregar** (trigger), así el cierre diario lo ve.
  La **liquidación** compara el efectivo que el sistema dice que cobró el
  repartidor con lo que entrega en caja; queda registrada (usuario y hora) y se
  suma al cierre diario.

### Seguridad y privacidad

- El menú público **no confía en nada del navegador**: la función SQL
  `crear_pedido_delivery` recalcula precios, tarifa, horario, pausa y monto mínimo.
  Además, honeypot y rate limit por IP y por teléfono (`delivery_rate_limit_hit`).
- **Repartidores sin cuenta de Supabase Auth:** entran con código del restaurante +
  PIN (hash bcrypt en `repartidor_credenciales`, sin políticas de lectura; 5
  intentos fallidos bloquean 15 min). El servidor les firma un JWT propio de un
  turno (rol `authenticated` + claim `repartidor_id`) y la RLS hace que **solo vean
  y toquen sus pedidos asignados**, y solo puedan cambiar el estado y la entrega.
  El turno se cierra al liquidar.
- **Datos del cliente** (teléfono, dirección): solo el negocio y el repartidor
  asignado; cocina no tiene acceso a `ordenes_delivery`.
- **Token de seguimiento:** 256 bits aleatorios; token o slug incorrectos → 404.
- **Ubicación del repartidor:** solo se rastrea con un pedido `en_camino`; el
  cliente ve la posición únicamente mientras va en camino; la aceptación de
  compartir ubicación queda registrada (`aceptacion_ubicacion_at`).
- Comprobantes de transferencia: bucket **privado**, URL firmada de 2 min.

### GPS (primer plano)

`src/lib/location/` define la interfaz `ProveedorUbicacion`; hoy la implementa
`WebGeolocation` (navegador). Para segundo plano con Capacitor basta otra clase
que la implemente y devolverla en `crearProveedorUbicacion()`: el resto no cambia.

- Alta precisión **solo** mientras haya un pedido en camino; Wake Lock activo (con
  aviso si el teléfono no lo soporta) y banner «Compartiendo tu ubicación».
- Posición en vivo por **Realtime broadcast** (`pedido:<token>` público para el
  cliente, `flota:<sucursal>` privado para el restaurante): cada ~12 s o ~50 m,
  descartando precisión peor a 100 m. **No** se escribe en la base cada lectura.
- A `repartidor_rastro` va ~1 punto por minuto + salida / llegada / entrega,
  guardados primero en la base local y subidos al volver la señal.
- Llegada automática: 2 lecturas seguidas dentro del radio (100 m configurable).
- Se manejan permiso revocado, GPS apagado y app en segundo plano (al volver al
  frente se reanuda y se manda la última posición). Si el repartidor no da
  permiso, entrega igual y el restaurante lo ve marcado en el mapa de flota.

**Límite conocido:** una PWA no puede rastrear con la pantalla apagada; para eso
(fase 2) se usará el plugin de Capacitor tras la misma interfaz.

### Offline

La PWA guarda todo en IndexedDB propia (`repartidor_offline`) y un service worker
deja abrir la app sin señal (`public/sw.js`). Cada cambio de estado se aplica al
instante y se sube en orden con **la hora en que ocurrió**. Un rechazo definitivo
del servidor (ej. el restaurante canceló mientras tanto) se descarta sin atascar
la cola y se avisa si lo que hizo no quedó aplicado.

### Decisiones y límites conocidos

- `ordenes_delivery` es 1:1 con `ordenes` (`ordenes.mesa_id` ahora puede ser nulo
  y `ordenes.canal` distingue el origen). El PIN vive en una tabla aparte
  (`repartidor_credenciales`) en vez de una columna de `repartidores`.
- Los pedidos por teléfono necesitan conexión (los crea el servidor); el resto del
  POS sigue siendo offline-first.
- Sin modificadores de producto (no existen en Pedilo): cada ítem lleva una nota libre.
- Fuera de alcance (fase 2): zonas por polígono (el modelo ya tiene
  `poligono_geojson`), foto de entrega (`entrega_foto_url` previsto), WhatsApp
  automático, pagos en línea, GPS en segundo plano, ETA con motor de rutas.
- `src/lib/types/database.types.ts` se actualizó a mano con las tablas nuevas;
  corre `npm run db:types` para regenerarlo cuando apliques las migraciones.

### Pruebas

`tests/sql/delivery.test.ts` y `tests/sql/pedidoDelivery.test.ts` (estados, RLS,
tokens, rastro, liquidación, recálculo de precios, horario/pausa/mínimo),
`tests/delivery/*` (factura CAI desde delivery y bloqueos, comprobante sin
correlativo, throttling, geocerca, controlador de GPS, sincronización offline,
liquidación, reportes, rutas públicas).

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
