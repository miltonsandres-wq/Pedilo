"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, Menu, X } from "lucide-react";
import { AdminNav } from "./AdminNav";
import { BrandMark } from "@/components/BrandMark";
import { CerrarSesionBoton } from "@/components/CerrarSesionBoton";

/**
 * El sidebar fijo de 256px solo cabe en pantallas grandes. En celular se
 * esconde detrás de una barra superior + botón de menú, y aparece como un
 * cajón (drawer) encima del contenido — el mismo patrón que Toast/Square
 * usan en su panel de admin en móvil.
 */
export function AdminShell({
  usuarioNombre,
  usuarioEmail,
  children,
}: {
  usuarioNombre: string;
  usuarioEmail: string | null;
  children: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);

  const marca = (
    <div className="mb-6 flex items-center gap-2.5 px-1">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600">
        <BrandMark className="h-5 w-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold leading-tight">Pedilo</p>
        <p className="text-[11px] text-ink-400">Panel del dueño</p>
      </div>
    </div>
  );

  const pie = (
    <div className="mt-auto space-y-3 pt-4">
      <Link
        href="/pos"
        onClick={() => setAbierto(false)}
        className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-300 hover:bg-ink-800 hover:text-white"
      >
        <ArrowLeftRight className="h-4 w-4" strokeWidth={2} />
        Ir al POS
      </Link>
      <div className="flex items-center justify-between rounded-lg bg-ink-900 px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-white">{usuarioNombre}</p>
          <p className="truncate text-[11px] text-ink-400">{usuarioEmail}</p>
        </div>
        <CerrarSesionBoton />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-ink-50 lg:flex">
      {/* Barra superior — solo en móvil/tablet */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-ink-800 bg-ink-950 px-4 py-3 text-white lg:hidden">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600">
            <BrandMark className="h-4 w-4 text-white" />
          </div>
          <span className="truncate text-sm font-semibold">Pedilo</span>
        </div>
        <button
          onClick={() => setAbierto(true)}
          className="shrink-0 rounded-lg p-1.5 text-ink-200 hover:bg-ink-800"
          aria-label="Abrir menú"
        >
          <Menu className="h-5 w-5" strokeWidth={2} />
        </button>
      </header>

      {/* Cajón deslizante — solo en móvil/tablet */}
      {abierto && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Cerrar menú"
            onClick={() => setAbierto(false)}
            className="absolute inset-0 bg-ink-950/50"
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-ink-950 p-4 text-white shadow-popover">
            <button
              onClick={() => setAbierto(false)}
              className="mb-2 self-end rounded-lg p-1.5 text-ink-300 hover:bg-ink-800"
              aria-label="Cerrar menú"
            >
              <X className="h-5 w-5" strokeWidth={2} />
            </button>
            {marca}
            <AdminNav onNavigate={() => setAbierto(false)} />
            {pie}
          </aside>
        </div>
      )}

      {/* Sidebar fija — solo en escritorio. Sticky + scroll propio para que el
          botón de cerrar sesión (al fondo) quede siempre visible sin depender
          del alto del contenido de la página. */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto bg-ink-950 p-4 text-white lg:flex">
        {marca}
        <AdminNav />
        {pie}
      </aside>

      <main className="flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
