"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Alert, Button, Card, CardBody, Input, Label } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setChargement(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setErreur(
        "Identifiants incorrects. Vérifiez votre email et votre mot de passe."
      );
      setChargement(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex-1 flex items-center justify-center p-4 bg-gradient-to-b from-blue-50 to-gray-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <Image
            src="/logo-etik.png"
            alt="ETIK Expertise"
            width={72}
            height={72}
            className="mx-auto mb-3 rounded-2xl shadow-sm"
            priority
          />
          <h1 className="text-2xl font-bold text-blue-900 tracking-tight">
            ETIK Paie
          </h1>
        </div>
        <Card>
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-4">
              {erreur && <Alert variant="error">{erreur}</Alert>}
              <div>
                <Label htmlFor="email">Adresse email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="password">Mot de passe</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={chargement}>
                {chargement ? "Connexion…" : "Se connecter"}
              </Button>
              <p className="text-center text-sm">
                <Link
                  href="/inscription"
                  className="text-blue-700 hover:underline font-medium"
                >
                  Pas encore de compte ? S&apos;inscrire
                </Link>
              </p>
              <p className="text-center text-sm">
                <Link
                  href="/mot-de-passe-oublie"
                  className="text-blue-700 hover:underline"
                >
                  Mot de passe oublié ?
                </Link>
              </p>
            </form>
          </CardBody>
        </Card>
      </div>
    </main>
  );
}
