/**
 * Isotipo de Pedilo: la campana de servicio ("¡orden lista!"). Ver Manual de
 * Marca/manual-marca-pedilo.html, sección 02. Se dibuja en currentColor para
 * poder ponerla en blanco sobre coral/navy o en coral sobre blanco según el
 * fondo, igual que en el manual.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="currentColor" aria-hidden="true">
      <path d="M32 62 a18 18 0 0 1 36 0 z" />
      <rect x="29" y="61" width="42" height="5" rx="2.5" />
      <circle cx="50" cy="42" r="3.5" />
      <circle cx="50" cy="71" r="3.5" />
    </svg>
  );
}
