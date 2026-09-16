import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Hay otros package-lock.json en carpetas superiores del usuario; fijamos
  // la raíz aquí para que Next no adivine mal el workspace root.
  outputFileTracingRoot: path.resolve(import.meta.dirname),
};

export default nextConfig;
