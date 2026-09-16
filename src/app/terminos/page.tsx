import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";

export const metadata = { title: "Términos de servicio — Pedilo" };

export default function TerminosPage() {
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
        <h1 className="mb-1 text-2xl font-semibold text-ink-900">Términos de servicio</h1>
        <p className="mb-8 text-sm text-ink-400">Última actualización: septiembre de 2026</p>

        <div className="space-y-8 text-sm leading-relaxed text-ink-700">
          <section>
            <h2 className="mb-2 text-base font-semibold text-ink-900">1. Aceptación</h2>
            <p>
              Al crear una cuenta en Pedilo (un producto de Codegent) aceptás estos términos. Si no
              estás de acuerdo, no uses el servicio.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink-900">2. Qué es Pedilo</h2>
            <p>
              Pedilo es un sistema de punto de venta (POS) para restaurantes: manejo de mesas,
              comandas de cocina, cobro y cierre de caja, con soporte para una o varias sucursales.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink-900">3. Cuenta y sucursales</h2>
            <p>
              Sos responsable de mantener segura tu contraseña (o el acceso de tu cuenta de Google) y
              de los usuarios (cajeros/meseros) que des de alta dentro de tu cuenta. El plan que
              elijas determina cuántas sucursales podés operar; abrir más de las que incluye tu plan
              requiere ampliarlo.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink-900">4. Prueba, planes y pagos</h2>
            <p className="mb-2">
              Toda cuenta nueva arranca con 15 días de prueba gratuita, sin necesidad de pagar por
              adelantado. Después de la prueba:
            </p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>1 sucursal: L900/mes.</li>
              <li>2 sucursales: L1200/mes.</li>
              <li>Compra única o planes a la medida: precio acordado directamente.</li>
            </ul>
            <p className="mt-2">
              La facturación es mensual. Si tu prueba vence o se atrasa un pago, el acceso se
              suspende (para todos los usuarios de esa cuenta) hasta regularizarlo — te avisamos en
              pantalla cómo pagar y cómo contactarnos.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink-900">5. Tus datos son tuyos</h2>
            <p>
              El menú, las órdenes, las ventas y cualquier otro dato que cargues en Pedilo son de tu
              negocio. No los usamos para otro fin que operar el servicio (ver Política de
              Privacidad).
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink-900">6. Uso aceptable</h2>
            <p>
              No podés usar Pedilo para actividades ilegales, revender el acceso a tu cuenta a
              terceros no autorizados, ni intentar vulnerar la seguridad del sistema.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink-900">7. Disponibilidad</h2>
            <p>
              Hacemos nuestro mejor esfuerzo para mantener el servicio disponible, pero no
              garantizamos un funcionamiento ininterrumpido al 100%. El punto de venta (POS) sigue
              funcionando localmente aunque se pierda la conexión a internet, sincronizando cuando
              vuelva.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink-900">8. Cancelación</h2>
            <p>
              Podés dejar de usar Pedilo cuando quieras escribiéndonos para dar de baja tu cuenta; no
              hay penalidad ni contrato forzoso más allá del mes en curso.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink-900">9. Limitación de responsabilidad</h2>
            <p>
              Pedilo se ofrece &quot;tal cual&quot;. No nos hacemos responsables por pérdidas indirectas
              derivadas del uso del servicio (por ejemplo, ventas no registradas por una falla ajena a
              nuestro control). Hacemos todo lo posible por evitar interrupciones y proteger tu
              información.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink-900">10. Cambios a estos términos</h2>
            <p>
              Si hacemos cambios importantes, te avisamos por correo o dentro de la app antes de que
              entren en vigencia.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink-900">11. Ley aplicable</h2>
            <p>Estos términos se rigen por las leyes de Honduras.</p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-ink-900">12. Contacto</h2>
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
