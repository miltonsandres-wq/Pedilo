"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { Bike, Clock, FileText, MapPin, Phone, PhoneCall, Printer, Receipt, Volume2, VolumeX, X } from "lucide-react";
import { db, CLAVE_DELIVERY_CONFIG, type DeliveryConfigLocal, type DeliveryPedidoLocal, type OrdenLocal } from "@/lib/offline/db";
import { Button } from "@/components/ui/Button";
import { cn, inputClass, labelClass } from "@/lib/ui";
import {
  aceptarPedido, cancelarPedido, despacharPedido, imprimirComprobanteEntrega, pausarDelivery, rechazarPedido,
  sugerirRepartidor, pedidosActivosDe, totalACobrar,
} from "@/lib/delivery/pos";
import { calcularCambio, ETIQUETA_METODO, formatearLempiras, type MetodoPago } from "@/lib/delivery/validaciones";
import { imprimirDocumentoFiscal } from "@/lib/fiscal/impresion";
import { desbloquearAudio, fijarSonido, sonidoActivado } from "@/lib/delivery/sonido";
import { urlComprobanteTransferencia } from "@/app/pos/delivery/actions";
import { FormularioPedidoTelefono } from "./FormularioPedidoTelefono";

type Dialogo =
  | { tipo: "rechazar" | "cancelar"; pedido: DeliveryPedidoLocal }
  | { tipo: "despachar"; pedido: DeliveryPedidoLocal }
  | null;

const COLUMNAS: { clave: string; titulo: string; estados: string[]; vacio: string }[] = [
  { clave: "nuevos", titulo: "Nuevos", estados: ["recibido"], vacio: "Sin pedidos nuevos" },
  { clave: "cocina", titulo: "En cocina", estados: ["aceptado", "en_cocina"], vacio: "Nada en preparación" },
  { clave: "listos", titulo: "Listos para salir", estados: ["listo"], vacio: "Nada esperando repartidor" },
  { clave: "camino", titulo: "En camino", estados: ["en_camino"], vacio: "Ningún pedido en la calle" },
];

function useAhora(ms = 20_000) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return ahora;
}

const minutosDesde = (iso: string | null, ahora: number) => (iso ? Math.max(0, Math.floor((ahora - new Date(iso).getTime()) / 60_000)) : 0);

export function TableroDelivery({ sucursalId, usuarioId, puedeDespachar }: { sucursalId: string; usuarioId: string; puedeDespachar: boolean }) {
  const ahora = useAhora();
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [telefono, setTelefono] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [sonido, setSonido] = useState(true);
  useEffect(() => setSonido(sonidoActivado()), []);

  const pedidos = useLiveQuery(() => db.delivery_pedidos.where("sucursal_id").equals(sucursalId).toArray(), [sucursalId], [] as DeliveryPedidoLocal[]);
  const repartidores = useLiveQuery(() => db.repartidores.where("sucursal_id").equals(sucursalId).toArray(), [sucursalId], []);
  const config = useLiveQuery(async () => (await db.config.get(CLAVE_DELIVERY_CONFIG))?.valor as DeliveryConfigLocal | undefined, []);
  const ordenes = useLiveQuery(async () => {
    const map = new Map<string, OrdenLocal>();
    for (const o of await db.ordenes.bulkGet(pedidos.map((p) => p.orden_id))) if (o) map.set(o.id, o);
    return map;
  }, [pedidos], new Map<string, OrdenLocal>());

  const activos = useMemo(
    () => pedidos.filter((p) => ["recibido", "aceptado", "en_cocina", "listo", "en_camino"].includes(p.estado_delivery))
      .sort((a, b) => a.recibido_at.localeCompare(b.recibido_at)),
    [pedidos]
  );
  const cerradosHoy = useMemo(
    () => pedidos.filter((p) => ["entregado", "cancelado", "rechazado"].includes(p.estado_delivery))
      .sort((a, b) => b.recibido_at.localeCompare(a.recibido_at)).slice(0, 12),
    [pedidos]
  );

  async function ejecutar(accion: () => Promise<unknown>, exito: string) {
    setAviso(null);
    try {
      await accion();
      setAviso({ tipo: "ok", texto: exito });
    } catch (e) {
      setAviso({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo completar la acción." });
    }
  }

  const abierto = !!config?.activo && !config?.pausado;

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-ink-900">Pedidos a domicilio</h1>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-ink-500">
            <span className={cn("inline-block h-2 w-2 rounded-full", abierto ? "bg-libre-dot" : "bg-ocupada-dot")} />
            {!config ? "Sin configurar" : !config.activo ? "Delivery desactivado (se activa en Admin)" : config.pausado ? "Pausado — no entran pedidos web" : "Recibiendo pedidos web"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => { desbloquearAudio(); fijarSonido(!sonido); setSonido(!sonido); }}
            title={sonido ? "Silenciar alerta" : "Activar alerta sonora"}>
            {sonido ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />} {sonido ? "Sonido" : "Silencio"}
          </Button>
          {config?.activo && (
            <Button type="button" size="sm" variant={config.pausado ? "primary" : "secondary"}
              onClick={() => void ejecutar(() => pausarDelivery(sucursalId, !config.pausado), config.pausado ? "Delivery reanudado" : "Delivery pausado")}>
              {config.pausado ? "Reanudar pedidos" : "Pausar pedidos"}
            </Button>
          )}
          {puedeDespachar && (
            <Link href="/pos/delivery/liquidacion" className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50">
              <Receipt className="h-3.5 w-3.5" /> Liquidación
            </Link>
          )}
          <Link href="/pos/delivery/flota" className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50">
            <MapPin className="h-3.5 w-3.5" /> Mapa de flota
          </Link>
          <Button type="button" size="sm" onClick={() => setTelefono(true)}>
            <PhoneCall className="h-3.5 w-3.5" /> Pedido por teléfono
          </Button>
        </div>
      </div>

      {aviso && (
        <div role={aviso.tipo === "error" ? "alert" : "status"} className={cn("mb-4 flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm",
          aviso.tipo === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-libre-border bg-libre-bg text-libre-text")}>
          <span>{aviso.texto}</span>
          <button onClick={() => setAviso(null)} aria-label="Cerrar aviso"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNAS.map((col) => {
          const lista = activos.filter((p) => col.estados.includes(p.estado_delivery));
          return (
            <section key={col.clave} className="rounded-2xl bg-ink-100/60 p-3">
              <h2 className="mb-3 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-ink-500">
                {col.titulo}
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] tabular-nums text-ink-600">{lista.length}</span>
              </h2>
              <div className="space-y-3">
                {lista.length === 0 && <p className="py-6 text-center text-xs text-ink-400">{col.vacio}</p>}
                {lista.map((p) => (
                  <TarjetaPedido key={p.orden_id} pedido={p} orden={ordenes.get(p.orden_id)} ahora={ahora}
                    repartidores={repartidores} puedeDespachar={puedeDespachar}
                    onAceptar={() => void ejecutar(() => aceptarPedido(p.orden_id), `Pedido aceptado y enviado a cocina`)}
                    onDialogo={(tipo) => setDialogo({ tipo, pedido: p })}
                    onReimprimir={(que) => void ejecutar(async () => {
                      const r = que === "comprobante" ? await imprimirComprobanteEntrega(p.orden_id) : await reimprimirFactura(p.orden_id);
                      if (!r.ok) throw new Error(r.error ?? "No se pudo imprimir.");
                    }, "Enviado a la impresora")}
                    onError={(t) => setAviso({ tipo: "error", texto: t })} />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {cerradosHoy.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Terminados recientes</h2>
          <div className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-100 bg-white text-sm shadow-card">
            {cerradosHoy.map((p) => (
              <div key={p.orden_id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="font-medium text-ink-800">#{ordenes.get(p.orden_id)?.numero_dia ?? "—"} · {p.cliente_nombre}</span>
                <span className="text-xs text-ink-500">{p.zona_nombre}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  p.estado_delivery === "entregado" ? "bg-libre-bg text-libre-text" : "bg-red-100 text-red-700")}>
                  {p.estado_delivery === "entregado" ? "Entregado" : p.estado_delivery === "rechazado" ? "Rechazado" : "Cancelado"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {dialogo && (dialogo.tipo === "rechazar" || dialogo.tipo === "cancelar") && (
        <DialogoMotivo
          titulo={dialogo.tipo === "rechazar" ? "Rechazar pedido" : "Cancelar pedido"}
          ayuda={dialogo.tipo === "rechazar" ? "El cliente verá este motivo en su seguimiento." : "Si ya tiene factura se emite la nota de crédito; la factura nunca se borra."}
          onCerrar={() => setDialogo(null)}
          onConfirmar={async (motivo) => {
            const id = dialogo.pedido.orden_id;
            setDialogo(null);
            await ejecutar(
              () => (dialogo.tipo === "rechazar" ? rechazarPedido(id, motivo) : cancelarPedido({ ordenId: id, motivo, usuarioId })),
              dialogo.tipo === "rechazar" ? "Pedido rechazado" : "Pedido cancelado"
            );
          }}
        />
      )}

      {dialogo?.tipo === "despachar" && (
        <DialogoDespacho
          pedido={dialogo.pedido} repartidores={repartidores} pedidos={pedidos}
          onCerrar={() => setDialogo(null)}
          onConfirmar={async (repartidorId) => {
            const id = dialogo.pedido.orden_id;
            setDialogo(null);
            setAviso(null);
            try {
              const r = await despacharPedido({ ordenId: id, repartidorId, usuarioId });
              const fallos = [r.impresion.factura, r.impresion.comprobante].filter((x) => x && !x.ok);
              setAviso(fallos.length
                ? { tipo: "error", texto: `Pedido despachado, pero no se pudo imprimir: ${fallos[0]?.error ?? "revisa la impresora"}. Usa "Reimprimir".` }
                : { tipo: "ok", texto: "Pedido listo: factura y comprobante enviados a imprimir." });
            } catch (e) {
              setAviso({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo despachar." });
            }
          }}
        />
      )}

      {telefono && (
        <FormularioPedidoTelefono sucursalId={sucursalId} onCerrar={() => setTelefono(false)}
          onCreado={(numero) => { setTelefono(false); setAviso({ tipo: "ok", texto: `Pedido #${numero} registrado. Acéptalo para mandarlo a cocina.` }); }} />
      )}
    </div>
  );
}

async function reimprimirFactura(ordenId: string) {
  const doc = (await db.documentos_fiscales.where("orden_id").equals(ordenId).toArray()).find((d) => d.clase === "factura" && d.estado === "emitida");
  if (!doc) return { ok: false, error: "Este pedido no tiene factura en esta caja." };
  return imprimirDocumentoFiscal(doc.id);
}

function TarjetaPedido({
  pedido, orden, ahora, repartidores, puedeDespachar, onAceptar, onDialogo, onReimprimir, onError,
}: {
  pedido: DeliveryPedidoLocal;
  orden: OrdenLocal | undefined;
  ahora: number;
  repartidores: { id: string; nombre: string }[];
  puedeDespachar: boolean;
  onAceptar: () => void;
  onDialogo: (t: "rechazar" | "cancelar" | "despachar") => void;
  onReimprimir: (que: "factura" | "comprobante") => void;
  onError: (t: string) => void;
}) {
  const items = useLiveQuery(() => db.orden_items.where("orden_id").equals(pedido.orden_id).toArray(), [pedido.orden_id], []);
  const [ocupado, setOcupado] = useState(false);
  const min = minutosDesde(pedido.recibido_at, ahora);
  const nuevo = pedido.estado_delivery === "recibido";
  const urgencia = nuevo ? (min >= 5 ? "critico" : min >= 2 ? "atencion" : "fresco") : min >= 60 ? "critico" : min >= 40 ? "atencion" : "fresco";
  const subtotal = Number(orden?.total ?? items.reduce((a, i) => a + i.cantidad * i.precio_unitario, 0));
  const total = totalACobrar(subtotal, Number(pedido.tarifa_envio));
  const repartidor = repartidores.find((r) => r.id === pedido.repartidor_id);
  const cambio = calcularCambio(total, pedido.paga_con);
  const conFactura = pedido.tipo_factura === "con_rtn";

  async function verComprobante() {
    setOcupado(true);
    const r = await urlComprobanteTransferencia(pedido.orden_id);
    setOcupado(false);
    if (r.ok) window.open(r.url, "_blank", "noopener,noreferrer");
    else onError(r.error);
  }

  return (
    <article className={cn("rounded-2xl border-2 bg-white p-3.5 shadow-card",
      urgencia === "critico" ? "border-red-400" : urgencia === "atencion" ? "border-amber-400" : "border-transparent")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-base font-bold text-ink-900">
            #{orden?.numero_dia ?? "—"}
            <span className="rounded-md bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-700">Delivery</span>
            <span className="rounded-md bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-600">{orden?.canal === "delivery_telefono" ? "Teléfono" : "Web"}</span>
          </p>
          <p className="text-sm font-medium text-ink-800">{pedido.cliente_nombre}</p>
        </div>
        <span className={cn("flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
          urgencia === "critico" ? "bg-red-500 text-white" : urgencia === "atencion" ? "bg-amber-500 text-white" : "bg-ink-100 text-ink-700")}>
          <Clock className="h-3 w-3" strokeWidth={2.5} /> {min} min
        </span>
      </div>

      <div className="mt-2 space-y-1 text-xs text-ink-600">
        <a href={`tel:${pedido.cliente_telefono}`} className="flex items-center gap-1.5 hover:text-brand-700"><Phone className="h-3 w-3" /> {pedido.cliente_telefono}</a>
        <p className="flex items-start gap-1.5"><MapPin className="mt-0.5 h-3 w-3 shrink-0" /> <span><b>{pedido.zona_nombre ?? "Sin zona"}</b> — {pedido.direccion_referencia}</span></p>
      </div>

      <ul className="mt-2 space-y-0.5 border-t border-ink-100 pt-2 text-xs text-ink-700">
        {items.map((i) => (
          <li key={i.id}>{i.cantidad}× {i.nombre_producto}{i.nota && <span className="italic text-ink-400"> — {i.nota}</span>}</li>
        ))}
      </ul>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-ink-100 pt-2 text-xs">
        <span className="rounded-md bg-ink-900 px-2 py-0.5 font-semibold tabular-nums text-white">{formatearLempiras(total)}</span>
        <span className="rounded-md bg-ink-100 px-2 py-0.5 text-ink-700">{ETIQUETA_METODO[pedido.metodo_pago as MetodoPago]}</span>
        {pedido.metodo_pago === "efectivo" && pedido.paga_con != null && (
          <span className="rounded-md bg-amber-100 px-2 py-0.5 text-amber-800">Paga con {formatearLempiras(pedido.paga_con)} · cambio {formatearLempiras(cambio)}</span>
        )}
        {conFactura && <span className="flex items-center gap-1 rounded-md bg-ink-100 px-2 py-0.5 text-ink-700"><FileText className="h-3 w-3" /> RTN {pedido.factura_rtn}</span>}
        {pedido.metodo_pago === "transferencia" && pedido.comprobante_transferencia_url && (
          <button type="button" disabled={ocupado} onClick={() => void verComprobante()} className="flex items-center gap-1 rounded-md bg-libre-bg px-2 py-0.5 text-libre-text hover:underline">
            <Receipt className="h-3 w-3" /> Ver comprobante
          </button>
        )}
        {pedido.metodo_pago === "transferencia" && !pedido.comprobante_transferencia_url && (
          <span className="rounded-md bg-amber-100 px-2 py-0.5 text-amber-800">Sin comprobante</span>
        )}
      </div>

      {orden?.lista_cocina && pedido.estado_delivery !== "listo" && pedido.estado_delivery !== "en_camino" && (
        <p className="mt-2 rounded-lg bg-libre-bg px-2.5 py-1.5 text-xs font-medium text-libre-text">✓ Cocina ya lo marcó listo</p>
      )}
      {repartidor && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-700">
          <Bike className="h-3.5 w-3.5 text-brand-600" /> {repartidor.nombre}
          {pedido.estado_delivery === "en_camino" && pedido.llegado_at && <span className="rounded-full bg-libre-bg px-2 py-0.5 text-[11px] font-semibold text-libre-text">Llegó</span>}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {pedido.estado_delivery === "recibido" && (
          <>
            <Button type="button" size="sm" onClick={onAceptar}>Aceptar</Button>
            <Button type="button" size="sm" variant="danger" onClick={() => onDialogo("rechazar")}>Rechazar</Button>
          </>
        )}
        {(pedido.estado_delivery === "aceptado" || pedido.estado_delivery === "en_cocina") && (
          <>
            {puedeDespachar ? (
              <Button type="button" size="sm" onClick={() => onDialogo("despachar")}>Listo / Despachar</Button>
            ) : (
              <span className="text-xs text-ink-400">Lo despacha el cajero</span>
            )}
            <Button type="button" size="sm" variant="danger" onClick={() => onDialogo("cancelar")}>Cancelar</Button>
          </>
        )}
        {pedido.estado_delivery === "listo" && (
          <>
            <Button type="button" size="sm" variant="secondary" onClick={() => onReimprimir("comprobante")}><Printer className="h-3.5 w-3.5" /> Comprobante</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => onReimprimir("factura")}><Printer className="h-3.5 w-3.5" /> Factura</Button>
            {puedeDespachar && <Button type="button" size="sm" variant="ghost" onClick={() => onDialogo("despachar")}>Cambiar repartidor</Button>}
            <Button type="button" size="sm" variant="danger" onClick={() => onDialogo("cancelar")}>Cancelar</Button>
          </>
        )}
        {pedido.estado_delivery === "en_camino" && (
          <Button type="button" size="sm" variant="danger" onClick={() => onDialogo("cancelar")}>Cancelar</Button>
        )}
      </div>
      {pedido.estado_delivery === "listo" && !pedido.repartidor_id && <p className="mt-1 text-xs text-amber-700">Falta asignar repartidor.</p>}
    </article>
  );
}

function Modal({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink-950/40 sm:items-center sm:p-4">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-popover sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink-900">{titulo}</h2>
          <button onClick={onCerrar} aria-label="Cerrar" className="rounded-lg p-1 text-ink-400 hover:bg-ink-100"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function DialogoMotivo({ titulo, ayuda, onCerrar, onConfirmar }: { titulo: string; ayuda: string; onCerrar: () => void; onConfirmar: (m: string) => void | Promise<void> }) {
  const [motivo, setMotivo] = useState("");
  return (
    <Modal titulo={titulo} onCerrar={onCerrar}>
      <label htmlFor="motivo" className={labelClass}>Motivo</label>
      <textarea id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} className={inputClass} autoFocus
        placeholder="Ej. no hay insumos, cliente no contesta…" />
      <p className="mt-1.5 text-xs text-ink-400">{ayuda}</p>
      <div className="mt-4 flex gap-2">
        <Button type="button" variant="secondary" onClick={onCerrar}>Volver</Button>
        <Button type="button" variant="danger" className="flex-1" disabled={motivo.trim().length < 3} onClick={() => void onConfirmar(motivo)}>Confirmar</Button>
      </div>
    </Modal>
  );
}

function DialogoDespacho({
  pedido, repartidores, pedidos, onCerrar, onConfirmar,
}: {
  pedido: DeliveryPedidoLocal;
  repartidores: { id: string; nombre: string; activo: boolean }[];
  pedidos: DeliveryPedidoLocal[];
  onCerrar: () => void;
  onConfirmar: (repartidorId: string) => void | Promise<void>;
}) {
  const sugerido = useMemo(() => sugerirRepartidor(repartidores, pedidos), [repartidores, pedidos]);
  const [elegido, setElegido] = useState(pedido.repartidor_id ?? sugerido ?? "");
  const activos = repartidores.filter((r) => r.activo);
  return (
    <Modal titulo="Listo / Despachar" onCerrar={onCerrar}>
      <p className="mb-3 text-xs text-ink-500">Se emite la factura {pedido.tipo_factura === "con_rtn" ? "con RTN" : "a Consumidor Final"}, se imprime junto con el comprobante de entrega y el pedido queda listo para el repartidor.</p>
      <label htmlFor="rep" className={labelClass}>Repartidor</label>
      {activos.length === 0 ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">No hay repartidores activos. Agrégalos en Admin &gt; Delivery.</p>
      ) : (
        <select id="rep" value={elegido} onChange={(e) => setElegido(e.target.value)} className={inputClass}>
          <option value="">Elige un repartidor…</option>
          {activos.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre} — {pedidosActivosDe(r.id, pedidos)} activos{r.id === sugerido ? " (sugerido)" : ""}
            </option>
          ))}
        </select>
      )}
      <div className="mt-4 flex gap-2">
        <Button type="button" variant="secondary" onClick={onCerrar}>Volver</Button>
        <Button type="button" className="flex-1" disabled={!elegido} onClick={() => void onConfirmar(elegido)}>Facturar e imprimir</Button>
      </div>
    </Modal>
  );
}
