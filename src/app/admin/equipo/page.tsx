import { ChefHat, KeyRound, ShieldCheck, UserPlus, Users, Wallet, UtensilsCrossed } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, PageHeader } from "@/components/ui/Card";
import { Field, SelectField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Colapsable } from "@/components/ui/Colapsable";
import { ClaveUsuario } from "@/components/admin/ClaveUsuario";
import { AbrirPanelPersonal } from "@/components/admin/AbrirPanelPersonal";
import { rolDeLogin } from "@/lib/auth/enlaces";
import { INFO_ROL, ROLES_PERSONAL, type RolEquipo } from "@/lib/auth/roles";
import { actualizarUsuario, crearUsuario } from "./actions";

const ICONO_ROL = { admin: ShieldCheck, cajero: Wallet, mesero: UtensilsCrossed, cocina: ChefHat } as const;
const ORDEN_ROLES: RolEquipo[] = ["admin", "cajero", "mesero", "cocina"];

export default async function EquipoPage({
  searchParams,
}: {
  searchParams: Promise<{ nuevoEmail?: string; nuevoRol?: string; errorClave?: string; errorUsuario?: string }>;
}) {
  const sesion = await requireAdmin();
  const supabase = await createClient();
  const { nuevoEmail, nuevoRol, errorClave, errorUsuario } = await searchParams;
  const rolNuevo = rolDeLogin(nuevoRol);

  const [{ data: sucursales }, { data: usuarios }] = await Promise.all([
    supabase.from("sucursales").select("id, nombre").eq("tenant_id", sesion.tenant_id).eq("activo", true).order("created_at"),
    supabase.from("usuarios").select("*").eq("tenant_id", sesion.tenant_id).order("created_at"),
  ]);

  const varias = (sucursales ?? []).length > 1;
  const nombreSucursal = new Map((sucursales ?? []).map((s) => [s.id, s.nombre]));
  const equipo = usuarios ?? [];
  const porRol = (rol: RolEquipo) => equipo.filter((u) => u.rol === rol);

  return (
    <div>
      <PageHeader
        title="Equipo de trabajo"
        subtitle="Las personas que usan Pedilo en tu negocio. Cada rol ve solo lo que necesita para trabajar."
      />

      {nuevoEmail && (
        <div className="mb-6 flex flex-wrap items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
          <p className="min-w-0 flex-1">
            Usuario <b>{nuevoEmail}</b> creado. Puedes ver su contraseña cuando quieras abriendo su fila y tocando «Ver
            contraseña».
          </p>
          {rolNuevo && (
            <div className="shrink-0">
              <AbrirPanelPersonal rol={rolNuevo} email={nuevoEmail} />
            </div>
          )}
        </div>
      )}

      {errorUsuario && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <UserPlus className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
          <p>{errorUsuario}</p>
        </div>
      )}

      {errorClave && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
          <p>{errorClave}</p>
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ORDEN_ROLES.map((rol) => {
          const Icono = ICONO_ROL[rol];
          const info = INFO_ROL[rol];
          return (
            <Card key={rol} className="p-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-50 text-ink-600">
                  <Icono className="h-4 w-4" strokeWidth={2} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-900">{info.etiqueta}</p>
                  <p className="text-xs text-ink-400">{porRol(rol).length} en el equipo</p>
                </div>
              </div>
              <p className="mt-2 text-xs text-ink-500">{info.descripcion}</p>
            </Card>
          );
        })}
      </div>

      <Card className="mb-6">
        <div className="p-5">
          <Colapsable
            key={`agregar-equipo-${equipo.length}`}
            tour="abrir-personal"
            resumen={
              <span className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <UserPlus className="h-4 w-4 text-brand-600" strokeWidth={2} />
                Agregar al equipo
              </span>
            }
          >
            <form action={crearUsuario} data-tour="form-personal" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Nombre" name="nombre" required />
              <Field label="Correo" name="email" type="email" required />
              <Field label="Contraseña (vacío = generar)" name="clave" autoComplete="off" />
              <SelectField label="Rol" name="rol" defaultValue="mesero">
                <option value="mesero">Mesero — toma pedidos</option>
                <option value="cajero">Cajero — cobra</option>
                <option value="cocina">Cocina — solo despacha pedidos</option>
                <option value="admin">Administrador — acceso total</option>
              </SelectField>
              {varias ? (
                <SelectField label="Sucursal (no aplica a administradores)" name="sucursal_id" defaultValue={sucursales?.[0]?.id ?? ""}>
                  {(sucursales ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </SelectField>
              ) : (
                <input type="hidden" name="sucursal_id" value={sucursales?.[0]?.id ?? ""} />
              )}
              <div className="col-span-full">
                <Button type="submit" size="sm">
                  <UserPlus className="h-3.5 w-3.5" strokeWidth={2} />
                  Agregar
                </Button>
              </div>
            </form>
          </Colapsable>
        </div>
      </Card>

      {equipo.length === 0 && <p className="text-sm text-ink-500">Todavía no hay nadie en el equipo.</p>}

      <div className="space-y-6">
        {ORDEN_ROLES.map((rol) => {
          const miembros = porRol(rol);
          if (miembros.length === 0) return null;
          const info = INFO_ROL[rol];
          const Icono = ICONO_ROL[rol];
          return (
            <Card key={rol}>
              <CardHeader title={info.plural} subtitle={info.descripcion} />
              <div className="space-y-2 p-5">
                {miembros.map((u) => (
                  <Colapsable
                    key={u.id}
                    className="rounded-xl"
                    resumen={
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-ink-900">{u.nombre}</span>
                        <Badge tone={info.tono}>
                          <Icono className="h-3 w-3" strokeWidth={2} />
                          {info.etiqueta.toLowerCase()}
                        </Badge>
                        {varias && u.sucursal_id && (
                          <span className="text-xs text-ink-400">{nombreSucursal.get(u.sucursal_id) ?? "Sucursal"}</span>
                        )}
                        {u.id === sesion.id && <Badge tone="brand">tú</Badge>}
                        {!u.activo && <Badge tone="danger">inactivo</Badge>}
                      </div>
                    }
                  >
                    <form action={actualizarUsuario.bind(null, u.id)} className="flex flex-wrap items-end gap-3">
                      <div className="min-w-32 flex-1">
                        <label className="mb-1 block text-xs font-medium text-ink-500">Nombre</label>
                        <input
                          name="nombre"
                          defaultValue={u.nombre}
                          className="w-full rounded-lg border border-ink-200 px-2 py-1.5 text-sm font-medium text-ink-900 focus:border-brand-500 focus:outline-none"
                        />
                      </div>
                      {u.rol !== "admin" && (
                        <div>
                          <label className="mb-1 block text-xs font-medium text-ink-500">Rol</label>
                          <select
                            name="rol"
                            defaultValue={u.rol}
                            className="rounded-lg border border-ink-200 bg-white px-2 py-1.5 text-xs"
                          >
                            {ROLES_PERSONAL.map((r) => (
                              <option key={r} value={r}>
                                {INFO_ROL[r].etiqueta}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      {u.rol !== "admin" &&
                        (varias ? (
                          <div>
                            <label className="mb-1 block text-xs font-medium text-ink-500">Sucursal</label>
                            <select
                              name="sucursal_id"
                              defaultValue={u.sucursal_id ?? ""}
                              className="rounded-lg border border-ink-200 bg-white px-2 py-1.5 text-xs"
                            >
                              {(sucursales ?? []).map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                  {opt.nombre}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <input type="hidden" name="sucursal_id" value={u.sucursal_id ?? ""} />
                        ))}
                      <div className="min-w-32 flex-1">
                        <label className="mb-1 block text-xs font-medium text-ink-500">Nueva contraseña (opcional)</label>
                        <input
                          name="clave"
                          autoComplete="off"
                          placeholder="Dejar vacío para no cambiarla"
                          className="w-full rounded-lg border border-ink-200 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
                        />
                      </div>
                      {(u.rol === "cajero" || u.rol === "admin") && (
                        <label className="mb-2 flex items-center gap-1.5 text-xs text-ink-600" title="Solo funciona si el negocio lo activó en Facturación fiscal">
                          <input
                            type="checkbox"
                            name="puede_ticket_sin_factura"
                            defaultChecked={u.puede_ticket_sin_factura}
                            className="h-3.5 w-3.5 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                          />
                          Puede cobrar con ticket sin factura
                        </label>
                      )}
                      {u.id !== sesion.id && (
                        <label className="mb-2 flex items-center gap-1.5 text-xs text-ink-600">
                          <input
                            type="checkbox"
                            name="activo"
                            defaultChecked={u.activo}
                            className="h-3.5 w-3.5 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                          />
                          Activo
                        </label>
                      )}
                      <Button size="sm" variant="secondary" className="ml-auto">
                        Guardar
                      </Button>
                      <div className="flex w-full flex-wrap items-center justify-between gap-2">
                        <ClaveUsuario usuarioId={u.id} />
                        {(u.rol === "cajero" || u.rol === "mesero" || u.rol === "cocina") && (
                          <AbrirPanelPersonal rol={u.rol} compacto />
                        )}
                      </div>
                    </form>
                  </Colapsable>
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      {equipo.length > 0 && (
        <p className="mt-6 flex items-center gap-1.5 text-xs text-ink-400">
          <Users className="h-3.5 w-3.5" strokeWidth={2} />
          {equipo.length} {equipo.length === 1 ? "persona" : "personas"} en el equipo de trabajo.
        </p>
      )}
    </div>
  );
}
