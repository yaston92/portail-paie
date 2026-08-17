import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiCabinetProfile } from "@/lib/auth";
import { journaliser } from "@/lib/audit";
import { getCabinetActif, peutAdminCabinet } from "@/lib/cabinet";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { CabinetRoleMembre, UserRole } from "@/lib/types";

const schema = z.object({
  profile_id: z.string().uuid(),
  role: z.enum(["directeur", "admin_cabinet", "collaborateur"]),
  cabinet_id: z.string().uuid().optional(),
});

function roleEffectif(
  role: UserRole,
  roleMembre: string
): "directeur" | "admin_cabinet" | "collaborateur" {
  if (role === "directeur") return "directeur";
  if (roleMembre === "admin" || role === "admin_cabinet") return "admin_cabinet";
  return "collaborateur";
}

/** Change le rôle d'un membre du cabinet actif. */
export async function PATCH(request: Request) {
  const acteur = await getApiCabinetProfile();
  if (!acteur) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const body = schema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }

  const cabinetActif = await getCabinetActif();
  if (!cabinetActif) {
    return NextResponse.json({ error: "Aucun cabinet actif" }, { status: 400 });
  }
  const cabinetId = body.data.cabinet_id ?? cabinetActif.id;
  if (cabinetId !== cabinetActif.id && !peutAdminCabinet(acteur, cabinetActif)) {
    return NextResponse.json({ error: "Cabinet inaccessible" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: membreActeur } = await supabase
    .from("cabinet_membres")
    .select("role_membre")
    .eq("cabinet_id", cabinetId)
    .eq("profile_id", acteur.id)
    .maybeSingle();

  const acteurEstAdmin =
    acteur.role === "directeur" ||
    acteur.role === "admin_cabinet" ||
    membreActeur?.role_membre === "admin";
  if (!acteurEstAdmin) {
    return NextResponse.json(
      { error: "Réservé à l'administrateur du cabinet" },
      { status: 403 }
    );
  }

  const { profile_id: cibleId, role: nouveauRole } = body.data;
  if (cibleId === acteur.id) {
    return NextResponse.json(
      { error: "Vous ne pouvez pas modifier votre propre rôle" },
      { status: 400 }
    );
  }

  const { data: membreCible } = await supabase
    .from("cabinet_membres")
    .select("role_membre, profile:profiles (id, role, email)")
    .eq("cabinet_id", cabinetId)
    .eq("profile_id", cibleId)
    .maybeSingle();

  if (!membreCible) {
    return NextResponse.json(
      { error: "Ce membre n'appartient pas à ce cabinet" },
      { status: 404 }
    );
  }

  const rawProfil = (
    membreCible as unknown as {
      profile?: { id: string; role: UserRole; email: string } | { id: string; role: UserRole; email: string }[] | null;
    }
  ).profile;
  const cibleProfil = Array.isArray(rawProfil) ? rawProfil[0] : rawProfil;
  if (!cibleProfil) {
    return NextResponse.json({ error: "Profil introuvable" }, { status: 404 });
  }

  const roleCibleActuel = roleEffectif(
    cibleProfil.role,
    (membreCible as { role_membre: string }).role_membre
  );

  // Directeur : admins + collabs (+ autres directeurs). Admin : collabs seulement.
  if (acteur.role !== "directeur") {
    if (roleCibleActuel !== "collaborateur") {
      return NextResponse.json(
        { error: "Un administrateur ne peut modifier que les collaborateurs" },
        { status: 403 }
      );
    }
    if (nouveauRole === "directeur") {
      return NextResponse.json(
        { error: "Seul un directeur peut nommer un directeur" },
        { status: 403 }
      );
    }
  }

  if (roleCibleActuel === nouveauRole) {
    return NextResponse.json({ ok: true, inchange: true });
  }

  const roleMembre: CabinetRoleMembre =
    nouveauRole === "collaborateur" ? "collaborateur" : "admin";
  const roleProfil: UserRole =
    nouveauRole === "directeur"
      ? "directeur"
      : nouveauRole === "admin_cabinet"
        ? "admin_cabinet"
        : "collaborateur";

  const admin = createAdminClient();
  const { error: profilErr } = await admin
    .from("profiles")
    .update({ role: roleProfil })
    .eq("id", cibleId);
  if (profilErr) {
    return NextResponse.json({ error: profilErr.message }, { status: 500 });
  }

  const { error: membreErr } = await admin
    .from("cabinet_membres")
    .update({ role_membre: roleMembre })
    .eq("cabinet_id", cabinetId)
    .eq("profile_id", cibleId);
  if (membreErr) {
    return NextResponse.json({ error: membreErr.message }, { status: 500 });
  }

  await journaliser({
    userId: acteur.id,
    action: "changement_role_membre",
    cibleType: "user",
    cibleId,
    details: {
      cabinet_id: cabinetId,
      ancien: roleCibleActuel,
      nouveau: nouveauRole,
      email: cibleProfil.email,
    },
  });

  return NextResponse.json({ ok: true, role: nouveauRole });
}
