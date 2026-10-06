import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Subidas de imagen (logo, fotos): el tope por defecto es 1 MB y una foto de celular lo pasa.
  // Vercel acepta hasta 4.5 MB por petición; el navegador ya las reduce antes de enviarlas.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // Hay otros package-lock.json en carpetas superiores del usuario; fijamos
  // la raíz aquí para que Next no adivine mal el workspace root.
  outputFileTracingRoot: path.resolve(import.meta.dirname),
};

export default nextConfig;
