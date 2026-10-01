/**
 * Alerta sonora de pedidos nuevos. Se genera con Web Audio (sin archivos de
 * audio). Los navegadores no dejan sonar nada hasta que la persona toca la
 * pantalla una vez: `desbloquearAudio()` se engancha al primer toque.
 */

const CLAVE = "pedilo:delivery:sonido";
let ctx: AudioContext | null = null;

export function sonidoActivado(): boolean {
  try {
    return window.localStorage.getItem(CLAVE) !== "off";
  } catch {
    return true;
  }
}

export function fijarSonido(activo: boolean) {
  try {
    window.localStorage.setItem(CLAVE, activo ? "on" : "off");
  } catch {
    /* sin almacenamiento: vale para esta sesión */
  }
}

export function desbloquearAudio() {
  try {
    const Clase = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Clase) return;
    ctx ??= new Clase();
    void ctx.resume();
  } catch {
    /* sin audio: queda la alerta visual */
  }
}

export const audioListo = () => !!ctx && ctx.state === "running";

/** Timbre de dos tonos. Devuelve false si el navegador aún no deja sonar. */
export function sonarNuevoPedido(): boolean {
  if (!ctx || ctx.state !== "running") return false;
  const ahora = ctx.currentTime;
  [[880, 0], [1175, 0.22], [880, 0.5], [1175, 0.72]].forEach(([frecuencia, desfase]) => {
    const osc = ctx!.createOscillator();
    const ganancia = ctx!.createGain();
    osc.type = "sine";
    osc.frequency.value = frecuencia;
    ganancia.gain.setValueAtTime(0.0001, ahora + desfase);
    ganancia.gain.exponentialRampToValueAtTime(0.35, ahora + desfase + 0.02);
    ganancia.gain.exponentialRampToValueAtTime(0.0001, ahora + desfase + 0.2);
    osc.connect(ganancia).connect(ctx!.destination);
    osc.start(ahora + desfase);
    osc.stop(ahora + desfase + 0.22);
  });
  return true;
}
