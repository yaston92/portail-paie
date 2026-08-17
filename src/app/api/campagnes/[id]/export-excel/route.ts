import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getApiProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  etatCampagne,
  formaterDetailJoursAbsences,
  totauxAbsences,
} from "@/lib/campagne";
import { journaliser } from "@/lib/audit";
import { moisFichier, moisLabel } from "@/lib/format";
import { composerNoteAvecSortie } from "@/lib/sortie";
import { NATURE_LABELS, type Absence, type AbsenceNature, type Campagne } from "@/lib/types";

export const runtime = "nodejs";

const NATURES: AbsenceNature[] = ["cp", "maladie", "injustifiee", "rtt", "autre"];

/**
 * Export Excel des variables d'une campagne, pour intégration dans le
 * logiciel de paie (cabinet uniquement).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getApiProfile(["admin_cabinet", "collaborateur"]);
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }
  const { id } = await params;

  // RLS : la campagne n'est visible que si le dossier est accessible
  const supabase = await createClient();
  const { data } = await supabase
    .from("campagnes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!data) {
    return NextResponse.json({ error: "Campagne inaccessible" }, { status: 403 });
  }
  const campagne = data as Campagne;

  const admin = createAdminClient();
  const [etat, { data: dossier }] = await Promise.all([
    etatCampagne(admin, id, campagne.dossier_id, campagne.mois),
    admin
      .from("dossiers")
      .select("sigle, raison_sociale")
      .eq("id", campagne.dossier_id)
      .single(),
  ]);

  const saisieIds = [...etat.saisiesParSalarie.values()].map((s) => s.id);
  const { data: absences } = saisieIds.length
    ? await admin.from("absences").select("*").in("saisie_id", saisieIds)
    : { data: [] };
  const absencesParSaisie = new Map<string, Absence[]>();
  for (const a of (absences ?? []) as Absence[]) {
    const liste = absencesParSaisie.get(a.saisie_id) ?? [];
    liste.push(a);
    absencesParSaisie.set(a.saisie_id, liste);
  }

  const workbook = new ExcelJS.Workbook();
  const feuille = workbook.addWorksheet(moisFichier(campagne.mois));

  feuille.addRow([`Variables de paie : ${dossier?.sigle} : ${moisLabel(campagne.mois)}`]);
  const nbCp = [...absencesParSaisie.values()]
    .flat()
    .filter((a) => a.nature === "cp").length;
  feuille.addRow([
    campagne.statut === "cloturee_identique"
      ? nbCp > 0
        ? `Paies identiques au mois précédent : ${nbCp} jour(s) de CP validés à prendre en compte`
        : "Paies identiques au mois précédent"
      : `Statut : ${
          campagne.statut === "bulletins_envoyes"
            ? "publié"
            : campagne.statut === "envoyee"
              ? "envoyée"
              : "en cours"
        }`,
  ]);
  feuille.addRow([]);

  const entetes = [
    "Matricule",
    "Nom",
    "Prénom",
    "Saisie",
    "Net à verser (€)",
    "Heures supp.",
    ...NATURES.flatMap((n) => [`${NATURE_LABELS[n]} (jours)`, `${NATURE_LABELS[n]} (heures)`]),
    "Détail des jours",
    "Note",
  ];
  const ligneEntete = feuille.addRow(entetes);
  ligneEntete.font = { bold: true };

  for (const salarie of etat.attendus) {
    const saisie = etat.saisiesParSalarie.get(salarie.id);
    const absencesSaisie = saisie ? (absencesParSaisie.get(saisie.id) ?? []) : [];
    const totaux = totauxAbsences(absencesSaisie);
    const modeLabel =
      saisie?.mode === "net"
        ? "Rémunération nette directe"
        : saisie?.mode === "variables"
          ? "Variables"
          : saisie?.mode === "ras"
            ? "Rien à signaler"
            : "Non saisi";

    feuille.addRow([
      salarie.matricule ?? "",
      salarie.nom,
      salarie.prenom,
      modeLabel,
      saisie?.mode === "net" ? Number(saisie.net_montant) : "",
      saisie?.heures_supp ? Number(saisie.heures_supp) : "",
      ...NATURES.flatMap((n) => {
        const t = totaux.get(n);
        return [t?.jours ?? "", t?.heures ?? ""];
      }),
      formaterDetailJoursAbsences(absencesSaisie),
      composerNoteAvecSortie(saisie?.note, salarie),
    ]);
  }

  feuille.columns.forEach((col, index) => {
    // Colonne « Détail des jours » plus large pour la lisibilité
    col.width = index === entetes.length - 2 ? 48 : 16;
  });

  const buffer = await workbook.xlsx.writeBuffer();

  await journaliser({
    userId: profile.id,
    action: "export_excel_variables",
    cibleType: "campagne",
    cibleId: id,
    dossierId: campagne.dossier_id,
  });

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Disposition": `attachment; filename="variables-${dossier?.sigle}-${moisFichier(campagne.mois)}.xlsx"`,
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}
