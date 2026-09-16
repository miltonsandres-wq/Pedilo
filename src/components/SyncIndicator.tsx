"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { WifiOff, RefreshCw, CloudCheck } from "lucide-react";
import { db } from "@/lib/offline/db";
import { flushOutbox } from "@/lib/offline/outbox";
import { cn } from "@/lib/ui";

export function SyncIndicator() {
  const [enLinea, setEnLinea] = useState(true);
  const pendientes = useLiveQuery(() => db.outbox.count(), [], 0);

  useEffect(() => {
    setEnLinea(navigator.onLine);
    const on = () => setEnLinea(true);
    const off = () => setEnLinea(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const hayPendientes = (pendientes ?? 0) > 0;
  const Icon = !enLinea ? WifiOff : hayPendientes ? RefreshCw : CloudCheck;

  return (
    <button
      onClick={() => void flushOutbox()}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition",
        !enLinea
          ? "bg-ocupada-bg text-ocupada-text"
          : hayPendientes
            ? "bg-amber-50 text-amber-700"
            : "bg-libre-bg text-libre-text"
      )}
      title="Tocar para forzar sincronización"
    >
      <Icon className={cn("h-3.5 w-3.5", hayPendientes && enLinea && "animate-spin")} strokeWidth={2} />
      {!enLinea
        ? "Sin conexión"
        : hayPendientes
          ? `Sincronizando (${pendientes})`
          : "Todo sincronizado"}
    </button>
  );
}
