import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getApiProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { calculerDashboard } from "@/lib/dashboard";
import { moisFichier, moisLabel } from "@/lib/format";

export const runtime = "nodejs";

/** Export Excel du tableau de bord mensuel (cabinet). */
export async function GET(request: Request) {
  const profile = await getApiProfile(["admin_cabinet", "collaborateur"]);
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const mois = searchParams.get("mois") ?? "";
  const collaborateurId = searchParams.get("collaborateur") ?? undefined;
  if (!/^\d{4}-\d{2}-01$/.test(mois)) {
    return NextResponse.json({ error: "Mois invalide" }, { status: 400 });
  }

  const { getCabinetActif } = await import("@/lib/cabinet");
  const cabinet = await getCabinetActif();
  if (!cabinet) {
    return NextResponse.json({ error: "Aucun cabinet actif" }, { status: 400 });
  }

  const supabase = await createClient();
  const { lignes, totaux } = await calculerDashboard(
    supabase,
    mois,
    collaborateurId || undefined,
    cabinet.id
  );

  const workbook = new ExcelJS.Workbook();
  const feuille = workbook.addWorksheet(moisFichier(mois));

  feuille.addRow([`Tableau de bord : ${moisLabel(mois)}`]);
  feuille.addRow([]);
  feuille.addRow([
    "",
    "Demandées",
    "Reçues",
    "Envoyées",
    "% reçues",
    "% envoyées",
  ]);
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) + "%" : "-");
  feuille.addRow([
    "Dossiers",
    totaux.dossiers.demandes,
    totaux.dossiers.recus,
    totaux.dossiers.envoyes,
    pct(totaux.dossiers.recus, totaux.dossiers.demandes),
    pct(totaux.dossiers.envoyes, totaux.dossiers.demandes),
  ]);
  feuille.addRow([
    "Paies",
    totaux.paies.demandees,
    totaux.paies.recues,
    totaux.paies.envoyees,
    pct(totaux.paies.recues, totaux.paies.demandees),
    pct(totaux.paies.envoyees, totaux.paies.demandees),
  ]);
  feuille.addRow([]);

  const entete = feuille.addRow([
    "Sigle",
    "Raison sociale",
    "Collaborateur",
    "Variables demandées",
    "Variables reçues",
    "Paies attendues",
    "Bulletins envoyés",
    "En retard",
  ]);
  entete.font = { bold: true };

  for (const l of lignes) {
    feuille.addRow([
      l.dossier.sigle,
      l.dossier.raison_sociale,
      l.collaborateurNom,
      l.demande ? "Oui" : "Non",
      l.recu ? "Oui" : "Non",
      l.paiesAttendues,
      l.paiesEnvoyees,
      l.enRetard ? "OUI" : "",
    ]);
  }
  feuille.columns.forEach((c) => (c.width = 18));

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Disposition": `attachment; filename="tableau-de-bord-${moisFichier(mois)}.xlsx"`,
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}
