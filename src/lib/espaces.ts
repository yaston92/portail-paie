import { createAdminClient } from "@/lib/supabase/admin";

export type EspaceLien = {
  kind: "cabinet" | "client" | "salarie";
  dossierId: string | null;
  salarieId: string | null;
  label: string;
  href: string;
};

type ProfilMin = {
  id: string;
  role: string;
  dossier_id: string | null;
  dossier_client_id?: string | null;
  salarie_id: string | null;
};

/** Espaces que ce compte peut ouvrir (sociétés salariées, espace client, cabinet). */
export async function listerEspaces(profile: ProfilMin): Promise<EspaceLien[]> {
  const admin = createAdminClient();
  const liens: EspaceLien[] = [];

  if (profile.role === "directeur" || profile.role === "admin_cabinet" || profile.role === "collaborateur") {
    liens.push({
      kind: "cabinet",
      dossierId: null,
      salarieId: null,
      label: "Espace cabinet",
      href: "/espace/cabinet",
    });
  }

  const dossierIds = new Set<string>();
  if (profile.role === "client" && profile.dossier_id) dossierIds.add(profile.dossier_id);
  if (profile.dossier_client_id) dossierIds.add(profile.dossier_client_id);

  const { data: extras, error } = await admin
    .from("profil_espaces")
    .select("kind, dossier_id, salarie_id")
    .eq("profile_id", profile.id);

  if (error) return liens;

  const salarieIds: string[] = [];
  for (const e of extras ?? []) {
    if (e.dossier_id) dossierIds.add(e.dossier_id as string);
    if (e.kind === "salarie" && e.salarie_id) salarieIds.push(e.salarie_id as string);
  }
  if (profile.role === "salarie" && profile.salarie_id) salarieIds.push(profile.salarie_id);

  const [{ data: dossiers }, { data: salaries }] = await Promise.all([
    dossierIds.size
      ? admin.from("dossiers").select("id, sigle, raison_sociale").in("id", [...dossierIds])
      : Promise.resolve({ data: [] as { id: string; sigle: string; raison_sociale: string }[] }),
    salarieIds.length
      ? admin.from("salaries").select("id, nom, prenom, dossier_id").in("id", salarieIds)
      : Promise.resolve({ data: [] as { id: string; nom: string; prenom: string; dossier_id: string }[] }),
  ]);

  const nomDossier = new Map(
    (dossiers ?? []).map((d) => [d.id, d.raison_sociale || d.sigle])
  );

  const clientsVus = new Set<string>();
  function ajouterClient(dossierId: string) {
    if (clientsVus.has(dossierId)) return;
    clientsVus.add(dossierId);
    liens.push({
      kind: "client",
      dossierId,
      salarieId: null,
      label: `Espace client : ${nomDossier.get(dossierId) ?? "dossier"}`,
      href: `/espace/client?dossier=${dossierId}`,
    });
  }

  if (profile.role === "client" && profile.dossier_id) ajouterClient(profile.dossier_id);
  if (profile.dossier_client_id) ajouterClient(profile.dossier_client_id);

  const salariesVus = new Set<string>();
  function ajouterSalarie(salarieId: string, dossierId: string, nom: string) {
    if (salariesVus.has(salarieId)) return;
    salariesVus.add(salarieId);
    liens.push({
      kind: "salarie",
      dossierId,
      salarieId,
      label: `Espace salarié : ${nom}`,
      href: `/espace/salarie?id=${salarieId}`,
    });
  }

  if (profile.role === "salarie" && profile.salarie_id && profile.dossier_id) {
    const s = (salaries ?? []).find((x) => x.id === profile.salarie_id);
    const nom = s ? `${s.prenom} ${s.nom}`.trim() : "Salarié";
    const societe = nomDossier.get(profile.dossier_id);
    ajouterSalarie(
      profile.salarie_id,
      profile.dossier_id,
      societe ? `${nom} (${societe})` : nom
    );
  }

  for (const e of extras ?? []) {
    if (e.kind === "client" && e.dossier_id) ajouterClient(e.dossier_id as string);
    if (e.kind === "salarie" && e.salarie_id && e.dossier_id) {
      const s = (salaries ?? []).find((x) => x.id === e.salarie_id);
      const nom = s ? `${s.prenom} ${s.nom}`.trim() : "Salarié";
      const societe = nomDossier.get(e.dossier_id as string);
      ajouterSalarie(
        e.salarie_id as string,
        e.dossier_id as string,
        societe ? `${nom} (${societe})` : nom
      );
    }
  }

  return liens;
}

/** Ajoute un accès salarié sans remplacer le rôle ni le mot de passe déjà en place. */
export async function ajouterEspaceSalarie(opts: {
  profileId: string;
  salarieId: string;
  dossierId: string;
}): Promise<void> {
  const admin = createAdminClient();
  const { data: deja } = await admin
    .from("profil_espaces")
    .select("id")
    .eq("profile_id", opts.profileId)
    .eq("salarie_id", opts.salarieId)
    .maybeSingle();
  if (!deja) {
    const { error } = await admin.from("profil_espaces").insert({
      profile_id: opts.profileId,
      kind: "salarie",
      dossier_id: opts.dossierId,
      salarie_id: opts.salarieId,
    });
    if (error) {
      throw new Error(
        "Impossible d'ajouter cet espace salarié. Exécutez la migration 0023 dans l'éditeur SQL."
      );
    }
  }
  await admin
    .from("salaries")
    .update({ profile_id: opts.profileId })
    .eq("id", opts.salarieId);
}

/** Ajoute un espace client sur un compte qui existe déjà. */
export async function ajouterEspaceClient(opts: {
  profileId: string;
  dossierId: string;
}): Promise<void> {
  const admin = createAdminClient();
  const { data: profil } = await admin
    .from("profiles")
    .select("role, dossier_id, dossier_client_id")
    .eq("id", opts.profileId)
    .maybeSingle();
  if (!profil) throw new Error("Compte introuvable.");

  const dejaClientIci =
    profil.role === "client" && profil.dossier_id === opts.dossierId;
  if (!dejaClientIci) {
    if (!profil.dossier_client_id && profil.role !== "client") {
      const { error } = await admin
        .from("profiles")
        .update({ dossier_client_id: opts.dossierId })
        .eq("id", opts.profileId);
      if (error) {
        throw new Error(
          "Impossible d'ajouter l'espace client. Exécutez la migration 0023 dans l'éditeur SQL."
        );
      }
    }
    const { data: deja } = await admin
      .from("profil_espaces")
      .select("id")
      .eq("profile_id", opts.profileId)
      .eq("kind", "client")
      .eq("dossier_id", opts.dossierId)
      .maybeSingle();
    if (!deja) {
      const { error } = await admin.from("profil_espaces").insert({
        profile_id: opts.profileId,
        kind: "client",
        dossier_id: opts.dossierId,
      });
      if (error) {
        throw new Error(
          "Impossible d'ajouter l'espace client. Exécutez la migration 0023 dans l'éditeur SQL."
        );
      }
    }
  }
}
