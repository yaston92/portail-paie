import Link from "next/link";

/** Flèches vers le salarié précédent et le suivant du même dossier. */
export function NavigationSalaries({
  precedent,
  suivant,
  base,
}: {
  precedent: { id: string; nom: string; prenom: string } | null;
  suivant: { id: string; nom: string; prenom: string } | null;
  base: string;
}) {
  if (!precedent && !suivant) return null;
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      {precedent ? (
        <Link href={`${base}/${precedent.id}`} className="text-blue-700 hover:underline">
          ← {precedent.prenom} {precedent.nom}
        </Link>
      ) : (
        <span />
      )}
      {suivant ? (
        <Link href={`${base}/${suivant.id}`} className="text-blue-700 hover:underline">
          {suivant.prenom} {suivant.nom} →
        </Link>
      ) : (
        <span />
      )}
    </div>
  );
}
