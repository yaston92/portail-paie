import { NextResponse } from "next/server";
import { getCabinetActif } from "@/lib/cabinet";
import {
  DROITS_COLLABORATEUR,
  aLeDroit,
  type DroitCollaborateur,
} from "@/lib/droits";
import type { Profile } from "@/lib/types";

/** 403 si le collaborateur n'a pas ce droit. Les autres rôles passent. */
export async function refuserSansDroit(
  profile: Pick<Profile, "role">,
  droit: DroitCollaborateur
): Promise<NextResponse | null> {
  if (profile.role !== "collaborateur") return null;
  const cabinet = await getCabinetActif();
  if (aLeDroit(profile, cabinet, droit)) return null;
  const libelle =
    DROITS_COLLABORATEUR.find((item) => item.id === droit)?.label ?? "Cette action";
  return NextResponse.json(
    {
      error: `${libelle} : action non autorisée. Le directeur peut l'activer dans l'équipe.`,
    },
    { status: 403 }
  );
}
