"use client";

import { useState } from "react";
import Link from "next/link";
import { Alert, Button, Card, CardBody, Input, Label } from "@/components/ui";

export default function MotDePasseOubliePage() {
  const [email, setEmail] = useState("");
  const [envoye, setEnvoye] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setChargement(true);
    try {
      const res = await fetch("/api/auth/mot-de-passe-oublie", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErreur(
          (json as { error?: string }).error ||
            "Impossible d'envoyer l'email. Réessayez dans quelques minutes."
        );
        return;
      }
      setEnvoye(true);
    } catch {
      setErreur("Impossible d'envoyer l'email. Réessayez dans quelques minutes.");
    } finally {
      setChargement(false);
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <Card>
          <CardBody>
            <h1 className="text-lg font-semibold mb-4">Mot de passe oublié</h1>
            {envoye ? (
              <Alert variant="success">
                Si un compte existe pour cette adresse, un email de
                réinitialisation vient d&apos;être envoyé. Ouvrez le lien sur
                votre téléphone ou ordinateur pour choisir un nouveau mot de
                passe.
              </Alert>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {erreur && <Alert variant="error">{erreur}</Alert>}
                <div>
                  <Label htmlFor="email">Adresse email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={chargement}>
                  {chargement ? "Envoi…" : "Envoyer le lien"}
                </Button>
              </form>
            )}
            <p className="text-center text-sm mt-4">
              <Link href="/login" className="text-blue-700 hover:underline">
                Retour à la connexion
              </Link>
            </p>
          </CardBody>
        </Card>
      </div>
    </main>
  );
}
