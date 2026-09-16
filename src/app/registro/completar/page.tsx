import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CompletarRegistroForm } from "./CompletarRegistroForm";

export default async function CompletarRegistroPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Si ya tiene fila en `usuarios` (lo completó antes, o llegó acá por
  // error), no lo dejamos crear un segundo tenant.
  const { data: usuario } = await supabase.from("usuarios").select("id").eq("id", user.id).maybeSingle();
  if (usuario) redirect("/");

  const metadata = user.user_metadata as Record<string, unknown> | null;
  const nombreInicial =
    (typeof metadata?.full_name === "string" && metadata.full_name) ||
    (typeof metadata?.name === "string" && metadata.name) ||
    "";

  return <CompletarRegistroForm nombreInicial={nombreInicial} correo={user.email ?? ""} />;
}
