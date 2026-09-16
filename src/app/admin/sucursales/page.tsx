import Link from "next/link";
import {
  Building2,
  Phone,
  Printer,
  Plus,
  UtensilsCrossed,
  LayoutGrid,
  QrCode,
  KeyRound,
  UserPlus,
  ShieldCheck,
  Users,
  MessageCircle,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, PageHeader } from "@/components/ui/Card";
import { Field, SelectField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SucursalLogoUploader } from "@/components/admin/SucursalLogoUploader";
import { linkWhatsapp } from "@/lib/whatsapp";
import { crearSucursal, actualizarSucursal, desactivarSucursal, crearUsuario, actualizarUsuario } from "./actions";

const ROL_TONE = { admin: "brand", cajero: "warning", mesero: "neutral" } as const;

export default async function SucursalesPage({
  searchParams,
}: {
  searchParams: Promise<{ nuevoEmail?: string; nuevaClave?: string; errorPlan?: string }>;
}) {
  const sesion = await requireAdmin();
  const supabase = await createClient();
  const { nuevoEmail, nuevaClave, errorPlan } = await searchParams;

  const [{ data: sucursales }, { data: mesas }, { data: prodSuc }, { data: usuarios }] =
    await Promise.all([
      supabase.from("sucursales").select("*").eq("tenant_id", sesion.tenant_id).order("created_at"),
      supabase.from("mesas").select("id, sucursal_id").eq("tenant_id", sesion.tenant_id).eq("activa", true),
      supabase.from("producto_sucursales").select("sucursal_id"),
      supabase.from("usuarios").select("*").eq("tenant_id", sesion.tenant_id).order("created_at"),
    ]);

  const contarPor = (filas: { sucursal_id: string }[] | null, sucursalId: string) =>
    (filas ?? []).filter((f) => f.sucursal_id === sucursalId).length;

  const admins = (usuarios ?? []).filter((u) => u.rol === "admin");
  const personalPorSucursal = (sucursalId: string) =>
    (usuarios ?? []).filter((u) => u.rol !== "admin" && u.sucursal_id === sucursalId);

  return (
    <div>
      <PageHeader
        title="Sucursales"
        subtitle="Configura cada local: sus datos, mesas, menú y el personal (cajero/mesero) que trabaja ahí."
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

      {nuevaClave && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
          <p>
            Usuario <b>{nuevoEmail}</b> creado. Contraseña temporal (cópiala y compártela de forma
            segura, no se volverá a mostrar):{" "}
            <code className="rounded bg-amber-100 px-2 py-0.5 font-mono">{nuevaClave}</code>
          </p>
        </div>
      )}

      <Card className="mb-8">
        <CardHeader
          title="Administradores"
          subtitle="Tienen acceso a todo el panel, sin estar atados a una sucursal en particular."
        />
        <div className="space-y-2 p-5 pb-3">
          {admins.map((u) => (
            <form
              key={u.id}
              action={actualizarUsuario.bind(null, u.id)}
              className="flex flex-wrap items-end gap-3 rounded-xl border border-ink-100 bg-ink-50/60 p-3"
            >
              <input type="hidden" name="rol" value="admin" />
              <div className="min-w-32 flex-1">
                <label className="mb-1 block text-xs font-medium text-ink-500">Nombre</label>
                <input
                  name="nombre"
                  defaultValue={u.nombre}
                  className="w-full rounded-lg border border-ink-200 px-2 py-1.5 text-sm font-medium text-ink-900 focus:border-brand-500 focus:outline-none"
                />
              </div>
              <Badge tone={ROL_TONE.admin} className="mb-2">
                <ShieldCheck className="h-3 w-3" strokeWidth={2} />
                admin
              </Badge>
              <label className="mb-2 flex items-center gap-1.5 text-xs text-ink-600">
                <input
                  type="checkbox"
                  name="activo"
                  defaultChecked={u.activo}
                  className="h-3.5 w-3.5 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                />
                Activo
              </label>
              <Button size="sm" variant="secondary" className="ml-auto">
                Guardar
              </Button>
            </form>
          ))}
          {admins.length === 0 && (
            <p className="py-2 text-center text-sm text-ink-400">Todavía no hay otros administradores.</p>
          )}
        </div>
        <form action={crearUsuario} className="grid grid-cols-1 gap-3 border-t border-ink-100 p-5 sm:grid-cols-3">
          <input type="hidden" name="rol" value="admin" />
          <Field label="Nombre" name="nombre" required />
          <Field label="Correo" name="email" type="email" required />
          <div className="flex items-end">
            <Button type="submit" size="sm" className="w-full">
              <UserPlus className="h-3.5 w-3.5" strokeWidth={2} />
              Agregar administrador
            </Button>
          </div>
        </form>
      </Card>

      <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {(sucursales ?? []).map((s) => {
          const personal = personalPorSucursal(s.id);
          return (
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
              </div>

              <div className="border-b border-ink-100 p-5">
                <SucursalLogoUploader sucursalId={s.id} logoUrl={s.logo_url} />
              </div>

              <form action={actualizarSucursal.bind(null, s.id)} className="space-y-3 border-b border-ink-100 p-5">
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
                  <div className="ml-auto flex items-center gap-3 text-xs text-ink-400">
                    {s.telefono && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {s.telefono}
                      </span>
                    )}
                    {s.agente_impresion_url && (
                      <span className="flex items-center gap-1" title="Agente de impresión configurado">
                        <Printer className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                </div>
              </form>

              <div className="border-b border-ink-100 px-5 py-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">
                  <Users className="h-3.5 w-3.5" strokeWidth={2} />
                  Personal de esta sucursal
                </p>
              </div>
              <div className="space-y-2 p-5 pb-3">
                {personal.map((u) => (
                  <form
                    key={u.id}
                    action={actualizarUsuario.bind(null, u.id)}
                    className="flex flex-wrap items-end gap-3 rounded-xl border border-ink-100 bg-white p-3 shadow-card"
                  >
                    <div className="min-w-28 flex-1">
                      <label className="mb-1 block text-xs font-medium text-ink-500">Nombre</label>
                      <input
                        name="nombre"
                        defaultValue={u.nombre}
                        className="w-full rounded-lg border border-ink-200 px-2 py-1.5 text-sm font-medium text-ink-900 focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-ink-500">Rol</label>
                      <select
                        name="rol"
                        defaultValue={u.rol}
                        className="rounded-lg border border-ink-200 bg-white px-2 py-1.5 text-xs"
                      >
                        <option value="cajero">Cajero</option>
                        <option value="mesero">Mesero</option>
                      </select>
                    </div>
                    <Badge tone={ROL_TONE[u.rol as "cajero" | "mesero"] ?? "neutral"} className="mb-2">
                      {u.rol}
                    </Badge>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-ink-500">Sucursal</label>
                      <select
                        name="sucursal_id"
                        defaultValue={s.id}
                        className="rounded-lg border border-ink-200 bg-white px-2 py-1.5 text-xs"
                      >
                        {(sucursales ?? []).map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                    <label className="mb-2 flex items-center gap-1.5 text-xs text-ink-600">
                      <input
                        type="checkbox"
                        name="activo"
                        defaultChecked={u.activo}
                        className="h-3.5 w-3.5 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                      />
                      Activo
                    </label>
                    <Button size="sm" variant="secondary" className="ml-auto">
                      Guardar
                    </Button>
                  </form>
                ))}
                {personal.length === 0 && (
                  <p className="py-2 text-center text-sm text-ink-400">
                    Todavía no hay cajeros ni meseros asignados a esta sucursal.
                  </p>
                )}
              </div>
              <form
                action={crearUsuario}
                className="grid grid-cols-1 gap-3 border-t border-ink-100 p-5 sm:grid-cols-4"
              >
                <input type="hidden" name="sucursal_id" value={s.id} />
                <Field label="Nombre" name="nombre" required />
                <Field label="Correo" name="email" type="email" required />
                <SelectField label="Rol" name="rol" defaultValue="mesero">
                  <option value="mesero">Mesero</option>
                  <option value="cajero">Cajero</option>
                </SelectField>
                <div className="flex items-end">
                  <Button type="submit" size="sm" className="w-full">
                    <UserPlus className="h-3.5 w-3.5" strokeWidth={2} />
                    Agregar
                  </Button>
                </div>
              </form>
            </Card>
          );
        })}
        {(sucursales ?? []).length === 0 && (
          <p className="text-sm text-ink-500">Todavía no hay sucursales.</p>
        )}
      </div>

      <Card>
        <CardHeader title="Nueva sucursal" subtitle="Agrega un local más a tu negocio." />
        <form action={crearSucursal} className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
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
      </Card>
    </div>
  );
}
