"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui";

/** Relance le découpage s'il s'est arrêté, puis rafraîchit la page. */
export function DecoupageEnCours({ id }: { id: string }) {
  const router = useRouter();
  useEffect(() => {
    let ignore = false;
    void fetch(`/api/bulletins/uploads/${id}/reprendre`, { method: "POST" })
      .catch(() => undefined)
      .finally(() => {
        if (!ignore) router.refresh();
      });
    const timer = window.setInterval(() => router.refresh(), 4000);
    return () => {
      ignore = true;
      window.clearInterval(timer);
    };
  }, [id, router]);

  return (
    <Alert>
      Le découpage de ce PDF continue en arrière-plan. Vous pouvez quitter
      cette page : une notification arrivera lorsqu&apos;il sera prêt.
    </Alert>
  );
}
