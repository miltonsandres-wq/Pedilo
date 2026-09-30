// Prueba de humo del agente SIN impresora: levanta una impresora TCP falsa, arranca
// index.js contra ella y verifica los bytes ESC/POS (tildes en PC858, logo, corte,
// línea de 48 columnas, CORS). Uso: npm install && npm run smoke
import net from "node:net";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PNG } = require("pngjs");

// Impresora falsa: recibe los bytes ESC/POS y los junta
const recibido = [];
const impresora = net.createServer((sock) => {
  sock.on("data", (d) => recibido.push(d));
  sock.on("error", () => {});
});
await new Promise((r) => impresora.listen(0, "127.0.0.1", r));
const puertoImpresora = impresora.address().port;

const agente = spawn(process.execPath, ["index.js"], {
  env: { ...process.env, IMPRESORA_IP: "127.0.0.1", IMPRESORA_PUERTO: String(puertoImpresora), PRINT_AGENT_PORT: "4517" },
  stdio: ["ignore", "inherit", "inherit"],
});
for (let i=0;i<60;i++){ try { const r = await fetch("http://127.0.0.1:4517/salud"); if (r.ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }

// Logo 32x16 mitad negro / mitad blanco
const png = new PNG({ width: 32, height: 16 });
for (let y = 0; y < 16; y++)
  for (let x = 0; x < 32; x++) {
    const i = (32 * y + x) << 2;
    const v = x < 16 ? 0 : 255;
    png.data[i] = png.data[i + 1] = png.data[i + 2] = v;
    png.data[i + 3] = 255;
  }
const logoPngBase64 = PNG.sync.write(png).toString("base64");

const instrucciones = [
  { op: "logo" },
  { op: "texto", texto: "Taquería Doña Rosa", align: "center", bold: true, size: "doble" },
  { op: "texto", texto: "La factura es beneficio de todos, ¡exíjala!", align: "center" },
  { op: "linea" },
  { op: "salto", n: 2 },
  { op: "cortar" },
];

let fallos = 0;
const ok = (cond, msg) => {
  console.log((cond ? "OK   " : "FALLA") + " " + msg);
  if (!cond) fallos++;
};

// preflight CORS
const pre = await fetch("http://127.0.0.1:4517/imprimir", { method: "OPTIONS" });
ok(pre.status === 204 && pre.headers.get("access-control-allow-origin") === "*", "preflight CORS responde 204 con Allow-Origin");

const res = await fetch("http://127.0.0.1:4517/imprimir", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ instrucciones, logoPngBase64 }),
});
ok(res.ok && (await res.json()).ok === true, "POST /imprimir responde ok");
await new Promise((r) => setTimeout(r, 500));

const bytes = Buffer.concat(recibido);
console.log("bytes recibidos:", bytes.length);
// PC858: í=0xA1, ñ=0xA4, ¡=0xAD ; ÓCR: comprobamos que NO salió UTF-8 (0xC3)
ok(bytes.includes(Buffer.from("Taquer")), "texto plano presente");
ok(bytes.includes(Buffer.from([0x54, 0x61, 0x71, 0x75, 0x65, 0x72, 0xa1, 0x61])), "«í» codificada en PC858 (0xA1), no UTF-8");
ok(bytes.includes(Buffer.from([0x44, 0x6f, 0xa4, 0x61])), "«ñ» codificada en PC858 (0xA4)");
ok(bytes.includes(Buffer.from([0xad])), "«¡» codificada en PC858 (0xAD)");
ok(!bytes.includes(Buffer.from([0xc3, 0xad])), "no hay UTF-8 multibyte crudo");
ok(bytes.includes(Buffer.from([0x1d, 0x76, 0x30])) || bytes.includes(Buffer.from([0x1d, 0x28, 0x4c])) || bytes.includes(Buffer.from([0x1b, 0x2a])), "hay comando de imagen raster (logo)");
ok(bytes.includes(Buffer.from([0x1d, 0x56])), "hay comando de corte (GS V)");
ok(bytes.includes(Buffer.from("-".repeat(48))), "la línea divisoria ocupa 48 columnas");

// Sin logo el ticket sale igual
recibido.length = 0;
const res2 = await fetch("http://127.0.0.1:4517/imprimir", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ instrucciones, logoPngBase64: null }),
});
ok(res2.ok, "sin logo también imprime");

// Validación de entrada
const res3 = await fetch("http://127.0.0.1:4517/imprimir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
ok(res3.status === 400, "sin instrucciones => 400");

// La comanda de cocina sigue funcionando igual
recibido.length = 0;
const res4 = await fetch("http://127.0.0.1:4517/comanda", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ordenId: "x", mesa: "Mesa 1", sucursalId: "s", creadaEn: new Date().toISOString(), numeroDia: 3, items: [{ nombre: "Tacos", cantidad: 2, nota: null }] }),
});
ok(res4.ok, "POST /comanda sigue funcionando");

agente.kill();
impresora.close();
console.log(fallos ? `\n${fallos} verificación(es) fallaron` : "\nTODO OK");
process.exit(fallos ? 1 : 0);
