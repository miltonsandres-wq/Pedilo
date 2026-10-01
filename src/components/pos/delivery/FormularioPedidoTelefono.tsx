"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Minus, Plus, Search, X } from "lucide-react";
import { db, CLAVE_DELIVERY_CONFIG, type DeliveryConfigLocal } from "@/lib/offline/db";
import { Button } from "@/components/ui/Button";
import { Field, SelectField } from "@/components/ui/Field";
import { cn, inputClass, labelClass } from "@/lib/ui";
import { crearPedidoTelefono } from "@/lib/delivery/pos";
import { cambiarCantidad, subtotal as calcularSubtotal, type Carrito } from "@/lib/delivery/carrito";
import {
  ETIQUETA_METODO, formatearLempiras, validarCheckout, type DatosCheckout, type ErroresCheckout, type MetodoPago,
} from "@/lib/delivery/validaciones";

const VACIO: DatosCheckout = {
  nombre: "", telefono: "", zonaId: "", direccionReferencia: "", metodoPago: "efectivo", pagaCon: "",
  conRtn: false, facturaNombre: "", facturaRtn: "",
};

/**
 * Pedido tomado por teléfono o WhatsApp (canal delivery_telefono). Mismos campos
 * y mismas reglas que el checkout público: el servidor recalcula precios y
 * tarifa y exige referencia de dirección, teléfono de 8 dígitos y RTN válido.
 * Necesita conexión (lo crea el servidor); el menú sale de la caché del POS.
 */
export function FormularioPedidoTelefono({
  sucursalId, onCerrar, onCreado,
}: {
  sucursalId: string;
  onCerrar: () => void;
  onCreado: (numero: number) => void;
}) {
  const [datos, setDatos] = useState<DatosCheckout>(VACIO);
  const [carrito, setCarrito] = useState<Carrito>({});
  const [busqueda, setBusqueda] = useState("");
  const [errores, setErrores] = useState<ErroresCheckout>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const productos = useLiveQuery(
    () => db.productos.where("sucursal_id").equals(sucursalId).filter((p) => p.disponible).toArray(), [sucursalId], []
  );
  const zonas = useLiveQuery(() => db.delivery_zonas.where("sucursal_id").equals(sucursalId).filter((z) => z.activa).toArray(), [sucursalId], []);
  const config = useLiveQuery(async () => (await db.config.get(CLAVE_DELIVERY_CONFIG))?.valor as DeliveryConfigLocal | undefined, []);
  const metodos = ((config?.metodos_pago as MetodoPago[] | undefined) ?? ["efectivo"]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return productos.filter((p) => !q || p.nombre.toLowerCase().includes(q)).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [productos, busqueda]);

  const sub = calcularSubtotal(carrito, productos);
  const envio = zonas.find((z) => z.id === datos.zonaId)?.tarifa ?? 0;
  const total = sub + Number(envio);
  const set = <K extends keyof DatosCheckout>(k: K, v: DatosCheckout[K]) => setDatos((d) => ({ ...d, [k]: v }));
  const err = (k: keyof DatosCheckout) => errores[k] && <p className="mt-1 text-xs text-red-600">{errores[k]}</p>;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const errs = validarCheckout(datos, total, metodos);
    setErrores(errs);
    if (Object.keys(errs).length > 0) return;
    if (Object.keys(carrito).length === 0) return setError("Agrega al menos un producto.");
    setEnviando(true);
    try {
      const r = await crearPedidoTelefono(sucursalId, {
        nombre: datos.nombre.trim(), telefono: datos.telefono, zonaId: datos.zonaId,
        direccionReferencia: datos.direccionReferencia.trim(), metodoPago: datos.metodoPago as MetodoPago,
        pagaCon: datos.pagaCon.trim() ? Number(datos.pagaCon.replace(",", ".")) : null,
        conRtn: datos.conRtn, facturaNombre: datos.facturaNombre.trim(), facturaRtn: datos.facturaRtn,
        items: Object.entries(carrito).map(([productoId, l]) => ({ productoId, cantidad: l.cantidad, nota: l.nota || undefined })),
      });
      onCreado(r.numero);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el pedido.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink-950/40 sm:items-center sm:p-4">
      <form onSubmit={enviar} noValidate className="flex max-h-[94vh] w-full max-w-4xl flex-col rounded-t-2xl bg-white shadow-popover sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <h2 className="text-base font-semibold text-ink-900">Pedido por teléfono / WhatsApp</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-lg p-1 text-ink-400 hover:bg-ink-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid flex-1 gap-5 overflow-y-auto p-5 md:grid-cols-2">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Field label="Nombre" name="nombre" value={datos.nombre} onChange={(e) => set("nombre", e.target.value)} />{err("nombre")}</div>
              <div><Field label="Teléfono (8 dígitos)" name="telefono" value={datos.telefono} inputMode="tel" onChange={(e) => set("telefono", e.target.value)} />{err("telefono")}</div>
            </div>
            <div>
              <SelectField label="Zona" name="zona" value={datos.zonaId} onChange={(e) => set("zonaId", e.target.value)}>
                <option value="">Elige la zona…</option>
                {zonas.map((z) => <option key={z.id} value={z.id}>{z.nombre} — {formatearLempiras(Number(z.tarifa))}</option>)}
              </SelectField>
              {err("zonaId")}
            </div>
            <div>
              <label htmlFor="ref-tel" className={labelClass}>Referencia de la dirección</label>
              <textarea id="ref-tel" rows={2} value={datos.direccionReferencia} onChange={(e) => set("direccionReferencia", e.target.value)}
                className={inputClass} placeholder="Portón negro, frente a la pulpería…" />
              {err("direccionReferencia")}
            </div>
            <div>
              <p className={labelClass}>Pago</p>
              <div className="flex flex-wrap gap-2">
                {metodos.map((m) => (
                  <label key={m} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm", datos.metodoPago === m ? "border-brand-500 bg-brand-50" : "border-ink-200")}>
                    <input type="radio" name="metodo" checked={datos.metodoPago === m} onChange={() => set("metodoPago", m)} /> {ETIQUETA_METODO[m]}
                  </label>
                ))}
              </div>
              {datos.metodoPago === "efectivo" && (
                <div className="mt-2"><Field label="Paga con (opcional)" name="pagaCon" value={datos.pagaCon} inputMode="decimal" onChange={(e) => set("pagaCon", e.target.value)} />{err("pagaCon")}</div>
              )}
            </div>
            <div className="rounded-xl border border-ink-200 p-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-800">
                <input type="checkbox" checked={datos.conRtn} onChange={(e) => set("conRtn", e.target.checked)} /> Factura con RTN
              </label>
              {datos.conRtn && (
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <div><Field label="Nombre / razón social" name="fnombre" value={datos.facturaNombre} onChange={(e) => set("facturaNombre", e.target.value)} />{err("facturaNombre")}</div>
                  <div><Field label="RTN (14 dígitos)" name="frtn" value={datos.facturaRtn} inputMode="numeric" onChange={(e) => set("facturaRtn", e.target.value)} />{err("facturaRtn")}</div>
                </div>
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-col">
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-400" />
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar producto…" className={cn(inputClass, "pl-9")} />
            </div>
            <div className="max-h-72 flex-1 divide-y divide-ink-100 overflow-y-auto rounded-xl border border-ink-100">
              {filtrados.length === 0 && <p className="p-4 text-center text-xs text-ink-400">Sin productos</p>}
              {filtrados.map((p) => {
                const cant = carrito[p.id]?.cantidad ?? 0;
                return (
                  <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <div className="min-w-0"><p className="truncate font-medium text-ink-800">{p.nombre}</p><p className="text-xs tabular-nums text-ink-500">{formatearLempiras(p.precio)}</p></div>
                    <div className="flex items-center gap-1.5">
                      {cant > 0 && (<><button type="button" aria-label="Quitar uno" onClick={() => setCarrito((c) => cambiarCantidad(c, p.id, -1))} className="flex h-7 w-7 items-center justify-center rounded-full border border-ink-200"><Minus className="h-3.5 w-3.5" /></button><span className="w-5 text-center tabular-nums">{cant}</span></>)}
                      <button type="button" aria-label="Agregar uno" onClick={() => setCarrito((c) => cambiarCantidad(c, p.id, 1))} className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-white"><Plus className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 space-y-1 rounded-xl bg-ink-50 p-3 text-sm">
              <div className="flex justify-between text-ink-600"><span>Subtotal</span><span className="tabular-nums">{formatearLempiras(sub)}</span></div>
              <div className="flex justify-between text-ink-600"><span>Envío</span><span className="tabular-nums">{formatearLempiras(Number(envio))}</span></div>
              <div className="flex justify-between border-t border-ink-200 pt-1 text-base font-semibold text-ink-900"><span>Total</span><span className="tabular-nums">{formatearLempiras(total)}</span></div>
              {config && Number(config.monto_minimo) > 0 && <p className="text-xs text-ink-400">Pedido mínimo {formatearLempiras(Number(config.monto_minimo))}</p>}
            </div>
          </div>
        </div>

        {error && <p role="alert" className="mx-5 mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex gap-2 border-t border-ink-100 p-4">
          <Button type="button" variant="secondary" onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" className="flex-1" size="lg" disabled={enviando}>{enviando ? "Registrando…" : `Registrar pedido · ${formatearLempiras(total)}`}</Button>
        </div>
      </form>
    </div>
  );
}
