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
