import Link from "next/link";
import { Card, CardBody } from "@/components/ui";

export default function VerifierEmailPage() {
  return (
    <main className="flex-1 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardBody className="space-y-3">
          <h1 className="text-lg font-semibold">Confirmez votre email</h1>
          <p className="text-sm text-gray-600">
            Un lien a été envoyé à votre adresse. Ouvrez-le pour activer le cabinet.
            Tant que ce n&apos;est pas fait, la connexion reste bloquée.
          </p>
          <Link href="/login" className="text-sm text-blue-700 hover:underline">
            Retour à la connexion
          </Link>
        </CardBody>
      </Card>
    </main>
  );
}
