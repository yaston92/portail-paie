"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { lireJetonActivation } from "@/lib/lien-activation";
import { createClient } from "@/lib/supabase/client";
import { ChampMotDePasse } from "@/components/champ-mot-de-passe";
import { Alert, Button, Card, CardBody, Label } from "@/components/ui";

/**
 * Après invitation / reset : le lien email peut amener token_hash ici.
 * On vérifie le OTP côté navigateur (fiable derrière tunnel Cloudflare),
 * puis on affiche uniquement la création de mot de passe.
 */
function DefinirMotDePasseForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);
  const [sessionOk, setSessionOk] = useState(false);
  const [init, setInit] = useState(true);
  const [jeton, setJeton] = useState<{ token_hash: string; type: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function preparerSession() {
      setErreur(null);
      const lu =
        typeof window !== "undefined"
          ? lireJetonActivation(window.location.search)
          : null;
      const token_hash = lu?.token_hash ?? params.get("token_hash");
      const type = (lu?.type ?? params.get("type") ?? "recovery") as EmailOtpType;

      if (token_hash) {
        if (!cancelled) {
          setJeton({ token_hash, type });
          setSessionOk(true);
          setInit(false);
        }
        return;
      } else {
        const code = params.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (!cancelled && error) {
            setErreur(
              "Ce lien d'activation n'est plus valide. Demandez un nouvel envoi depuis l'espace admin."
            );
            setInit(false);
            return;
          }
          if (!cancelled) {
            window.history.replaceState({}, "", "/definir-mot-de-passe");
          }
        } else if (typeof window !== "undefined" && window.location.hash) {
          // Anciens liens Supabase : #access_token=…&refresh_token=…
          const hash = new URLSearchParams(window.location.hash.slice(1));
          const access_token = hash.get("access_token");
          const refresh_token = hash.get("refresh_token");
          if (access_token && refresh_token) {
            const { error } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });
            if (!cancelled && error) {
              setErreur(
                "Ce lien d'activation n'est plus valide. Demandez un nouvel envoi depuis l'espace admin."
              );
              setInit(false);
              return;
            }
            if (!cancelled) {
              window.history.replaceState({}, "", "/definir-mot-de-passe");
            }
          }
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!cancelled) {
        if (!session) {
          setErreur(
            "Session introuvable. Ouvrez le lien reçu par email, ou demandez une nouvelle invitation."
          );
        } else {
          setSessionOk(true);
        }
        setInit(false);
      }
    }

    void preparerSession();
    return () => {
      cancelled = true;
    };
  }, [params]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (password.length < 10) {
      setErreur("Le mot de passe doit contenir au moins 10 caractères.");
      return;
    }
    if (password !== confirmation) {
      setErreur("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setChargement(true);
    const res = await fetch("/api/auth/definir-mot-de-passe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        password,
        token_hash: jeton?.token_hash,
        type: jeton?.type,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      email?: string | null;
      access_token?: string | null;
      refresh_token?: string | null;
    };
    if (!res.ok) {
      setErreur(json.error ?? "Impossible de définir le mot de passe.");
      setChargement(false);
      return;
    }
    const supabase = createClient();
    if (json.access_token && json.refresh_token) {
      const { error } = await supabase.auth.setSession({
        access_token: json.access_token,
        refresh_token: json.refresh_token,
      });
      if (error && json.email) {
        await supabase.auth.signInWithPassword({ email: json.email, password });
      }
    }
    window.history.replaceState({}, "", "/definir-mot-de-passe");
    const { toastSuccess } = await import("@/lib/toast");
    toastSuccess("Mot de passe enregistré");
    router.push("/");
    router.refresh();
  }

  if (init) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-gray-500">Activation de votre accès…</p>
        </CardBody>
      </Card>
    );
  }

  if (!sessionOk) {
    return (
      <Card>
        <CardBody className="space-y-3">
          <h1 className="text-lg font-semibold">Lien non valide</h1>
          {erreur && <Alert variant="error">{erreur}</Alert>}
          <Button type="button" className="w-full" onClick={() => router.push("/login")}>
            Aller à la connexion
          </Button>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody>
        <h1 className="text-lg font-semibold mb-1">Créer votre mot de passe</h1>
        <p className="text-sm text-gray-500 mb-4">
          Bienvenue sur ETIK Paie. Choisissez un mot de passe d&apos;au moins 10
          caractères pour activer votre espace.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          {erreur && <Alert variant="error">{erreur}</Alert>}
          <div>
            <Label htmlFor="password">Nouveau mot de passe</Label>
            <ChampMotDePasse
              id="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="confirmation">Confirmation</Label>
            <ChampMotDePasse
              id="confirmation"
              autoComplete="new-password"
              required
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={chargement}>
            {chargement ? "Enregistrement…" : "Enregistrer et accéder"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

export default function DefinirMotDePassePage() {
  return (
    <main className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <Suspense
          fallback={
            <Card>
              <CardBody>
                <p className="text-sm text-gray-500">Chargement…</p>
              </CardBody>
            </Card>
          }
        >
          <DefinirMotDePasseForm />
        </Suspense>
      </div>
    </main>
  );
}
