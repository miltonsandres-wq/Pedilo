"use client";

import { useState } from "react";
import { Check, Copy, Eye, EyeOff, Loader2 } from "lucide-react";
import { verClaveUsuario } from "@/app/admin/equipo/actions";

/**
 * «Ver contraseña» de un cajero/mesero/admin. La contraseña se guarda cifrada y
 * se descifra en el servidor solo cuando el admin la pide; aquí solo se muestra
 * mientras la pantalla la tenga abierta.
 */
export function ClaveUsuario({ usuarioId }: { usuarioId: string }) {
  const [estado, setEstado] = useState<{ tipo: "oculta" } | { tipo: "cargando" } | { tipo: "visible"; clave: string | null }>({
    tipo: "oculta",
  });
  const [copiada, setCopiada] = useState(false);

  async function mostrar() {
    setEstado({ tipo: "cargando" });
    const r = await verClaveUsuario(usuarioId).catch(() => ({ ok: false, clave: null }));
    setEstado({ tipo: "visible", clave: r.ok ? r.clave : null });
  }

  async function copiar(clave: string) {
    try {
      await navigator.clipboard.writeText(clave);
      setCopiada(true);
      window.setTimeout(() => setCopiada(false), 1500);
    } catch {
      /* sin permiso de portapapeles: se puede seleccionar a mano */
    }
  }

  if (estado.tipo === "oculta" || estado.tipo === "cargando") {
    return (
      <button
        type="button"
        onClick={() => void mostrar()}
        disabled={estado.tipo === "cargando"}
        className="flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:text-brand-900 disabled:opacity-50"
      >
        {estado.tipo === "cargando" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
        ) : (
          <Eye className="h-3.5 w-3.5" strokeWidth={2} />
        )}
        Ver contraseña
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {estado.clave ? (
        <>
          <code className="rounded bg-amber-50 px-2 py-1 font-mono text-sm text-amber-900" data-testid="clave-visible">
            {estado.clave}
          </code>
          <button
            type="button"
            onClick={() => void copiar(estado.clave!)}
            className="flex items-center gap-1 font-medium text-ink-600 hover:text-ink-900"
          >
            {copiada ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : <Copy className="h-3.5 w-3.5" strokeWidth={2} />}
            {copiada ? "Copiada" : "Copiar"}
          </button>
        </>
      ) : (
        <span className="text-ink-500">
          No hay una contraseña guardada para este usuario. Escribe una nueva en «Nueva contraseña» y guarda.
        </span>
      )}
      <button
        type="button"
        onClick={() => setEstado({ tipo: "oculta" })}
        className="flex items-center gap-1 font-medium text-ink-500 hover:text-ink-800"
      >
        <EyeOff className="h-3.5 w-3.5" strokeWidth={2} />
        Ocultar
      </button>
    </div>
  );
}
