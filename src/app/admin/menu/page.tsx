import Link from "next/link";
import { UtensilsCrossed, Tag, Plus, ImageOff, FileUp } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, PageHeader } from "@/components/ui/Card";
import { Field, SelectField, TextareaField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Colapsable } from "@/components/ui/Colapsable";
import { FotoProductoField } from "@/components/admin/FotoProductoField";
import { cn } from "@/lib/ui";
import { crearCategoria, crearProducto, actualizarProducto, eliminarProducto } from "./actions";

export default async function MenuPage({
  searchParams,
}: {
  searchParams: Promise<{ sucursal?: string }>;
}) {
  const sesion = await requireAdmin();
  const supabase = await createClient();
  const { sucursal: sucursalFiltro } = await searchParams;

  const [{ data: categorias }, { data: productos }, { data: sucursales }, { data: prodSuc }] =
    await Promise.all([
      supabase.from("categorias").select("*").eq("tenant_id", sesion.tenant_id).order("orden"),
      supabase
        .from("productos")
        .select("*")
        .eq("tenant_id", sesion.tenant_id)
        .eq("activo", true)
        .order("nombre"),
      supabase.from("sucursales").select("id, nombre").eq("tenant_id", sesion.tenant_id),
      supabase.from("producto_sucursales").select("producto_id, sucursal_id"),
    ]);

  const sucursalesPorProducto = new Map<string, string[]>();
  for (const rel of prodSuc ?? []) {
    const arr = sucursalesPorProducto.get(rel.producto_id) ?? [];
    arr.push(rel.sucursal_id);
    sucursalesPorProducto.set(rel.producto_id, arr);
  }

  const productosFiltrados = sucursalFiltro
    ? (productos ?? []).filter((p) => sucursalesPorProducto.get(p.id)?.includes(sucursalFiltro))
    : (productos ?? []);

  return (
    <div>
      <PageHeader
        title="Menú digital"
        subtitle="Cada sucursal tiene su propio menú — filtra abajo o entra desde Sucursales."
        action={
          <Link href="/admin/menu/importar">
            <Button variant="secondary" size="sm">
              <FileUp className="h-3.5 w-3.5" strokeWidth={2} />
              Importar desde PDF
            </Button>
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href="/admin/menu"
          className={cn(
            "rounded-full px-3.5 py-1.5 text-xs font-medium transition",
            !sucursalFiltro
              ? "bg-ink-900 text-white"
              : "border border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
          )}
        >
          Todas las sucursales
        </Link>
        {(sucursales ?? []).map((s) => (
          <Link
            key={s.id}
            href={`/admin/menu?sucursal=${s.id}`}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-medium transition",
              s.id === sucursalFiltro
                ? "bg-ink-900 text-white"
                : "border border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
            )}
          >
            {s.nombre}
          </Link>
        ))}
      </div>

      <Card className="mb-6">
        <CardHeader title="Categorías" />
        <div className="p-5 pt-4">
          <div className="mb-4 flex flex-wrap gap-2">
            {(categorias ?? []).map((c) => (
              <Badge key={c.id} tone="brand">
                <Tag className="h-3 w-3" strokeWidth={2} />
                {c.nombre}
              </Badge>
            ))}
            {(categorias ?? []).length === 0 && (
              <p className="text-sm text-ink-400">Todavía no hay categorías.</p>
            )}
          </div>
          <form action={crearCategoria} className="flex gap-2">
            <input
              name="nombre"
              required
              placeholder="Ej. Bebidas"
              className="w-56 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
            <Button variant="dark" size="sm" type="submit">
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Agregar
            </Button>
          </form>
        </div>
      </Card>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {productosFiltrados.map((p) => (
          <Colapsable
            key={p.id}
            className="rounded-2xl"
            resumen={
              <div className="flex items-center gap-3">
                {p.foto_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.foto_url} alt="" className="h-11 w-11 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-ink-50 text-ink-300">
                    <ImageOff className="h-4 w-4" strokeWidth={2} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">{p.nombre}</p>
                  <p className="text-xs text-ink-500">L. {Number(p.precio).toFixed(2)}</p>
                </div>
                <Badge tone={p.disponible ? "success" : "danger"}>
                  {p.disponible ? "disponible" : "agotado"}
                </Badge>
              </div>
            }
          >
            <form
              action={actualizarProducto.bind(null, p.id)}
              className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            >
              <Field label="Nombre" name="nombre" defaultValue={p.nombre} />
              <Field label="Precio" name="precio" type="number" step="0.01" defaultValue={String(p.precio)} />
              <SelectField label="Categoría" name="categoria_id" defaultValue={p.categoria_id ?? ""}>
                <option value="">Sin categoría</option>
                {(categorias ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </SelectField>
              <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  name="disponible"
                  defaultChecked={p.disponible}
                  className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                />
                Disponible hoy
              </label>
              <FotoProductoField name="foto_url" defaultValue={p.foto_url} />
              <TextareaField label="Descripción" name="descripcion" defaultValue={p.descripcion ?? ""} full />
              <div className="col-span-full">
                <p className="mb-1.5 text-xs font-medium text-ink-500">Aplica en</p>
                <div className="flex flex-wrap gap-3">
                  {(sucursales ?? []).map((s) => (
                    <label key={s.id} className="flex items-center gap-1.5 text-xs text-ink-700">
                      <input
                        type="checkbox"
                        name="sucursales"
                        value={s.id}
                        defaultChecked={sucursalesPorProducto.get(p.id)?.includes(s.id)}
                        className="h-3.5 w-3.5 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                      />
                      {s.nombre}
                    </label>
                  ))}
                </div>
              </div>
              <div className="col-span-full flex gap-2 pt-1">
                <Button size="sm">Guardar</Button>
                <Button
                  type="submit"
                  formAction={eliminarProducto.bind(null, p.id)}
                  variant="danger"
                  size="sm"
                >
                  Eliminar
                </Button>
              </div>
            </form>
          </Colapsable>
        ))}
        {productosFiltrados.length === 0 && (
          <p className="text-sm text-ink-500">
            {sucursalFiltro ? "Esta sucursal todavía no tiene productos en su menú." : "Todavía no hay productos."}
          </p>
        )}
      </div>

      <Colapsable
        className="rounded-2xl"
        resumen={
          <span className="flex items-center gap-2 text-sm font-semibold text-ink-900">
            <Plus className="h-4 w-4 text-brand-600" strokeWidth={2} />
            Nuevo producto
          </span>
        }
      >
        <p className="mb-3 text-xs text-ink-500">
          {sucursalFiltro
            ? "Se marcará para esta sucursal — puedes agregar más abajo."
            : "Aparece en el menú del mesero apenas lo asignes a una sucursal."}
        </p>
        <form action={crearProducto} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nombre" name="nombre" required />
          <Field label="Precio" name="precio" type="number" step="0.01" required />
          <SelectField label="Categoría" name="categoria_id">
            <option value="">Sin categoría</option>
            {(categorias ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </SelectField>
          <FotoProductoField name="foto_url" defaultValue={null} />
          <TextareaField label="Descripción" name="descripcion" full />
          <div className="col-span-full">
            <p className="mb-1.5 text-xs font-medium text-ink-500">Aplica en</p>
            <div className="flex flex-wrap gap-3">
              {(sucursales ?? []).map((s) => (
                <label key={s.id} className="flex items-center gap-1.5 text-xs text-ink-700">
                  <input
                    type="checkbox"
                    name="sucursales"
                    value={s.id}
                    defaultChecked={sucursalFiltro ? s.id === sucursalFiltro : false}
                    className="h-3.5 w-3.5 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                  />
                  {s.nombre}
                </label>
              ))}
            </div>
          </div>
          <div className="col-span-full">
            <Button type="submit">
              <UtensilsCrossed className="h-4 w-4" strokeWidth={2} />
              Crear producto
            </Button>
          </div>
        </form>
      </Colapsable>
    </div>
  );
}
