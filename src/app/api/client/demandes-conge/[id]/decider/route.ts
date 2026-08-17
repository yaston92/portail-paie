import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiProfile, cabinetPeutAccederDossier } from "@/lib/auth";
import { journaliser } from "@/lib/audit";
import {
  joursOuvres,
  synchroniserAbsencesDepuisDemande,
} from "@/lib/demandes-conge";
import { formatDate } from "@/lib/format";
import { notifier } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DemandeConge } from "@/lib/types";

const schema = z.object({
  decision: z.enum(["validee", "refusee"]),
  commentaire: z.string().max(2000).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const profile = await getApiProfile([
    "client",
    "admin_cabinet",
    "collaborateur",
  ]);
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const body = schema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }

  const { id } = await context.params;
  const admin = createAdminClient();
  const { data: raw } = await admin
    .from("demandes_conge")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const d = raw as DemandeConge | null;
  if (!d) {
    return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
  }

  if (profile.role === "client") {
    if (profile.dossier_id !== d.dossier_id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }
  } else {
    const ok = await cabinetPeutAccederDossier(d.dossier_id);
    if (!ok) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }
  }

  if (d.statut !== "en_attente") {
    return NextResponse.json(
      { error: "Cette demande a déjà été traitée." },
      { status: 400 }
    );
  }

  let pending_sync: string[] = [];
  if (body.data.decision === "validee") {
    const jours = joursOuvres(d.date_debut, d.date_fin);
    pending_sync = await synchroniserAbsencesDepuisDemande({
      salarieId: d.salarie_id,
      dossierId: d.dossier_id,
      jours,
    });
  }

  const { data: updated, error } = await admin
    .from("demandes_conge")
    .update({
      statut: body.data.decision,
      decideur_id: profile.id,
      decision_commentaire: body.data.commentaire?.trim() || null,
      decided_at: new Date().toISOString(),
      pending_sync,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await notifier({
    userIds: [d.demandeur_id],
    titre:
      body.data.decision === "validee"
        ? "Congés validés"
        : "Congés refusés",
    corps:
      body.data.decision === "validee"
        ? `Votre demande du ${formatDate(d.date_debut)} au ${formatDate(d.date_fin)} a été validée.`
        : `Votre demande du ${formatDate(d.date_debut)} au ${formatDate(d.date_fin)} a été refusée.${
            body.data.commentaire ? ` Motif : ${body.data.commentaire}` : ""
          }`,
    lien: "/salarie",
  });

  await journaliser({
    userId: profile.id,
    action:
      body.data.decision === "validee"
        ? "validation_demande_conge"
        : "refus_demande_conge",
    cibleType: "demande_conge",
    cibleId: id,
    dossierId: d.dossier_id,
    details: { pending_sync },
  });

  return NextResponse.json(updated as DemandeConge);
}
