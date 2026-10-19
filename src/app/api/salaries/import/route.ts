import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getApiProfile, cabinetPeutAccederDossier } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { chiffrer } from "@/lib/crypto";
import { journaliser } from "@/lib/audit";
import { nirCanonique } from "@/lib/format";
import { refuserSansDroit } from "@/lib/droits-serveur";
import { estContrat } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Import Excel d'initialisation des salariés d'un dossier.
 * Colonnes attendues (ligne 1 = en-têtes) :
 * Matricule | Nom | Prénom | Email | NIR | Date d'entrée | Contrat (CDI/CDD/apprentissage) | Durée hebdo | Poste
 */
export async function POST(request: Request) {
  const profile = await getApiProfile(["admin_cabinet", "collaborateur"]);
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }
  const refus = await refuserSansDroit(profile, "salaries");
  if (refus) return refus;

  const form = await request.formData();
  const dossierId = form.get("dossier_id") as string | null;
  const fichier = form.get("fichier") as File | null;
  if (!dossierId || !fichier) {
    return NextResponse.json({ error: "Fichier ou dossier manquant" }, { status: 400 });
  }
  if (!(await cabinetPeutAccederDossier(dossierId))) {
    return NextResponse.json({ error: "Dossier inaccessible" }, { status: 403 });
  }
  if (fichier.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: "Fichier trop volumineux (8 Mo maximum)." }, { status: 400 });
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

  function valeurTexte(val: ExcelJS.CellValue): string {
    if (val === null || val === undefined) return "";
    if (val instanceof Date) return val.toISOString().slice(0, 10);
    if (typeof val === "number") {
      if (!Number.isFinite(val)) return "";
      if (Math.abs(val) >= 1e10) return Math.round(val).toFixed(0);
      return Number.isInteger(val) ? String(val) : String(val);
    }
    if (typeof val === "object") {
      if ("richText" in val && Array.isArray(val.richText)) {
        return val.richText.map((part) => part.text ?? "").join("").trim();
      }
      if ("result" in val && val.result !== undefined && val.result !== null) {
        return valeurTexte(val.result as ExcelJS.CellValue);
      }
      if ("text" in val && val.text != null) return String(val.text).trim();
    }
    const texte = String(val).trim();
    return texte === "[object Object]" ? "" : texte;
  }

  function celluleTexte(row: ExcelJS.Row, index: number): string {
    const cell = row.getCell(index);
    const depuisValeur = valeurTexte(cell.value);
    const affiche = (cell.text ?? "").trim();
    if (!depuisValeur) return affiche;
    if (/E\+?[0-9]+$/i.test(affiche) && /[0-9]/.test(depuisValeur)) return depuisValeur;
    if (affiche && nirCanonique(affiche) && !nirCanonique(depuisValeur)) return affiche;
    return depuisValeur;
  }

  function normEntete(valeur: string): string {
    return valeur
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  const entetes = feuille.getRow(1);
  const titres: string[] = [];
  for (let c = 1; c <= Math.max(entetes.cellCount, 12); c++) {
    titres.push(normEntete(celluleTexte(entetes, c)));
  }

  function trouverColonne(alias: string[], defaut: number): number {
    for (let i = 0; i < titres.length; i++) {
      const h = titres[i];
      if (!h) continue;
      if (alias.some((a) => (a.length < 8 ? h === a : h === a || h.includes(a)))) {
        return i + 1;
      }
    }
    return defaut;
  }

  const aUnEntete = titres.some((h) => h === "nom" || h.startsWith("nom ") || h.includes("securite") || h === "nir");
  const col = aUnEntete
    ? {
        matricule: trouverColonne(["matricule"], 1),
        nom: trouverColonne(["nom de famille", "nom"], 2),
        prenom: trouverColonne(["prenom"], 3),
        email: trouverColonne(["email", "e mail", "mail", "courriel"], 4),
        nir: trouverColonne(
          [
            "nir",
            "nss",
            "n ss",
            "numero ss",
            "numero de ss",
            "securite sociale",
            "numero de securite",
            "n securite",
            "insee",
            "secu",
            "no ss",
            "num ss",
          ],
          5
        ),
        date: trouverColonne(["date d entree", "date entree", "entree"], 6),
        contrat: trouverColonne(["type de contrat", "contrat"], 7),
        duree: trouverColonne(["duree hebdo", "duree", "horaire"], 8),
        poste: trouverColonne(["poste", "emploi", "fonction"], 9),
      }
    : { matricule: 1, nom: 2, prenom: 3, email: 4, nir: 5, date: 6, contrat: 7, duree: 8, poste: 9 };

  for (let i = 2; i <= feuille.rowCount; i++) {
    const row = feuille.getRow(i);
    const nom = celluleTexte(row, col.nom);
    const prenom = celluleTexte(row, col.prenom);
    if (!nom && !prenom) continue;

    if (!nom || !prenom) {
      erreurs.push(`Ligne ${i} : nom ou prénom manquant.`);
      continue;
    }
    const nirBrut = celluleTexte(row, col.nir);
    const nir = nirBrut ? nirCanonique(nirBrut) : "";
    if (nirBrut && !nir) {
      erreurs.push(`Ligne ${i} (${nom} ${prenom}) : numéro de sécurité sociale non reconnu.`);
      continue;
    }
    const contratBrut = celluleTexte(row, col.contrat)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const contrat = estContrat(contratBrut)
      ? contratBrut
      : contratBrut.includes("apprentissage")
        ? "apprentissage"
        : null;
    const dureeHebdo = parseFloat(celluleTexte(row, col.duree).replace(",", "."));
    const dateEntree = celluleTexte(row, col.date);

    const { data: salarie, error } = await admin
      .from("salaries")
      .insert({
        dossier_id: dossierId,
        matricule: celluleTexte(row, col.matricule) || null,
        nom: nom.toUpperCase(),
        prenom,
        email: celluleTexte(row, col.email) || null,
        date_entree: /^\d{4}-\d{2}-\d{2}$/.test(dateEntree) ? dateEntree : null,
        type_contrat: contrat,
        duree_hebdo: Number.isFinite(dureeHebdo) ? dureeHebdo : null,
        poste: celluleTexte(row, col.poste) || null,
      })
      .select("id")
      .single();

    if (error || !salarie) {
      erreurs.push(`Ligne ${i} (${nom} ${prenom}) : ${error?.message ?? "échec"}`);
      continue;
    }
    if (nir) {
      const { error: nirError } = await admin.from("salaries_sensibles").insert({
        salarie_id: salarie.id,
        nir_chiffre: chiffrer(nir),
      });
      if (nirError) {
        erreurs.push(`Ligne ${i} (${nom} ${prenom}) : numéro de sécurité sociale non enregistré.`);
      }
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
