import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export interface ItemMenuExtraido {
  categoria: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
}

const PROMPT_SISTEMA = `Eres un asistente que digitaliza menús de restaurante a partir del texto
crudo de un PDF (a veces mal formateado, con columnas mezcladas o precios pegados al nombre).

Devuelve SOLO un array JSON (sin texto antes ni después, sin \`\`\`) con esta forma exacta:
[{"categoria": string, "nombre": string, "descripcion": string | null, "precio": number}]

Reglas:
- "categoria": el encabezado de sección bajo el que aparece el platillo en el menú (ej. "Entradas",
  "Platos fuertes", "Bebidas"). Si no hay una categoría clara, usa "General".
- "precio": SOLO el número (sin símbolo de moneda), usando punto decimal. Si un platillo tiene
  varios precios (tamaños), usa el primero y menciona los demás en "descripcion".
- Ignora encabezados, pies de página, datos de contacto y cualquier línea que no sea un platillo.
- Si de verdad no se puede extraer nada útil, devuelve [].`;

/**
 * Extrae platillos (categoría, nombre, descripción, precio) de texto de un
 * PDF de menú ya existente, usando Claude. Es un borrador: el admin siempre
 * revisa/edita/descarta filas antes de que algo se guarde en el catálogo
 * (ver /admin/menu/importar).
 */
export async function extraerMenuDeTexto(textoPdf: string): Promise<ItemMenuExtraido[]> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "Falta configurar ANTHROPIC_API_KEY en el servidor para poder usar la importación con IA."
    );
  }

  const client = new Anthropic();

  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 8000,
    system: PROMPT_SISTEMA,
    messages: [
      {
        role: "user",
        content: `Texto extraído del PDF del menú:\n\n${textoPdf.slice(0, 40_000)}`,
      },
    ],
  });

  const bloqueTexto = response.content.find((b) => b.type === "text");
  const crudo = bloqueTexto && bloqueTexto.type === "text" ? bloqueTexto.text : "[]";

  const json = crudo
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "");

  let items: unknown;
  try {
    items = JSON.parse(json);
  } catch {
    throw new Error("La IA no devolvió un JSON válido. Intenta de nuevo.");
  }

  if (!Array.isArray(items)) {
    throw new Error("Respuesta inesperada de la IA.");
  }

  return items
    .filter(
      (i): i is Record<string, unknown> =>
        typeof i === "object" && i !== null && typeof (i as Record<string, unknown>).nombre === "string"
    )
    .map((i) => ({
      categoria: typeof i.categoria === "string" && i.categoria.trim() ? i.categoria.trim() : "General",
      nombre: String(i.nombre).trim(),
      descripcion: typeof i.descripcion === "string" && i.descripcion.trim() ? i.descripcion.trim() : null,
      precio: Number(i.precio) || 0,
    }));
}
