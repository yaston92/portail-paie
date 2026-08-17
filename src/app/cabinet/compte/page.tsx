import Link from "next/link";
import {
  peutAdminCabinet,
  requireCabinetContext,
} from "@/lib/cabinet";
import { ROLES_CABINET } from "@/lib/types";
import { Button, Card, CardBody, PageHeader } from "@/components/ui";
import { SupprimerCompte } from "@/components/supprimer-compte";

/** Hub Compte — même structure que l’onglet Compte de l’app. */
export default async function CabinetComptePage() {
  const { profile, cabinet } = await requireCabinetContext(ROLES_CABINET, {
    allowEmptyDirecteur: true,
  });

  const estAdmin = cabinet
    ? peutAdminCabinet(profile, cabinet)
    : profile.role === "directeur";

  return (
    <div className="space-y-4">
      <PageHeader
        titre="Compte"
        sousTitre="Profil et paramètres"
      />

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

      {estAdmin && (
        <div className="space-y-2 pt-1">
          <p className="text-sm font-bold text-gray-900">Administration</p>
          <Link href="/cabinet/parametres" className="block">
            <Card className="transition-colors hover:border-blue-300 hover:bg-blue-50/40">
              <CardBody className="py-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-gray-900">RGPD</span>
                  <span className="text-gray-400" aria-hidden>
                    ›
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  Durées de conservation des documents
                </p>
              </CardBody>
            </Card>
          </Link>
        </div>
      )}

      <form action="/auth/deconnexion" method="post" className="pt-2">
        <Button type="submit" variant="danger" className="w-full sm:w-auto">
          Déconnexion
        </Button>
      </form>

      <SupprimerCompte />
    </div>
  );
}
