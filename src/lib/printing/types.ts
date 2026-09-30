export interface ComandaItem {
  ordenItemId: string;
  nombre: string;
  cantidad: number;
  nota: string | null;
}

export interface Comanda {
  ordenId: string;
  mesa: string;
  sucursalId: string;
  items: ComandaItem[];
  creadaEn: string;
  // Null si la orden todavía no sincronizó y recibió su número (lo asigna el
  // servidor, ver 0014_numero_orden_diario.sql) — el agente simplemente no
  // imprime la línea en ese caso.
  numeroDia: number | null;
}

export interface ResultadoImpresion {
  ok: boolean;
  error?: string;
}

// --- Impresión de documentos (factura, pre-cuenta) ---------------------------
// El formato lo decide la APP (src/lib/printing/documentoTexto.ts), no el
// agente: la app manda una lista de instrucciones ya armadas para 48 columnas
// y el agente solo las ejecuta. Así cambiar el formato de la factura no exige
// reinstalar el agente en cada sucursal.

export interface InstruccionTexto {
  op: "texto";
  texto: string;
  align?: "left" | "center" | "right";
  bold?: boolean;
  /** "doble" = 2x de ancho y alto (24 columnas por línea en vez de 48). */
  size?: "normal" | "doble";
}

export type Instruccion =
  | InstruccionTexto
  | { op: "linea" }
  | { op: "salto"; n?: number }
  | { op: "logo" }
  | { op: "cortar" };

export interface PeticionImpresion {
  instrucciones: Instruccion[];
  /** PNG en blanco y negro (base64, sin prefijo data:) del logo, si hay. */
  logoPngBase64: string | null;
}
