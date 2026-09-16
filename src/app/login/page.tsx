"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Lock, Mail } from "lucide-react";
import { buttonClass, inputClass, labelClass } from "@/lib/ui";
import { BrandMark } from "@/components/BrandMark";
import { BotonGoogle } from "@/components/BotonGoogle";
import { iniciarSesion } from "./actions";

export default function LoginPage() {
  return (
    <Suspense>
      <FormularioLogin />
    </Suspense>
  );
}

function FormularioLogin() {
  const searchParams = useSearchParams();
  const [state, formAction, pending] = useActionState(iniciarSesion, undefined as
    | { error: string }
    | undefined);

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
            Control total de tu restaurante.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-ink-300">
            Tu mesero toma la orden en segundos y la comanda sale directo a la cocina. Al cerrar,
            sabés cuánto vendiste sin sacar cuentas — en todas tus sucursales.
          </p>
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

          <h1 className="mb-1 text-lg font-semibold text-ink-900">Bienvenido de nuevo</h1>
          <p className="mb-5 text-sm text-ink-500">Ingresa con tu usuario para continuar</p>

          <BotonGoogle next={searchParams.get("next") ?? "/"} />

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-ink-100" />
            <span className="text-xs text-ink-400">o con tu correo</span>
            <div className="h-px flex-1 bg-ink-100" />
          </div>

          <form action={formAction}>
          <input type="hidden" name="next" value={searchParams.get("next") ?? "/"} />

          <div className="mb-4">
            <label className={labelClass}>Correo</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="tucorreo@negocio.com"
                className={`${inputClass} pl-9`}
              />
            </div>
          </div>

          <div className="mb-5">
            <label className={labelClass}>Contraseña</label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className={`${inputClass} pl-9`}
              />
            </div>
          </div>

          {state?.error && (
            <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {state.error}
            </p>
          )}

          <button type="submit" disabled={pending} className={`${buttonClass("primary", "lg")} w-full`}>
            {pending ? "Entrando..." : "Entrar"}
          </button>
          </form>

          <p className="mt-5 text-center text-xs text-ink-500">
            ¿No tienes cuenta?{" "}
            <a href="/registro" className="font-medium text-brand-600 hover:underline">
              Regístrate
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
