import Link from "next/link";
import { Building2, CreditCard, Plus, Wallet, DollarSign, ArrowRight } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardHeader, PageHeader } from "@/components/ui/Card";
import { Field, SelectField, TextareaField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  actualizarSuscripcion,
  marcarPagado,
  registrarPago,
  crearFormaPago,
  actualizarFormaPago,
  eliminarFormaPago,
} from "./actions";
import { NOMBRE_PLAN, aFechaInput, estadoTenant } from "./shared";

export default async function PlataformaPage() {
  const admin = createAdminClient();

  const [{ data: tenants }, { data: sucursales }, { data: usuarios }, { data: authList }, { data: formasPago }] =
    await Promise.all([
      admin.from("tenants").select("*").order("created_at", { ascending: false }),
      admin.from("sucursales").select("id, tenant_id"),
      admin.from("usuarios").select("id, tenant_id, nombre, rol").eq("rol", "admin"),
      admin.auth.admin.listUsers({ perPage: 1000 }),
      admin.from("formas_pago_plataforma").select("*").order("orden"),
    ]);

  const emailPorId = new Map((authList?.users ?? []).map((u) => [u.id, u.email]));
  const sucursalesPorTenant = (tenantId: string) => (sucursales ?? []).filter((s) => s.tenant_id === tenantId);
  const adminsPorTenant = (tenantId: string) => (usuarios ?? []).filter((u) => u.tenant_id === tenantId);

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <PageHeader title="Clientes" subtitle="Suscripción, plan y sucursales de cada negocio en Pedilo." />
        <Link
          href="/plataforma/ingresos"
          className="mt-1 flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
        >
          Ver ingresos
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
        </Link>
      </div>

      <div className="mb-8 space-y-4">
        {(tenants ?? []).map((tenant) => {
          const estado = estadoTenant(tenant);
          const cantidadSucursales = sucursalesPorTenant(tenant.id).length;
          const admins = adminsPorTenant(tenant.id);
          return (
            <Card key={tenant.id} className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <Building2 className="h-4 w-4" strokeWidth={2} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-ink-900">{tenant.nombre}</p>
                    <p className="text-xs text-ink-400">
                      {admins.map((a) => `${a.nombre} · ${emailPorId.get(a.id) ?? "sin correo"}`).join(", ") ||
                        "Sin administrador"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">
                    {cantidadSucursales}/{tenant.max_sucursales} sucursales
                  </Badge>
                  <Badge tone={estado.tone}>{estado.texto}</Badge>
                </div>
              </div>

              <form
                action={actualizarSuscripcion.bind(null, tenant.id)}
                className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4"
              >
                <SelectField label="Plan" name="plan" defaultValue={tenant.plan}>
                  {Object.entries(NOMBRE_PLAN).map(([valor, etiqueta]) => (
                    <option key={valor} value={valor}>
                      {etiqueta}
                    </option>
                  ))}
                </SelectField>
                <Field
                  label="Máx. sucursales"
                  name="max_sucursales"
                  type="number"
                  min={1}
                  defaultValue={tenant.max_sucursales}
                  required
                />
                <Field
                  label="Precio mensual (L)"
                  name="precio_mensual"
                  type="number"
                  step="0.01"
                  defaultValue={tenant.precio_mensual ?? ""}
                  placeholder="A consultar"
                />
                <SelectField label="Estado" name="suscripcion_estado" defaultValue={tenant.suscripcion_estado}>
                  <option value="prueba">Prueba</option>
                  <option value="activa">Activa</option>
                  <option value="suspendida">Suspendida</option>
                </SelectField>
                <Field
                  label="Vence el"
                  name="suscripcion_vence_el"
                  type="date"
                  defaultValue={aFechaInput(tenant.suscripcion_vence_el)}
                />
                <TextareaField
                  label="Notas internas"
                  name="notas_admin"
                  defaultValue={tenant.notas_admin ?? ""}
                  placeholder="Ej. pagó por depósito el 5, pidió upgrade..."
                  full
                />
                <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-4">
                  <Button type="submit" size="sm">
                    Guardar
                  </Button>
                  <Button
                    type="submit"
                    formAction={marcarPagado.bind(null, tenant.id)}
                    variant="secondary"
                    size="sm"
                  >
                    <CreditCard className="h-3.5 w-3.5" strokeWidth={2} />
                    Marcar pagado (+1 mes)
                  </Button>
                </div>
              </form>

              <form
                action={registrarPago.bind(null, tenant.id)}
                className="grid grid-cols-1 gap-3 border-t border-ink-100 bg-ink-50/60 p-5 sm:grid-cols-4"
              >
                <div className="sm:col-span-4">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">
                    <DollarSign className="h-3.5 w-3.5" strokeWidth={2} />
                    Registrar pago
                  </p>
                  <p className="text-xs text-ink-400">
                    Para compras únicas o cualquier cobro fuera de lo normal — queda en el historial de ingresos.
                  </p>
                </div>
                <Field label="Monto (L)" name="monto" type="number" step="0.01" min={0.01} required />
                <SelectField
                  label="Tipo"
                  name="tipo"
                  defaultValue={tenant.plan === "compra_unica" ? "compra_unica" : "otro"}
                >
                  <option value="mensual">Mensualidad</option>
                  <option value="compra_unica">Compra única</option>
                  <option value="otro">Otro</option>
                </SelectField>
                <Field
                  label="Fecha"
                  name="fecha_pago"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                />
                <Field label="Notas (opcional)" name="notas" placeholder="Ej. depósito BAC #123" />
                <div className="sm:col-span-4">
                  <Button type="submit" size="sm" variant="secondary">
                    Registrar pago
                  </Button>
                </div>
              </form>
            </Card>
          );
        })}
        {(tenants ?? []).length === 0 && <p className="text-sm text-ink-500">Todavía no hay clientes.</p>}
      </div>

      <Card>
        <CardHeader
          title="Formas de pago"
          subtitle="Se muestran a los clientes en la pantalla de suscripción vencida/suspendida."
        />
        <div className="space-y-2 p-5 pb-3">
          {(formasPago ?? []).map((f) => (
            <form
              key={f.id}
              action={actualizarFormaPago.bind(null, f.id)}
              className="flex flex-wrap items-end gap-3 rounded-xl border border-ink-100 bg-ink-50/60 p-3"
            >
              <div className="min-w-48 flex-1">
                <label className="mb-1 block text-xs font-medium text-ink-500">Descripción</label>
                <input
                  name="descripcion"
                  defaultValue={f.descripcion}
                  className="w-full rounded-lg border border-ink-200 px-2 py-1.5 text-sm text-ink-900 focus:border-brand-500 focus:outline-none"
                />
              </div>
              <label className="mb-2 flex items-center gap-1.5 text-xs text-ink-600">
                <input
                  type="checkbox"
                  name="activo"
                  defaultChecked={f.activo}
                  className="h-3.5 w-3.5 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                />
                Activa
              </label>
              <Button size="sm" variant="secondary">
                Guardar
              </Button>
              <Button
                type="submit"
                formAction={eliminarFormaPago.bind(null, f.id)}
                variant="danger"
                size="sm"
              >
                Eliminar
              </Button>
            </form>
          ))}
          {(formasPago ?? []).length === 0 && (
            <p className="py-2 text-center text-sm text-ink-400">
              Todavía no hay formas de pago configuradas.
            </p>
          )}
        </div>
        <form action={crearFormaPago} className="grid grid-cols-1 gap-3 border-t border-ink-100 p-5 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Field
              label="Descripción"
              name="descripcion"
              required
              placeholder="Ej. Transferencia BAC cta. 123456789"
            />
          </div>
          <Field label="Orden" name="orden" type="number" defaultValue={0} />
          <div className="flex items-end">
            <Button type="submit" size="sm" className="w-full">
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              <Wallet className="h-3.5 w-3.5" strokeWidth={2} />
              Agregar
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
