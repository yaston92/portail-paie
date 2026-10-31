import Link from "next/link";
import { Card, CardBody } from "@/components/ui";

export default function LienExpirePage() {
  return (
    <main className="flex-1 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardBody className="space-y-3">
          <h1 className="text-lg font-semibold">Lien expiré</h1>
          <p className="text-sm text-gray-600">
            Ce lien n&apos;est plus valable. Les liens envoyés par email durent 48 heures.
            Demandez un nouvel envoi.
          </p>
          <Link href="/mot-de-passe-oublie" className="text-sm text-blue-700 hover:underline">
            Mot de passe oublié
          </Link>
        </CardBody>
      </Card>
    </main>
  );
}
