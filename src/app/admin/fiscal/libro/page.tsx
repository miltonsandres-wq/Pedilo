import Link from "next/link";
import { Download } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { AnularDocumentoForm } from "@/components/admin/fiscal/FormulariosFiscales";
import { fechaLocalHN, formatearFechaHora, primerDiaDelMes } from "@/lib/fiscal/formato";
import { consultarLibro, LIMITE_LIBRO } from "@/lib/fiscal/libroServidor";
import { dinero } from "@/lib/printing/documentoTexto";
import { inputClass, labelClass } from "@/lib/ui";

const CLASE: Record<string, string> = { factura: "Factura", nota_credito: "Nota de crédito", nota_debito: "Nota de débito" };
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export default async function FiscalLibroPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; sucursal?: string }>;
}) {
  const sesion = await requireAdmin();
  const supabase = await createClient();
  const q = await searchParams;

  const hoy = fechaLocalHN(new Date());
  const desde = q.desde && FECHA.test(q.desde) ? q.desde : primerDiaDelMes(hoy);
  const hasta = q.hasta && FECHA.test(q.hasta) ? q.hasta : hoy;
  const sucursalId = q.sucursal || null;

  const { data: sucursales } = await supabase.from("sucursales").select("id, nombre").eq("tenant_id", sesion.tenant_id).order("nombre");
  const { libro, truncado } = await consultarLibro(supabase, { tenantId: sesion.tenant_id, desde, hasta, sucursalId });
  const t = libro.totales;
  const parametros = new URLSearchParams({ desde, hasta, ...(sucursalId ? { sucursal: sucursalId } : {}) }).toString();

  const columnas: [string, number][] = [
    ["Exonerado", t.importe_exonerado], ["Exento", t.importe_exento], ["Gravado 15%", t.gravado_15],
    ["Gravado 18%", t.gravado_18], ["ISV 15%", t.isv_15], ["ISV 18%", t.isv_18],
  ];

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div>
            <label className={labelClass} htmlFor="libro-desde">Desde</label>
            <input id="libro-desde" type="date" name="desde" defaultValue={desde} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="libro-hasta">Hasta</label>
            <input id="libro-hasta" type="date" name="hasta" defaultValue={hasta} className={inputClass} />
          </div>
          {(sucursales ?? []).length > 1 && (
            <div>
              <label className={labelClass} htmlFor="libro-sucursal">Sucursal</label>
              <select id="libro-sucursal" name="sucursal" defaultValue={sucursalId ?? ""} className={inputClass}>
                <option value="">Todas</option>
                {(sucursales ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </div>
          )}
          <Button type="submit" variant="dark">Ver periodo</Button>
          <Link
            href={`/admin/fiscal/libro/csv?${parametros}`}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50"
          >
            <Download className="h-4 w-4" strokeWidth={2} />
            Exportar a Excel (CSV)
          </Link>
        </form>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {columnas.map(([nombre, valor]) => (
          <Card key={nombre} className="p-3.5">
            <p className="text-[11px] font-medium text-ink-500">{nombre}</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-ink-900">L. {dinero(valor)}</p>
          </Card>
        ))}
        <Card className="col-span-2 border-brand-200 bg-brand-50 p-3.5">
          <p className="text-[11px] font-medium text-brand-700">Total del periodo</p>
          <p className="mt-0.5 text-base font-semibold tabular-nums text-brand-900">L. {dinero(t.total)}</p>
        </Card>
      </div>
      <p className="-mt-3 text-xs text-ink-500">
        {libro.cantidadEmitidos} documentos vigentes · {libro.cantidadAnulados} anulados (se listan, no suman). Las notas de crédito restan.
        {truncado && ` Se muestran solo los primeros ${LIMITE_LIBRO}: acorta el periodo.`}
      </p>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-xs">
          <thead className="border-b border-ink-100 bg-ink-50 text-ink-500">
            <tr>
              {["Fecha", "Documento", "Cliente", "Exonerado", "Exento", "Gravado 15%", "Gravado 18%", "ISV 15%", "ISV 18%", "Total", ""].map((h, i) => (
                <th key={i} className={`px-3 py-2.5 font-medium ${i >= 3 && i <= 9 ? "text-right" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {libro.documentos.length === 0 && (
              <tr><td colSpan={11} className="px-3 py-6 text-center text-ink-500">No hay documentos en este periodo.</td></tr>
            )}
            {libro.documentos.map((d) => {
              const anulada = d.estado === "anulada";
              const signo = d.clase === "nota_credito" ? -1 : 1;
              const m = (n: number) => dinero(signo * n);
              return (
                <tr key={d.id} className={anulada ? "bg-ink-50/60 text-ink-400 line-through" : "text-ink-800"}>
                  <td className="whitespace-nowrap px-3 py-2">{formatearFechaHora(new Date(d.fecha_emision))}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono no-underline">
                    {d.numero_completo}
                    {d.clase !== "factura" && <Badge tone="neutral" className="ml-1.5">{CLASE[d.clase] ?? d.clase}</Badge>}
                    {anulada && <Badge tone="danger" className="ml-1.5">anulada</Badge>}
                  </td>
                  <td className="max-w-48 truncate px-3 py-2">{d.cliente_nombre}{d.cliente_rtn ? ` · ${d.cliente_rtn}` : ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m(d.importe_exonerado)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m(d.importe_exento)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m(d.gravado_15)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m(d.gravado_18)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m(d.isv_15)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m(d.isv_18)}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{m(d.total)}</td>
                  <td className="px-3 py-2 text-right no-underline">
                    {!anulada ? (
                      <AnularDocumentoForm id={d.id} numero={d.numero_completo} />
                    ) : (
                      <span className="text-[11px] not-italic text-ink-500 no-underline" title={d.anulada_motivo ?? ""}>{d.anulada_motivo}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
