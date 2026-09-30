import Link from "next/link";
import {
  Building2,
  Phone,
  Printer,
  Plus,
  UtensilsCrossed,
  LayoutGrid,
  QrCode,
  Users,
  MessageCircle,
  Pencil,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Colapsable } from "@/components/ui/Colapsable";
import { SucursalLogoUploader } from "@/components/admin/SucursalLogoUploader";
import { linkWhatsapp } from "@/lib/whatsapp";
import { crearSucursal, actualizarSucursal, desactivarSucursal } from "./actions";

export default async function SucursalesPage({
  searchParams,
}: {
  searchParams: Promise<{ errorPlan?: string }>;
}) {
  const sesion = await requireAdmin();
  const supabase = await createClient();
  const { errorPlan } = await searchParams;

  const [{ data: sucursales }, { data: mesas }, { data: prodSuc }, { data: usuarios }] =
    await Promise.all([
      supabase.from("sucursales").select("*").eq("tenant_id", sesion.tenant_id).order("created_at"),
      supabase.from("mesas").select("id, sucursal_id").eq("tenant_id", sesion.tenant_id).eq("activa", true),
      supabase.from("producto_sucursales").select("sucursal_id"),
      supabase.from("usuarios").select("id, rol, sucursal_id").eq("tenant_id", sesion.tenant_id),
    ]);

  const contarPor = (filas: { sucursal_id: string | null }[] | null, sucursalId: string) =>
    (filas ?? []).filter((f) => f.sucursal_id === sucursalId).length;

  return (
    <div>
      <PageHeader
        title="Sucursales"
        subtitle="Configura cada local: sus datos, logo, mesas y menú. Las personas que trabajan en ellos están en «Equipo de trabajo»."
        action={
          <Link href="/admin/equipo">
            <Button variant="secondary" size="sm">
              <Users className="h-3.5 w-3.5" strokeWidth={2} />
              Equipo de trabajo
            </Button>
          </Link>
        }
      />

      {errorPlan && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <Building2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
          <div className="flex-1">
            <p>Tu plan actual no incluye otra sucursal más. Escríbenos y te ampliamos el plan.</p>
            <a
              href={linkWhatsapp("Hola, quiero ampliar mi plan de Pedilo para agregar otra sucursal.")}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 font-medium text-red-900 hover:underline"
            >
              <MessageCircle className="h-3.5 w-3.5" strokeWidth={2} />
              Ampliar plan por WhatsApp
            </a>
          </div>
        </div>
      )}

      <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {(sucursales ?? []).map((s) => (
          <Card key={s.id} className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Building2 className="h-4 w-4" strokeWidth={2} />
                </div>
                <p className="text-sm font-semibold text-ink-900">{s.nombre}</p>
              </div>
              {!s.activo && <Badge tone="danger">inactiva</Badge>}
            </div>

            <div className="flex flex-wrap gap-2 border-b border-ink-100 bg-ink-50/60 px-5 py-3">
              <Link href={`/admin/menu?sucursal=${s.id}`}>
                <Button variant="secondary" size="sm">
                  <UtensilsCrossed className="h-3.5 w-3.5" strokeWidth={2} />
                  Menú ({contarPor(prodSuc, s.id)})
                </Button>
              </Link>
              <Link href={`/admin/mesas?sucursal=${s.id}`}>
                <Button variant="secondary" size="sm">
                  <LayoutGrid className="h-3.5 w-3.5" strokeWidth={2} />
                  Mesas / Layout ({contarPor(mesas, s.id)})
                </Button>
              </Link>
              <Link href={`/admin/mesas?sucursal=${s.id}`}>
                <Button variant="secondary" size="sm">
                  <QrCode className="h-3.5 w-3.5" strokeWidth={2} />
                  QR de mesas
                </Button>
              </Link>
              <Link href="/admin/equipo">
                <Button variant="secondary" size="sm">
                  <Users className="h-3.5 w-3.5" strokeWidth={2} />
                  Equipo ({contarPor(usuarios, s.id)})
                </Button>
              </Link>
            </div>

            <div className="p-5">
              <Colapsable
                resumen={
                  <span className="flex items-center gap-2 text-sm font-medium text-ink-900">
                    <Pencil className="h-3.5 w-3.5 text-brand-600" strokeWidth={2} />
                    Editar datos de la sucursal
                  </span>
                }
              >
                <div className="mb-4">
                  <SucursalLogoUploader sucursalId={s.id} logoUrl={s.logo_url} />
                </div>
                <form action={actualizarSucursal.bind(null, s.id)} className="space-y-3">
                  <Field label="Nombre" name="nombre" defaultValue={s.nombre} />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Teléfono" name="telefono" defaultValue={s.telefono ?? ""} />
                    <Field label="Dirección" name="direccion" defaultValue={s.direccion ?? ""} />
                  </div>
                  <Field
                    label="URL del agente de impresión"
                    name="agente_impresion_url"
                    defaultValue={s.agente_impresion_url ?? ""}
                    placeholder="https://cocina-xxx.tunnel.example.com/comanda"
                  />
                  <div className="flex items-center gap-2 pt-1">
                    <Button size="sm">Guardar</Button>
                    <Button
                      type="submit"
                      formAction={desactivarSucursal.bind(null, s.id)}
                      variant="danger"
                      size="sm"
                    >
                      Desactivar
                    </Button>
                  </div>
                </form>
              </Colapsable>
              <div className="mt-3 flex items-center gap-3 text-xs text-ink-400">
                {s.telefono && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {s.telefono}
                  </span>
                )}
                {s.agente_impresion_url && (
                  <span className="flex items-center gap-1" title="Agente de impresión configurado">
                    <Printer className="h-3 w-3" /> Impresión configurada
                  </span>
                )}
              </div>
            </div>
          </Card>
        ))}
        {(sucursales ?? []).length === 0 && (
          <p className="text-sm text-ink-500">Todavía no hay sucursales.</p>
        )}
      </div>

      <Colapsable
        key={`nueva-sucursal-${(sucursales ?? []).length}`}
        resumen={
          <span className="flex items-center gap-2 text-sm font-semibold text-ink-900">
            <Plus className="h-4 w-4 text-brand-600" strokeWidth={2} />
            Nueva sucursal
          </span>
        }
      >
        <p className="mb-3 text-xs text-ink-500">Agrega un local más a tu negocio.</p>
        <form action={crearSucursal} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nombre" name="nombre" required placeholder="Ej. Fondita — barrio" />
          <Field label="Teléfono" name="telefono" />
          <Field label="Dirección" name="direccion" full />
          <div className="col-span-full">
            <Button type="submit">
              <Plus className="h-4 w-4" strokeWidth={2} />
              Crear sucursal
            </Button>
          </div>
        </form>
      </Colapsable>
    </div>
  );
}
