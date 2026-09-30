"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  Boxes,
  Building2,
  Check,
  ChefHat,
  FileText,
  LayoutGrid,
  Loader2,
  Monitor,
  PartyPopper,
  Wallet,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { completarTutorial } from "@/app/admin/tutorial/actions";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/ui";

export const EVENTO_ABRIR_TUTORIAL = "pedilo:abrir-tutorial";
const CLAVE_OMITIDO = "pedilo_tutorial_omitido";

interface Paso {
  icono: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  titulo: string;
  donde: string;
  puntos: string[];
}

export const PASOS: Paso[] = [
  {
    icono: PartyPopper,
    titulo: "¡Bienvenido a Pedilo!",
    donde: "Este es el panel del dueño",
    puntos: [
      "Desde aquí configuras tu negocio una sola vez; tu personal trabaja en el POS (mesero, cajero y cocina).",
      "Te guiamos por todo en menos de 2 minutos. Puedes volver a verlo cuando quieras con «Ver tutorial» en el menú lateral.",
    ],
  },
  {
    icono: Building2,
    titulo: "1. Sucursales y personal",
    donde: "Menú › Sucursales",
    puntos: [
      "Revisa los datos de cada local y sube su logo: sale en la carta y en los tickets impresos.",
      "Crea los usuarios de cada sucursal: Cajero (abre mesas y cobra) y Mesero (toma pedidos y los envía a cocina).",
      "Aquí también registras la URL del agente de impresión si usas impresora térmica.",
    ],
  },
  {
    icono: UtensilsCrossed,
    titulo: "2. Menú digital",
    donde: "Menú › Menú digital",
    puntos: [
      "Crea tus categorías y luego tus productos con precio, foto y descripción. Los precios incluyen ISV.",
      "Marca cada producto para las sucursales donde se vende. ¿Tienes el menú en PDF? Usa «Importar desde PDF».",
      "Bebidas alcohólicas y tabaco llevan ISV de 18 %; el resto, 15 % (o exento).",
    ],
  },
  {
    icono: Boxes,
    titulo: "3. Inventario",
    donde: "Menú › Inventario",
    puntos: [
      "Lleva el control de botellas, alimentos e insumos: crea categorías y artículos.",
      "Anota las existencias por sucursal y un stock mínimo: verás una alerta de «stock bajo».",
    ],
  },
  {
    icono: LayoutGrid,
    titulo: "4. Mesas y plano",
    donde: "Menú › Mesas / Layout",
    puntos: [
      "Crea las mesas de cada sucursal y arrástralas para armar el plano de tu local.",
      "Cada mesa tiene un código QR: el cliente escanea y ve tu carta digital desde su celular.",
    ],
  },
  {
    icono: Wallet,
    titulo: "5. Formas de pago",
    donde: "Menú › Formas de pago",
    puntos: [
      "Elige qué aceptas en cada sucursal: efectivo, tarjeta o transferencia.",
      "El cajero verá solo las que actives al cobrar.",
    ],
  },
  {
    icono: Monitor,
    titulo: "6. Así se trabaja en el POS",
    donde: "Botón «Ir al POS»",
    puntos: [
      "El cajero toca una mesa libre, anota el nombre del cliente y abre la orden.",
      "El mesero agrega los productos y toca «Enviar a cocina»: la comanda se imprime y aparece en la pantalla de cocina.",
      "Al terminar, el cajero cobra. También puede imprimir la pre-cuenta (no es factura).",
      "Funciona aunque se caiga el internet: todo se guarda y se sincroniza solo al volver.",
    ],
  },
  {
    icono: ChefHat,
    titulo: "7. Pantalla de cocina",
    donde: "Menú › Pantalla de cocina",
    puntos: [
      "Muestra en vivo las órdenes que llegan. Cocina toca «Listo» cuando termina y la orden desaparece de la pantalla.",
      "Ábrela en una tablet o TV dentro de la cocina.",
    ],
  },
  {
    icono: FileText,
    titulo: "8. Facturación fiscal (opcional)",
    donde: "Menú › Facturación fiscal",
    puntos: [
      "Si facturas con CAI del SAR: carga los datos del emisor, crea una caja por dispositivo y registra tu rango autorizado.",
      "Al activarla, cada cobro emite su factura con RTN opcional, y te avisamos cuando el rango esté por agotarse o vencer.",
    ],
  },
  {
    icono: BarChart3,
    titulo: "9. Reportes y cierre del día",
    donde: "Menú › Reportes y Resumen",
    puntos: [
      "En Resumen ves lo cobrado hoy y las órdenes por sucursal.",
      "En Reportes consultas el cierre diario por forma de pago y tus productos más vendidos.",
      "¡Listo! Ya conoces todo Pedilo. Toca «Tutorial completado» y empieza a vender.",
    ],
  },
];

/**
 * Tutorial de bienvenida para negocios nuevos. Se muestra mientras el negocio
 * no lo haya completado; «Tutorial completado» lo guarda en la base y no
 * vuelve a salir solo. «Saltar por ahora» solo lo cierra en esta sesión.
 * Cuando ya está completado, sigue montado para poder reabrirlo a mano
 * (botón «Ver tutorial»), sin volver a marcar nada.
 */
export function TutorialOnboarding({ completado }: { completado: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [paso, setPaso] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [yaCompletado, setYaCompletado] = useState(completado);

  useEffect(() => {
    if (!completado) {
      let omitido = false;
      try {
        omitido = sessionStorage.getItem(CLAVE_OMITIDO) === "1";
      } catch {
        /* sin sessionStorage: se muestra igual */
      }
      if (!omitido) setAbierto(true);
    }
    const abrir = () => {
      setPaso(0);
      setError(null);
      setAbierto(true);
    };
    window.addEventListener(EVENTO_ABRIR_TUTORIAL, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_TUTORIAL, abrir);
  }, [completado]);

  const saltar = useCallback(() => {
    try {
      sessionStorage.setItem(CLAVE_OMITIDO, "1");
    } catch {
      /* ignorar */
    }
    setAbierto(false);
  }, []);

  async function terminar() {
    if (yaCompletado) {
      setAbierto(false);
      return;
    }
    setGuardando(true);
    setError(null);
    const r = await completarTutorial().catch(() => ({ ok: false }));
    setGuardando(false);
    if (!r.ok) {
      setError("No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.");
      return;
    }
    setYaCompletado(true);
    setAbierto(false);
  }

  if (!abierto) return null;

  const actual = PASOS[paso];
  const Icono = actual.icono;
  const esUltimo = paso === PASOS.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/60 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Tutorial de bienvenida"
    >
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-popover sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3">
          <p className="text-xs font-medium text-ink-500">
            Paso {paso + 1} de {PASOS.length}
          </p>
          <button
            onClick={saltar}
            aria-label="Cerrar tutorial"
            className="rounded-lg p-1 text-ink-400 hover:bg-ink-100"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Icono className="h-5 w-5" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-ink-900">{actual.titulo}</h2>
              <p className="text-xs text-ink-500">{actual.donde}</p>
            </div>
          </div>
          <ul className="space-y-2.5">
            {actual.puntos.map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-sm text-ink-700">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" strokeWidth={2.5} />
                <span>{p}</span>
              </li>
            ))}
          </ul>
          {error && (
            <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>

        <div className="border-t border-ink-100 px-5 py-4">
          <div className="mb-3 flex justify-center gap-1.5" aria-hidden>
            {PASOS.map((_, i) => (
              <span
                key={i}
                className={cn("h-1.5 rounded-full transition-all", i === paso ? "w-5 bg-brand-600" : "w-1.5 bg-ink-200")}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {!yaCompletado && !esUltimo && (
              <button onClick={saltar} className="mr-auto text-xs font-medium text-ink-500 hover:text-ink-800">
                Saltar por ahora
              </button>
            )}
            {(yaCompletado || esUltimo) && <span className="mr-auto" />}
            {paso > 0 && (
              <Button variant="secondary" onClick={() => setPaso((p) => p - 1)} disabled={guardando}>
                Anterior
              </Button>
            )}
            {!esUltimo ? (
              <Button onClick={() => setPaso((p) => p + 1)}>Siguiente</Button>
            ) : (
              <Button onClick={() => void terminar()} disabled={guardando}>
                {guardando ? (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                ) : (
                  <Check className="h-4 w-4" strokeWidth={2.5} />
                )}
                {yaCompletado ? "Cerrar" : "Tutorial completado"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
