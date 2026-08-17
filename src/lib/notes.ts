import type { SupabaseClient } from "@supabase/supabase-js";
import type { NoteAffichee } from "@/components/notes-thread";
import type { Note, Profile } from "@/lib/types";

/** Charge un fil de notes avec le nom des auteurs (via RLS de l'appelant). */
export async function chargerNotes(
  supabase: SupabaseClient,
  filtres: { dossierId: string; campagneId?: string | null; salarieId?: string | null }
): Promise<NoteAffichee[]> {
  let query = supabase
    .from("notes")
    .select("*")
    .eq("dossier_id", filtres.dossierId)
    .order("created_at");
  if (filtres.campagneId !== undefined) {
    query = filtres.campagneId
      ? query.eq("campagne_id", filtres.campagneId)
      : query.is("campagne_id", null);
  }
  if (filtres.salarieId !== undefined) {
    query = filtres.salarieId
      ? query.eq("salarie_id", filtres.salarieId)
      : query.is("salarie_id", null);
  }
  const { data: notes } = await query;
  if (!notes || notes.length === 0) return [];

  const auteurIds = [...new Set((notes as Note[]).map((n) => n.auteur_id))];
  const { data: auteurs } = await supabase
    .from("profiles")
    .select("id, nom, prenom, role")
    .in("id", auteurIds);
  const parId = new Map(
    ((auteurs ?? []) as Profile[]).map((a) => [
      a.id,
      { nom: `${a.prenom} ${a.nom}`.trim(), estCabinet: a.role !== "client" && a.role !== "salarie" },
    ])
  );

  return (notes as Note[]).map((n) => ({
    id: n.id,
    contenu: n.contenu,
    piece_nom: n.piece_nom,
    created_at: n.created_at,
    auteur: parId.get(n.auteur_id)?.nom ?? "Utilisateur",
    estCabinet: parId.get(n.auteur_id)?.estCabinet ?? false,
  }));
}
