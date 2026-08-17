import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { SupprimerCompte } from "@/components/supprimer-compte";
import { Card, CardBody, PageHeader } from "@/components/ui";

export default async function ClientParametresPage() {
  await requireRole(["client"]);

  return (
    <div className="max-w-xl space-y-6">
      <PageHeader titre="Paramètres" sousTitre="Votre compte" />

      <Link href="/compte" className="block">
        <Card className="transition-colors hover:border-blue-300 hover:bg-blue-50/40">
          <CardBody className="py-4 flex items-center justify-between gap-3">
            <span className="font-semibold text-gray-900">Mon profil</span>
            <span className="text-gray-400" aria-hidden>
              ›
            </span>
          </CardBody>
        </Card>
      </Link>

      <Link href="/contact" className="block">
        <Card className="transition-colors hover:border-blue-300 hover:bg-blue-50/40">
          <CardBody className="py-4 flex items-center justify-between gap-3">
            <span className="font-semibold text-gray-900">Signaler un problème</span>
            <span className="text-gray-400" aria-hidden>
              ›
            </span>
          </CardBody>
        </Card>
      </Link>

      <form action="/auth/deconnexion" method="post">
        <button
          type="submit"
          className="text-sm text-blue-700 hover:underline"
        >
          Déconnexion
        </button>
      </form>

      <SupprimerCompte />
    </div>
  );
}
