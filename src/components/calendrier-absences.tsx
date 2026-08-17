"use client";

import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  NATURE_COLORS,
  NATURE_LABELS,
  type Absence,
  type AbsenceNature,
} from "@/lib/types";

const JOURS_SEMAINE = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const NATURES: AbsenceNature[] = ["cp", "maladie", "injustifiee", "rtt", "autre"];

function normalizeJour(value: string): string {
  return String(value ?? "").slice(0, 10);
}

function heuresValides(h: number): number {
  const n = Number(h);
  if (!Number.isFinite(n) || n <= 0) return 7;
  return Math.round(n * 100) / 100;
}

interface Props {
  saisieId: string;
  dossierId: string;
  /** Premier jour du mois, 'YYYY-MM-01' */
  mois: string;
  /** Heures par défaut pour une journée d'absence */
  heuresParJour: number;
  absencesInitiales: Absence[];
  disabled?: boolean;
}

/**
 * Calendrier cliquable des absences et congés :
 * choisir une nature dans la palette puis cliquer les jours.
 * Totalisation automatique en jours et en heures, par nature.
 */
export function CalendrierAbsences({
  saisieId,
  dossierId,
  mois,
  heuresParJour,
  absencesInitiales,
  disabled = false,
}: Props) {
  const [absences, setAbsences] = useState<Absence[]>(() =>
    absencesInitiales.map((a) => ({ ...a, jour: normalizeJour(a.jour) }))
  );
  const [natureActive, setNatureActive] = useState<AbsenceNature>("cp");
  const [erreur, setErreur] = useState<string | null>(null);
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const ym = String(mois).slice(0, 7);
  const [annee, moisNum] = ym.split("-").map(Number);
  const nbJours = new Date(annee, moisNum, 0).getDate();
  const premierJourSemaine = (new Date(annee, moisNum - 1, 1).getDay() + 6) % 7; // 0 = lundi
  const heures = heuresValides(heuresParJour);

  const absencesParJour = useMemo(
    () => new Map(absences.map((a) => [normalizeJour(a.jour), a])),
    [absences]
  );

  function jourIso(j: number): string {
    return `${annee}-${String(moisNum).padStart(2, "0")}-${String(j).padStart(2, "0")}`;
  }

  async function chargerJour(jour: string): Promise<Absence | null> {
    const { data } = await supabase
      .from("absences")
      .select("*")
      .eq("saisie_id", saisieId)
      .eq("jour", jour)
      .maybeSingle();
    if (!data) return null;
    const a = data as Absence;
    return { ...a, jour: normalizeJour(a.jour) };
  }

  async function toggleJour(j: number) {
    if (disabled) return;
    setErreur(null);
    const jour = jourIso(j);
    let existante = absencesParJour.get(jour) ?? null;

    if (!existante) {
      existante = await chargerJour(jour);
      if (existante) {
        setAbsences((prev) =>
          prev.some((a) => normalizeJour(a.jour) === jour) ? prev : [...prev, existante!]
        );
      }
    }

    if (existante && existante.nature === natureActive) {
      setAbsences((prev) => prev.filter((a) => normalizeJour(a.jour) !== jour));
      const { error } = await supabase.from("absences").delete().eq("id", existante.id);
      if (error) {
        setAbsences((prev) => [...prev, existante!]);
        setErreur("Échec de la suppression, réessayez.");
      }
      return;
    }
    if (existante) {
      const modifiee = { ...existante, nature: natureActive };
      setAbsences((prev) =>
        prev.map((a) => (normalizeJour(a.jour) === jour ? modifiee : a))
      );
      const { error } = await supabase
        .from("absences")
        .update({ nature: natureActive })
        .eq("id", existante.id);
      if (error) {
        setAbsences((prev) =>
          prev.map((a) => (normalizeJour(a.jour) === jour ? existante! : a))
        );
        setErreur("Échec de la modification, réessayez.");
      }
      return;
    }

    const { data, error } = await supabase
      .from("absences")
      .insert({
        saisie_id: saisieId,
        dossier_id: dossierId,
        jour,
        nature: natureActive,
        heures,
      })
      .select("*")
      .maybeSingle();

    if (error?.code === "23505") {
      const deja = await chargerJour(jour);
      if (!deja) {
        setErreur("Ce jour est déjà enregistré, rechargez la page.");
        return;
      }
      setAbsences((prev) =>
        prev.some((a) => normalizeJour(a.jour) === jour) ? prev : [...prev, deja]
      );
      return;
    }

    if (error || !data) {
      setErreur(
        error?.message
          ? `Échec de l'enregistrement (${error.message})`
          : "Échec de l'enregistrement, réessayez."
      );
      return;
    }
    const creee = { ...(data as Absence), jour: normalizeJour((data as Absence).jour) };
    setAbsences((prev) => [...prev, creee]);
  }

  async function changerHeures(absence: Absence, heures: number) {
    if (!Number.isFinite(heures) || heures <= 0) return;
    setAbsences((prev) =>
      prev.map((a) => (a.id === absence.id ? { ...a, heures } : a))
    );
    await supabase.from("absences").update({ heures }).eq("id", absence.id);
  }

  const totaux = useMemo(() => {
    const t = new Map<AbsenceNature, { jours: number; heures: number }>();
    for (const a of absences) {
      const cur = t.get(a.nature) ?? { jours: 0, heures: 0 };
      cur.jours += 1;
      cur.heures += Number(a.heures);
      t.set(a.nature, cur);
    }
    return t;
  }, [absences]);

  const cellules: (number | null)[] = [
    ...Array<null>(premierJourSemaine).fill(null),
    ...Array.from({ length: nbJours }, (_, i) => i + 1),
  ];

  return (
    <div className="space-y-4">
      {!disabled && (
        <div className="flex flex-wrap gap-2">
          {NATURES.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setNatureActive(n)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                natureActive === n
                  ? "border-gray-800 bg-gray-800 text-white"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${NATURE_COLORS[n]}`} />
              {NATURE_LABELS[n]}
            </button>
          ))}
          <span className="text-xs text-gray-500 self-center">
            Choisissez une nature puis cliquez les jours concernés.
          </span>
        </div>
      )}
      {erreur && <p className="text-sm text-red-600">{erreur}</p>}

      <div className="grid grid-cols-7 gap-1 max-w-md">
        {JOURS_SEMAINE.map((j) => (
          <div
            key={j}
            className="text-center text-xs font-semibold text-gray-500 py-1"
          >
            {j}
          </div>
        ))}
        {cellules.map((j, idx) => {
          if (j === null) return <div key={`v-${idx}`} />;
          const absence = absencesParJour.get(jourIso(j));
          const weekend = idx % 7 >= 5;
          return (
            <button
              key={j}
              type="button"
              disabled={disabled}
              onClick={() => toggleJour(j)}
              className={`relative aspect-square rounded-lg border text-sm transition-colors ${
                absence
                  ? `${NATURE_COLORS[absence.nature]} text-white border-transparent font-semibold`
                  : weekend
                    ? "bg-gray-100 border-gray-200 text-gray-400"
                    : "bg-white border-gray-200 hover:border-blue-400"
              } ${disabled ? "cursor-default" : "cursor-pointer"}`}
              title={absence ? NATURE_LABELS[absence.nature] : undefined}
            >
              {j}
            </button>
          );
        })}
      </div>

      {totaux.size > 0 && (
        <div className="text-sm space-y-1">
          <p className="font-semibold">Totaux :</p>
          <ul className="space-y-0.5">
            {[...totaux.entries()].map(([nature, t]) => (
              <li key={nature} className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${NATURE_COLORS[nature]}`} />
                {NATURE_LABELS[nature]} : {t.jours} jour(s) :{" "}
                {t.heures.toLocaleString("fr-FR")} h
              </li>
            ))}
          </ul>
        </div>
      )}

      {absences.length > 0 && !disabled && (
        <details className="text-sm">
          <summary className="cursor-pointer text-blue-700">
            Ajuster les heures par journée
          </summary>
          <ul className="mt-2 space-y-1">
            {[...absences]
              .sort((a, b) => a.jour.localeCompare(b.jour))
              .map((a) => (
                <li key={a.id} className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${NATURE_COLORS[a.nature]}`} />
                  <span className="w-24">{a.jour.slice(8, 10)}/{a.jour.slice(5, 7)}</span>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    defaultValue={a.heures}
                    onBlur={(e) => changerHeures(a, parseFloat(e.target.value))}
                    className="w-20 rounded border border-gray-300 px-2 py-0.5 text-sm"
                  />
                  <span className="text-gray-500">h</span>
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}
