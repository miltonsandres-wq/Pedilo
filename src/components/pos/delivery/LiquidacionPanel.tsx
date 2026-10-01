"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Bike, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { db } from "@/lib/offline/db";
import { Button } from "@/components/ui/Button";
import { cn, inputClass, labelClass } from "@/lib/ui";
import { ETIQUETA_METODO, formatearLempiras, type MetodoPago } from "@/lib/delivery/validaciones";
import {
  clasificarDiferencia, diferenciaLiquidacion, leerMonto, textoDiferencia, type CalculoLiquidacion,
} from "@/lib/delivery/liquidacion";

interface CierreHecho {
  repartidor: string;
  diferencia: number;
  totalEfectivo: number;
  entregado: number;
  pagoEnvios: number;
}

/**
 * Liquidación por repartidor: lo que el sistema dice que cobró en efectivo vs.
 * lo que entrega en caja. Al cerrar queda registrada con tu usuario y la hora
 * (los totales los calcula y guarda el servidor, no esta pantalla).
 */
export function LiquidacionPanel({ sucursalId }: { sucursalId: string }) {
  const repartidores = useLiveQuery(() => db.repartidores.where("sucursal_id").equals(sucursalId).toArray(), [sucursalId], []);
  const [calculos, setCalculos] = useState<Record<string, CalculoLiquidacion>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hechos, setHechos] = useState<CierreHecho[]>([]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const supabase = createClient();
    const lista = await db.repartidores.where("sucursal_id").equals(sucursalId).toArray();
    const res = await Promise.all(lista.map(async (r) => {
      const { data, error: e } = await supabase.rpc("calcular_liquidacion", { p_repartidor: r.id });
      return { id: r.id, data: data as unknown as CalculoLiquidacion | null, error: e };
    }));
    const falla = res.find((x) => x.error);
    if (falla) setError("No se pudo calcular (¿sin conexión?). Esta pantalla necesita internet.");
    setCalculos(Object.fromEntries(res.filter((x) => x.data).map((x) => [x.id, x.data!])));
    setCargando(false);
  }, [sucursalId]);

  useEffect(() => {
    if (repartidores.length > 0) void cargar();
    else setCargando(false);
    // se recalcula al cargar la lista de repartidores
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repartidores.length]);

  const conPedidos = repartidores.filter((r) => (calculos[r.id]?.total_pedidos ?? 0) > 0 || (calculos[r.id]?.pendientes_en_camino ?? 0) > 0);
  const sinPedidos = repartidores.filter((r) => !conPedidos.includes(r));

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/pos/delivery" className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100"><ArrowLeft className="h-4 w-4" /></Link>
        <div>
          <h1 className="text-lg font-semibold text-ink-900">Liquidación de repartidores</h1>
          <p className="text-xs text-ink-500">Cuenta el efectivo que te entrega cada repartidor al cerrar su turno.</p>
        </div>
      </div>

      {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      {hechos.map((h, i) => (
        <div key={i} role="status" className="mb-4 flex items-start gap-3 rounded-2xl border border-libre-border bg-libre-bg p-4 text-sm text-libre-text">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Liquidación de {h.repartidor} cerrada · {textoDiferencia(h.diferencia)}</p>
            <p>Sistema: {formatearLempiras(h.totalEfectivo)} · Entregado: {formatearLempiras(h.entregado)}{h.pagoEnvios > 0 ? ` · A pagarle por envíos: ${formatearLempiras(h.pagoEnvios)}` : ""}</p>
          </div>
        </div>
      ))}

      {cargando && <p className="py-10 text-center text-sm text-ink-400">Calculando…</p>}
      {!cargando && conPedidos.length === 0 && (
        <div className="rounded-2xl border border-dashed border-ink-200 p-10 text-center text-sm text-ink-400">
          <Bike className="mx-auto mb-2 h-6 w-6" /> No hay entregas por liquidar.
        </div>
      )}

      <div className="space-y-4">
        {conPedidos.map((r) => (
          <TarjetaLiquidacion key={r.id} nombre={r.nombre} tipoPago={r.tipo_pago} calculo={calculos[r.id]}
            onCerrada={(h) => { setHechos((prev) => [h, ...prev]); void cargar(); }} onError={setError} />
        ))}
      </div>

      {sinPedidos.length > 0 && !cargando && (
        <p className="mt-6 text-center text-xs text-ink-400">Sin pedidos por liquidar: {sinPedidos.map((r) => r.nombre).join(", ")}.</p>
      )}
    </div>
  );
}

function TarjetaLiquidacion({
  nombre, tipoPago, calculo, onCerrada, onError,
}: {
  nombre: string;
  tipoPago: string;
  calculo: CalculoLiquidacion;
  onCerrada: (h: CierreHecho) => void;
  onError: (m: string | null) => void;
}) {
  const [texto, setTexto] = useState("");
  const [notas, setNotas] = useState("");
  const [cerrando, setCerrando] = useState(false);
  const entregado = leerMonto(texto);
  const diferencia = entregado == null ? null : diferenciaLiquidacion(entregado, calculo.total_efectivo_cobrado);
  const tipo = diferencia == null ? null : clasificarDiferencia(diferencia);
  const enCalle = calculo.pendientes_en_camino > 0;

  async function cerrar() {
    if (entregado == null) return;
    setCerrando(true);
    onError(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("cerrar_liquidacion", { p_repartidor: calculo.repartidor_id, p_entregado: entregado, p_notas: notas || undefined });
    setCerrando(false);
    if (error) {
      onError(/LIQUIDACION_[A-Z]+: ([^\n]+)/.exec(error.message)?.[1] ?? "No se pudo cerrar la liquidación.");
      return;
    }
    const r = data as unknown as { diferencia: number; total_efectivo_cobrado: number; total_pago_envios: number };
    onCerrada({ repartidor: nombre, diferencia: r.diferencia, totalEfectivo: r.total_efectivo_cobrado, entregado, pagoEnvios: r.total_pago_envios });
  }

  return (
    <section className="rounded-2xl border border-ink-100 bg-white p-4 shadow-card">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink-900"><Bike className="h-4 w-4 text-brand-600" /> {nombre}</h2>
        <span className="text-xs text-ink-500">{calculo.total_pedidos} entregado{calculo.total_pedidos === 1 ? "" : "s"}</span>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-ink-100 text-sm">
        {calculo.pedidos.map((p) => (
          <div key={p.orden_id} className="flex items-center justify-between gap-2 border-b border-ink-100 px-3 py-2 last:border-0">
            <span className="text-ink-800">#{p.numero ?? "—"} · {p.cliente}</span>
            <span className="text-xs text-ink-500">{ETIQUETA_METODO[p.metodo_pago as MetodoPago] ?? p.metodo_pago}</span>
            <span className="font-medium tabular-nums">{formatearLempiras(Number(p.monto_cobrado ?? 0))}</span>
          </div>
        ))}
      </div>

      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between"><dt className="text-ink-600">Efectivo cobrado (según el sistema)</dt><dd className="font-semibold tabular-nums">{formatearLempiras(calculo.total_efectivo_cobrado)}</dd></div>
        {tipoPago === "por_entrega" && (
          <div className="flex justify-between"><dt className="text-ink-600">A pagarle por envíos</dt><dd className="font-semibold tabular-nums">{formatearLempiras(calculo.total_pago_envios)}</dd></div>
        )}
      </dl>

      <div className="mt-3">
        <label htmlFor={`ent-${calculo.repartidor_id}`} className={labelClass}>Efectivo entregado en caja</label>
        <input id={`ent-${calculo.repartidor_id}`} value={texto} onChange={(e) => setTexto(e.target.value)} inputMode="decimal" placeholder="0.00" className={cn(inputClass, "text-lg font-semibold tabular-nums")} />
      </div>

      {diferencia != null && tipo && (
        <p role="status" className={cn("mt-3 rounded-xl px-4 py-3 text-center text-lg font-bold",
          tipo === "cuadrado" ? "bg-libre-bg text-libre-text" : tipo === "faltante" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800")}>
          {textoDiferencia(diferencia)}
        </p>
      )}

      {enCalle && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Todavía tiene {calculo.pendientes_en_camino} pedido(s) en camino. Liquida cuando termine.</p>}

      <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={1} placeholder="Notas (opcional)" className={cn(inputClass, "mt-3")} />
      <Button type="button" size="lg" className="mt-3 w-full" disabled={entregado == null || enCalle || calculo.total_pedidos === 0 || cerrando} onClick={() => void cerrar()}>
        {cerrando ? "Cerrando…" : "Cerrar liquidación"}
      </Button>
    </section>
  );
}
