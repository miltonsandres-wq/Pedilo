import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";

export const metadata = { title: "Política de privacidad — Pedilo" };

export default function PrivacidadPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-ink-100 px-6 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
              <BrandMark className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-ink-900">Pedilo</span>
          </Link>
          <Link href="/" className="flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900">
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
            Volver
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="mb-1 text-2xl font-semibold text-ink-900">Política de privacidad</h1>
        <p className="mb-8 text-sm text-ink-400">Última actualización: septiembre de 2026</p>

        <div className="space-y-8 text-sm leading-relaxed text-ink-700">
          <section>
            <h2 className="mb-2 text-base font-semibold text-ink-900">1. Quiénes somos</h2>
            <p>
              Pedilo es un sistema de punto de venta para restaurantes, fonditas y taquerías,
              desarrollado por Codegent. Esta política explica qué datos recopilamos, para qué los
              usamos y qué derechos tenés sobre ellos.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink-900">2. Qué datos recopilamos</h2>
            <p className="mb-2">Según cómo usás Pedilo, podemos recopilar:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <b>Al registrarte:</b> tu nombre, correo y los datos de tus sucursales (nombre,
                teléfono, dirección).
              </li>
              <li>
                <b>Si entrás con Google:</b> tu nombre, correo y foto de perfil que Google comparte
                al autorizar el acceso — nunca tu contraseña de Google, y nunca publicamos esos
                datos.
              </li>
              <li>
                <b>De tu personal:</b> nombre y correo de los cajeros/meseros que vos das de alta.
              </li>
              <li>
                <b>De tu operación:</b> menú, mesas, órdenes, ventas y cierres de caja que registra
                tu negocio.
              </li>
              <li>
                <b>De tus clientes finales:</b> cuando alguien pide desde el menú QR de una mesa, solo
                vemos lo necesario para armar su orden (qué pidió, en qué mesa) — no le pedimos
                correo, teléfono ni datos de pago.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink-900">3. Para qué usamos tus datos</h2>
            <p>
              Únicamente para operar el servicio: darte acceso a tu cuenta, mostrar tu menú y mesas,
              procesar órdenes, generar tus reportes de cierre, y contactarte por correo o WhatsApp
              sobre tu suscripción. No usamos tus datos para publicidad ni los vendemos a terceros.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink-900">4. Dónde se guardan</h2>
            <p>
              Tus datos viven en la infraestructura de Supabase (base de datos y autenticación) y la
              app se sirve desde Vercel — ambos proveedores cloud con estándares de seguridad
              reconocidos. El acceso a la base está restringido por reglas de seguridad a nivel de
              fila (RLS): cada negocio solo puede ver sus propios datos.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink-900">5. Con quién los compartimos</h2>
            <p>
              Con nadie más que los proveedores de infraestructura necesarios para operar (Supabase,
              Vercel). No compartimos ni vendemos tus datos a terceros con fines comerciales.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink-900">6. Tus derechos</h2>
            <p>
              Podés pedirnos acceder, corregir o eliminar tus datos, o cerrar tu cuenta por completo,
              escribiéndonos a{" "}
              <a href="mailto:miltonsandres13@gmail.com" className="text-brand-600 hover:underline">
                miltonsandres13@gmail.com
              </a>
              . Respondemos en un plazo razonable.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink-900">7. Cambios a esta política</h2>
            <p>
              Si actualizamos esta política de forma importante, te lo avisamos por correo o dentro
              de la app antes de que entre en vigencia.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink-900">8. Contacto</h2>
            <p>
              Correo:{" "}
              <a href="mailto:miltonsandres13@gmail.com" className="text-brand-600 hover:underline">
                miltonsandres13@gmail.com
              </a>
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
