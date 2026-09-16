"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2, Sparkles, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import {
  extraerBorradorDeMenu,
  confirmarImportacion,
  type ItemAConfirmar,
} from "@/app/admin/menu/importar/actions";

export function ImportarMenuPdf({ sucursales }: { sucursales: { id: string; nombre: string }[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ItemAConfirmar[] | null>(null);
  const [sucursalesElegidas, setSucursalesElegidas] = useState<string[]>(
    sucursales.map((s) => s.id)
  );
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<{ creados: number } | null>(null);

  async function subir(file: File) {
    setCargando(true);
    setError(null);
    setItems(null);
    setResultado(null);

    const formData = new FormData();
    formData.set("pdf", file);
    const res = await extraerBorradorDeMenu(formData);

    if (!res.ok || !res.items) {
      setError(res.error ?? "No se pudo procesar el PDF.");
    } else {
      setItems(res.items.map((i) => ({ ...i, incluir: true })));
    }
    setCargando(false);
  }

  function actualizar(idx: number, cambios: Partial<ItemAConfirmar>) {
    setItems((prev) => prev?.map((it, i) => (i === idx ? { ...it, ...cambios } : it)) ?? null);
  }

  async function confirmar() {
    if (!items) return;
    setGuardando(true);
    const res = await confirmarImportacion(items, sucursalesElegidas);
    setGuardando(false);
    if (res.ok) {
      setResultado({ creados: res.creados });
      setItems(null);
      router.refresh();
    } else {
      setError(res.error ?? "No se pudo importar.");
    }
  }

  return (
    <Card>
      <CardHeader
        title="Importar menú desde PDF"
        subtitle="Sube el menú que ya tienes en PDF: la IA arma un borrador de categorías y platillos para que lo revises antes de publicarlo."
      />
      <div className="p-5">
        {!items && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void subir(file);
              }}
            />
            <button
              onClick={() => inputRef.current?.click()}
              disabled={cargando}
              className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-ink-200 py-10 text-ink-500 transition hover:border-brand-400 hover:bg-brand-50/40 disabled:opacity-60"
            >
              {cargando ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin text-brand-600" strokeWidth={2} />
                  <span className="text-sm font-medium">Leyendo el PDF y armando el borrador...</span>
                  <span className="text-xs text-ink-400">Puede tardar unos segundos</span>
                </>
              ) : (
                <>
                  <FileUp className="h-6 w-6" strokeWidth={2} />
                  <span className="text-sm font-medium">Subir PDF del menú</span>
                </>
              )}
            </button>
          </>
        )}

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        {resultado && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-libre-bg px-3 py-2 text-sm text-libre-text">
            <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
            Se importaron {resultado.creados} platillos. Ya están en el menú.
          </div>
        )}

        {items && (
          <div>
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <Sparkles className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
              Revisa lo que reconoció la IA — puedes editar cualquier campo o quitar filas antes de
              importar.
            </div>

            <div className="mb-4 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 gap-2 rounded-xl border border-ink-100 bg-white p-3 sm:grid-cols-[auto_1fr_1fr_7rem_auto]"
                >
                  <input
                    type="checkbox"
                    checked={item.incluir}
                    onChange={(e) => actualizar(idx, { incluir: e.target.checked })}
                    className="mt-2.5 h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500 sm:mt-0 sm:self-center"
                  />
                  <input
                    value={item.categoria}
                    onChange={(e) => actualizar(idx, { categoria: e.target.value })}
                    placeholder="Categoría"
                    className="rounded-lg border border-ink-200 px-2 py-1.5 text-sm"
                  />
                  <input
                    value={item.nombre}
                    onChange={(e) => actualizar(idx, { nombre: e.target.value })}
                    placeholder="Nombre"
                    className="rounded-lg border border-ink-200 px-2 py-1.5 text-sm"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={item.precio}
                    onChange={(e) => actualizar(idx, { precio: Number(e.target.value) })}
                    className="rounded-lg border border-ink-200 px-2 py-1.5 text-sm"
                  />
                  <button
                    onClick={() => setItems((prev) => prev?.filter((_, i) => i !== idx) ?? null)}
                    className="flex items-center justify-center rounded-lg text-ink-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>

            <p className="mb-1.5 text-xs font-medium text-ink-600">Importar a estas sucursales</p>
            <div className="mb-4 flex flex-wrap gap-3">
              {sucursales.map((s) => (
                <label key={s.id} className="flex items-center gap-1.5 text-xs text-ink-700">
                  <input
                    type="checkbox"
                    checked={sucursalesElegidas.includes(s.id)}
                    onChange={(e) =>
                      setSucursalesElegidas((prev) =>
                        e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id)
                      )
                    }
                    className="h-3.5 w-3.5 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                  />
                  {s.nombre}
                </label>
              ))}
            </div>

            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setItems(null)}>
                Cancelar
              </Button>
              <Button disabled={guardando} onClick={() => void confirmar()}>
                {guardando ? "Importando..." : `Importar ${items.filter((i) => i.incluir).length} platillos`}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
