"use client";

import { useFormStatus } from "react-dom";
import { buttonClass, buttonVariants, buttonSizes, cn } from "@/lib/ui";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
};

/**
 * Botón usado tanto suelto como dentro de <form action={...}>. Cuando está
 * dentro de un form en vuelo, useFormStatus() lo deshabilita y atenúa
 * (disabled:opacity-50 ya existe en buttonBase) — sin esto, en un envío
 * lento (datos móviles) el botón se queda igual de "activo" mientras el
 * servidor procesa, y parece que el tap no hizo nada aunque sí guardó.
 * Fuera de un form, useFormStatus() no hace nada (pending siempre false).
 */
export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  disabled,
  ...props
}: Props) {
  const { pending } = useFormStatus();
  const esEnvio = props.type !== "button";
  const deshabilitado = disabled || (esEnvio && pending);
  const mostrarCargando = esEnvio && pending && typeof children === "string";

  return (
    <button {...props} disabled={deshabilitado} className={cn(buttonClass(variant, size), className)}>
      {mostrarCargando ? "Guardando…" : children}
    </button>
  );
}
