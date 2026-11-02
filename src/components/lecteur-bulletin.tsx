"use client";

import { useEffect, useState } from "react";

/** Affiche le PDF dans la page. Le téléchargement reste un choix à part. */
export function LecteurBulletin({ id }: { id: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let url: string | null = null;
    let ignore = false;
    void (async () => {
      const res = await fetch(`/api/bulletins/${id}/telecharger?inline=1`, {
        credentials: "same-origin",
      });
      if (!res.ok) {
        if (!ignore) setErreur("Ce bulletin ne peut pas être affiché.");
        return;
      }
      const blob = await res.blob();
      url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
      if (!ignore) setSrc(url);
    })().catch(() => {
      if (!ignore) setErreur("Ce bulletin ne peut pas être affiché.");
    });
    return () => {
      ignore = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);

  if (erreur) {
    return <p className="text-sm text-red-700">{erreur}</p>;
  }
  if (!src) {
    return <p className="text-sm text-gray-600">Ouverture du bulletin…</p>;
  }
  return (
    <object
      data={src}
      type="application/pdf"
      className="h-[80vh] w-full rounded-lg border border-gray-200 bg-white"
    >
      <iframe title="Bulletin de paie" src={src} className="h-[80vh] w-full" />
    </object>
  );
}
