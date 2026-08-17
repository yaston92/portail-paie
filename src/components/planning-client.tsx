"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, CardBody, EmptyState } from "@/components/ui";
import { DatePickerField } from "@/components/date-picker-field";
import { aujourdhuiParis } from "@/lib/demandes-conge";
import { formatHeures } from "@/lib/format";
import { toastError } from "@/lib/toast";
import type { PlanningLigne } from "@/lib/planning";

type PlanningResponse = {
  jour: string;
  totaux: { presents: number; absents: number; repos: number; total: number };
  lignes: PlanningLigne[];
};

function debutMois(ymd: string): Date {
  const [y, m] = ymd.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function badgePour(ligne: PlanningLigne) {
  if (ligne.statut === "present") return <Badge variant="green">Présent</Badge>;
  if (ligne.statut === "repos") return <Badge variant="gray">Repos</Badge>;
  if (ligne.nature === "maladie") return <Badge variant="amber">Maladie</Badge>;
  if (ligne.nature === "cp" || ligne.nature === "cp_attente")
    return <Badge variant="blue">Congés</Badge>;
  return <Badge variant="red">Absent</Badge>;
}

/** Planning de présence quotidien (client). */
export function PlanningClient() {
  const [jour, setJour] = useState(aujourdhuiParis);
  const [data, setData] = useState<PlanningResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const charger = useCallback(async (j: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/client/planning?jour=${encodeURIComponent(j)}`);
      const json = (await res.json().catch(() => ({}))) as PlanningResponse & {
        error?: string;
      };
      if (!res.ok) {
        toastError(json.error || "Chargement impossible");
        setData(null);
      } else {
        setData(json);
      }
    } catch {
      toastError("Réseau indisponible.");
      setData(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void charger(jour);
  }, [jour, charger]);

  const cellulesMois = useMemo(() => {
    const first = debutMois(jour);
    const year = first.getFullYear();
    const month = first.getMonth();
    const startPad = (first.getDay() + 6) % 7; // lundi = 0
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (string | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(ymdLocal(new Date(year, month, d)));
    }
    return cells;
  }, [jour]);

  const moisLabel = useMemo(() => {
    const [y, m] = jour.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", {
      month: "long",
      year: "numeric",
    });
  }, [jour]);

  function decalerMois(delta: number) {
    const [y, m] = jour.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const today = aujourdhuiParis();
    const candidate = ymdLocal(d);
    // Si on revient sur le mois courant, garder le jour d'aujourd'hui
    if (candidate.slice(0, 7) === today.slice(0, 7)) {
      setJour(today);
    } else {
      setJour(candidate);
    }
  }

  const presents = data?.lignes.filter((l) => l.statut === "present") ?? [];
  const absents = data?.lignes.filter((l) => l.statut === "absent") ?? [];
  const repos = data?.lignes.filter((l) => l.statut === "repos") ?? [];

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-[320px_1fr] gap-6">
        <Card>
          <CardBody className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="secondary" onClick={() => decalerMois(-1)}>
                ←
              </Button>
              <p className="text-sm font-semibold capitalize">{moisLabel}</p>
              <Button type="button" variant="secondary" onClick={() => decalerMois(1)}>
                →
              </Button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500">
              {["L", "M", "M", "J", "V", "S", "D"].map((l, i) => (
                <span key={`${l}-${i}`}>{l}</span>
              ))}
              {cellulesMois.map((c, i) =>
                c ? (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setJour(c)}
                    className={`aspect-square rounded-md text-sm ${
                      c === jour
                        ? "bg-blue-700 text-white font-semibold"
                        : "hover:bg-gray-100 text-gray-800"
                    }`}
                  >
                    {Number(c.slice(8))}
                  </button>
                ) : (
                  <span key={`e-${i}`} />
                )
              )}
            </div>
            <DatePickerField
              label="Date sélectionnée"
              value={jour}
              onChange={setJour}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => setJour(aujourdhuiParis())}
            >
              Aujourd&apos;hui
            </Button>
          </CardBody>
        </Card>

        <div className="space-y-4">
          {data && (
            <div className="flex flex-wrap gap-3 text-sm">
              <Badge variant="green">{data.totaux.presents} présent(s)</Badge>
              <Badge variant="amber">{data.totaux.absents} absent(s)</Badge>
              <Badge variant="gray">{data.totaux.repos} au repos</Badge>
            </div>
          )}

          {loading ? (
            <Card>
              <CardBody>
                <p className="text-sm text-gray-500">Chargement…</p>
              </CardBody>
            </Card>
          ) : !data ? (
            <EmptyState message="Impossible de charger le planning." />
          ) : data.lignes.length === 0 ? (
            <EmptyState message="Aucun salarié actif à cette date." />
          ) : (
            <>
              <Card>
                <CardBody>
                  <h2 className="font-semibold mb-3">
                    Présents ({presents.length})
                  </h2>
                  {presents.length === 0 ? (
                    <p className="text-sm text-gray-500">Personne présent.</p>
                  ) : (
                    <ul className="divide-y divide-gray-100 text-sm">
                      {presents.map((l) => (
                        <li
                          key={l.salarie_id}
                          className="py-2 flex flex-wrap items-center justify-between gap-2"
                        >
                          <div>
                            <p className="font-medium">
                              {l.prenom} {l.nom}
                            </p>
                            {l.poste && (
                              <p className="text-xs text-gray-500">{l.poste}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-600">
                              {formatHeures(l.heures_prevues)}
                            </span>
                            {badgePour(l)}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardBody>
                  <h2 className="font-semibold mb-3">
                    Absents ({absents.length})
                  </h2>
                  {absents.length === 0 ? (
                    <p className="text-sm text-gray-500">Aucun absent.</p>
                  ) : (
                    <ul className="divide-y divide-gray-100 text-sm">
                      {absents.map((l) => (
                        <li
                          key={l.salarie_id}
                          className="py-2 flex flex-wrap items-center justify-between gap-2"
                        >
                          <div>
                            <p className="font-medium">
                              {l.prenom} {l.nom}
                            </p>
                            <p className="text-xs text-gray-500">
                              {l.motif}
                              {l.poste ? ` · ${l.poste}` : ""}
                            </p>
                          </div>
                          {badgePour(l)}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>

              {repos.length > 0 && (
                <Card>
                  <CardBody>
                    <h2 className="font-semibold mb-3">
                      Jour non travaillé ({repos.length})
                    </h2>
                    <ul className="divide-y divide-gray-100 text-sm">
                      {repos.map((l) => (
                        <li
                          key={l.salarie_id}
                          className="py-2 flex flex-wrap items-center justify-between gap-2"
                        >
                          <p className="font-medium">
                            {l.prenom} {l.nom}
                          </p>
                          {badgePour(l)}
                        </li>
                      ))}
                    </ul>
                  </CardBody>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
