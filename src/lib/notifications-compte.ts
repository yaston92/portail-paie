import type { SupabaseClient } from "@supabase/supabase-js";

/** Nombre de notifications encore à traiter. Repli sur les non lues si la colonne n'existe pas encore. */
export async function compterATraiter(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const traite = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("traite", false);
  if (!traite.error) return traite.count ?? 0;
  const lues = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("lu", false);
  return lues.count ?? 0;
}
