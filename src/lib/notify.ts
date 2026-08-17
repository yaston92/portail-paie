import { createAdminClient } from "@/lib/supabase/admin";
import { envoyerEmail, gabaritEmail } from "@/lib/email";

interface NotifyParams {
  userIds: string[];
  titre: string;
  corps: string;
  lien?: string;
  email?: boolean;
}

/**
 * Destinataires côté cabinet pour un dossier : le collaborateur en charge,
 * ou à défaut tous les administrateurs.
 */
export async function destinatairesCabinet(dossierId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data: dossier } = await admin
    .from("dossiers")
    .select("collaborateur_id")
    .eq("id", dossierId)
    .single();
  if (dossier?.collaborateur_id) return [dossier.collaborateur_id];
  const { data: admins } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "admin_cabinet");
  return (admins ?? []).map((a) => a.id);
}

/** Comptes client d'un dossier. */
export async function destinatairesClient(dossierId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "client")
    .eq("dossier_id", dossierId);
  return (data ?? []).map((c) => c.id);
}

/** Clients de plusieurs dossiers en une requête : Map dossier_id → userIds. */
export async function destinatairesClientsParDossier(
  dossierIds: string[]
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (dossierIds.length === 0) return map;
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, dossier_id")
    .eq("role", "client")
    .in("dossier_id", dossierIds);
  for (const p of data ?? []) {
    if (!p.dossier_id) continue;
    const liste = map.get(p.dossier_id) ?? [];
    liste.push(p.id);
    map.set(p.dossier_id, liste);
  }
  return map;
}

/** Crée des notifications in-app et envoie l'email correspondant. */
export async function notifier({ userIds, titre, corps, lien, email = true }: NotifyParams) {
  if (userIds.length === 0) return;
  const admin = createAdminClient();

  await admin.from("notifications").insert(
    userIds.map((userId) => ({
      user_id: userId,
      titre,
      corps,
      lien: lien ?? null,
    }))
  );

  if (email) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("email, nom, prenom")
      .in("id", userIds);
    const destinataires = (profiles ?? [])
      .filter((p) => p.email)
      .map((p) => ({ email: p.email as string, name: `${p.prenom} ${p.nom}`.trim() }));
    if (destinataires.length > 0) {
      await envoyerEmail({
        to: destinataires,
        subject: titre,
        html: gabaritEmail(titre, corps, lien),
      });
    }
  }
}
