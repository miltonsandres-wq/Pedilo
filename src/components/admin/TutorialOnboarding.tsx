"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Loader2,
  PartyPopper,
  X,
} from "lucide-react";
import { completarTutorial, progresoTutorial } from "@/app/admin/tutorial/actions";
import { EVENTO_ABRIR_MENU, EVENTO_ABRIR_TUTORIAL } from "@/lib/tutorial/eventos";
import { PASOS_GUIA, PROGRESO_VACIO, calcularFase, type FaseGuia, type ProgresoTutorial } from "@/lib/tutorial/pasos";
import { Button } from "@/components/ui/Button";

export { EVENTO_ABRIR_TUTORIAL };

const INTERVALO_PROGRESO_MS = 2500;
const INTERVALO_PANTALLA_MS = 300;
const PAUSA_AL_TERMINAR_PASO_MS = 1800;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface Marca {
  fase: FaseGuia;
  selector: string | null;
  rect: Rect | null;
}

// Todo lo que recuerda el navegador va por negocio: si registras otro negocio
// en el mismo navegador, su tutorial empieza de cero.
const claves = (tenantId: string) => ({
  paso: `pedilo_tutorial_paso_${tenantId}`,
  omitido: `pedilo_tutorial_omitido_${tenantId}`,
});

function leerPaso(tenantId: string): number | null {
  try {
    const v = localStorage.getItem(claves(tenantId).paso);
    if (v === null) return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 && n < PASOS_GUIA.length ? n : null;
  } catch {
    return null;
  }
}

function guardarPaso(tenantId: string, n: number | null) {
  try {
    if (n === null) localStorage.removeItem(claves(tenantId).paso);
    else localStorage.setItem(claves(tenantId).paso, String(n));
  } catch {
    /* sin almacenamiento: la guía sigue, solo no recuerda el paso */
  }
}

/** Primer elemento con ese selector que realmente se ve (el menú existe dos veces: escritorio y cajón móvil). */
function elementoVisible(selector: string): HTMLElement | null {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

const mismaMarca = (a: Marca | null, b: Marca) =>
  !!a &&
  a.fase === b.fase &&
  a.selector === b.selector &&
  a.rect?.top === b.rect?.top &&
  a.rect?.left === b.rect?.left &&
  a.rect?.width === b.rect?.width &&
  a.rect?.height === b.rect?.height;

/**
 * Recorrido guiado de bienvenida para negocios nuevos. Acompaña al dueño por
 * las pantallas reales: RESALTA lo que hay que tocar (el enlace del menú, el
 * botón que abre el formulario, el formulario), da un ejemplo, detecta solo
 * cuándo lo hizo y pasa al siguiente paso sin que tenga que volver a abrir
 * nada. «Tutorial completado» (último paso) lo guarda en la base y no vuelve
 * a salir; cerrarlo antes solo lo oculta en esta sesión. «Ver tutorial» lo
 * reabre aunque ya esté completado.
 */
export function TutorialOnboarding({ completado, tenantId }: { completado: boolean; tenantId: string }) {
  const pathname = usePathname();
  const [vista, setVista] = useState<"oculto" | "bienvenida" | "guia">("oculto");
  const [paso, setPaso] = useState(0);
  const [minimizado, setMinimizado] = useState(false);
  const [progreso, setProgreso] = useState<ProgresoTutorial>(PROGRESO_VACIO);
  const [marca, setMarca] = useState<Marca | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [yaCompletado, setYaCompletado] = useState(completado);
  const menuAbiertoParaPaso = useRef<number | null>(null);
  const ultimoDesplazamiento = useRef<string>("");

  useEffect(() => {
    if (!completado) {
      let omitido = false;
      try {
        omitido = sessionStorage.getItem(claves(tenantId).omitido) === "1";
      } catch {
        /* se muestra igual */
      }
      if (!omitido) {
        const guardado = leerPaso(tenantId);
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
      guardarPaso(tenantId, 0);
      setError(null);
      setMinimizado(false);
      setVista("guia");
    };
    window.addEventListener(EVENTO_ABRIR_TUTORIAL, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_TUTORIAL, abrir);
  }, [completado, tenantId]);

  const refrescarProgreso = useCallback(async () => {
    const p = await progresoTutorial().catch(() => null);
    if (p) setProgreso(p);
  }, []);

  // Detecta lo que el dueño va creando: al abrir, al cambiar de pantalla y cada pocos segundos
  useEffect(() => {
    if (vista !== "guia") return;
    void refrescarProgreso();
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") void refrescarProgreso();
    }, INTERVALO_PROGRESO_MS);
    return () => window.clearInterval(t);
  }, [vista, pathname, refrescarProgreso]);

  // Decide qué señalar y dónde está en pantalla (se repite porque la página cambia sola)
  useEffect(() => {
    if (vista !== "guia" || minimizado) return;
    const evaluar = () => {
      const { fase, selector } = calcularFase(PASOS_GUIA[paso], progreso, pathname, (s) => !!elementoVisible(s));
      let rect: Rect | null = null;
      if (selector) {
        const el = elementoVisible(selector);
        if (el) {
          const r = el.getBoundingClientRect();
          rect = { top: r.top, left: r.left, width: r.width, height: r.height };
        } else if (fase === "ir" && menuAbiertoParaPaso.current !== paso) {
          // En móvil el menú es un cajón cerrado: se abre UNA vez por paso para señalar el enlace
          // (si el dueño lo cierra, no se le vuelve a abrir a la fuerza)
          menuAbiertoParaPaso.current = paso;
          window.dispatchEvent(new Event(EVENTO_ABRIR_MENU));
        }
      }
      const nueva: Marca = { fase, selector, rect };
      setMarca((prev) => (mismaMarca(prev, nueva) ? prev : nueva));
    };
    evaluar();
    const t = window.setInterval(evaluar, INTERVALO_PANTALLA_MS);
    window.addEventListener("resize", evaluar);
    window.addEventListener("scroll", evaluar, true);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("resize", evaluar);
      window.removeEventListener("scroll", evaluar, true);
    };
  }, [vista, minimizado, paso, progreso, pathname]);

  // Si lo señalado queda fuera de la vista (o tapado por el panel), llevarlo a la parte alta
  useEffect(() => {
    if (!marca?.rect || !marca.selector) return;
    const clave = `${paso}|${marca.selector}`;
    if (ultimoDesplazamiento.current === clave) return;
    ultimoDesplazamiento.current = clave;
    const { top, height } = marca.rect;
    if (top < 230 || top + height > window.innerHeight * 0.9) {
      window.scrollTo({ top: Math.max(0, window.scrollY + top - window.innerHeight * 0.32), behavior: "auto" });
    }
  }, [marca, paso]);

  const omitirEstaSesion = useCallback(() => {
    try {
      sessionStorage.setItem(claves(tenantId).omitido, "1");
    } catch {
      /* ignorar */
    }
    setVista("oculto");
  }, [tenantId]);

  // «No, gracias»: se guarda en el negocio y no vuelve a preguntar; «Ver tutorial» del menú lo reabre
  const rechazar = useCallback(async () => {
    setVista("oculto");
    const r = await completarTutorial().catch(() => ({ ok: false }));
    if (!r.ok) omitirEstaSesion();
    else setYaCompletado(true);
  }, [omitirEstaSesion]);

  const irAPaso = useCallback(
    (n: number) => {
      setPaso(n);
      guardarPaso(tenantId, n);
      setError(null);
    },
    [tenantId]
  );

  const esUltimo = paso === PASOS_GUIA.length - 1;
  const fase = marca?.fase;

  // Paso terminado: una pausa breve para ver el ✓ y seguimos solos con el siguiente
  useEffect(() => {
    if (vista !== "guia" || fase !== "hecho" || esUltimo) return;
    const t = window.setTimeout(() => irAPaso(paso + 1), PAUSA_AL_TERMINAR_PASO_MS);
    return () => window.clearTimeout(t);
  }, [vista, fase, esUltimo, paso, irAPaso]);

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
    guardarPaso(tenantId, null);
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
            ¿Quieres ver el tutorial? Es opcional y puedes abrirlo después desde «Ver tutorial» en el menú. Te llevamos de la mano por tu panel: te vamos señalando dónde hacer clic y dejamos tu negocio listo con un
            ejemplo real (personal, una categoría, un producto, una mesa…). Toma unos 10 minutos y avanza solo a medida
            que completas cada paso.
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
              Sí, ver el tutorial
              <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </Button>
            <Button variant="secondary" size="lg" className="flex-1" onClick={() => void rechazar()}>
              No, gracias
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const actual = PASOS_GUIA[paso];
  const detectable = actual.hecho !== null;
  const rect = marca?.rect;
  const hayFoco = !!rect && fase !== "hecho";

  // La guía va como una BARRA en el flujo de la página (pegada arriba al hacer scroll): empuja
  // el contenido en vez de taparlo, así nunca queda encima de un botón o un formulario.
  const contenedor =
    "sticky top-14 z-20 mb-4 max-h-[45vh] overflow-y-auto rounded-xl border border-brand-200 bg-white shadow-card lg:top-2";

  if (minimizado) {
    return (
      <div className={contenedor} data-testid="barra-guia-minimizada">
        <button
          onClick={() => setMinimizado(false)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-brand-700 hover:bg-brand-50"
          aria-label="Abrir la guía"
        >
          <CircleHelp className="h-4 w-4 shrink-0" strokeWidth={2} />
          <span className="min-w-0 flex-1 truncate">
            Guía · paso {paso + 1}/{PASOS_GUIA.length} · {actual.titulo}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0" strokeWidth={2} />
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Solo un marco sobre lo que hay que tocar: no oscurece la pantalla ni bloquea clics */}
      {hayFoco && rect && (
        <div
          aria-hidden
          data-testid="foco-guia"
          data-foco={marca?.selector ?? ""}
          className="pointer-events-none fixed z-[45] rounded-2xl ring-4 ring-brand-500/80"
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      )}

      <aside className={contenedor} aria-label="Guía paso a paso">
        <div className="flex items-center gap-2 border-b border-ink-100 bg-brand-50/70 px-3 py-2">
          <CircleHelp className="h-4 w-4 shrink-0 text-brand-600" strokeWidth={2} />
          <p className="min-w-0 flex-1 truncate text-xs font-semibold text-brand-800">
            Guía · paso {paso + 1} de {PASOS_GUIA.length} · {actual.titulo}
          </p>
          <button onClick={() => setMinimizado(true)} aria-label="Minimizar guía" className="rounded p-1 text-ink-500 hover:bg-white">
            <ChevronUp className="h-4 w-4" strokeWidth={2} />
          </button>
          <button onClick={omitirEstaSesion} aria-label="Cerrar tutorial" className="rounded p-1 text-ink-500 hover:bg-white">
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        <div className="h-0.5 bg-ink-100" aria-hidden>
          <div className="h-full bg-brand-600 transition-all" style={{ width: `${((paso + 1) / PASOS_GUIA.length) * 100}%` }} />
        </div>

        <div className="flex flex-col gap-3 px-3 py-2.5 md:flex-row md:items-center">
          <div className="min-w-0 flex-1">
            {fase === "ir" && (
              <p className="text-sm text-ink-700">
                Haz clic en <b>«{actual.rutaEtiqueta}»</b> en el menú lateral: está resaltado.
              </p>
            )}
            {fase === "abrir" && (
              <p className="text-sm text-ink-700">
                Toca <b>«{actual.abrirEtiqueta}»</b> (resaltado) para abrir el formulario.
              </p>
            )}
            {fase === "hecho" && (
              <p role="status" className="flex items-center gap-2 text-sm font-medium text-libre-text">
                <Check className="h-4 w-4 shrink-0" strokeWidth={2.5} />
                {actual.textoHecho ?? "¡Hecho!"} {!esUltimo && "Pasamos al siguiente paso…"}
              </p>
            )}
            {(fase === "llenar" || fase === "info" || fase === undefined) && (
              <>
                <ol className="space-y-0.5">
                  {actual.instrucciones.map((t, i) => (
                    <li key={t} className="flex gap-2 text-sm text-ink-700">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-ink-100 text-[10px] font-semibold text-ink-600">
                        {i + 1}
                      </span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ol>
                {detectable && fase === "llenar" && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-500">
                    <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
                    Esperando a que lo hagas… lo detectamos solos.
                  </p>
                )}
              </>
            )}
            {error && (
              <p role="alert" className="mt-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-sm text-red-700">
                {error}
              </p>
            )}
          </div>

          {actual.ejemplo && (fase === "llenar" || fase === "info" || fase === undefined) && (
            <dl className="shrink-0 rounded-lg border border-brand-100 bg-brand-50/60 px-2.5 py-1.5 md:w-64">
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">Ejemplo</p>
              {actual.ejemplo.map((e) => (
                <div key={e.etiqueta} className="flex items-baseline justify-between gap-2 text-xs">
                  <dt className="text-ink-500">{e.etiqueta}</dt>
                  <dd className="font-mono font-medium text-ink-900">{e.valor}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="flex shrink-0 items-center gap-2 md:flex-col md:items-stretch">
            {fase === "ir" && actual.ruta && (
              <Link href={actual.ruta} className="text-center text-xs font-medium text-ink-500 underline hover:text-ink-800">
                Llévame a {actual.rutaEtiqueta}
              </Link>
            )}
            <div className="ml-auto flex items-center gap-2">
              {paso > 0 && (
                <Button variant="secondary" size="sm" onClick={() => irAPaso(paso - 1)} disabled={guardando}>
                  Anterior
                </Button>
              )}
              {!esUltimo ? (
                <Button
                  size="sm"
                  variant={fase === "info" || fase === "hecho" ? "primary" : "secondary"}
                  onClick={() => irAPaso(paso + 1)}
                >
                  {fase === "info" || fase === "hecho" ? "Siguiente paso" : "Saltar este paso"}
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
        </div>
      </aside>
    </>
  );
}
