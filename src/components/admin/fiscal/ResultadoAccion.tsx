import { CheckCircle2, TriangleAlert } from "lucide-react";
import type { EstadoAccion } from "@/app/admin/fiscal/actions";

/** Mensaje de éxito/error que devuelve una server action, debajo del formulario. */
export function ResultadoAccion({ estado }: { estado: EstadoAccion | null | undefined }) {
  if (!estado || (!estado.mensaje && !estado.error)) return null;
  const bien = estado.ok;
  return (
    <p
      role={bien ? "status" : "alert"}
      className={
        bien
          ? "flex items-start gap-2 rounded-lg bg-libre-bg px-3 py-2 text-sm text-libre-text"
          : "flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
      }
    >
      {bien ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
      ) : (
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
      )}
      <span>{estado.mensaje ?? estado.error}</span>
    </p>
  );
}

/** Texto de error bajo un campo. */
export function ErrorCampo({ texto }: { texto?: string }) {
  if (!texto) return null;
  return <p className="mt-1 text-xs text-red-600">{texto}</p>;
}
