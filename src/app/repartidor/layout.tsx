import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Repartidor · Pedilo",
  description: "Pedidos asignados, cobro y ubicación en vivo para repartidores",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Repartidor", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#fcd34d",
  width: "device-width",
  initialScale: 1,
  // se puede acercar el texto (accesibilidad), pero sin zoom accidental al tocar
  maximumScale: 5,
};

export default function RepartidorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
