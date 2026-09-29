import { describe, it, expect } from "vitest";
import { crearBaseConMigraciones } from "./harness";

describe("migraciones", () => {
  it("todas se aplican en orden sobre una base limpia", async () => {
    const pg = await crearBaseConMigraciones();
    const r = await pg.query<{ n: number }>(
      "select count(*)::int as n from information_schema.tables where table_schema='public' and table_name in ('cai_rangos','documentos_fiscales','dispositivos_pos','datos_fiscales_emisor','incidentes_fiscales')"
    );
    expect(r.rows[0].n).toBe(5);
  });
});
