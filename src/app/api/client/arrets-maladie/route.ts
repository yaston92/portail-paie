import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getApiProfile } from "@/lib/auth";
import { journaliser } from "@/lib/audit";
import { synchroniserAbsencesMaladie } from "@/lib/arrets-maladie";
import { joursOuvres } from "@/lib/demandes-conge";
import { formatDate } from "@/lib/format";
import { destinatairesCabinet, notifier } from "@/lib/notify";
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

/** Liste des arrêts maladie du dossier client (ou filtre salarié). */
export async function GET(request: Request) {
  const profile = await getApiProfile(["client", "admin_cabinet", "collaborateur"]);
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }
  const url = new URL(request.url);
  const salarieId = url.searchParams.get("salarie_id");
  const supabase = await createClient();

  let q = supabase
    .from("arrets_maladie")
    .select("*, salaries(nom, prenom)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (profile.role === "client") {
    if (!profile.dossier_id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }
    q = q.eq("dossier_id", profile.dossier_id);
  }
  if (salarieId) q = q.eq("salarie_id", salarieId);

  const { data } = await q;
  return NextResponse.json(data ?? []);
}

/** Déclaration d'un arrêt maladie par le client (justificatif optionnel). */
export async function POST(request: Request) {
  const profile = await getApiProfile(["client"]);
  if (!profile?.dossier_id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const form = await request.formData();
  const salarieId = (form.get("salarie_id") as string | null)?.trim();
  const dateDebut = form.get("date_debut") as string | null;
  const dateFin = form.get("date_fin") as string | null;
  const fichier = form.get("justificatif") as File | null;

  if (!salarieId) {
    return NextResponse.json({ error: "Salarié requis" }, { status: 400 });
  }
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

  const supabase = await createClient();
  const { data: salarie } = await supabase
    .from("salaries")
    .select("id, nom, prenom, dossier_id")
    .eq("id", salarieId)
    .eq("dossier_id", profile.dossier_id)
    .maybeSingle();
  if (!salarie) {
    return NextResponse.json({ error: "Salarié inaccessible" }, { status: 403 });
  }

  const jours = joursOuvres(dateDebut, dateFin);
  if (jours.length === 0) {
    return NextResponse.json(
      { error: "Aucune journée ouvrée dans cette période." },
      { status: 400 }
    );
  }

  let chemin: string | null = null;
  let nomFichier: string | null = null;
  if (fichier && fichier instanceof File && fichier.size > 0) {
    const ext = extensionFichier(fichier.name).toLowerCase();
    if (!EXTS_OK.has(ext)) {
      return NextResponse.json(
        { error: "Format accepté : PDF, JPG ou PNG." },
        { status: 400 }
      );
    }
    chemin = `dossiers/${profile.dossier_id}/salaries/${salarieId}/arret-maladie-${randomUUID()}.${ext}`;
    await uploaderFichier(
      "documents",
      chemin,
      Buffer.from(await fichier.arrayBuffer()),
      contentTypePourExtension(ext)
    );
    nomFichier = fichier.name;
  }

  const pending = await synchroniserAbsencesMaladie({
    salarieId,
    dossierId: profile.dossier_id,
    jours,
  });

  const admin = createAdminClient();
  const { data: arret, error } = await admin
    .from("arrets_maladie")
    .insert({
      salarie_id: salarieId,
      dossier_id: profile.dossier_id,
      declarant_id: profile.id,
      date_debut: dateDebut,
      date_fin: dateFin,
      jours: jours.length,
      justificatif_chemin: chemin,
      justificatif_nom: nomFichier,
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
    action: "arret_maladie_client",
    cibleType: "arret_maladie",
    cibleId: arret.id,
    dossierId: profile.dossier_id,
    details: {
      salarie_id: salarieId,
      date_debut: dateDebut,
      date_fin: dateFin,
      jours: jours.length,
    },
  });

  const cabinet = await destinatairesCabinet(profile.dossier_id);
  await notifier({
    userIds: cabinet,
    titre: `Arrêt maladie : ${salarie.nom} ${salarie.prenom}`,
    corps: `Le client a déclaré un arrêt du ${formatDate(dateDebut)} au ${formatDate(dateFin)}.`,
    lien: `/cabinet/arrets-maladie`,
  });

  return NextResponse.json(arret as ArretMaladie);
}
