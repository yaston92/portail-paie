import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: `Politique de confidentialité — ${LEGAL.application}`,
  description: `Politique de confidentialité de ${LEGAL.application}.`,
  robots: "index, follow",
};

export default function ConfidentialitePage() {
  return (
    <main className="flex-1 bg-gradient-to-b from-blue-50 to-gray-50">
      <article className="mx-auto max-w-2xl px-4 py-10">
        <header className="text-center mb-8">
          <Image
            src="/logo-etik-paie.png"
            alt="ETIK Paie"
            width={200}
            height={133}
            className="mx-auto mb-3 h-auto w-[200px]"
          />
          <h1 className="text-2xl font-bold text-blue-900">
            Politique de confidentialité
          </h1>
          <p className="text-sm text-gray-500 mt-2">
            {LEGAL.application} · {LEGAL.editeur}
            <br />
            {LEGAL.derniereMiseAJour}
          </p>
        </header>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm space-y-6 text-sm leading-relaxed text-gray-700">
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">
              Responsable
            </h2>
            <p>
              {LEGAL.editeur} est responsable du traitement des données de
              l&apos;application {LEGAL.application}.
              Contact :{" "}
              <a
                href={`mailto:${LEGAL.emailContact}`}
                className="text-blue-700 hover:underline"
              >
                {LEGAL.emailContact}
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">
              Données collectées
            </h2>
            <p>
              Identité et compte (nom, prénom, email), documents nécessaires à
              la paie (pièces d&apos;identité, bulletins, absences) et, sur
              mobile, photos uniquement si vous déposez un justificatif.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">
              Utilisation
            </h2>
            <p>
              Ces données servent uniquement à fournir le service (compte,
              échanges cabinet / employeurs / salariés, bulletins). Elles ne
              sont ni vendues ni utilisées à des fins publicitaires.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">
              Conservation et droits
            </h2>
            <p>
              Les données sont hébergées dans l&apos;Union européenne et
              conservées le temps nécessaire au service et aux obligations
              légales. Vous pouvez supprimer votre compte depuis Paramètres.
              Vous pouvez aussi demander l&apos;accès, la rectification ou
              la suppression à {LEGAL.emailContact}. Réclamation possible
              auprès de la CNIL.
            </p>
          </section>
        </div>

        <p className="text-center text-sm mt-8">
          <Link href="/login" className="text-blue-700 hover:underline">
            Retour à la connexion
          </Link>
        </p>
      </article>
    </main>
  );
}
