"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Alert, Button, Card, CardBody, Input, Label, Textarea } from "@/components/ui";
import { LEGAL } from "@/lib/legal";

export default function ContactPage() {
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [site, setSite] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [chargement, setChargement] = useState(false);

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setChargement(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nom: nom.trim(),
          email: email.trim(),
          message: message.trim(),
          site,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErreur(json.error || "Envoi impossible.");
        return;
      }
      setOk(true);
    } catch {
      setErreur("Envoi impossible. Réessayez.");
    } finally {
      setChargement(false);
    }
  }

  return (
    <main className="flex-1 bg-gradient-to-b from-blue-50 to-gray-50">
      <div className="mx-auto max-w-lg px-4 py-10">
        <header className="text-center mb-8">
          <Image
            src="/logo-etik-paie.png"
            alt="ETIK Paie"
            width={200}
            height={133}
            className="mx-auto mb-3 h-auto w-[200px]"
          />
          <h1 className="text-2xl font-bold text-blue-900">Contact</h1>
          <p className="text-sm text-gray-500 mt-2">
            Signaler un problème à {LEGAL.editeur}
          </p>
        </header>

        <Card>
          <CardBody>
            {ok ? (
              <Alert variant="success">
                Message envoyé. L&apos;éditeur vous répondra si un suivi est
                nécessaire.
              </Alert>
            ) : (
              <form onSubmit={(e) => void envoyer(e)} className="space-y-4">
                {erreur && <Alert variant="error">{erreur}</Alert>}
                <div>
                  <Label htmlFor="nom">Nom</Label>
                  <Input
                    id="nom"
                    required
                    maxLength={120}
                    value={nom}
                    onChange={(e) => setNom(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="email">Votre email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="hidden" aria-hidden>
                  <Label htmlFor="site">Site</Label>
                  <Input
                    id="site"
                    tabIndex={-1}
                    autoComplete="off"
                    value={site}
                    onChange={(e) => setSite(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="message">Message</Label>
                  <Textarea
                    id="message"
                    required
                    minLength={10}
                    maxLength={4000}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Décrivez le problème rencontré."
                  />
                </div>
                <Button type="submit" className="w-full" disabled={chargement}>
                  {chargement ? "Envoi…" : "Envoyer"}
                </Button>
              </form>
            )}
          </CardBody>
        </Card>

        <p className="text-center text-sm mt-6 space-x-3">
          <Link href="/login" className="text-blue-700 hover:underline">
            Connexion
          </Link>
          <span className="text-gray-300">·</span>
          <Link href="/confidentialite" className="text-blue-700 hover:underline">
            Confidentialité
          </Link>
        </p>
      </div>
    </main>
  );
}
