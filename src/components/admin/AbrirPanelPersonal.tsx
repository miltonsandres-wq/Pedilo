"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { urlLoginPersonal, type RolPersonal } from "@/lib/auth/enlaces";

const NOMBRE_ROL: Record<RolPersonal, string> = { cajero: "cajero", mesero: "mesero" };

/**
 * Acceso al panel de un cajero o mesero. «Abrir panel» cierra la sesión del
 * dueño en ESTE navegador y muestra el login de ese rol; «Copiar enlace» da la
 * dirección para que la persona entre desde SU propio dispositivo sin tocar la
 * sesión del dueño.
 */
export function AbrirPanelPersonal({
  rol,
  email,
  compacto = false,
  soloAbrir = false,
}: {
  rol: RolPersonal;
  email?: string;
  compacto?: boolean;
  /** Sin el botón de copiar enlace (para el encabezado de la sucursal). */
  soloAbrir?: boolean;
}) {
  const router = useRouter();
  const [copiado, setCopiado] = useState(false);
  const ruta = urlLoginPersonal(rol, email);

  async function abrir() {
    await createClient().auth.signOut();
    router.replace(ruta);
    router.refresh();
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${ruta}`);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1800);
    } catch {
      /* sin permiso de portapapeles */
    }
  }

  const clase = compacto
    ? "flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-900"
    : "flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void abrir()}
        title="Cierra tu sesión de administrador y abre el login de este rol"
        className={clase}
      >
        <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
        Abrir panel de {NOMBRE_ROL[rol]}
      </button>
      {!soloAbrir && (
      <button
        type="button"
        onClick={() => void copiar()}
        title="Copia el enlace para que la persona entre desde su propio dispositivo"
        className={clase}
      >
        {copiado ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : <Copy className="h-3.5 w-3.5" strokeWidth={2} />}
        {copiado ? "Enlace copiado" : "Copiar enlace"}
      </button>
      )}
    </div>
  );
}
