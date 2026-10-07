import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormularioActivacion } from "@/components/admin/fiscal/FormulariosFiscales";
import { alertasPorPunto, type NivelAlerta } from "@/lib/fiscal/alertas";
import { fechaLocalHN, formatearFecha, formatearFechaHora } from "@/lib/fiscal/formato";
import { calcularRequisitos } from "@/lib/fiscal/requisitos";
import { cn } from "@/lib/ui";
import { guardarTicketSinFactura, liberarDispositivo, resolverIncidente } from "./actions";

const NIVEL: Record<NivelAlerta, { texto: string; tono: "success" | "warning" | "danger"; barra: string }> = {
  ok: { texto: "vigente", tono: "success", barra: "bg-libre-text" },
  consumo: { texto: "85 % consumido", tono: "warning", barra: "bg-amber-500" },
  vencimiento: { texto: "por vencer", tono: "warning", barra: "bg-amber-500" },
  agotado: { texto: "agotado", tono: "danger", barra: "bg-red-500" },
  vencido: { texto: "vencido", tono: "danger", barra: "bg-red-500" },
};

const CLASE: Record<string, string> = { factura: "Factura", nota_credito: "Nota de crédito", nota_debito: "Nota de débito" };

export default async function FiscalEstadoPage() {
  const sesion = await requireAdmin();
  const supabase = await createClient();
  const hoy = fechaLocalHN(new Date());

  const [{ data: tenant }, { data: sucursales }, { data: emisores }, { data: cajas }, { data: rangos }, { data: incidentes }] =
    await Promise.all([
      supabase.from("tenants").select("*").eq("id", sesion.tenant_id).single(),
      supabase.from("sucursales").select("id, nombre").eq("tenant_id", sesion.tenant_id).eq("activo", true).order("nombre"),
      supabase.from("datos_fiscales_emisor").select("sucursal_id, razon_social, rtn, direccion_fiscal").eq("tenant_id", sesion.tenant_id),
      supabase.from("dispositivos_pos").select("id, nombre, sucursal_id, establecimiento, punto_emision, activo, vinculo_hash").eq("tenant_id", sesion.tenant_id),
      supabase.from("cai_rangos").select("*").eq("tenant_id", sesion.tenant_id),
      supabase.from("incidentes_fiscales").select("*").eq("tenant_id", sesion.tenant_id).eq("resuelto", false).order("created_at", { ascending: false }),
    ]);

  const activa = !!tenant?.facturacion_fiscal_activa;
  const nombreSucursal = new Map((sucursales ?? []).map((s) => [s.id, s.nombre]));
  const nombreCaja = new Map((cajas ?? []).map((c) => [`${c.sucursal_id}|${c.establecimiento}|${c.punto_emision}`, c.nombre]));

  const requisitos = calcularRequisitos(
    {
      sucursales: sucursales ?? [],
      emisores: emisores ?? [],
      rangos: rangos ?? [],
    },
    hoy
  );

  const puntos = alertasPorPunto(rangos ?? [], hoy).sort((a, b) =>
    a.clave.localeCompare(b.clave)
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Facturación fiscal"
          subtitle="Emite facturas con CAI (modalidad autoimpresor por sistema computarizado)."
          action={<Badge tone={activa ? "success" : "neutral"}>{activa ? "activa" : "inactiva"}</Badge>}
        />
        <div className="p-5">
          <FormularioActivacion activa={activa} requisitos={requisitos} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Ticket sin factura"
          subtitle="Al cobrar el cajero elige «Facturar» o «Ticket sin factura». Si no lo activas aquí, solo se puede facturar."
          action={<Badge tone={tenant?.ticket_sin_factura_activo ? "warning" : "neutral"}>{tenant?.ticket_sin_factura_activo ? "activado" : "desactivado"}</Badge>}
        />
        <form action={guardarTicketSinFactura} className="space-y-3 p-5">
          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-800">
            <input
              type="checkbox"
              name="ticket_sin_factura"
              defaultChecked={!!tenant?.ticket_sin_factura_activo}
              className="mt-0.5 h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
            />
            <span>
              Permitir cobrar con <b>ticket sin factura</b>
              <span className="block text-xs text-ink-500">
                Lo podrán usar solo los cajeros a los que les des el permiso en <b>Equipo de trabajo</b>. Esas ventas no llevan factura con CAI y
                se reportan aparte en el cierre.
              </span>
            </span>
          </label>
          <Button size="sm" variant="dark">Guardar</Button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Estado de los rangos por caja" subtitle="Alerta al 85 % consumido y a 30 días de la fecha límite." />
        <div className="divide-y divide-ink-100">
          {puntos.length === 0 && <p className="p-5 text-sm text-ink-500">Todavía no hay rangos cargados. Agrégalos en «Rangos CAI».</p>}
          {puntos.map((p) => {
            const n = NIVEL[p.nivel];
            const pct = Math.min(100, Math.round(p.resumen.pctConsumido * 100));
            const caja = nombreCaja.get(`${p.sucursal_id}|${p.establecimiento}|${p.punto_emision}`);
            return (
              <div key={p.clave} className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-ink-900">
                    {nombreSucursal.get(p.sucursal_id) ?? "Sucursal"} · {caja ?? "Caja"}
                  </p>
                  <span className="font-mono text-xs text-ink-500">{p.establecimiento}-{p.punto_emision}-{p.tipo_doc}</span>
                  <Badge tone="neutral">{CLASE[p.clase] ?? p.clase}</Badge>
                  <Badge tone={n.tono} className="ml-auto">{n.texto}</Badge>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <div className={cn("h-full rounded-full", n.barra)} style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-500">
                  <span><b className="text-ink-800">{p.resumen.usados.toLocaleString("es-HN")}</b> usados</span>
                  <span><b className="text-ink-800">{p.resumen.restantes.toLocaleString("es-HN")}</b> restantes ({pct} %)</span>
                  <span>
                    vence <b className="text-ink-800">{formatearFecha(rangos?.find((r) => r.id === p.rangoId)?.fecha_limite ?? hoy)}</b>{" "}
                    ({p.resumen.diasParaVencer >= 0 ? `en ${p.resumen.diasParaVencer} días` : `hace ${-p.resumen.diasParaVencer} días`})
                  </span>
                  {p.hayRelevo && <span className="text-libre-text">rango siguiente ya cargado</span>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Caja de cobro"
          subtitle="Cada sucursal cobra y factura desde una caja, que se vincula sola la primera vez que se abre el POS. Si cambias de equipo o reinstalas, pulsa «Liberar» y vuelve a abrir el POS."
        />
        <div className="divide-y divide-ink-100">
          {(sucursales ?? []).map((sc) => {
            const caja = (cajas ?? []).find((c) => c.sucursal_id === sc.id && c.activo);
            return (
              <div key={sc.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">{sc.nombre}</p>
                  <p className="font-mono text-xs text-ink-500">
                    {caja ? `${caja.establecimiento}-${caja.punto_emision}` : "sin caja"}
                  </p>
                </div>
                {caja?.vinculo_hash ? <Badge tone="success">vinculada</Badge> : <Badge tone="warning">sin vincular</Badge>}
                {caja?.vinculo_hash && (
                  <form action={liberarDispositivo.bind(null, caja.id)}>
                    <Button size="sm" variant="secondary" type="submit">Liberar</Button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Incidentes sin resolver"
          subtitle="Documentos que el servidor rechazó al sincronizar (duplicado, fuera de rango, fecha vencida…). Nunca se descartan: quedan aquí para revisarlos."
          action={incidentes && incidentes.length > 0 ? <Badge tone="danger">{incidentes.length}</Badge> : undefined}
        />
        <div className="divide-y divide-ink-100">
          {(incidentes ?? []).length === 0 && <p className="p-5 text-sm text-ink-500">Sin incidentes.</p>}
          {(incidentes ?? []).map((i) => (
            <div key={i.id} className="flex flex-wrap items-start gap-3 p-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium capitalize text-ink-900">{i.tipo.replace(/_/g, " ")}</p>
                <p className="mt-0.5 break-words text-xs text-ink-600">{i.detalle}</p>
                <p className="mt-1 text-xs text-ink-400">{formatearFechaHora(new Date(i.created_at))}</p>
              </div>
              <form action={resolverIncidente.bind(null, i.id)}>
                <Button size="sm" variant="secondary" type="submit">Marcar resuelto</Button>
              </form>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
