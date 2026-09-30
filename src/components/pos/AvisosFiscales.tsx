"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, ShieldAlert, Link2, Loader2, X } from "lucide-react";
import { db } from "@/lib/offline/db";
import { createClient } from "@/lib/supabase/client";
import { evaluarFacturacion, leerConfigFiscal } from "@/lib/fiscal/emision";
import { vincularDispositivoLocal } from "@/lib/fiscal/sincronizacion";
import { MENSAJES_ALERTA, resumirRango } from "@/lib/fiscal/alertas";
import { fechaLocalHN } from "@/lib/fiscal/formato";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/ui";

/**
 * Avisos de facturación fiscal en el POS: la caja sin vincular, el bloqueo por
 * CAI agotado/vencido/ausente (rojo), las alertas al 85 % y a 30 días (ámbar) y
 * los documentos que el servidor rechazó al sincronizar (rojo). No renderiza
 * nada si el negocio no factura.
 */
export function AvisosFiscales() {
  const config = useLiveQuery(() => leerConfigFiscal(), [], undefined);
  const rangos = useLiveQuery(() => db.rangos_cai.toArray(), [], []);
  const conflictos = useLiveQuery(() => db.documentos_fiscales.where("sync_estado").equals("conflicto").count(), [], 0);
  const [ahora, setAhora] = useState(() => new Date());
  const [vinculando, setVinculando] = useState(false);

  // La fecha límite y los días restantes cambian con el reloj, no con la base
  useEffect(() => {
    const t = window.setInterval(() => setAhora(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  if (!config?.activa) return null;

  const avisos: { clave: string; tono: "rojo" | "ambar"; texto: string; accion?: React.ReactNode }[] = [];

  if (!config.dispositivo) {
    avisos.push({
      clave: "sin-dispositivo",
      tono: "rojo",
      texto: "Esta caja todavía no está vinculada a la sucursal: no se puede cobrar hasta vincularla. Si otra caja ya cobra aquí, pídele al administrador que la libere en Facturación fiscal.",
      accion: (
        <Button size="sm" variant="dark" onClick={() => setVinculando(true)}>
          <Link2 className="h-3.5 w-3.5" strokeWidth={2} />
          Vincular esta caja
        </Button>
      ),
    });
  } else {
    const bloqueo = evaluarFacturacion(config, rangos ?? [], "factura", ahora);
    if (bloqueo) {
      avisos.push({ clave: "bloqueo", tono: "rojo", texto: `Facturación bloqueada. ${bloqueo.message}` });
    } else {
      const d = config.dispositivo;
      const delPunto = (rangos ?? []).filter(
        (r) => r.clase === "factura" && r.establecimiento === d.establecimiento && r.punto_emision === d.punto_emision
      );
      const activo = delPunto.find((r) => r.estado === "activo");
      if (activo) {
        const resumen = resumirRango(activo, fechaLocalHN(ahora));
        if (resumen.nivel === "consumo" || resumen.nivel === "vencimiento") {
          const hayRelevo = delPunto.some((r) => r.estado === "pendiente" && r.desde > activo.hasta);
          avisos.push({
            clave: "alerta-rango",
            tono: "ambar",
            texto: `${MENSAJES_ALERTA[resumen.nivel]} Quedan ${resumen.restantes} facturas y ${Math.max(0, resumen.diasParaVencer)} días.${hayRelevo ? " Ya hay un rango siguiente cargado." : ""}`,
          });
        }
      }
    }
  }

  if ((conflictos ?? 0) > 0) {
    avisos.push({
      clave: "conflictos",
      tono: "rojo",
      texto: `${conflictos} documento(s) fiscal(es) fueron rechazados por el servidor al sincronizar. Avisa al administrador: quedó registrado un incidente.`,
    });
  }

  return (
    <>
      {avisos.length > 0 && (
        <div className="space-y-1.5 px-4 pt-3">
          {avisos.map((a) => (
            <div
              key={a.clave}
              role="alert"
              className={cn(
                "flex flex-wrap items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm",
                a.tono === "rojo"
                  ? "border-red-200 bg-red-50 text-red-800"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              )}
            >
              {a.tono === "rojo" ? (
                <ShieldAlert className="h-4 w-4 shrink-0" strokeWidth={2} />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={2} />
              )}
              <span className="min-w-0 flex-1">{a.texto}</span>
              {a.accion}
            </div>
          ))}
        </div>
      )}
      {vinculando && <VincularCajaModal onCerrar={() => setVinculando(false)} />}
    </>
  );
}

interface DispositivoLibre {
  id: string;
  nombre: string;
  establecimiento: string;
  punto_emision: string;
}

function VincularCajaModal({ onCerrar }: { onCerrar: () => void }) {
  const [libres, setLibres] = useState<DispositivoLibre[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vinculandoId, setVinculandoId] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const sucursalId = ((await db.config.get("sucursal"))?.valor as { id?: string } | undefined)?.id;
      if (!sucursalId) {
        if (vivo) setError("Todavía no se cargó la sucursal. Espera a que termine de sincronizar.");
        return;
      }
      const { data, error: err } = await createClient()
        .from("dispositivos_pos")
        .select("id, nombre, establecimiento, punto_emision, vinculo_hash, activo")
        .eq("sucursal_id", sucursalId)
        .order("nombre");
      if (!vivo) return;
      if (err) return setError("No se pudo cargar la lista. Revisa tu conexión a internet.");
      setLibres((data ?? []).filter((d) => d.activo && !d.vinculo_hash));
    })();
    return () => {
      vivo = false;
    };
  }, []);

  async function vincular(id: string) {
    setError(null);
    setVinculandoId(id);
    try {
      await vincularDispositivoLocal(id);
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo vincular.");
      setVinculandoId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink-950/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-6 shadow-popover sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink-900">Vincular esta caja</h2>
          <button onClick={onCerrar} className="rounded-lg p-1 text-ink-400 hover:bg-ink-100">
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        <p className="mb-4 text-sm text-ink-500">
          Cada caja factura con su propio punto de emisión y no se comparte con otra. Elige el que le
          corresponde a este dispositivo.
        </p>

        {libres === null && !error && (
          <p className="flex items-center gap-2 text-sm text-ink-500">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} /> Cargando…
          </p>
        )}
        {libres?.length === 0 && (
          <p className="text-sm text-ink-600">
            La caja de esta sucursal ya está vinculada a otro equipo. El administrador puede liberarla en
            Admin › Facturación fiscal › Estado › Caja de cobro.
          </p>
        )}
        <div className="space-y-2">
          {(libres ?? []).map((d) => (
            <button
              key={d.id}
              disabled={vinculandoId !== null}
              onClick={() => void vincular(d.id)}
              className="flex w-full items-center justify-between rounded-xl border border-ink-200 px-4 py-3 text-left transition hover:border-brand-500 hover:bg-brand-50 disabled:opacity-50"
            >
              <span>
                <span className="block text-sm font-medium text-ink-900">{d.nombre}</span>
                <span className="font-mono text-xs text-ink-500">
                  Est. {d.establecimiento} · Punto {d.punto_emision}
                </span>
              </span>
              {vinculandoId === d.id && <Loader2 className="h-4 w-4 animate-spin text-brand-600" strokeWidth={2} />}
            </button>
          ))}
        </div>
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>
    </div>
  );
}
