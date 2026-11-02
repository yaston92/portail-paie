import { createAdminClient } from "@/lib/supabase/admin";
import { envoyerEmail, gabaritEmail } from "@/lib/email";

interface NotifyParams {
  userIds: string[];
  titre: string;
  corps: string;
  lien?: string;
  /** Texte du bouton dans l'email. */
  libelleLien?: string;
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
  const [{ data: clients }, { data: lies }, { data: espaces }] = await Promise.all([
    admin.from("profiles").select("id").eq("role", "client").eq("dossier_id", dossierId),
    admin.from("profiles").select("id").eq("dossier_client_id", dossierId),
    admin
      .from("profil_espaces")
      .select("profile_id")
      .eq("kind", "client")
      .eq("dossier_id", dossierId),
  ]);
  const ids = new Set<string>();
  for (const c of clients ?? []) ids.add(c.id);
  for (const c of lies ?? []) ids.add(c.id);
  for (const e of espaces ?? []) ids.add(e.profile_id as string);
  return [...ids];
}

/** Clients de plusieurs dossiers en une requête : Map dossier_id → userIds. */
export async function destinatairesClientsParDossier(
  dossierIds: string[]
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (dossierIds.length === 0) return map;
  const admin = createAdminClient();
  const [{ data }, { data: lies }, { data: espaces }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, dossier_id")
      .eq("role", "client")
      .in("dossier_id", dossierIds),
    admin
      .from("profiles")
      .select("id, dossier_client_id")
      .in("dossier_client_id", dossierIds),
    admin
      .from("profil_espaces")
      .select("profile_id, dossier_id")
      .eq("kind", "client")
      .in("dossier_id", dossierIds),
  ]);
  for (const p of data ?? []) {
    if (!p.dossier_id) continue;
    const liste = map.get(p.dossier_id) ?? [];
    liste.push(p.id);
    map.set(p.dossier_id, liste);
  }
  for (const p of lies ?? []) {
    if (!p.dossier_client_id) continue;
    const liste = map.get(p.dossier_client_id) ?? [];
    if (!liste.includes(p.id)) liste.push(p.id);
    map.set(p.dossier_client_id, liste);
  }
  if (!espaces) return map;
  for (const e of espaces) {
    if (!e.dossier_id) continue;
    const liste = map.get(e.dossier_id) ?? [];
    if (!liste.includes(e.profile_id)) liste.push(e.profile_id);
    map.set(e.dossier_id, liste);
  }
  return map;
}

/** Seul le client valide une demande de congés. Le cabinet n'est pas prévenu. */
export async function prevenirDemandeConge(opts: {
  dossierId: string;
  titre: string;
  corps: string;
}) {
  await notifier({
    userIds: await destinatairesClient(opts.dossierId),
    titre: opts.titre,
    corps: opts.corps,
    lien: "/client/conges",
    libelleLien: "Voir la demande",
  });
}

/** Crée des notifications in-app et envoie l'email correspondant. */
export async function notifier({
  userIds,
  titre,
  corps,
  lien,
  libelleLien,
  email = true,
}: NotifyParams) {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) {
    console.error("[notif] aucun destinataire:", titre);
    return;
  }
  const admin = createAdminClient();

  const { error } = await admin.from("notifications").insert(
    ids.map((userId) => ({
      user_id: userId,
      titre,
      corps,
      lien: lien ?? null,
    }))
  );
  if (error) console.error("[notif] enregistrement:", titre, error.message);

  await envoyerPush(ids, titre, corps, lien);

  if (email) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("email, nom, prenom")
      .in("id", ids);
    const destinataires = (profiles ?? [])
      .filter((p) => p.email)
      .map((p) => ({ email: p.email as string, name: `${p.prenom} ${p.nom}`.trim() }));
    if (destinataires.length === 0) {
      console.error("[notif] aucun email:", titre);
      return;
    }
    const ok = await envoyerEmail({
      to: destinataires,
      subject: titre,
      html: gabaritEmail(titre, corps, lien, libelleLien),
    });
    if (!ok) console.error("[notif] email refusé:", titre);
  }
}

/** Bannière sur le téléphone, via le service Expo. N'interrompt pas l'envoi si le jeton manque. */
async function envoyerPush(
  userIds: string[],
  titre: string,
  corps: string,
  lien?: string
) {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("push_tokens")
      .select("token")
      .in("user_id", userIds);
    if (error || !data?.length) {
      if (error) console.error("[push] lecture jetons:", error.message);
      return;
    }
    const messages = data.map((row) => ({
      to: row.token as string,
      title: titre,
      body: corps.slice(0, 180),
      data: { lien: lien ?? null },
      sound: "default",
      priority: "high",
      channelId: "etik",
    }));
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    };
    const tokenExpo = process.env.EXPO_ACCESS_TOKEN?.trim();
    if (tokenExpo) headers.Authorization = `Bearer ${tokenExpo}`;

    for (let i = 0; i < messages.length; i += 100) {
      const lot = messages.slice(i, i + 100);
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers,
        body: JSON.stringify(lot),
      });
      const json = (await res.json().catch(() => null)) as {
        data?: { status?: string; message?: string; details?: { error?: string } }[];
        errors?: { message?: string }[];
      } | null;
      if (!res.ok) {
        console.error("[push] Expo a refusé l'envoi:", res.status, json);
        continue;
      }
      const morts: string[] = [];
      (json?.data ?? []).forEach((ticket, index) => {
        if (ticket.status === "error") {
          console.error("[push] ticket:", ticket.message, ticket.details?.error);
          if (ticket.details?.error === "DeviceNotRegistered") {
            const to = lot[index]?.to;
            if (to) morts.push(to);
          }
        }
      });
      if (morts.length > 0) {
        await admin.from("push_tokens").delete().in("token", morts);
      }
    }
  } catch (e) {
    console.error("[push]", e);
  }
}
