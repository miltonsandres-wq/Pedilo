"use client";

import { startTransition, useState } from "react";
import { useActionState } from "react";
import Link from "next/link";
import { User, Mail, Lock, Building2, MapPin, Phone, Check, Plus, Trash2 } from "lucide-react";
import { inputClass, labelClass, buttonClass } from "@/lib/ui";
import { BrandMark } from "@/components/BrandMark";
import { BotonGoogle } from "@/components/BotonGoogle";
import { registrarNegocio, type RegistroPayload, type SucursalRegistro } from "./actions";

const PASOS = [
  { titulo: "Tu cuenta", subtitulo: "Con qué correo y contraseña vas a entrar" },
  { titulo: "Tus sucursales", subtitulo: "Agrega uno o varios locales — los administras todos desde tu cuenta" },
] as const;

const SUCURSAL_VACIA: SucursalRegistro = { nombre: "", telefono: "", direccion: "" };

export default function RegistroPage() {
  const [paso, setPaso] = useState(0);
  const [nombreAdmin, setNombreAdmin] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmarPassword, setConfirmarPassword] = useState("");
  const [sucursales, setSucursales] = useState<SucursalRegistro[]>([{ ...SUCURSAL_VACIA }]);
  const [errorPaso, setErrorPaso] = useState<string | null>(null);
  const [state, dispatch, pending] = useActionState(registrarNegocio, undefined as
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

  function validarPasoActual(): string | null {
    if (paso === 0) {
      if (!nombreAdmin.trim()) return "Escribe tu nombre.";
      if (!email.trim()) return "Escribe tu correo.";
      if (password.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
      if (password !== confirmarPassword) return "Las contraseñas no coinciden.";
    }
    if (paso === 1) {
      if (sucursales.length === 0 || !sucursales.some((s) => s.nombre.trim())) {
        return "Agrega al menos una sucursal con nombre.";
      }
    }
    return null;
  }

  function siguiente() {
    const error = validarPasoActual();
    if (error) {
      setErrorPaso(error);
      return;
    }
    setErrorPaso(null);
    setPaso((p) => Math.min(p + 1, PASOS.length - 1));
  }

  function anterior() {
    setErrorPaso(null);
    setPaso((p) => Math.max(p - 1, 0));
  }

  function enviar() {
    const error = validarPasoActual();
    if (error) {
      setErrorPaso(error);
      return;
    }
    setErrorPaso(null);
    const payload: RegistroPayload = { nombreAdmin, email, password, sucursales };
    startTransition(() => {
      dispatch(payload);
    });
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Panel de marca — solo en pantallas grandes */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink-950 p-12 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(60rem 40rem at -10% -10%, rgba(244,98,58,0.35), transparent 60%), radial-gradient(50rem 30rem at 110% 110%, rgba(244,98,58,0.2), transparent 60%)",
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-600">
            <BrandMark className="h-6 w-6 text-white" />
          </div>
          <span className="text-sm font-semibold tracking-wide">Pedilo</span>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-3xl font-semibold leading-tight text-white">
            Empezá a operar en minutos.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-ink-300">
            Registrá tus sucursales, entrá con tu usuario de administrador y probalo en tu
            restaurante — sin instalar nada, sin compromiso.
          </p>
          <ol className="relative mt-8 space-y-3">
            {PASOS.map((p, i) => (
              <li key={p.titulo} className="flex items-center gap-3 text-sm">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    i < paso
                      ? "bg-brand-600 text-white"
                      : i === paso
                        ? "bg-white text-ink-950"
                        : "bg-ink-800 text-ink-400"
                  }`}
                >
                  {i < paso ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : i + 1}
                </span>
                <span className={i === paso ? "text-white" : "text-ink-400"}>{p.titulo}</span>
              </li>
            ))}
          </ol>
        </div>
        <p className="relative text-xs text-ink-400">
          © {new Date().getFullYear()} Pedilo
        </p>
      </div>

      {/* Formulario */}
      <div className="flex items-center justify-center bg-ink-50 px-6 py-12">
        <div className="w-full max-w-sm rounded-2xl border border-ink-100 bg-white p-7 shadow-card">
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-600">
              <BrandMark className="h-6 w-6 text-white" />
            </div>
            <span className="text-sm font-semibold text-ink-900">Pedilo</span>
          </div>

          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-600">
            Paso {paso + 1} de {PASOS.length}
          </p>
          <h1 className="mb-1 text-lg font-semibold text-ink-900">{PASOS[paso].titulo}</h1>
          <p className="mb-6 text-sm text-ink-500">{PASOS[paso].subtitulo}</p>

          {paso === 0 && (
            <div className="space-y-4">
              <BotonGoogle next="/" />
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-ink-100" />
                <span className="text-xs text-ink-400">o con tu correo</span>
                <div className="h-px flex-1 bg-ink-100" />
              </div>
              <IconField
                icon={User}
                label="Tu nombre"
                value={nombreAdmin}
                onChange={setNombreAdmin}
                placeholder="Ej. María Rodríguez"
                autoComplete="name"
              />
              <IconField
                icon={Mail}
                label="Correo"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="tucorreo@negocio.com"
                autoComplete="email"
              />
              <IconField
                icon={Lock}
                label="Contraseña"
                type="password"
                value={password}
                onChange={setPassword}
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
              />
              <IconField
                icon={Lock}
                label="Confirmar contraseña"
                type="password"
                value={confirmarPassword}
                onChange={setConfirmarPassword}
                placeholder="Repite la contraseña"
                autoComplete="new-password"
              />
            </div>
          )}

          {paso === 1 && (
            <div className="space-y-4">
              {sucursales.map((s, i) => (
                <div key={i} className="rounded-xl border border-ink-100 bg-ink-50/60 p-3.5">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                      Sucursal {i + 1}
                    </p>
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
              <button
                type="button"
                onClick={agregarSucursal}
                className={`${buttonClass("secondary", "md")} w-full`}
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                Agregar otra sucursal
              </button>
            </div>
          )}

          {(errorPaso || state?.error) && (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {errorPaso ?? state?.error}
            </p>
          )}

          <div className="mt-6 flex items-center gap-3">
            {paso > 0 && (
              <button
                type="button"
                onClick={anterior}
                disabled={pending}
                className={`${buttonClass("secondary", "lg")} flex-1`}
              >
                Atrás
              </button>
            )}
            {paso < PASOS.length - 1 ? (
              <button
                type="button"
                onClick={siguiente}
                className={`${buttonClass("primary", "lg")} flex-1`}
              >
                Continuar
              </button>
            ) : (
              <button
                type="button"
                onClick={enviar}
                disabled={pending}
                className={`${buttonClass("primary", "lg")} flex-1`}
              >
                {pending ? "Creando cuenta..." : "Crear mi cuenta"}
              </button>
            )}
          </div>

          <p className="mt-5 text-center text-xs text-ink-500">
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="font-medium text-brand-600 hover:underline">
              Inicia sesión
            </Link>
          </p>
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
  type = "text",
  placeholder,
  autoComplete,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className={`${inputClass} pl-9`}
        />
      </div>
    </div>
  );
}
