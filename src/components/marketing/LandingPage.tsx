import Link from "next/link";
import {
  WifiOff,
  Clock,
  XCircle,
  Check,
  ArrowRight,
  MessageCircle,
  Printer,
  Receipt,
  LayoutGrid,
} from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { ErrorSlideshow } from "./ErrorSlideshow";
import { HeroPhotoSlideshow } from "./HeroPhotoSlideshow";
import { buttonClass } from "@/lib/ui";
import { linkWhatsapp } from "@/lib/whatsapp";

const PROBLEMAS = [
  {
    icon: XCircle,
    titulo: "Pedidos que se confunden",
    texto: "El mesero apunta a mano, la cocina entiende otra cosa, y el cliente termina con el plato equivocado.",
  },
  {
    icon: Clock,
    titulo: "Horas para cuadrar la caja",
    texto: "Cada noche es sacar cuentas con calculadora y comandas de papel, sin saber si de verdad cuadró.",
  },
  {
    icon: WifiOff,
    titulo: "Se cae el internet, se cae la venta",
    texto: "Los sistemas normales se congelan sin señal — y justo ahí es cuando más lleno está el local.",
  },
];

const CARACTERISTICAS = [
  {
    icon: LayoutGrid,
    eyebrow: "Mesas",
    titulo: "Mapa de mesas en vivo",
    texto: "Ves de un vistazo qué mesa está libre, cuál está ocupada y qué está pidiendo cada una — nada se pierde entre servilletas.",
    mock: <MockMesas />,
  },
  {
    icon: Printer,
    eyebrow: "Cocina",
    titulo: "La comanda llega sola",
    texto: "En cuanto el mesero envía la orden, el ticket sale imprimiéndose directo en cocina. Sin gritos, sin papelitos perdidos.",
    mock: <MockComanda />,
  },
  {
    icon: Receipt,
    eyebrow: "Cierre",
    titulo: "Tu cuadre del día, ya hecho",
    texto: "Al cerrar, Pedilo ya sumó todo: ventas, formas de pago y órdenes. Cerrás la caja en un toque, no en una hora.",
    mock: <MockCierre />,
  },
];

const PLANES = [
  {
    nombre: "1 sucursal",
    precio: "L 900",
    periodo: "/mes",
    destacado: false,
    descripcion: "Para un solo local: mesas, cocina, caja y cierre diario, todo en un panel.",
    cta: { texto: "Registrar mi negocio", href: "/registro" },
  },
  {
    nombre: "2 sucursales",
    precio: "L 1,200",
    periodo: "/mes",
    destacado: true,
    descripcion: "Lo mismo que el plan anterior, para dos locales administrados desde una sola cuenta.",
    cta: { texto: "Registrar mi negocio", href: "/registro" },
  },
  {
    nombre: "Compra única",
    precio: "A la medida",
    periodo: "",
    destacado: false,
    descripcion: "Pagás una sola vez, sin mensualidad. Te armamos el precio según tu negocio.",
    cta: {
      texto: "Cotizar por WhatsApp",
      href: linkWhatsapp("Hola, quiero información sobre la compra única de Pedilo para mi restaurante."),
      externo: true,
    },
  },
];

export function LandingPage() {
  return (
    <div className="bg-white">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-ink-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
              <BrandMark className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-ink-900">Pedilo</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <a href="#precios" className="hidden text-sm font-medium text-ink-600 hover:text-ink-900 sm:block">
              Precios
            </a>
            <Link href="/login" className="text-sm font-medium text-ink-600 hover:text-ink-900">
              Iniciar sesión
            </Link>
            <Link href="/registro" className={buttonClass("primary", "sm")}>
              Regístrate gratis
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-ink-950 text-white">
        <HeroPhotoSlideshow />
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(60rem 40rem at -10% -10%, rgba(244,98,58,0.35), transparent 60%), radial-gradient(50rem 30rem at 110% 10%, rgba(244,98,58,0.2), transparent 60%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-6 py-20 text-center sm:py-28">
          <p className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-brand-300">
            Hecho para restaurantes, fonditas y taquerías catrachas
          </p>
          <h1 className="mx-auto max-w-2xl text-4xl font-semibold leading-tight text-white sm:text-5xl">
            Control total de tu restaurante.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-ink-300">
            Tu mesero toma la orden en segundos, la comanda sale sola a la cocina, y al cerrar sabés
            cuánto vendiste sin sacar cuentas a mano.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/registro" className={`${buttonClass("primary", "lg")} w-full sm:w-auto`}>
              Probalo gratis en tu restaurante
              <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </Link>
            <a href="#precios" className={`${buttonClass("secondary", "lg")} w-full !bg-white/5 !text-white !border-white/15 hover:!bg-white/10 sm:w-auto`}>
              Ver precios
            </a>
          </div>
          <ErrorSlideshow />
        </div>
      </section>

      {/* Problema */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto mb-12 max-w-xl text-center">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-600">
            ¿Te suena familiar?
          </p>
          <h2 className="text-2xl font-semibold text-ink-900 sm:text-3xl">
            Lo que le pasa todos los días a tu restaurante
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {PROBLEMAS.map((p) => (
            <div key={p.titulo} className="rounded-2xl border border-ink-100 bg-ink-50/60 p-6">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-white text-brand-700 shadow-card">
                <p.icon className="h-5 w-5" strokeWidth={2} />
              </div>
              <h3 className="mb-1.5 font-semibold text-ink-900">{p.titulo}</h3>
              <p className="text-sm leading-relaxed text-ink-500">{p.texto}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Características con mockups */}
      <section className="border-t border-ink-100 bg-ink-50/60 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto mb-14 max-w-xl text-center">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-600">
              Cómo lo resuelve Pedilo
            </p>
            <h2 className="text-2xl font-semibold text-ink-900 sm:text-3xl">
              Todo tu restaurante, de la mesa a la caja
            </h2>
          </div>
          <div className="space-y-14">
            {CARACTERISTICAS.map((c, i) => (
              <div
                key={c.titulo}
                className={`flex flex-col items-center gap-8 sm:gap-12 lg:flex-row ${
                  i % 2 === 1 ? "lg:flex-row-reverse" : ""
                }`}
              >
                <div className="flex-1">
                  <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-2.5 py-1 text-xs font-semibold text-brand-700">
                    <c.icon className="h-3.5 w-3.5" strokeWidth={2} />
                    {c.eyebrow}
                  </div>
                  <h3 className="mb-2 text-xl font-semibold text-ink-900">{c.titulo}</h3>
                  <p className="max-w-md text-sm leading-relaxed text-ink-500">{c.texto}</p>
                </div>
                <div className="flex flex-1 justify-center">{c.mock}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Offline callout */}
      <section className="bg-ink-950 py-14 text-center text-white">
        <div className="mx-auto max-w-2xl px-6">
          <WifiOff className="mx-auto mb-4 h-8 w-8 text-brand-400" strokeWidth={1.75} />
          <h2 className="text-2xl font-semibold">Funciona con o sin internet.</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-300">
            Si se va la señal, tu mesero sigue tomando órdenes y tu cajero sigue cobrando. Todo se
            sincroniza solo apenas vuelve la conexión — para restaurantes de verdad, no para
            demos con wifi perfecto.
          </p>
        </div>
      </section>

      {/* Precios */}
      <section id="precios" className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto mb-12 max-w-xl text-center">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-600">Precios</p>
          <h2 className="text-2xl font-semibold text-ink-900 sm:text-3xl">
            Simple, sin letra pequeña
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {PLANES.map((plan) => (
            <div
              key={plan.nombre}
              className={`relative flex flex-col rounded-2xl border p-6 ${
                plan.destacado ? "border-brand-600 bg-brand-50/40 shadow-card" : "border-ink-100 bg-white"
              }`}
            >
              {plan.destacado && (
                <span className="absolute -top-3 left-6 rounded-full bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white">
                  Más elegido
                </span>
              )}
              <p className="text-sm font-semibold text-ink-900">{plan.nombre}</p>
              <p className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-semibold text-ink-900">{plan.precio}</span>
                {plan.periodo && <span className="text-sm text-ink-400">{plan.periodo}</span>}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink-500">{plan.descripcion}</p>
              <ul className="mt-5 space-y-2 text-sm text-ink-700">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-brand-600" strokeWidth={2.5} />
                  Mesas, comanda y cocina
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-brand-600" strokeWidth={2.5} />
                  Cierre de caja automático
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-brand-600" strokeWidth={2.5} />
                  Funciona sin internet
                </li>
              </ul>
              {"externo" in plan.cta ? (
                <a
                  href={plan.cta.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${buttonClass(plan.destacado ? "primary" : "secondary", "md")} mt-6 justify-center`}
                >
                  <MessageCircle className="h-4 w-4" strokeWidth={2} />
                  {plan.cta.texto}
                </a>
              ) : (
                <Link
                  href={plan.cta.href}
                  className={`${buttonClass(plan.destacado ? "primary" : "secondary", "md")} mt-6 justify-center`}
                >
                  {plan.cta.texto}
                </Link>
              )}
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-ink-500">
          ¿Tenés más de dos sucursales?{" "}
          <a
            href={linkWhatsapp("Hola, tengo más de dos sucursales y quiero información sobre Pedilo.")}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand-600 hover:underline"
          >
            Escríbenos por WhatsApp
          </a>{" "}
          y armamos tu plan.
        </p>
      </section>

      {/* CTA final */}
      <section className="border-t border-ink-100 bg-ink-50/60 py-16 text-center">
        <div className="mx-auto max-w-xl px-6">
          <h2 className="text-2xl font-semibold text-ink-900">Probalo en tu restaurante, sin compromiso.</h2>
          <p className="mt-3 text-sm text-ink-500">
            Creá tu cuenta gratis y empezá a operar hoy mismo, o escribinos si preferís que te lo
            mostremos primero.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/registro" className={`${buttonClass("primary", "lg")} w-full sm:w-auto`}>
              Crear mi cuenta
            </Link>
            <a
              href={linkWhatsapp("Hola, quiero que me muestren cómo funciona Pedilo en mi restaurante.")}
              target="_blank"
              rel="noopener noreferrer"
              className={`${buttonClass("secondary", "lg")} w-full sm:w-auto`}
            >
              <MessageCircle className="h-4 w-4" strokeWidth={2} />
              Escríbenos y te lo mostramos
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-ink-100 py-8 text-center text-xs text-ink-400">
        © {new Date().getFullYear()} Pedilo — un producto de Codegent
      </footer>
    </div>
  );
}

/** Mockup ilustrativo del mapa de mesas — mismos colores libre/ocupada de la app real. */
function MockMesas() {
  const mesas = [
    { n: 1, estado: "libre" },
    { n: 2, estado: "ocupada" },
    { n: 3, estado: "libre" },
    { n: 4, estado: "ocupada" },
    { n: 5, estado: "libre" },
    { n: 6, estado: "libre" },
  ] as const;
  return (
    <div className="w-full max-w-xs rounded-2xl border border-ink-100 bg-white p-4 shadow-popover">
      <div className="grid grid-cols-3 gap-2.5">
        {mesas.map((m) => (
          <div
            key={m.n}
            className={`flex h-16 flex-col items-center justify-center rounded-xl border text-xs font-semibold ${
              m.estado === "libre"
                ? "border-libre-border bg-libre-bg text-libre-text"
                : "border-ocupada-border bg-ocupada-bg text-ocupada-text"
            }`}
          >
            <span
              className={`mb-1 h-1.5 w-1.5 rounded-full ${
                m.estado === "libre" ? "bg-libre-dot" : "bg-ocupada-dot"
              }`}
            />
            Mesa {m.n}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Mockup ilustrativo de una comanda impresa en cocina. */
function MockComanda() {
  return (
    <div className="w-full max-w-xs rounded-2xl border border-ink-100 bg-white p-5 shadow-popover">
      <div className="rounded-xl border border-dashed border-ink-200 bg-ink-50/60 p-4 font-mono text-xs text-ink-700">
        <p className="mb-2 text-center font-semibold text-ink-900">MESA 7 · COCINA</p>
        <div className="mb-2 border-t border-dashed border-ink-200" />
        <p>2x Baleada especial</p>
        <p>1x Pollo con tajadas</p>
        <p>1x Refresco de horchata</p>
        <div className="my-2 border-t border-dashed border-ink-200" />
        <p className="text-ink-400">21:14 · enviado a cocina</p>
      </div>
    </div>
  );
}

/** Mockup ilustrativo del cierre de caja diario. */
function MockCierre() {
  return (
    <div className="w-full max-w-xs rounded-2xl border border-ink-100 bg-white p-5 shadow-popover">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-400">Cierre de hoy</p>
      <p className="font-mono text-2xl font-semibold text-ink-900">L 12,480.00</p>
      <p className="mb-4 text-xs text-ink-400">47 órdenes cerradas</p>
      <div className="space-y-1.5 font-mono text-xs text-ink-600">
        <div className="flex justify-between">
          <span>Efectivo</span>
          <span>L 7,120.00</span>
        </div>
        <div className="flex justify-between">
          <span>Tarjeta</span>
          <span>L 5,360.00</span>
        </div>
      </div>
    </div>
  );
}
