"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  Ban,
  ChefHat,
  Check,
  Minus,
  MessageSquarePlus,
  Pencil,
  Plus,
  QrCode,
  Receipt,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { db, type OrdenItemLocal } from "@/lib/offline/db";
import {
  actualizarCantidadItem,
  actualizarNotaItem,
  actualizarPrecioItem,
  agregarItem,
  anularOrden,
  cobrar,
  eliminarItem,
  enviarACocina,
} from "@/lib/pos/acciones";
import type { FormaPago, RolUsuario } from "@/lib/types/helpers";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/Field";
import { cn } from "@/lib/ui";

export function DetalleMesa({
  mesaId,
  sucursalId,
  usuarioId,
  rol,
}: {
  mesaId: string;
  sucursalId: string;
  usuarioId: string;
  rol: RolUsuario;
}) {
  const router = useRouter();
  const [mostrarCobro, setMostrarCobro] = useState(false);
  const [mostrarAnular, setMostrarAnular] = useState(false);

  const mesa = useLiveQuery(() => db.mesas.get(mesaId), [mesaId]);
  const orden = useLiveQuery(
    () =>
      db.ordenes
        .where("mesa_id")
        .equals(mesaId)
        .filter((o) => o.estado === "abierta" || o.estado === "enviada")
        .first(),
    [mesaId]
  );
  const items = useLiveQuery(
    () => (orden ? db.orden_items.where("orden_id").equals(orden.id).sortBy("created_at") : []),
    [orden?.id],
    []
  );
  const productos = useLiveQuery(
    () => db.productos.where("sucursal_id").equals(sucursalId).filter((p) => p.disponible).sortBy("nombre"),
    [sucursalId],
    []
  );
  const formasPago = useLiveQuery(
    () => db.config.get("formas_pago").then((c) => (c?.valor as FormaPago[] | undefined) ?? []),
    [],
    [] as FormaPago[]
  );

  if (!orden) {
    return (
      <div className="mx-auto max-w-lg">
        <button
          onClick={() => router.push("/pos")}
          className="mb-4 flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-800"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} /> Volver al mapa
        </button>
        <p className="text-sm text-ink-500">
          Esta mesa no tiene una orden abierta. Vuelve al mapa y tócala para abrir una.
        </p>
      </div>
    );
  }

  const hayPendientesPorImprimir = (items ?? []).some((i) => !i.impreso);
  const esCajero = rol === "cajero";
  const esMesero = rol === "mesero";

  return (
    <div className="mx-auto max-w-lg pb-24">
      <div className="mb-1 flex items-center justify-between">
        <button
          onClick={() => router.push("/pos")}
          className="flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-800"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} /> Volver
        </button>
        <span className="text-sm font-semibold text-ink-900">{mesa?.nombre}</span>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
            orden.estado === "abierta" ? "bg-ink-100 text-ink-600" : "bg-brand-50 text-brand-700"
          )}
        >
          {orden.estado}
        </span>
      </div>

      {(orden.cliente_nombre || orden.personas) && (
        <p className="mb-4 flex items-center justify-center gap-1.5 text-center text-xs text-ink-500">
          {orden.cliente_nombre && <span className="font-medium text-ink-700">{orden.cliente_nombre}</span>}
          {orden.personas && (
            <span className="flex items-center gap-0.5">
              <Users className="h-3 w-3" strokeWidth={2} />
              {orden.personas}
            </span>
          )}
        </p>
      )}

      {/* Ticket */}
      <div className="mb-4 overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-card">
        <div className="flex items-center gap-2 border-b border-dashed border-ink-200 bg-ink-50/60 px-4 py-3">
          <Receipt className="h-4 w-4 text-ink-400" strokeWidth={2} />
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Comanda</p>
        </div>
        <div className="divide-y divide-ink-100">
          {(items ?? []).map((item) => (
            <FilaItem
              key={item.id}
              item={item}
              ordenId={orden.id}
              editablePrecio={esCajero}
              editableMesero={esMesero}
            />
          ))}
          {(items ?? []).length === 0 && (
            <p className="px-4 py-4 text-sm text-ink-400">Sin ítems todavía.</p>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-dashed border-ink-200 bg-ink-50/60 px-4 py-3 text-sm font-semibold text-ink-900">
          <span>Total</span>
          <span className="tabular-nums">L. {orden.total.toFixed(2)}</span>
        </div>
      </div>

      {esMesero && <FormularioAgregarItem ordenId={orden.id} productos={productos ?? []} />}

      {esCajero && (
        <p className="mb-4 rounded-2xl border border-dashed border-ink-200 bg-white p-4 text-center text-xs text-ink-400">
          El mesero agrega los platillos desde su pantalla. Aquí solo cobras cuando estén listos.
        </p>
      )}

      <button
        onClick={() => setMostrarAnular(true)}
        className="mb-4 flex w-full items-center justify-center gap-1.5 py-1 text-xs font-medium text-red-500 hover:text-red-700"
      >
        <Ban className="h-3.5 w-3.5" strokeWidth={2} />
        Anular esta orden
      </button>

      {/* Barra de acciones fija abajo — táctil, siempre visible */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-ink-100 bg-white/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg gap-2">
          {esMesero && (
            <Button
              variant="dark"
              size="lg"
              className="flex-1"
              disabled={!hayPendientesPorImprimir}
              onClick={() => void enviarACocina(orden.id, mesa?.nombre ?? "")}
            >
              <ChefHat className="h-4 w-4" strokeWidth={2} />
              Enviar a cocina
            </Button>
          )}
          {esCajero && (
            <Button
              size="lg"
              className="flex-1"
              disabled={orden.total === 0}
              onClick={() => setMostrarCobro(true)}
            >
              {orden.total === 0 ? "Esperando pedido..." : `Cobrar · L. ${orden.total.toFixed(2)}`}
            </Button>
          )}
        </div>
      </div>

      {mostrarCobro && (
        <FormularioCobro
          ordenId={orden.id}
          mesaId={mesaId}
          usuarioId={usuarioId}
          total={orden.total}
          formasDisponibles={formasPago ?? []}
          onCerrar={() => setMostrarCobro(false)}
          onCobrado={() => router.push("/pos")}
        />
      )}

      {mostrarAnular && (
        <FormularioAnular
          ordenId={orden.id}
          mesaId={mesaId}
          onCerrar={() => setMostrarAnular(false)}
          onAnulada={() => router.push("/pos")}
        />
      )}
    </div>
  );
}

function FilaItem({
  item,
  ordenId,
  editablePrecio,
  editableMesero,
}: {
  item: OrdenItemLocal;
  ordenId: string;
  editablePrecio: boolean;
  editableMesero: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [precio, setPrecio] = useState(String(item.precio_unitario));
  const [editandoNota, setEditandoNota] = useState(false);
  const [nota, setNota] = useState(item.nota ?? "");
  const [eliminando, setEliminando] = useState(false);

  async function guardar() {
    const nuevoPrecio = Number(precio);
    if (!Number.isFinite(nuevoPrecio) || nuevoPrecio < 0) return;
    await actualizarPrecioItem({ itemId: item.id, ordenId, nuevoPrecio });
    setEditando(false);
  }

  async function guardarNota() {
    await actualizarNotaItem({ itemId: item.id, nuevaNota: nota.trim() || null });
    setEditandoNota(false);
  }

  async function cambiarCantidad(delta: number) {
    const nueva = item.cantidad + delta;
    if (nueva < 1) return;
    await actualizarCantidadItem({ itemId: item.id, ordenId, nuevaCantidad: nueva });
  }

  async function eliminar() {
    const advertencia = item.impreso
      ? `"${item.nombre_producto}" ya se envió a cocina. Se va a quitar de la comanda y del total — avísale a cocina en persona para que no lo prepare. ¿Continuar?`
      : `¿Quitar "${item.nombre_producto}" de la comanda?`;
    if (!window.confirm(advertencia)) return;
    setEliminando(true);
    await eliminarItem({ itemId: item.id, ordenId });
  }

  if (eliminando) return null;

  return (
    <div className="px-4 py-2.5 text-sm">
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-2">
          {editableMesero ? (
            <div className="flex shrink-0 items-center gap-1 rounded-full bg-ink-50 px-1 py-0.5">
              <button
                onClick={() => void cambiarCantidad(-1)}
                disabled={item.cantidad <= 1}
                className="flex h-5 w-5 items-center justify-center rounded-full text-ink-500 hover:bg-ink-200 disabled:opacity-30"
                aria-label="Restar cantidad"
              >
                <Minus className="h-3 w-3" strokeWidth={2.5} />
              </button>
              <span className="w-4 text-center text-xs font-semibold tabular-nums text-ink-700">
                {item.cantidad}
              </span>
              <button
                onClick={() => void cambiarCantidad(1)}
                className="flex h-5 w-5 items-center justify-center rounded-full text-ink-500 hover:bg-ink-200"
                aria-label="Sumar cantidad"
              >
                <Plus className="h-3 w-3" strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            <span className="shrink-0 text-ink-400">{item.cantidad}×</span>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-800">{item.nombre_producto}</p>
            {item.nota && !editandoNota && (
              <p className="truncate text-xs text-ink-400">{item.nota}</p>
            )}
            {editablePrecio && item.cantidad > 1 && editando && (
              <p className="text-[11px] text-ink-400">
                {item.cantidad} × L. {precio || "0"} = L. {(item.cantidad * Number(precio || 0)).toFixed(2)}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {editando ? (
            <>
              <span className="text-xs text-ink-400">L.</span>
              <input
                type="number"
                step="0.01"
                min={0}
                autoFocus
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void guardar()}
                className="w-20 rounded-lg border border-brand-300 px-2 py-1 text-sm tabular-nums outline-none focus:ring-2 focus:ring-brand-500/20"
              />
              <button
                onClick={() => void guardar()}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-libre-bg text-libre-text"
                aria-label="Guardar precio"
              >
                <Check className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
              <button
                onClick={() => {
                  setPrecio(String(item.precio_unitario));
                  setEditando(false);
                }}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-100 text-ink-500"
                aria-label="Cancelar"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </>
          ) : (
            <>
              <span className="tabular-nums text-ink-600">
                L. {(item.cantidad * item.precio_unitario).toFixed(2)}
              </span>
              {editablePrecio && (
                <button
                  onClick={() => setEditando(true)}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                  aria-label="Editar precio"
                  title="Editar precio de este ítem"
                >
                  <Pencil className="h-3 w-3" strokeWidth={2} />
                </button>
              )}
              {editableMesero && !editandoNota && (
                <button
                  onClick={() => {
                    setNota(item.nota ?? "");
                    setEditandoNota(true);
                  }}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                  aria-label={item.nota ? "Editar nota" : "Agregar nota"}
                  title={item.nota ? "Editar nota" : "Agregar nota (ej. sin pepinillos)"}
                >
                  <MessageSquarePlus className="h-3 w-3" strokeWidth={2} />
                </button>
              )}
              {editableMesero && (
                <button
                  onClick={() => void eliminar()}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-ink-400 hover:bg-red-50 hover:text-red-600"
                  aria-label="Quitar ítem"
                  title="Quitar ítem de la comanda"
                >
                  <Trash2 className="h-3 w-3" strokeWidth={2} />
                </button>
              )}
              {item.origen_cliente && (
                <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                  <QrCode className="h-2.5 w-2.5" strokeWidth={2} />
                  QR
                </span>
              )}
              {!item.impreso && (
                <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                  <Sparkles className="h-2.5 w-2.5" strokeWidth={2} />
                  nuevo
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {editandoNota && (
        <div className="mt-2 flex items-center gap-1.5">
          <input
            type="text"
            autoFocus
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void guardarNota()}
            placeholder="Ej. sin pepinillos, extra salsa..."
            className="flex-1 rounded-lg border border-brand-300 px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/20"
          />
          <button
            onClick={() => void guardarNota()}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-libre-bg text-libre-text"
            aria-label="Guardar nota"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
          <button
            onClick={() => {
              setNota(item.nota ?? "");
              setEditandoNota(false);
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-500"
            aria-label="Cancelar"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>
      )}
    </div>
  );
}

function FormularioAgregarItem({
  ordenId,
  productos,
}: {
  ordenId: string;
  productos: { id: string; nombre: string; precio: number }[];
}) {
  const [productoId, setProductoId] = useState("");
  const [cantidad, setCantidad] = useState(1);
  const [nota, setNota] = useState("");

  const productoElegido = productos.find((p) => p.id === productoId);

  async function agregar() {
    const producto = productos.find((p) => p.id === productoId);
    if (!producto) return;
    await agregarItem({
      ordenId,
      productoId: producto.id,
      nombreProducto: producto.nombre,
      precioUnitario: producto.precio,
      cantidad,
      nota: nota || undefined,
    });
    setProductoId("");
    setCantidad(1);
    setNota("");
  }

  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-3 shadow-card">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">Agregar ítem</p>
      <div className="flex flex-wrap gap-2">
        <select
          value={productoId}
          onChange={(e) => setProductoId(e.target.value)}
          className="min-w-40 flex-1 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        >
          <option value="">Selecciona un producto</option>
          {productos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre} — L. {p.precio.toFixed(2)}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          value={cantidad}
          onChange={(e) => setCantidad(Number(e.target.value))}
          className="w-16 rounded-lg border border-ink-200 bg-white px-2 py-2 text-center text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />
        <input
          placeholder="Nota (opcional)"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          className="flex-1 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />
        <Button disabled={!productoId} onClick={() => void agregar()}>
          <Plus className="h-4 w-4" strokeWidth={2} />
          Agregar
        </Button>
      </div>
      {/* Subtotal en vivo: deja clarísimo que la cantidad sí multiplica el
          precio antes de que el mesero confirme el ítem. */}
      {productoElegido && (
        <p className="mt-2 text-right text-xs text-ink-500">
          {cantidad} × L. {productoElegido.precio.toFixed(2)} ={" "}
          <span className="font-semibold text-ink-800">
            L. {(cantidad * productoElegido.precio).toFixed(2)}
          </span>
        </p>
      )}
    </div>
  );
}

function FormularioCobro({
  ordenId,
  mesaId,
  usuarioId,
  total,
  formasDisponibles,
  onCerrar,
  onCobrado,
}: {
  ordenId: string;
  mesaId: string;
  usuarioId: string;
  total: number;
  formasDisponibles: FormaPago[];
  onCerrar: () => void;
  onCobrado: () => void;
}) {
  const [monto, setMonto] = useState(total);
  const [formaPago, setFormaPago] = useState<FormaPago>(formasDisponibles[0] ?? "efectivo");
  const [referencia, setReferencia] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    setEnviando(true);
    await cobrar({ ordenId, mesaId, usuarioId, monto, formaPago, referencia: referencia || undefined });
    onCobrado();
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-ink-950/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-6 shadow-popover sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink-900">Cobrar orden</h2>
          <button onClick={onCerrar} className="rounded-lg p-1 text-ink-400 hover:bg-ink-100">
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <label className="mb-1.5 block text-xs font-medium text-ink-500">Monto</label>
        <div className="relative mb-3">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-400">L.</span>
          <input
            type="number"
            step="0.01"
            value={monto}
            onChange={(e) => setMonto(Number(e.target.value))}
            className="w-full rounded-lg border border-ink-200 bg-white py-3 pl-8 pr-3 text-lg font-semibold tabular-nums outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </div>

        <SelectField
          label="Forma de pago"
          name="forma_pago"
          value={formaPago}
          onChange={(e) => setFormaPago(e.target.value as FormaPago)}
          className="mb-3"
        >
          {(formasDisponibles.length > 0
            ? formasDisponibles
            : (["efectivo", "tarjeta", "transferencia"] as const)
          ).map((f) => (
            <option key={f} value={f} className="capitalize">
              {f}
            </option>
          ))}
        </SelectField>

        <label className="mb-1.5 block text-xs font-medium text-ink-500">Referencia (opcional)</label>
        <input
          value={referencia}
          onChange={(e) => setReferencia(e.target.value)}
          className="mb-5 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />

        <div className="flex gap-2">
          <Button variant="secondary" size="lg" className="flex-1" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button size="lg" className="flex-1" disabled={enviando} onClick={() => void confirmar()}>
            {enviando ? "Cobrando..." : "Confirmar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function FormularioAnular({
  ordenId,
  mesaId,
  onCerrar,
  onAnulada,
}: {
  ordenId: string;
  mesaId: string;
  onCerrar: () => void;
  onAnulada: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    setEnviando(true);
    await anularOrden({ ordenId, mesaId, motivo: motivo || undefined });
    onAnulada();
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-ink-950/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-6 shadow-popover sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-600">
              <Ban className="h-4 w-4" strokeWidth={2} />
            </div>
            <h2 className="text-base font-semibold text-ink-900">Anular orden</h2>
          </div>
          <button onClick={onCerrar} className="rounded-lg p-1 text-ink-400 hover:bg-ink-100">
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <p className="mb-4 text-sm text-ink-500">
          Se cancela todo el pedido de esta mesa y se libera para el siguiente cliente. Esta acción no
          se puede deshacer.
        </p>

        <label className="mb-1.5 block text-xs font-medium text-ink-500">Motivo (opcional)</label>
        <input
          autoFocus
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ej. el cliente se fue sin pedir"
          className="mb-5 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />

        <div className="flex gap-2">
          <Button variant="secondary" size="lg" className="flex-1" onClick={onCerrar}>
            Volver
          </Button>
          <Button variant="danger" size="lg" className="flex-1" disabled={enviando} onClick={() => void confirmar()}>
            {enviando ? "Anulando..." : "Sí, anular"}
          </Button>
        </div>
      </div>
    </div>
  );
}
