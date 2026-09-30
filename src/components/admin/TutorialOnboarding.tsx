"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Check,
  ChefHat,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  FileText,
  LayoutGrid,
  Loader2,
  Monitor,
  PartyPopper,
  UserPlus,
  Wallet,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { completarTutorial, progresoTutorial } from "@/app/admin/tutorial/actions";
import { PASOS_GUIA, PROGRESO_VACIO, type ProgresoTutorial } from "@/lib/tutorial/pasos";
import { Button } from "@/components/ui/Button";

export const EVENTO_ABRIR_TUTORIAL = "pedilo:abrir-tutorial";
const CLAVE_OMITIDO = "pedilo_tutorial_omitido";
const CLAVE_PASO = "pedilo_tutorial_paso";
const INTERVALO_MS = 4000;

const ICONOS: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  personal: UserPlus,
  categoria: UtensilsCrossed,
  producto: UtensilsCrossed,
  mesas: LayoutGrid,
  pagos: Wallet,
  inventario: Boxes,
  pos: Monitor,
  cocina: ChefHat,
  fiscal: FileText,
  reportes: BarChart3,
};

function leerPaso(): number | null {
  try {
    const v = localStorage.getItem(CLAVE_PASO);
    if (v === null) return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 && n < PASOS_GUIA.length ? n : null;
  } catch {
    return null;
  }
}

function guardarPaso(n: number | null) {
  try {
    if (n === null) localStorage.removeItem(CLAVE_PASO);
    else localStorage.setItem(CLAVE_PASO, String(n));
  } catch {
    /* sin almacenamiento: la guía sigue, solo no recuerda el paso */
  }
}

/**
 * Guía interactiva de bienvenida para negocios nuevos. Un panel flotante
 * acompaña al dueño por las pantallas reales (menú, mesas, inventario…), le da
 * un ejemplo para llenar y detecta solo cuándo lo hizo. «Tutorial completado»
 * (último paso) lo guarda en la base y no vuelve a salir; cerrarlo antes solo
 * lo oculta en esta sesión. «Ver tutorial» lo reabre aunque ya esté completado.
 */
export function TutorialOnboarding({ completado }: { completado: boolean }) {
  const pathname = usePathname();
  const [vista, setVista] = useState<"oculto" | "bienvenida" | "guia">("oculto");
  const [paso, setPaso] = useState(0);
  const [minimizado, setMinimizado] = useState(false);
  const [progreso, setProgreso] = useState<ProgresoTutorial>(PROGRESO_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [yaCompletado, setYaCompletado] = useState(completado);

  useEffect(() => {
    if (!completado) {
      let omitido = false;
      try {
        omitido = sessionStorage.getItem(CLAVE_OMITIDO) === "1";
      } catch {
        /* se muestra igual */
      }
      if (!omitido) {
        const guardado = leerPaso();
        if (guardado === null) {
          setVista("bienvenida");
        } else {
          setPaso(guardado);
          setVista("guia");
        }
      }
    }
    const abrir = () => {
      setPaso(0);
      guardarPaso(0);
      setError(null);
      setMinimizado(false);
      setVista("guia");
    };
    window.addEventListener(EVENTO_ABRIR_TUTORIAL, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_TUTORIAL, abrir);
  }, [completado]);

  const refrescar = useCallback(async () => {
    const p = await progresoTutorial().catch(() => null);
    if (p) setProgreso(p);
  }, []);

  // Detecta lo que el dueño va creando: al abrir, al cambiar de pantalla y cada pocos segundos
  useEffect(() => {
    if (vista !== "guia") return;
    void refrescar();
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") void refrescar();
    }, INTERVALO_MS);
    return () => window.clearInterval(t);
  }, [vista, pathname, refrescar]);

  const omitirEstaSesion = useCallback(() => {
    try {
      sessionStorage.setItem(CLAVE_OMITIDO, "1");
    } catch {
      /* ignorar */
    }
    setVista("oculto");
  }, []);

  function irAPaso(n: number) {
    setPaso(n);
    guardarPaso(n);
    setError(null);
  }

  async function terminar() {
    if (yaCompletado) {
      setVista("oculto");
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
    guardarPaso(null);
    setYaCompletado(true);
    setVista("oculto");
  }

  if (vista === "oculto") return null;

  if (vista === "bienvenida") {
    return (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/60 p-0 sm:items-center sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Bienvenida a Pedilo"
      >
        <div className="w-full max-w-md rounded-t-2xl bg-white p-6 text-center shadow-popover sm:rounded-2xl">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <PartyPopper className="h-7 w-7" strokeWidth={2} />
          </div>
          <h2 className="text-lg font-semibold text-ink-900">¡Bienvenido a Pedilo!</h2>
          <p className="mt-2 text-sm text-ink-600">
            Te guiamos paso a paso por tu panel y dejamos tu negocio listo con un ejemplo real: crearás una
            categoría, un producto, una mesa y harás una venta de prueba. Toma unos 10 minutos.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
            <Button
              size="lg"
              className="flex-1"
              onClick={() => {
                irAPaso(0);
                setVista("guia");
              }}
            >
              Empezar la guía
              <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </Button>
            <Button variant="secondary" size="lg" className="flex-1" onClick={omitirEstaSesion}>
              Más tarde
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const actual = PASOS_GUIA[paso];
  const Icono = ICONOS[actual.id] ?? CircleHelp;
  const esUltimo = paso === PASOS_GUIA.length - 1;
  const detectable = actual.hecho !== null;
  const hecho = detectable ? actual.hecho!(progreso) : false;
  const enPantalla = pathname === actual.ruta || (actual.ruta !== "/admin" && !!pathname?.startsWith(actual.ruta + "/"));

  if (minimizado) {
    return (
      <button
        onClick={() => setMinimizado(false)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-popover hover:bg-brand-700"
        aria-label="Abrir la guía"
      >
        <CircleHelp className="h-4 w-4" strokeWidth={2} />
        Guía · paso {paso + 1}/{PASOS_GUIA.length}
        <ChevronUp className="h-4 w-4" strokeWidth={2} />
      </button>
    );
  }

  return (
    <aside
      className="fixed inset-x-3 bottom-3 z-40 flex max-h-[80vh] flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-popover sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[24rem]"
      aria-label="Guía paso a paso"
    >
      <div className="flex items-center gap-2 bg-ink-950 px-4 py-2.5 text-white">
        <CircleHelp className="h-4 w-4 shrink-0 text-brand-200" strokeWidth={2} />
        <p className="flex-1 text-xs font-medium">
          Guía · paso {paso + 1} de {PASOS_GUIA.length}
        </p>
        <button onClick={() => setMinimizado(true)} aria-label="Minimizar guía" className="rounded p-1 hover:bg-ink-800">
          <ChevronDown className="h-4 w-4" strokeWidth={2} />
        </button>
        <button onClick={omitirEstaSesion} aria-label="Cerrar tutorial" className="rounded p-1 hover:bg-ink-800">
          <X className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
      <div className="h-1 bg-ink-100" aria-hidden>
        <div className="h-full bg-brand-600 transition-all" style={{ width: `${((paso + 1) / PASOS_GUIA.length) * 100}%` }} />
      </div>

      <div className="overflow-y-auto px-4 py-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Icono className="h-5 w-5" strokeWidth={2} />
          </div>
          <h2 className="text-base font-semibold leading-tight text-ink-900">{actual.titulo}</h2>
        </div>

        <ol className="space-y-2">
          {actual.instrucciones.map((t, i) => (
            <li key={t} className="flex gap-2.5 text-sm text-ink-700">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-100 text-[11px] font-semibold text-ink-600">
                {i + 1}
              </span>
              <span>{t}</span>
            </li>
          ))}
        </ol>

        {actual.ejemplo && (
          <div className="mt-3 rounded-xl border border-brand-100 bg-brand-50/60 p-3">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-700">Ejemplo</p>
            <dl className="space-y-1">
              {actual.ejemplo.map((e) => (
                <div key={e.etiqueta} className="flex items-baseline justify-between gap-3 text-sm">
                  <dt className="text-ink-500">{e.etiqueta}</dt>
                  <dd className="font-mono text-xs font-medium text-ink-900">{e.valor}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <div className="mt-3 min-h-9">
          {detectable && hecho && (
            <p role="status" className="flex items-center gap-2 rounded-lg bg-libre-bg px-3 py-2 text-sm font-medium text-libre-text">
              <Check className="h-4 w-4" strokeWidth={2.5} />
              {actual.textoHecho ?? "¡Hecho!"}
            </p>
          )}
          {detectable && !hecho && (
            <p className="flex items-center gap-2 text-xs text-ink-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
              Esperando a que lo hagas… lo detectamos solos.
            </p>
          )}
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2 border-t border-ink-100 px-4 py-3">
        {enPantalla ? (
          <p className="text-center text-xs font-medium text-brand-700">Estás en la pantalla correcta: {actual.rutaEtiqueta}</p>
        ) : (
          <Link
            href={actual.ruta}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white hover:bg-ink-800"
          >
            Ir a {actual.rutaEtiqueta}
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </Link>
        )}
        <div className="flex items-center gap-2">
          {paso > 0 && (
            <Button variant="secondary" size="sm" onClick={() => irAPaso(paso - 1)} disabled={guardando}>
              Anterior
            </Button>
          )}
          <span className="flex-1" />
          {!esUltimo ? (
            <Button
              size="sm"
              variant={!detectable || hecho ? "primary" : "secondary"}
              onClick={() => irAPaso(paso + 1)}
            >
              {!detectable || hecho ? "Siguiente paso" : "Saltar este paso"}
            </Button>
          ) : (
            <Button size="sm" onClick={() => void terminar()} disabled={guardando}>
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
    </aside>
  );
}
