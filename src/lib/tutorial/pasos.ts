/**
 * Pasos de la guía interactiva de bienvenida. Cada paso lleva a una pantalla
 * real del panel, explica qué hacer con un EJEMPLO concreto y, cuando se puede,
 * detecta solo que el dueño ya lo hizo (contando lo que existe en su negocio).
 */

export interface ProgresoTutorial {
  personal: number; // cajeros + meseros
  categorias: number;
  productos: number;
  mesas: number;
  inventarioItems: number;
  ordenes: number;
}

export const PROGRESO_VACIO: ProgresoTutorial = {
  personal: 0,
  categorias: 0,
  productos: 0,
  mesas: 0,
  inventarioItems: 0,
  ordenes: 0,
};

export interface PasoGuia {
  id: string;
  titulo: string;
  /** Pantalla donde se hace (ruta del panel, o /pos, /cocina). */
  ruta: string;
  rutaEtiqueta: string;
  /** Qué hacer, en orden. */
  instrucciones: string[];
  /** Valores de ejemplo para copiar. */
  ejemplo?: { etiqueta: string; valor: string }[];
  /** null = paso informativo (no se puede detectar): se avanza con «Siguiente». */
  hecho: ((p: ProgresoTutorial) => boolean) | null;
  textoHecho?: string;
}

export const PASOS_GUIA: PasoGuia[] = [
  {
    id: "personal",
    titulo: "Crea a tu personal",
    ruta: "/admin/sucursales",
    rutaEtiqueta: "Sucursales",
    instrucciones: [
      "En tu sucursal, abre «Agregar cajero o mesero».",
      "Llena el ejemplo y toca «Agregar». La persona recibe una contraseña temporal para entrar al POS.",
    ],
    ejemplo: [
      { etiqueta: "Nombre", valor: "Cajero 1" },
      { etiqueta: "Correo", valor: "cajero1@minegocio.com" },
      { etiqueta: "Rol", valor: "Cajero" },
    ],
    hecho: (p) => p.personal >= 1,
    textoHecho: "Ya tienes personal registrado.",
  },
  {
    id: "categoria",
    titulo: "Crea tu primera categoría",
    ruta: "/admin/menu",
    rutaEtiqueta: "Menú digital",
    instrucciones: [
      "En el cuadro «Categorías», escribe el nombre y toca «Agregar».",
      "Las categorías ordenan tu menú (bebidas, platos fuertes, postres…).",
    ],
    ejemplo: [{ etiqueta: "Categoría", valor: "Bebidas" }],
    hecho: (p) => p.categorias >= 1,
    textoHecho: "Categoría creada.",
  },
  {
    id: "producto",
    titulo: "Crea tu primer producto",
    ruta: "/admin/menu",
    rutaEtiqueta: "Menú digital",
    instrucciones: [
      "Abre «Nuevo producto» (abajo) y llena el ejemplo.",
      "En «Aplica en» marca tu sucursal: así aparece en el POS. Luego toca «Crear producto».",
      "El precio incluye ISV. Las bebidas alcohólicas y el tabaco se marcan con ISV 18 %.",
    ],
    ejemplo: [
      { etiqueta: "Nombre", valor: "Coca-Cola" },
      { etiqueta: "Precio (con ISV incluido)", valor: "30" },
      { etiqueta: "ISV", valor: "15 % (general)" },
      { etiqueta: "Categoría", valor: "Bebidas" },
    ],
    hecho: (p) => p.productos >= 1,
    textoHecho: "Producto creado: ya se puede vender.",
  },
  {
    id: "mesas",
    titulo: "Crea tu primera mesa",
    ruta: "/admin/mesas",
    rutaEtiqueta: "Mesas / Layout",
    instrucciones: [
      "Abre «Nueva mesa», llena el ejemplo y toca «Agregar».",
      "Después arrastra la mesa en el plano para ubicarla como en tu local. Cada mesa tiene su QR para la carta digital.",
    ],
    ejemplo: [
      { etiqueta: "Nombre", valor: "Mesa 1" },
      { etiqueta: "Capacidad", valor: "4" },
      { etiqueta: "Zona", valor: "Salón" },
    ],
    hecho: (p) => p.mesas >= 1,
    textoHecho: "Mesa creada.",
  },
  {
    id: "pagos",
    titulo: "Elige cómo te pagan",
    ruta: "/admin/formas-pago",
    rutaEtiqueta: "Formas de pago",
    instrucciones: [
      "Marca las formas de pago que aceptas en cada sucursal (efectivo ya viene activo) y toca «Guardar».",
      "El cajero solo verá estas opciones al cobrar.",
    ],
    hecho: null,
  },
  {
    id: "inventario",
    titulo: "Empieza tu inventario",
    ruta: "/admin/inventario",
    rutaEtiqueta: "Inventario",
    instrucciones: [
      "Crea una categoría (por ejemplo «Botellas») y luego abre «Nuevo artículo».",
      "Anota cuántas unidades hay por sucursal; si bajan del mínimo verás «stock bajo».",
    ],
    ejemplo: [
      { etiqueta: "Categoría", valor: "Botellas" },
      { etiqueta: "Artículo", valor: "Ron 750 ml" },
      { etiqueta: "Unidad", valor: "botella" },
      { etiqueta: "Stock mínimo", valor: "2" },
    ],
    hecho: (p) => p.inventarioItems >= 1,
    textoHecho: "Artículo de inventario creado.",
  },
  {
    id: "pos",
    titulo: "Haz una venta de prueba",
    ruta: "/pos",
    rutaEtiqueta: "el POS",
    instrucciones: [
      "Entra al POS con el usuario Cajero que creaste (o usa «Ir al POS» para ver el mapa de mesas).",
      "El cajero toca «Mesa 1», anota el nombre del cliente y abre la orden.",
      "El mesero agrega la Coca-Cola y toca «Enviar a cocina». Después el cajero toca «Cobrar».",
      "Regresa al panel cuando termines: detectamos tu primera orden.",
    ],
    ejemplo: [{ etiqueta: "Cliente", valor: "Cliente de prueba" }],
    hecho: (p) => p.ordenes >= 1,
    textoHecho: "¡Ya hiciste tu primera orden!",
  },
  {
    id: "cocina",
    titulo: "Conoce la pantalla de cocina",
    ruta: "/cocina",
    rutaEtiqueta: "Pantalla de cocina",
    instrucciones: [
      "Muestra en vivo las órdenes que envían los meseros. Cocina toca «Listo» y la orden desaparece.",
      "Ábrela en una tablet o TV dentro de la cocina.",
    ],
    hecho: null,
  },
  {
    id: "fiscal",
    titulo: "Facturación fiscal (opcional)",
    ruta: "/admin/fiscal",
    rutaEtiqueta: "Facturación fiscal",
    instrucciones: [
      "Si facturas con CAI del SAR: completa los datos del emisor, crea una caja y carga tu rango autorizado.",
      "Si todavía no tienes CAI, sáltate este paso: puedes hacerlo cuando quieras.",
    ],
    hecho: null,
  },
  {
    id: "reportes",
    titulo: "Reportes y cierre del día",
    ruta: "/admin/reportes",
    rutaEtiqueta: "Reportes",
    instrucciones: [
      "Aquí ves el cierre diario por forma de pago y tus productos más vendidos.",
      "En «Resumen» tienes lo cobrado hoy. ¡Listo! Ya conoces Pedilo: toca «Tutorial completado».",
    ],
    hecho: null,
  },
];
