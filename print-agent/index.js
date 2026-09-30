// Servicio agente de impresión — corre DENTRO de la sucursal (misma red que
// la impresora térmica). Recibe trabajos por HTTP desde la app del POS y los
// traduce a comandos ESC/POS sobre la IP de la impresora.
//
// Esta es la ÚNICA pieza que sabe de ESC/POS: si mañana cambian de marca de
// impresora, o de protocolo (USB, Bluetooth, un servicio en la nube), solo
// se toca este archivo — el resto del sistema le sigue hablando por HTTP.
//
// Endpoints:
//   POST /comanda   comanda de cocina (formato fijo, ver imprimirComanda)
//   POST /imprimir  factura / nota de crédito / pre-cuenta: la APP manda las
//                   líneas ya armadas para 48 columnas y este agente solo las
//                   ejecuta (así cambiar el formato no exige actualizar el agente)
import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ThermalPrinter, PrinterTypes, CharacterSet } from "node-thermal-printer";

const PUERTO = process.env.PRINT_AGENT_PORT || 4000;
const IMPRESORA_IP = process.env.IMPRESORA_IP; // ej. 192.168.1.50
const IMPRESORA_PUERTO = process.env.IMPRESORA_PUERTO || 9100;

if (!IMPRESORA_IP) {
  console.error("Falta IMPRESORA_IP en el entorno (.env de este servicio).");
  process.exit(1);
}

const app = express();
// El logo viaja en base64 dentro del trabajo
app.use(express.json({ limit: "2mb" }));

// La app llama al agente desde el navegador de la caja (otro origen), así que
// el navegador manda un preflight OPTIONS antes del POST.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.post("/comanda", async (req, res) => {
  const comanda = req.body;

  if (!comanda?.items?.length) {
    return res.status(400).json({ ok: false, error: "comanda sin items" });
  }

  try {
    await imprimirComanda(comanda);
    res.json({ ok: true });
  } catch (err) {
    console.error("Error imprimiendo:", err);
    res.status(502).json({ ok: false, error: String(err?.message ?? err) });
  }
});

app.post("/imprimir", async (req, res) => {
  const { instrucciones, logoPngBase64 } = req.body ?? {};

  if (!Array.isArray(instrucciones) || instrucciones.length === 0) {
    return res.status(400).json({ ok: false, error: "trabajo sin instrucciones" });
  }

  try {
    await imprimirInstrucciones(instrucciones, logoPngBase64);
    res.json({ ok: true });
  } catch (err) {
    console.error("Error imprimiendo documento:", err);
    res.status(502).json({ ok: false, error: String(err?.message ?? err) });
  }
});

app.get("/salud", (_req, res) => res.json({ ok: true }));

function crearImpresora() {
  return new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: `tcp://${IMPRESORA_IP}:${IMPRESORA_PUERTO}`,
    timeout: 5000,
    width: 48, // columnas de un rollo de 80 mm
    // Página de códigos con tildes, ñ, ¡ y ¿ (las facturas las llevan)
    characterSet: CharacterSet.PC858_EURO,
    removeSpecialCharacters: false,
  });
}

async function conectar() {
  const printer = crearImpresora();
  const conectada = await printer.isPrinterConnected();
  if (!conectada) throw new Error("No se pudo conectar a la impresora");
  return printer;
}

async function imprimirComanda(comanda) {
  const printer = await conectar();

  printer.alignCenter();
  printer.setTextDoubleHeight();
  printer.println(comanda.numeroDia != null ? `COMANDA #${comanda.numeroDia}` : "COMANDA");
  printer.setTextNormal();
  printer.println(`Mesa: ${comanda.mesa}`);
  printer.println(new Date(comanda.creadaEn).toLocaleString("es-HN"));
  printer.drawLine();
  printer.alignLeft();

  for (const item of comanda.items) {
    printer.println(`${item.cantidad}x ${item.nombre}`);
    if (item.nota) printer.println(`  * ${item.nota}`);
  }

  printer.drawLine();
  printer.cut();

  await printer.execute();
}

/** Guarda el logo (PNG blanco/negro que preparó la app) en un archivo temporal reutilizable. */
function archivoLogo(logoPngBase64) {
  if (!logoPngBase64) return null;
  const buffer = Buffer.from(logoPngBase64, "base64");
  const huella = crypto.createHash("sha1").update(buffer).digest("hex");
  const ruta = path.join(os.tmpdir(), `pedilo-logo-${huella}.png`);
  if (!fs.existsSync(ruta)) fs.writeFileSync(ruta, buffer);
  return ruta;
}

async function imprimirInstrucciones(instrucciones, logoPngBase64) {
  const printer = await conectar();
  const rutaLogo = archivoLogo(logoPngBase64);

  for (const ins of instrucciones) {
    switch (ins.op) {
      case "texto": {
        if (ins.align === "center") printer.alignCenter();
        else if (ins.align === "right") printer.alignRight();
        else printer.alignLeft();
        if (ins.size === "doble") printer.setTextQuadArea();
        else printer.setTextNormal();
        printer.bold(!!ins.bold);
        printer.println(String(ins.texto ?? ""));
        // Deja todo en estado normal para la línea siguiente
        printer.bold(false);
        printer.setTextNormal();
        printer.alignLeft();
        break;
      }
      case "linea":
        printer.drawLine();
        break;
      case "salto":
        for (let i = 0; i < (ins.n ?? 1); i++) printer.newLine();
        break;
      case "logo":
        // Sin logo configurado (o si falla la imagen) el ticket sale igual
        if (rutaLogo) {
          try {
            printer.alignCenter();
            await printer.printImage(rutaLogo);
            printer.alignLeft();
          } catch (err) {
            console.warn("No se pudo imprimir el logo:", err?.message ?? err);
          }
        }
        break;
      case "cortar":
        printer.cut();
        break;
      default:
        console.warn("Instrucción desconocida ignorada:", ins.op);
    }
  }

  await printer.execute();
}

app.listen(PUERTO, () => {
  console.log(`print-agent escuchando en :${PUERTO} -> impresora ${IMPRESORA_IP}:${IMPRESORA_PUERTO}`);
});
