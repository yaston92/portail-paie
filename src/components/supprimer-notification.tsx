"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toastError } from "@/lib/toast";

export function SupprimerNotification({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function retirer() {
    setBusy(true);
    const res = await fetch(`/api/notifications/${id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      toastError("Suppression impossible");
      return;
    }
    router.refresh();
  }

  return (
    <button
      type="button"
      className="text-xs text-red-600 hover:underline disabled:opacity-50"
      disabled={busy}
      onClick={() => void retirer()}
    >
      Supprimer
    </button>
  );
}
