"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toastError, toastSuccess } from "@/lib/toast";

/** Retire un dépôt de bulletins, publié ou encore en contrôle. */
export function SupprimerDepotBulletin({
  id,
  publie,
  libelle = "Supprimer",
  redirigerVers,
}: {
  id: string;
  publie: boolean;
  libelle?: string;
  /** Après suppression, ouvre cette page. Sinon, rafraîchit la page courante. */
  redirigerVers?: string;
}) {
  const router = useRouter();
  const [envoi, setEnvoi] = useState(false);

  async function supprimer() {
    const message = publie
      ? "Supprimer ce dépôt en entier ?\n\nLes bulletins déjà publiés seront retirés de l'espace entreprise et de l'espace salarié. Cette action est irréversible."
      : "Supprimer ce dépôt en entier ?\n\nLe PDF et le découpage seront effacés. Cette action est irréversible.";
    if (!window.confirm(message)) return;
    setEnvoi(true);
    try {
      const res = await fetch(`/api/bulletins/uploads/${id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        throw new Error(typeof json?.error === "string" ? json.error : "Suppression impossible.");
      }
      toastSuccess("Dépôt supprimé.");
      if (redirigerVers) router.push(redirigerVers);
      else router.refresh();
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Suppression impossible.");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <button
      type="button"
      onClick={supprimer}
      disabled={envoi}
      className="text-sm text-red-700 hover:underline disabled:opacity-50"
    >
      {envoi ? "Suppression…" : libelle}
    </button>
  );
}
