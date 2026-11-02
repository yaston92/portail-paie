import { NextResponse } from "next/server";
import { getApiProfile } from "@/lib/auth";
import { obtenirSoldeCp } from "@/lib/solde-cp-sync";

/** Solde CP du salarié connecté, tel qu'il figure sur le bulletin. */
export async function GET(request: Request) {
  const profile = await getApiProfile(["salarie"]);
  if (!profile?.salarie_id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const force =
    new URL(request.url).searchParams.get("force") === "1" ||
    new URL(request.url).searchParams.get("force") === "true";

  const solde = await obtenirSoldeCp(profile.salarie_id, { force });
  return NextResponse.json(solde ?? {});
}
