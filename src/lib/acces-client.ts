import { createAdminClient } from "@/lib/supabase/admin";
import { envoyerEmail, gabaritEmail, styleBoutonEmail } from "@/lib/email";
import { hrefEmail } from "@/lib/lien-activation";
import { ajouterEspaceClient } from "@/lib/espaces";
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

  const choisi =
    clients.find((c) => !c.doit_changer_mot_de_passe) ?? clients[0]!;
  const doitChanger = Boolean(choisi.doit_changer_mot_de_passe);
  return {
    statut: doitChanger ? "invitation_en_attente" : "actif",
    email: choisi.email || dossier?.email || null,
    profile_id: choisi.id,
    invited_at: null,
    last_sign_in_at: null,
    doit_changer_mot_de_passe: doitChanger,
  };
}

function messageBienvenueClient(nom: string, renouvellement: boolean): string {
  const intro = renouvellement
    ? `Votre cabinet a défini un nouveau mot de passe provisoire pour le dossier <strong>${nom}</strong>.`
    : `Votre cabinet a ouvert votre accès au dossier <strong>${nom}</strong>.`;
  return (
    `${intro}<br/><br/>` +
    `Connectez-vous avec votre adresse email et le mot de passe communiqué par téléphone ou de vive voix. ` +
    `À la première connexion, choisissez un nouveau mot de passe. Ce message ne contient pas le mot de passe.`
  );
}

function boutonsAcces(appUrl: string): string {
  const web = `${appUrl}/login`;
  const app = "etikpaie://login";
  return (
    `<br/><br/><a href="${hrefEmail(web)}" style="${styleBoutonEmail()}">Ouvrir dans le navigateur</a>` +
    `<br/><br/><a href="${hrefEmail(app)}" style="${styleBoutonEmail()}">Ouvrir l'application</a>` +
    `<br/><span style="font-size:12px;color:#666;word-break:break-all">${hrefEmail(web)}</span>`
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

  if (deja && !(deja.role === "client" && deja.dossier_id === opts.dossierId)) {
    if (deja.role === "client" && deja.dossier_id && deja.dossier_id !== opts.dossierId) {
      await ajouterEspaceClient({ profileId: deja.id, dossierId: opts.dossierId });
    } else if (deja.role !== "client") {
      await ajouterEspaceClient({ profileId: deja.id, dossierId: opts.dossierId });
    }
    if (deja.role !== "client" || (deja.dossier_id && deja.dossier_id !== opts.dossierId)) {
      const envoyeLie = await envoyerEmail({
        to: [{ email, name: nom }],
        subject: "Votre espace client ETIK Paie",
        html: gabaritEmail(
          "Espace client ajouté",
          `Bonjour,<br/><br/>Le dossier <strong>${nom}</strong> est maintenant ouvert sur votre compte ETIK Paie. ` +
            `Connectez-vous avec votre mot de passe habituel, puis choisissez l'espace client. ` +
            `Le mot de passe saisi par le cabinet n'a pas remplacé le vôtre.` +
            boutonsAcces(appUrl)
        ),
      });
      await journaliser({
        userId: opts.actorUserId,
        action: "invitation_client",
        cibleType: "user",
        cibleId: deja.id,
        dossierId: opts.dossierId,
        details: { email, mode: "espace_ajoute", emailEnvoye: envoyeLie },
      });
      return {
        ok: true,
        mode: "reinvitation",
        userId: deja.id,
        emailEnvoye: envoyeLie,
        compteLie: true,
        message:
          "Cet email a déjà un compte. L'espace client a été ajouté : la personne se connecte avec son mot de passe habituel, puis choisit l'espace client.",
      };
    }
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
    html: gabaritEmail(
      "Votre accès est prêt",
      messageBienvenueClient(nom, mode === "reinvitation") + boutonsAcces(appUrl)
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
