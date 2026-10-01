"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Bike, Download, LogOut, WifiOff } from "lucide-react";
import { iniciarSesionRepartidor, resolverRestaurante, type RestauranteRep } from "@/app/repartidor/actions";
import { abrirBaseRepartidor, CLAVE_SESION, type BaseRepartidor, type PedidoRep, type SesionRep } from "@/lib/repartidor/db";
import { crearApiSupabase, crearClienteRepartidor, type ApiRepartidor } from "@/lib/repartidor/api";
import { registrarAccion, sincronizar } from "@/lib/repartidor/sync";
import { ControladorRastreo, type EstadoRastreo } from "@/lib/repartidor/rastreo";
import { crearCanalesSupabase } from "@/lib/repartidor/canales";
import { crearProveedorUbicacion, crearWakeLock } from "@/lib/location";
import { TarjetaPedidoRep } from "./TarjetaPedidoRep";
import { PantallaUbicacion } from "./PantallaUbicacion";
import { BannerUbicacion } from "./BannerUbicacion";

let baseUnica: BaseRepartidor | null = null;
const obtenerBase = () => (baseUnica ??= abrirBaseRepartidor());

const CLAVE_SLUG = "pedilo:rep:slug";
const leerSlug = () => {
  try { return window.localStorage.getItem(CLAVE_SLUG) ?? ""; } catch { return ""; }
};
const guardarSlug = (s: string) => {
  try { window.localStorage.setItem(CLAVE_SLUG, s); } catch { /* sin almacenamiento */ }
};

/** Raíz de la PWA: sin sesión muestra el ingreso; con sesión, el panel de pedidos. */
export function AppRepartidor({ slugInicial }: { slugInicial?: string }) {
  const [sesion, setSesion] = useState<SesionRep | null | undefined>(undefined);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/repartidor" }).catch(() => undefined);
    }
    void (async () => {
      const guardada = (await obtenerBase().meta.get(CLAVE_SESION))?.valor as SesionRep | undefined;
      if (guardada && guardada.exp * 1000 > Date.now()) setSesion(guardada);
      else {
        if (guardada) setAviso("Tu sesión venció. Entra de nuevo.");
        setSesion(null);
      }
    })();
  }, []);

  const cerrarSesion = useCallback(async (mensaje?: string) => {
    const base = obtenerBase();
    await Promise.all([base.pedidos.clear(), base.meta.delete(CLAVE_SESION), base.rastro.clear(), base.acciones.clear()]);
    setSesion(null);
    setAviso(mensaje ?? null);
  }, []);

  if (sesion === undefined) return <Pantalla><p className="mt-20 text-center text-xl font-bold">Cargando…</p></Pantalla>;
  if (sesion === null) {
    return (
      <Pantalla>
        <Ingreso slugInicial={slugInicial} aviso={aviso} onSesion={async (s) => {
          const completa: SesionRep = { ...s, aceptoUbicacion: false };
          await obtenerBase().meta.put({ clave: CLAVE_SESION, valor: completa });
          setAviso(null);
          setSesion(completa);
        }} />
      </Pantalla>
    );
  }
  return (
    <Pantalla>
      <Panel sesion={sesion} onSesion={setSesion} onCerrar={cerrarSesion} />
    </Pantalla>
  );
}

function Pantalla({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-white text-black"><div className="mx-auto max-w-lg px-4 py-4">{children}</div></div>;
}

// --- ingreso ---------------------------------------------------------------

function Ingreso({ slugInicial, aviso, onSesion }: { slugInicial?: string; aviso: string | null; onSesion: (s: Omit<SesionRep, "aceptoUbicacion">) => void | Promise<void> }) {
  const [slug, setSlug] = useState(slugInicial ?? "");
  const [rest, setRest] = useState<RestauranteRep | null>(null);
  const [elegido, setElegido] = useState<{ id: string; nombre: string } | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function buscar(codigo: string) {
    setCargando(true);
    setError(null);
    const r = await resolverRestaurante(codigo);
    setCargando(false);
    if (r.ok) {
      guardarSlug(codigo.trim().toLowerCase());
      setRest(r.restaurante);
    } else setError(r.error);
  }

  useEffect(() => {
    const guardado = slugInicial || leerSlug();
    if (guardado) { setSlug(guardado); void buscar(guardado); }
    // solo al abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    if (!elegido) return;
    setCargando(true);
    setError(null);
    const r = await iniciarSesionRepartidor({ slug: slug.trim().toLowerCase(), repartidorId: elegido.id, pin });
    setCargando(false);
    if (r.ok) await onSesion(r.sesion);
    else { setError(r.error); setPin(""); }
  }

  const campo = "w-full rounded-2xl border-4 border-black px-4 py-4 text-2xl font-bold";
  const boton = "min-h-14 w-full rounded-2xl border-2 border-black text-xl font-extrabold";

  return (
    <div className="pt-8">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-3xl bg-amber-300"><Bike className="h-10 w-10" strokeWidth={2.5} /></div>
        <h1 className="text-3xl font-black">Repartidor</h1>
      </div>
      {aviso && <p role="status" className="mb-4 rounded-2xl bg-amber-100 p-3 text-lg font-bold">{aviso}</p>}
      {error && <p role="alert" className="mb-4 rounded-2xl border-2 border-red-700 bg-red-100 p-3 text-lg font-bold text-red-900">{error}</p>}

      {!rest ? (
        <form onSubmit={(e) => { e.preventDefault(); void buscar(slug); }} className="space-y-3">
          <label htmlFor="slug" className="text-xl font-extrabold">Código del restaurante</label>
          <input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} autoCapitalize="none" autoCorrect="off" placeholder="ej. fondita-ana" className={campo} />
          <button type="submit" disabled={cargando || slug.trim().length < 3} className={`${boton} bg-amber-300 disabled:opacity-40`}>{cargando ? "Buscando…" : "Continuar"}</button>
        </form>
      ) : !elegido ? (
        <div className="space-y-3">
          <p className="text-xl font-extrabold">{rest.nombre}</p>
          <p className="text-lg font-semibold">¿Quién eres?</p>
          {rest.repartidores.length === 0 && <p className="rounded-2xl bg-amber-100 p-3 text-lg font-bold">Este restaurante no tiene repartidores activos.</p>}
          {rest.repartidores.map((r) => (
            <button key={r.id} type="button" onClick={() => { setElegido(r); setError(null); }} className={`${boton} bg-white text-2xl`}>{r.nombre}</button>
          ))}
          <button type="button" onClick={() => setRest(null)} className="w-full py-3 text-lg font-bold underline">Cambiar de restaurante</button>
        </div>
      ) : (
        <form onSubmit={entrar} className="space-y-3">
          <p className="text-xl font-extrabold">Hola, {elegido.nombre}</p>
          <label htmlFor="pin" className="text-lg font-semibold">Tu PIN</label>
          <input id="pin" type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoFocus value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} className={`${campo} text-center tracking-[0.5em]`} />
          <button type="submit" disabled={cargando || pin.length < 4} className={`${boton} bg-amber-300 disabled:opacity-40`}>{cargando ? "Entrando…" : "Entrar"}</button>
          <button type="button" onClick={() => { setElegido(null); setPin(""); setError(null); }} className="w-full py-3 text-lg font-bold underline">No soy yo</button>
        </form>
      )}
    </div>
  );
}

// --- panel -----------------------------------------------------------------

function Panel({ sesion, onSesion, onCerrar }: { sesion: SesionRep; onSesion: (s: SesionRep) => void; onCerrar: (m?: string) => Promise<void> }) {
  const base = obtenerBase();
  const token = sesion.token;
  const api: ApiRepartidor = useMemo(() => crearApiSupabase({ token }), [token]);
  const pedidos = useLiveQuery(() => base.pedidos.toArray(), [], [] as PedidoRep[]);
  const pendientes = useLiveQuery(() => base.acciones.count(), [], 0);
  const [sinSenal, setSinSenal] = useState(false);
  const [estadoGps, setEstadoGps] = useState<EstadoRastreo>("inactivo");
  const [pidiendoPermiso, setPidiendoPermiso] = useState<string | null>(null);
  const [instalar, setInstalar] = useState<{ prompt: () => Promise<void> } | null>(null);
  const controlador = useRef<ControladorRastreo | null>(null);
  const corriendo = useRef(false);
  const wake = useMemo(() => (typeof window === "undefined" ? null : crearWakeLock()), []);

  const sincronizarYa = useCallback(async () => {
    if (corriendo.current) return;
    corriendo.current = true;
    try {
      const r = await sincronizar(base, api);
      setSinSenal(r.sinSenal);
      if (!r.sinSenal) {
        // el servidor cierra el turno al liquidar
        const turno = await api.turnoActivo?.();
        if (turno === false && (await base.acciones.count()) === 0) await onCerrar("Tu turno se cerró. Entra de nuevo para empezar otro.");
      }
    } finally {
      corriendo.current = false;
    }
  }, [base, api, onCerrar]);

  const { repartidorId, nombre, sucursalId, radioLlegadaM } = sesion;

  // Controlador del GPS (una vez por sesión)
  useEffect(() => {
    const cliente = crearClienteRepartidor({ token });
    const c = new ControladorRastreo({
      proveedor: crearProveedorUbicacion(),
      base,
      canales: crearCanalesSupabase(cliente, { repartidorId, nombre, sucursalId }),
      repartidorId,
      radioLlegadaM,
      wakeLock: wake ?? undefined,
      alCambiarEstado: setEstadoGps,
      alLlegar: async (ordenId, l) => {
        if (await registrarAccion(base, ordenId, "llegar", { automatica: true, lat: l.lat, lng: l.lng })) {
          await c.registrarEvento("llegada", ordenId);
          void sincronizarYa();
        }
      },
    });
    controlador.current = c;
    return () => {
      c.detener();
      controlador.current = null;
    };
    // Solo depende de la identidad de la sesión: cambiar "aceptoUbicacion" NO debe reiniciar el GPS
  }, [token, repartidorId, nombre, sucursalId, radioLlegadaM, base, wake, sincronizarYa]);

  // El GPS sigue a los pedidos: encendido solo con alguno en camino
  useEffect(() => {
    controlador.current?.actualizarPedidos(pedidos);
  }, [pedidos]);

  // Sincronización: al abrir, cada 15 s, al volver la señal y al volver al frente
  useEffect(() => {
    void sincronizarYa();
    const id = window.setInterval(() => void sincronizarYa(), 15_000);
    const alVolverSenal = () => void sincronizarYa();
    const visibilidad = () => {
      if (document.visibilityState === "visible") {
        controlador.current?.alVolverAlFrente();
        void sincronizarYa();
      } else controlador.current?.alIrASegundoPlano();
    };
    window.addEventListener("online", alVolverSenal);
    document.addEventListener("visibilitychange", visibilidad);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("online", alVolverSenal);
      document.removeEventListener("visibilitychange", visibilidad);
    };
  }, [sincronizarYa]);

  useEffect(() => {
    const alOfrecer = (e: Event) => {
      e.preventDefault();
      setInstalar({ prompt: async () => { await (e as unknown as { prompt: () => Promise<void> }).prompt(); setInstalar(null); } });
    };
    window.addEventListener("beforeinstallprompt", alOfrecer);
    return () => window.removeEventListener("beforeinstallprompt", alOfrecer);
  }, []);

  async function ejecutarSalir(ordenId: string) {
    await controlador.current?.registrarEvento("salida", ordenId);
    if (await registrarAccion(base, ordenId, "salir")) void sincronizarYa();
  }

  async function alSali(p: PedidoRep) {
    if (!sesion.aceptoUbicacion && estadoGps !== "sin_permiso") setPidiendoPermiso(p.orden_id);
    else await ejecutarSalir(p.orden_id);
  }

  async function decidirUbicacion(acepta: boolean) {
    const ordenId = pidiendoPermiso;
    setPidiendoPermiso(null);
    if (acepta) {
      const nueva = { ...sesion, aceptoUbicacion: true };
      await base.meta.put({ clave: CLAVE_SESION, valor: nueva });
      onSesion(nueva);
      controlador.current?.setDeshabilitado(false);
      // queda registrado en el servidor; si no hay señal se reintenta en la próxima sincronización
      void api.aceptarUbicacion();
    } else {
      controlador.current?.setDeshabilitado(true);
    }
    if (ordenId) await ejecutarSalir(ordenId);
  }

  async function alLlegue(p: PedidoRep) {
    const l = controlador.current?.ultimaLectura;
    if (await registrarAccion(base, p.orden_id, "llegar", { lat: l?.lat ?? null, lng: l?.lng ?? null })) {
      await controlador.current?.registrarEvento("llegada", p.orden_id);
      void sincronizarYa();
    }
  }

  async function alEntregar(p: PedidoRep, monto: number) {
    const l = controlador.current?.ultimaLectura;
    await controlador.current?.registrarEvento("entrega", p.orden_id); // antes de que se apague el GPS
    if (await registrarAccion(base, p.orden_id, "entregar", { monto, lat: l?.lat ?? null, lng: l?.lng ?? null })) void sincronizarYa();
  }

  const activos = pedidos.filter((p) => p.estado_delivery !== "entregado")
    .sort((a, b) => (a.estado_delivery === "en_camino" ? -1 : 1) - (b.estado_delivery === "en_camino" ? -1 : 1));
  const entregados = pedidos.filter((p) => p.estado_delivery === "entregado");
  const enCamino = pedidos.some((p) => p.estado_delivery === "en_camino");

  return (
    <>
      <header className="mb-4 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-ink-600">{sesion.restaurante}</p>
          <p className="text-2xl font-black">{sesion.nombre}</p>
        </div>
        <button type="button" onClick={() => { if (pendientes === 0 || window.confirm(`Tienes ${pendientes} cambio(s) sin enviar. Si sales, se pierden. ¿Salir?`)) void onCerrar(); }}
          className="flex min-h-12 items-center gap-1.5 rounded-2xl border-2 border-black px-4 font-extrabold"><LogOut className="h-4 w-4" /> Salir</button>
      </header>

      {(sinSenal || pendientes > 0) && (
        <p role="status" className="mb-3 flex items-center gap-2 rounded-2xl border-2 border-black bg-amber-200 p-3 text-base font-extrabold">
          <WifiOff className="h-5 w-5 shrink-0" /> {sinSenal ? "Sin señal. " : ""}{pendientes > 0 ? `${pendientes} cambio(s) por enviar; se enviarán solos.` : "Sigues trabajando con lo guardado."}
        </p>
      )}
      {instalar && (
        <button type="button" onClick={() => void instalar.prompt()} className="mb-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-black bg-sky-200 font-extrabold"><Download className="h-5 w-5" /> Instalar la app en el teléfono</button>
      )}
      {enCamino && <BannerUbicacion estado={estadoGps} wakeLockSoportado={!!wake?.soportado()} onReintentar={() => controlador.current?.reintentar()} />}

      <div className="space-y-4">
        {activos.length === 0 && (
          <div className="rounded-3xl border-4 border-dashed border-ink-300 p-8 text-center">
            <p className="text-2xl font-black">Sin pedidos asignados</p>
            <p className="mt-1 text-lg font-semibold text-ink-600">Cuando el restaurante te asigne uno, aparece aquí solo.</p>
          </div>
        )}
        {activos.map((p) => (
          <TarjetaPedidoRep key={p.orden_id} pedido={p} onSali={() => void alSali(p)} onLlegue={() => void alLlegue(p)} onEntregar={(m) => void alEntregar(p, m)} />
        ))}
      </div>

      {entregados.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-xl font-black">Entregados en este turno ({entregados.length})</h2>
          <div className="space-y-3">
            {entregados.map((p) => <TarjetaPedidoRep key={p.orden_id} pedido={p} onSali={() => undefined} onLlegue={() => undefined} onEntregar={() => undefined} />)}
          </div>
        </section>
      )}

      {pidiendoPermiso && <PantallaUbicacion onAceptar={() => void decidirUbicacion(true)} onRechazar={() => void decidirUbicacion(false)} />}
    </>
  );
}
