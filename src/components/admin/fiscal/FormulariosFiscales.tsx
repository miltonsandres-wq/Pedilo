"use client";

import { useActionState, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Ban, Check, Power, Trash2 } from "lucide-react";
import {
  activarFacturacion,
  anularDocumento,
  eliminarRango,
  guardarEmisor,
  type EstadoAccion,
} from "@/app/admin/fiscal/actions";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { normalizarRtn } from "@/lib/fiscal/formato";
import type { RequisitoFiscal } from "@/lib/fiscal/requisitos";
import { cn } from "@/lib/ui";
import { ErrorCampo, ResultadoAccion } from "./ResultadoAccion";

// --- Pestañas -------------------------------------------------------------------

const TABS = [
  { href: "/admin/fiscal", label: "Estado" },
  { href: "/admin/fiscal/emisor", label: "Emisor" },
  { href: "/admin/fiscal/rangos", label: "Rangos CAI" },
  { href: "/admin/fiscal/libro", label: "Libro de ventas" },
];

export function FiscalTabs() {
  const pathname = usePathname();
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-ink-100">
      {TABS.map((t) => {
        const activa = t.href === "/admin/fiscal" ? pathname === t.href : pathname?.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition",
              activa ? "border-brand-600 text-brand-700" : "border-transparent text-ink-500 hover:text-ink-800"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

// --- Activación -----------------------------------------------------------------

export function FormularioActivacion({ activa, requisitos }: { activa: boolean; requisitos: RequisitoFiscal[] }) {
  const [estado, accion, pendiente] = useActionState<EstadoAccion | null, FormData>(activarFacturacion, null);
  const faltan = requisitos.filter((r) => !r.cumple).length;

  return (
    <form action={accion} className="space-y-3">
      {!activa && (
        <ul className="space-y-1.5">
          {requisitos.map((r) => (
            <li key={r.clave} className={cn("flex items-start gap-2 text-sm", r.cumple ? "text-libre-text" : "text-ink-600")}>
              {r.cumple ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.5} />
              ) : (
                <span className="mx-1.5 mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
              )}
              {r.texto}
            </li>
          ))}
        </ul>
      )}

      {activa ? (
        <label className="flex items-start gap-2 text-sm text-ink-600">
          <input type="checkbox" name="confirmar" className="mt-0.5 h-4 w-4 rounded border-ink-300 text-brand-600" />
          Entiendo que al desactivar dejarán de emitirse facturas fiscales en el POS.
        </label>
      ) : (
        <p className="text-xs text-ink-500">
          Al activarla, el POS solo cobra si la caja tiene un CAI vigente: no hay modo permisivo.
        </p>
      )}

      <input type="hidden" name="activar" value={activa ? "false" : "true"} />
      <ResultadoAccion estado={estado} />
      <Button type="submit" variant={activa ? "danger" : "primary"} disabled={pendiente || (!activa && faltan > 0)}>
        <Power className="h-4 w-4" strokeWidth={2} />
        {activa ? "Desactivar facturación fiscal" : "Activar facturación fiscal"}
      </Button>
    </form>
  );
}

// --- Emisor ---------------------------------------------------------------------

export interface ValoresEmisor {
  razon_social: string | null;
  nombre_comercial: string | null;
  rtn: string | null;
  direccion_fiscal: string | null;
  telefono: string | null;
  correo: string | null;
}

export function FormularioEmisor({
  sucursalId,
  valores,
  heredados,
}: {
  /** null = datos del negocio; con id = override solo para esa sucursal. */
  sucursalId: string | null;
  valores: ValoresEmisor | null;
  /** Lo que hereda una sucursal cuando deja un campo vacío (se muestra como pista). */
  heredados?: ValoresEmisor | null;
}) {
  const [estado, accion, pendiente] = useActionState<EstadoAccion | null, FormData>(guardarEmisor, null);
  const [rtn, setRtn] = useState(valores?.rtn ?? "");
  const digitos = normalizarRtn(rtn).length;
  const esOverride = sucursalId !== null;
  const pista = (k: keyof ValoresEmisor) => (esOverride && heredados?.[k] ? `Hereda: ${heredados[k]}` : undefined);

  return (
    <form action={accion} className="grid grid-cols-1 gap-3 sm:grid-cols-2" noValidate>
      <input type="hidden" name="sucursal_id" value={sucursalId ?? ""} />
      <div>
        <Field label={`Razón social${esOverride ? "" : " *"}`} name="razon_social" defaultValue={valores?.razon_social ?? ""} placeholder={pista("razon_social")} />
        <ErrorCampo texto={estado?.errores?.razonSocial} />
      </div>
      <Field label="Nombre comercial" name="nombre_comercial" defaultValue={valores?.nombre_comercial ?? ""} placeholder={pista("nombre_comercial")} />
      <div>
        <Field
          label={`RTN (14 dígitos)${esOverride ? "" : " *"}`}
          name="rtn"
          value={rtn}
          onChange={(e) => setRtn(e.target.value)}
          inputMode="numeric"
          placeholder={pista("rtn") ?? "0801-1999-123456"}
          className="font-mono"
        />
        <div className="mt-1 flex justify-between text-xs">
          <span className="text-red-600">{estado?.errores?.rtn}</span>
          <span className={digitos === 14 ? "text-libre-text" : "text-ink-400"}>{digitos}/14</span>
        </div>
      </div>
      <div>
        <Field label={`Dirección fiscal${esOverride ? "" : " *"}`} name="direccion_fiscal" defaultValue={valores?.direccion_fiscal ?? ""} placeholder={pista("direccion_fiscal")} />
        <ErrorCampo texto={estado?.errores?.direccionFiscal} />
      </div>
      <Field label="Teléfono" name="telefono" defaultValue={valores?.telefono ?? ""} placeholder={pista("telefono")} />
      <div>
        <Field label="Correo" name="correo" type="email" defaultValue={valores?.correo ?? ""} placeholder={pista("correo")} />
        <ErrorCampo texto={estado?.errores?.correo} />
      </div>
      <div className="col-span-full space-y-2">
        <ResultadoAccion estado={estado} />
        <Button type="submit" disabled={pendiente}>Guardar</Button>
      </div>
    </form>
  );
}

// --- Anular documento / borrar rango --------------------------------------------

export function AnularDocumentoForm({ id, numero }: { id: string; numero: string }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, pendiente] = useActionState<EstadoAccion | null, FormData>(anularDocumento, null);

  if (!abierto) {
    return (
      <Button size="sm" variant="danger" type="button" onClick={() => setAbierto(true)}>
        <Ban className="h-3.5 w-3.5" strokeWidth={2} />
        Anular
      </Button>
    );
  }
  return (
    <form action={accion} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input
        name="motivo"
        required
        autoFocus
        placeholder={`Motivo de anular ${numero}`}
        className="w-64 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
      />
      <Button size="sm" variant="danger" type="submit" disabled={pendiente}>Confirmar anulación</Button>
      <Button size="sm" variant="ghost" type="button" onClick={() => setAbierto(false)}>Cancelar</Button>
      {estado?.error && <span className="w-full text-xs text-red-600">{estado.error}</span>}
    </form>
  );
}

export function BotonEliminarRango({ id }: { id: string }) {
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  return (
    <span className="inline-flex flex-col items-end">
      <Button
        size="sm"
        variant="danger"
        type="button"
        disabled={trabajando}
        onClick={async () => {
          if (!window.confirm("¿Borrar este rango? Solo se puede si todavía no emitió ningún documento.")) return;
          setTrabajando(true);
          const r = await eliminarRango(id);
          setTrabajando(false);
          setError(r.ok ? null : (r.error ?? "No se pudo borrar."));
        }}
      >
        <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
        Borrar
      </Button>
      {error && <span className="mt-1 max-w-56 text-right text-xs text-red-600">{error}</span>}
    </span>
  );
}
