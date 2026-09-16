"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Users, UtensilsCrossed, UserPlus, X } from "lucide-react";
import { db, type MesaLocal } from "@/lib/offline/db";
import { abrirOrden } from "@/lib/pos/acciones";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/ui";
import type { RolUsuario } from "@/lib/types/helpers";

export function MapaMesas({
  sucursalId,
  tenantId,
  usuarioId,
  rol,
}: {
  sucursalId: string;
  tenantId: string;
  usuarioId: string;
  rol: RolUsuario;
}) {
  const router = useRouter();
  const [mesaParaAbrir, setMesaParaAbrir] = useState<MesaLocal | null>(null);

  const mesas = useLiveQuery(
    () => db.mesas.where("sucursal_id").equals(sucursalId).filter((m) => m.activa).sortBy("nombre"),
    [sucursalId],
    []
  );
  const ordenesAbiertas = useLiveQuery(
    () =>
      db.ordenes
        .where("sucursal_id")
        .equals(sucursalId)
        .filter((o) => o.estado === "abierta" || o.estado === "enviada")
        .toArray(),
    [sucursalId],
    []
  );

  const ordenPorMesa = new Map((ordenesAbiertas ?? []).map((o) => [o.mesa_id, o]));
  const esMesero = rol === "mesero";

  function clicMesa(mesa: MesaLocal) {
    const orden = ordenPorMesa.get(mesa.id);

    if (!orden) {
      // Mesa libre: normalmente la abre el cajero al recibir al cliente, pero
      // si el cliente se sentó solo y el cajero no lo vio, el mesero también
      // puede abrirla (con nombre y cantidad de personas) para no dejarlo sin
      // atender.
      setMesaParaAbrir(mesa);
      return;
    }

    // Mesa ocupada: el cajero va a cobrar, el mesero va a tomar/completar el pedido.
    router.push(`/pos/mesa/${mesa.id}`);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-ink-900">Mesas</h1>
        <div className="flex items-center gap-3 text-xs text-ink-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-libre-dot" /> Libre
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Sin pedido
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-ocupada-dot" /> En curso
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {(mesas ?? []).map((mesa) => {
          const orden = ordenPorMesa.get(mesa.id);
          const sinPedido = orden && orden.total === 0;
          const estilo = !orden
            ? "border-libre-border bg-libre-bg text-libre-text hover:brightness-95"
            : sinPedido
              ? "border-amber-300 bg-amber-50 text-amber-800 hover:brightness-95"
              : "border-ocupada-border bg-ocupada-bg text-ocupada-text hover:brightness-95";

          return (
            <button
              key={mesa.id}
              onClick={() => clicMesa(mesa)}
              className={cn(
                "flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border-2 p-3 text-sm font-semibold shadow-card transition active:scale-95",
                estilo
              )}
            >
              <UtensilsCrossed className="h-5 w-5 opacity-70" strokeWidth={2} />
              <span>{mesa.nombre}</span>
              {orden ? (
                <>
                  {orden.cliente_nombre && (
                    <span className="max-w-full truncate text-[11px] font-normal opacity-80">
                      {orden.cliente_nombre}
                    </span>
                  )}
                  <span className="text-[11px] font-normal opacity-70">
                    {sinPedido ? "sin pedido" : "L. " + orden.total.toFixed(2)}
                  </span>
                </>
              ) : (
                <span className="flex items-center gap-1 text-[11px] font-normal opacity-70">
                  <Users className="h-3 w-3" strokeWidth={2} />
                  {mesa.capacidad}
                </span>
              )}
            </button>
          );
        })}
        {(mesas ?? []).length === 0 && (
          <p className="col-span-full text-sm text-ink-500">
            No hay mesas configuradas todavía (pídele al admin que las cree).
          </p>
        )}
      </div>

      {esMesero && (
        <p className="mt-6 text-xs text-ink-400">
          Las mesas en <span className="font-medium text-amber-700">ámbar</span> ya tienen cliente
          sentado y están esperando que tomes su pedido.
        </p>
      )}

      {mesaParaAbrir && (
        <ModalNuevoCliente
          mesa={mesaParaAbrir}
          sucursalId={sucursalId}
          tenantId={tenantId}
          usuarioId={usuarioId}
          esMesero={esMesero}
          onCerrar={() => setMesaParaAbrir(null)}
        />
      )}
    </div>
  );
}

function ModalNuevoCliente({
  mesa,
  sucursalId,
  tenantId,
  usuarioId,
  esMesero,
  onCerrar,
}: {
  mesa: MesaLocal;
  sucursalId: string;
  tenantId: string;
  usuarioId: string;
  esMesero: boolean;
  onCerrar: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [personas, setPersonas] = useState(Math.min(mesa.capacidad, 2));
  const [guardando, setGuardando] = useState(false);

  async function confirmar() {
    setGuardando(true);
    await abrirOrden({
      mesaId: mesa.id,
      sucursalId,
      tenantId,
      usuarioId,
      clienteNombre: nombre || undefined,
      personas,
    });
    setGuardando(false);
    onCerrar();
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-ink-950/40 sm:items-center sm:p-4">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-6 shadow-popover sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <UserPlus className="h-4 w-4" strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-ink-900">Recibir cliente</h2>
              <p className="text-xs text-ink-500">{mesa.nombre}</p>
            </div>
          </div>
          <button onClick={onCerrar} className="rounded-lg p-1 text-ink-400 hover:bg-ink-100">
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        {esMesero && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Normalmente el cajero recibe al cliente, pero como no la abrió, la puedes abrir vos.
          </p>
        )}

        <label className="mb-1.5 block text-xs font-medium text-ink-500">Nombre del cliente</label>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej. Familia Pérez"
          autoFocus
          className="mb-3 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />

        <label className="mb-1.5 block text-xs font-medium text-ink-500">
          Personas (capacidad de la mesa: {mesa.capacidad})
        </label>
        <input
          type="number"
          min={1}
          value={personas}
          onChange={(e) => setPersonas(Number(e.target.value))}
          className="mb-5 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />

        <div className="flex gap-2">
          <Button variant="secondary" size="lg" className="flex-1" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button size="lg" className="flex-1" disabled={guardando} onClick={() => void confirmar()}>
            {guardando ? "Abriendo..." : "Abrir mesa"}
          </Button>
        </div>
      </div>
    </div>
  );
}
