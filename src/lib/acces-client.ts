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
  doit_changer_mot_de_passe: boolean;
}

export async function getAccesClientDossier(dossierId: string): Promise<AccesClientInfo> {
  const admin = createAdminClient();
  const [{ data: dossier }, { data: clients }, { data: lie }] = await Promise.all([
    admin.from("dossiers").select("email").eq("id", dossierId).maybeSingle(),
    admin
      .from("profiles")
      .select("id, email, created_at, doit_changer_mot_de_passe")
      .eq("dossier_id", dossierId)
      .eq("role", "client")
      .order("created_at", { ascending: false })
      .limit(5),
    admin
      .from("profiles")
      .select("id, email")
      .eq("dossier_client_id", dossierId)
      .limit(1)
      .maybeSingle(),
  ]);

  if (!clients?.length) {
    if (lie?.email) {
      return {
        statut: "actif",
        email: lie.email,
        profile_id: lie.id,
        invited_at: null,
        last_sign_in_at: null,
        doit_changer_mot_de_passe: false,
      };
    }
    return {
      statut: "aucun",
      email: dossier?.email ?? null,
      profile_id: null,
      invited_at: null,
      last_sign_in_at: null,
      doit_changer_mot_de_passe: false,
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
        doit_changer_mot_de_passe: Boolean(
          (c as { doit_changer_mot_de_passe?: boolean }).doit_changer_mot_de_passe
        ),
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
    doit_changer_mot_de_passe: Boolean(
      (premier.client as { doit_changer_mot_de_passe?: boolean }).doit_changer_mot_de_passe
    ),
  };
}

function messageBienvenueClient(nom: string, appUrl: string, renouvellement: boolean): string {
  const intro = renouvellement
    ? `Votre cabinet a défini un nouveau mot de passe provisoire pour le dossier ${nom}.`
    : `Votre cabinet a ouvert votre accès au dossier ${nom}.`;
  return (
    `${intro} Connectez-vous sur ${appUrl}/login avec votre adresse email et le mot de passe communiqué par téléphone ou de vive voix. ` +
    `À la première connexion, choisissez un nouveau mot de passe. Ce message ne contient pas le mot de passe.`
  );
}

/**
 * Crée ou met à jour l'accès client avec un mot de passe provisoire
 * choisi par le cabinet. Le client le change à la première connexion.
 * L'email ne contient pas de lien secret (souvent classé en indésirables).
 */
export async function inviterOuReinviterClient(opts: {
  dossierId: string;
  email: string;
  password: string;
  actorUserId: string;
}): Promise<{
  ok: true;
  mode: "invite" | "reinvitation";
  userId?: string;
  emailEnvoye: boolean;
  compteLie?: boolean;
  message?: string;
}> {
  const email = opts.email.trim().toLowerCase();
  const password = opts.password;
  if (password.length < 8) {
    throw new Error("Le mot de passe provisoire doit contenir au moins 8 caractères.");
  }

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
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
    /\/$/,
    ""
  );

  const { data: existants } = await admin
    .from("profiles")
    .select("id, email, role, dossier_id")
    .ilike("email", email)
    .limit(5);

  const deja = existants?.find((p) => p.email?.toLowerCase() === email) ?? existants?.[0];

  if (deja && deja.role === "client" && deja.dossier_id && deja.dossier_id !== opts.dossierId) {
    throw new Error("Cet email est déjà rattaché à un autre dossier client.");
  }
  if (
    deja &&
    (deja.role === "directeur" ||
      deja.role === "admin_cabinet" ||
      deja.role === "collaborateur")
  ) {
    const { error } = await admin
      .from("profiles")
      .update({ dossier_client_id: opts.dossierId })
      .eq("id", deja.id);
    if (error) {
      throw new Error(
        "Impossible d'ajouter l'espace client sur ce compte. Exécutez la migration 0019 dans Supabase."
      );
    }
    const envoyeLie = await envoyerEmail({
      to: [{ email, name: nom }],
      subject: "Votre espace client ETIK Paie",
      html: gabaritEmail(
        "Espace client ajouté",
        `Bonjour,<br/><br/>Le dossier <strong>${nom}</strong> est maintenant ouvert sur votre compte ETIK Paie.` +
          ` Connectez-vous avec votre mot de passe habituel, puis choisissez « Espace client ».` +
          ` Le mot de passe saisi par le cabinet n'a pas remplacé le vôtre.` +
          `<br/><br/><a href="${appUrl}/login" style="${styleBoutonEmail()}">Ouvrir ETIK Paie</a>`
      ),
    });
    await journaliser({
      userId: opts.actorUserId,
      action: "invitation_client",
      cibleType: "user",
      cibleId: deja.id,
      dossierId: opts.dossierId,
      details: { email, mode: "compte_cabinet_lie", emailEnvoye: envoyeLie },
    });
    return {
      ok: true,
      mode: "reinvitation",
      userId: deja.id,
      emailEnvoye: envoyeLie,
      compteLie: true,
      message:
        "Cet email est déjà un compte collaborateur ou administrateur. L'espace client a été ajouté à ce compte : la personne se connecte avec son mot de passe habituel, puis choisit « Espace client ». Le mot de passe saisi ici n'a pas été appliqué.",
    };
  }
  if (deja && deja.role !== "client") {
    throw new Error("Cet email correspond à un compte non-client.");
  }

  let userId = deja?.id;
  let mode: "invite" | "reinvitation" = deja ? "reinvitation" : "invite";

  if (!deja) {
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: "client",
        nom,
        prenom: "Client",
        dossier_id: opts.dossierId,
        salarie_id: "",
      },
    });
    if (error || !created.user) {
      throw new Error("Échec de la création du compte : " + (error?.message ?? ""));
    }
    userId = created.user.id;
    mode = "invite";
  } else {
    const { error } = await admin.auth.admin.updateUserById(deja.id, {
      password,
      email_confirm: true,
    });
    if (error) throw new Error("Impossible de définir le mot de passe : " + error.message);
    if (!deja.dossier_id) {
      await admin.from("profiles").update({ dossier_id: opts.dossierId, nom }).eq("id", deja.id);
    }
    userId = deja.id;
    mode = "reinvitation";
  }

  if (userId) {
    await admin
      .from("profiles")
      .update({ doit_changer_mot_de_passe: true, dossier_id: opts.dossierId })
      .eq("id", userId);
  }

  const envoye = await envoyerEmail({
    to: [{ email, name: nom }],
    subject: `Accès au dossier ${nom}`,
    text: messageBienvenueClient(nom, appUrl, mode === "reinvitation"),
    html: gabaritEmail(
      "Votre accès est prêt",
      messageBienvenueClient(nom, appUrl, mode === "reinvitation").replace(/\n/g, "<br/>")
    ),
  });

  await journaliser({
    userId: opts.actorUserId,
    action: mode === "invite" ? "invitation_client" : "reinvitation_client",
    cibleType: "user",
    cibleId: userId,
    dossierId: opts.dossierId,
    details: { email, mode, via: "mot_de_passe_provisoire", emailEnvoye: envoye },
  });

  return { ok: true, mode, userId, emailEnvoye: envoye };
}
