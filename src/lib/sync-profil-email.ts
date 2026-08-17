import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Aligne profiles.email sur l'email Auth après confirmation d'un changement.
 */
export async function synchroniserEmailProfil(
  supabase: SupabaseClient,
  userId: string,
  email: string
): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return;
  const { error } = await supabase
    .from("profiles")
    .update({ email: normalized })
    .eq("id", userId);
  if (error) {
    console.error("[profil] sync email :", error.message);
  }
}
