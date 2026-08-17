import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile, requireRole } from "@/lib/auth";
import type {
  Cabinet,
  CabinetRoleMembre,
  Profile,
  UserRole,
} from "@/lib/types";
import { ROLES_CABINET } from "@/lib/types";

export const COOKIE_CABINET_ID = "cabinet_id";
export const HEADER_CABINET_ID = "x-cabinet-id";

export type CabinetAvecRole = Cabinet & { role_membre: CabinetRoleMembre };

/** Cabinets auxquels le profil est membre (non archivés). */
export const getCabinetsMembre = cache(
  async (profileId?: string): Promise<CabinetAvecRole[]> => {
    const profile = profileId
      ? { id: profileId }
      : await getProfile();
    if (!profile) return [];

    const supabase = await createClient();
    const { data } = await supabase
      .from("cabinet_membres")
      .select("role_membre, cabinet:cabinets (id, nom, archive, created_at)")
      .eq("profile_id", profile.id);

    const out: CabinetAvecRole[] = [];
    for (const row of data ?? []) {
      const c = (row as { cabinet?: Cabinet | Cabinet[] | null }).cabinet;
      const cab = Array.isArray(c) ? c[0] : c;
      if (!cab || cab.archive) continue;
      out.push({
        ...cab,
        role_membre: (row as { role_membre: CabinetRoleMembre }).role_membre,
      });
    }
    out.sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
    return out;
  }
);

async function lireCabinetIdDemande(): Promise<string | null> {
  const headerStore = await headers();
  const fromHeader = headerStore.get(HEADER_CABINET_ID)?.trim();
  if (fromHeader) return fromHeader;
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_CABINET_ID)?.value ?? null;
}

/**
 * Cabinet actif : cookie / header X-Cabinet-Id s'il est membre, sinon premier membership.
 */
export const getCabinetActif = cache(
  async (): Promise<CabinetAvecRole | null> => {
    const membres = await getCabinetsMembre();
    if (membres.length === 0) return null;
    const demande = await lireCabinetIdDemande();
    if (demande) {
      const found = membres.find((m) => m.id === demande);
      if (found) return found;
    }
    return membres[0] ?? null;
  }
);

/** Exige un rôle staff. Cabinet actif requis sauf directeur sans membership (création). */
export async function requireCabinetContext(
  roles: UserRole[] = ROLES_CABINET,
  opts?: { allowEmptyDirecteur?: boolean }
): Promise<{
  profile: Profile;
  cabinet: CabinetAvecRole | null;
  cabinets: CabinetAvecRole[];
}> {
  const profile = await requireRole(roles);
  const cabinets = await getCabinetsMembre(profile.id);
  const cabinet = await getCabinetActif();
  if (!cabinet) {
    if (opts?.allowEmptyDirecteur && profile.role === "directeur") {
      return { profile, cabinet: null, cabinets };
    }
    if (profile.role === "directeur") redirect("/cabinet/cabinets");
    redirect("/login");
  }
  return { profile, cabinet, cabinets };
}

export function peutAdminCabinet(
  profile: Profile,
  cabinet: CabinetAvecRole
): boolean {
  return (
    profile.role === "directeur" ||
    profile.role === "admin_cabinet" ||
    cabinet.role_membre === "admin"
  );
}
