import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, PageHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Colapsable } from "@/components/ui/Colapsable";
import { CopiarEnlace } from "@/components/admin/CopiarEnlace";
import { cn, inputClass, labelClass } from "@/lib/ui";
import { DIAS_SEMANA, ETIQUETA_DIA } from "@/lib/delivery/horario";
import { slugDesdeNombre } from "@/lib/delivery/rutas";
import { ETIQUETA_METODO, type MetodoPago } from "@/lib/delivery/validaciones";
import { eliminarZona, guardarConfigDelivery, guardarRepartidor, guardarZona } from "./actions";

type Horario = Record<string, { desde: string; hasta: string }[]>;

export default async function AdminDeliveryPage({
  searchParams,
}: {
  searchParams: Promise<{ sucursal?: string; ok?: string; error?: string }>;
}) {
  const sesion = await requireAdmin();
  const { sucursal: sucursalParam, ok, error } = await searchParams;
  const supabase = await createClient();

  const { data: sucursales } = await supabase.from("sucursales").select("id, nombre").eq("tenant_id", sesion.tenant_id).eq("activo", true).order("nombre");
  const lista = sucursales ?? [];
  const actual = lista.find((s) => s.id === sucursalParam) ?? lista[0];

  if (!actual) {
    return (
      <div>
        <PageHeader title="Delivery" subtitle="Pedidos a domicilio con menú público y repartidores." />
        <p className="text-sm text-ink-500">Crea primero una sucursal.</p>
      </div>
    );
  }

  const [{ data: config }, { data: zonas }, { data: repartidores }] = await Promise.all([
    supabase.from("delivery_config").select("*").eq("sucursal_id", actual.id).maybeSingle(),
    supabase.from("delivery_zonas").select("*").eq("sucursal_id", actual.id).order("nombre"),
    supabase.from("repartidores").select("*").eq("sucursal_id", actual.id).order("nombre"),
  ]);

  const horario = (config?.horario ?? {}) as Horario;
  const metodos = (config?.metodos_pago ?? ["efectivo"]) as MetodoPago[];
  const slugSugerido = config?.slug ?? slugDesdeNombre(actual.nombre);

  return (
    <div>
      <PageHeader
        title="Delivery"
        subtitle="Menú público para pedir a domicilio, zonas con su tarifa y repartidores."
        action={
          <Link href="/admin/delivery/reporte" className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50">
            <BarChart3 className="h-4 w-4" /> Reporte
          </Link>
        }
      />

      {lista.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {lista.map((s) => (
            <Link key={s.id} href={`/admin/delivery?sucursal=${s.id}`}
              className={cn("rounded-full border px-3.5 py-1.5 text-sm font-medium", s.id === actual.id ? "border-brand-600 bg-brand-600 text-white" : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50")}>
              {s.nombre}
            </Link>
          ))}
        </div>
      )}

      {ok && <p role="status" className="mb-4 rounded-xl border border-libre-border bg-libre-bg px-4 py-3 text-sm text-libre-text">{ok}</p>}
      {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      {config?.slug && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          <CopiarEnlace ruta={`/${config.slug}`} etiqueta="Menú para tus clientes (compártelo o ponlo en tu bio)" />
          <CopiarEnlace ruta={`/repartidor?r=${config.slug}`} etiqueta="Enlace para tus repartidores (instalan la app desde aquí)" />
        </div>
      )}

      <div className="space-y-5">
        <Card>
          <CardHeader title="Configuración" subtitle={`Sucursal ${actual.nombre}`} />
          <form action={guardarConfigDelivery} className="space-y-5 p-5">
            <input type="hidden" name="sucursal_id" value={actual.id} />

            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-ink-200 p-3 text-sm font-medium text-ink-800">
              <input type="checkbox" name="activo" defaultChecked={config?.activo ?? false} className="h-4 w-4 rounded border-ink-300 text-brand-600" />
              Recibir pedidos a domicilio por el menú público
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="slug" className={labelClass}>Código del restaurante (dirección del menú)</label>
                <input id="slug" name="slug" defaultValue={slugSugerido} className={inputClass} autoCapitalize="none" />
                <p className="mt-1 text-xs text-ink-400">Ej. «{slugSugerido}» → tudominio.com/{slugSugerido}</p>
              </div>
              <div>
                <label htmlFor="mensaje" className={labelClass}>Mensaje de bienvenida (opcional)</label>
                <input id="mensaje" name="mensaje_bienvenida" defaultValue={config?.mensaje_bienvenida ?? ""} maxLength={160} className={inputClass} placeholder="¡Pide y te lo llevamos calientito!" />
              </div>
              <div>
                <label htmlFor="minimo" className={labelClass}>Pedido mínimo (L)</label>
                <input id="minimo" name="monto_minimo" type="number" min="0" step="0.01" defaultValue={config?.monto_minimo ?? 0} className={inputClass} />
              </div>
              <div>
                <label htmlFor="tiempo" className={labelClass}>Tiempo estimado de entrega (min)</label>
                <input id="tiempo" name="tiempo_estimado_min" type="number" min="1" defaultValue={config?.tiempo_estimado_min ?? 45} className={inputClass} />
              </div>
            </div>

            <div>
              <p className={labelClass}>Métodos de pago que aceptas</p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(ETIQUETA_METODO) as MetodoPago[]).map((m) => (
                  <label key={m} className="flex cursor-pointer items-center gap-2 rounded-lg border border-ink-200 px-3 py-2 text-sm">
                    <input type="checkbox" name="metodos" value={m} defaultChecked={metodos.includes(m)} /> {ETIQUETA_METODO[m]}
                  </label>
                ))}
              </div>
              <label htmlFor="cuenta" className={cn(labelClass, "mt-3")}>Datos de la cuenta para transferencias</label>
              <textarea id="cuenta" name="cuenta_transferencia" rows={2} defaultValue={config?.cuenta_transferencia ?? ""} className={inputClass} placeholder="Banco, número de cuenta y titular" />
            </div>

            <div>
              <p className={labelClass}>Horario de entrega (hora de Honduras)</p>
              <div className="space-y-1.5">
                {DIAS_SEMANA.map((d) => {
                  const tramo = horario[d]?.[0];
                  return (
                    <div key={d} className="flex flex-wrap items-center gap-3 text-sm">
                      <label className="flex w-32 items-center gap-2"><input type="checkbox" name={`abre_${d}`} defaultChecked={!!tramo} /> {ETIQUETA_DIA[d]}</label>
                      <input type="time" name={`desde_${d}`} defaultValue={tramo?.desde ?? "10:00"} className={cn(inputClass, "w-32")} />
                      <span className="text-ink-400">a</span>
                      <input type="time" name={`hasta_${d}`} defaultValue={tramo?.hasta ?? "22:00"} className={cn(inputClass, "w-32")} />
                    </div>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-ink-400">Un día sin marcar queda cerrado. Si «hasta» es menor que «desde» (ej. 18:00 a 02:00), cruza la medianoche.</p>
            </div>

            <Colapsable resumen={<span className="text-sm font-medium text-ink-700">Opciones avanzadas</span>}>
              <div className="grid gap-4 p-4 pt-0 sm:grid-cols-2">
                <div>
                  <label htmlFor="isv" className={labelClass}>ISV del servicio de envío</label>
                  <select id="isv" name="tasa_isv_envio" defaultValue={config?.tasa_isv_envio ?? "15"} className={inputClass}>
                    <option value="15">15 %</option>
                    <option value="18">18 %</option>
                    <option value="exento">Exento</option>
                  </select>
                  <p className="mt-1 text-xs text-amber-700">Pendiente de confirmar con tu contador.</p>
                </div>
                <div>
                  <label htmlFor="radio" className={labelClass}>Radio de llegada automática (m)</label>
                  <input id="radio" name="radio_llegada_m" type="number" min="20" max="1000" defaultValue={config?.radio_llegada_m ?? 100} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="vel" className={labelClass}>Velocidad promedio de moto (km/h, para el tiempo de llegada)</label>
                  <input id="vel" name="velocidad_moto_kmh" type="number" min="5" step="0.5" defaultValue={config?.velocidad_moto_kmh ?? 25} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="ret" className={labelClass}>Guardar el rastro GPS (días)</label>
                  <input id="ret" name="retencion_rastro_dias" type="number" min="1" defaultValue={config?.retencion_rastro_dias ?? 90} className={inputClass} />
                  <p className="mt-1 text-xs text-ink-400">Pasado ese tiempo se borra el rastro y queda solo el punto de entrega.</p>
                </div>
              </div>
            </Colapsable>

            <Button>Guardar configuración</Button>
          </form>
        </Card>

        <Card>
          <CardHeader title="Zonas de entrega" subtitle="El cliente elige su zona y ve la tarifa de envío." />
          <div className="divide-y divide-ink-100">
            {(zonas ?? []).map((z) => (
              <form key={z.id} action={guardarZona} className="flex flex-wrap items-end gap-3 px-5 py-3">
                <input type="hidden" name="id" value={z.id} />
                <input type="hidden" name="activa_form" value="1" />
                <input type="hidden" name="sucursal_id" value={actual.id} />
                <div className="min-w-40 flex-1"><label className={labelClass}>Zona</label><input name="nombre" defaultValue={z.nombre} className={inputClass} /></div>
                <div className="w-28"><label className={labelClass}>Tarifa (L)</label><input name="tarifa" type="number" min="0" step="0.01" defaultValue={Number(z.tarifa)} className={inputClass} /></div>
                <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="activa" defaultChecked={z.activa} /> Activa</label>
                <Button size="sm" variant="secondary">Guardar</Button>
                <Button size="sm" variant="danger" formAction={eliminarZona} formNoValidate>Quitar</Button>
              </form>
            ))}
            {(zonas ?? []).length === 0 && <p className="px-5 py-4 text-sm text-ink-400">Todavía no hay zonas. Agrega la primera abajo.</p>}
          </div>
          <form action={guardarZona} className="flex flex-wrap items-end gap-3 border-t border-ink-100 bg-ink-50/60 px-5 py-4">
            <input type="hidden" name="sucursal_id" value={actual.id} />
            <div className="min-w-40 flex-1"><label className={labelClass}>Nueva zona</label><input name="nombre" placeholder="Col. Trejo" className={inputClass} /></div>
            <div className="w-28"><label className={labelClass}>Tarifa (L)</label><input name="tarifa" type="number" min="0" step="0.01" placeholder="30" className={inputClass} /></div>
            <Button size="sm">Agregar zona</Button>
          </form>
        </Card>

        <Card>
          <CardHeader title="Repartidores" subtitle="Entran a su app con el código del restaurante y su PIN. No son usuarios del POS." />
          <div className="divide-y divide-ink-100">
            {(repartidores ?? []).map((r) => (
              <Colapsable key={r.id} className="rounded-none border-0 shadow-none"
                resumen={
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-ink-900">{r.nombre}</span>
                    <span className="text-xs text-ink-500">{r.activo ? (r.tipo_pago === "por_entrega" ? `L ${Number(r.monto_por_entrega).toFixed(2)} por entrega` : "Pago fijo") : "Inactivo"}</span>
                  </div>
                }>
                <form action={guardarRepartidor} className="grid gap-3 px-4 pb-4 sm:grid-cols-2">
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="activo_form" value="1" />
                  <input type="hidden" name="sucursal_id" value={actual.id} />
                  <div><label className={labelClass}>Nombre</label><input name="nombre" defaultValue={r.nombre} className={inputClass} /></div>
                  <div><label className={labelClass}>Teléfono</label><input name="telefono" defaultValue={r.telefono ?? ""} className={inputClass} /></div>
                  <div>
                    <label className={labelClass}>Forma de pago</label>
                    <select name="tipo_pago" defaultValue={r.tipo_pago} className={inputClass}><option value="por_entrega">Por entrega</option><option value="fijo">Sueldo fijo</option></select>
                  </div>
                  <div><label className={labelClass}>Monto por entrega (L)</label><input name="monto_por_entrega" type="number" min="0" step="0.01" defaultValue={Number(r.monto_por_entrega)} className={inputClass} /></div>
                  <div><label className={labelClass}>Nuevo PIN (déjalo vacío para no cambiarlo)</label><input name="pin" inputMode="numeric" maxLength={6} autoComplete="off" className={inputClass} /></div>
                  <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" name="activo" defaultChecked={r.activo} /> Activo</label>
                  <div className="sm:col-span-2"><Button size="sm">Guardar repartidor</Button></div>
                </form>
              </Colapsable>
            ))}
            {(repartidores ?? []).length === 0 && <p className="px-5 py-4 text-sm text-ink-400">Todavía no hay repartidores.</p>}
          </div>
          <form action={guardarRepartidor} className="grid gap-3 border-t border-ink-100 bg-ink-50/60 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3">
            <input type="hidden" name="sucursal_id" value={actual.id} />
            <div><label className={labelClass}>Nuevo repartidor</label><input name="nombre" placeholder="Nombre" className={inputClass} /></div>
            <div><label className={labelClass}>Teléfono</label><input name="telefono" inputMode="tel" className={inputClass} /></div>
            <div><label className={labelClass}>PIN (4 a 6 dígitos)</label><input name="pin" inputMode="numeric" maxLength={6} autoComplete="off" className={inputClass} /></div>
            <div>
              <label className={labelClass}>Forma de pago</label>
              <select name="tipo_pago" defaultValue="por_entrega" className={inputClass}><option value="por_entrega">Por entrega</option><option value="fijo">Sueldo fijo</option></select>
            </div>
            <div><label className={labelClass}>Monto por entrega (L)</label><input name="monto_por_entrega" type="number" min="0" step="0.01" defaultValue={0} className={inputClass} /></div>
            <div className="flex items-end"><Button size="sm">Agregar repartidor</Button></div>
          </form>
        </Card>
      </div>
    </div>
  );
}
