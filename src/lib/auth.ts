import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { COOKIE_ESPACE, HEADER_ESPACE } from "@/lib/espace";
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
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  const profile = (data as Profile) ?? null;
  if (!profile) return null;
  return appliquerEspaceClient(profile);
});

/** Compte cabinet qui a aussi un dossier client : le cookie ou l'en-tête ouvre cet espace. */
async function appliquerEspaceClient(profile: Profile): Promise<Profile> {
  if (!profile.dossier_client_id || !isCabinetRole(profile.role)) return profile;
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const espace =
    cookieStore.get(COOKIE_ESPACE)?.value || headerStore.get(HEADER_ESPACE);
  if (espace !== "client") return profile;
  return {
    ...profile,
    role: "client",
    dossier_id: profile.dossier_client_id,
    espace_origine: profile.role,
  };
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
