import { createAdminClient } from "@/lib/supabase/admin";

interface AuditEntry {
  userId: string | null;
  action: string;
  cibleType?: string;
  cibleId?: string;
  dossierId?: string | null;
  details?: Record<string, unknown>;
}

/** Journalise une action dans audit_log (via service role). */
export async function journaliser(entry: AuditEntry): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("audit_log").insert({
    user_id: entry.userId,
    action: entry.action,
    cible_type: entry.cibleType ?? null,
    cible_id: entry.cibleId ?? null,
    dossier_id: entry.dossierId ?? null,
    details: entry.details ?? null,
  });
  if (error) console.error("[audit] Échec de journalisation :", error.message);
}
