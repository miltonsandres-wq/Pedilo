"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { inputClass, labelClass, cn } from "@/lib/ui";

/**
 * Campo del registro con su mensaje de error debajo. El error solo se muestra
 * cuando se le pasa (el formulario decide cuándo: al salir del campo o al
 * intentar continuar), y el campo se marca en rojo para que se vea cuál falla.
 */
export function CampoRegistro({
  icon: Icon,
  label,
  value,
  onChange,
  onBlur,
  error,
  type = "text",
  placeholder,
  autoComplete,
  inputMode,
  id,
  ayuda,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  error?: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: "text" | "tel" | "email" | "numeric";
  id?: string;
  ayuda?: string;
}) {
  const auto = useId();
  const campoId = id ?? auto;
  const [verClave, setVerClave] = useState(false);
  const esClave = type === "password";
  const idError = `${campoId}-error`;

  return (
    <div className="min-w-0">
      <label htmlFor={campoId} className={labelClass}>
        {label}
      </label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input
          id={campoId}
          type={esClave && verClave ? "text" : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          autoCapitalize={type === "email" ? "none" : undefined}
          autoCorrect={type === "email" ? "off" : undefined}
          spellCheck={type === "email" || esClave ? false : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? idError : undefined}
          className={cn(inputClass, "pl-9", esClave && "pr-10", error && "border-red-400 focus:border-red-500 focus:ring-red-500/20")}
        />
        {esClave && (
          <button
            type="button"
            onClick={() => setVerClave((v) => !v)}
            aria-label={verClave ? "Ocultar contraseña" : "Mostrar contraseña"}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 hover:text-ink-700"
          >
            {verClave ? <EyeOff className="h-4 w-4" strokeWidth={2} /> : <Eye className="h-4 w-4" strokeWidth={2} />}
          </button>
        )}
      </div>
      {error ? (
        <p id={idError} role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      ) : (
        ayuda && <p className="mt-1 text-xs text-ink-400">{ayuda}</p>
      )}
    </div>
  );
}
