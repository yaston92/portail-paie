"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  TYPES_ATTESTATION,
  type AttestationDossier,
  type TypeAttestation,
} from "@/lib/attestations";
import { formatDateTime } from "@/lib/format";
import { toastError, toastSuccess } from "@/lib/toast";
import { Button } from "@/components/ui";

export function AttestationsDossier({
  dossierId,
  attestations,
  peutDeposer,
  afficherTitre = true,
}: {
  dossierId: string;
  attestations: AttestationDossier[];
  peutDeposer: boolean;
  afficherTitre?: boolean;
}) {
  return (
    <section className="space-y-3">
      <div>
        {afficherTitre && <h2 className="font-semibold">Attestations</h2>}
        <p className="text-sm text-gray-500 mt-1">
          {peutDeposer
            ? "Glissez le fichier dans la case correspondante, ou cliquez pour le choisir. PDF ou photo."
            : "Documents déposés par le cabinet."}
        </p>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {TYPES_ATTESTATION.map((type) => (
          <Zone
            key={type.id}
            dossierId={dossierId}
            type={type.id}
            label={type.label}
            fichiers={attestations.filter((a) => a.type === type.id)}
            peutDeposer={peutDeposer}
          />
        ))}
      </div>
    </section>
  );
}

function Zone({
  dossierId,
  type,
  label,
  fichiers,
  peutDeposer,
}: {
  dossierId: string;
  type: TypeAttestation;
  label: string;
  fichiers: AttestationDossier[];
  peutDeposer: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [survol, setSurvol] = useState(false);
  const [busy, setBusy] = useState(false);

  async function deposer(liste: File[]) {
    if (!liste.length) return;
    setBusy(true);
    try {
      for (const fichier of liste) {
        const form = new FormData();
        form.set("type", type);
        form.set("fichier", fichier);
        const res = await fetch(`/api/dossiers/${dossierId}/attestations`, {
          method: "POST",
          body: form,
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(json.error || "Dépôt impossible");
      }
      toastSuccess(
        liste.length > 1 ? `${liste.length} fichiers déposés` : "Attestation déposée"
      );
      router.refresh();
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Dépôt impossible");
    }
    setBusy(false);
  }

  async function retirer(id: string) {
    if (!window.confirm("Retirer cette attestation ?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/dossiers/${dossierId}/attestations/${id}`, {
        method: "DELETE",
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Suppression impossible");
      toastSuccess("Attestation retirée");
      router.refresh();
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Suppression impossible");
    }
    setBusy(false);
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="font-medium text-sm mb-3">{label}</p>
      {peutDeposer && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setSurvol(true);
          }}
          onDragLeave={() => setSurvol(false)}
          onDrop={(e) => {
            e.preventDefault();
            setSurvol(false);
            void deposer(Array.from(e.dataTransfer.files));
          }}
          className={`rounded-lg border-2 border-dashed px-3 py-6 text-center text-sm ${
            survol ? "border-blue-600 bg-blue-50" : "border-gray-300 bg-gray-50"
          }`}
        >
          <p className="text-gray-600">
            {busy ? "Envoi…" : "Glisser le fichier ici"}
          </p>
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            Choisir un fichier
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.heic,application/pdf,image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const liste = Array.from(e.target.files ?? []);
              e.target.value = "";
              void deposer(liste);
            }}
          />
        </div>
      )}
      <ul className="mt-3 space-y-2">
        {fichiers.length === 0 ? (
          <li className="text-sm text-gray-400">Aucun fichier</li>
        ) : (
          fichiers.map((f) => (
            <li key={f.id} className="flex items-start justify-between gap-3 text-sm">
              <div className="min-w-0">
                <a
                  href={`/api/dossiers/${dossierId}/attestations/${f.id}`}
                  className="text-blue-700 hover:underline break-all"
                >
                  {f.nom_fichier}
                </a>
                <p className="text-xs text-gray-400">{formatDateTime(f.created_at)}</p>
              </div>
              {peutDeposer && (
                <button
                  type="button"
                  className="text-red-600 hover:underline shrink-0"
                  disabled={busy}
                  onClick={() => void retirer(f.id)}
                >
                  Retirer
                </button>
              )}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
