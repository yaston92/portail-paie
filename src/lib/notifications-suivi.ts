import { createAdminClient } from "@/lib/supabase/admin";
import { isCabinetRole, type Profile, type UserRole } from "@/lib/types";

export type VueNotification = "pas-encore" | "traite";

export interface NotificationAffichee {
  id: string;
  user_id: string;
  titre: string;
  corps: string | null;
  lien: string | null;
  lu: boolean;
  traite: boolean;
  created_at: string;
  /** Collaborateurs du cabinet qui ont la même tâche. */
  collaborateurs: string[];
}

type Ligne = NotificationAffichee & {
  groupe_id: string | null;
  role: UserRole | null;
};

function vueDemandee(valeur: string | undefined): VueNotification {
  return valeur === "traite" ? "traite" : "pas-encore";
}

export function lireVueNotification(valeur: string | undefined): VueNotification {
  return vueDemandee(valeur);
}

function cleGroupe(ligne: {
  groupe_id: string | null;
  titre: string;
  corps: string | null;
  lien: string | null;
  created_at: string;
}): string {
  if (ligne.groupe_id) return `g:${ligne.groupe_id}`;
  const seau = Math.floor(new Date(ligne.created_at).getTime() / 5000);
  return `s:${ligne.titre}|${ligne.corps ?? ""}|${ligne.lien ?? ""}|${seau}`;
}

function colonneAbsente(message: string | undefined, colonne: string): boolean {
  return Boolean(message && message.includes(colonne));
}

async function portee(profile: Profile): Promise<{ direction: boolean; userIds: string[] }> {
  if (!isCabinetRole(profile.role)) {
    return { direction: false, userIds: [profile.id] };
  }
  const admin = createAdminClient();
  const { data: miens } = await admin
    .from("cabinet_membres")
    .select("cabinet_id, role_membre")
    .eq("profile_id", profile.id);
  const direction =
    profile.role === "directeur" ||
    profile.role === "admin_cabinet" ||
    (miens ?? []).some((m) => m.role_membre === "admin");
  if (!direction) return { direction: false, userIds: [profile.id] };

  const cabinetIds = [...new Set((miens ?? []).map((m) => m.cabinet_id as string))];
  if (cabinetIds.length === 0) return { direction: true, userIds: [profile.id] };

  const { data: membres } = await admin
    .from("cabinet_membres")
    .select("profile_id")
    .in("cabinet_id", cabinetIds);
  const ids = new Set<string>([profile.id]);
  for (const m of membres ?? []) ids.add(m.profile_id as string);
  return { direction: true, userIds: [...ids] };
}

async function audienceCabinet(userId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data: profil } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (!profil || !isCabinetRole(profil.role as UserRole)) return [userId];

  const { data: miens } = await admin
    .from("cabinet_membres")
    .select("cabinet_id")
    .eq("profile_id", userId);
  const cabinetIds = [...new Set((miens ?? []).map((m) => m.cabinet_id as string))];
  if (cabinetIds.length === 0) return [userId];

  const { data: membres } = await admin
    .from("cabinet_membres")
    .select("profile_id")
    .in("cabinet_id", cabinetIds);
  const ids = new Set<string>([userId]);
  for (const m of membres ?? []) ids.add(m.profile_id as string);
  return [...ids];
}

async function lignesBrutes(
  userIds: string[],
  vue: VueNotification,
  limiteDate: string | null
): Promise<Ligne[]> {
  const admin = createAdminClient();
  const traite = vue === "traite";
  const colonnes = "id, user_id, titre, corps, lien, lu, traite, created_at, groupe_id";
  let requete = admin
    .from("notifications")
    .select(colonnes)
    .in("user_id", userIds)
    .eq("traite", traite)
    .order("created_at", { ascending: false })
    .limit(500);
  if (limiteDate) requete = requete.gte("created_at", limiteDate);

  let { data, error } = await requete;
  if (colonneAbsente(error?.message, "groupe_id")) {
    let secours = admin
      .from("notifications")
      .select("id, user_id, titre, corps, lien, lu, traite, created_at")
      .in("user_id", userIds)
      .eq("traite", traite)
      .order("created_at", { ascending: false })
      .limit(500);
    if (limiteDate) secours = secours.gte("created_at", limiteDate);
    const retry = await secours;
    data = (retry.data ?? []).map((row) => ({ ...row, groupe_id: null }));
    error = retry.error;
  }
  if (error || !data?.length) return [];

  const ids = [...new Set(data.map((row) => row.user_id as string))];
  const { data: profils } = await admin
    .from("profiles")
    .select("id, prenom, nom, role")
    .in("id", ids);
  const parId = new Map((profils ?? []).map((p) => [p.id as string, p]));

  return data.map((row) => {
    const profil = parId.get(row.user_id as string);
    return {
      id: row.id as string,
      user_id: row.user_id as string,
      titre: row.titre as string,
      corps: (row.corps as string | null) ?? null,
      lien: (row.lien as string | null) ?? null,
      lu: row.lu === true,
      traite: row.traite === true,
      created_at: row.created_at as string,
      groupe_id: (row.groupe_id as string | null) ?? null,
      role: (profil?.role as UserRole | undefined) ?? null,
      collaborateurs: [],
      prenom: (profil?.prenom as string | undefined) ?? "",
      nom: (profil?.nom as string | undefined) ?? "",
    };
  });
}

type LigneNommee = Ligne & { prenom: string; nom: string };

function regrouper(lignes: LigneNommee[], profile: Profile, direction: boolean): NotificationAffichee[] {
  const groupes = new Map<string, LigneNommee[]>();
  for (const ligne of lignes) {
    const cle = cleGroupe(ligne);
    const liste = groupes.get(cle) ?? [];
    liste.push(ligne);
    groupes.set(cle, liste);
  }

  const resultat: NotificationAffichee[] = [];
  for (const groupe of groupes.values()) {
    const ref = groupe.find((ligne) => ligne.user_id === profile.id) ?? groupe[0];
    const collaborateurs = direction
      ? [
          ...new Set(
            groupe
              .filter((ligne) => ligne.role === "collaborateur" && ligne.user_id !== profile.id)
              .map((ligne) => `${ligne.prenom} ${ligne.nom}`.trim())
              .filter(Boolean)
          ),
        ]
      : [];
    resultat.push({
      id: ref.id,
      user_id: ref.user_id,
      titre: ref.titre,
      corps: ref.corps,
      lien: ref.lien,
      lu: ref.lu,
      traite: ref.traite,
      created_at: ref.created_at,
      collaborateurs,
    });
  }
  resultat.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return resultat;
}

function limiteClient(role: UserRole): string | null {
  if (role !== "client") return null;
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
}

/** Liste dédupliquée. La direction voit aussi les tâches des collaborateurs, avec le même statut. */
export async function listerNotifications(
  profile: Profile,
  vue: VueNotification
): Promise<NotificationAffichee[]> {
  const { direction, userIds } = await portee(profile);
  const lignes = (await lignesBrutes(userIds, vue, limiteClient(profile.role))) as LigneNommee[];
  return regrouper(lignes, profile, direction).slice(0, 100);
}

/** Nombre de tâches encore à traiter, une seule fois par alerte partagée. */
export async function compterNotificationsATraiter(profile: Profile): Promise<number> {
  const { direction, userIds } = await portee(profile);
  const lignes = (await lignesBrutes(
    userIds,
    "pas-encore",
    limiteClient(profile.role)
  )) as LigneNommee[];
  return regrouper(lignes, profile, direction).length;
}

/** Pose le même statut sur toutes les copies cabinet de la même alerte. */
export async function marquerNotification(
  profile: Profile,
  id: string,
  traite: boolean
): Promise<boolean> {
  const admin = createAdminClient();
  const avecGroupe = await admin
    .from("notifications")
    .select("id, user_id, titre, corps, lien, created_at, groupe_id")
    .eq("id", id)
    .maybeSingle();
  let row = avecGroupe.data;
  if (colonneAbsente(avecGroupe.error?.message, "groupe_id")) {
    const secours = await admin
      .from("notifications")
      .select("id, user_id, titre, corps, lien, created_at")
      .eq("id", id)
      .maybeSingle();
    row = secours.data ? { ...secours.data, groupe_id: null } : null;
  } else if (avecGroupe.error) {
    return false;
  }
  if (!row) return false;

  const { direction, userIds } = await portee(profile);
  const autorise = row.user_id === profile.id || (direction && userIds.includes(row.user_id));
  if (!autorise) return false;

  const cibles = await audienceCabinet(row.user_id as string);
  const groupeId = (row.groupe_id as string | null) ?? null;
  if (groupeId) {
    const { error } = await admin
      .from("notifications")
      .update({ traite })
      .eq("groupe_id", groupeId)
      .in("user_id", cibles);
    return !error;
  }

  const instant = new Date(row.created_at as string).getTime();
  let requete = admin
    .from("notifications")
    .update({ traite })
    .in("user_id", cibles)
    .eq("titre", row.titre as string)
    .gte("created_at", new Date(instant - 5000).toISOString())
    .lte("created_at", new Date(instant + 5000).toISOString());
  requete =
    row.corps == null ? requete.is("corps", null) : requete.eq("corps", row.corps as string);
  requete = row.lien == null ? requete.is("lien", null) : requete.eq("lien", row.lien as string);
  const { error } = await requete;
  return !error;
}
