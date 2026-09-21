import Link from "next/link";
import { Plus, ChevronDown } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PlanoMesas } from "@/components/PlanoMesas";
import { PageHeader } from "@/components/ui/Card";
import { Field, SelectField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { MesaQr } from "@/components/admin/MesaQr";
import { cn } from "@/lib/ui";
import { crearMesa, actualizarMesa, eliminarMesa } from "./actions";

export default async function MesasPage({
  searchParams,
}: {
  searchParams: Promise<{ sucursal?: string }>;
}) {
  const sesion = await requireAdmin();
  const supabase = await createClient();
  const { sucursal } = await searchParams;

  const { data: sucursales } = await supabase
    .from("sucursales")
    .select("id, nombre")
    .eq("tenant_id", sesion.tenant_id)
    .eq("activo", true)
    .order("nombre");

  const sucursalId = sucursal ?? sucursales?.[0]?.id;

  const { data: mesas } = sucursalId
    ? await supabase
        .from("mesas")
        .select("*")
        .eq("sucursal_id", sucursalId)
        .eq("activa", true)
        .order("nombre")
    : { data: [] };

  return (
    <div>
      <PageHeader title="Mesas / Layout" subtitle="Arrastra las mesas para armar el plano del local." />

      <div className="mb-6 flex flex-wrap gap-2">
        {(sucursales ?? []).map((s) => (
          <Link
            key={s.id}
            href={`/admin/mesas?sucursal=${s.id}`}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-medium transition",
              s.id === sucursalId
                ? "bg-ink-900 text-white"
                : "border border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
            )}
          >
            {s.nombre}
          </Link>
        ))}
      </div>

      {!sucursalId ? (
        <p className="text-sm text-ink-500">Crea primero una sucursal.</p>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-4 text-xs text-ink-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-libre-dot" /> libre
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-ocupada-dot" /> ocupada
            </span>
          </div>
          <div className="mb-6">
            <PlanoMesas mesas={mesas ?? []} />
          </div>

          <details className="group mb-6 rounded-2xl border border-ink-100 bg-white shadow-card">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-semibold text-ink-900">
              <Plus className="h-4 w-4 text-brand-600" strokeWidth={2} />
              Nueva mesa
              <ChevronDown
                className="ml-auto h-4 w-4 text-ink-400 transition-transform group-open:rotate-180"
                strokeWidth={2}
              />
            </summary>
            <form
              action={crearMesa}
              className="flex flex-wrap items-end gap-3 border-t border-ink-100 p-5 pt-4"
            >
              <input type="hidden" name="sucursal_id" value={sucursalId} />
              <Field label="Nombre" name="nombre" required placeholder="Mesa 1" />
              <Field
                label="Capacidad"
                name="capacidad"
                type="number"
                defaultValue={4}
                className="w-24"
              />
              <Field label="Zona" name="zona" placeholder="Terraza" />
              <SelectField label="Forma" name="forma" defaultValue="cuadrada" className="w-32">
                <option value="cuadrada">Cuadrada</option>
                <option value="redonda">Redonda</option>
              </SelectField>
              <Button type="submit">
                <Plus className="h-4 w-4" strokeWidth={2} />
                Agregar
              </Button>
            </form>
          </details>

          <div className="space-y-2">
            {(mesas ?? []).map((m) => (
              <details key={m.id} className="group rounded-xl border border-ink-100 bg-white shadow-card">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{m.nombre}</p>
                    <p className="text-xs text-ink-500">
                      {m.capacidad} personas{m.zona ? ` · ${m.zona}` : ""}
                    </p>
                  </div>
                  <Badge tone={m.estado === "libre" ? "success" : "danger"}>{m.estado}</Badge>
                  <ChevronDown
                    className="h-4 w-4 shrink-0 text-ink-400 transition-transform group-open:rotate-180"
                    strokeWidth={2}
                  />
                </summary>
                <div className="border-t border-ink-100 p-4">
                  <form
                    action={actualizarMesa.bind(null, m.id)}
                    className="flex flex-wrap items-end gap-3"
                  >
                    <Field label="Nombre" name="nombre" defaultValue={m.nombre} className="w-36" />
                    <Field
                      label="Capacidad"
                      name="capacidad"
                      type="number"
                      defaultValue={m.capacidad}
                      className="w-20"
                    />
                    <Field label="Zona" name="zona" defaultValue={m.zona ?? ""} className="w-32" />
                    <SelectField label="Forma" name="forma" defaultValue={m.forma} className="w-28">
                      <option value="cuadrada">Cuadrada</option>
                      <option value="redonda">Redonda</option>
                    </SelectField>
                    <div className="ml-auto flex gap-2">
                      <Button size="sm">Guardar</Button>
                      <Button
                        type="submit"
                        formAction={eliminarMesa.bind(null, m.id)}
                        variant="danger"
                        size="sm"
                      >
                        Eliminar
                      </Button>
                    </div>
                  </form>
                  <div className="mt-3">
                    <MesaQr mesaId={m.id} qrToken={m.qr_token} />
                  </div>
                </div>
              </details>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
