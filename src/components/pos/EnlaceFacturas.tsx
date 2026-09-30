"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Receipt } from "lucide-react";
import { leerConfigFiscal } from "@/lib/fiscal/emision";

/** Acceso a las facturas emitidas; solo aparece si el negocio factura. */
export function EnlaceFacturas() {
  const config = useLiveQuery(() => leerConfigFiscal(), [], undefined);
  if (!config?.activa) return null;
  return (
    <Link
      href="/pos/documentos"
      title="Facturas emitidas"
      className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700"
    >
      <Receipt className="h-4 w-4" strokeWidth={2} />
    </Link>
  );
}
