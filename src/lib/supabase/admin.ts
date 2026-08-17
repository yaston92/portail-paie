import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Client service role : contourne la RLS.
 * À n'utiliser que côté serveur, après vérification explicite des droits.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
