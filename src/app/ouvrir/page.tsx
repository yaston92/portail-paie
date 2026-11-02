"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo } from "react";
import { BRAND } from "@/lib/brand";

function destinations(vers: string | null): { app: string; web: string } {
  const brut = (vers || "login").trim();
  if (!/^[a-z0-9/_-]*$/i.test(brut.replace(/^\//, ""))) {
    return { app: "etikpaie://login", web: "/login" };
  }
  const chemin = brut.replace(/^\/+/, "") || "login";
  if (chemin === "login") return { app: "etikpaie://login", web: "/login" };
  return { app: `etikpaie://${chemin}`, web: `/${chemin}` };
}

function OuvrirApp() {
  const params = useSearchParams();
  const { app, web } = useMemo(
    () => destinations(params.get("vers")),
    [params]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.location.href = app;
    }, 250);
    return () => window.clearTimeout(timer);
  }, [app]);

  return (
    <main className="mx-auto max-w-md px-4 py-16 space-y-4">
      <h1 className="text-2xl font-semibold">Ouvrir ETIK Paie</h1>
      <p className="text-sm text-gray-600">
        Si l&apos;application est installée sur ce téléphone, elle s&apos;ouvre
        toute seule. Sinon, continuez dans le navigateur.
      </p>
      <p>
        <a
          href={app}
          className="inline-block rounded-md px-5 py-3 font-semibold text-white"
          style={{ backgroundColor: BRAND.primary }}
        >
          Ouvrir l&apos;application
        </a>
      </p>
      <p>
        <a href={web} className="text-sm underline">
          Continuer dans le navigateur
        </a>
      </p>
    </main>
  );
}

export default function OuvrirPage() {
  return (
    <Suspense>
      <OuvrirApp />
    </Suspense>
  );
}
