import { createAdminClient } from "@/lib/supabase/admin";
import { telechargerFichier } from "@/lib/storage";
import { extraireSoldeCp, extraireTextesPages } from "@/lib/pdf-bulletins";
import type { SoldeCp } from "@/lib/types";

/**
 * Lit le solde CP en base. Ne re-télécharge / re-parse le PDF que si :
 * - `force` est true, ou
 * - aucun solde, ou
 * - le solde ne correspond pas au mois du dernier bulletin.
 */
export async function obtenirSoldeCp(
  salarieId: string,
  opts?: { force?: boolean }
): Promise<SoldeCp | null> {
  const admin = createAdminClient();

  const [{ data: bulletin }, { data: existant }] = await Promise.all([
    admin
      .from("bulletins")
      .select("id, chemin, mois, dossier_id")
      .eq("salarie_id", salarieId)
      .order("mois", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from("soldes_cp").select("*").eq("salarie_id", salarieId).maybeSingle(),
  ]);

  const solde = (existant as SoldeCp) ?? null;

  if (!opts?.force && solde && bulletin?.mois && solde.mois_reference === bulletin.mois) {
    return solde;
  }
  if (!opts?.force && solde && !bulletin) {
    return solde;
  }
  if (!bulletin?.chemin) {
    return solde;
  }

  return synchroniserSoldeDepuisDernierBulletin(salarieId);
}

/**
 * Recalcule le solde CP à partir du PDF du dernier bulletin publié.
 * Source de vérité = fiche de paie (Silae / Cegid…).
 * Préférer `obtenirSoldeCp` pour les lectures de page.
 */
export async function synchroniserSoldeDepuisDernierBulletin(
  salarieId: string
): Promise<SoldeCp | null> {
  const admin = createAdminClient();

  const { data: bulletin } = await admin
    .from("bulletins")
    .select("id, chemin, mois, dossier_id")
    .eq("salarie_id", salarieId)
    .order("mois", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!bulletin?.chemin) {
    const { data: existant } = await admin
      .from("soldes_cp")
      .select("*")
      .eq("salarie_id", salarieId)
      .maybeSingle();
    return (existant as SoldeCp) ?? null;
  }

  let pdf: Buffer;
  try {
    pdf = await telechargerFichier("bulletins", bulletin.chemin);
  } catch (e) {
    console.error("[solde-cp] PDF bulletin introuvable:", bulletin.chemin, e);
    const { data: existant } = await admin
      .from("soldes_cp")
      .select("*")
      .eq("salarie_id", salarieId)
      .maybeSingle();
    return (existant as SoldeCp) ?? null;
  }

  const textes = await extraireTextesPages(pdf);
  const cp = extraireSoldeCp(textes.join("\n"));
  if (
    cp.acquis === null &&
    cp.pris === null &&
    cp.restant === null &&
    cp.acquis_n1 === null
  ) {
    const { data: existant } = await admin
      .from("soldes_cp")
      .select("*")
      .eq("salarie_id", salarieId)
      .maybeSingle();
    return (existant as SoldeCp) ?? null;
  }

  const row = {
    salarie_id: salarieId,
    dossier_id: bulletin.dossier_id,
    acquis: cp.acquis,
    pris: cp.pris,
    restant: cp.restant,
    acquis_n1: cp.acquis_n1,
    acquis_n: cp.acquis_n,
    pris_n1: cp.pris_n1,
    pris_n: cp.pris_n,
    source: "extraction" as const,
    mois_reference: bulletin.mois,
    updated_at: new Date().toISOString(),
  };

  const { data: upserted, error } = await admin
    .from("soldes_cp")
    .upsert(row)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[solde-cp] upsert:", error.message);
    return null;
  }
  return (upserted as SoldeCp) ?? null;
}
