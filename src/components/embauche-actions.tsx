"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Label, Textarea } from "@/components/ui";
import { toastError, toastSuccess } from "@/lib/toast";

/** Actions du collaborateur sur une embauche : valider ou retourner. */
export function EmbaucheActions({ embaucheId }: { embaucheId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "retour">("idle");
  const [commentaire, setCommentaire] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function valider() {
    setErreur(null);
    setEnvoi(true);
    const res = await fetch(`/api/embauches/${embaucheId}/valider`, {
      method: "POST",
    });
    const json = await res.json();
    if (!res.ok) {
      setErreur(json.error ?? "Échec de la validation.");
      toastError(json.error ?? "Échec de la validation.");
      setEnvoi(false);
      return;
    }
    toastSuccess("Embauche validée : fiche créée");
    router.push(`/cabinet/salaries/${json.salarie_id}`);
    router.refresh();
  }

  async function retourner(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    const res = await fetch(`/api/embauches/${embaucheId}/retourner`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ commentaire }),
    });
    const json = await res.json();
    setEnvoi(false);
    if (!res.ok) {
      setErreur(json.error ?? "Échec du retour.");
      toastError(json.error ?? "Échec du retour.");
      return;
    }
    toastSuccess("Embauche retournée au client");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {erreur && <Alert variant="error">{erreur}</Alert>}
      {mode === "idle" ? (
        <div className="flex gap-3">
          <Button onClick={valider} disabled={envoi}>
            {envoi ? "Validation…" : "Valider et créer la fiche salarié"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => setMode("retour")}
            disabled={envoi}
          >
            Retourner pour complément
          </Button>
        </div>
      ) : (
        <form onSubmit={retourner} className="space-y-3">
          <div>
            <Label>Motif du retour (visible par le client) *</Label>
            <Textarea
              required
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              placeholder="ex : la pièce d'identité verso est illisible, merci de la redéposer."
            />
          </div>
          <div className="flex gap-3">
            <Button type="submit" variant="danger" disabled={envoi}>
              {envoi ? "Envoi…" : "Retourner au client"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setMode("idle")}
            >
              Annuler
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
