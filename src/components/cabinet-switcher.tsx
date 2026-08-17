"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { CabinetAvecRole } from "@/lib/cabinet";

/** Sélecteur de cabinet actif + accès gestion pour le directeur. */
export function CabinetSwitcher({
  cabinets,
  actifId,
  peutGerer = false,
}: {
  cabinets: CabinetAvecRole[];
  actifId: string | null;
  /** Directeur : lien vers création / gestion des cabinets. */
  peutGerer?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const actif =
    cabinets.find((c) => c.id === actifId) ?? cabinets[0] ?? null;

  useEffect(() => {
    if (!ouvert) return;
    function fermer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOuvert(false);
      }
    }
    document.addEventListener("mousedown", fermer);
    return () => document.removeEventListener("mousedown", fermer);
  }, [ouvert]);

  async function changer(id: string) {
    setOuvert(false);
    if (id === actif?.id) return;
    await fetch("/api/cabinet/actif", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cabinet_id: id }),
    });
    startTransition(() => router.refresh());
  }

  if (cabinets.length === 0) {
    if (!peutGerer) return null;
    return (
      <Link
        href="/cabinet/cabinets"
        className="text-xs bg-amber-400 text-blue-950 font-semibold rounded-lg px-2.5 py-1 shrink-0 hover:bg-amber-300"
      >
        Créer un cabinet
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {cabinets.length === 1 ? (
        <span className="hidden sm:inline text-xs bg-blue-700 rounded-full px-2 py-0.5">
          {cabinets[0]!.nom}
        </span>
      ) : (
        <div className="relative" ref={ref}>
          <button
            type="button"
            disabled={pending}
            onClick={() => setOuvert((o) => !o)}
            aria-label="Cabinet actif"
            aria-expanded={ouvert}
            className="inline-flex items-center gap-1 text-xs bg-blue-700 text-white rounded-lg pl-2 pr-1.5 py-1 border border-blue-600 hover:bg-blue-600 disabled:opacity-60"
          >
            <span>{actif?.nom}</span>
            <svg
              className="w-3 h-3 opacity-80 shrink-0"
              viewBox="0 0 12 12"
              fill="currentColor"
              aria-hidden
            >
              <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {ouvert && (
            <ul
              className="absolute left-0 top-full z-50 mt-1 min-w-full w-max max-w-[14rem] rounded-lg border border-blue-600 bg-blue-800 py-1 shadow-lg"
              role="listbox"
            >
              {cabinets.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={c.id === actif?.id}
                    className={`w-full text-left px-3 py-1.5 text-xs whitespace-nowrap hover:bg-blue-700 ${
                      c.id === actif?.id ? "font-semibold text-white" : "text-blue-100"
                    }`}
                    onClick={() => void changer(c.id)}
                  >
                    {c.nom}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {peutGerer && (
        <Link
          href="/cabinet/cabinets"
          className="text-xs text-blue-100 hover:text-white underline-offset-2 hover:underline whitespace-nowrap"
          title="Créer ou gérer les cabinets"
        >
          {cabinets.length <= 1 ? "Gérer / créer" : "Gérer"}
        </Link>
      )}
    </div>
  );
}
