"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Building2, Check, FileText, Loader2, Rocket, Store } from "lucide-react";
import { finalizarConfiguracion, omitirConfiguracion } from "@/app/configuracion-inicial/actions";
import { SucursalLogoUploader } from "@/components/admin/SucursalLogoUploader";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { normalizarCai, normalizarRtn } from "@/lib/fiscal/formato";
import { validarEmisor, validarEntradaRango, type EntradaEmisor } from "@/lib/fiscal/validaciones";
import { cn } from "@/lib/ui";

export interface SucursalInicial {
  id: string;
  nombre: string;
  telefono: string;
  direccion: string;
  logoUrl: string | null;
}

type IdPaso = "negocio" | "facturacion" | "fiscal" | "cai" | "listo";

const TITULOS: Record<IdPaso, string> = {
  negocio: "Tu negocio",
  facturacion: "Facturación",
  fiscal: "Datos fiscales",
  cai: "Tu CAI",
  listo: "Listo",
};

interface RangoForm {
  cai: string;
  desde: string;
  hasta: string;
  fechaLimite: string;
}
const RANGO_VACIO: RangoForm = { cai: "", desde: "", hasta: "", fechaLimite: "" };
const rangoVacio = (r: RangoForm) => !r.cai.trim() && !r.desde.trim() && !r.hasta.trim() && !r.fechaLimite.trim();

/**
 * Configuración inicial de un negocio recién registrado, en pasos: datos de cada
 * sucursal (con logo), si factura con CAI (datos fiscales + CAI por sucursal) y
 * un resumen. Si no factura con CAI, se salta lo fiscal y queda todo listo; puede
 * configurarlo después desde el panel.
 */
export function AsistenteInicial({
  negocio,
  hoyHN,
  sucursales,
}: {
  negocio: string;
  hoyHN: string;
  sucursales: SucursalInicial[];
}) {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const [intento, setIntento] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [factura, setFactura] = useState<boolean | null>(null);
  const [datos, setDatos] = useState(sucursales.map((s) => ({ id: s.id, nombre: s.nombre, telefono: s.telefono, direccion: s.direccion })));
  const [emisor, setEmisor] = useState<EntradaEmisor>({
    razonSocial: negocio,
    nombreComercial: negocio,
    rtn: "",
    direccionFiscal: sucursales[0]?.direccion ?? "",
    telefono: sucursales[0]?.telefono ?? "",
    correo: "",
  });
  const [rangos, setRangos] = useState<Record<string, RangoForm>>(
    Object.fromEntries(sucursales.map((s) => [s.id, { ...RANGO_VACIO }]))
  );
  const varias = sucursales.length > 1;

  const pasos: IdPaso[] = factura ? ["negocio", "facturacion", "fiscal", "cai", "listo"] : ["negocio", "facturacion", "listo"];
  const paso = pasos[Math.min(idx, pasos.length - 1)];

  // --- validación de cada paso ---
  const validacionEmisor = validarEmisor(emisor);
  const validacionRangos = sucursales.map((s) => {
    const r = rangos[s.id] ?? RANGO_VACIO;
    if (rangoVacio(r)) return { id: s.id, vacio: true as const, v: null };
    return {
      id: s.id,
      vacio: false as const,
      v: validarEntradaRango({ clase: "factura", tipoDoc: "01", ...r, sucursalId: s.id }, hoyHN),
    };
  });
  const rangosListos = validacionRangos.filter((x) => !x.vacio && x.v?.ok).length;
  const rangosConError = validacionRangos.some((x) => !x.vacio && !x.v?.ok);

  function problemaDelPaso(): string | null {
    if (paso === "negocio" && datos.some((d) => !d.nombre.trim())) return "Cada sucursal necesita un nombre.";
    if (paso === "facturacion" && factura === null) return "Elige una opción para continuar.";
    if (paso === "fiscal" && !validacionEmisor.ok) return "Revisa los datos fiscales marcados.";
    if (paso === "cai") {
      if (rangosConError) return "Revisa los datos del CAI marcados.";
      if (rangosListos === 0) return "Carga el CAI de al menos una sucursal, o vuelve atrás y elige «No facturo con CAI».";
    }
    return null;
  }

  function siguiente() {
    setIntento(true);
    if (problemaDelPaso()) return;
    setIntento(false);
    setIdx((i) => i + 1);
  }

  async function finalizar() {
    setEnviando(true);
    setError(null);
    const r = await finalizarConfiguracion({
      sucursales: datos,
      factura: factura === true,
      emisor: factura ? emisor : undefined,
      rangos: factura ? sucursales.map((s) => ({ sucursalId: s.id, ...(rangos[s.id] ?? RANGO_VACIO) })) : undefined,
    }).catch(() => ({ ok: false, error: "No se pudo guardar. Revisa tu conexión e inténtalo de nuevo." }));
    if (!r.ok) {
      setError(r.error ?? "No se pudo guardar.");
      setEnviando(false);
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  const mensaje = intento ? problemaDelPaso() : null;
  const cambiarDato = (id: string, campo: "nombre" | "telefono" | "direccion", valor: string) =>
    setDatos((prev) => prev.map((d) => (d.id === id ? { ...d, [campo]: valor } : d)));
  const cambiarRango = (id: string, campo: keyof RangoForm, valor: string) =>
    setRangos((prev) => ({ ...prev, [id]: { ...(prev[id] ?? RANGO_VACIO), [campo]: valor } }));
  const errEmisor = (c: keyof EntradaEmisor) => (intento ? validacionEmisor.errores[c] : undefined);

  return (
    <div className="min-h-screen bg-ink-50 px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600">
              <BrandMark className="h-5 w-5 text-white" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-ink-900">Configura tu negocio</p>
              <p className="text-[11px] text-ink-500">Solo tomará un par de minutos</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void omitirConfiguracion()}
            className="text-xs font-medium text-ink-500 underline hover:text-ink-800"
          >
            Configurar después
          </button>
        </div>

        <ol className="mb-5 flex items-center gap-2" aria-label="Pasos">
          {pasos.map((p, i) => (
            <li key={p} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                  i < idx ? "bg-brand-600 text-white" : i === idx ? "bg-ink-900 text-white" : "bg-ink-200 text-ink-500"
                )}
              >
                {i < idx ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <span className={cn("hidden text-xs font-medium sm:block", i === idx ? "text-ink-900" : "text-ink-400")}>
                {TITULOS[p]}
              </span>
              {i < pasos.length - 1 && <span className="h-px flex-1 bg-ink-200" />}
            </li>
          ))}
        </ol>

        <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-card">
          {paso === "negocio" && (
            <section>
              <h1 className="flex items-center gap-2 text-lg font-semibold text-ink-900">
                <Store className="h-5 w-5 text-brand-600" strokeWidth={2} />
                {varias ? "Tus sucursales" : "Datos de tu negocio"}
              </h1>
              <p className="mb-4 mt-1 text-sm text-ink-500">
                Revisa estos datos y sube tu logo: sale en tu carta digital y en los tickets impresos.
              </p>
              <div className="space-y-5">
                {sucursales.map((s) => {
                  const d = datos.find((x) => x.id === s.id)!;
                  return (
                    <div key={s.id} className={cn(varias && "rounded-xl border border-ink-100 p-4")}>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field
                          label={varias ? "Nombre de la sucursal" : "Nombre del negocio"}
                          name={`nombre-${s.id}`}
                          value={d.nombre}
                          onChange={(e) => cambiarDato(s.id, "nombre", e.target.value)}
                        />
                        <Field
                          label="Teléfono"
                          name={`telefono-${s.id}`}
                          value={d.telefono}
                          onChange={(e) => cambiarDato(s.id, "telefono", e.target.value)}
                        />
                        <Field
                          label="Dirección"
                          name={`direccion-${s.id}`}
                          value={d.direccion}
                          onChange={(e) => cambiarDato(s.id, "direccion", e.target.value)}
                          full
                        />
                      </div>
                      <div className="mt-3">
                        <p className="mb-1.5 text-xs font-medium text-ink-500">Logo</p>
                        <SucursalLogoUploader sucursalId={s.id} logoUrl={s.logoUrl} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {paso === "facturacion" && (
            <section>
              <h1 className="flex items-center gap-2 text-lg font-semibold text-ink-900">
                <FileText className="h-5 w-5 text-brand-600" strokeWidth={2} />
                ¿Facturas con CAI?
              </h1>
              <p className="mb-4 mt-1 text-sm text-ink-500">
                El CAI es la autorización del SAR para emitir facturas. Si lo tienes, lo dejamos configurado ahora y cada
                cobro emite su factura.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { valor: true, titulo: "Sí, facturo con CAI", texto: "Cargamos tus datos fiscales y tu rango autorizado." },
                  { valor: false, titulo: "No facturo con CAI", texto: "Queda todo listo para vender; lo activas cuando quieras." },
                ].map((o) => (
                  <button
                    key={String(o.valor)}
                    type="button"
                    onClick={() => setFactura(o.valor)}
                    aria-pressed={factura === o.valor}
                    className={cn(
                      "rounded-xl border p-4 text-left transition",
                      factura === o.valor ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/20" : "border-ink-200 hover:bg-ink-50"
                    )}
                  >
                    <p className="text-sm font-semibold text-ink-900">{o.titulo}</p>
                    <p className="mt-0.5 text-xs text-ink-500">{o.texto}</p>
                  </button>
                ))}
              </div>
            </section>
          )}

          {paso === "fiscal" && (
            <section>
              <h1 className="flex items-center gap-2 text-lg font-semibold text-ink-900">
                <Building2 className="h-5 w-5 text-brand-600" strokeWidth={2} />
                Datos fiscales
              </h1>
              <p className="mb-4 mt-1 text-sm text-ink-500">Tal como están ante el SAR: salen impresos en tus facturas.</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Field label="Razón social *" name="razon_social" value={emisor.razonSocial} onChange={(e) => setEmisor({ ...emisor, razonSocial: e.target.value })} />
                  {errEmisor("razonSocial") && <p className="mt-1 text-xs text-red-600">{errEmisor("razonSocial")}</p>}
                </div>
                <Field label="Nombre comercial" name="nombre_comercial" value={emisor.nombreComercial} onChange={(e) => setEmisor({ ...emisor, nombreComercial: e.target.value })} />
                <div>
                  <Field
                    label="RTN (14 dígitos) *"
                    name="rtn"
                    value={emisor.rtn}
                    onChange={(e) => setEmisor({ ...emisor, rtn: e.target.value })}
                    inputMode="numeric"
                    placeholder="0801-1999-123456"
                    className="font-mono"
                  />
                  <div className="mt-1 flex justify-between text-xs">
                    <span className="text-red-600">{errEmisor("rtn")}</span>
                    <span className={normalizarRtn(emisor.rtn).length === 14 ? "text-libre-text" : "text-ink-400"}>
                      {normalizarRtn(emisor.rtn).length}/14
                    </span>
                  </div>
                </div>
                <div>
                  <Field label="Dirección fiscal *" name="direccion_fiscal" value={emisor.direccionFiscal} onChange={(e) => setEmisor({ ...emisor, direccionFiscal: e.target.value })} />
                  {errEmisor("direccionFiscal") && <p className="mt-1 text-xs text-red-600">{errEmisor("direccionFiscal")}</p>}
                </div>
                <Field label="Teléfono" name="telefono_fiscal" value={emisor.telefono} onChange={(e) => setEmisor({ ...emisor, telefono: e.target.value })} />
                <div>
                  <Field label="Correo" name="correo_fiscal" type="email" value={emisor.correo} onChange={(e) => setEmisor({ ...emisor, correo: e.target.value })} />
                  {errEmisor("correo") && <p className="mt-1 text-xs text-red-600">{errEmisor("correo")}</p>}
                </div>
              </div>
            </section>
          )}

          {paso === "cai" && (
            <section>
              <h1 className="flex items-center gap-2 text-lg font-semibold text-ink-900">
                <FileText className="h-5 w-5 text-brand-600" strokeWidth={2} />
                Tu CAI
              </h1>
              <p className="mb-4 mt-1 text-sm text-ink-500">
                Copia los datos de la resolución del SAR.
                {varias && " Carga el de cada sucursal; las que dejes vacías las configuras después."}
              </p>
              <div className="space-y-5">
                {sucursales.map((s) => {
                  const r = rangos[s.id] ?? RANGO_VACIO;
                  const val = validacionRangos.find((x) => x.id === s.id);
                  const errores = intento && val && !val.vacio ? (val.v?.errores ?? {}) : {};
                  return (
                    <div key={s.id} className={cn(varias && "rounded-xl border border-ink-100 p-4")}>
                      {varias && <p className="mb-2 text-sm font-semibold text-ink-900">{datos.find((d) => d.id === s.id)?.nombre}</p>}
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="col-span-full">
                          <Field
                            label="CAI"
                            name={`cai-${s.id}`}
                            value={r.cai}
                            onChange={(e) => cambiarRango(s.id, "cai", e.target.value.toUpperCase())}
                            placeholder="XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XX"
                            autoComplete="off"
                            className="font-mono uppercase"
                          />
                          <div className="mt-1 flex justify-between text-xs">
                            <span className="text-red-600">{errores.cai}</span>
                            <span className="text-ink-400">{normalizarCai(r.cai).length}/37</span>
                          </div>
                        </div>
                        <div>
                          <Field label="Desde (número)" name={`desde-${s.id}`} value={r.desde} inputMode="numeric" placeholder="1" onChange={(e) => cambiarRango(s.id, "desde", e.target.value.replace(/\D/g, ""))} />
                          {errores.desde && <p className="mt-1 text-xs text-red-600">{errores.desde}</p>}
                        </div>
                        <div>
                          <Field label="Hasta (número)" name={`hasta-${s.id}`} value={r.hasta} inputMode="numeric" placeholder="500" onChange={(e) => cambiarRango(s.id, "hasta", e.target.value.replace(/\D/g, ""))} />
                          {errores.hasta && <p className="mt-1 text-xs text-red-600">{errores.hasta}</p>}
                        </div>
                        <div>
                          <Field label="Fecha límite de emisión" name={`fecha-${s.id}`} type="date" value={r.fechaLimite} onChange={(e) => cambiarRango(s.id, "fechaLimite", e.target.value)} />
                          {errores.fechaLimite && <p className="mt-1 text-xs text-red-600">{errores.fechaLimite}</p>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {paso === "listo" && (
            <section>
              <h1 className="flex items-center gap-2 text-lg font-semibold text-ink-900">
                <Rocket className="h-5 w-5 text-brand-600" strokeWidth={2} />
                ¡Todo listo!
              </h1>
              <p className="mb-4 mt-1 text-sm text-ink-500">Esto es lo que vamos a dejar configurado:</p>
              <ul className="space-y-2 text-sm text-ink-700">
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" strokeWidth={2.5} />
                  <span>
                    {varias ? "Sucursales" : "Negocio"}: <b>{datos.map((d) => d.nombre).join(", ")}</b>
                  </span>
                </li>
                {factura ? (
                  <>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" strokeWidth={2.5} />
                      <span>
                        Facturación con CAI para <b>{emisor.razonSocial}</b> (RTN {normalizarRtn(emisor.rtn)})
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" strokeWidth={2.5} />
                      <span>
                        CAI cargado para {rangosListos} de {sucursales.length} {sucursales.length === 1 ? "sucursal" : "sucursales"}
                        {rangosListos === sucursales.length ? ": se activará la facturación." : ": activarás la facturación cuando completes el resto."}
                      </span>
                    </li>
                  </>
                ) : (
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" strokeWidth={2.5} />
                    <span>Sin facturación con CAI por ahora: podrás activarla en Facturación fiscal cuando la necesites.</span>
                  </li>
                )}
              </ul>
            </section>
          )}

          {(mensaje || error) && (
            <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error ?? mensaje}
            </p>
          )}

          <div className="mt-6 flex items-center gap-2">
            {idx > 0 && (
              <Button
                variant="secondary"
                type="button"
                disabled={enviando}
                onClick={() => {
                  setIntento(false);
                  setError(null);
                  setIdx((i) => i - 1);
                }}
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={2} />
                Anterior
              </Button>
            )}
            <span className="flex-1" />
            {paso !== "listo" ? (
              <Button type="button" onClick={siguiente}>
                Siguiente
                <ArrowRight className="h-4 w-4" strokeWidth={2} />
              </Button>
            ) : (
              <Button type="button" disabled={enviando} onClick={() => void finalizar()}>
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} /> : <Rocket className="h-4 w-4" strokeWidth={2} />}
                Finalizar y entrar al panel
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
