"use client";

import { useRef, useState } from "react";
import { ImageOff, ImagePlus, Link2, Loader2, X } from "lucide-react";
import { subirArchivo } from "@/lib/storage/acciones";
import { cn, inputClass, labelClass } from "@/lib/ui";

/**
 * Campo de foto de producto: el admin puede subir un archivo (se guarda en
 * Supabase Storage) o pegar una URL de internet. Vive dentro de un <form>
 * normal de Server Action — expone el valor final como un <input type=hidden>
 * con el mismo `name`, así el resto del formulario no cambia.
 */
export function FotoProductoField({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue: string | null;
}) {
  const [modo, setModo] = useState<"archivo" | "url">("archivo");
  const [valor, setValor] = useState(defaultValue ?? "");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function subir(file: File) {
    setSubiendo(true);
    setError(null);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const formData = new FormData();
      formData.append("archivo", file);

      const resultado = await subirArchivo({
        bucket: "productos",
        carpeta: `${crypto.randomUUID()}.${ext}`,
        formData,
      });
      if (!resultado.ok) throw new Error(resultado.error);

      setValor(resultado.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la foto.");
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div className="col-span-full">
      <label className={labelClass}>Foto</label>
      <input type="hidden" name={name} value={valor} />

      <div className="mb-2 inline-flex rounded-lg border border-ink-200 bg-ink-50 p-0.5 text-xs">
        <button
          type="button"
          onClick={() => setModo("archivo")}
          className={cn(
            "flex items-center gap-1 rounded-md px-2.5 py-1 font-medium",
            modo === "archivo" ? "bg-white text-ink-900 shadow-sm" : "text-ink-500"
          )}
        >
          <ImagePlus className="h-3 w-3" strokeWidth={2} />
          Subir archivo
        </button>
        <button
          type="button"
          onClick={() => setModo("url")}
          className={cn(
            "flex items-center gap-1 rounded-md px-2.5 py-1 font-medium",
            modo === "url" ? "bg-white text-ink-900 shadow-sm" : "text-ink-500"
          )}
        >
          <Link2 className="h-3 w-3" strokeWidth={2} />
          URL de internet
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-ink-200 bg-white">
          {valor ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={valor} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageOff className="h-5 w-5 text-ink-300" strokeWidth={2} />
          )}
        </div>

        {modo === "archivo" ? (
          <div>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void subir(file);
              }}
            />
            <button
              type="button"
              disabled={subiendo}
              onClick={() => inputRef.current?.click()}
              className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-60"
            >
              {subiendo ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
                  Subiendo...
                </span>
              ) : (
                "Elegir imagen"
              )}
            </button>
            {valor && (
              <button
                type="button"
                onClick={() => setValor("")}
                className="ml-2 rounded-lg border border-red-200 px-2 py-1.5 text-xs text-red-600 hover:bg-red-50"
              >
                <X className="h-3 w-3" strokeWidth={2} />
              </button>
            )}
          </div>
        ) : (
          <input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="https://..."
            className={cn(inputClass, "flex-1")}
          />
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
