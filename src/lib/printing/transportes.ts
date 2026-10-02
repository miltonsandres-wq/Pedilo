import { aEscPos, bytesABase64 } from "./escpos";
import { ticketAHtml } from "./ticketHtml";
import type { Instruccion, ResultadoImpresion } from "./types";

/**
 * Formas de imprimir SIN el agente de la sucursal, directo desde el navegador.
 *
 *  - navegador : diálogo de impresión del sistema. Sirve con cualquier impresora
 *                ya conectada a la PC (USB/red) o AirPrint en iPhone/iPad. Lo
 *                único que funciona en iOS con Safari.
 *  - bluetooth : Web Bluetooth → térmicas portátiles BLE. Chrome en Android y
 *                en PC. NO existe en iOS (Safari no lo soporta; en iPhone sirve
 *                el navegador «Bluefy»).
 *  - usb       : WebUSB → térmica conectada por USB a la PC o a un Android (Chrome).
 *  - rawbt     : app «RawBT» de Android, que imprime en la térmica Bluetooth
 *                clásica del teléfono.
 *
 * Esto toca hardware y APIs del navegador: no se prueba en vitest; la
 * codificación (escpos.ts / ticketHtml.ts) sí.
 */

export type ModoImpresion = "navegador" | "bluetooth" | "usb" | "rawbt";

export interface CapacidadesImpresion {
  navegador: boolean;
  bluetooth: boolean;
  usb: boolean;
  rawbt: boolean;
}

export function capacidadesImpresion(): CapacidadesImpresion {
  if (typeof navigator === "undefined") return { navegador: false, bluetooth: false, usb: false, rawbt: false };
  const android = /android/i.test(navigator.userAgent);
  return {
    navegador: typeof window !== "undefined" && typeof window.print === "function",
    bluetooth: "bluetooth" in navigator,
    usb: "usb" in navigator,
    rawbt: android,
  };
}

// --- navegador ---------------------------------------------------------------

export function imprimirPorNavegador(instrucciones: Instruccion[], columnas = 48): Promise<ResultadoImpresion> {
  return new Promise((resolve) => {
    try {
      // iframe oculto (no ventana emergente: los bloqueadores la cortarían)
      const marco = document.createElement("iframe");
      marco.setAttribute("aria-hidden", "true");
      Object.assign(marco.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
      document.body.appendChild(marco);
      const doc = marco.contentDocument;
      if (!doc || !marco.contentWindow) {
        marco.remove();
        return resolve({ ok: false, error: "El navegador no permite imprimir desde aquí." });
      }
      doc.open();
      doc.write(ticketAHtml(instrucciones, { columnas }));
      doc.close();
      const limpiar = () => window.setTimeout(() => marco.remove(), 1_000);
      marco.contentWindow.addEventListener("afterprint", limpiar);
      window.setTimeout(() => {
        try {
          marco.contentWindow!.focus();
          marco.contentWindow!.print();
          resolve({ ok: true });
        } catch (e) {
          resolve({ ok: false, error: e instanceof Error ? e.message : "No se pudo abrir la impresión." });
        }
        window.setTimeout(() => marco.remove(), 60_000);
      }, 150);
    } catch (e) {
      resolve({ ok: false, error: e instanceof Error ? e.message : "No se pudo abrir la impresión." });
    }
  });
}

// --- bluetooth (BLE) ---------------------------------------------------------

// Servicios BLE típicos de térmicas portátiles (Goojprt/PeriPage/MUNBYN/Xprinter…)
const SERVICIOS_BLE = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  "0000fff0-0000-1000-8000-00805f9b34fb",
];

type DispositivoBle = { gatt?: { connect(): Promise<ServidorBle>; connected: boolean }; name?: string };
type ServidorBle = { getPrimaryServices(): Promise<{ getCharacteristics(): Promise<CaracteristicaBle[]> }[]>; disconnect(): void };
type CaracteristicaBle = {
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValue(d: BufferSource): Promise<void>;
  writeValueWithoutResponse?(d: BufferSource): Promise<void>;
};

let bleGuardado: { dispositivo: DispositivoBle; caracteristica: CaracteristicaBle } | null = null;

async function conectarBle(): Promise<CaracteristicaBle> {
  if (bleGuardado?.dispositivo.gatt?.connected) return bleGuardado.caracteristica;
  const bt = (navigator as unknown as { bluetooth: { requestDevice(o: unknown): Promise<DispositivoBle> } }).bluetooth;
  const dispositivo = bleGuardado?.dispositivo ?? (await bt.requestDevice({ acceptAllDevices: true, optionalServices: SERVICIOS_BLE }));
  const servidor = await dispositivo.gatt!.connect();
  for (const servicio of await servidor.getPrimaryServices()) {
    for (const c of await servicio.getCharacteristics()) {
      if (c.properties.write || c.properties.writeWithoutResponse) {
        bleGuardado = { dispositivo, caracteristica: c };
        return c;
      }
    }
  }
  servidor.disconnect();
  throw new Error("Ese dispositivo no parece una impresora térmica compatible.");
}

export async function imprimirPorBluetooth(instrucciones: Instruccion[], columnas = 48): Promise<ResultadoImpresion> {
  try {
    const car = await conectarBle();
    const bytes = aEscPos(instrucciones, { columnas });
    const TROZO = 100; // las BLE aceptan paquetes chicos
    for (let i = 0; i < bytes.length; i += TROZO) {
      const parte = bytes.slice(i, i + TROZO);
      if (car.properties.writeWithoutResponse && car.writeValueWithoutResponse) await car.writeValueWithoutResponse(parte);
      else await car.writeValue(parte);
      await new Promise((r) => setTimeout(r, 20));
    }
    return { ok: true };
  } catch (e) {
    bleGuardado = null;
    const msg = e instanceof Error ? e.message : "No se pudo imprimir por Bluetooth.";
    return { ok: false, error: /cancel|chooser/i.test(msg) ? "No elegiste ninguna impresora." : msg };
  }
}

// --- usb ---------------------------------------------------------------------

type DispositivoUsb = {
  opened: boolean;
  configuration: { interfaces: { interfaceNumber: number; alternates: { interfaceClass: number; endpoints: { direction: string; type: string; endpointNumber: number }[] }[] }[] } | null;
  open(): Promise<void>;
  selectConfiguration(n: number): Promise<void>;
  claimInterface(n: number): Promise<void>;
  transferOut(endpoint: number, data: BufferSource): Promise<unknown>;
};

let usbGuardado: { dispositivo: DispositivoUsb; endpoint: number } | null = null;

async function conectarUsb() {
  if (usbGuardado?.dispositivo.opened) return usbGuardado;
  const usb = (navigator as unknown as { usb: { requestDevice(o: unknown): Promise<DispositivoUsb> } }).usb;
  const dispositivo = await usb.requestDevice({ filters: [] });
  await dispositivo.open();
  if (!dispositivo.configuration) await dispositivo.selectConfiguration(1);
  // la interfaz de impresora (clase 7) o, si no, cualquiera con salida bulk
  let elegido: { interfaz: number; endpoint: number } | null = null;
  for (const i of dispositivo.configuration!.interfaces) {
    for (const alt of i.alternates) {
      const salida = alt.endpoints.find((e) => e.direction === "out" && e.type === "bulk");
      if (salida && (alt.interfaceClass === 7 || !elegido)) elegido = { interfaz: i.interfaceNumber, endpoint: salida.endpointNumber };
    }
  }
  if (!elegido) throw new Error("Ese dispositivo USB no tiene una salida de impresión.");
  await dispositivo.claimInterface(elegido.interfaz);
  usbGuardado = { dispositivo, endpoint: elegido.endpoint };
  return usbGuardado;
}

export async function imprimirPorUsb(instrucciones: Instruccion[], columnas = 48): Promise<ResultadoImpresion> {
  try {
    const { dispositivo, endpoint } = await conectarUsb();
    await dispositivo.transferOut(endpoint, aEscPos(instrucciones, { columnas }));
    return { ok: true };
  } catch (e) {
    usbGuardado = null;
    const msg = e instanceof Error ? e.message : "No se pudo imprimir por USB.";
    return {
      ok: false,
      error: /No device selected|cancel/i.test(msg)
        ? "No elegiste ninguna impresora."
        : /access denied|claim/i.test(msg)
          ? "El sistema tiene tomada la impresora (driver). Usa «Imprimir con el navegador» o quita el driver."
          : msg,
    };
  }
}

// --- RawBT (Android) ---------------------------------------------------------

export function imprimirPorRawBt(instrucciones: Instruccion[], columnas = 48): ResultadoImpresion {
  try {
    window.location.href = `rawbt:base64,${bytesABase64(aEscPos(instrucciones, { columnas }))}`;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo abrir RawBT. ¿Está instalada?" };
  }
}

export function imprimirConModo(modo: ModoImpresion, instrucciones: Instruccion[], columnas: number): Promise<ResultadoImpresion> {
  switch (modo) {
    case "navegador":
      return imprimirPorNavegador(instrucciones, columnas);
    case "bluetooth":
      return imprimirPorBluetooth(instrucciones, columnas);
    case "usb":
      return imprimirPorUsb(instrucciones, columnas);
    case "rawbt":
      return Promise.resolve(imprimirPorRawBt(instrucciones, columnas));
  }
}
