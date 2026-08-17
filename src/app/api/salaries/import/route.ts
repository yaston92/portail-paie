import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getApiProfile, cabinetPeutAccederDossier } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { chiffrer } from "@/lib/crypto";
import { journaliser } from "@/lib/audit";
import { nirValide } from "@/lib/format";

export const runtime = "nodejs";

/**
 * Import Excel d'initialisation des salariés d'un dossier.
 * Colonnes attendues (ligne 1 = en-têtes) :
 * Matricule | Nom | Prénom | Email | NIR | Date d'entrée | Contrat (CDI/CDD) | Durée hebdo | Poste
 */
export async function POST(request: Request) {
  const profile = await getApiProfile(["admin_cabinet", "collaborateur"]);
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const form = await request.formData();
  const dossierId = form.get("dossier_id") as string | null;
  const fichier = form.get("fichier") as File | null;
  if (!dossierId || !fichier) {
    return NextResponse.json({ error: "Fichier ou dossier manquant" }, { status: 400 });
  }
  if (!(await cabinetPeutAccederDossier(dossierId))) {
    return NextResponse.json({ error: "Dossier inaccessible" }, { status: 403 });
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(await fichier.arrayBuffer());
  } catch {
    return NextResponse.json(
      { error: "Fichier illisible : format .xlsx attendu." },
      { status: 400 }
    );
  }

  const feuille = workbook.worksheets[0];
  if (!feuille) {
    return NextResponse.json({ error: "Classeur vide." }, { status: 400 });
  }

  const admin = createAdminClient();
  let importes = 0;
  const erreurs: string[] = [];

  function celluleTexte(row: ExcelJS.Row, index: number): string {
    const val = row.getCell(index).value;
    if (val === null || val === undefined) return "";
    if (val instanceof Date) return val.toISOString().slice(0, 10);
    if (typeof val === "object" && "text" in val) return String(val.text).trim();
    return String(val).trim();
  }

  for (let i = 2; i <= feuille.rowCount; i++) {
    const row = feuille.getRow(i);
    const nom = celluleTexte(row, 2);
    const prenom = celluleTexte(row, 3);
    if (!nom && !prenom) continue; // ligne vide

    if (!nom || !prenom) {
      erreurs.push(`Ligne ${i} : nom ou prénom manquant.`);
      continue;
    }
    const nir = celluleTexte(row, 5).replace(/[\s.]/g, "");
    if (nir && !nirValide(nir)) {
      erreurs.push(`Ligne ${i} (${nom} ${prenom}) : NIR invalide.`);
      continue;
    }
    const contratBrut = celluleTexte(row, 7).toLowerCase();
    const contrat =
      contratBrut === "cdi" ? "cdi" : contratBrut === "cdd" ? "cdd" : null;
    const dureeHebdo = parseFloat(celluleTexte(row, 8).replace(",", "."));
    const dateEntree = celluleTexte(row, 6);

    const { data: salarie, error } = await admin
      .from("salaries")
      .insert({
        dossier_id: dossierId,
        matricule: celluleTexte(row, 1) || null,
        nom: nom.toUpperCase(),
        prenom,
        email: celluleTexte(row, 4) || null,
        date_entree: /^\d{4}-\d{2}-\d{2}$/.test(dateEntree) ? dateEntree : null,
        type_contrat: contrat,
        duree_hebdo: Number.isFinite(dureeHebdo) ? dureeHebdo : null,
        poste: celluleTexte(row, 9) || null,
      })
      .select("id")
      .single();

    if (error || !salarie) {
      erreurs.push(`Ligne ${i} (${nom} ${prenom}) : ${error?.message ?? "échec"}`);
      continue;
    }
    if (nir) {
      await admin.from("salaries_sensibles").insert({
        salarie_id: salarie.id,
        nir_chiffre: chiffrer(nir),
      });
    }
    importes++;
  }

  await journaliser({
    userId: profile.id,
    action: "import_excel_salaries",
    cibleType: "dossier",
    cibleId: dossierId,
    dossierId,
    details: { importes, erreurs: erreurs.length },
  });

  return NextResponse.json({ ok: true, importes, erreurs });
}
