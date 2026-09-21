"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  UtensilsCrossed,
  LayoutGrid,
  ChefHat,
  Wallet,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/ui";

const NAV = [
  { href: "/admin", label: "Resumen", icon: LayoutDashboard },
  { href: "/admin/sucursales", label: "Sucursales", icon: Building2 },
  { href: "/admin/menu", label: "Menú digital", icon: UtensilsCrossed },
  { href: "/admin/mesas", label: "Mesas / Layout", icon: LayoutGrid },
  { href: "/cocina", label: "Pantalla de cocina", icon: ChefHat },
  { href: "/admin/formas-pago", label: "Formas de pago", icon: Wallet },
  { href: "/admin/reportes", label: "Reportes", icon: BarChart3 },
];

export function AdminNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="space-y-0.5">
      {NAV.map((item) => {
        const activo = item.href === "/admin" ? pathname === "/admin" : pathname?.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition",
              activo ? "bg-brand-600 text-white shadow-sm" : "text-ink-300 hover:bg-ink-800 hover:text-white"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
