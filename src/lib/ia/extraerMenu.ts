import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { leerJsonDeTexto, normalizarItemsMenu, type ItemMenuExtraido } from "./normalizarMenu";

export type { ItemMenuExtraido };

/** Tipos de archivo que Claude lee directamente (PDF y fotos del menú). */
export type TipoArchivoMenu = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";

const MODELO = "claude-sonnet-5-5";

const PROMPT_SISTEMA = `Eres un asistente que digitaliza menús de restaurante. Recibes el menú como PDF
o como foto (puede ser un diseño con columnas, fotos, escaneado o con precios pegados al nombre).
Lee TODO el menú, de principio a fin, y registra cada platillo o bebida llamando a la herramienta "registrar_menu"
(si no puedes usarla, responde SOLO con el JSON {"items": [...]} sin texto adicional).

Reglas:
- "categoria": el encabezado de sección bajo el que aparece el platillo (ej. "Entradas", "Platos fuertes",
  "Bebidas"). Si no hay una categoría clara, usa "General".
- "nombre": el nombre del platillo tal como aparece, sin el precio.
- "descripcion": ingredientes o detalle si el menú lo trae; si no, null.
- "precio": SOLO el número (sin símbolo de moneda), con punto decimal. Si hay varios precios (tamaños,
  porciones), usa el primero y menciona los demás en "descripcion".
- Ignora encabezados, pies de página, direcciones, teléfonos, redes sociales y cualquier cosa que no sea
  un platillo o bebida. No inventes platillos ni precios.
- Si de verdad no se puede leer ningún platillo, registra una lista vacía.`;

const HERRAMIENTA: Anthropic.Tool = {
  name: "registrar_menu",
  description: "Registra los platillos y bebidas encontrados en el menú.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            categoria: { type: "string" },
            nombre: { type: "string" },
            descripcion: { type: ["string", "null"] },
            precio: { type: "number" },
          },
          required: ["categoria", "nombre", "precio"],
        },
      },
    },
    required: ["items"],
  },
};

/**
 * Lee un menú (PDF o foto) con Claude y devuelve los platillos ya ordenados por
 * categoría. Claude recibe el archivo tal cual, así que funciona también con
 * menús diseñados o escaneados (donde no hay texto que extraer). Es un borrador:
 * el admin lo revisa antes de que algo se guarde (ver /admin/menu/importar).
 */
export async function extraerMenuDeArchivo(datos: Buffer, tipo: TipoArchivoMenu): Promise<ItemMenuExtraido[]> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Falta configurar ANTHROPIC_API_KEY en el servidor (Vercel > Settings > Environment Variables).");
  }

  const base64 = datos.toString("base64");
  const archivo: Anthropic.ContentBlockParam =
    tipo === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : { type: "image", source: { type: "base64", media_type: tipo, data: base64 } };

  const client = new Anthropic({ timeout: 55_000, maxRetries: 1 });
  const response = await client.messages.create({
    model: MODELO,
    max_tokens: 12_000,
    system: PROMPT_SISTEMA,
    tools: [HERRAMIENTA],
    // Este modelo no admite forzar la herramienta (tool_choice «tool»): se le pide por instrucción y, si responde con texto, se lee el JSON
    messages: [{ role: "user", content: [archivo, { type: "text", text: "Digitaliza este menú." }] }],
  });

  const llamada = response.content.find((b) => b.type === "tool_use");
  if (llamada && llamada.type === "tool_use") {
    return normalizarItemsMenu((llamada.input as { items?: unknown }).items);
  }

  // Respondió con texto: se busca el JSON (una lista, o un objeto con «items»)
  const texto = response.content.map((b) => (b.type === "text" ? b.text : "")).join("\n");
  return normalizarItemsMenu(leerJsonDeTexto(texto));
}
