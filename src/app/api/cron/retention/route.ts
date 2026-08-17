import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { supprimerFichiers } from "@/lib/storage";
import { journaliser } from "@/lib/audit";

/**
 * Purge RGPD (cron quotidien) : supprime les documents dont la durée de
 * conservation paramétrée est dépassée (pièces d'identité, cartes vitales,
 * documents de fin de contrat, pièces jointes de notes).
 * Les bulletins relèvent de l'archivage longue durée et ne sont pas purgés ici.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: reglages } = await admin.from("retention_settings").select("*");

  const dureeParType = new Map<string, number>();
  for (const r of reglages ?? []) {
    dureeParType.set(r.type_document, r.duree_mois);
  }

  let supprimes = 0;

  // Documents salariés (mappage type de document → règle de rétention)
  const mappage: Record<string, string> = {
    piece_identite_recto: "piece_identite",
    piece_identite_verso: "piece_identite",
    carte_vitale: "carte_vitale",
    fin_contrat: "fin_contrat",
  };

  const { data: documents } = await admin.from("salarie_documents").select("*");
  for (const doc of documents ?? []) {
    const regle = mappage[doc.type_document];
    if (!regle) continue;
    const dureeMois = dureeParType.get(regle);
    if (!dureeMois) continue;
    const limite = new Date(doc.created_at);
    limite.setMonth(limite.getMonth() + dureeMois);
    if (limite > new Date()) continue;

    await supprimerFichiers("documents", [doc.chemin]);
    await admin.from("salarie_documents").delete().eq("id", doc.id);
    supprimes++;
  }

  // Pièces jointes de notes
  const dureeNotes = dureeParType.get("note_piece");
  if (dureeNotes) {
    const limite = new Date();
    limite.setMonth(limite.getMonth() - dureeNotes);
    const { data: notes } = await admin
      .from("notes")
      .select("id, piece_chemin")
      .not("piece_chemin", "is", null)
      .lt("created_at", limite.toISOString());
    for (const note of notes ?? []) {
      await supprimerFichiers("documents", [note.piece_chemin!]);
      await admin
        .from("notes")
        .update({ piece_chemin: null, piece_nom: null })
        .eq("id", note.id);
      supprimes++;
    }
  }

  if (supprimes > 0) {
    await journaliser({
      userId: null,
      action: "purge_retention",
      details: { supprimes },
    });
  }

  return NextResponse.json({ ok: true, supprimes });
}
