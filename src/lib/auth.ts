import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
  return (data as Profile) ?? null;
});

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
