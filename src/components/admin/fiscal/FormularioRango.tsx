"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { crearRango, type EstadoAccion } from "@/app/admin/fiscal/actions";
import { Button } from "@/components/ui/Button";
import { inputClass, labelClass, cn } from "@/lib/ui";
import { formatearNumeroDocumento, normalizarCai, rangosTraslapan } from "@/lib/fiscal/formato";
import { validarEntradaRango, type CampoRango } from "@/lib/fiscal/validaciones";
import { ErrorCampo, ResultadoAccion } from "./ResultadoAccion";

export interface CajaOpcion {
  id: string;
  nombre: string;
  sucursalNombre: string;
  establecimiento: string;
  puntoEmision: string;
}

/** Rango ya cargado: sirve para avisar de traslapes antes de guardar. */
export interface RangoExistente {
  establecimiento: string;
  puntoEmision: string;
  tipoDoc: string;
  desde: number;
  hasta: number;
}

const VACIO = { dispositivoId: "", clase: "factura", tipoDoc: "01", cai: "", desde: "", hasta: "", fechaLimite: "" };

/**
 * Carga de un rango CAI autorizado por el SAR. Valida en vivo (formato del CAI,
 * desde/hasta, fecha límite, código de documento) y muestra cómo quedarán el
 * primer y el último número antes de guardar; el servidor repite las
 * validaciones y la base impide traslapes.
 */
export function FormularioRango({
  cajas,
  hoyHN,
  existentes = [],
}: {
  cajas: CajaOpcion[];
  hoyHN: string;
  existentes?: RangoExistente[];
}) {
  const [estado, accion, pendiente] = useActionState<EstadoAccion | null, FormData>(crearRango, null);
  const [v, setV] = useState(VACIO);
  const [tocados, setTocados] = useState<Partial<Record<CampoRango, boolean>>>({});

  useEffect(() => {
    if (estado?.ok) {
      setV(VACIO);
      setTocados({});
    }
  }, [estado]);

  const validacion = validarEntradaRango(v, hoyHN);
  const cajaElegida = cajas.find((c) => c.id === v.dispositivoId);

  // Traslape con un rango ya cargado para la misma caja y el mismo tipo de documento
  let traslape: string | undefined;
  if (cajaElegida && validacion.ok && validacion.valor) {
    const choque = existentes.find(
      (r) =>
        r.establecimiento === cajaElegida.establecimiento &&
        r.puntoEmision === cajaElegida.puntoEmision &&
        r.tipoDoc === validacion.valor!.tipoDoc &&
        rangosTraslapan(r, validacion.valor!)
    );
    if (choque) traslape = `Se traslapa con el rango ${choque.desde}–${choque.hasta} que ya cargaste para esta caja.`;
  }

  const errorDe = (c: CampoRango) =>
    (tocados[c] ? validacion.errores[c] : undefined) ?? (c === "hasta" ? traslape : undefined) ?? estado?.errores?.[c];
  const tocar = (c: CampoRango) => setTocados((t) => ({ ...t, [c]: true }));
  const cambiar = <K extends keyof typeof VACIO>(campo: K, valor: string) => setV((x) => ({ ...x, [campo]: valor }));

  const caja = cajaElegida;
  let vista: string | null = null;
  if (caja && validacion.ok && validacion.valor) {
    try {
      const num = (n: number) =>
        formatearNumeroDocumento({ establecimiento: caja.establecimiento, puntoEmision: caja.puntoEmision, tipoDoc: validacion.valor!.tipoDoc, correlativo: n });
      vista = `${num(validacion.valor.desde)}  →  ${num(validacion.valor.hasta)}  (${(validacion.valor.hasta - validacion.valor.desde + 1).toLocaleString("es-HN")} documentos)`;
    } catch {
      vista = null;
    }
  }

  const caiNormalizado = normalizarCai(v.cai);

  return (
    <form action={accion} className="grid grid-cols-1 gap-3 sm:grid-cols-2" noValidate>
      <div className="col-span-full">
        <label className={labelClass} htmlFor="rango-caja">Caja (punto de emisión)</label>
        <select
          id="rango-caja"
          name="dispositivo_id"
          value={v.dispositivoId}
          onChange={(e) => cambiar("dispositivoId", e.target.value)}
          onBlur={() => tocar("dispositivoId")}
          className={inputClass}
        >
          <option value="">Elige una caja…</option>
          {cajas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.sucursalNombre} · {c.nombre} ({c.establecimiento}-{c.puntoEmision})
            </option>
          ))}
        </select>
        <ErrorCampo texto={errorDe("dispositivoId")} />
        {cajas.length === 0 && (
          <p className="mt-1 text-xs text-amber-700">Primero crea una caja en la pestaña «Cajas».</p>
        )}
      </div>

      <div>
        <label className={labelClass} htmlFor="rango-clase">Documento</label>
        <select
          id="rango-clase"
          name="clase"
          value={v.clase}
          onChange={(e) => setV((x) => ({ ...x, clase: e.target.value, tipoDoc: e.target.value === "factura" ? "01" : "" }))}
          className={inputClass}
        >
          <option value="factura">Factura</option>
          <option value="nota_credito">Nota de crédito</option>
          <option value="nota_debito">Nota de débito</option>
        </select>
      </div>

      <div>
        <label className={labelClass} htmlFor="rango-tipo">Código del documento (2 dígitos)</label>
        <input
          id="rango-tipo"
          name="tipo_doc"
          value={v.tipoDoc}
          onChange={(e) => cambiar("tipoDoc", e.target.value.replace(/\D/g, "").slice(0, 2))}
          onBlur={() => tocar("tipoDoc")}
          readOnly={v.clase === "factura"}
          inputMode="numeric"
          placeholder={v.clase === "factura" ? "01" : "El que te dio el SAR"}
          className={cn(inputClass, "font-mono")}
        />
        <ErrorCampo texto={errorDe("tipoDoc")} />
      </div>

      <div className="col-span-full">
        <label className={labelClass} htmlFor="rango-cai">CAI</label>
        <input
          id="rango-cai"
          name="cai"
          value={v.cai}
          onChange={(e) => cambiar("cai", e.target.value.toUpperCase())}
          onBlur={() => tocar("cai")}
          placeholder="XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XX"
          autoComplete="off"
          spellCheck={false}
          className={cn(inputClass, "font-mono uppercase tracking-wide")}
        />
        <div className="mt-1 flex items-center justify-between text-xs">
          <span className="text-red-600">{errorDe("cai")}</span>
          <span className={caiNormalizado.length === 37 && !validacion.errores.cai ? "text-libre-text" : "text-ink-400"}>
            {caiNormalizado.length}/37
          </span>
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="rango-desde">Desde (número)</label>
        <input
          id="rango-desde"
          name="desde"
          value={v.desde}
          onChange={(e) => cambiar("desde", e.target.value.replace(/\D/g, ""))}
          onBlur={() => tocar("desde")}
          inputMode="numeric"
          placeholder="1"
          className={inputClass}
        />
        <ErrorCampo texto={errorDe("desde")} />
      </div>

      <div>
        <label className={labelClass} htmlFor="rango-hasta">Hasta (número)</label>
        <input
          id="rango-hasta"
          name="hasta"
          value={v.hasta}
          onChange={(e) => cambiar("hasta", e.target.value.replace(/\D/g, ""))}
          onBlur={() => tocar("hasta")}
          inputMode="numeric"
          placeholder="500"
          className={inputClass}
        />
        <ErrorCampo texto={errorDe("hasta")} />
      </div>

      <div>
        <label className={labelClass} htmlFor="rango-fecha">Fecha límite de emisión</label>
        <input
          id="rango-fecha"
          name="fecha_limite"
          type="date"
          value={v.fechaLimite}
          onChange={(e) => cambiar("fechaLimite", e.target.value)}
          onBlur={() => tocar("fechaLimite")}
          className={inputClass}
        />
        <ErrorCampo texto={errorDe("fechaLimite")} />
      </div>

      {vista && (
        <p className="col-span-full rounded-lg bg-ink-50 px-3 py-2 font-mono text-xs text-ink-600" data-testid="vista-rango">
          {vista}
        </p>
      )}

      <div className="col-span-full space-y-2">
        <ResultadoAccion estado={estado} />
        <Button type="submit" disabled={pendiente || !validacion.ok || !!traslape}>
          <Plus className="h-4 w-4" strokeWidth={2} />
          {pendiente ? "Guardando…" : "Cargar rango"}
        </Button>
      </div>
    </form>
  );
}
