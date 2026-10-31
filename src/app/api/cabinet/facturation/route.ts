import { NextResponse } from "next/server";
import { getApiCabinetProfile } from "@/lib/auth";
import { getCabinetActif } from "@/lib/cabinet";
import { journaliser } from "@/lib/audit";
import {
  calculerFacturation,
  facturationVersCsv,
  type LigneFacturation,
} from "@/lib/facturation";
import { createAdminClient } from "@/lib/supabase/admin";

function moisValide(mois: string | null): mois is string {
  return !!mois && /^\d{4}-\d{2}-01$/.test(mois);
}

/** Télécharge le CSV déjà figé pour ce mois. */
export async function GET(request: Request) {
  const profile = await getApiCabinetProfile();
  if (!profile) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const cabinet = await getCabinetActif();
  if (!cabinet) return NextResponse.json({ error: "Aucun cabinet" }, { status: 400 });

  const mois = new URL(request.url).searchParams.get("mois");
  if (!moisValide(mois)) {
    return NextResponse.json({ error: "Mois invalide" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("facturation_mois")
    .select("lignes, genere_at")
    .eq("cabinet_id", cabinet.id)
    .eq("mois", mois)
    .maybeSingle();
  if (!data) {
    return NextResponse.json({ error: "Pas encore généré pour ce mois." }, { status: 404 });
  }

  const csv = facturationVersCsv((data.lignes ?? []) as LigneFacturation[]);
  const nom = `facturation-${mois.slice(0, 7)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nom}"`,
    },
  });
}

/** Fige le CSV du mois. Un second appel ne recalcule pas. */
export async function POST(request: Request) {
  const profile = await getApiCabinetProfile();
  if (!profile) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (profile.role === "collaborateur") {
    return NextResponse.json({ error: "Réservé au directeur." }, { status: 403 });
  }
  const cabinet = await getCabinetActif();
  if (!cabinet) return NextResponse.json({ error: "Aucun cabinet" }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as { mois?: string };
  if (!moisValide(body.mois ?? null)) {
    return NextResponse.json({ error: "Mois invalide" }, { status: 400 });
  }
  const mois = body.mois!;
  const admin = createAdminClient();
  const { data: existant } = await admin
    .from("facturation_mois")
    .select("id, genere_at")
    .eq("cabinet_id", cabinet.id)
    .eq("mois", mois)
    .maybeSingle();
  if (existant) {
    return NextResponse.json({
      ok: true,
      fige: true,
      genere_at: existant.genere_at,
    });
  }

  const lignes = await calculerFacturation(cabinet.id, mois);
  const { error } = await admin.from("facturation_mois").insert({
    cabinet_id: cabinet.id,
    mois,
    lignes,
    genere_par: profile.id,
  });
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ ok: true, fige: true });
    }
    return NextResponse.json(
      { error: "Export impossible. Exécutez la migration 0023 dans l'éditeur SQL." },
      { status: 500 }
    );
  }

  await journaliser({
    userId: profile.id,
    action: "facturation_mois",
    details: { mois, clients: lignes.length },
  });

  return NextResponse.json({ ok: true, fige: false });
}
