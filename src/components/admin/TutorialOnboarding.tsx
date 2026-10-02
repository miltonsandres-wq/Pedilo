"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CircleHelp, Loader2, MousePointer2, Pause, PartyPopper, Play, X } from "lucide-react";
import { completarTutorial } from "@/app/admin/tutorial/actions";
import { EVENTO_ABRIR_TUTORIAL } from "@/lib/tutorial/eventos";
import { MENU_ADMIN, MENU_POS, PASOS_DEMO, estadoEnTic } from "@/lib/tutorial/demo";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/ui";

export { EVENTO_ABRIR_TUTORIAL };

const MS_POR_TIC = 70;

// Se recuerda por negocio, solo en esta sesión del navegador, que cerró la demo a medias
const claveOmitido = (tenantId: string) => `pedilo_tutorial_omitido_${tenantId}`;

/**
 * Tutorial de bienvenida para negocios nuevos: una DEMO simulada que llena sola
 * los formularios de ejemplo (equipo, menú, mesas, delivery, cobro e impresión) y va
 * explicando cada paso. No toca la base de datos: todo es una presentación.
 * «No, gracias» (o terminar la demo) lo marca como completado en el negocio y no
 * vuelve a salir; «Ver tutorial» del menú la reabre cuando quieras.
 */
export function TutorialOnboarding({ completado, tenantId }: { completado: boolean; tenantId: string }) {
  const [vista, setVista] = useState<"oculto" | "bienvenida" | "demo">("oculto");
  const [paso, setPaso] = useState(0);
  const [tic, setTic] = useState(0);
  const [reproduciendo, setReproduciendo] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [yaCompletado, setYaCompletado] = useState(completado);

  useEffect(() => {
    if (!completado) {
      let omitido = false;
      try {
        omitido = sessionStorage.getItem(claveOmitido(tenantId)) === "1";
      } catch {
        /* se muestra igual */
      }
      if (!omitido) setVista("bienvenida");
    }
    const abrir = () => {
      setPaso(0);
      setTic(0);
      setReproduciendo(true);
      setError(null);
      setVista("demo");
    };
    window.addEventListener(EVENTO_ABRIR_TUTORIAL, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_TUTORIAL, abrir);
  }, [completado, tenantId]);

  const demo = PASOS_DEMO[paso];
  const estado = estadoEnTic(demo, tic);
  const esUltimo = paso === PASOS_DEMO.length - 1;

  const irAPaso = useCallback((n: number) => {
    setPaso(n);
    setTic(0);
    setError(null);
  }, []);

  // Avanza la animación; al terminar un paso pasa solo al siguiente (el último se queda)
  useEffect(() => {
    if (vista !== "demo" || !reproduciendo) return;
    if (estado.terminado) {
      if (esUltimo) return;
      const t = window.setTimeout(() => irAPaso(paso + 1), MS_POR_TIC);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setTic((n) => n + 1), MS_POR_TIC);
    return () => window.clearTimeout(t);
  }, [vista, reproduciendo, tic, estado.terminado, esUltimo, paso, irAPaso]);

  const cerrarEstaSesion = useCallback(() => {
    try {
      sessionStorage.setItem(claveOmitido(tenantId), "1");
    } catch {
      /* ignorar */
    }
    setVista("oculto");
  }, [tenantId]);

  // Guarda en el negocio que ya no hay que preguntar (una sola vez)
  async function marcarCompletado(): Promise<boolean> {
    if (yaCompletado) return true;
    const r = await completarTutorial().catch(() => ({ ok: false }));
    if (r.ok) setYaCompletado(true);
    return r.ok;
  }

  async function rechazar() {
    setVista("oculto");
    if (!(await marcarCompletado())) cerrarEstaSesion();
  }

  async function terminar() {
    setGuardando(true);
    setError(null);
    const ok = await marcarCompletado();
    setGuardando(false);
    if (!ok) {
      setError("No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.");
      return;
    }
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
            ¿Quieres ver una demo de unos 3 minutos? Te mostramos en vivo cómo se usa Pedilo: el menú del panel, crear tu equipo, menú y mesas, activar el delivery, cobrar e imprimir. Es solo una demostración: no se guarda nada. Puedes verla después desde «Ver tutorial» en el menú.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
            <Button
              size="lg"
              className="flex-1"
              onClick={() => {
                irAPaso(0);
                setReproduciendo(true);
                setVista("demo");
              }}
            >
              Ver demo
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

  const enResultado = estado.fase === "resultado";
  // Mientras el cursor viaja al menú sigue marcada la opción anterior (si es de la misma app)
  const anterior = paso > 0 && PASOS_DEMO[paso - 1].app === demo.app ? PASOS_DEMO[paso - 1].item : (demo.app === "admin" ? MENU_ADMIN[0] : MENU_POS[0]);
  const itemActivo = estado.fase === "nav" && estado.progresoNav < 0.75 ? anterior : demo.item;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/60 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Demo del tutorial"
    >
      <div className="flex max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-popover sm:rounded-2xl">
        {/* Encabezado */}
        <div className="flex items-center gap-2 border-b border-ink-100 bg-brand-50/70 px-4 py-2.5">
          <CircleHelp className="h-4 w-4 shrink-0 text-brand-600" strokeWidth={2} />
          <p className="min-w-0 flex-1 truncate text-xs font-semibold text-brand-800">
            Demo · paso {paso + 1} de {PASOS_DEMO.length} · {demo.titulo}
          </p>
          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-500">
            Simulación
          </span>
          <button onClick={cerrarEstaSesion} aria-label="Cerrar demo" className="rounded p-1 text-ink-500 hover:bg-white">
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        <div className="flex gap-1 px-4 pt-3" aria-hidden>
          {PASOS_DEMO.map((p, i) => (
            <span key={p.id} className={cn("h-1 flex-1 rounded-full", i <= paso ? "bg-brand-600" : "bg-ink-100")} />
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
          {/* Explicación en vivo */}
          <p role="status" aria-live="polite" className="min-h-[3rem] text-sm font-medium text-ink-800" data-testid="explicacion-demo">
            {estado.explicacion}
          </p>

          {/* Pantalla simulada: la app real con su menú, donde el cursor entra y llena */}
          <div className="mt-2 overflow-hidden rounded-xl border border-ink-200 bg-ink-50" data-testid="pantalla-demo">
            {demo.app === "pos" && (
              <div className="relative flex items-center gap-1 border-b border-ink-100 bg-white px-2 py-1.5" data-testid="menu-demo">
                <span className="mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-600 text-[10px] font-bold text-white">P</span>
                {MENU_POS.map((m) => (
                  <span
                    key={m}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-[11px] font-medium",
                      m === itemActivo ? "bg-brand-600 text-white" : "text-ink-500"
                    )}
                    data-activo={m === itemActivo ? "1" : undefined}
                  >
                    {m}
                  </span>
                ))}
                {estado.fase === "nav" && (
                  <MousePointer2
                    className="absolute top-4 h-4 w-4 fill-ink-900 text-white drop-shadow"
                    style={{ left: `${10 + estado.progresoNav * (12 + MENU_POS.indexOf(demo.item) * 26)}%` }}
                    aria-hidden
                  />
                )}
              </div>
            )}

            <div className={cn("grid", demo.app === "admin" && "grid-cols-[6.75rem_1fr] sm:grid-cols-[9.5rem_1fr]")}>
              {demo.app === "admin" && (
                <nav className="relative space-y-0.5 bg-ink-950 p-1.5" aria-hidden data-testid="menu-demo">
                  {MENU_ADMIN.map((m) => (
                    <p
                      key={m}
                      className={cn(
                        "truncate rounded-md px-2 py-1.5 text-[10px] font-medium sm:text-[11px]",
                        m === itemActivo ? "bg-brand-600 text-white" : "text-ink-300"
                      )}
                      data-activo={m === itemActivo ? "1" : undefined}
                    >
                      {m}
                    </p>
                  ))}
                  {estado.fase === "nav" && (
                    <MousePointer2
                      className="absolute left-1/2 h-4 w-4 fill-white text-ink-950 drop-shadow"
                      style={{ top: 6 + estado.progresoNav * (MENU_ADMIN.indexOf(demo.item) * 28 + 8) }}
                      aria-hidden
                    />
                  )}
                </nav>
              )}

              <div className="min-w-0 p-3">
                <p className="mb-2 text-xs font-semibold text-ink-700">{demo.item}</p>
                {estado.fase === "nav" ? (
                  <div className="space-y-2 rounded-lg border border-ink-100 bg-white p-3" aria-hidden>
                    <div className="h-3 w-1/3 rounded bg-ink-100" />
                    <div className="h-8 rounded bg-ink-100" />
                    <div className="h-8 rounded bg-ink-100" />
                  </div>
                ) : (
                  <div className="space-y-2 rounded-lg border border-ink-100 bg-white p-3 shadow-card">
                    {demo.campos.map((c, i) => {
                      const activo = estado.fase === "llenando" && estado.campo === i;
                      const texto = c.valor.slice(0, estado.escritos[i]);
                      return (
                        <div key={c.etiqueta} className="min-w-0">
                          <p className="mb-1 text-xs font-medium text-ink-500">{c.etiqueta}</p>
                          <div
                            className={cn(
                              "min-h-[2.25rem] truncate rounded-lg border bg-white px-3 py-2 text-sm text-ink-900",
                              activo ? "border-brand-500 ring-2 ring-brand-500/20" : "border-ink-200"
                            )}
                            data-testid={`campo-demo-${i}`}
                          >
                            {texto}
                            {activo && <span className="ml-px inline-block h-4 w-px animate-pulse bg-ink-700 align-middle" />}
                          </div>
                        </div>
                      );
                    })}
                    <div className="relative pt-1">
                      <div
                        className={cn(
                          "inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition",
                          estado.fase === "clic" && "scale-95 ring-4 ring-brand-500/40"
                        )}
                        data-testid="boton-demo"
                      >
                        {demo.boton}
                      </div>
                      {(estado.fase === "clic" || enResultado) && (
                        <MousePointer2 className="absolute left-12 top-6 h-5 w-5 fill-ink-900 text-white drop-shadow" aria-hidden />
                      )}
                    </div>
                  </div>
                )}

                {enResultado && (
                  <div
                    className="mt-2 flex items-center gap-2 rounded-lg border border-libre-text/30 bg-white px-3 py-2"
                    data-testid="resultado-demo"
                  >
                    <Check className="h-4 w-4 shrink-0 text-libre-text" strokeWidth={2.5} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink-900">{demo.resultado.titulo}</p>
                      <p className="truncate text-xs text-ink-500">{demo.resultado.detalle}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {error && (
            <p role="alert" className="mt-3 rounded-lg bg-red-50 px-2.5 py-1.5 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>

        {/* Controles */}
        <div className="flex items-center gap-2 border-t border-ink-100 px-4 py-3">
          <button
            type="button"
            onClick={() => setReproduciendo((v) => !v)}
            aria-label={reproduciendo ? "Pausar demo" : "Reproducir demo"}
            className="rounded-lg border border-ink-200 p-2 text-ink-700 hover:bg-ink-50"
          >
            {reproduciendo ? <Pause className="h-4 w-4" strokeWidth={2} /> : <Play className="h-4 w-4" strokeWidth={2} />}
          </button>
          <span className="flex-1" />
          {paso > 0 && (
            <Button variant="secondary" size="sm" type="button" onClick={() => irAPaso(paso - 1)} disabled={guardando}>
              <ArrowLeft className="h-4 w-4" strokeWidth={2} />
              Anterior
            </Button>
          )}
          {!esUltimo ? (
            <Button size="sm" type="button" onClick={() => irAPaso(paso + 1)}>
              Siguiente
              <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </Button>
          ) : (
            <Button size="sm" type="button" onClick={() => void terminar()} disabled={guardando}>
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} /> : <Check className="h-4 w-4" strokeWidth={2.5} />}
              {yaCompletado ? "Cerrar" : "Entendido, empezar"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
