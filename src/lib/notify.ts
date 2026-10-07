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
 * Destinataires cabinet d'un dossier :
 * collaborateur en charge, administrateurs et directeur du cabinet.
 * Sans collaborateur affecté, tous les collaborateurs du cabinet sont prévenus.
 */
export async function destinatairesCabinet(dossierId: string): Promise<string[]> {
  const admin = createAdminClient();
  const [{ data: dossier }, { data: affects }] = await Promise.all([
    admin
      .from("dossiers")
      .select("collaborateur_id, cabinet_id")
      .eq("id", dossierId)
      .single(),
    admin
      .from("dossier_collaborateurs")
      .select("profile_id")
      .eq("dossier_id", dossierId),
  ]);
  if (!dossier?.cabinet_id) return [];

  const assignes = new Set<string>();
  if (dossier.collaborateur_id) assignes.add(dossier.collaborateur_id);
  for (const a of affects ?? []) assignes.add(a.profile_id as string);

  const ids = new Set<string>(assignes);

  const { data: membres } = await admin
    .from("cabinet_membres")
    .select("profile_id, role_membre")
    .eq("cabinet_id", dossier.cabinet_id);

  const profileIds = (membres ?? []).map((m) => m.profile_id);
  const { data: profiles } = profileIds.length
    ? await admin.from("profiles").select("id, role").in("id", profileIds)
    : { data: [] as { id: string; role: string }[] };
  const roleParId = new Map((profiles ?? []).map((p) => [p.id, p.role]));

  for (const m of membres ?? []) {
    const role = roleParId.get(m.profile_id);
    const estDirection =
      role === "directeur" || role === "admin_cabinet" || m.role_membre === "admin";
    const estCollaborateur =
      assignes.size === 0 &&
      (role === "collaborateur" || m.role_membre === "collaborateur");
    if (estDirection || estCollaborateur) ids.add(m.profile_id);
  }

  return [...ids];
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
