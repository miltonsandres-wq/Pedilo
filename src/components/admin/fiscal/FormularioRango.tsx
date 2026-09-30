"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { crearRango, type EstadoAccion } from "@/app/admin/fiscal/actions";
import { Button } from "@/components/ui/Button";
import { inputClass, labelClass, cn } from "@/lib/ui";
import { formatearNumeroDocumento, normalizarCai, rangosTraslapan } from "@/lib/fiscal/formato";
import { validarEntradaRango, type CampoRango } from "@/lib/fiscal/validaciones";
import { ErrorCampo, ResultadoAccion } from "./ResultadoAccion";

export interface SucursalOpcion {
  id: string;
  nombre: string;
  /** Caja de cobro de la sucursal (se crea sola): sirve para mostrar cómo quedan los números. */
  establecimiento: string;
  puntoEmision: string;
}

/** Rango ya cargado: sirve para avisar de traslapes antes de guardar. */
export interface RangoExistente {
  sucursalId: string;
  tipoDoc: string;
  desde: number;
  hasta: number;
}

const base = { clase: "factura", tipoDoc: "01", cai: "", desde: "", hasta: "", fechaLimite: "" };

/**
 * Carga de un rango CAI autorizado por el SAR. Valida en vivo (formato del CAI,
 * desde/hasta, fecha límite, código de documento) y muestra cómo quedarán el
 * primer y el último número antes de guardar; el servidor repite las
 * validaciones y la base impide traslapes. Si el negocio tiene UNA sola
 * sucursal no se pregunta cuál: es esa.
 */
export function FormularioRango({
  sucursales,
  hoyHN,
  existentes = [],
}: {
  sucursales: SucursalOpcion[];
  hoyHN: string;
  existentes?: RangoExistente[];
}) {
  const unica = sucursales.length === 1 ? sucursales[0].id : "";
  const inicial = { ...base, sucursalId: unica };
  const [estado, accion, pendiente] = useActionState<EstadoAccion | null, FormData>(crearRango, null);
  const [v, setV] = useState(inicial);
  const [tocados, setTocados] = useState<Partial<Record<CampoRango, boolean>>>({});

  useEffect(() => {
    if (estado?.ok) {
      setV({ ...base, sucursalId: unica });
      setTocados({});
    }
  }, [estado, unica]);

  const validacion = validarEntradaRango(v, hoyHN);
  const sucursal = sucursales.find((s) => s.id === v.sucursalId);

  // Traslape con un rango ya cargado para la misma sucursal y el mismo tipo de documento
  let traslape: string | undefined;
  if (sucursal && validacion.ok && validacion.valor) {
    const choque = existentes.find(
      (r) => r.sucursalId === sucursal.id && r.tipoDoc === validacion.valor!.tipoDoc && rangosTraslapan(r, validacion.valor!)
    );
    if (choque) traslape = `Se traslapa con el rango ${choque.desde}–${choque.hasta} que ya cargaste.`;
  }

  const errorDe = (c: CampoRango) =>
    (tocados[c] ? validacion.errores[c] : undefined) ?? (c === "hasta" ? traslape : undefined) ?? estado?.errores?.[c];
  const tocar = (c: CampoRango) => setTocados((t) => ({ ...t, [c]: true }));
  const cambiar = <K extends keyof typeof inicial>(campo: K, valor: string) => setV((x) => ({ ...x, [campo]: valor }));

  let vista: string | null = null;
  if (sucursal && validacion.ok && validacion.valor) {
    try {
      const num = (n: number) =>
        formatearNumeroDocumento({
          establecimiento: sucursal.establecimiento,
          puntoEmision: sucursal.puntoEmision,
          tipoDoc: validacion.valor!.tipoDoc,
          correlativo: n,
        });
      vista = `${num(validacion.valor.desde)}  →  ${num(validacion.valor.hasta)}  (${(validacion.valor.hasta - validacion.valor.desde + 1).toLocaleString("es-HN")} documentos)`;
    } catch {
      vista = null;
    }
  }

  const caiNormalizado = normalizarCai(v.cai);

  return (
    <form action={accion} className="grid grid-cols-1 gap-3 sm:grid-cols-2" noValidate>
      {sucursales.length > 1 ? (
        <div className="col-span-full">
          <label className={labelClass} htmlFor="rango-sucursal">Sucursal</label>
          <select
            id="rango-sucursal"
            name="sucursal_id"
            value={v.sucursalId}
            onChange={(e) => cambiar("sucursalId", e.target.value)}
            onBlur={() => tocar("sucursalId")}
            className={inputClass}
          >
            <option value="">Elige una sucursal…</option>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
          <ErrorCampo texto={errorDe("sucursalId")} />
        </div>
      ) : (
        <input type="hidden" name="sucursal_id" value={unica} />
      )}

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
