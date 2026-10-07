/**
 * Flyer de UNA mesa para imprimir: el logo del restaurante de fondo (suave, para que no estorbe al
 * QR), un mensaje llamativo arriba y el QR grande de la mesa. Todo se mide en `cqw` (porcentaje del
 * ancho de la hoja), así se ve igual en pantalla, en A4 y en A5.
 */
export interface DatosFlyer {
  restaurante: string;
  logoUrl: string | null;
  mensaje: string;
  mesa: string;
  qrDataUrl: string;
  detalle: string | null; // dirección · teléfono
}

export function FlyerMesa({ f }: { f: DatosFlyer }) {
  return (
    <article className="flyer-hoja" aria-label={`Flyer ${f.mesa}`}>
      {f.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={f.logoUrl} alt="" className="flyer-fondo" />
      )}

      <div className="flyer-contenido">
        <p className="flyer-restaurante">{f.restaurante}</p>
        <h2 className="flyer-mensaje">{f.mensaje}</h2>

        <div className="flyer-qr">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={f.qrDataUrl} alt={`QR del menú de ${f.mesa}`} />
        </div>

        <p className="flyer-instruccion">Escanea con la cámara de tu celular</p>
        <ol className="flyer-pasos">
          <li>Escanea</li>
          <li>Elige</li>
          <li>Pide</li>
        </ol>

        <p className="flyer-mesa">{f.mesa}</p>
        {f.detalle && <p className="flyer-detalle">{f.detalle}</p>}
      </div>
    </article>
  );
}

/** Estilos del flyer. Van en la página para que se impriman igual sin depender del resto de la app. */
export const ESTILOS_FLYER = `
.flyer-hoja{position:relative;container-type:inline-size;background:#fff;color:#14171e;overflow:hidden;
  width:min(100%,420px);aspect-ratio:210/297;margin:0 auto;border-radius:12px;box-shadow:0 1px 8px rgba(15,23,42,.18);
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.flyer-a5 .flyer-hoja{aspect-ratio:148/210}
.flyer-fondo{position:absolute;left:50%;top:50%;width:84cqw;max-height:84%;object-fit:contain;transform:translate(-50%,-50%);opacity:.1;pointer-events:none}
.flyer-contenido{position:relative;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:space-between;
  padding:7cqw 8cqw 6cqw;text-align:center}
.flyer-restaurante{font-size:4.2cqw;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#f4623a;margin:0}
.flyer-mensaje{font-size:9.4cqw;line-height:1.08;font-weight:800;margin:0;max-width:100%;overflow-wrap:anywhere;text-wrap:balance}
.flyer-qr{background:#fff;border:.8cqw solid #14171e;border-radius:5cqw;padding:3.5cqw;width:56cqw;box-shadow:0 2cqw 6cqw rgba(15,23,42,.16)}
.flyer-qr img{display:block;width:100%;height:auto}
.flyer-instruccion{font-size:4.4cqw;font-weight:600;margin:0}
.flyer-pasos{display:flex;gap:3cqw;list-style:none;margin:0;padding:0;font-size:3.8cqw;font-weight:600;color:#5b6577}
.flyer-pasos li{display:flex;align-items:center;gap:1.4cqw}
.flyer-pasos li::before{counter-increment:paso;content:counter(paso);display:inline-flex;align-items:center;justify-content:center;
  width:5.6cqw;height:5.6cqw;border-radius:50%;background:#14171e;color:#fff;font-size:3.2cqw}
.flyer-pasos{counter-reset:paso}
.flyer-mesa{font-size:6.2cqw;font-weight:800;margin:0;background:#f4623a;color:#fff;padding:1.4cqw 7cqw;border-radius:99px}
.flyer-detalle{font-size:3cqw;color:#5b6577;margin:0}
`;
