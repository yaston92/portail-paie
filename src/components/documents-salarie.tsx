"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  COMPARTIMENTS_SALARIE,
  labelDocumentSalarie,
  type TypeDocumentSalarie,
} from "@/lib/documents-salarie";
import { formatDate } from "@/lib/format";
import { toastError, toastSuccess } from "@/lib/toast";
import { Button } from "@/components/ui";
import type { SalarieDocument } from "@/lib/types";

export function DocumentsSalarie({
  salarieId,
  documents,
  peutDeposer,
}: {
  salarieId: string;
  documents: SalarieDocument[];
  peutDeposer: boolean;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-semibold">Documents</h2>
        <p className="text-sm text-gray-500 mt-1">
          {peutDeposer
            ? "Déposez le contrat, la DPAE et les autres pièces. Le client les retrouve ici."
            : "Pièces déposées par le cabinet pour ce salarié."}
        </p>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {COMPARTIMENTS_SALARIE.map((c) => (
          <Compartiment
            key={c.id}
            salarieId={salarieId}
            type={c.id}
            label={c.label}
            fichiers={documents.filter((d) => d.type_document === c.id)}
            peutDeposer={peutDeposer}
          />
        ))}
      </div>
    </section>
  );
}

function Compartiment({
  salarieId,
  type,
  label,
  fichiers,
  peutDeposer,
}: {
  salarieId: string;
  type: TypeDocumentSalarie;
  label: string;
  fichiers: SalarieDocument[];
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
        const res = await fetch(`/api/salaries/${salarieId}/documents`, {
          method: "POST",
          body: form,
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(json.error || "Dépôt impossible");
      }
      toastSuccess("Document déposé");
      router.refresh();
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Dépôt impossible");
    }
    setBusy(false);
  }

  async function retirer(docId: string) {
    if (!window.confirm("Retirer ce document ?")) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/salaries/${salarieId}/documents?doc=${encodeURIComponent(docId)}`,
        { method: "DELETE" }
      );
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Suppression impossible");
      toastSuccess("Document retiré");
      router.refresh();
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Suppression impossible");
    }
    setBusy(false);
  }

  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <p className="text-sm font-medium mb-2">{label}</p>
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
          className={`rounded-lg border border-dashed px-3 py-4 text-center text-sm ${
            survol ? "border-blue-600 bg-blue-50" : "border-gray-300 bg-gray-50"
          }`}
        >
          <p className="text-gray-600">{busy ? "Envoi…" : "Glisser ici"}</p>
          <Button
            type="button"
            variant="secondary"
            className="mt-2"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            Choisir
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
      <ul className="mt-2 space-y-1">
        {fichiers.length === 0 ? (
          <li className="text-xs text-gray-400">Aucun fichier</li>
        ) : (
          fichiers.map((f) => (
            <li key={f.id} className="flex items-start justify-between gap-2 text-sm">
              <div className="min-w-0">
                <a
                  href={`/api/documents/${f.id}`}
                  className="text-blue-700 hover:underline break-all"
                >
                  {f.nom_fichier}
                </a>
                <p className="text-xs text-gray-400">
                  {labelDocumentSalarie(f.type_document)} · {formatDate(f.created_at.slice(0, 10))}
                </p>
              </div>
              {peutDeposer && (
                <button
                  type="button"
                  className="text-red-600 text-xs hover:underline shrink-0"
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
