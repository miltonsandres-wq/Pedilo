/**
 * Pasos del recorrido guiado de bienvenida. Cada paso lleva a una pantalla
 * real del panel, SEÑALA en pantalla lo que hay que tocar (menú lateral, botón
 * para abrir el formulario, el formulario mismo), da un ejemplo y detecta solo
 * cuándo el dueño lo hizo (contando lo que existe en su negocio) para pasar
 * al siguiente paso sin que tenga que volver a abrir nada.
 *
 * Los selectores son valores de `data-tour` que viven en la interfaz real.
 */

export interface ProgresoTutorial {
  personal: number; // cajeros + meseros
  categorias: number;
  productos: number;
  mesas: number;
  inventarioCategorias: number;
  inventarioItems: number;
  ordenes: number;
}

export const PROGRESO_VACIO: ProgresoTutorial = {
  personal: 0,
  categorias: 0,
  productos: 0,
  mesas: 0,
  inventarioCategorias: 0,
  inventarioItems: 0,
  ordenes: 0,
};

export interface PasoGuia {
  id: string;
  titulo: string;
  /** Pantalla donde se hace. Si se define, primero se señala su enlace del menú. */
  ruta?: string;
  /** Enlace del menú lateral (data-tour = nav-<nav>) que lleva a `ruta`. */
  nav?: string;
  rutaEtiqueta: string;
  /** Botón que abre el formulario (data-tour). Se señala hasta que el formulario aparece. */
  abrir?: string;
  abrirEtiqueta?: string;
  /** Formulario donde se hace el paso (data-tour): se señala mientras se llena. */
  form?: string;
  /** Elemento a señalar en pasos informativos sin formulario (data-tour). */
  destacar?: string;
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
    nav: "sucursales",
    rutaEtiqueta: "Sucursales",
    abrir: "abrir-personal",
    abrirEtiqueta: "Agregar cajero o mesero",
    form: "form-personal",
    instrucciones: [
      "Llena el ejemplo y toca «Agregar».",
      "La persona recibe una contraseña temporal para entrar al POS.",
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
    nav: "menu",
    rutaEtiqueta: "Menú digital",
    form: "form-categoria",
    instrucciones: [
      "Escribe el nombre y toca «Agregar».",
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
    nav: "menu",
    rutaEtiqueta: "Menú digital",
    abrir: "abrir-producto",
    abrirEtiqueta: "Nuevo producto",
    form: "form-producto",
    instrucciones: [
      "Llena el ejemplo. En «Aplica en» marca tu sucursal para que aparezca en el POS.",
      "Toca «Crear producto». El precio incluye ISV; alcohol y tabaco llevan 18 %.",
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
    nav: "mesas",
    rutaEtiqueta: "Mesas / Layout",
    abrir: "abrir-mesa",
    abrirEtiqueta: "Nueva mesa",
    form: "form-mesa",
    instrucciones: [
      "Llena el ejemplo y toca «Agregar».",
      "Después puedes arrastrar la mesa en el plano. Cada mesa tiene su QR para la carta digital.",
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
    nav: "formas-pago",
    rutaEtiqueta: "Formas de pago",
    form: "form-pagos",
    instrucciones: [
      "Marca las formas de pago que aceptas en cada sucursal (efectivo ya viene activo) y toca «Guardar».",
      "El cajero solo verá estas opciones al cobrar.",
    ],
    hecho: null,
  },
  {
    id: "inv-categoria",
    titulo: "Inventario: crea una categoría",
    ruta: "/admin/inventario",
    nav: "inventario",
    rutaEtiqueta: "Inventario",
    form: "form-inv-categoria",
    instrucciones: [
      "El inventario controla botellas, alimentos e insumos. Empieza con una categoría y toca «Agregar».",
    ],
    ejemplo: [{ etiqueta: "Categoría", valor: "Botellas" }],
    hecho: (p) => p.inventarioCategorias >= 1,
    textoHecho: "Categoría de inventario creada.",
  },
  {
    id: "inv-item",
    titulo: "Inventario: crea un artículo",
    ruta: "/admin/inventario",
    nav: "inventario",
    rutaEtiqueta: "Inventario",
    abrir: "abrir-item",
    abrirEtiqueta: "Nuevo artículo",
    form: "form-item",
    instrucciones: [
      "Llena el ejemplo y anota cuántas unidades hay por sucursal.",
      "Si bajan del mínimo verás la alerta «stock bajo».",
    ],
    ejemplo: [
      { etiqueta: "Nombre", valor: "Ron 750 ml" },
      { etiqueta: "Categoría", valor: "Botellas" },
      { etiqueta: "Unidad", valor: "botella" },
      { etiqueta: "Stock mínimo", valor: "2" },
    ],
    hecho: (p) => p.inventarioItems >= 1,
    textoHecho: "Artículo de inventario creado.",
  },
  {
    id: "pos",
    titulo: "Haz una venta de prueba",
    rutaEtiqueta: "el POS",
    destacar: "ir-pos",
    instrucciones: [
      "Toca «Ir al POS» (resaltado) y entra con el usuario Cajero que creaste para abrir «Mesa 1».",
      "El mesero agrega la Coca-Cola y toca «Enviar a cocina»; después el cajero toca «Cobrar».",
      "Regresa al panel: detectamos tu primera orden. Si prefieres hacerlo después, salta este paso.",
    ],
    ejemplo: [{ etiqueta: "Cliente", valor: "Cliente de prueba" }],
    hecho: (p) => p.ordenes >= 1,
    textoHecho: "¡Ya hiciste tu primera orden!",
  },
  {
    id: "cocina",
    titulo: "Conoce la pantalla de cocina",
    rutaEtiqueta: "Pantalla de cocina",
    destacar: "nav-cocina",
    instrucciones: [
      "Muestra en vivo las órdenes que envían los meseros; cocina toca «Listo» y la orden desaparece.",
      "Ábrela en una tablet o TV dentro de la cocina (opción resaltada en el menú).",
    ],
    hecho: null,
  },
  {
    id: "fiscal",
    titulo: "Facturación fiscal (opcional)",
    ruta: "/admin/fiscal",
    nav: "fiscal",
    rutaEtiqueta: "Facturación fiscal",
    instrucciones: [
      "Si facturas con CAI del SAR: completa el emisor, crea una caja y carga tu rango autorizado.",
      "Si todavía no tienes CAI, sigue adelante: puedes hacerlo cuando quieras.",
    ],
    hecho: null,
  },
  {
    id: "reportes",
    titulo: "Reportes y cierre del día",
    ruta: "/admin/reportes",
    nav: "reportes",
    rutaEtiqueta: "Reportes",
    instrucciones: [
      "Aquí ves el cierre diario por forma de pago y tus productos más vendidos.",
      "En «Resumen» tienes lo cobrado hoy. ¡Listo! Ya conoces Pedilo: toca «Tutorial completado».",
    ],
    hecho: null,
  },
];

export type FaseGuia = "ir" | "abrir" | "llenar" | "info" | "hecho";

/**
 * En qué punto del paso está el dueño y qué elemento de la pantalla hay que
 * señalar. Es una función pura: la interfaz le dice si ciertos elementos ya
 * existen (`existe`) y ella decide:
 *  - hecho:  ya lo creó (detectado por conteos)     -> se avanza solo
 *  - ir:     no está en la pantalla del paso        -> señala su enlace del menú
 *  - abrir:  falta abrir el formulario              -> señala el botón que lo abre
 *  - llenar: está el formulario y falta crear algo  -> señala el formulario
 *  - info:   paso informativo                       -> señala `destacar` (si hay)
 */
export function calcularFase(
  paso: PasoGuia,
  progreso: ProgresoTutorial,
  pathname: string | null,
  existe: (selector: string) => boolean
): { fase: FaseGuia; selector: string | null } {
  if (paso.hecho && paso.hecho(progreso)) return { fase: "hecho", selector: null };

  const enRuta = !paso.ruta || pathname === paso.ruta || !!pathname?.startsWith(paso.ruta + "/");
  if (!enRuta) return { fase: "ir", selector: `[data-tour="nav-${paso.nav}"]` };

  if (paso.abrir && paso.form && !existe(`[data-tour="${paso.form}"]`)) {
    return { fase: "abrir", selector: `[data-tour="${paso.abrir}"]` };
  }

  const destino = paso.form ?? paso.destacar;
  return { fase: paso.hecho ? "llenar" : "info", selector: destino ? `[data-tour="${destino}"]` : null };
}
