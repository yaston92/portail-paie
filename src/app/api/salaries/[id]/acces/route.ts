import { NextResponse } from "next/server";
import { getApiProfile, cabinetPeutAccederDossier } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAccesSalarie,
  inviterOuReinviterSalarie,
  demanderChangementEmailSalarie,
} from "@/lib/acces-salarie";

async function autoriserAccesSalarie(
  salarieId: string
): Promise<
  | { ok: true; dossierId: string; profileId: string }
  | { ok: false; status: number; error: string }
> {
  const profile = await getApiProfile([
    "admin_cabinet",
    "collaborateur",
    "client",
  ]);
  if (!profile) return { ok: false, status: 403, error: "Non autorisé" };

  const admin = createAdminClient();
  const { data: salarie } = await admin
    .from("salaries")
    .select("id, dossier_id")
    .eq("id", salarieId)
    .maybeSingle();
  if (!salarie) return { ok: false, status: 404, error: "Salarié introuvable" };

  if (profile.role === "client") {
    if (!profile.dossier_id || profile.dossier_id !== salarie.dossier_id) {
      return { ok: false, status: 403, error: "Salarié hors de votre dossier" };
    }
  } else if (!(await cabinetPeutAccederDossier(salarie.dossier_id))) {
    return { ok: false, status: 403, error: "Dossier inaccessible" };
  }

  return { ok: true, dossierId: salarie.dossier_id, profileId: profile.id };
}

/** Statut d'accès espace salarié. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await autoriserAccesSalarie(id);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const info = await getAccesSalarie(id);
  return NextResponse.json(info);
}

/** Invite ou réinvite le salarié sur son espace. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await autoriserAccesSalarie(id);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { email?: string; action?: string } = {};
  try {
    body = await request.json();
  } catch {
    /* email optionnel si déjà en base */
  }

  const admin = createAdminClient();
  const { data: salarie } = await admin
    .from("salaries")
    .select("email")
    .eq("id", id)
    .maybeSingle();

  const email = (body.email || salarie?.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { error: "Indiquez l'email du salarié à inviter." },
      { status: 400 }
    );
  }

  try {
    if (body.action === "changement_email") {
      const result = await demanderChangementEmailSalarie({
        salarieId: id,
        nouvelEmail: email,
        actorUserId: auth.profileId,
        dossierId: auth.dossierId,
      });
      return NextResponse.json(result);
    }

    const result = await inviterOuReinviterSalarie({
      salarieId: id,
      email,
      actorUserId: auth.profileId,
      dossierId: auth.dossierId,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invitation impossible" },
      { status: 400 }
    );
  }
}
