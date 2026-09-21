// Servicio agente de impresión — corre DENTRO de la sucursal (misma red que
// la impresora térmica). Recibe la comanda por HTTP desde la app del POS y
// la traduce a comandos ESC/POS sobre la IP de la impresora.
//
// Esta es la ÚNICA pieza que sabe de ESC/POS: si mañana cambian de marca de
// impresora, o de protocolo (USB, Bluetooth, un servicio en la nube), solo
// se toca este archivo — el resto del sistema le sigue hablando por HTTP con
// el mismo formato de comanda.
import express from "express";
import { ThermalPrinter, PrinterTypes } from "node-thermal-printer";

const PUERTO = process.env.PRINT_AGENT_PORT || 4000;
const IMPRESORA_IP = process.env.IMPRESORA_IP; // ej. 192.168.1.50
const IMPRESORA_PUERTO = process.env.IMPRESORA_PUERTO || 9100;

if (!IMPRESORA_IP) {
  console.error("Falta IMPRESORA_IP en el entorno (.env de este servicio).");
  process.exit(1);
}

const app = express();
app.use(express.json());

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

app.get("/salud", (_req, res) => res.json({ ok: true }));

async function imprimirComanda(comanda) {
  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: `tcp://${IMPRESORA_IP}:${IMPRESORA_PUERTO}`,
    timeout: 5000,
  });

  const conectada = await printer.isPrinterConnected();
  if (!conectada) throw new Error("No se pudo conectar a la impresora");

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

app.listen(PUERTO, () => {
  console.log(`print-agent escuchando en :${PUERTO} -> impresora ${IMPRESORA_IP}:${IMPRESORA_PUERTO}`);
});
