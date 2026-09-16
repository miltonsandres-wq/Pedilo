"use client";

import { startTransition, useState } from "react";
import { useActionState } from "react";
import { User, Mail, Building2, MapPin, Phone, Plus, Trash2 } from "lucide-react";
import { inputClass, labelClass, buttonClass } from "@/lib/ui";
import { BrandMark } from "@/components/BrandMark";
import { completarRegistroGoogle, type CompletarRegistroPayload } from "./actions";
import type { SucursalRegistro } from "../crear-tenant";

const SUCURSAL_VACIA: SucursalRegistro = { nombre: "", telefono: "", direccion: "" };

export function CompletarRegistroForm({ nombreInicial, correo }: { nombreInicial: string; correo: string }) {
  const [nombreAdmin, setNombreAdmin] = useState(nombreInicial);
  const [sucursales, setSucursales] = useState<SucursalRegistro[]>([{ ...SUCURSAL_VACIA }]);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [state, dispatch, pending] = useActionState(completarRegistroGoogle, undefined as
    | { error: string }
    | undefined);

  function setSucursal(i: number, campo: keyof SucursalRegistro, valor: string) {
    setSucursales((lista) => lista.map((s, idx) => (idx === i ? { ...s, [campo]: valor } : s)));
  }

  function agregarSucursal() {
    setSucursales((lista) => [...lista, { ...SUCURSAL_VACIA }]);
  }

  function quitarSucursal(i: number) {
    setSucursales((lista) => lista.filter((_, idx) => idx !== i));
  }

  function enviar() {
    if (!nombreAdmin.trim()) {
      setErrorLocal("Escribe tu nombre.");
      return;
    }
    if (!sucursales.some((s) => s.nombre.trim())) {
      setErrorLocal("Agrega al menos una sucursal con nombre.");
      return;
    }
    setErrorLocal(null);
    const payload: CompletarRegistroPayload = { nombreAdmin, sucursales };
    startTransition(() => {
      dispatch(payload);
    });
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink-950 p-12 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(60rem 40rem at -10% -10%, rgba(244,98,58,0.35), transparent 60%), radial-gradient(50rem 30rem at 110% 10%, rgba(244,98,58,0.2), transparent 60%)",
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-600">
            <BrandMark className="h-6 w-6 text-white" />
          </div>
          <span className="text-sm font-semibold tracking-wide">Pedilo</span>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-3xl font-semibold leading-tight text-white">Ya casi — solo faltan tus sucursales.</h1>
          <p className="mt-4 text-sm leading-relaxed text-ink-300">
            Tu cuenta de Google ya está conectada. Decinos tu nombre y dónde operás, y quedás
            listo para entrar al panel.
          </p>
        </div>
        <p className="relative text-xs text-ink-400">© {new Date().getFullYear()} Pedilo</p>
      </div>

      <div className="flex items-center justify-center bg-ink-50 px-6 py-12">
        <div className="w-full max-w-sm rounded-2xl border border-ink-100 bg-white p-7 shadow-card">
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600">
              <BrandMark className="h-5 w-5 text-white" />
            </div>
            <span className="text-sm font-semibold text-ink-900">Pedilo</span>
          </div>

          <h1 className="mb-1 text-lg font-semibold text-ink-900">Completa tu registro</h1>
          <p className="mb-6 text-sm text-ink-500">Un último paso y ya podés operar.</p>

          <div className="mb-4 flex items-center gap-2 rounded-lg border border-ink-100 bg-ink-50/60 px-3 py-2 text-xs text-ink-500">
            <Mail className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            Conectado como <b className="font-medium text-ink-700">{correo}</b>
          </div>

          <div className="mb-5">
            <label className={labelClass}>Tu nombre</label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                value={nombreAdmin}
                onChange={(e) => setNombreAdmin(e.target.value)}
                placeholder="Ej. María Rodríguez"
                autoComplete="name"
                className={`${inputClass} pl-9`}
              />
            </div>
          </div>

          <div className="space-y-4">
            {sucursales.map((s, i) => (
              <div key={i} className="rounded-xl border border-ink-100 bg-ink-50/60 p-3.5">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Sucursal {i + 1}</p>
                  {sucursales.length > 1 && (
                    <button
                      type="button"
                      onClick={() => quitarSucursal(i)}
                      className="rounded p-1 text-ink-400 hover:bg-red-50 hover:text-red-600"
                      aria-label="Quitar sucursal"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  )}
                </div>
                <div className="space-y-3">
                  <IconField
                    icon={Building2}
                    label="Nombre"
                    value={s.nombre}
                    onChange={(v) => setSucursal(i, "nombre", v)}
                    placeholder="Ej. Fondita — barrio"
                  />
                  <IconField
                    icon={Phone}
                    label="Teléfono (opcional)"
                    value={s.telefono}
                    onChange={(v) => setSucursal(i, "telefono", v)}
                  />
                  <IconField
                    icon={MapPin}
                    label="Dirección (opcional)"
                    value={s.direccion}
                    onChange={(v) => setSucursal(i, "direccion", v)}
                  />
                </div>
              </div>
            ))}
            <button type="button" onClick={agregarSucursal} className={`${buttonClass("secondary", "md")} w-full`}>
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Agregar otra sucursal
            </button>
          </div>

          {(errorLocal || state?.error) && (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {errorLocal ?? state?.error}
            </p>
          )}

          <button
            type="button"
            onClick={enviar}
            disabled={pending}
            className={`${buttonClass("primary", "lg")} mt-6 w-full`}
          >
            {pending ? "Creando cuenta..." : "Entrar a mi panel"}
          </button>
        </div>
      </div>
    </div>
  );
}

function IconField({
  icon: Icon,
  label,
  value,
  onChange,
  placeholder,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`${inputClass} pl-9`}
        />
      </div>
    </div>
  );
}
