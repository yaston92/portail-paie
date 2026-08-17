import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiCabinetProfile, cabinetPeutAccederDossier } from "@/lib/auth";
import { getCabinetActif, peutAdminCabinet } from "@/lib/cabinet";
import { createAdminClient } from "@/lib/supabase/admin";
import { journaliser } from "@/lib/audit";
import { envoyerEmail, gabaritEmail, styleBoutonEmail } from "@/lib/email";
import { inviterOuReinviterClient } from "@/lib/acces-client";
import type { CabinetRoleMembre } from "@/lib/types";

const schema = z.object({
  email: z.string().email(),
  role: z.enum([
    "directeur",
    "admin_cabinet",
    "collaborateur",
    "client",
    "salarie",
  ]),
  nom: z.string().min(1),
  prenom: z.string().default(""),
  telephone: z.string().optional(),
  dossier_id: z.string().uuid().optional(),
  salarie_id: z.string().uuid().optional(),
  cabinet_id: z.string().uuid().optional(),
});

function appUrlBase(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
    /\/$/,
    ""
  );
}

function lienDepuisGenerateLink(
  linkData: unknown,
  appUrl: string,
  type: "invite" | "magiclink"
): string {
  const hashed =
    (linkData as { properties?: { hashed_token?: string }; hashed_token?: string })
      .properties?.hashed_token ||
    (linkData as { hashed_token?: string }).hashed_token;

  if (hashed) {
    return `${appUrl}/definir-mot-de-passe?token_hash=${encodeURIComponent(hashed)}&type=${type}`;
  }

  const action =
    (linkData as { properties?: { action_link?: string } }).properties?.action_link ||
    (linkData as { action_link?: string }).action_link;
  if (!action) throw new Error("Lien d'activation introuvable.");
  return action;
}

async function envoyerInvitationCabinet(opts: {
  email: string;
  nom: string;
  prenom: string;
  role: "directeur" | "admin_cabinet" | "collaborateur";
  lien: string;
  appUrl: string;
  reinvitation: boolean;
}) {
  if (opts.lien.includes("localhost")) {
    throw new Error(
      `URL d'activation incorrecte (localhost). Vérifiez NEXT_PUBLIC_APP_URL (actuel: ${opts.appUrl}).`
    );
  }
  const roleLabel =
    opts.role === "directeur"
      ? "directeur"
      : opts.role === "admin_cabinet"
        ? "administrateur"
        : "collaborateur";
  const envoye = await envoyerEmail({
    to: [{ email: opts.email, name: `${opts.prenom} ${opts.nom}`.trim() }],
    subject: opts.reinvitation
      ? "Réactivez votre accès : ETIK Paie"
      : "Invitation : ETIK Paie",
    html: gabaritEmail(
      opts.reinvitation ? "Réactivez votre compte" : "Bienvenue sur ETIK Paie",
      `Bonjour ${opts.prenom || opts.nom},<br/><br/>` +
        (opts.reinvitation
          ? `Voici un nouveau lien pour définir votre mot de passe et accéder à votre espace ${roleLabel}.`
          : `Vous êtes invité(e) en tant que <strong>${roleLabel}</strong>. Cliquez ci-dessous pour créer votre mot de passe.`) +
        `<br/><br/><a href="${opts.lien}" style="${styleBoutonEmail()}">Définir mon mot de passe</a>` +
        `<p style="font-size:12px;color:#666;word-break:break-all;margin-top:16px">${opts.lien}</p>`
    ),
  });
  if (!envoye) {
    throw new Error(
      "Lien généré mais email non envoyé (Brevo). Vérifiez BREVO_API_KEY / EMAIL_FROM."
    );
  }
}

async function assurerMembreCabinet(
  profileId: string,
  cabinetId: string,
  roleMembre: CabinetRoleMembre
) {
  const admin = createAdminClient();
  await admin.from("cabinet_membres").upsert(
    {
      cabinet_id: cabinetId,
      profile_id: profileId,
      role_membre: roleMembre,
    },
    { onConflict: "cabinet_id,profile_id" }
  );
}

/** Invitation d'un utilisateur (email Brevo + lien token_hash vers /definir-mot-de-passe). */
export async function POST(request: Request) {
  const profile = await getApiCabinetProfile();
  if (!profile) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const body = schema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }
  const { email: emailRaw, role, nom, prenom, telephone, dossier_id, salarie_id } =
    body.data;
  const email = emailRaw.trim().toLowerCase();

  const cabinetActif = await getCabinetActif();
  if (!cabinetActif) {
    return NextResponse.json({ error: "Aucun cabinet actif" }, { status: 400 });
  }
  const cabinetId = body.data.cabinet_id ?? cabinetActif.id;
  if (cabinetId !== cabinetActif.id && !peutAdminCabinet(profile, cabinetActif)) {
    return NextResponse.json({ error: "Cabinet inaccessible" }, { status: 403 });
  }

  // Accès staff : directeur (invite) / admin / collab
  if (
    role === "directeur" ||
    role === "admin_cabinet" ||
    role === "collaborateur"
  ) {
    if (role === "directeur" && profile.role !== "directeur") {
      return NextResponse.json(
        { error: "Seul un directeur peut inviter un autre directeur" },
        { status: 403 }
      );
    }
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data: m } = await supabase
      .from("cabinet_membres")
      .select("role_membre")
      .eq("cabinet_id", cabinetId)
      .eq("profile_id", profile.id)
      .maybeSingle();
    const peutInviterStaff =
      profile.role === "directeur" ||
      profile.role === "admin_cabinet" ||
      m?.role_membre === "admin";
    if (!peutInviterStaff) {
      return NextResponse.json(
        { error: "Réservé à l'administrateur du cabinet" },
        { status: 403 }
      );
    }
  }

  if (role === "client" || role === "salarie") {
    if (!dossier_id || !(await cabinetPeutAccederDossier(dossier_id))) {
      return NextResponse.json({ error: "Dossier inaccessible" }, { status: 403 });
    }
    if (role === "salarie" && !salarie_id) {
      return NextResponse.json({ error: "Fiche salarié requise" }, { status: 400 });
    }
  }

  if (role === "client" && dossier_id) {
    try {
      const result = await inviterOuReinviterClient({
        dossierId: dossier_id,
        email,
        actorUserId: profile.id,
      });
      return NextResponse.json({ ...result, ok: true });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Invitation impossible" },
        { status: 400 }
      );
    }
  }

  if (role === "salarie" && dossier_id && salarie_id) {
    try {
      const { inviterOuReinviterSalarie } = await import("@/lib/acces-salarie");
      const result = await inviterOuReinviterSalarie({
        salarieId: salarie_id,
        email,
        actorUserId: profile.id,
        dossierId: dossier_id,
      });
      return NextResponse.json({ ...result, ok: true });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Invitation impossible" },
        { status: 400 }
      );
    }
  }

  if (
    role !== "directeur" &&
    role !== "admin_cabinet" &&
    role !== "collaborateur"
  ) {
    return NextResponse.json({ error: "Rôle non géré" }, { status: 400 });
  }

  const roleMembre: CabinetRoleMembre =
    role === "collaborateur" ? "collaborateur" : "admin";
  const roleProfil =
    role === "directeur"
      ? "directeur"
      : role === "admin_cabinet"
        ? "admin_cabinet"
        : "collaborateur";

  try {
    const admin = createAdminClient();
    const appUrl = appUrlBase();
    const redirectTo = `${appUrl}/auth/callback`;

    const { data: existants } = await admin
      .from("profiles")
      .select("id, email, role")
      .ilike("email", email)
      .limit(5);
    const deja =
      existants?.find((p) => p.email?.toLowerCase() === email) ?? existants?.[0];

    if (
      deja &&
      deja.role !== "admin_cabinet" &&
      deja.role !== "collaborateur" &&
      deja.role !== "directeur"
    ) {
      return NextResponse.json(
        { error: "Cet email correspond déjà à un compte d'un autre type." },
        { status: 400 }
      );
    }

    const meta = {
      role: roleProfil,
      nom,
      prenom,
      telephone: telephone ?? null,
      dossier_id: "",
      salarie_id: "",
    };

    if (!deja) {
      const { data: linkData, error } = await admin.auth.admin.generateLink({
        type: "invite",
        email,
        options: { data: meta, redirectTo },
      });
      if (error) {
        return NextResponse.json(
          { error: "Échec de l'invitation : " + error.message },
          { status: 400 }
        );
      }

      const lien = lienDepuisGenerateLink(linkData, appUrl, "invite");
      await envoyerInvitationCabinet({
        email,
        nom,
        prenom,
        role: roleProfil,
        lien,
        appUrl,
        reinvitation: false,
      });

      const userId =
        (linkData as { user?: { id?: string } }).user?.id ||
        (linkData as { properties?: { user_id?: string } }).properties?.user_id;

      if (userId) {
        await admin
          .from("profiles")
          .update({ role: roleProfil, nom, prenom })
          .eq("id", userId);
        await assurerMembreCabinet(userId, cabinetId, roleMembre);
      }

      await journaliser({
        userId: profile.id,
        action: "invitation_utilisateur",
        cibleType: "user",
        cibleId: userId,
        dossierId: null,
        details: { email, role: roleProfil, cabinet_id: cabinetId, mode: "invite", via: "brevo" },
      });

      return NextResponse.json({ ok: true, mode: "invite", userId });
    }

    // Ne pas dégrader un directeur existant sauf si on invite explicitement en directeur
    const nouveauRole =
      deja.role === "directeur" && roleProfil !== "directeur"
        ? "directeur"
        : roleProfil;

    await admin
      .from("profiles")
      .update({
        nom,
        prenom,
        role: nouveauRole,
        telephone: telephone ?? null,
      })
      .eq("id", deja.id);

    await assurerMembreCabinet(deja.id, cabinetId, roleMembre);

    const { data: linkData, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });
    if (error) {
      return NextResponse.json(
        { error: "Impossible de régénérer le lien : " + error.message },
        { status: 400 }
      );
    }

    const lien = lienDepuisGenerateLink(linkData, appUrl, "magiclink");
    await envoyerInvitationCabinet({
      email,
      nom,
      prenom,
      role: roleProfil,
      lien,
      appUrl,
      reinvitation: true,
    });

    await journaliser({
      userId: profile.id,
      action: "reinvitation_utilisateur",
      cibleType: "user",
      cibleId: deja.id,
      dossierId: null,
      details: {
        email,
        role: roleProfil,
        cabinet_id: cabinetId,
        mode: "magiclink",
        via: "brevo",
      },
    });

    return NextResponse.json({ ok: true, mode: "reinvitation", userId: deja.id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invitation impossible" },
      { status: 400 }
    );
  }
}
