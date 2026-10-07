"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  UtensilsCrossed,
  LayoutGrid,
  Wallet,
  BarChart3,
  Boxes,
  FileText,
  Users,
  Bike,
  Receipt,
} from "lucide-react";
import { cn } from "@/lib/ui";

const NAV = [
  { href: "/admin", label: "Resumen", icon: LayoutDashboard },
  { href: "/admin/sucursales", label: "Sucursales", icon: Building2 },
  { href: "/admin/equipo", label: "Equipo de trabajo", icon: Users },
  { href: "/admin/menu", label: "Menú digital", icon: UtensilsCrossed },
  { href: "/admin/inventario", label: "Inventario", icon: Boxes },
  { href: "/admin/mesas", label: "Mesas / Layout", icon: LayoutGrid },
  { href: "/admin/formas-pago", label: "Formas de pago", icon: Wallet },
  { href: "/admin/delivery", label: "Delivery", icon: Bike },
  { href: "/admin/facturas", label: "Facturas del día", icon: Receipt },
  { href: "/admin/fiscal", label: "Facturación fiscal", icon: FileText },
  { href: "/admin/reportes", label: "Reportes", icon: BarChart3 },
];

export function AdminNav({
  onNavigate,
  delivery = false,
  anulacionesPendientes = 0,
}: {
  onNavigate?: () => void;
  delivery?: boolean;
  /** Solicitudes de anulación de caja esperando que el admin las apruebe. */
  anulacionesPendientes?: number;
}) {
  const pathname = usePathname();

  return (
    <nav className="space-y-0.5">
      {NAV.filter((item) => delivery || item.href !== "/admin/delivery").map((item) => {
        const activo = item.href === "/admin" ? pathname === "/admin" : pathname?.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            data-tour={`nav-${item.href.split("/").pop()}`}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition",
              activo ? "bg-brand-600 text-white shadow-sm" : "text-ink-300 hover:bg-ink-800 hover:text-white"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
            {item.label}
            {item.href === "/admin/facturas" && anulacionesPendientes > 0 && (
              <span
                className="ml-auto rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white"
                aria-label={`${anulacionesPendientes} anulaciones por aprobar`}
              >
                {anulacionesPendientes}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
