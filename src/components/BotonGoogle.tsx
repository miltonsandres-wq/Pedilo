"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buttonClass } from "@/lib/ui";
import { GoogleIcon } from "./GoogleIcon";

export function BotonGoogle({ next = "/" }: { next?: string }) {
  const [cargando, setCargando] = useState(false);

  async function entrarConGoogle() {
    setCargando(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    // El navegador se va a Google; si por algo falla antes de redirigir,
    // no queremos el botón bloqueado para siempre.
    setCargando(false);
  }

  return (
    <button
      type="button"
      onClick={entrarConGoogle}
      disabled={cargando}
      className={`${buttonClass("secondary", "lg")} w-full`}
    >
      <GoogleIcon className="h-4 w-4" />
      {cargando ? "Conectando..." : "Continuar con Google"}
    </button>
  );
}
