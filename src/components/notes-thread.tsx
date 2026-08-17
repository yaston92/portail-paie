"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Textarea } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { toastError, toastSuccess } from "@/lib/toast";

export interface NoteAffichee {
  id: string;
  contenu: string;
  piece_nom: string | null;
  created_at: string;
  auteur: string;
  estCabinet: boolean;
}

interface Props {
  dossierId: string;
  campagneId?: string;
  salarieId?: string;
  notes: NoteAffichee[];
  placeholder?: string;
}

/** Fil de notes libres avec pièces jointes (client ↔ cabinet). */
export function NotesThread({
  dossierId,
  campagneId,
  salarieId,
  notes,
  placeholder = "Votre message…",
}: Props) {
  const router = useRouter();
  const [contenu, setContenu] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    const form = new FormData(e.currentTarget);
    form.set("dossier_id", dossierId);
    if (campagneId) form.set("campagne_id", campagneId);
    if (salarieId) form.set("salarie_id", salarieId);
    form.set("contenu", contenu);

    const res = await fetch("/api/notes", { method: "POST", body: form });
    const json = await res.json();
    setEnvoi(false);
    if (!res.ok) {
      setErreur(json.error ?? "Échec de l'envoi.");
      toastError(json.error ?? "Échec de l'envoi.");
      return;
    }
    setContenu("");
    (e.target as HTMLFormElement).reset();
    toastSuccess("Note enregistrée");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {notes.length === 0 ? (
        <p className="text-sm text-gray-500">Aucune note pour le moment.</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li
              key={n.id}
              className={`rounded-lg p-3 text-sm ${
                n.estCabinet
                  ? "bg-violet-50 border border-violet-100"
                  : "bg-blue-50 border border-blue-100"
              }`}
            >
              <p className="text-xs text-gray-500 mb-1">
                <span className="font-semibold text-gray-700">{n.auteur}</span>{" "}
                : {formatDateTime(n.created_at)}
              </p>
              {n.contenu && <p className="whitespace-pre-wrap">{n.contenu}</p>}
              {n.piece_nom && (
                <a
                  href={`/api/notes/${n.id}/piece`}
                  className="inline-flex items-center gap-1 text-blue-700 hover:underline mt-1"
                >
                  📎 {n.piece_nom}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="space-y-2">
        {erreur && <Alert variant="error">{erreur}</Alert>}
        <Textarea
          value={contenu}
          onChange={(e) => setContenu(e.target.value)}
          placeholder={placeholder}
          className="min-h-16"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Input name="piece" type="file" className="max-w-xs" />
          <Button type="submit" variant="secondary" disabled={envoi}>
            {envoi ? "Envoi…" : "Envoyer la note"}
          </Button>
        </div>
      </form>
    </div>
  );
}
