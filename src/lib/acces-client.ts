import { createAdminClient } from "@/lib/supabase/admin";
import { envoyerEmail, gabaritEmail, styleBoutonEmail } from "@/lib/email";
import { journaliser } from "@/lib/audit";

export type AccesClientStatut = "aucun" | "invitation_en_attente" | "actif";

export interface AccesClientInfo {
  statut: AccesClientStatut;
  email: string | null;
  profile_id: string | null;
  invited_at: string | null;
  last_sign_in_at: string | null;
}

export async function getAccesClientDossier(dossierId: string): Promise<AccesClientInfo> {
  const admin = createAdminClient();
  const { data: dossier } = await admin
    .from("dossiers")
    .select("email")
    .eq("id", dossierId)
    .maybeSingle();

  const { data: clients } = await admin
    .from("profiles")
    .select("id, email, created_at")
    .eq("dossier_id", dossierId)
    .eq("role", "client")
    .order("created_at", { ascending: false });

  if (!clients?.length) {
    return {
      statut: "aucun",
      email: dossier?.email ?? null,
      profile_id: null,
      invited_at: null,
      last_sign_in_at: null,
    };
  }

  // Auth Admin en parallèle (évite N getUserById séquentiels)
  const users = await Promise.all(
    clients.map(async (c) => {
      const { data } = await admin.auth.admin.getUserById(c.id);
      return { client: c, user: data.user };
    })
  );

  for (const { client: c, user: u } of users) {
    if (!u) continue;
    const signIn = u.last_sign_in_at ?? null;
    const invited = (u as { invited_at?: string | null }).invited_at ?? null;
    if (signIn) {
      return {
        statut: "actif",
        email: c.email || dossier?.email || null,
        profile_id: c.id,
        invited_at: invited,
        last_sign_in_at: signIn,
      };
    }
  }

  const premier = users.find((x) => x.user) ?? { client: clients[0]!, user: null };
  const lastSignIn = premier.user?.last_sign_in_at ?? null;
  const invitedAt =
    (premier.user as { invited_at?: string | null } | null | undefined)?.invited_at ??
    null;

  return {
    statut: lastSignIn ? "actif" : "invitation_en_attente",
    email: premier.client.email || dossier?.email || null,
    profile_id: premier.client.id,
    invited_at: invitedAt,
    last_sign_in_at: lastSignIn,
  };
}

/** Invite ou réinvite un client pour un dossier (email Brevo si compte déjà créé). */
export async function inviterOuReinviterClient(opts: {
  dossierId: string;
  email: string;
  actorUserId: string;
}): Promise<{ ok: true; mode: "invite" | "reinvitation"; userId?: string }> {
  const email = opts.email.trim().toLowerCase();
  const admin = createAdminClient();
  const { data: dossier } = await admin
    .from("dossiers")
    .select("email, raison_sociale, sigle")
    .eq("id", opts.dossierId)
    .maybeSingle();

  if (!dossier) throw new Error("Dossier introuvable.");

  if (dossier.email?.trim().toLowerCase() !== email) {
    await admin.from("dossiers").update({ email }).eq("id", opts.dossierId);
  }

  const nom = dossier.raison_sociale || dossier.sigle || "Client";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirectTo = `${appUrl}/auth/callback`;

  const { data: existants } = await admin
    .from("profiles")
    .select("id, email, role, dossier_id")
    .ilike("email", email)
    .limit(5);

  const deja = existants?.find((p) => p.email?.toLowerCase() === email) ?? existants?.[0];

  if (deja && deja.role === "client" && deja.dossier_id && deja.dossier_id !== opts.dossierId) {
    throw new Error("Cet email est déjà rattaché à un autre dossier client.");
  }
  if (deja && deja.role !== "client") {
    throw new Error("Cet email correspond à un compte non-client.");
  }

  if (!deja) {
    const { data: linkData, error } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        data: {
          role: "client",
          nom,
          prenom: "Client",
          dossier_id: opts.dossierId,
          salarie_id: "",
        },
        redirectTo,
      },
    });
    if (error) throw new Error("Échec de l'invitation : " + error.message);

    const hashed =
      (linkData as { properties?: { hashed_token?: string }; hashed_token?: string })
        .properties?.hashed_token ||
      (linkData as { hashed_token?: string }).hashed_token;
    const lien = hashed
      ? `${appUrl}/definir-mot-de-passe?token_hash=${encodeURIComponent(hashed)}&type=invite`
      : (linkData as { properties?: { action_link?: string } }).properties?.action_link ||
        (linkData as { action_link?: string }).action_link;
    if (!lien) throw new Error("Lien d'activation introuvable.");
    if (lien.includes("localhost")) {
      throw new Error(
        `URL d'activation incorrecte (localhost). Vérifiez NEXT_PUBLIC_APP_URL (actuel: ${appUrl}).`
      );
    }

    const envoye = await envoyerEmail({
      to: [{ email, name: nom }],
      subject: "Activez votre accès client : ETIK Paie",
      html: gabaritEmail(
        "Activez votre compte",
        `Bonjour,<br/><br/>Voici un lien pour définir votre mot de passe et activer l'accès au dossier <strong>${nom}</strong>.` +
          `<br/><br/><a href="${lien}" style="${styleBoutonEmail()}">Définir mon mot de passe</a>` +
          `<p style="font-size:12px;color:#666;word-break:break-all;margin-top:16px">${lien}</p>`
      ),
    });
    if (!envoye) {
      throw new Error(
        "Lien généré mais email non envoyé (Brevo). Vérifiez BREVO_API_KEY / EMAIL_FROM."
      );
    }

    const userId =
      (linkData as { user?: { id?: string } }).user?.id ||
      (linkData as { properties?: { user_id?: string } }).properties?.user_id;

    await journaliser({
      userId: opts.actorUserId,
      action: "invitation_client",
      cibleType: "user",
      cibleId: userId,
      dossierId: opts.dossierId,
      details: { email, mode: "invite", via: "brevo" },
    });
    return { ok: true, mode: "invite", userId };
  }

  if (!deja.dossier_id) {
    await admin
      .from("profiles")
      .update({ dossier_id: opts.dossierId, nom })
      .eq("id", deja.id);
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });
  if (linkError) throw new Error("Impossible de régénérer le lien : " + linkError.message);

  const hashed =
    (linkData as { properties?: { hashed_token?: string }; hashed_token?: string })
      .properties?.hashed_token ||
    (linkData as { hashed_token?: string }).hashed_token;

  const lien = hashed
    ? `${appUrl}/definir-mot-de-passe?token_hash=${encodeURIComponent(hashed)}&type=magiclink`
    : (linkData as { properties?: { action_link?: string } }).properties?.action_link ||
      (linkData as { action_link?: string }).action_link;

  if (!lien) throw new Error("Lien d'activation introuvable.");
  if (lien.includes("localhost") || lien.includes("persons-tony-games-apr")) {
    throw new Error(
      `URL d'activation incorrecte. Vérifiez NEXT_PUBLIC_APP_URL (actuel: ${appUrl}).`
    );
  }

  const envoye = await envoyerEmail({
    to: [{ email, name: nom }],
    subject: "Activez votre accès client : ETIK Paie",
    html: gabaritEmail(
      "Activez votre compte",
      `Bonjour,<br/><br/>Voici un nouveau lien pour définir votre mot de passe et activer l'accès au dossier <strong>${nom}</strong>.` +
        `<br/><br/><a href="${lien}" style="${styleBoutonEmail()}">Définir mon mot de passe</a>` +
        `<p style="font-size:12px;color:#666;word-break:break-all;margin-top:16px">${lien}</p>`
    ),
  });
  if (!envoye) {
    throw new Error(
      "Lien généré mais email non envoyé (Brevo). Vérifiez BREVO_API_KEY / EMAIL_FROM."
    );
  }

  await journaliser({
    userId: opts.actorUserId,
    action: "reinvitation_client",
    cibleType: "user",
    cibleId: deja.id,
    dossierId: opts.dossierId,
    details: { email, mode: "magiclink" },
  });

  return { ok: true, mode: "reinvitation", userId: deja.id };
}
