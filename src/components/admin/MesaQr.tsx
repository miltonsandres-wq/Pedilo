import { QrCode, ExternalLink, RotateCw } from "lucide-react";
import { obtenerOrigen, qrComoDataUrl, urlCartaMesa } from "@/lib/qr";
import { regenerarQrMesa } from "@/app/admin/mesas/actions";
import { Button } from "@/components/ui/Button";

/** QR que un cliente escanea desde su mesa para ver el menú (y ordenar, ver
 * /carta/[token]). Se genera en el servidor a partir de `mesas.qr_token`. */
export async function MesaQr({ mesaId, qrToken }: { mesaId: string; qrToken: string }) {
  const origen = await obtenerOrigen();
  const url = urlCartaMesa(origen, qrToken);
  const dataUrl = await qrComoDataUrl(url);

  return (
    <details className="group">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg border border-ink-200 px-2.5 py-1.5 text-xs font-medium text-ink-600 hover:bg-ink-50">
        <QrCode className="h-3.5 w-3.5" strokeWidth={2} />
        Ver QR
      </summary>
      <div className="mt-2 flex items-start gap-3 rounded-xl border border-ink-100 bg-ink-50/60 p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dataUrl} alt={`QR de ${url}`} className="h-24 w-24 rounded-lg bg-white p-1" />
        <div className="min-w-0 flex-1">
          <p className="mb-1 break-all text-[11px] text-ink-500">{url}</p>
          <div className="flex flex-wrap gap-2">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs text-brand-700 hover:underline"
            >
              <ExternalLink className="h-3 w-3" strokeWidth={2} />
              Abrir
            </a>
            <form action={regenerarQrMesa.bind(null, mesaId)}>
              <Button type="submit" variant="ghost" size="sm" className="!px-1.5 !py-0.5 text-xs">
                <RotateCw className="h-3 w-3" strokeWidth={2} />
                Regenerar
              </Button>
            </form>
          </div>
        </div>
      </div>
    </details>
  );
}
