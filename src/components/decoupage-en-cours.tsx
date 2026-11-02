"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui";

/** Rafraîchit la page tant que le découpage n'est pas terminé. */
export function DecoupageEnCours() {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [router]);

  return (
    <Alert>
      Le découpage de ce PDF continue en arrière-plan. Vous pouvez quitter
      cette page : une notification arrivera lorsqu&apos;il sera prêt.
    </Alert>
  );
}
