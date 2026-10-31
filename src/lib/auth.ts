import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { COOKIE_ESPACE, HEADER_ESPACE } from "@/lib/espace";
import { HEADER_USER_ID } from "@/lib/session-header";
import type { Profile, UserRole } from "@/lib/types";
import { ROLES_CABINET, isCabinetRole } from "@/lib/types";

export function roleHome(role: UserRole): string {
  switch (role) {
    case "directeur":
    case "admin_cabinet":
    case "collaborateur":
      return "/cabinet";
    case "client":
      return "/client";
    case "salarie":
      return "/salarie";
  }
}

export { isCabinetRole, ROLES_CABINET };

/**
 * Profil de l'utilisateur connecté, ou null.
 * `cache()` : une seule requête auth+profil par rendu serveur
 * (layout + page partagent le même résultat).
 */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const getProfile = cache(async (): Promise<Profile | null> => {
  const headerStore = await headers();
  const annonce = headerStore.get(HEADER_USER_ID)?.trim() ?? "";
  const supabase = await createClient();
  // Le proxy a déjà validé le jeton. On évite un second aller-retour Auth.
  let userId: string | null = null;
  if (UUID.test(annonce)) {
    userId = annonce;
  } else {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  }
  if (!userId) return null;
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  const profile = (data as Profile) ?? null;
  if (!profile) return null;
  return appliquerEspaceClient(profile);
});

/**
 * Un même compte peut ouvrir le cabinet, un espace client ou un espace salarié
 * d'une des sociétés auxquelles il est rattaché. Le cookie choisit l'espace.
 */
async function appliquerEspaceClient(profile: Profile): Promise<Profile> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const espace =
    cookieStore.get(COOKIE_ESPACE)?.value || headerStore.get(HEADER_ESPACE) || "";

  if (espace.startsWith("salarie:")) {
    const salarieId = espace.slice("salarie:".length);
    if (!salarieId) return profile;
    const supabase = await createClient();
    const { data } = await supabase
      .from("profil_espaces")
      .select("dossier_id, salarie_id")
      .eq("profile_id", profile.id)
      .eq("salarie_id", salarieId)
      .maybeSingle();
    const propre =
      profile.role === "salarie" && profile.salarie_id === salarieId
        ? { dossier_id: profile.dossier_id, salarie_id: profile.salarie_id }
        : null;
    const lien = data ?? propre;
    if (!lien?.salarie_id || !lien.dossier_id) return profile;
    if (profile.role === "salarie" && profile.salarie_id === lien.salarie_id) return profile;
    return {
      ...profile,
      role: "salarie",
      salarie_id: lien.salarie_id,
      dossier_id: lien.dossier_id,
      espace_origine: profile.role,
    };
  }

  if (espace === "client" || espace.startsWith("client:")) {
    const demande = espace.startsWith("client:") ? espace.slice("client:".length) : "";
    const dossierId = demande || profile.dossier_client_id || null;
    if (!dossierId) return profile;
    if (profile.role === "client" && profile.dossier_id === dossierId) return profile;
    const autorise =
      dossierId === profile.dossier_client_id ||
      (profile.role === "client" && profile.dossier_id === dossierId);
    if (!autorise) {
      const supabase = await createClient();
      const { data } = await supabase
        .from("profil_espaces")
        .select("dossier_id")
        .eq("profile_id", profile.id)
        .eq("kind", "client")
        .eq("dossier_id", dossierId)
        .maybeSingle();
      if (!data) return profile;
    }
    return {
      ...profile,
      role: "client",
      dossier_id: dossierId,
      espace_origine: profile.role,
    };
  }

  return profile;
}

/**
 * Exige un rôle donné (pages serveur). Redirige vers /login si non connecté,
 * vers l'accueil du rôle si le rôle ne correspond pas.
 */
export async function requireRole(roles: UserRole[]): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!roles.includes(profile.role)) {
    if (
      !(
        profile.role === "directeur" &&
        roles.includes("admin_cabinet")
      )
    ) {
      redirect(roleHome(profile.role));
    }
  }
  return profile;
}

/** Variante API : renvoie le profil ou null (le handler renvoie 401/403). */
export async function getApiProfile(roles?: UserRole[]): Promise<Profile | null> {
  const profile = await getProfile();
  if (!profile) return null;
  if (roles && !roles.includes(profile.role)) {
    // Le directeur hérite des droits admin_cabinet sur les API staff
    if (
      !(
        profile.role === "directeur" &&
        roles.includes("admin_cabinet")
      )
    ) {
      return null;
    }
  }
  return profile;
}

/** Staff cabinet (directeur / admin / collab). */
export async function getApiCabinetProfile(): Promise<Profile | null> {
  return getApiProfile(ROLES_CABINET);
}

/**
 * Vérifie que l'utilisateur cabinet courant a accès à un dossier
 * (RLS : membership + admin ou portefeuille).
 */
export async function cabinetPeutAccederDossier(dossierId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dossiers")
    .select("id")
    .eq("id", dossierId)
    .maybeSingle();
  return data !== null;
}

export function estStaffCabinet(profile: Profile): boolean {
  return isCabinetRole(profile.role);
}
