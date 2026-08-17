"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Alert, Button, Input, Label, Select } from "@/components/ui";
import { MOTIFS_SORTIE } from "@/lib/sortie";
import { toastError, toastSuccess } from "@/lib/toast";

// ---------- Ajout manuel d'un salarié (cabinet) ----------

export function AjoutSalarieForm({ dossierId }: { dossierId: string }) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [typeContrat, setTypeContrat] = useState("");
  const [formKey, setFormKey] = useState(0);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErreur(null);
    setSucces(null);
    setEnvoi(true);
    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const res = await fetch("/api/salaries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, dossier_id: dossierId }),
    });
    const json = await res.json();
    setEnvoi(false);
    if (!res.ok) {
      setErreur(json.error ?? "Échec de la création.");
      toastError(json.error ?? "Échec de la création.");
      return;
    }
    const ok =
      "Salarié créé : il est déjà visible dans l'espace client. Vous pouvez en ajouter un autre.";
    setSucces(ok);
    toastSuccess("Salarié créé : visible côté client");
    setTypeContrat("");
    setFormKey((k) => k + 1);
    router.refresh();
  }

  return (
    <form key={formKey} onSubmit={handleSubmit} className="space-y-3">
      {erreur && <Alert variant="error">{erreur}</Alert>}
      {succes && <Alert variant="success">{succes}</Alert>}
      <p className="text-sm text-gray-600">
        Création manuelle par le cabinet : le salarié apparaît immédiatement chez
        le client, sans passer par une déclaration d&apos;embauche.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <Label>Nom *</Label>
          <Input name="nom" required autoComplete="off" />
        </div>
        <div>
          <Label>Prénom *</Label>
          <Input name="prenom" required autoComplete="off" />
        </div>
        <div>
          <Label>Matricule (paie)</Label>
          <Input name="matricule" autoComplete="off" />
        </div>
        <div>
          <Label>Email</Label>
          <Input name="email" type="email" autoComplete="off" />
        </div>
        <div>
          <Label>N° de sécurité sociale</Label>
          <Input
            name="nir"
            inputMode="numeric"
            placeholder="13 ou 15 chiffres"
            autoComplete="off"
          />
        </div>
        <div>
          <Label>Date d&apos;entrée</Label>
          <Input name="date_entree" type="date" />
        </div>
        <div>
          <Label>Type de contrat</Label>
          <Select
            name="type_contrat"
            value={typeContrat}
            onChange={(e) => setTypeContrat(e.target.value)}
          >
            <option value="">-</option>
            <option value="cdi">CDI</option>
            <option value="cdd">CDD</option>
          </Select>
        </div>
        {typeContrat === "cdd" && (
          <div>
            <Label>Date de fin</Label>
            <Input name="cdd_duree" type="date" />
          </div>
        )}
        <div>
          <Label>Durée hebdomadaire (h)</Label>
          <Input name="duree_hebdo" type="number" step="0.5" min="1" />
        </div>
        <div>
          <Label>Poste</Label>
          <Input name="poste" />
        </div>
      </div>
      <Button type="submit" disabled={envoi}>
        {envoi ? "Création…" : "Créer le salarié"}
      </Button>
    </form>
  );
}

// ---------- Modification d'un salarié (cabinet) ----------

export function ModifierSalarieForm({ salarie }: { salarie: {
  id: string;
  nom: string;
  prenom: string;
  matricule: string | null;
  email: string | null;
  date_entree: string | null;
  type_contrat: "cdi" | "cdd" | null;
  cdd_duree: string | null;
  duree_hebdo: number | null;
  poste: string | null;
  opposition_bulletin: boolean;
} }) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [typeContrat, setTypeContrat] = useState(salarie.type_contrat ?? "");
  const [opposition, setOpposition] = useState(salarie.opposition_bulletin);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErreur(null);
    setSucces(null);
    setEnvoi(true);
    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const res = await fetch(`/api/salaries/${salarie.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...payload,
        opposition_bulletin: opposition,
      }),
    });
    const json = await res.json();
    setEnvoi(false);
    if (!res.ok) {
      setErreur(json.error ?? "Échec de la modification.");
      toastError(json.error ?? "Échec de la modification.");
      return;
    }
    setSucces("Fiche salarié mise à jour.");
    toastSuccess("Fiche salarié mise à jour");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {erreur && <Alert variant="error">{erreur}</Alert>}
      {succes && <Alert variant="success">{succes}</Alert>}
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <Label>Nom *</Label>
          <Input name="nom" required defaultValue={salarie.nom} />
        </div>
        <div>
          <Label>Prénom *</Label>
          <Input name="prenom" required defaultValue={salarie.prenom} />
        </div>
        <div>
          <Label>Matricule (paie)</Label>
          <Input name="matricule" defaultValue={salarie.matricule ?? ""} />
        </div>
        <div>
          <Label>Email</Label>
          <Input name="email" type="email" defaultValue={salarie.email ?? ""} />
        </div>
        <div>
          <Label>N° de sécurité sociale (laisser vide pour ne pas changer)</Label>
          <Input name="nir" inputMode="numeric" placeholder="13 ou 15 chiffres" />
        </div>
        <div>
          <Label>Date d&apos;entrée</Label>
          <Input
            name="date_entree"
            type="date"
            defaultValue={salarie.date_entree ?? ""}
          />
        </div>
        <div>
          <Label>Type de contrat</Label>
          <Select
            name="type_contrat"
            value={typeContrat}
            onChange={(e) => setTypeContrat(e.target.value)}
          >
            <option value="">-</option>
            <option value="cdi">CDI</option>
            <option value="cdd">CDD</option>
          </Select>
        </div>
        {typeContrat === "cdd" && (
          <div>
            <Label>Date de fin</Label>
            <Input
              name="cdd_duree"
              type="date"
              defaultValue={
                salarie.cdd_duree && /^\d{4}-\d{2}-\d{2}$/.test(salarie.cdd_duree)
                  ? salarie.cdd_duree
                  : ""
              }
            />
          </div>
        )}
        <div>
          <Label>Durée hebdomadaire (h)</Label>
          <Input
            name="duree_hebdo"
            type="number"
            step="0.5"
            min="1"
            defaultValue={salarie.duree_hebdo ?? ""}
          />
        </div>
        <div>
          <Label>Poste</Label>
          <Input name="poste" defaultValue={salarie.poste ?? ""} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={opposition}
          onChange={(e) => setOpposition(e.target.checked)}
        />
        Opposition au bulletin dématérialisé
      </label>
      <Button type="submit" disabled={envoi}>
        {envoi ? "Enregistrement…" : "Enregistrer les modifications"}
      </Button>
    </form>
  );
}

// ---------- Import Excel (cabinet) ----------

export function ImportExcelForm({ dossierId }: { dossierId: string }) {
  const router = useRouter();
  const [resultat, setResultat] = useState<{
    importes: number;
    erreurs: string[];
  } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErreur(null);
    setResultat(null);
    setEnvoi(true);
    const form = new FormData(e.currentTarget);
    form.set("dossier_id", dossierId);
    const res = await fetch("/api/salaries/import", {
      method: "POST",
      body: form,
    });
    const json = await res.json();
    setEnvoi(false);
    if (!res.ok) {
      setErreur(json.error ?? "Échec de l'import.");
      toastError(json.error ?? "Échec de l'import.");
      return;
    }
    setResultat(json);
    toastSuccess(
      `${json.importes} salarié(s) importé(s)${
        json.erreurs?.length ? ` : ${json.erreurs.length} erreur(s)` : ""
      }`
    );
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-xs text-gray-500">
        Format .xlsx : colonnes : Matricule, Nom, Prénom, Email, NIR, Date
        d&apos;entrée (AAAA-MM-JJ), Contrat (CDI/CDD), Durée hebdo, Poste.
        Ligne 1 = en-têtes.
      </p>
      {erreur && <Alert variant="error">{erreur}</Alert>}
      {resultat && (
        <Alert variant={resultat.erreurs.length > 0 ? "warning" : "success"}>
          {resultat.importes} salarié(s) importé(s).
          {resultat.erreurs.length > 0 && (
            <ul className="list-disc ml-5 mt-1">
              {resultat.erreurs.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}
      <Input name="fichier" type="file" accept=".xlsx" required />
      <Button type="submit" variant="secondary" disabled={envoi}>
        {envoi ? "Import en cours…" : "Importer"}
      </Button>
    </form>
  );
}

// ---------- Sortie d'un salarié (cabinet ou client) ----------

export function SortieSalarieForm({
  salarieId,
  variant = "cabinet",
  compact = false,
}: {
  salarieId: string;
  /** client : pas de documents obligatoires ; cabinet : documents requis */
  variant?: "cabinet" | "client";
  compact?: boolean;
}) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch(`/api/salaries/${salarieId}/sortie`, {
      method: "POST",
      body: form,
    });
    const json = await res.json();
    setEnvoi(false);
    if (!res.ok) {
      setErreur(json.error ?? "Échec de l'enregistrement de la sortie.");
      toastError(json.error ?? "Échec de l'enregistrement de la sortie.");
      return;
    }
    toastSuccess("Sortie enregistrée");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {erreur && <Alert variant="error">{erreur}</Alert>}
      <div>
        <Label>Motif de sortie *</Label>
        <Select name="motif_sortie" required defaultValue="">
          <option value="" disabled>
            - Choisir -
          </option>
          {MOTIFS_SORTIE.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Date de sortie *</Label>
        <Input name="date_sortie" type="date" required />
      </div>
      {variant === "cabinet" && (
        <div>
          <Label>Documents de fin de contrat *</Label>
          <Input
            name="documents"
            type="file"
            multiple
            required
            accept=".pdf,.jpg,.jpeg,.png"
          />
          <p className="text-xs text-gray-500 mt-1">
            Solde de tout compte, certificat de travail, attestation France
            Travail… Le salarié restera visible sur son mois de sortie puis
            passera en archive (il conserve l&apos;accès à ses bulletins).
          </p>
        </div>
      )}
      {variant === "client" && !compact && (
        <p className="text-xs text-gray-500">
          Le cabinet sera notifié. Le salarié reste visible sur le mois de
          sortie (solde de tout compte), puis passe en archive.
        </p>
      )}
      <Button type="submit" variant="danger" disabled={envoi}>
        {envoi ? "Enregistrement…" : "Enregistrer la sortie"}
      </Button>
    </form>
  );
}

// ---------- Consultation du NIR (cabinet, journalisée) ----------

export function NirReveal({ salarieId }: { salarieId: string }) {
  const [nir, setNir] = useState<string | null>(null);
  const [etat, setEtat] = useState<"idle" | "chargement" | "affiche" | "erreur">(
    "idle"
  );

  async function reveler() {
    setEtat("chargement");
    const res = await fetch(`/api/salaries/${salarieId}/nir`);
    if (!res.ok) {
      setEtat("erreur");
      return;
    }
    const json = await res.json();
    setNir(json.nir);
    setEtat("affiche");
  }

  if (etat === "affiche") {
    return (
      <span className="font-mono text-sm">
        {nir ?? "Non renseigné"}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={reveler}
      className="text-sm text-blue-700 hover:underline"
      disabled={etat === "chargement"}
    >
      {etat === "chargement"
        ? "Chargement…"
        : etat === "erreur"
          ? "Erreur : réessayer"
          : "Afficher (consultation journalisée)"}
    </button>
  );
}

// ---------- Solde CP manuel (cabinet) ----------

export function SoldeCpForm({
  salarieId,
  dossierId,
  acquis,
  pris,
  restant,
  acquisN1,
  acquisN,
  prisN1,
  prisN,
}: {
  salarieId: string;
  dossierId: string;
  acquis: number | null;
  pris: number | null;
  restant: number | null;
  acquisN1?: number | null;
  acquisN?: number | null;
  prisN1?: number | null;
  prisN?: number | null;
}) {
  const router = useRouter();
  const [etat, setEtat] = useState<"idle" | "envoi" | "erreur">("idle");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEtat("envoi");
    const form = new FormData(e.currentTarget);
    const aN1 = parseFloat(form.get("acquis_n1") as string);
    const aN = parseFloat(form.get("acquis_n") as string);
    const pN1 = parseFloat(form.get("pris_n1") as string);
    const pN = parseFloat(form.get("pris_n") as string);
    const acquisVal = parseFloat(form.get("acquis") as string);
    const prisVal = parseFloat(form.get("pris") as string);
    const restantVal = parseFloat(form.get("restant") as string);

    const acquis_n1 = Number.isFinite(aN1) ? aN1 : null;
    const acquis_n = Number.isFinite(aN) ? aN : null;
    const pris_n1 = Number.isFinite(pN1) ? pN1 : null;
    const pris_n = Number.isFinite(pN) ? pN : null;

    const supabase = createClient();
    const { error } = await supabase.from("soldes_cp").upsert({
      salarie_id: salarieId,
      dossier_id: dossierId,
      acquis:
        Number.isFinite(acquisVal)
          ? acquisVal
          : acquis_n1 != null && acquis_n != null
            ? acquis_n1 + acquis_n
            : null,
      pris:
        Number.isFinite(prisVal)
          ? prisVal
          : pris_n1 != null && pris_n != null
            ? pris_n1 + pris_n
            : null,
      restant: Number.isFinite(restantVal) ? restantVal : null,
      acquis_n1,
      acquis_n,
      pris_n1,
      pris_n,
      source: "manuel",
      updated_at: new Date().toISOString(),
    });
    if (error) {
      setEtat("erreur");
      toastError("Échec de l'enregistrement du solde.");
      return;
    }
    setEtat("idle");
    toastSuccess("Solde CP enregistré");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {etat === "erreur" && <Alert variant="error">Échec de l&apos;enregistrement.</Alert>}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label>Acquis N-1</Label>
          <Input name="acquis_n1" type="number" step="0.01" defaultValue={acquisN1 ?? ""} className="w-24" />
        </div>
        <div>
          <Label>Acquis N</Label>
          <Input name="acquis_n" type="number" step="0.01" defaultValue={acquisN ?? ""} className="w-24" />
        </div>
        <div>
          <Label>Pris N-1</Label>
          <Input name="pris_n1" type="number" step="0.01" defaultValue={prisN1 ?? ""} className="w-24" />
        </div>
        <div>
          <Label>Pris N</Label>
          <Input name="pris_n" type="number" step="0.01" defaultValue={prisN ?? ""} className="w-24" />
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label>Acquis (total)</Label>
          <Input name="acquis" type="number" step="0.01" defaultValue={acquis ?? ""} className="w-24" />
        </div>
        <div>
          <Label>Pris (total)</Label>
          <Input name="pris" type="number" step="0.01" defaultValue={pris ?? ""} className="w-24" />
        </div>
        <div>
          <Label>Solde</Label>
          <Input name="restant" type="number" step="0.01" defaultValue={restant ?? ""} className="w-24" />
        </div>
        <Button type="submit" variant="secondary" disabled={etat === "envoi"}>
          Enregistrer (manuel)
        </Button>
      </div>
    </form>
  );
}

// ---------- Suppression définitive (cabinet) ----------

export function SupprimerSalarieButton({
  salarieId,
  dossierId,
  nomComplet,
}: {
  salarieId: string;
  dossierId: string;
  nomComplet: string;
}) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function supprimer() {
    const ok = window.confirm(
      `Supprimer définitivement ${nomComplet} ?\n\nCette action est irréversible (fiche, documents et bulletins liés).`
    );
    if (!ok) return;
    setErreur(null);
    setEnvoi(true);
    const res = await fetch(`/api/salaries/${salarieId}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    setEnvoi(false);
    if (!res.ok) {
      setErreur((json as { error?: string }).error ?? "Échec de la suppression.");
      toastError((json as { error?: string }).error ?? "Échec de la suppression.");
      return;
    }
    toastSuccess("Salarié supprimé");
    router.push(`/cabinet/dossiers/${dossierId}`);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      {erreur && <Alert variant="error">{erreur}</Alert>}
      <p className="text-sm text-gray-600">
        Suppression définitive de la fiche. Pour une fin de contrat classique,
        utilisez plutôt « Sortie du salarié ».
      </p>
      <Button type="button" variant="danger" disabled={envoi} onClick={supprimer}>
        {envoi ? "Suppression…" : "Supprimer le salarié"}
      </Button>
    </div>
  );
}
