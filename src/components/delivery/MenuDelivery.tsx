"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock, LocateFixed, MapPin, Minus, Plus, Share2, ShoppingCart, Store, X } from "lucide-react";
import { crearPedidoDelivery, subirComprobante } from "@/app/[slug]/actions";
import { Button } from "@/components/ui/Button";
import { Field, SelectField } from "@/components/ui/Field";
import { cn, inputClass, labelClass } from "@/lib/ui";
import type { MenuDelivery } from "@/lib/delivery/menuPublico";
import {
  cambiarCantidad, cambiarNota, claveCarrito, limpiarCarrito, subtotal, totalUnidades, type Carrito,
} from "@/lib/delivery/carrito";
import {
  ETIQUETA_METODO, formatearLempiras, validarCheckout, type DatosCheckout, type ErroresCheckout, type MetodoPago,
} from "@/lib/delivery/validaciones";
import type { Punto } from "./MapaPin";

// Leaflet toca `window`: solo en el navegador
const MapaPin = dynamic(() => import("./MapaPin").then((m) => m.MapaPin), {
  ssr: false,
  loading: () => <div className="h-[220px] animate-pulse rounded-xl bg-ink-100" />,
});

const DATOS_VACIOS: DatosCheckout = {
  nombre: "", telefono: "", zonaId: "", direccionReferencia: "", metodoPago: "", pagaCon: "",
  conRtn: false, facturaNombre: "", facturaRtn: "",
};

const CLAVE_DATOS = (slug: string) => `pedilo:cliente:${slug}`;

function leerLocal<T>(clave: string): T | null {
  try {
    const crudo = window.localStorage.getItem(clave);
    return crudo ? (JSON.parse(crudo) as T) : null;
  } catch {
    return null; // modo privado o almacenamiento bloqueado
  }
}
function guardarLocal(clave: string, valor: unknown) {
  try {
    window.localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* sin almacenamiento: el carrito funciona igual, solo no persiste */
  }
}

interface PedidoConfirmado {
  numero: number;
  trackingToken: string;
  total: number;
}

export function MenuDeliveryCliente({ menu }: { menu: MenuDelivery }) {
  const [carrito, setCarrito] = useState<Carrito>({});
  const [cargado, setCargado] = useState(false);
  const [paso, setPaso] = useState<"cerrado" | "carrito" | "checkout">("cerrado");
  const [confirmado, setConfirmado] = useState<PedidoConfirmado | null>(null);

  // Carrito persistente: se restaura al abrir y se guarda en cada cambio
  useEffect(() => {
    const ids = new Set(menu.productos.map((p) => p.id));
    setCarrito(limpiarCarrito(leerLocal(claveCarrito(menu.slug)), ids));
    setCargado(true);
  }, [menu.slug, menu.productos]);
  useEffect(() => {
    if (cargado) guardarLocal(claveCarrito(menu.slug), carrito);
  }, [carrito, cargado, menu.slug]);

  const unidades = totalUnidades(carrito);
  const sub = subtotal(carrito, menu.productos);
  const sinCategoria = menu.productos.filter((p) => !p.categoria_id);
  const platosDelDia = menu.productos.filter((p) => p.plato_dia);

  return (
    <div>
      {!menu.abierto && (
        <div className="mb-5 flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Por ahora no se pueden hacer pedidos</p>
            <p className="mt-0.5 text-amber-800">{menu.motivoCierre} Puedes ver el menú mientras tanto.</p>
          </div>
        </div>
      )}

      {platosDelDia.length > 0 && (
        <Seccion titulo="⭐ Platos del día" items={platosDelDia} carrito={carrito} activo={menu.abierto}
          onCambiar={(id, d) => setCarrito((c) => cambiarCantidad(c, id, d))} />
      )}
      {menu.categorias.map((cat) => {
        const items = menu.productos.filter((p) => p.categoria_id === cat.id);
        return items.length ? (
          <Seccion key={cat.id} titulo={cat.nombre} items={items} carrito={carrito} activo={menu.abierto}
            onCambiar={(id, d) => setCarrito((c) => cambiarCantidad(c, id, d))} />
        ) : null;
      })}
      {sinCategoria.length > 0 && (
        <Seccion titulo="Más" items={sinCategoria} carrito={carrito} activo={menu.abierto}
          onCambiar={(id, d) => setCarrito((c) => cambiarCantidad(c, id, d))} />
      )}
      {menu.productos.length === 0 && (
        <p className="py-10 text-center text-sm text-ink-400">El menú todavía no tiene platillos disponibles.</p>
      )}
      <p className="mt-2 text-center text-xs text-ink-400">Los precios incluyen ISV.</p>

      {menu.abierto && unidades > 0 && paso === "cerrado" && !confirmado && (
        <button
          onClick={() => setPaso("carrito")}
          className="fixed inset-x-4 bottom-4 z-10 mx-auto flex max-w-md items-center justify-between rounded-2xl bg-ink-950 px-5 py-3.5 text-sm font-medium text-white shadow-popover"
        >
          <span className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            Ver mi pedido · {unidades}
          </span>
          <span className="tabular-nums">{formatearLempiras(sub)}</span>
        </button>
      )}

      {paso !== "cerrado" && (
        <Hoja onCerrar={() => setPaso("cerrado")} titulo={paso === "carrito" ? "Tu pedido" : "Datos de entrega"}>
          {paso === "carrito" ? (
            <ResumenCarrito
              menu={menu} carrito={carrito}
              onCambiar={(id, d) => setCarrito((c) => cambiarCantidad(c, id, d))}
              onNota={(id, n) => setCarrito((c) => cambiarNota(c, id, n))}
              onSeguir={() => setPaso("checkout")}
            />
          ) : (
            <Checkout
              menu={menu} carrito={carrito} subtotal={sub}
              onVolver={() => setPaso("carrito")}
              onConfirmado={(p) => {
                setCarrito({});
                setConfirmado(p);
                setPaso("cerrado");
              }}
            />
          )}
        </Hoja>
      )}

      {confirmado && <PedidoListo slug={menu.slug} nombre={menu.nombre} pedido={confirmado} onCerrar={() => setConfirmado(null)} />}
    </div>
  );
}

function Hoja({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-ink-950/50 sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-popover sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <h2 className="text-base font-semibold text-ink-900">{titulo}</h2>
          <button onClick={onCerrar} aria-label="Cerrar" className="rounded-lg p-1 text-ink-400 hover:bg-ink-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function Seccion({
  titulo, items, carrito, activo, onCambiar,
}: {
  titulo: string;
  items: MenuDelivery["productos"];
  carrito: Carrito;
  activo: boolean;
  onCambiar: (id: string, delta: number) => void;
}) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">{titulo}</h2>
      <div className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-card">
        {items.map((p) => {
          const cantidad = carrito[p.id]?.cantidad ?? 0;
          return (
            <div key={p.id} className="flex items-center gap-3 p-3">
              {p.foto_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.foto_url} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
              ) : (
                <div className="h-16 w-16 shrink-0 rounded-lg bg-ink-50" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink-900">{p.nombre}</p>
                {p.descripcion && <p className="line-clamp-2 text-xs text-ink-500">{p.descripcion}</p>}
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-ink-800">{formatearLempiras(p.precio)}</p>
              </div>
              {!activo ? null : cantidad === 0 ? (
                <Button size="sm" type="button" onClick={() => onCambiar(p.id, 1)}>
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Agregar
                </Button>
              ) : (
                <Cantidad cantidad={cantidad} onCambiar={(d) => onCambiar(p.id, d)} />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Cantidad({ cantidad, onCambiar }: { cantidad: number; onCambiar: (d: number) => void }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-brand-50 px-2 py-1">
      <button type="button" aria-label="Quitar uno" onClick={() => onCambiar(-1)}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-brand-700 shadow-sm">
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-5 text-center text-sm font-medium tabular-nums text-brand-800">{cantidad}</span>
      <button type="button" aria-label="Agregar uno" onClick={() => onCambiar(1)}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-brand-700 shadow-sm">
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ResumenCarrito({
  menu, carrito, onCambiar, onNota, onSeguir,
}: {
  menu: MenuDelivery;
  carrito: Carrito;
  onCambiar: (id: string, d: number) => void;
  onNota: (id: string, nota: string) => void;
  onSeguir: () => void;
}) {
  const sub = subtotal(carrito, menu.productos);
  const falta = menu.montoMinimo - sub;
  return (
    <>
      <div className="divide-y divide-ink-100">
        {Object.entries(carrito).map(([id, l]) => {
          const p = menu.productos.find((x) => x.id === id);
          if (!p) return null;
          return (
            <div key={id} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-900">{p.nombre}</p>
                  <p className="text-xs tabular-nums text-ink-500">{formatearLempiras(p.precio * l.cantidad)}</p>
                </div>
                <Cantidad cantidad={l.cantidad} onCambiar={(d) => onCambiar(id, d)} />
              </div>
              <input value={l.nota} onChange={(e) => onNota(id, e.target.value)} maxLength={200}
                placeholder="Nota (sin cebolla, bien cocido…)" className={cn(inputClass, "mt-2 py-1.5 text-xs")} />
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-4 text-sm">
        <span className="text-ink-500">Subtotal</span>
        <span className="font-semibold tabular-nums">{formatearLempiras(sub)}</span>
      </div>
      <p className="mt-1 text-xs text-ink-400">El envío se calcula según tu zona en el siguiente paso.</p>
      {falta > 0 && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          El pedido mínimo es {formatearLempiras(menu.montoMinimo)}. Te faltan {formatearLempiras(falta)}.
        </p>
      )}
      <Button size="lg" type="button" className="mt-4 w-full" disabled={falta > 0 || sub === 0} onClick={onSeguir}>
        Continuar
      </Button>
    </>
  );
}

function Checkout({
  menu, carrito, subtotal: sub, onVolver, onConfirmado,
}: {
  menu: MenuDelivery;
  carrito: Carrito;
  subtotal: number;
  onVolver: () => void;
  onConfirmado: (p: PedidoConfirmado) => void;
}) {
  const [datos, setDatos] = useState<DatosCheckout>(() => ({
    ...DATOS_VACIOS,
    ...(typeof window !== "undefined" ? leerLocal<Partial<DatosCheckout>>(CLAVE_DATOS(menu.slug)) : null),
    metodoPago: menu.metodosPago.length === 1 ? menu.metodosPago[0] : "",
    conRtn: false, facturaNombre: "", facturaRtn: "", pagaCon: "",
  }));
  const [honeypot, setHoneypot] = useState("");
  const [pin, setPin] = useState<Punto | null>(null);
  const [mostrarMapa, setMostrarMapa] = useState(false);
  const [ubicando, setUbicando] = useState(false);
  const [errores, setErrores] = useState<ErroresCheckout>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [comprobante, setComprobante] = useState<{ ruta: string; nombre: string } | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);

  const zona = menu.zonas.find((z) => z.id === datos.zonaId);
  const envio = zona?.tarifa ?? 0;
  const total = sub + envio;
  const set = <K extends keyof DatosCheckout>(k: K, v: DatosCheckout[K]) => setDatos((d) => ({ ...d, [k]: v }));

  function usarMiUbicacion() {
    if (!navigator.geolocation) return setErrorGeneral("Tu navegador no permite obtener la ubicación. Marca el punto en el mapa.");
    setUbicando(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setMostrarMapa(true);
        setUbicando(false);
      },
      () => {
        setUbicando(false);
        setMostrarMapa(true);
        setErrorGeneral("No pudimos obtener tu ubicación. Puedes marcar el punto tocando el mapa.");
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }

  async function elegirArchivo(f: File | undefined) {
    if (!f) return;
    setSubiendo(true);
    setErrorGeneral(null);
    const fd = new FormData();
    fd.set("archivo", f);
    const r = await subirComprobante(menu.slug, fd);
    setSubiendo(false);
    if (r.ok) setComprobante({ ruta: r.ruta, nombre: f.name });
    else setErrorGeneral(r.error);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErrorGeneral(null);
    const errs = validarCheckout(datos, total, menu.metodosPago);
    setErrores(errs);
    if (Object.keys(errs).length > 0) return;

    setEnviando(true);
    const r = await crearPedidoDelivery(menu.slug, {
      nombre: datos.nombre.trim(),
      telefono: datos.telefono,
      zonaId: datos.zonaId,
      direccionReferencia: datos.direccionReferencia.trim(),
      lat: pin?.lat ?? null,
      lng: pin?.lng ?? null,
      metodoPago: datos.metodoPago as MetodoPago,
      pagaCon: datos.metodoPago === "efectivo" && datos.pagaCon.trim() ? Number(datos.pagaCon.replace(",", ".")) : null,
      conRtn: datos.conRtn,
      facturaNombre: datos.facturaNombre.trim(),
      facturaRtn: datos.facturaRtn,
      comprobanteUrl: comprobante?.ruta ?? null,
      items: Object.entries(carrito).map(([productoId, l]) => ({ productoId, cantidad: l.cantidad, nota: l.nota || undefined })),
      sitioWeb: honeypot,
    });
    setEnviando(false);
    if (!r.ok) return setErrorGeneral(r.error);
    // Se recuerdan nombre, teléfono y zona para el próximo pedido (no el pago ni la factura)
    guardarLocal(CLAVE_DATOS(menu.slug), {
      nombre: datos.nombre, telefono: datos.telefono, zonaId: datos.zonaId, direccionReferencia: datos.direccionReferencia,
    });
    onConfirmado({ numero: r.numero, trackingToken: r.trackingToken, total: r.total });
  }

  const err = (k: keyof DatosCheckout) => errores[k] && <p className="mt-1 text-xs text-red-600">{errores[k]}</p>;

  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      {/* Honeypot: invisible para personas; los bots lo llenan */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Sitio web<input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} /></label>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Field label="Tu nombre" name="nombre" value={datos.nombre} autoComplete="name"
            onChange={(e) => set("nombre", e.target.value)} />
          {err("nombre")}
        </div>
        <div>
          <Field label="Teléfono (8 dígitos)" name="telefono" value={datos.telefono} inputMode="tel" autoComplete="tel"
            placeholder="9988-7766" onChange={(e) => set("telefono", e.target.value)} />
          {err("telefono")}
        </div>
      </div>

      <div>
        <SelectField label="Zona de entrega" name="zona" value={datos.zonaId} onChange={(e) => set("zonaId", e.target.value)}>
          <option value="">Elige tu zona…</option>
          {menu.zonas.map((z) => (
            <option key={z.id} value={z.id}>{z.nombre} — envío {formatearLempiras(z.tarifa)}</option>
          ))}
        </SelectField>
        {err("zonaId")}
      </div>

      <div>
        <label htmlFor="ref" className={labelClass}>Referencia de tu dirección</label>
        <textarea id="ref" value={datos.direccionReferencia} onChange={(e) => set("direccionReferencia", e.target.value)}
          maxLength={300} rows={2} className={inputClass}
          placeholder="Portón negro, frente a la pulpería, casa #14…" />
        {err("direccionReferencia")}
      </div>

      <div className="rounded-xl border border-ink-200 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-medium text-ink-800">
            <MapPin className="h-4 w-4 text-brand-600" /> Pin en el mapa <span className="text-xs font-normal text-ink-400">(opcional)</span>
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={usarMiUbicacion} disabled={ubicando}>
              <LocateFixed className="h-3.5 w-3.5" /> {ubicando ? "Buscando…" : "Usar mi ubicación"}
            </Button>
            {!mostrarMapa && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setMostrarMapa(true)}>Marcar en el mapa</Button>
            )}
          </div>
        </div>
        {mostrarMapa && (
          <div className="mt-3">
            <MapaPin valor={pin} onCambiar={setPin} />
            <p className="mt-1.5 text-xs text-ink-400">
              {pin ? "Toca otro punto para moverlo." : "Toca el mapa para marcar dónde te entregamos."}
            </p>
          </div>
        )}
      </div>

      <div>
        <p className={labelClass}>¿Cómo vas a pagar?</p>
        <div className="grid gap-2">
          {menu.metodosPago.map((m) => (
            <label key={m} className={cn("flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm",
              datos.metodoPago === m ? "border-brand-500 bg-brand-50" : "border-ink-200")}>
              <input type="radio" name="metodo" checked={datos.metodoPago === m} onChange={() => set("metodoPago", m)} />
              {ETIQUETA_METODO[m]}
            </label>
          ))}
        </div>
        {err("metodoPago")}

        {datos.metodoPago === "efectivo" && (
          <div className="mt-3">
            <Field label="¿Con cuánto pagas? (para llevarte el cambio)" name="pagaCon" value={datos.pagaCon} inputMode="decimal"
              placeholder={`Ej. ${Math.ceil(total / 100) * 100 || 500}`} onChange={(e) => set("pagaCon", e.target.value)} />
            {err("pagaCon")}
          </div>
        )}
        {datos.metodoPago === "transferencia" && (
          <div className="mt-3 space-y-2 rounded-xl bg-ink-50 p-3 text-sm">
            <p className="font-medium text-ink-800">Transfiere {formatearLempiras(total)} a:</p>
            <p className="whitespace-pre-line text-ink-600">{menu.cuentaTransferencia ?? "Pregunta los datos de la cuenta al restaurante."}</p>
            <input ref={archivo} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden"
              onChange={(e) => void elegirArchivo(e.target.files?.[0])} />
            <Button type="button" size="sm" variant="secondary" disabled={subiendo} onClick={() => archivo.current?.click()}>
              {subiendo ? "Subiendo…" : comprobante ? "Cambiar comprobante" : "Subir comprobante"}
            </Button>
            {comprobante && <p className="text-xs text-libre-text">✓ {comprobante.nombre}</p>}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-ink-200 p-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-800">
          <input type="checkbox" checked={datos.conRtn} onChange={(e) => set("conRtn", e.target.checked)} />
          Necesito factura con RTN
        </label>
        {datos.conRtn ? (
          <div className="mt-3 grid gap-3">
            <div>
              <Field label="Nombre o razón social" name="facturaNombre" value={datos.facturaNombre}
                onChange={(e) => set("facturaNombre", e.target.value)} />
              {err("facturaNombre")}
            </div>
            <div>
              <Field label="RTN (14 dígitos)" name="facturaRtn" value={datos.facturaRtn} inputMode="numeric" maxLength={17}
                onChange={(e) => set("facturaRtn", e.target.value)} />
              {err("facturaRtn")}
            </div>
          </div>
        ) : (
          <p className="mt-1 text-xs text-ink-400">Si no, tu factura sale como Consumidor Final.</p>
        )}
      </div>

      <div className="space-y-1 rounded-xl bg-ink-50 p-3 text-sm">
        <Linea etiqueta="Subtotal" valor={formatearLempiras(sub)} />
        <Linea etiqueta={zona ? `Envío (${zona.nombre})` : "Envío"} valor={zona ? formatearLempiras(envio) : "elige tu zona"} />
        <div className="border-t border-ink-200 pt-1">
          <Linea etiqueta="Total a pagar" valor={formatearLempiras(total)} fuerte />
        </div>
      </div>

      {errorGeneral && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorGeneral}</p>}

      <div className="flex gap-2">
        <Button type="button" variant="secondary" size="lg" onClick={onVolver}>Volver</Button>
        <Button type="submit" size="lg" className="flex-1" disabled={enviando || subiendo}>
          {enviando ? "Enviando pedido…" : `Hacer pedido · ${formatearLempiras(total)}`}
        </Button>
      </div>
    </form>
  );
}

function Linea({ etiqueta, valor, fuerte }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <div className={cn("flex justify-between", fuerte ? "text-base font-semibold text-ink-900" : "text-ink-600")}>
      <span>{etiqueta}</span>
      <span className="tabular-nums">{valor}</span>
    </div>
  );
}

function PedidoListo({ slug, nombre, pedido, onCerrar }: { slug: string; nombre: string; pedido: PedidoConfirmado; onCerrar: () => void }) {
  const enlace = `${typeof window !== "undefined" ? window.location.origin : ""}/${slug}/pedido/${pedido.trackingToken}`;
  const mensaje = `Hice mi pedido #${pedido.numero} en ${nombre}. Sigue su estado aquí: ${enlace}`;
  return (
    <Hoja titulo="¡Pedido recibido!" onCerrar={onCerrar}>
      <div className="flex flex-col items-center gap-2 py-2 text-center">
        <CheckCircle2 className="h-12 w-12 text-libre-dot" strokeWidth={1.75} />
        <p className="text-sm text-ink-500">Tu número de pedido es</p>
        <p className="text-4xl font-bold tabular-nums text-ink-900">#{pedido.numero}</p>
        <p className="text-sm text-ink-500">Total a pagar: <b className="text-ink-800">{formatearLempiras(pedido.total)}</b></p>
        <p className="mt-2 text-xs text-ink-400">Guarda el enlace de seguimiento: sin él no podrás ver el estado de tu pedido.</p>
      </div>
      <div className="mt-4 grid gap-2">
        <a href={`/${slug}/pedido/${pedido.trackingToken}`}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 py-3 text-base font-medium text-white hover:bg-brand-700">
          <Store className="h-4 w-4" /> Seguir mi pedido
        </a>
        <a href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-ink-200 px-5 py-3 text-base font-medium text-ink-700 hover:bg-ink-50">
          <Share2 className="h-4 w-4" /> Compartir por WhatsApp
        </a>
      </div>
    </Hoja>
  );
}
