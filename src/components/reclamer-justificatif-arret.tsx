"use client";

import { useState } from "react";
import { toastError, toastSuccess } from "@/lib/toast";

/** Lien cabinet : relance le client / salarié pour déposer le justificatif. */
export function ReclamerJustificatifArret({ arretId }: { arretId: string }) {
  const [busy, setBusy] = useState(false);

  async function reclamer() {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/arrets-maladie/${arretId}/reclamer-justificatif`,
        { method: "POST" }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError(json.error ?? "Impossible d'envoyer la demande");
        return;
      }
      toastSuccess("Demande de justificatif envoyée");
    } catch {
      toastError("Impossible d'envoyer la demande");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void reclamer()}
      className="text-sm text-blue-700 hover:underline disabled:opacity-50 disabled:no-underline disabled:pointer-events-none whitespace-nowrap"
    >
      {busy ? "Envoi…" : "Réclamer le justificatif"}
    </button>
  );
}
