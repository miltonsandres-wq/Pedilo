import { cn } from "@/lib/ui";

const estilos = {
  neutral: "bg-ink-100 text-ink-600",
  brand: "bg-brand-50 text-brand-700",
  success: "bg-libre-bg text-libre-text",
  danger: "bg-ocupada-bg text-ocupada-text",
  warning: "bg-amber-50 text-amber-700",
} as const;

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: keyof typeof estilos;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        estilos[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
