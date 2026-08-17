import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getApiProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { journaliser } from "@/lib/audit";
import { destinatairesCabinet, notifier } from "@/lib/notify";
import { estMotifSortie, labelMotifSortie, texteNoteSortie } from "@/lib/sortie";
import {
  contentTypePourExtension,
  extensionFichier,
  uploaderFichier,
} from "@/lib/storage";
import { formatDate } from "@/lib/format";

export const runtime = "nodejs";

/**
 * Injecte la mention SORTIE dans la note de saisie de la campagne
 * du mois de sortie (si elle existe encore).
 */
async function injecterNoteSortieSaisie(opts: {
  admin: ReturnType<typeof createAdminClient>;
  salarieId: string;
  dossierId: string;
  dateSortie: string;
  motif: string;
}) {
  const mois = `${opts.dateSortie.slice(0, 7)}-01`;
  const texte = texteNoteSortie({
    date_sortie: opts.dateSortie,
    motif_sortie: opts.motif,
  });
  if (!texte) return;

  const { data: campagne } = await opts.admin
    .from("campagnes")
    .select("id, statut")
    .eq("dossier_id", opts.dossierId)
    .eq("mois", mois)
    .maybeSingle();

  if (!campagne) return;
  // Campagne déjà envoyée : le prochain export Excel / PDF recalculera quand même la note

  const { data: saisie } = await opts.admin
    .from("saisies_variables")
    .select("id, note, mode")
    .eq("campagne_id", campagne.id)
    .eq("salarie_id", opts.salarieId)
    .maybeSingle();

  if (!saisie) {
    if (campagne.statut !== "ouverte") return;
    await opts.admin.from("saisies_variables").insert({
      campagne_id: campagne.id,
      salarie_id: opts.salarieId,
      dossier_id: opts.dossierId,
      mode: "ras",
      note: texte,
    });
    return;
  }

  const noteActuelle = (saisie.note ?? "").trim();
  if (/(^|\n)\s*SORTIE\s*:/i.test(noteActuelle)) return;
  const note = noteActuelle ? `${texte}\n${noteActuelle}` : texte;
  await opts.admin
    .from("saisies_variables")
    .update({ note, updated_at: new Date().toISOString() })
    .eq("id", saisie.id);
}

/**
 * Sortie d'un salarié (cabinet ou client) :
 * - date + motif obligatoires
 * - documents de fin de contrat : obligatoires côté cabinet, optionnels côté client
 * Le salarié reste visible sur son mois de sortie puis passe en archive.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getApiProfile([
    "admin_cabinet",
    "collaborateur",
    "client",
  ]);
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }
  const { id } = await params;
  const estClient = profile.role === "client";

  const supabase = await createClient();
  const { data: salarie } = await supabase
    .from("salaries")
    .select("id, dossier_id, nom, prenom, statut")
    .eq("id", id)
    .maybeSingle();
  if (!salarie) {
    return NextResponse.json({ error: "Salarié inaccessible" }, { status: 403 });
  }
  if (estClient && salarie.dossier_id !== profile.dossier_id) {
    return NextResponse.json({ error: "Salarié inaccessible" }, { status: 403 });
  }
  if (salarie.statut === "sorti") {
    return NextResponse.json(
      { error: "Ce salarié est déjà sorti." },
      { status: 400 }
    );
  }

  const form = await request.formData();
  const dateSortie = form.get("date_sortie") as string | null;
  const motif = (form.get("motif_sortie") as string | null)?.trim() ?? "";
  const fichiers = form.getAll("documents").filter((f): f is File => f instanceof File && f.size > 0);

  if (!dateSortie || !/^\d{4}-\d{2}-\d{2}$/.test(dateSortie)) {
    return NextResponse.json({ error: "Date de sortie invalide" }, { status: 400 });
  }
  if (!estMotifSortie(motif)) {
    return NextResponse.json(
      { error: "Choisissez le motif de sortie." },
      { status: 400 }
    );
  }
  if (!estClient && fichiers.length === 0) {
    return NextResponse.json(
      { error: "Déposez au moins un document de fin de contrat." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  for (const fichier of fichiers) {
    const ext = extensionFichier(fichier.name);
    const chemin = `dossiers/${salarie.dossier_id}/salaries/${id}/fin-contrat-${randomUUID()}.${ext}`;
    await uploaderFichier(
      "documents",
      chemin,
      Buffer.from(await fichier.arrayBuffer()),
      contentTypePourExtension(ext)
    );
    await admin.from("salarie_documents").insert({
      salarie_id: id,
      dossier_id: salarie.dossier_id,
      type_document: "fin_contrat",
      chemin,
      nom_fichier: fichier.name,
      sensible: false,
      uploaded_by: profile.id,
    });
  }

  await admin
    .from("salaries")
    .update({
      statut: "sorti",
      date_sortie: dateSortie,
      motif_sortie: motif,
    })
    .eq("id", id);

  await injecterNoteSortieSaisie({
    admin,
    salarieId: id,
    dossierId: salarie.dossier_id,
    dateSortie,
    motif,
  });

  await journaliser({
    userId: profile.id,
    action: "sortie_salarie",
    cibleType: "salarie",
    cibleId: id,
    dossierId: salarie.dossier_id,
    details: {
      date_sortie: dateSortie,
      motif_sortie: motif,
      documents: fichiers.length,
      par: profile.role,
    },
  });

  if (estClient) {
    const cabinet = await destinatairesCabinet(salarie.dossier_id);
    await notifier({
      userIds: cabinet,
      titre: `Sortie déclarée : ${salarie.nom} ${salarie.prenom}`,
      corps: `Le client a déclaré une sortie (${labelMotifSortie(motif)}) au ${formatDate(dateSortie)}.`,
      lien: `/cabinet/salaries/${id}`,
    });
  }

  return NextResponse.json({ ok: true });
}
