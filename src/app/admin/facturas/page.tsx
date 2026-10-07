import Link from "next/link";
import { Calendar, CheckCircle2, ShieldAlert, XCircle } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { cargarVentasDelDia } from "@/lib/ventas/cargar";
import {
  ETIQUETA_TIPO_VENTA,
  fechaValida,
  resumirVentas,
  type TipoVenta,
  type VentaDia,
} from "@/lib/ventas/ventasDelDia";
import { hoyHN } from "@/lib/menu/platosDelDia";
import { Card, CardHeader, PageHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/ui";
import { resolverSolicitudAnulacion } from "./actions";

const FILTROS: { valor: "todas" | TipoVenta | "anuladas"; etiqueta: string }[] = [
  { valor: "todas", etiqueta: "Todas" },
  { valor: "con_cai", etiqueta: "Con CAI" },
  { valor: "sin_cai", etiqueta: "Sin CAI" },
  { valor: "sin_factura", etiqueta: "Sin factura" },
  { valor: "anuladas", etiqueta: "Anuladas" },
];

const hora = (iso: string) =>
  new Intl.DateTimeFormat("es-HN", { hour: "2-digit", minute: "2-digit", timeZone: "America/Tegucigalpa" }).format(new Date(iso));
const fechaHora = (iso: string) =>
  new Intl.DateTimeFormat("es-HN", { dateStyle: "short", timeStyle: "short", timeZone: "America/Tegucigalpa" }).format(new Date(iso));
const lempiras = (n: number) => `L. ${n.toFixed(2)}`;

export default async function FacturasDelDiaPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; tipo?: string; ok?: string; error?: string }>;
}) {
  const sesion = await requireAdmin();
  const supabase = await createClient();
  const { fecha: fechaParam, tipo, ok, error } = await searchParams;
  const fecha = fechaValida(fechaParam, hoyHN());
  const filtro = FILTROS.find((f) => f.valor === tipo)?.valor ?? "todas";

  const [ventas, { data: sucursales }, { data: pendientes }] = await Promise.all([
    cargarVentasDelDia(supabase, { fecha }),
    supabase.from("sucursales").select("id, nombre").eq("tenant_id", sesion.tenant_id).order("nombre"),
    supabase
      .from("solicitudes_anulacion")
      .select("id, sucursal_id, referencia, monto, motivo, solicitada_por, created_at")
      .eq("estado", "pendiente")
      .order("created_at"),
  ]);

  // Nombres de quienes pidieron cada anulación
  const idsSolicitantes = [...new Set((pendientes ?? []).map((p) => p.solicitada_por).filter((x): x is string => !!x))];
  const { data: usuarios } = idsSolicitantes.length
    ? await supabase.from("usuarios").select("id, nombre").in("id", idsSolicitantes)
    : { data: [] as { id: string; nombre: string }[] };
  const nombreUsuario = new Map((usuarios ?? []).map((u) => [u.id, u.nombre]));
  const nombreSucursal = new Map((sucursales ?? []).map((s) => [s.id, s.nombre]));
  const variasSucursales = (sucursales ?? []).length > 1;

  const resumen = resumirVentas(ventas);
  const visibles = ventas.filter((v) =>
    filtro === "todas" ? true : filtro === "anuladas" ? v.anulada : v.tipo === filtro && !v.anulada
  );
  const href = (f: string) => `/admin/facturas?fecha=${fecha}${f === "todas" ? "" : `&tipo=${f}`}`;

  return (
    <div>
      <PageHeader
        title="Facturas del día"
        subtitle="Todo lo cobrado ese día: con factura CAI, sin CAI y sin factura. Aquí apruebas las anulaciones que pide la caja."
      />

      {ok && <p role="status" className="mb-4 rounded-lg bg-libre-bg px-3 py-2 text-sm text-libre-text">{ok}</p>}
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {(pendientes ?? []).length > 0 && (
        <Card className="mb-6 border-amber-200">
          <CardHeader
            title={`Anulaciones por aprobar (${pendientes!.length})`}
            subtitle="La caja las pidió; no se anula nada hasta que tú las apruebes."
          />
          <div className="divide-y divide-ink-100">
            {pendientes!.map((p) => (
              <form key={p.id} action={resolverSolicitudAnulacion} className="space-y-2 p-4">
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="fecha" value={fecha} />
                <div className="flex flex-wrap items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-600" strokeWidth={2} />
                  <span className="font-mono text-sm font-medium text-ink-900">{p.referencia}</span>
                  <span className="text-sm font-semibold tabular-nums text-ink-900">{lempiras(Number(p.monto))}</span>
                  <span className="ml-auto text-xs text-ink-400">{fechaHora(p.created_at)}</span>
                </div>
                <p className="text-xs text-ink-500">
                  Pedida por <b className="text-ink-700">{(p.solicitada_por && nombreUsuario.get(p.solicitada_por)) || "caja"}</b>
                  {variasSucursales && ` · ${nombreSucursal.get(p.sucursal_id) ?? ""}`}
                </p>
                <p className="rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-800">
                  <span className="text-xs font-medium text-ink-500">Motivo: </span>
                  {p.motivo}
                </p>
                <input
                  name="respuesta"
                  placeholder="Tu razón (obligatoria para rechazar)"
                  maxLength={300}
                  aria-label="Razón de tu decisión"
                  className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" name="decision" value="aprobar" size="sm" variant="danger">
                    <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
                    Aprobar anulación
                  </Button>
                  <Button type="submit" name="decision" value="rechazar" size="sm" variant="secondary">
                    <XCircle className="h-3.5 w-3.5" strokeWidth={2} />
                    Rechazar
                  </Button>
                </div>
              </form>
            ))}
          </div>
        </Card>
      )}

      <form className="mb-4 flex items-center gap-2">
        <Calendar className="h-4 w-4 text-ink-400" strokeWidth={2} />
        <input
          type="date"
          name="fecha"
          defaultValue={fecha}
          max={hoyHN()}
          aria-label="Fecha"
          className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />
        <Button size="sm" variant="dark" type="submit">
          Ver
        </Button>
      </form>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {(["con_cai", "sin_cai", "sin_factura"] as const).map((t) => (
          <Card key={t} className="p-4">
            <p className="text-xs font-medium text-ink-500">{ETIQUETA_TIPO_VENTA[t]}</p>
            <p className="text-xl font-semibold text-ink-900">{lempiras(resumen.porTipo[t].total)}</p>
            <p className="text-xs text-ink-400">
              {resumen.porTipo[t].cantidad} {resumen.porTipo[t].cantidad === 1 ? "cobro" : "cobros"}
            </p>
          </Card>
        ))}
        <Card className="p-4">
          <p className="text-xs font-medium text-ink-500">Anuladas</p>
          <p className="text-xl font-semibold text-red-600">{lempiras(resumen.anuladas.total)}</p>
          <p className="text-xs text-ink-400">{resumen.anuladas.cantidad} {resumen.anuladas.cantidad === 1 ? "venta" : "ventas"}</p>
        </Card>
        <Card className="col-span-2 p-4 lg:col-span-1">
          <p className="text-xs font-medium text-ink-500">Total del día (sin anuladas)</p>
          <p className="text-xl font-semibold text-ink-900">{lempiras(resumen.neto.total)}</p>
          <p className="text-xs text-ink-400">{resumen.neto.cantidad} cobros</p>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filtrar por tipo">
        {FILTROS.map((f) => (
          <Link
            key={f.valor}
            href={href(f.valor)}
            aria-current={filtro === f.valor ? "page" : undefined}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-medium transition",
              filtro === f.valor ? "bg-ink-900 text-white" : "border border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
            )}
          >
            {f.etiqueta}
          </Link>
        ))}
      </div>

      <div className="space-y-2">
        {visibles.map((v) => (
          <FilaVenta key={v.ordenId} v={v} sucursal={variasSucursales ? nombreSucursal.get(v.sucursalId) : undefined} />
        ))}
        {visibles.length === 0 && <p className="text-sm text-ink-500">No hay cobros de este tipo ese día.</p>}
      </div>
    </div>
  );
}

function FilaVenta({ v, sucursal }: { v: VentaDia; sucursal?: string }) {
  return (
    <div className={cn("rounded-xl border bg-white p-3.5 shadow-card", v.anulada ? "border-red-200 bg-red-50/30" : "border-ink-100")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-medium text-ink-900">
          {v.numeroFactura ?? (v.numeroDia != null ? `Orden #${v.numeroDia}` : "Cobro")}
        </span>
        <Badge tone={v.tipo === "con_cai" ? "brand" : "neutral"}>{ETIQUETA_TIPO_VENTA[v.tipo]}</Badge>
        {v.anulada && <Badge tone="danger">anulada</Badge>}
        {v.solicitud?.estado === "pendiente" && <Badge tone="warning">anulación pendiente</Badge>}
        {v.solicitud?.estado === "rechazada" && <Badge tone="neutral">anulación rechazada</Badge>}
        <span className={cn("ml-auto text-sm font-semibold tabular-nums", v.anulada ? "text-ink-400 line-through" : "text-ink-900")}>
          {lempiras(v.total)}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-ink-500">
        {hora(v.hora)} · {v.cliente}
        {v.mesa ? ` · ${v.mesa}` : ""}
        {sucursal ? ` · ${sucursal}` : ""}
        {v.formasPago.length > 0 ? ` · ${v.formasPago.map((f) => f.replaceAll("_", " ")).join(", ")}` : ""}
      </p>
      {v.anulada && v.motivoAnulacion && <p className="mt-1 text-xs text-red-700">Motivo de la anulación: {v.motivoAnulacion}</p>}
      {v.solicitud?.estado === "rechazada" && v.solicitud.respuesta && (
        <p className="mt-1 text-xs text-ink-500">Razón del rechazo: {v.solicitud.respuesta}</p>
      )}
    </div>
  );
}
