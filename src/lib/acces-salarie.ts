import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { envoyerEmail, gabaritEmail, styleBoutonEmail } from "@/lib/email";
import { journaliser } from "@/lib/audit";

export type AccesSalarieStatut = "aucun" | "invitation_en_attente" | "actif";

export interface AccesSalarieInfo {
  statut: AccesSalarieStatut;
  email: string | null;
  profile_id: string | null;
  invited_at: string | null;
  last_sign_in_at: string | null;
}

function appUrlBase(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

function lienDepuisGenerateLink(
  linkData: unknown,
  appUrl: string,
  type: "invite" | "recovery" | "magiclink"
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

export async function getAccesSalarie(salarieId: string): Promise<AccesSalarieInfo> {
  const map = await getAccesSalariesBatch([salarieId]);
  return (
    map.get(salarieId) ?? {
      statut: "aucun",
      email: null,
      profile_id: null,
      invited_at: null,
      last_sign_in_at: null,
    }
  );
}

/**
 * Accès espace pour plusieurs salariés en lot (1 requête salaries + profiles,
 * puis getUserById en parallèle uniquement pour les profils liés).
 */
export async function getAccesSalariesBatch(
  salarieIds: string[]
): Promise<Map<string, AccesSalarieInfo>> {
  const out = new Map<string, AccesSalarieInfo>();
  if (salarieIds.length === 0) return out;

  const admin = createAdminClient();
  const { data: salaries } = await admin
    .from("salaries")
    .select("id, email, profile_id")
    .in("id", salarieIds);

  const byId = new Map((salaries ?? []).map((s) => [s.id as string, s]));
  const profileIds = [
    ...new Set(
      (salaries ?? [])
        .map((s) => s.profile_id as string | null)
        .filter((id): id is string => !!id)
    ),
  ];

  const { data: profiles } =
    profileIds.length > 0
      ? await admin
          .from("profiles")
          .select("id, email, doit_changer_mot_de_passe")
          .in("id", profileIds)
      : { data: [] as { id: string; email: string | null }[] };
  const emailParProfile = new Map(
    (profiles ?? []).map((p) => [p.id as string, (p.email as string | null) ?? null])
  );
  const doitChangerParProfile = new Map(
    (profiles ?? []).map((p) => [
      p.id as string,
      Boolean((p as { doit_changer_mot_de_passe?: boolean }).doit_changer_mot_de_passe),
    ])
  );

  const authParId = new Map<
    string,
    { last_sign_in_at: string | null; invited_at: string | null }
  >();
  await Promise.all(
    profileIds.map(async (pid) => {
      try {
        const { data: authData } = await admin.auth.admin.getUserById(pid);
        const u = authData.user;
        authParId.set(pid, {
          last_sign_in_at: u?.last_sign_in_at ?? null,
          invited_at:
            (u as { invited_at?: string | null } | undefined)?.invited_at ?? null,
        });
      } catch {
        authParId.set(pid, { last_sign_in_at: null, invited_at: null });
      }
    })
  );

  for (const id of salarieIds) {
    const salarie = byId.get(id);
    if (!salarie) {
      out.set(id, {
        statut: "aucun",
        email: null,
        profile_id: null,
        invited_at: null,
        last_sign_in_at: null,
      });
      continue;
    }
    const profileId = (salarie.profile_id as string | null) ?? null;
    if (!profileId) {
      out.set(id, {
        statut: "aucun",
        email: (salarie.email as string | null) ?? null,
        profile_id: null,
        invited_at: null,
        last_sign_in_at: null,
      });
      continue;
    }
    const auth = authParId.get(profileId) ?? {
      last_sign_in_at: null,
      invited_at: null,
    };
    const enAttente = doitChangerParProfile.get(profileId) || !auth.last_sign_in_at;
    out.set(id, {
      statut: enAttente ? "invitation_en_attente" : "actif",
      email:
        emailParProfile.get(profileId) ||
        (salarie.email as string | null) ||
        null,
      profile_id: profileId,
      invited_at: auth.invited_at,
      last_sign_in_at: auth.last_sign_in_at,
    });
  }

  return out;
}

/**
 * Invite ou réinvite un salarié.
 * Toujours via Brevo + lien token_hash sur NEXT_PUBLIC_APP_URL
 * (évite les mails Supabase qui pointent vers localhost).
 */
export async function inviterOuReinviterSalarie(opts: {
  salarieId: string;
  email: string;
  actorUserId: string;
  dossierId: string;
}): Promise<{ ok: true; mode: "invite" | "reinvitation"; userId?: string }> {
  const email = opts.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new Error("Adresse email invalide.");
  }

  const admin = createAdminClient();
  const { data: salarie } = await admin
    .from("salaries")
    .select("id, nom, prenom, email, dossier_id, profile_id")
    .eq("id", opts.salarieId)
    .maybeSingle();

  if (!salarie) throw new Error("Salarié introuvable.");
  if (salarie.dossier_id !== opts.dossierId) {
    throw new Error("Salarié hors dossier.");
  }

  if ((salarie.email ?? "").trim().toLowerCase() !== email) {
    await admin.from("salaries").update({ email }).eq("id", opts.salarieId);
  }

  const nom = salarie.nom || "Salarié";
  const prenom = salarie.prenom || "";
  const appUrl = appUrlBase();
  const redirectTo = `${appUrl}/auth/callback`;

  const { data: existants } = await admin
    .from("profiles")
    .select("id, email, role, salarie_id, dossier_id")
    .ilike("email", email)
    .limit(5);

  const deja =
    existants?.find((p) => p.email?.toLowerCase() === email) ?? existants?.[0];

  if (deja && deja.role !== "salarie") {
    throw new Error("Cet email correspond à un compte non-salarié.");
  }
  if (deja && deja.salarie_id && deja.salarie_id !== opts.salarieId) {
    throw new Error("Cet email est déjà rattaché à un autre salarié.");
  }

  const meta = {
    role: "salarie",
    nom,
    prenom,
    dossier_id: opts.dossierId,
    salarie_id: opts.salarieId,
  };

  let mode: "invite" | "reinvitation";
  let userId: string | undefined;

  if (!deja) {
    mode = "invite";
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: randomBytes(18).toString("base64url"),
      email_confirm: true,
      user_metadata: meta,
    });
    if (createError || !created.user) {
      throw new Error("Échec de l'invitation : " + (createError?.message ?? ""));
    }
    userId = created.user.id;
    await admin
      .from("profiles")
      .update({
        doit_changer_mot_de_passe: true,
        role: "salarie",
        nom,
        prenom,
        dossier_id: opts.dossierId,
        salarie_id: opts.salarieId,
      })
      .eq("id", userId);

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });
    if (linkError) throw new Error("Échec de l'invitation : " + linkError.message);

    const lien = lienDepuisGenerateLink(linkData, appUrl, "recovery");
    await envoyerLienActivation({
      email,
      prenom,
      nom,
      lien,
      appUrl,
    });

    if (userId) {
      await admin
        .from("salaries")
        .update({ profile_id: userId, email })
        .eq("id", opts.salarieId);
    }

    await journaliser({
      userId: opts.actorUserId,
      action: "invitation_salarie",
      cibleType: "salarie",
      cibleId: opts.salarieId,
      dossierId: opts.dossierId,
      details: { email, mode: "invite", via: "brevo" },
    });
    return { ok: true, mode, userId };
  }

  mode = "reinvitation";
  userId = deja.id;

  await admin
    .from("profiles")
    .update({
      salarie_id: opts.salarieId,
      dossier_id: opts.dossierId,
      nom,
      prenom,
      role: "salarie",
      doit_changer_mot_de_passe: true,
    })
    .eq("id", deja.id);

  await admin
    .from("salaries")
    .update({ profile_id: deja.id, email })
    .eq("id", opts.salarieId);

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });
  if (linkError) throw new Error("Impossible de régénérer le lien : " + linkError.message);

  const lien = lienDepuisGenerateLink(linkData, appUrl, "recovery");
  await envoyerLienActivation({ email, prenom, nom, lien, appUrl });

  await journaliser({
    userId: opts.actorUserId,
    action: "reinvitation_salarie",
    cibleType: "salarie",
    cibleId: opts.salarieId,
    dossierId: opts.dossierId,
    details: { email, mode: "magiclink", via: "brevo" },
  });

  return { ok: true, mode, userId };
}

async function envoyerLienActivation(opts: {
  email: string;
  prenom: string;
  nom: string;
  lien: string;
  appUrl: string;
}) {
  if (opts.lien.includes("localhost") || opts.lien.includes("persons-tony-games-apr")) {
    throw new Error(
      `URL d'activation incorrecte. Vérifiez NEXT_PUBLIC_APP_URL (actuel: ${opts.appUrl}).`
    );
  }

  const envoye = await envoyerEmail({
    to: [{ email: opts.email, name: `${opts.prenom} ${opts.nom}`.trim() }],
    subject: "Activez votre espace salarié : ETIK Paie",
    html: gabaritEmail(
      "Activez votre compte",
      `Bonjour ${opts.prenom || opts.nom},<br/><br/>Voici un lien pour définir votre mot de passe et accéder à votre espace salarié (bulletins, soldes…).` +
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

function extraireTokenHash(linkData: unknown): string | null {
  const props = (linkData as { properties?: Record<string, string> })?.properties;
  const actionLink = props?.action_link;
  if (actionLink) {
    try {
      const u = new URL(actionLink);
      const token =
        u.searchParams.get("token") || u.searchParams.get("token_hash");
      if (token) return token;
    } catch {
      /* ignore */
    }
  }
  return (
    props?.hashed_token ||
    (linkData as { hashed_token?: string })?.hashed_token ||
    null
  );
}

/**
 * Demande de changement d'email pour un compte salarié déjà actif.
 * Envoie un lien à la nouvelle adresse ; l'email Auth / profil actuel
 * reste inchangé jusqu'à confirmation du lien.
 */
export async function demanderChangementEmailSalarie(opts: {
  salarieId: string;
  nouvelEmail: string;
  actorUserId: string;
  dossierId: string;
}): Promise<{ ok: true; emailActuel: string; emailDemande: string }> {
  const nouvelEmail = opts.nouvelEmail.trim().toLowerCase();
  if (!nouvelEmail || !nouvelEmail.includes("@")) {
    throw new Error("Adresse email invalide.");
  }

  const admin = createAdminClient();
  const { data: salarie } = await admin
    .from("salaries")
    .select("id, nom, prenom, email, dossier_id, profile_id")
    .eq("id", opts.salarieId)
    .maybeSingle();

  if (!salarie) throw new Error("Salarié introuvable.");
  if (salarie.dossier_id !== opts.dossierId) {
    throw new Error("Salarié hors dossier.");
  }
  if (!salarie.profile_id) {
    throw new Error("Ce salarié n'a pas encore de compte actif.");
  }

  const { data: authData, error: authError } = await admin.auth.admin.getUserById(
    salarie.profile_id
  );
  if (authError || !authData.user?.email) {
    throw new Error("Compte Auth introuvable pour ce salarié.");
  }

  const emailActuel = authData.user.email.toLowerCase();
  if (nouvelEmail === emailActuel) {
    throw new Error("C'est déjà l'adresse de connexion active.");
  }

  const { data: conflit } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", nouvelEmail)
    .neq("id", salarie.profile_id)
    .maybeSingle();
  if (conflit) {
    throw new Error("Cet email est déjà utilisé par un autre compte.");
  }

  const appUrl = appUrlBase();
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "email_change_new",
    email: authData.user.email,
    newEmail: nouvelEmail,
    options: { redirectTo: `${appUrl}/auth/confirmer-email` },
  });

  if (linkError || !linkData) {
    const msg = (linkError?.message || "").toLowerCase();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
      throw new Error("Cet email est déjà utilisé par un autre compte.");
    }
    throw new Error(
      linkError?.message || "Impossible de préparer le changement d'email."
    );
  }

  const hashed = extraireTokenHash(linkData);
  if (!hashed) {
    throw new Error("Impossible de préparer le lien d'activation.");
  }

  const lien = `${appUrl}/auth/confirmer-email?token_hash=${encodeURIComponent(hashed)}&type=email_change`;
  const prenom = salarie.prenom || "";
  const nom = salarie.nom || "Salarié";

  const envoye = await envoyerEmail({
    to: [{ email: nouvelEmail, name: `${prenom} ${nom}`.trim() }],
    subject: "Confirmez votre nouvel email : ETIK Paie",
    html: gabaritEmail(
      "Activer votre nouvel email",
      `Bonjour${prenom ? ` ${prenom}` : ""},` +
        `<br/><br/>Votre employeur a demandé à utiliser <strong>${nouvelEmail}</strong> comme nouvelle adresse de connexion sur ETIK Paie.` +
        `<br/><br/>Cliquez sur le bouton ci-dessous pour activer cette adresse. Tant que vous n'avez pas confirmé, votre adresse actuelle (<strong>${emailActuel}</strong>) reste active.` +
        `<br/><br/><a href="${lien}" style="${styleBoutonEmail()}">Activer mon nouvel email</a>` +
        `<p style="font-size:12px;color:#666;margin-top:12px">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>`
    ),
  });

  if (!envoye) {
    throw new Error(
      "Email d'activation non envoyé (Brevo). Vérifiez BREVO_API_KEY / EMAIL_FROM."
    );
  }

  await journaliser({
    userId: opts.actorUserId,
    action: "salarie_email_changement_demande",
    cibleType: "salarie",
    cibleId: opts.salarieId,
    dossierId: opts.dossierId,
    details: { email_actuel: emailActuel, email_demande: nouvelEmail },
  });

  return { ok: true, emailActuel, emailDemande: nouvelEmail };
}
