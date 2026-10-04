"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Alert } from "@/components/ui";
import { toastSuccess } from "@/lib/toast";

/**
 * Bandeau persistant + toast. Le toast seul disparaît au changement de page
 * sur ordinateur ; le bandeau reste affiché sur la fiche.
 */
export function DossierCreeToast({
  actif,
  sigle,
}: {
  actif: boolean;
  sigle: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const fait = useRef(false);

  useEffect(() => {
    if (!actif || fait.current) return;
    fait.current = true;
    setVisible(true);
    toastSuccess(`Dossier ${sigle} créé`, 6000);
    router.replace(pathname, { scroll: false });
  }, [actif, sigle, pathname, router]);

  if (!visible) return null;

  return (
    <Alert variant="success">
      Le dossier <strong>{sigle}</strong> a bien été créé.
    </Alert>
  );
}
