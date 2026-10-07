"use client";

import { useEffect, useMemo, useState } from "react";
import { Bluetooth, Loader2, Printer, Server, Smartphone, Usb } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/ui";
import { servicioImpresion } from "@/lib/printing/enviarComanda";
import { ANCHO_58MM, ANCHO_80MM } from "@/lib/printing/documentoTexto";
import { capacidadesImpresion, imprimirConModo, type CapacidadesImpresion, type ModoImpresion } from "@/lib/printing/transportes";
import { guardarAnchoPapel, guardarModoPreferido, leerAnchoPapel, leerModoPreferido } from "@/lib/printing/preferencias";
import type { TicketArmado } from "@/lib/fiscal/impresion";

type Modo = ModoImpresion | "agente";

/**
 * Botón de imprimir un ticket. NO muestra vista previa: al presionarlo se manda
 * directo a imprimir, con la impresora de la sucursal (si hay agente) o con la
 * que el dispositivo ya tenga (diálogo de impresión, Bluetooth, USB, RawBT).
 * Las otras formas quedan como opciones secundarias.
 */
export function ImpresionTicket({
  ticket,
  agenteUrl,
  onImpreso,
  etiqueta = "Imprimir",
}: {
  ticket: TicketArmado;
  /** Si la sucursal tiene agente de impresión configurado, se usa como forma principal. */
  agenteUrl?: string | null;
  /** Se llama cuando se mandó a imprimir (por la vía que sea). */
  onImpreso?: () => void;
  /** Texto del botón principal, ej. «Imprimir factura (CAI)». */
  etiqueta?: string;
}) {
  const [columnas, setColumnas] = useState(ANCHO_80MM);
  const [cap, setCap] = useState<CapacidadesImpresion>({ navegador: true, bluetooth: false, usb: false, rawbt: false });
  const [preferido, setPreferido] = useState<ModoImpresion | null>(null);
  const [trabajando, setTrabajando] = useState<Modo | null>(null);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [esIos, setEsIos] = useState(false);

  useEffect(() => {
    setColumnas(leerAnchoPapel());
    setCap(capacidadesImpresion());
    setPreferido(leerModoPreferido());
    setEsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
  }, []);

  const instrucciones = useMemo(() => ticket.construir(columnas), [ticket, columnas]);

  // Forma principal: la impresora de la sucursal; si no hay, la última que usó este dispositivo; si no, el navegador
  const principal: Modo = agenteUrl ? "agente" : preferido && cap[preferido] ? preferido : "navegador";

  async function imprimir(modo: Modo) {
    setMensaje(null);
    setTrabajando(modo);
    const r =
      modo === "agente"
        ? await servicioImpresion.enviarImpresion({ instrucciones: ticket.construir(ANCHO_80MM), logoPngBase64: ticket.logoPngBase64 }, agenteUrl!)
        : await imprimirConModo(modo, instrucciones, columnas, ticket.logoUrl);
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

  const otras: { modo: Modo; etiqueta: string; Icono: typeof Printer; visible: boolean }[] = [
    { modo: "agente", etiqueta: "Impresora de la sucursal", Icono: Server, visible: !!agenteUrl },
    { modo: "navegador", etiqueta: "Impresora del equipo", Icono: Printer, visible: cap.navegador },
    { modo: "bluetooth", etiqueta: "Bluetooth", Icono: Bluetooth, visible: cap.bluetooth },
    { modo: "usb", etiqueta: "USB", Icono: Usb, visible: cap.usb },
    { modo: "rawbt", etiqueta: "RawBT (Android)", Icono: Smartphone, visible: cap.rawbt },
  ];
  const secundarias = otras.filter((o) => o.visible && o.modo !== principal);

  return (
    <div className="text-left">
      <Button type="button" size="lg" className="w-full" disabled={trabajando !== null} onClick={() => void imprimir(principal)}>
        {trabajando === principal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" strokeWidth={2} />}
        {etiqueta}
      </Button>

      {mensaje && (
        <p role="status" className={cn("mt-2 rounded-lg px-3 py-2 text-xs", mensaje.ok ? "bg-libre-bg text-libre-text" : "bg-red-50 text-red-700")}>
          {mensaje.texto}
        </p>
      )}

      {(secundarias.length > 0 || !mensaje?.ok) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-ink-500">
          <span className="font-medium">Papel:</span>
          <div className="flex overflow-hidden rounded-lg border border-ink-200" role="group" aria-label="Ancho del papel">
            {[ANCHO_80MM, ANCHO_58MM].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setColumnas(c);
                  guardarAnchoPapel(c);
                }}
                className={cn("px-2.5 py-1 font-medium", columnas === c ? "bg-ink-900 text-white" : "bg-white text-ink-600 hover:bg-ink-50")}
              >
                {c === ANCHO_80MM ? "80 mm" : "58 mm"}
              </button>
            ))}
          </div>
        </div>
      )}

      {secundarias.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {secundarias.map(({ modo, etiqueta: texto, Icono }) => (
            <Button key={modo} type="button" variant="secondary" size="sm" disabled={trabajando !== null} onClick={() => void imprimir(modo)}>
              {trabajando === modo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icono className="h-3.5 w-3.5" strokeWidth={2} />}
              {texto}
            </Button>
          ))}
        </div>
      )}

      {esIos && !cap.bluetooth && (
        <p className="mt-2 text-[11px] leading-snug text-ink-400">Para una térmica Bluetooth en iPhone/iPad abre Pedilo en el navegador «Bluefy».</p>
      )}
    </div>
  );
}
