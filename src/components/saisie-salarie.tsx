"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Alert, Button, Input, Label, Textarea } from "@/components/ui";
import { CalendrierAbsences } from "@/components/calendrier-absences";
import { toastError, toastSuccess } from "@/lib/toast";
import type { Absence, SaisieMode, SaisieVariables } from "@/lib/types";

interface Props {
  saisie: SaisieVariables;
  absences: Absence[];
  mois: string;
  heuresParJour: number;
  campagneId: string;
  disabled?: boolean;
}

/**
 * Saisie des variables pour un salarié : 3 choix possibles :
 * a) rémunération nette directe, b) variables détaillées, c) rien à signaler.
 */
export function SaisieSalarie({
  saisie,
  absences,
  mois,
  heuresParJour,
  campagneId,
  disabled = false,
}: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<SaisieMode | null>(saisie.mode);
  const [netMontant, setNetMontant] = useState(
    saisie.net_montant?.toString() ?? ""
  );
  const [heuresSupp, setHeuresSupp] = useState(
    saisie.heures_supp?.toString() ?? ""
  );
  const [note, setNote] = useState(saisie.note ?? "");
  const [etat, setEtat] = useState<"idle" | "envoi" | "ok" | "erreur">("idle");
  const [message, setMessage] = useState("");

  async function enregistrer() {
    if (!mode) {
      setEtat("erreur");
      setMessage("Choisissez l'une des trois options avant d'enregistrer.");
      return;
    }
    if (mode === "net" && !(parseFloat(netMontant) > 0)) {
      setEtat("erreur");
      setMessage("Indiquez la rémunération nette à verser.");
      return;
    }
    setEtat("envoi");
    const supabase = createClient();
    const { error } = await supabase
      .from("saisies_variables")
      .update({
        mode,
        net_montant: mode === "net" ? parseFloat(netMontant) : null,
        heures_supp:
          mode === "variables" && heuresSupp ? parseFloat(heuresSupp) : null,
        note: note.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", saisie.id);
    if (error) {
      setEtat("erreur");
      setMessage("Échec de l'enregistrement. La campagne est peut-être clôturée.");
      toastError("Échec de l'enregistrement. La campagne est peut-être clôturée.");
      return;
    }
    setEtat("ok");
    setMessage("Enregistré : saisie OK");
    toastSuccess("Enregistré : saisie OK");
    router.refresh();
    setTimeout(() => {
      router.push(`/client/variables/${campagneId}`);
    }, 700);
  }

  const choix: { valeur: SaisieMode; titre: string; description: string }[] = [
    {
      valeur: "net",
      titre: "Saisir une rémunération nette",
      description: "Vous indiquez directement le net à verser.",
    },
    {
      valeur: "variables",
      titre: "Saisir les variables",
      description: "Heures d'absence, heures supplémentaires, congés payés.",
    },
    {
      valeur: "ras",
      titre: "Rien à signaler",
      description: "Paie habituelle pour ce salarié.",
    },
  ];

  return (
    <div className="space-y-5">
      {etat === "ok" && (
        <Alert variant="success">✓ {message}</Alert>
      )}
      {etat === "erreur" && <Alert variant="error">{message}</Alert>}

      <div className="grid sm:grid-cols-3 gap-3">
        {choix.map((c) => (
          <button
            key={c.valeur}
            type="button"
            disabled={disabled}
            onClick={() => setMode(c.valeur)}
            className={`text-left rounded-xl border p-4 transition-colors ${
              mode === c.valeur
                ? "border-blue-600 bg-blue-50 ring-2 ring-blue-200"
                : "border-gray-200 bg-white hover:border-blue-300"
            } ${disabled ? "opacity-70 cursor-default" : ""}`}
          >
            <p className="font-semibold text-sm">{c.titre}</p>
            <p className="text-xs text-gray-500 mt-1">{c.description}</p>
          </button>
        ))}
      </div>

      {mode === "net" && (
        <div className="max-w-xs">
          <Label>Rémunération nette à verser (€) *</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={netMontant}
            onChange={(e) => setNetMontant(e.target.value)}
            disabled={disabled}
          />
        </div>
      )}

      {mode === "variables" && (
        <div className="space-y-4">
          <div className="max-w-xs">
            <Label>Heures supplémentaires</Label>
            <Input
              type="number"
              step="0.5"
              min="0"
              value={heuresSupp}
              onChange={(e) => setHeuresSupp(e.target.value)}
              disabled={disabled}
            />
          </div>
          <div>
            <Label>Absences et congés du mois</Label>
            <CalendrierAbsences
              saisieId={saisie.id}
              dossierId={saisie.dossier_id}
              mois={mois}
              heuresParJour={heuresParJour}
              absencesInitiales={absences}
              disabled={disabled}
            />
          </div>
        </div>
      )}

      <div>
        <Label>Note libre pour ce salarié</Label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Expliquez ici ce qui ne rentre pas dans les cases : prime exceptionnelle, acompte, situation particulière…"
          disabled={disabled}
        />
      </div>

      {!disabled && (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={enregistrer} disabled={etat === "envoi"}>
            {etat === "envoi" ? "Enregistrement…" : "Enregistrer ce salarié"}
          </Button>
          <p className="text-xs text-gray-500 max-w-sm">
            Ceci enregistre le salarié. La validation de l&apos;ensemble, notes
            comprises, se fait en bas de la page du mois.
          </p>
          <a
            href={`/client/variables/${campagneId}`}
            className="text-sm text-blue-700 hover:underline"
          >
            Retour à la liste
          </a>
        </div>
      )}
    </div>
  );
}
