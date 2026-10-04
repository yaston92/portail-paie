import { NextResponse } from "next/server";
import { getApiProfile, cabinetPeutAccederDossier } from "@/lib/auth";
import {
  getAccesClientDossier,
  inviterOuReinviterClient,
} from "@/lib/acces-client";

/** Statut d'accès client pour un dossier. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getApiProfile(["admin_cabinet", "collaborateur"]);
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }
  const { id } = await params;
  if (!(await cabinetPeutAccederDossier(id))) {
    return NextResponse.json({ error: "Dossier inaccessible" }, { status: 403 });
  }

  const info = await getAccesClientDossier(id);
  return NextResponse.json(info);
}

/** Invite ou réinvite le client du dossier. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getApiProfile(["admin_cabinet", "collaborateur"]);
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }
  const { id } = await params;
  if (!(await cabinetPeutAccederDossier(id))) {
    return NextResponse.json({ error: "Dossier inaccessible" }, { status: 403 });
  }

  let body: { email?: string; password?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const email = (body.email || "").trim().toLowerCase();
  const password = body.password ?? "";
  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { error: "Indiquez l'email du client." },
      { status: 400 }
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Choisissez un mot de passe provisoire d'au moins 8 caractères." },
      { status: 400 }
    );
  }

  try {
    const result = await inviterOuReinviterClient({
      dossierId: id,
      email,
      password,
      actorUserId: profile.id,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invitation impossible" },
      { status: 400 }
    );
  }
}
