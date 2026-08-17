"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Alert, Button, Card, CardBody, Input, Label } from "@/components/ui";

export default function InscriptionPage() {
  const router = useRouter();
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cabinetNom, setCabinetNom] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setChargement(true);

    const res = await fetch("/api/auth/inscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim(),
        password,
        nom: nom.trim(),
        prenom: prenom.trim(),
        cabinet_nom: cabinetNom.trim() || undefined,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      cabinet_id?: string;
    };
    if (!res.ok) {
      setErreur(json.error ?? "Inscription impossible.");
      setChargement(false);
      return;
    }

    if (json.cabinet_id) {
      await fetch("/api/cabinet/actif", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cabinet_id: json.cabinet_id }),
      });
    }

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setErreur("Compte créé, mais connexion échouée. Connectez-vous depuis l'accueil.");
      setChargement(false);
      return;
    }
    router.push("/cabinet");
    router.refresh();
  }

  return (
    <main className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-blue-800">Créer un compte</h1>
          <p className="text-sm text-gray-500 mt-1">
            Compte directeur ETIK Paie + premier cabinet
          </p>
        </div>
        <Card>
          <CardBody>
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              {erreur && <Alert variant="error">{erreur}</Alert>}
              <div>
                <Label htmlFor="prenom">Prénom</Label>
                <Input
                  id="prenom"
                  required
                  value={prenom}
                  onChange={(e) => setPrenom(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="nom">Nom</Label>
                <Input
                  id="nom"
                  required
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                />
              </div>
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
                <Label htmlFor="password">Mot de passe (8 caractères min.)</Label>
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
                <Label htmlFor="cabinet">Nom du cabinet (optionnel)</Label>
                <Input
                  id="cabinet"
                  value={cabinetNom}
                  onChange={(e) => setCabinetNom(e.target.value)}
                  placeholder="ex. Cabinet Paris"
                />
              </div>
              <Button type="submit" className="w-full" disabled={chargement}>
                {chargement ? "Création…" : "S'inscrire"}
              </Button>
              <p className="text-center text-sm">
                <Link href="/login" className="text-blue-700 hover:underline">
                  Déjà un compte ? Se connecter
                </Link>
              </p>
            </form>
          </CardBody>
        </Card>
        <p className="text-center text-xs text-gray-500 mt-4">
          <Link href="/confidentialite" className="hover:underline">
            Politique de confidentialité
          </Link>
        </p>
      </div>
    </main>
  );
}
