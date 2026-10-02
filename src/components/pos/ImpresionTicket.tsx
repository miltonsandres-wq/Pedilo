"use client";

import { useEffect, useMemo, useState } from "react";
import { Bluetooth, Loader2, Printer, Server, Smartphone, Usb } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/ui";
import { VistaPreviaTicket } from "./VistaPreviaTicket";
import { servicioImpresion } from "@/lib/printing/enviarComanda";
import { ANCHO_58MM, ANCHO_80MM } from "@/lib/printing/documentoTexto";
import { capacidadesImpresion, imprimirConModo, type CapacidadesImpresion, type ModoImpresion } from "@/lib/printing/transportes";
import { guardarAnchoPapel, guardarModoPreferido, leerAnchoPapel, leerModoPreferido } from "@/lib/printing/preferencias";
import type { TicketArmado } from "@/lib/fiscal/impresion";

/**
 * Vista previa + formas de imprimir un ticket. NO exige configurar nada: sirve
 * con la impresora que la PC ya tenga conectada (diálogo de impresión), con una
 * térmica portátil por Bluetooth o USB, o con el agente de la sucursal si existe.
 */
export function ImpresionTicket({
  ticket,
  agenteUrl,
  onImpreso,
}: {
  ticket: TicketArmado;
  /** Si la sucursal tiene agente de impresión configurado, aparece como una opción más. */
  agenteUrl?: string | null;
  /** Se llama cuando se mandó a imprimir (por la vía que sea). */
  onImpreso?: () => void;
}) {
  const [columnas, setColumnas] = useState(ANCHO_80MM);
  const [cap, setCap] = useState<CapacidadesImpresion>({ navegador: true, bluetooth: false, usb: false, rawbt: false });
  const [preferido, setPreferido] = useState<ModoImpresion | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [esIos, setEsIos] = useState(false);

  useEffect(() => {
    setColumnas(leerAnchoPapel());
    setCap(capacidadesImpresion());
    setPreferido(leerModoPreferido());
    setEsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
  }, []);

  const instrucciones = useMemo(() => ticket.construir(columnas), [ticket, columnas]);

  async function imprimir(modo: ModoImpresion | "agente") {
    setMensaje(null);
    setTrabajando(modo);
    const r =
      modo === "agente"
        ? await servicioImpresion.enviarImpresion({ instrucciones: ticket.construir(ANCHO_80MM), logoPngBase64: ticket.logoPngBase64 }, agenteUrl!)
        : await imprimirConModo(modo, instrucciones, columnas);
    setTrabajando(null);
    if (r.ok) {
      if (modo !== "agente") {
        guardarModoPreferido(modo);
        setPreferido(modo);
      }
      setMensaje({ ok: true, texto: modo === "navegador" ? "Abriendo la impresión del sistema…" : modo === "rawbt" ? "Abriendo RawBT…" : "Enviado a la impresora." });
      onImpreso?.();
    } else {
      setMensaje({ ok: false, texto: r.error ?? "No se pudo imprimir." });
    }
  }

  const boton = (modo: ModoImpresion | "agente", etiqueta: string, Icono: typeof Printer, visible: boolean) =>
    visible ? (
      <Button
        key={modo}
        type="button"
        variant={preferido === modo ? "primary" : "secondary"}
        size="sm"
        disabled={trabajando !== null}
        onClick={() => void imprimir(modo)}
      >
        {trabajando === modo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icono className="h-3.5 w-3.5" strokeWidth={2} />}
        {etiqueta}
      </Button>
    ) : null;

  return (
    <div className="text-left">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-ink-500">Vista previa · {ticket.titulo}</p>
        <div className="flex overflow-hidden rounded-lg border border-ink-200 text-xs" role="group" aria-label="Ancho del papel">
          {[ANCHO_80MM, ANCHO_58MM].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => { setColumnas(c); guardarAnchoPapel(c); }}
              className={cn("px-2.5 py-1 font-medium", columnas === c ? "bg-ink-900 text-white" : "bg-white text-ink-600 hover:bg-ink-50")}
            >
              {c === ANCHO_80MM ? "80 mm" : "58 mm"}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-72 overflow-y-auto rounded-xl">
        <VistaPreviaTicket instrucciones={instrucciones} columnas={columnas} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {boton("navegador", "Imprimir", Printer, cap.navegador)}
        {boton("bluetooth", "Bluetooth", Bluetooth, cap.bluetooth)}
        {boton("usb", "USB", Usb, cap.usb)}
        {boton("rawbt", "RawBT (Android)", Smartphone, cap.rawbt)}
        {boton("agente", "Impresora de la sucursal", Server, !!agenteUrl)}
      </div>

      {mensaje && (
        <p role="status" className={cn("mt-2 rounded-lg px-3 py-2 text-xs", mensaje.ok ? "bg-libre-bg text-libre-text" : "bg-red-50 text-red-700")}>
          {mensaje.texto}
        </p>
      )}
      <p className="mt-2 text-[11px] leading-snug text-ink-400">
        <b>Imprimir</b> usa la impresora que ya tengas conectada (PC, AirPrint en iPhone/iPad o Android).
        {esIos && !cap.bluetooth && " Para una térmica Bluetooth en iPhone/iPad abre Pedilo en el navegador «Bluefy»."}
        {!esIos && !cap.bluetooth && !cap.usb && " Bluetooth y USB directo requieren Chrome o Edge."}
      </p>
    </div>
  );
}
