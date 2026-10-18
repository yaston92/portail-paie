import { NextResponse } from "next/server";
import type { Profile } from "@/lib/types";

export const DROITS_COLLABORATEUR = [
  {
    id: "salaries",
    label: "Salariés",
    detail: "Créer, modifier, importer, inviter et déclarer une sortie",
  },
  {
    id: "embauches",
    label: "Embauches",
    detail: "Valider, renvoyer ou marquer le rappel comme fait",
  },
  {
    id: "bulletins",
    label: "Bulletins",
    detail: "Déposer un PDF, corriger le découpage et publier",
  },
  {
    id: "variables",
    label: "Variables de paie",
    detail: "Ouvrir une campagne, la traiter, la relancer ou la rouvrir",
  },
  {
    id: "absences",
    label: "Arrêts et congés",
    detail: "Traiter un arrêt, réclamer un justificatif, accepter ou refuser un congé",
  },
] as const;

export type DroitCollaborateur = (typeof DROITS_COLLABORATEUR)[number]["id"];

export type DroitsCollaborateur = Record<DroitCollaborateur, boolean>;

export const DROITS_TOUS: DroitsCollaborateur = {
  salaries: true,
  embauches: true,
  bulletins: true,
  variables: true,
  absences: true,
};

export function lireDroits(raw: unknown): DroitsCollaborateur {
  const source =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const droits = { ...DROITS_TOUS };
  for (const droit of DROITS_COLLABORATEUR) {
    if (source[droit.id] === false) droits[droit.id] = false;
  }
  return droits;
}

export function droitsComplets(droits: DroitsCollaborateur): boolean {
  return DROITS_COLLABORATEUR.every((droit) => droits[droit.id]);
}

/** Directeur et administrateur : tout. Collaborateur : selon la fiche du cabinet actif. */
export function aLeDroit(
  profile: Pick<Profile, "role"> | null | undefined,
  cabinet: { role_membre?: string; droits?: unknown } | null | undefined,
  droit: DroitCollaborateur
): boolean {
  if (!profile) return false;
  if (profile.role !== "collaborateur") return true;
  if (cabinet?.role_membre === "admin") return true;
  return lireDroits(cabinet?.droits)[droit];
}

/** 403 si le collaborateur n'a pas ce droit. Les autres rôles passent. */
export async function refuserSansDroit(
  profile: Pick<Profile, "role">,
  droit: DroitCollaborateur
): Promise<NextResponse | null> {
  if (profile.role !== "collaborateur") return null;
  const { getCabinetActif } = await import("@/lib/cabinet");
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
