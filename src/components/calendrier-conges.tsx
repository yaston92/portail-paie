"use client";

import { useMemo, useState } from "react";
import type { DemandeConge } from "@/lib/types";

type Ligne = DemandeConge & {
  salaries?: { nom: string; prenom: string } | null;
};

const COULEURS = ["#C63D2F", "#1d4ed8", "#047857", "#b45309", "#6d28d9", "#0f766e"];

function ymd(annee: number, mois: number, jour: number): string {
  return `${annee}-${String(mois + 1).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;
}

function joursEntre(debut: string, fin: string): string[] {
  const jours: string[] = [];
  const [y0, m0, d0] = debut.split("-").map(Number);
  const [y1, m1, d1] = fin.split("-").map(Number);
  const cur = new Date(y0, m0 - 1, d0);
  const stop = new Date(y1, m1 - 1, d1);
  while (cur <= stop) {
    jours.push(ymd(cur.getFullYear(), cur.getMonth(), cur.getDate()));
    cur.setDate(cur.getDate() + 1);
  }
  return jours;
}

/** Mois calendaire des congés demandés ou acceptés. */
export function CalendrierConges({ demandes }: { demandes: Ligne[] }) {
  const maintenant = new Date();
  const [annee, setAnnee] = useState(maintenant.getFullYear());
  const [mois, setMois] = useState(maintenant.getMonth());

  const actifs = demandes.filter((d) => d.statut === "en_attente" || d.statut === "validee");
  const noms = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of actifs) {
      const nom = d.salaries
        ? `${d.salaries.prenom} ${d.salaries.nom}`.trim()
        : "Salarié";
      map.set(d.salarie_id, nom);
    }
    return map;
  }, [actifs]);

  const couleur = new Map<string, string>();
  [...noms.keys()].forEach((id, i) => couleur.set(id, COULEURS[i % COULEURS.length]!));

  const parJour = new Map<string, { id: string; nom: string; statut: DemandeConge["statut"] }[]>();
  for (const d of actifs) {
    for (const jour of joursEntre(d.date_debut, d.date_fin)) {
      const liste = parJour.get(jour) ?? [];
      liste.push({
        id: d.salarie_id,
        nom: noms.get(d.salarie_id) ?? "Salarié",
        statut: d.statut,
      });
      parJour.set(jour, liste);
    }
  }

  const debutMois = new Date(annee, mois, 1);
  const nbJours = new Date(annee, mois + 1, 0).getDate();
  const decalage = (debutMois.getDay() + 6) % 7;
  const cases: (number | null)[] = [
    ...Array.from({ length: decalage }, () => null),
    ...Array.from({ length: nbJours }, (_, i) => i + 1),
  ];

  function changer(delta: number) {
    const d = new Date(annee, mois + delta, 1);
    setAnnee(d.getFullYear());
    setMois(d.getMonth());
  }

  const titre = debutMois.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button type="button" className="text-sm text-blue-700" onClick={() => changer(-1)}>
          ←
        </button>
        <p className="font-semibold capitalize">{titre}</p>
        <button type="button" className="text-sm text-blue-700" onClick={() => changer(1)}>
          →
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500 mb-1">
        {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((j) => (
          <div key={j}>{j}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cases.map((jour, i) => {
          if (!jour) return <div key={`v-${i}`} />;
          const cle = ymd(annee, mois, jour);
          const presents = parJour.get(cle) ?? [];
          return (
            <div key={cle} className="min-h-16 rounded border border-gray-100 p-1 text-left">
              <p className="text-xs font-medium text-gray-700">{jour}</p>
              {presents.map((p) => (
                <p
                  key={`${cle}-${p.id}-${p.statut}`}
                  className="mt-0.5 truncate rounded px-1 text-[10px] text-white"
                  style={{ background: couleur.get(p.id) ?? "#C63D2F", opacity: p.statut === "en_attente" ? 0.55 : 1 }}
                  title={`${p.nom} : ${p.statut === "validee" ? "accepté" : "en attente"}`}
                >
                  {p.nom}
                </p>
              ))}
            </div>
          );
        })}
      </div>
      {actifs.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-3 text-xs text-gray-600">
          {[...noms.entries()].map(([id, nom]) => (
            <li key={id} className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: couleur.get(id) }} />
              {nom}
            </li>
          ))}
          <li>Couleur pleine : accepté. Couleur claire : en attente.</li>
        </ul>
      )}
      {actifs.length === 0 && (
        <p className="mt-3 text-sm text-gray-500">Aucun congé sur ce mois.</p>
      )}
    </div>
  );
}
