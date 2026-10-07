/**
 * Demo del tutorial: una presentación SIMULADA (no toca la base de datos) que
 * recorre el panel del dueño y el POS del cajero como en la app real: el cursor
 * entra al menú, abre la pantalla, llena sola los formularios de ejemplo y
 * explica cada paso. Todo el estado de la animación sale de un contador de
 * «tics» (`estadoEnTic`), así es una función pura y fácil de probar.
 */

export interface CampoDemo {
  etiqueta: string;
  valor: string;
  /** Lo que se explica mientras se llena este campo. */
  nota?: string;
}

export type AppDemo = "admin" | "pos";

/** Menú lateral del panel del dueño (mismos nombres que el real). */
export const MENU_ADMIN = [
  "Resumen",
  "Sucursales",
  "Equipo de trabajo",
  "Menú digital",
  "Inventario",
  "Mesas / Layout",
  "Formas de pago",
  "Delivery",
  "Facturación fiscal",
  "Reportes",
];
/** Pestañas del POS del cajero. */
export const MENU_POS = ["Mesas", "Delivery", "Facturas"];

export interface PasoDemo {
  id: string;
  titulo: string;
  /** Qué pantalla se simula: el panel del dueño (con menú lateral) o el POS del cajero. */
  app: AppDemo;
  /** Opción del menú donde ocurre el paso. */
  item: string;
  /** El cursor entra primero a esa opción del menú (false si sigue en la misma pantalla del paso anterior). */
  navega: boolean;
  intro: string;
  campos: CampoDemo[];
  boton: string;
  /** Lo que aparece al terminar (la fila creada) y su explicación. */
  resultado: { titulo: string; detalle: string };
  explicacionFinal: string;
}

export const PASOS_DEMO: PasoDemo[] = [
  {
    id: "equipo",
    titulo: "Crea a tu equipo",
    app: "admin",
    item: "Equipo de trabajo",
    navega: true,
    intro: "Primero registramos a quienes van a usar el POS: cajeros, meseros y cocina.",
    campos: [
      { etiqueta: "Nombre", valor: "Cajero 1", nota: "El nombre que verás en los reportes." },
      { etiqueta: "Correo", valor: "cajero1@minegocio.com", nota: "Con este correo entra al POS." },
      { etiqueta: "Contraseña", valor: "Cajero2026", nota: "Si la dejas vacía, la generamos por ti." },
      { etiqueta: "Rol", valor: "Cajero", nota: "Cajero cobra, mesero toma pedidos y cocina despacha." },
    ],
    boton: "Agregar",
    resultado: { titulo: "Cajero 1", detalle: "Cajero · cajero1@minegocio.com" },
    explicacionFinal: "Listo: tu cajero ya puede entrar al POS con su usuario desde «Ir al POS».",
  },
  {
    id: "categoria",
    titulo: "Crea una categoría",
    app: "admin",
    item: "Menú digital",
    navega: true,
    intro: "Las categorías ordenan tu menú: bebidas, platos fuertes, postres…",
    campos: [{ etiqueta: "Categoría", valor: "Bebidas", nota: "Escribe el nombre y toca «Agregar»." }],
    boton: "Agregar",
    resultado: { titulo: "Bebidas", detalle: "Categoría · 0 productos" },
    explicacionFinal: "Categoría creada. Ahora le ponemos productos.",
  },
  {
    id: "producto",
    titulo: "Crea un producto",
    app: "admin",
    item: "Menú digital",
    navega: false,
    intro: "Cada producto lleva precio e impuesto, y se asigna a una categoría.",
    campos: [
      { etiqueta: "Nombre", valor: "Coca-Cola" },
      { etiqueta: "Precio (con ISV incluido)", valor: "30", nota: "El precio que paga el cliente ya incluye el ISV." },
      { etiqueta: "ISV", valor: "15 % (general)", nota: "Alcohol y tabaco llevan 18 %." },
      { etiqueta: "Categoría", valor: "Bebidas" },
      { etiqueta: "Aplica en", valor: "Mi sucursal", nota: "Marca tu sucursal para que aparezca en el POS." },
    ],
    boton: "Crear producto",
    resultado: { titulo: "Coca-Cola · L 30.00", detalle: "Bebidas · ISV 15 %" },
    explicacionFinal: "Producto creado: ya se puede vender desde el POS.",
  },
  {
    id: "mesa",
    titulo: "Crea una mesa",
    app: "admin",
    item: "Mesas / Layout",
    navega: true,
    intro: "Las mesas se ven en el plano del POS y cada una tiene su QR para la carta digital.",
    campos: [
      { etiqueta: "Nombre", valor: "Mesa 1" },
      { etiqueta: "Capacidad", valor: "4", nota: "Cuántas personas caben." },
      { etiqueta: "Zona", valor: "Salón", nota: "Sirve para agrupar mesas (terraza, barra…)." },
    ],
    boton: "Agregar",
    resultado: { titulo: "Mesa 1", detalle: "Salón · 4 personas" },
    explicacionFinal: "Mesa creada. Después puedes arrastrarla en el plano.",
  },
  {
    id: "delivery-config",
    titulo: "Activa tu delivery",
    app: "admin",
    item: "Delivery",
    navega: true,
    intro: "Con el delivery tus clientes piden desde tu menú público y tú los recibes en el POS.",
    campos: [
      { etiqueta: "Código del restaurante", valor: "mi-restaurante", nota: "Es la dirección de tu menú público para pedir." },
      { etiqueta: "Pedido mínimo (L)", valor: "100" },
      { etiqueta: "Tiempo estimado de entrega (min)", valor: "40" },
      { etiqueta: "Métodos de pago que aceptas", valor: "Efectivo, Transferencia", nota: "Ahí mismo pones tu cuenta para transferencias y tu horario." },
    ],
    boton: "Guardar configuración",
    resultado: { titulo: "Delivery activo", detalle: "Menú público: /mi-restaurante · mínimo L 100" },
    explicacionFinal: "Delivery configurado. Ahora definimos a dónde entregas y quién lleva los pedidos.",
  },
  {
    id: "delivery-zona",
    titulo: "Zonas de entrega",
    app: "admin",
    item: "Delivery",
    navega: false,
    intro: "Cada zona tiene su tarifa de envío; el cliente la ve antes de pedir.",
    campos: [
      { etiqueta: "Nueva zona", valor: "Col. Trejo" },
      { etiqueta: "Tarifa (L)", valor: "30", nota: "Se suma a la cuenta como servicio de envío." },
    ],
    boton: "Agregar zona",
    resultado: { titulo: "Col. Trejo", detalle: "Tarifa L 30.00 · activa" },
    explicacionFinal: "Zona creada. Puedes agregar todas las que necesites.",
  },
  {
    id: "delivery-repartidor",
    titulo: "Agrega a tu repartidor",
    app: "admin",
    item: "Delivery",
    navega: false,
    intro: "Los repartidores no necesitan correo: entran a su app con un PIN.",
    campos: [
      { etiqueta: "Nuevo repartidor", valor: "Carlos" },
      { etiqueta: "Teléfono", valor: "9999-0000" },
      { etiqueta: "PIN (4 a 6 dígitos)", valor: "1234", nota: "Con este PIN abre su app en el celular y comparte su ubicación mientras trabaja." },
      { etiqueta: "Monto por entrega (L)", valor: "25", nota: "Sirve para la liquidación diaria del repartidor." },
    ],
    boton: "Agregar repartidor",
    resultado: { titulo: "Carlos", detalle: "PIN configurado · L 25.00 por entrega" },
    explicacionFinal: "Repartidor listo. Ahora veamos cómo llega y se despacha un pedido.",
  },
  {
    id: "canal",
    titulo: "Crea un pedido por canal",
    app: "pos",
    item: "Mesas",
    navega: true,
    intro: "Al abrir la mesa eliges de dónde es el pedido en una lista: restaurante, para llevar, delivery o plataforma. Luego sigue el flujo normal.",
    campos: [
      { etiqueta: "¿De dónde es el pedido?", valor: "Plataforma", nota: "Para llevar y plataforma no ocupan la mesa. Delivery te lleva a su propio flujo." },
      { etiqueta: "Plataforma / # de pedido", valor: "PedidosYa #8841", nota: "Queda en el pedido y en el ticket." },
      { etiqueta: "Nombre del cliente", valor: "Carlos" },
    ],
    boton: "Crear pedido",
    resultado: { titulo: "Plataforma #3", detalle: "PedidosYa #8841 · sin mesa" },
    explicacionFinal: "Pedido creado. Se toma y se cobra igual que uno de salón.",
  },
  {
    id: "cobro",
    titulo: "Cobra una cuenta",
    app: "pos",
    item: "Mesas",
    navega: true,
    intro: "Ahora en el POS del cajero. Al cobrar eliges Facturar o Ticket sin factura, y la forma de pago.",
    campos: [
      { etiqueta: "Cuenta", valor: "2 × Coca-Cola · L 60.00" },
      { etiqueta: "Comprobante", valor: "Facturar", nota: "Sin datos del cliente sale «Consumidor Final»; con RTN el nombre es obligatorio." },
      { etiqueta: "Forma de pago", valor: "Efectivo", nota: "El cajero solo ve las formas de pago que activaste." },
      { etiqueta: "Recibido", valor: "100", nota: "El sistema calcula el cambio por ti." },
    ],
    boton: "Cobrar",
    resultado: { titulo: "Cobro registrado", detalle: "Cambio L 40.00 · recibo listo para imprimir" },
    explicacionFinal: "Cobrado. Si facturas con CAI, la factura sale sola.",
  },
  {
    id: "pedido-delivery",
    titulo: "Recibe un pedido de delivery",
    app: "pos",
    item: "Delivery",
    navega: true,
    intro: "Cuando un cliente pide desde tu menú público, el pedido llega aquí con una alerta de sonido.",
    campos: [
      { etiqueta: "Pedido nuevo", valor: "#12 · Col. Trejo · L 180.00", nota: "Ves el detalle, la dirección en el mapa y cómo va a pagar." },
      { etiqueta: "Decisión", valor: "Aceptar", nota: "Puedes aceptar o rechazar. También puedes crear pedidos por teléfono o pausar los pedidos." },
    ],
    boton: "Aceptar pedido",
    resultado: { titulo: "Pedido #12 aceptado", detalle: "Enviado a cocina" },
    explicacionFinal: "Aceptado: cocina lo prepara y el cliente ya ve el avance.",
  },
  {
    id: "despacho",
    titulo: "Despacha con tu repartidor",
    app: "pos",
    item: "Delivery",
    navega: false,
    intro: "Cuando el pedido está listo, lo asignas a un repartidor.",
    campos: [{ etiqueta: "Repartidor", valor: "Carlos", nota: "Al despachar se emite la factura o el comprobante del pedido." }],
    boton: "Despachar",
    resultado: { titulo: "En camino con Carlos", detalle: "El cliente lo sigue en vivo: mapa y hora estimada" },
    explicacionFinal:
      "El cliente recibe un enlace de seguimiento y Carlos ve el pedido en su app. Al final del día liquidas a los repartidores en «Liquidación».",
  },
  {
    id: "externo",
    titulo: "Ticket sin factura",
    app: "pos",
    item: "Mesas",
    navega: false,
    intro: "Si el dueño lo activó y tienes el permiso, al cobrar puedes elegir «Ticket sin factura» en lugar de facturar.",
    campos: [
      { etiqueta: "Comprobante", valor: "Ticket sin factura", nota: "Solo aparece si el dueño lo activa y tu usuario tiene el permiso." },
      { etiqueta: "Forma de pago", valor: "Efectivo" },
    ],
    boton: "Cobrar e imprimir ticket",
    resultado: { titulo: "Ticket sin factura", detalle: "L 60.00 · va aparte en el cierre de caja" },
    explicacionFinal: "En el cierre de caja, lo facturado y lo no facturado salen por separado, método de pago por método.",
  },
  {
    id: "impresion",
    titulo: "Imprime tu ticket",
    app: "pos",
    item: "Mesas",
    navega: false,
    intro: "Antes de imprimir ves una vista previa del ticket, tal como saldrá en el papel.",
    campos: [
      { etiqueta: "Papel", valor: "80 mm", nota: "Sirve también para impresoras de 58 mm." },
      { etiqueta: "Imprimir con", valor: "Navegador", nota: "Sin instalar nada: navegador, Bluetooth, USB o RawBT en el celular." },
    ],
    boton: "Imprimir",
    resultado: { titulo: "Ticket enviado", detalle: "Vista previa lista · papel 80 mm" },
    explicacionFinal: "¡Eso es todo! Tu negocio ya sabe vender. Esto fue solo una demo: nada se guardó.",
  },
];

/** Tics que tarda el cursor en entrar a la opción del menú. */
export const TICS_NAV = 16;
/** Tics de pausa antes de empezar a escribir cada campo. */
export const PAUSA_CAMPO = 8;
/** Tics que dura el «clic» en el botón. */
export const TICS_CLIC = 10;
/** Tics que se queda el resultado en pantalla antes de pasar solo al siguiente paso. */
export const TICS_RESULTADO = 45;

export type FaseDemo = "nav" | "llenando" | "clic" | "resultado";

export interface EstadoDemo {
  fase: FaseDemo;
  /** Campo que se está escribiendo (o el último, si ya terminó). */
  campo: number;
  /** Cuántos caracteres de cada campo están escritos. */
  escritos: number[];
  /** Texto que explica lo que pasa ahora. */
  explicacion: string;
  /** El paso ya terminó y puede pasar al siguiente. */
  terminado: boolean;
  /** 0–1: avance del cursor hacia la opción del menú (solo en la fase «nav»). */
  progresoNav: number;
}

/** Duración de la parte de navegación + llenado + clic, en tics (sin el resultado). */
export function ticsHastaResultado(paso: PasoDemo): number {
  return (paso.navega ? TICS_NAV : 0) + paso.campos.reduce((t, c) => t + PAUSA_CAMPO + c.valor.length, 0) + TICS_CLIC;
}

export function estadoEnTic(paso: PasoDemo, tic: number): EstadoDemo {
  const escritos = paso.campos.map(() => 0);
  let resto = tic;
  if (paso.navega) {
    if (resto < TICS_NAV) {
      return {
        fase: "nav",
        campo: 0,
        escritos,
        explicacion: `Entramos a «${paso.item}» desde el menú. ${paso.intro}`,
        terminado: false,
        progresoNav: resto / TICS_NAV,
      };
    }
    resto -= TICS_NAV;
  }
  for (let i = 0; i < paso.campos.length; i++) {
    const campo = paso.campos[i];
    if (resto < PAUSA_CAMPO + campo.valor.length) {
      escritos[i] = Math.max(0, resto - PAUSA_CAMPO);
      return {
        fase: "llenando",
        campo: i,
        escritos,
        explicacion: campo.nota ?? (i === 0 && !paso.navega ? paso.intro : `Llenamos «${campo.etiqueta}».`),
        terminado: false,
        progresoNav: 1,
      };
    }
    escritos[i] = campo.valor.length;
    resto -= PAUSA_CAMPO + campo.valor.length;
  }
  const ultimo = paso.campos.length - 1;
  if (resto < TICS_CLIC) {
    return { fase: "clic", campo: ultimo, escritos, explicacion: `Y tocamos «${paso.boton}».`, terminado: false, progresoNav: 1 };
  }
  return {
    fase: "resultado",
    campo: ultimo,
    escritos,
    explicacion: paso.explicacionFinal,
    terminado: resto - TICS_CLIC >= TICS_RESULTADO,
    progresoNav: 1,
  };
}
