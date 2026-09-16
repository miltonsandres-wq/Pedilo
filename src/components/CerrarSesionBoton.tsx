"use client";

import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function CerrarSesionBoton({ compact = true }: { compact?: boolean }) {
  const router = useRouter();

  async function salir() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (compact) {
    return (
      <button
        onClick={salir}
        title="Cerrar sesión"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-400 transition hover:bg-ink-800 hover:text-white"
      >
        <LogOut className="h-4 w-4" strokeWidth={2} />
      </button>
    );
  }

  return (
    <button
      onClick={salir}
      className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-red-600"
    >
      <LogOut className="h-3.5 w-3.5" strokeWidth={2} />
      Cerrar sesión
    </button>
  );
}
