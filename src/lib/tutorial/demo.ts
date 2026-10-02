/**
 * Demo del tutorial: una presentación SIMULADA (no toca la base de datos) que
 * llena sola los formularios de ejemplo mientras explica cada paso. Todo el
 * estado de la animación sale de un contador de «tics» (`estadoEnTic`), así es
 * una función pura y fácil de probar.
 */

export interface CampoDemo {
  etiqueta: string;
  valor: string;
  /** Lo que se explica mientras se llena este campo. */
  nota?: string;
}

export interface PasoDemo {
  id: string;
  titulo: string;
  /** Pantalla del panel que se simula (migas de pan). */
  pantalla: string;
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
    pantalla: "Panel › Equipo de trabajo",
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
    pantalla: "Panel › Menú digital",
    intro: "Las categorías ordenan tu menú: bebidas, platos fuertes, postres…",
    campos: [{ etiqueta: "Categoría", valor: "Bebidas", nota: "Escribe el nombre y toca «Agregar»." }],
    boton: "Agregar",
    resultado: { titulo: "Bebidas", detalle: "Categoría · 0 productos" },
    explicacionFinal: "Categoría creada. Ahora le ponemos productos.",
  },
  {
    id: "producto",
    titulo: "Crea un producto",
    pantalla: "Panel › Menú digital › Nuevo producto",
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
    pantalla: "Panel › Mesas / Layout › Nueva mesa",
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
    id: "cobro",
    titulo: "Cobra una cuenta",
    pantalla: "POS › Mesa 1 › Cobrar",
    intro: "Así cobra el cajero: elige la forma de pago y confirma.",
    campos: [
      { etiqueta: "Cuenta", valor: "2 × Coca-Cola · L 60.00" },
      { etiqueta: "Forma de pago", valor: "Efectivo", nota: "El cajero solo ve las formas de pago que activaste." },
      { etiqueta: "Recibido", valor: "100", nota: "El sistema calcula el cambio por ti." },
    ],
    boton: "Cobrar",
    resultado: { titulo: "Cobro registrado", detalle: "Cambio L 40.00 · recibo listo para imprimir" },
    explicacionFinal: "¡Eso es todo! Tu negocio ya sabe vender. Esto fue solo una demo: nada se guardó.",
  },
];

/** Tics de pausa antes de empezar a escribir cada campo. */
export const PAUSA_CAMPO = 8;
/** Tics que dura el «clic» en el botón. */
export const TICS_CLIC = 10;
/** Tics que se queda el resultado en pantalla antes de pasar solo al siguiente paso. */
export const TICS_RESULTADO = 45;

export type FaseDemo = "llenando" | "clic" | "resultado";

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
}

/** Duración de la parte de llenado + clic, en tics (sin el resultado). */
export function ticsHastaResultado(paso: PasoDemo): number {
  return paso.campos.reduce((t, c) => t + PAUSA_CAMPO + c.valor.length, 0) + TICS_CLIC;
}

export function estadoEnTic(paso: PasoDemo, tic: number): EstadoDemo {
  const escritos = paso.campos.map(() => 0);
  let resto = tic;
  for (let i = 0; i < paso.campos.length; i++) {
    const campo = paso.campos[i];
    if (resto < PAUSA_CAMPO + campo.valor.length) {
      escritos[i] = Math.max(0, resto - PAUSA_CAMPO);
      return {
        fase: "llenando",
        campo: i,
        escritos,
        explicacion: campo.nota ?? (i === 0 ? paso.intro : `Llenamos «${campo.etiqueta}».`),
        terminado: false,
      };
    }
    escritos[i] = campo.valor.length;
    resto -= PAUSA_CAMPO + campo.valor.length;
  }
  const ultimo = paso.campos.length - 1;
  if (resto < TICS_CLIC) {
    return { fase: "clic", campo: ultimo, escritos, explicacion: `Y tocamos «${paso.boton}».`, terminado: false };
  }
  return {
    fase: "resultado",
    campo: ultimo,
    escritos,
    explicacion: paso.explicacionFinal,
    terminado: resto - TICS_CLIC >= TICS_RESULTADO,
  };
}
