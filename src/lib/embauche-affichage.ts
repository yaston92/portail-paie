import { formatMontant } from "@/lib/format";

export function texteSalaire(e: {
  salaire: number | null;
  salaire_minimum: boolean;
  salaire_type?: "brut" | "net" | null;
}): string {
  if (e.salaire_minimum) return "Salaire minimum (SMIC / minimum conventionnel)";
  if (e.salaire == null) return "-";
  const nature =
    e.salaire_type === "net" ? "net" : e.salaire_type === "brut" ? "brut" : "";
  return `${formatMontant(e.salaire)}${nature ? ` ${nature}` : ""}`;
}

export function texteDureeHebdo(heures: number | null | undefined): string {
  if (heures == null || !Number.isFinite(Number(heures))) return "-";
  return `${heures} h / semaine`;
}
