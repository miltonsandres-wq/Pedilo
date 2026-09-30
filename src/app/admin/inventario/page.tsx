import { Boxes, Tag, Plus, AlertTriangle } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, PageHeader } from "@/components/ui/Card";
import { Field, SelectField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Colapsable } from "@/components/ui/Colapsable";
import { crearCategoriaInventario, crearItem, actualizarItem, eliminarItem } from "./actions";

export default async function InventarioPage() {
  const sesion = await requireAdmin();
  const supabase = await createClient();

  const [{ data: categorias }, { data: items }, { data: sucursales }, { data: stock }] =
    await Promise.all([
      supabase
        .from("inventario_categorias")
        .select("*")
        .eq("tenant_id", sesion.tenant_id)
        .order("orden"),
      supabase
        .from("inventario_items")
        .select("*")
        .eq("tenant_id", sesion.tenant_id)
        .eq("activo", true)
        .order("nombre"),
      supabase.from("sucursales").select("id, nombre").eq("tenant_id", sesion.tenant_id),
      supabase.from("inventario_stock").select("item_id, sucursal_id, cantidad"),
    ]);

  const stockPorItem = new Map<string, Map<string, number>>();
  for (const fila of stock ?? []) {
    const mapa = stockPorItem.get(fila.item_id) ?? new Map<string, number>();
    mapa.set(fila.sucursal_id, Number(fila.cantidad));
    stockPorItem.set(fila.item_id, mapa);
  }

  const nombreCategoria = new Map((categorias ?? []).map((c) => [c.id, c.nombre]));

  return (
    <div>
      <PageHeader
        title="Inventario"
        subtitle="Controla las existencias de tu negocio: botellas, alimentos, insumos y todo lo que manejes."
      />

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
          <form action={crearCategoriaInventario} data-tour="form-inv-categoria" className="flex gap-2">
            <input
              name="nombre"
              required
              placeholder="Ej. Botellas, Alimentos, Limpieza"
              className="w-56 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
            <Button variant="dark" size="sm" type="submit">
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Agregar
            </Button>
          </form>
        </div>
      </Card>

      <div className="mb-6 space-y-3">
        {(items ?? []).map((item) => {
          const stockItem = stockPorItem.get(item.id) ?? new Map<string, number>();
          const totalStock = [...stockItem.values()].reduce((a, b) => a + b, 0);
          const stockBajo = totalStock < Number(item.stock_minimo);

          return (
            <Colapsable
              key={item.id}
              resumen={
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink-50 text-ink-400">
                    <Boxes className="h-4.5 w-4.5" strokeWidth={2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{item.nombre}</p>
                    <p className="text-xs text-ink-500">
                      {item.categoria_id ? nombreCategoria.get(item.categoria_id) ?? "" : "Sin categoría"}
                      {" · "}
                      {totalStock} {item.unidad}
                    </p>
                  </div>
                  {stockBajo && (
                    <Badge tone="warning">
                      <AlertTriangle className="h-3 w-3" strokeWidth={2} />
                      stock bajo
                    </Badge>
                  )}
                </div>
              }
            >
              <form
                action={actualizarItem.bind(null, item.id)}
                className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              >
                <Field label="Nombre" name="nombre" defaultValue={item.nombre} required />
                <SelectField label="Categoría" name="categoria_id" defaultValue={item.categoria_id ?? ""}>
                  <option value="">Sin categoría</option>
                  {(categorias ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </SelectField>
                <Field label="Unidad" name="unidad" defaultValue={item.unidad} placeholder="botella, kg, litro..." />
                <Field
                  label="Stock mínimo (alerta)"
                  name="stock_minimo"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={String(item.stock_minimo)}
                />
                <Field
                  label="Costo unitario (opcional)"
                  name="costo_unitario"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={item.costo_unitario != null ? String(item.costo_unitario) : ""}
                />
                <Field label="Proveedor (opcional)" name="proveedor" defaultValue={item.proveedor ?? ""} />
                <div className="col-span-full">
                  <p className="mb-1.5 text-xs font-medium text-ink-500">Existencias por sucursal</p>
                  <div className="flex flex-wrap gap-3">
                    {(sucursales ?? []).map((s) => (
                      <label key={s.id} className="flex items-center gap-1.5 text-xs text-ink-700">
                        {s.nombre}
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          name={`stock_${s.id}`}
                          defaultValue={String(stockItem.get(s.id) ?? 0)}
                          className="w-20 rounded-lg border border-ink-200 bg-white px-2 py-1 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                        />
                      </label>
                    ))}
                    {(sucursales ?? []).length === 0 && (
                      <p className="text-xs text-ink-400">Todavía no hay sucursales.</p>
                    )}
                  </div>
                </div>
                <div className="col-span-full flex gap-2 pt-1">
                  <Button size="sm">Guardar</Button>
                  <Button
                    type="submit"
                    formAction={eliminarItem.bind(null, item.id)}
                    variant="danger"
                    size="sm"
                  >
                    Eliminar
                  </Button>
                </div>
              </form>
            </Colapsable>
          );
        })}
        {(items ?? []).length === 0 && (
          <p className="text-sm text-ink-500">Todavía no hay artículos en el inventario.</p>
        )}
      </div>

      <Colapsable
        key={`nuevo-item-${items?.length ?? 0}`}
        tour="abrir-item"
        className="rounded-2xl"
        resumen={
          <span className="flex items-center gap-2 text-sm font-semibold text-ink-900">
            <Plus className="h-4 w-4 text-brand-600" strokeWidth={2} />
            Nuevo artículo
          </span>
        }
      >
        <form action={crearItem} data-tour="form-item" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nombre" name="nombre" required />
          <SelectField label="Categoría" name="categoria_id">
            <option value="">Sin categoría</option>
            {(categorias ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </SelectField>
          <Field label="Unidad" name="unidad" placeholder="botella, kg, litro..." defaultValue="unidad" />
          <Field label="Stock mínimo (alerta)" name="stock_minimo" type="number" step="0.01" min="0" defaultValue="0" />
          <Field label="Costo unitario (opcional)" name="costo_unitario" type="number" step="0.01" min="0" />
          <Field label="Proveedor (opcional)" name="proveedor" />
          <div className="col-span-full">
            <p className="mb-1.5 text-xs font-medium text-ink-500">Existencias por sucursal</p>
            <div className="flex flex-wrap gap-3">
              {(sucursales ?? []).map((s) => (
                <label key={s.id} className="flex items-center gap-1.5 text-xs text-ink-700">
                  {s.nombre}
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name={`stock_${s.id}`}
                    defaultValue="0"
                    className="w-20 rounded-lg border border-ink-200 bg-white px-2 py-1 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  />
                </label>
              ))}
              {(sucursales ?? []).length === 0 && (
                <p className="text-xs text-ink-400">Todavía no hay sucursales.</p>
              )}
            </div>
          </div>
          <div className="col-span-full">
            <Button type="submit">
              <Boxes className="h-4 w-4" strokeWidth={2} />
              Crear artículo
            </Button>
          </div>
        </form>
      </Colapsable>
    </div>
  );
}
