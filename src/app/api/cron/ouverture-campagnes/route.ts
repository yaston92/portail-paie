import { NextResponse } from "next/server";
import { aujourdhuiParis } from "@/lib/demandes-conge";
import {
  dateLimiteRetourCampagne,
  ouvrirCampagnesManquantes,
} from "@/lib/ouvrir-campagnes";

/**
 * Ouverture automatique des campagnes (cron quotidien).
 * À partir du 25 du mois (fuseau Europe/Paris), ouvre la campagne du mois
 * courant pour tous les dossiers actifs qui n'en ont pas encore
 * (date limite : le 15 du mois suivant).
 * L'ouverture manuelle avant le 25 reste possible via /api/campagnes/ouvrir.
 * Un passage après le 25 rattrape les dossiers manquants (idempotent).
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const today = aujourdhuiParis();
  const jour = Number(today.slice(8, 10));
  if (jour < 25) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "avant_le_25",
      jour,
    });
  }

  const mois = `${today.slice(0, 7)}-01`;
  const dateLimite = dateLimiteRetourCampagne(mois);

  try {
    const resultat = await ouvrirCampagnesManquantes({
      mois,
      dateLimite,
      userId: null,
      action: "ouverture_campagnes_auto",
    });
    return NextResponse.json({
      ok: true,
      mois,
      date_limite: dateLimite,
      ...resultat,
    });
  } catch (e) {
    console.error("cron/ouverture-campagnes", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Échec" },
      { status: 500 }
    );
  }
}
