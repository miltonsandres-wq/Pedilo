import { clsx, type ClassValue } from "clsx";

/** Combina clases condicionalmente (wrapper fino sobre clsx). */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export const inputClass =
  "w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-ink-50 disabled:text-ink-400";

export const labelClass = "mb-1.5 block text-xs font-medium text-ink-500";

export const cardClass = "rounded-2xl border border-ink-100 bg-white shadow-card";

export const buttonBase =
  "inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap";

export const buttonVariants = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-600/20",
  secondary: "border border-ink-200 bg-white text-ink-700 hover:bg-ink-50",
  dark: "bg-ink-900 text-white hover:bg-ink-800",
  danger: "border border-red-200 text-red-600 hover:bg-red-50",
  ghost: "text-ink-500 hover:bg-ink-100 hover:text-ink-900",
} as const;

export const buttonSizes = {
  sm: "px-2.5 py-1.5 text-xs",
  md: "px-4 py-2",
  lg: "px-5 py-3 text-base",
} as const;

export function buttonClass(
  variant: keyof typeof buttonVariants = "primary",
  size: keyof typeof buttonSizes = "md"
) {
  return cn(buttonBase, buttonVariants[variant], buttonSizes[size]);
}
