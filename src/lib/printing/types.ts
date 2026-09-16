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
}

export interface ResultadoImpresion {
  ok: boolean;
  error?: string;
}
