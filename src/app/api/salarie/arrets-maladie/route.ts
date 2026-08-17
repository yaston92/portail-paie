import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getApiProfile } from "@/lib/auth";
import { journaliser } from "@/lib/audit";
import {
  synchroniserAbsencesMaladie,
} from "@/lib/arrets-maladie";
import { joursOuvres } from "@/lib/demandes-conge";
import { formatDate } from "@/lib/format";
import { destinatairesCabinet, destinatairesClient, notifier } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  contentTypePourExtension,
  extensionFichier,
  uploaderFichier,
} from "@/lib/storage";
import type { ArretMaladie } from "@/lib/types";

export const runtime = "nodejs";

const EXTS_OK = new Set(["pdf", "jpg", "jpeg", "png"]);

/** Liste des arrêts maladie du salarié connecté. */
export async function GET() {
  const profile = await getApiProfile(["salarie"]);
  if (!profile?.salarie_id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("arrets_maladie")
    .select("*")
    .eq("salarie_id", profile.salarie_id)
    .order("created_at", { ascending: false })
    .limit(50);
  return NextResponse.json((data ?? []) as ArretMaladie[]);
}

/** Déclaration d'un arrêt maladie par le salarié (justificatif obligatoire). */
export async function POST(request: Request) {
  const profile = await getApiProfile(["salarie"]);
  if (!profile?.salarie_id || !profile.dossier_id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const form = await request.formData();
  const dateDebut = form.get("date_debut") as string | null;
  const dateFin = form.get("date_fin") as string | null;
  const fichier = form.get("justificatif") as File | null;

  if (!dateDebut || !/^\d{4}-\d{2}-\d{2}$/.test(dateDebut)) {
    return NextResponse.json({ error: "Date de début invalide" }, { status: 400 });
  }
  if (!dateFin || !/^\d{4}-\d{2}-\d{2}$/.test(dateFin)) {
    return NextResponse.json({ error: "Date de fin invalide" }, { status: 400 });
  }
  if (dateFin < dateDebut) {
    return NextResponse.json(
      { error: "La date de fin doit être après la date de début." },
      { status: 400 }
    );
  }
  if (!fichier || !(fichier instanceof File) || fichier.size === 0) {
    return NextResponse.json(
      { error: "Déposez le justificatif d'arrêt (PDF, JPG ou PNG)." },
      { status: 400 }
    );
  }

  const ext = extensionFichier(fichier.name).toLowerCase();
  if (!EXTS_OK.has(ext)) {
    return NextResponse.json(
      { error: "Format accepté : PDF, JPG ou PNG." },
      { status: 400 }
    );
  }

  const jours = joursOuvres(dateDebut, dateFin);
  if (jours.length === 0) {
    return NextResponse.json(
      { error: "Aucune journée ouvrée dans cette période." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const chemin = `dossiers/${profile.dossier_id}/salaries/${profile.salarie_id}/arret-maladie-${randomUUID()}.${ext}`;
  await uploaderFichier(
    "documents",
    chemin,
    Buffer.from(await fichier.arrayBuffer()),
    contentTypePourExtension(ext)
  );

  const pending = await synchroniserAbsencesMaladie({
    salarieId: profile.salarie_id,
    dossierId: profile.dossier_id,
    jours,
  });

  const { data: arret, error } = await admin
    .from("arrets_maladie")
    .insert({
      salarie_id: profile.salarie_id,
      dossier_id: profile.dossier_id,
      declarant_id: profile.id,
      date_debut: dateDebut,
      date_fin: dateFin,
      jours: jours.length,
      justificatif_chemin: chemin,
      justificatif_nom: fichier.name,
      pending_sync: pending,
    })
    .select("*")
    .single();

  if (error || !arret) {
    return NextResponse.json(
      { error: error?.message ?? "Échec de l'enregistrement." },
      { status: 500 }
    );
  }

  await journaliser({
    userId: profile.id,
    action: "arret_maladie_salarie",
    cibleType: "arret_maladie",
    cibleId: arret.id,
    dossierId: profile.dossier_id,
    details: { date_debut: dateDebut, date_fin: dateFin, jours: jours.length },
  });

  const clients = await destinatairesClient(profile.dossier_id);
  const cabinet = await destinatairesCabinet(profile.dossier_id);
  const nomSalarie =
    `${profile.prenom} ${profile.nom}`.trim() || "Un salarié";
  const corps = `${nomSalarie} : arrêt du ${formatDate(dateDebut)} au ${formatDate(dateFin)} (${jours.length} j. ouvrés).`;
  await notifier({
    userIds: clients,
    titre: "Nouvel arrêt maladie déclaré",
    corps,
    lien: `/client/arrets-maladie`,
  });
  await notifier({
    userIds: cabinet,
    titre: `Arrêt maladie : ${nomSalarie}`,
    corps,
    lien: `/cabinet/arrets-maladie`,
  });

  return NextResponse.json(arret as ArretMaladie);
}
