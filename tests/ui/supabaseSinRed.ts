/** Cliente de Supabase que siempre falla como si no hubiera internet. */
const sinRed = { data: null, error: { message: "Failed to fetch" } };

const consulta = (): Record<string, unknown> => {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "insert", "update", "delete", "eq", "gte", "order", "limit", "single", "maybeSingle"]) {
    q[m] = () => q;
  }
  q.then = (ok: (v: unknown) => unknown) => Promise.resolve(sinRed).then(ok);
  return q;
};

export const clienteSinRed = () => ({ from: consulta, rpc: async () => sinRed });
