import type { SoldeCp } from "@/lib/types";
import { soldesDerives } from "@/lib/demandes-conge";
import { formatDate, moisLabel } from "@/lib/format";

function fmt(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "-";
  return n.toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/** Affichage clair type compteur MySilae : N-1 | N, avec total restant mis en avant. */
export function SoldeCpTableau({
  cp,
  previsionnel,
}: {
  cp: SoldeCp;
  previsionnel?: number | null;
}) {
  const d = soldesDerives(cp);

  if (!d.hasDetail) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Case valeur={d.acquisTotal} label="Acquis" tone="slate" />
          <Case valeur={d.prisTotal} label="Pris" tone="slate" />
          <Case valeur={d.restant} label="Solde" tone="green" highlight />
        </div>
        <Previsionnel valeur={previsionnel} />
        <Pied cp={cp} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-[1fr_1fr_1fr] bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <div className="px-3 py-2.5" />
          <div className="px-3 py-2.5 text-center border-l border-gray-200">
            Période N-1
          </div>
          <div className="px-3 py-2.5 text-center border-l border-gray-200">
            Période N
          </div>
        </div>

        <Ligne label="Acquis" n1={d.acquisN1} n={d.acquisN} />
        <Ligne label="Pris" n1={d.prisN1} n={d.prisN} />
        <Ligne label="Solde" n1={d.soldeN1} n={d.soldeN} emphase />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-800/70">
            Solde total disponible
          </p>
          <p className="text-3xl font-bold text-emerald-800 tabular-nums">
            {fmt(d.restant)}{" "}
            <span className="text-base font-semibold">jours</span>
          </p>
        </div>
        {previsionnel != null && previsionnel !== d.restant && (
          <div className="text-right">
            <p className="text-xs text-emerald-800/70">Après demandes en cours</p>
            <p className="text-lg font-bold text-emerald-900 tabular-nums">
              {fmt(previsionnel)} j.
            </p>
          </div>
        )}
      </div>

      <Pied cp={cp} />
    </div>
  );
}

function Ligne({
  label,
  n1,
  n,
  emphase,
}: {
  label: string;
  n1: number | null;
  n: number | null;
  emphase?: boolean;
}) {
  const cell = emphase
    ? "text-base font-bold text-gray-900"
    : "text-sm font-semibold text-gray-800";
  return (
    <div className="grid grid-cols-[1fr_1fr_1fr] border-t border-gray-100 items-center">
      <div className="px-3 py-3 text-sm text-gray-600">{label}</div>
      <div className={`px-3 py-3 text-center border-l border-gray-100 tabular-nums ${cell}`}>
        {fmt(n1)}
      </div>
      <div className={`px-3 py-3 text-center border-l border-gray-100 tabular-nums ${cell}`}>
        {fmt(n)}
      </div>
    </div>
  );
}

function Case({
  valeur,
  label,
  tone,
  highlight,
}: {
  valeur: number | null;
  label: string;
  tone: "slate" | "green";
  highlight?: boolean;
}) {
  const wrap =
    tone === "green"
      ? "bg-emerald-50 border-emerald-100"
      : "bg-gray-50 border-gray-100";
  const num = tone === "green" ? "text-emerald-800" : "text-gray-900";
  return (
    <div className={`rounded-xl border px-3 py-4 text-center ${wrap}`}>
      <p
        className={`tabular-nums font-bold ${num} ${
          highlight ? "text-3xl" : "text-2xl"
        }`}
      >
        {fmt(valeur)}
      </p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}

function Previsionnel({ valeur }: { valeur?: number | null }) {
  if (valeur == null) return null;
  return (
    <p className="text-sm text-gray-700">
      Solde prévisionnel : <strong>{fmt(valeur)} j.</strong>
    </p>
  );
}

function Pied({ cp }: { cp: SoldeCp }) {
  return (
    <p className="text-xs text-gray-400">
      {cp.mois_reference
        ? `Issu du bulletin de ${moisLabel(cp.mois_reference)}.`
        : `Mis à jour le ${formatDate(cp.updated_at.slice(0, 10))}.`}{" "}
      Le bulletin de paie fait foi.
    </p>
  );
}
