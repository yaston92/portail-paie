"use client";

import { useState } from "react";
import Link from "next/link";
import { ChampMotDePasse } from "@/components/champ-mot-de-passe";
import { Alert, Button, Card, CardBody, Input, Label } from "@/components/ui";

export default function InscriptionPage() {
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cabinetNom, setCabinetNom] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoye, setEnvoye] = useState(false);
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
    };
    if (!res.ok) {
      setErreur(json.error ?? "Inscription impossible.");
      setChargement(false);
      return;
    }

    setEnvoye(true);
    setChargement(false);
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
            {envoye ? (
              <Alert variant="success">
                Un email de confirmation a été envoyé. Ouvrez le lien pour activer
                votre cabinet, puis connectez-vous.
              </Alert>
            ) : (
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
                <ChampMotDePasse
                  id="password"
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
            </form>
            )}
            <p className="text-center text-sm mt-4">
              <Link href="/login" className="text-blue-700 hover:underline">
                Déjà un compte ? Se connecter
              </Link>
            </p>
          </CardBody>
        </Card>
        <p className="text-center text-xs text-gray-500 mt-4">
          <Link href="/confidentialite" className="hover:underline">
            Politique de confidentialité
          </Link>
          {" · "}
          <Link href="/contact" className="hover:underline">
            Contact
          </Link>
        </p>
      </div>
    </main>
  );
}
