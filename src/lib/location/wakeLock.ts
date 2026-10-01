/**
 * Mantiene la pantalla encendida mientras hay un pedido en camino (el GPS de
 * primer plano se corta si la pantalla se apaga). Wake Lock API; si el
 * navegador no la tiene, `soportado()` es false y la app avisa a la persona
 * que mantenga la pantalla encendida a mano.
 */
export function crearWakeLock() {
  let candado: WakeLockSentinel | null = null;
  let quiere = false;

  const soportado = () => typeof navigator !== "undefined" && "wakeLock" in navigator;

  async function adquirir() {
    if (!soportado() || candado) return false;
    try {
      candado = await navigator.wakeLock.request("screen");
      candado.addEventListener("release", () => {
        candado = null;
      });
      return true;
    } catch {
      return false; // batería baja, pestaña oculta, etc.
    }
  }

  // El navegador suelta el candado al ocultar la pestaña: se vuelve a pedir al regresar
  const alVolver = () => {
    if (quiere && document.visibilityState === "visible") void adquirir();
  };

  return {
    soportado,
    async activar(): Promise<boolean> {
      if (!quiere) {
        quiere = true;
        document.addEventListener("visibilitychange", alVolver);
      }
      return adquirir();
    },
    async liberar() {
      quiere = false;
      document.removeEventListener("visibilitychange", alVolver);
      try {
        await candado?.release();
      } catch {
        /* ya estaba suelto */
      }
      candado = null;
    },
    activo: () => candado != null,
  };
}
