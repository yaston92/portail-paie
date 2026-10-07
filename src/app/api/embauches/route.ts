import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getApiProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { journaliser } from "@/lib/audit";
import { destinatairesCabinet, notifier } from "@/lib/notify";
import { nirValide } from "@/lib/format";
import {
  contentTypePourExtension,
  extensionFichier,
  uploaderFichier,
} from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Déclaration d'embauche par le client (multipart).
 * Sans la case accompagnement : pièce d'identité recto ET verso, et tous les champs du contrat.
 * Avec la case : nom et prénom suffisent ; le reste et les pièces restent possibles.
 * Carte vitale et n° de sécurité sociale sont toujours optionnels.
 */
export async function POST(request: Request) {
  const profile = await getApiProfile(["client"]);
  if (!profile?.dossier_id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }
  const dossierId = profile.dossier_id;

  let form: FormData;
  try {
    form = await request.formData();
  } catch (e) {
    console.error("[embauches] formData", e);
    return NextResponse.json(
      {
        error:
          "Envoi trop volumineux ou fichier corrompu. Compressez les PDF/photos (max ~15 Mo au total) et réessayez.",
      },
      { status: 413 }
    );
  }
  const champ = (n: string) => ((form.get(n) as string) ?? "").trim();
  const fichier = (n: string) => {
    const f = form.get(n);
    if (f instanceof File && f.size > 0) return f;
    // Certains clients envoient un Blob nommé
    if (typeof Blob !== "undefined" && f instanceof Blob && f.size > 0) {
      const name =
        typeof File !== "undefined" && f instanceof File
          ? f.name
          : `${n}.bin`;
      return new File([f], name, { type: f.type || "application/octet-stream" });
    }
    return null;
  };

  const embaucheId = champ("embauche_id") || null;
  const admin = createAdminClient();

  // Re-soumission : l'embauche doit appartenir au dossier et être "retournée"
  let existante: {
    piece_identite_recto_chemin: string | null;
    piece_identite_verso_chemin: string | null;
    carte_vitale_chemin: string | null;
    nir: string | null;
  } | null = null;
  if (embaucheId) {
    const { data } = await admin
      .from("embauches")
      .select("piece_identite_recto_chemin, piece_identite_verso_chemin, carte_vitale_chemin, nir, dossier_id, statut")
      .eq("id", embaucheId)
      .eq("dossier_id", dossierId)
      .eq("statut", "retourne")
      .maybeSingle();
    if (!data) {
      return NextResponse.json({ error: "Embauche introuvable" }, { status: 404 });
    }
    existante = data;
  }

  // --- Validation stricte : tout champ manquant bloque l'envoi ---
  const manquants: string[] = [];
  const nom = champ("nom");
  const prenom = champ("prenom");
  const dateDebut = champ("date_debut");
  const typeContrat = champ("type_contrat");
  const cddDuree = champ("cdd_duree");
  const dureeHebdo = parseFloat(champ("duree_hebdo").replace(",", "."));
  const salaireMinimum = champ("salaire_minimum") === "true";
  const salaireBrut = champ("salaire").replace(",", ".");
  const salaire = salaireBrut === "" ? NaN : parseFloat(salaireBrut);
  const salaireTypeChamp = champ("salaire_type");
  const salaireType =
    salaireTypeChamp === "net" || salaireTypeChamp === "brut" ? salaireTypeChamp : null;
  const poste = champ("poste");
  const accompagnement = champ("accompagnement") === "true";
  const nir = champ("nir").replace(/[\s.]/g, "");
  const recto = fichier("piece_identite_recto");
  const verso = fichier("piece_identite_verso");
  const carteVitale = fichier("carte_vitale");
  const contratConnu = typeContrat === "cdi" || typeContrat === "cdd";

  if (!nom) manquants.push("Nom");
  if (!prenom) manquants.push("Prénom");
  if (!accompagnement) {
    if (!dateDebut) manquants.push("Date de début de contrat");
    if (!contratConnu) manquants.push("Type de contrat");
    if (typeContrat === "cdd" && !cddDuree) manquants.push("Date de fin du CDD");
    if (!Number.isFinite(dureeHebdo) || dureeHebdo <= 0)
      manquants.push("Durée hebdomadaire de travail");
    if (!salaireMinimum && (!Number.isFinite(salaire) || salaire <= 0))
      manquants.push("Salaire (ou cochez « salaire minimum »)");
    if (!salaireMinimum && Number.isFinite(salaire) && salaire > 0 && !salaireType)
      manquants.push("Précisez si le salaire est en brut ou en net");
    if (!poste) manquants.push("Poste occupé");
    if (!recto && !existante?.piece_identite_recto_chemin)
      manquants.push("Pièce d'identité : recto");
    if (!verso && !existante?.piece_identite_verso_chemin)
      manquants.push("Pièce d'identité : verso");
  }
  if (
    typeContrat === "cdd" &&
    cddDuree &&
    dateDebut &&
    /^\d{4}-\d{2}-\d{2}$/.test(cddDuree) &&
    cddDuree < dateDebut
  ) {
    manquants.push("Date de fin du CDD (doit être ≥ date de début)");
  }
  if (salaireBrut && (!Number.isFinite(salaire) || salaire < 0))
    manquants.push("Salaire invalide");
  if (nir && !nirValide(nir))
    manquants.push("N° de sécurité sociale invalide (13 ou 15 chiffres)");

  if (manquants.length > 0) {
    return NextResponse.json(
      { error: "Envoi impossible, éléments manquants :", manquants },
      { status: 400 }
    );
  }

  // --- Upload des pièces ---
  const idEmbauche = embaucheId ?? randomUUID();
  async function deposer(f: File, type: string): Promise<string> {
    const ext = extensionFichier(f.name || type, f.type);
    const chemin = `embauches/${dossierId}/${idEmbauche}/${type}-${randomUUID()}.${ext}`;
    await uploaderFichier(
      "documents",
      chemin,
      Buffer.from(await f.arrayBuffer()),
      contentTypePourExtension(ext)
    );
    return chemin;
  }

  let rectoChemin: string | null;
  let versoChemin: string | null;
  let carteVitaleChemin: string | null;
  try {
    rectoChemin = recto
      ? await deposer(recto, "recto")
      : (existante?.piece_identite_recto_chemin ?? null);
    versoChemin = verso
      ? await deposer(verso, "verso")
      : (existante?.piece_identite_verso_chemin ?? null);
    carteVitaleChemin = carteVitale
      ? await deposer(carteVitale, "carte-vitale")
      : (existante?.carte_vitale_chemin ?? null);
  } catch (e) {
    console.error("[embauches] upload", e);
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Échec du dépôt des pièces. Réessayez avec des PDF ou photos plus légers.",
      },
      { status: 400 }
    );
  }

  const valeurs = {
    dossier_id: dossierId,
    statut: "envoye" as const,
    nom: nom.toUpperCase(),
    prenom,
    nir: nir || existante?.nir || null,
    carte_vitale_chemin: carteVitaleChemin,
    piece_identite_recto_chemin: rectoChemin,
    piece_identite_verso_chemin: versoChemin,
    date_debut: dateDebut || null,
    type_contrat: contratConnu ? typeContrat : null,
    cdd_duree: typeContrat === "cdd" ? cddDuree || null : null,
    duree_hebdo: Number.isFinite(dureeHebdo) && dureeHebdo > 0 ? dureeHebdo : null,
    salaire: salaireMinimum || !Number.isFinite(salaire) ? null : salaire,
    salaire_type: salaireMinimum ? null : salaireType,
    salaire_minimum: salaireMinimum,
    accompagnement,
    poste: poste || null,
    note: champ("note") || null,
    commentaire_retour: null,
    created_by: profile.id,
    updated_at: new Date().toISOString(),
  };

  let idFinal = idEmbauche;
  if (embaucheId) {
    const { error } = await admin.from("embauches").update(valeurs).eq("id", embaucheId);
    if (error) {
      return NextResponse.json({ error: "Échec de l'envoi." }, { status: 500 });
    }
  } else {
    const { data, error } = await admin
      .from("embauches")
      .insert({ id: idEmbauche, ...valeurs })
      .select("id")
      .single();
    if (error || !data) {
      return NextResponse.json({ error: "Échec de l'envoi." }, { status: 500 });
    }
    idFinal = data.id;
  }

  await journaliser({
    userId: profile.id,
    action: embaucheId ? "embauche_resoumise" : "embauche_envoyee",
    cibleType: "embauche",
    cibleId: idFinal,
    dossierId,
  });

  const { data: dossier } = await admin
    .from("dossiers")
    .select("sigle")
    .eq("id", dossierId)
    .single();
  const detailPoste = poste || "poste non précisé";
  const detailDate = dateDebut ? `, à compter du ${dateDebut}` : "";
  const detailRappel = accompagnement
    ? " Rappel souhaité : le client veut être accompagné."
    : "";
  await notifier({
    userIds: await destinatairesCabinet(dossierId),
    titre: accompagnement
      ? `Embauche à valider, rappel souhaité : ${dossier?.sigle ?? ""}`
      : `Nouvelle embauche à valider : ${dossier?.sigle ?? ""}`,
    corps: `${nom.toUpperCase()} ${prenom}, ${detailPoste}${detailDate}.${detailRappel}`,
    lien: `/cabinet/embauches/${idFinal}`,
  });

  return NextResponse.json({ ok: true, id: idFinal });
}
