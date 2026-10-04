"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Alert, Button, Card, CardBody, Input, Label } from "@/components/ui";
import { toastSuccess } from "@/lib/toast";

export function ChangerMotDePasseForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (password.length < 8) {
      setErreur("Au moins 8 caractères.");
      return;
    }
    if (password !== confirmation) {
      setErreur("Les deux saisies ne correspondent pas.");
      return;
    }
    setChargement(true);
    const res = await fetch("/api/auth/mot-de-passe-initial", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setChargement(false);
    if (!res.ok) {
      setErreur(json.error ?? "Enregistrement impossible.");
      return;
    }
    toastSuccess("Mot de passe enregistré");
    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex-1 flex items-center justify-center p-4 bg-gradient-to-b from-blue-50 to-gray-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <Image
            src="/logo-etik-paie.png"
            alt="ETIK Paie"
            width={220}
            height={147}
            className="mx-auto mb-3 h-auto w-[220px]"
            priority
          />
        </div>
        <Card>
          <CardBody>
            <h1 className="text-lg font-semibold mb-1">Choisissez votre mot de passe</h1>
            <p className="text-sm text-gray-600 mb-4">
              Votre cabinet vous a communiqué un mot de passe provisoire. Remplacez-le
              pour accéder à votre espace.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              {erreur && <Alert variant="error">{erreur}</Alert>}
              <div>
                <Label htmlFor="password">Nouveau mot de passe</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="confirmation">Confirmation</Label>
                <Input
                  id="confirmation"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={chargement}>
                {chargement ? "Enregistrement…" : "Enregistrer et continuer"}
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </main>
  );
}
