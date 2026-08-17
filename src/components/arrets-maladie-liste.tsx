import Link from "next/link";
import { formatDate } from "@/lib/format";
import type { ArretMaladie } from "@/lib/types";

type ArretAvecSalarie = ArretMaladie & {
  salaries?: { nom: string; prenom: string } | null;
  dossiers?: { sigle: string; raison_sociale: string } | null;
};

/** Liste lecture seule des arrêts maladie (cabinet / client). */
export function ArretsMaladieListe({
  arrets,
  afficherSalarie = true,
  afficherDossier = false,
  /** Si défini, le nom du salarié devient un lien (ex. `/cabinet/salaries`). */
  lienSalarieBase = null,
}: {
  arrets: ArretAvecSalarie[];
  afficherSalarie?: boolean;
  afficherDossier?: boolean;
  lienSalarieBase?: string | null;
}) {
  if (arrets.length === 0) {
    return (
      <p className="text-sm text-gray-500">Aucun arrêt maladie déclaré.</p>
    );
  }

  return (
    <ul className="divide-y divide-gray-100 text-sm">
      {arrets.map((a) => {
        const nom = a.salaries
          ? `${a.salaries.prenom} ${a.salaries.nom}`
          : null;
        return (
          <li
            key={a.id}
            className="py-3 flex flex-wrap items-start justify-between gap-2"
          >
            <div>
              {afficherSalarie && nom && (
                <p className="font-medium">
                  {lienSalarieBase ? (
                    <Link
                      href={`${lienSalarieBase}/${a.salarie_id}`}
                      className="text-blue-800 hover:underline"
                    >
                      {nom}
                    </Link>
                  ) : (
                    nom
                  )}
                </p>
              )}
              {afficherDossier && a.dossiers && (
                <p className="text-xs text-gray-500">
                  {a.dossiers.sigle} : {a.dossiers.raison_sociale}
                </p>
              )}
              <p className={afficherSalarie && nom ? "mt-0.5 text-gray-700" : ""}>
                {formatDate(a.date_debut)} → {formatDate(a.date_fin)} ·{" "}
                {Number(a.jours)} j. ouvrés
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Déclaré le {formatDate(a.created_at.slice(0, 10))}
                {a.justificatif_nom ? ` · ${a.justificatif_nom}` : ""}
              </p>
            </div>
            {a.justificatif_chemin ? (
              <a
                href={`/api/arrets-maladie/${a.id}/justificatif`}
                className="text-blue-700 hover:underline whitespace-nowrap"
              >
                Télécharger le justificatif
              </a>
            ) : (
              <span className="text-xs text-gray-400">Sans justificatif</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
