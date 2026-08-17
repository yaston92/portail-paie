import { NextResponse } from "next/server";
import { getApiProfile } from "@/lib/auth";
import { soldePrevisionnel } from "@/lib/demandes-conge";
import { createAdminClient } from "@/lib/supabase/admin";
import { obtenirSoldeCp } from "@/lib/solde-cp-sync";
import type { DemandeConge, SoldeCp } from "@/lib/types";

/** Solde CP du salarié connecté (+ prévisionnel). PDF re-lu seulement si besoin. */
export async function GET(request: Request) {
  const profile = await getApiProfile(["salarie"]);
  if (!profile?.salarie_id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const force =
    new URL(request.url).searchParams.get("force") === "1" ||
    new URL(request.url).searchParams.get("force") === "true";

  const admin = createAdminClient();
  const [solde, demandesRes] = await Promise.all([
    obtenirSoldeCp(profile.salarie_id, { force }),
    admin
      .from("demandes_conge")
      .select("statut, jours, date_fin")
      .eq("salarie_id", profile.salarie_id)
      .in("statut", ["en_attente", "validee"]),
  ]);

  const previsionnel = solde
    ? soldePrevisionnel(
        solde.restant,
        (demandesRes.data ?? []) as Pick<
          DemandeConge,
          "statut" | "jours" | "date_fin"
        >[],
        solde.mois_reference
      )
    : null;

  return NextResponse.json(
    solde
      ? ({ ...solde, previsionnel } as SoldeCp & { previsionnel: number | null })
      : { previsionnel: null }
  );
}
