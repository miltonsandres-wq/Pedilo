"use client";

import { useState } from "react";
import { CheckCircle2, Minus, Plus, ShoppingCart, X } from "lucide-react";
import { enviarPedidoCliente, type ItemCarrito } from "@/app/carta/[token]/actions";
import { Button } from "@/components/ui/Button";
import { MenuGraficoCliente } from "@/components/menu/MenuGraficoCliente";
import { formatearLempiras } from "@/lib/delivery/validaciones";

export interface ProductoMenu {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  foto_url: string | null;
  categoria_id: string | null;
  /** Es plato del día de hoy: sale primero, en su propia sección. */
  plato_dia?: boolean;
}

// El menú del QR muestra el precio de cada platillo (con ISV incluido) y el total
// estimado del pedido; lo que se cobra al final lo confirma el cajero.
export function CartaCliente({
  token,
  categorias,
  productos,
}: {
  token: string;
  categorias: { id: string; nombre: string }[];
  productos: ProductoMenu[];
}) {
  const [carrito, setCarrito] = useState<Record<string, { cantidad: number; nota: string }>>({});
  const [mostrarCarrito, setMostrarCarrito] = useState(false);
  const [estado, setEstado] = useState<"idle" | "enviando" | "enviado" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const totalItems = Object.values(carrito).reduce((acc, i) => acc + i.cantidad, 0);
  const totalPedido = Object.entries(carrito).reduce(
    (acc, [id, i]) => acc + i.cantidad * (productos.find((p) => p.id === id)?.precio ?? 0),
    0
  );

  function cambiarCantidad(productoId: string, delta: number) {
    setCarrito((prev) => {
      const actual = prev[productoId]?.cantidad ?? 0;
      const nueva = Math.max(0, actual + delta);
      if (nueva === 0) {
        const resto = { ...prev };
        delete resto[productoId];
        return resto;
      }
      return { ...prev, [productoId]: { cantidad: nueva, nota: prev[productoId]?.nota ?? "" } };
    });
  }

  async function enviar() {
    setEstado("enviando");
    setError(null);
    const items: ItemCarrito[] = Object.entries(carrito).map(([productoId, i]) => ({
      productoId,
      cantidad: i.cantidad,
      nota: i.nota || undefined,
    }));
    const resultado = await enviarPedidoCliente(token, items);
    if (resultado.ok) {
      setEstado("enviado");
      setCarrito({});
    } else {
      setEstado("error");
      setError(resultado.error ?? "No se pudo enviar el pedido.");
    }
  }

  const cantidades = Object.fromEntries(Object.entries(carrito).map(([id, i]) => [id, i.cantidad]));

  return (
    <div>
      <MenuGraficoCliente productos={productos} categorias={categorias} cantidades={cantidades} onCambiar={cambiarCantidad} />
      {productos.length === 0 ? (
        <p className="text-center text-sm text-ink-400">El menú todavía no tiene platillos disponibles.</p>
      ) : (
        <p className="mb-16 mt-4 text-center text-xs text-ink-400">Los precios incluyen ISV.</p>
      )}

      {totalItems > 0 && !mostrarCarrito && (
        <button
          onClick={() => setMostrarCarrito(true)}
          className="fixed inset-x-4 bottom-4 z-10 mx-auto flex max-w-md items-center justify-center gap-2 rounded-2xl bg-ink-950 px-5 py-3.5 text-sm font-medium text-white shadow-popover"
        >
          <ShoppingCart className="h-4 w-4" strokeWidth={2} />
          Ver mi pedido · {totalItems} {totalItems === 1 ? "ítem" : "ítems"} · {formatearLempiras(totalPedido)}
        </button>
      )}

      {mostrarCarrito && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-ink-950/40 sm:items-center sm:p-4">
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-popover sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink-900">Tu pedido</h2>
              <button
                onClick={() => setMostrarCarrito(false)}
                className="rounded-lg p-1 text-ink-400 hover:bg-ink-100"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>

            {estado === "enviado" ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <CheckCircle2 className="h-10 w-10 text-libre-dot" strokeWidth={1.75} />
                <p className="text-sm font-medium text-ink-900">¡Pedido enviado!</p>
                <p className="text-xs text-ink-500">Tu mesero lo va a confirmar en un momento.</p>
                <Button size="sm" variant="secondary" onClick={() => setMostrarCarrito(false)} className="mt-2">
                  Seguir viendo el menú
                </Button>
              </div>
            ) : (
              <>
                <div className="mb-4 divide-y divide-ink-100">
                  {Object.entries(carrito).map(([id, i]) => {
                    const p = productos.find((p) => p.id === id);
                    if (!p) return null;
                    return (
                      <div key={id} className="flex items-center justify-between py-2.5 text-sm">
                        <div className="min-w-0 pr-2">
                          <p className="font-medium text-ink-800">{p.nombre}</p>
                          <p className="text-xs tabular-nums text-ink-500">{formatearLempiras(p.precio * i.cantidad)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => cambiarCantidad(id, -1)}
                            className="flex h-7 w-7 items-center justify-center rounded-full border border-ink-200 text-ink-600"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="w-5 text-center tabular-nums">{i.cantidad}</span>
                          <button
                            onClick={() => cambiarCantidad(id, 1)}
                            className="flex h-7 w-7 items-center justify-center rounded-full border border-ink-200 text-ink-600"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mb-3 flex items-center justify-between border-t border-ink-100 pt-3 text-sm font-semibold text-ink-900">
                  <span>Total estimado</span>
                  <span className="tabular-nums">{formatearLempiras(totalPedido)}</span>
                </div>
                <p className="mb-3 text-xs text-ink-400">Precios con ISV incluido. El total final lo confirma el cajero.</p>
                {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
                <Button
                  size="lg"
                  className="w-full"
                  disabled={estado === "enviando" || totalItems === 0}
                  onClick={() => void enviar()}
                >
                  {estado === "enviando" ? "Enviando..." : "Enviar pedido"}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
