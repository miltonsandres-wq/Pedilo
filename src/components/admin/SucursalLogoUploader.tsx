"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Store, Trash2 } from "lucide-react";
import { actualizarLogoSucursal } from "@/app/admin/sucursales/actions";
import { subirArchivo } from "@/lib/storage/acciones";
import { Button } from "@/components/ui/Button";

/**
 * Logo propio de UNA sucursal — se muestra en el menú digital del QR de sus
 * mesas (ver /carta/[token]/page.tsx). Si la sucursal no tiene uno, el menú
 * cae de vuelta al logo general del negocio, así que esto es opcional: solo
 * hace falta cuando esa sucursal quiere su propia marca (ej. una franquicia
 * con nombre distinto en cada local).
 */
export function SucursalLogoUploader({
  sucursalId,
  logoUrl,
}: {
  sucursalId: string;
  logoUrl: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [preview, setPreview] = useState(logoUrl);
  const [error, setError] = useState<string | null>(null);

  async function subir(file: File) {
    setSubiendo(true);
    setError(null);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const formData = new FormData();
      formData.append("archivo", file);

      const resultado = await subirArchivo({
        bucket: "logos",
        carpeta: `sucursales/${sucursalId}/logo-${Date.now()}.${ext}`,
        formData,
      });
      if (!resultado.ok) throw new Error(resultado.error);

      await actualizarLogoSucursal(sucursalId, resultado.url);
      setPreview(resultado.url);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir el logo.");
    } finally {
      setSubiendo(false);
    }
  }

  async function quitar() {
    setSubiendo(true);
    try {
      await actualizarLogoSucursal(sucursalId, null);
      setPreview(null);
      router.refresh();
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-ink-200 bg-ink-50">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Logo de la sucursal" className="h-full w-full object-cover" />
        ) : (
          <Store className="h-4.5 w-4.5 text-ink-300" strokeWidth={2} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void subir(file);
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={subiendo}
            onClick={() => inputRef.current?.click()}
          >
            {subiendo ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
            ) : (
              <ImagePlus className="h-3.5 w-3.5" strokeWidth={2} />
            )}
            {preview ? "Cambiar logo" : "Subir logo de esta sucursal"}
          </Button>
          {preview && (
            <Button type="button" variant="danger" size="sm" disabled={subiendo} onClick={() => void quitar()}>
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
              Quitar
            </Button>
          )}
        </div>
        {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
        <p className="mt-1.5 text-xs text-ink-400">
          {preview
            ? "Se usa en el menú del QR de esta sucursal."
            : "Opcional — si no subes uno, el menú del QR usa el logo general del negocio."}
        </p>
      </div>
    </div>
  );
}
