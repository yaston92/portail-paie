"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { Alert, Button, Card, CardBody, Input, Label } from "@/components/ui";

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

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function preparerSession() {
      setErreur(null);
      const token_hash = params.get("token_hash");
      const type = params.get("type") as EmailOtpType | null;

      if (token_hash && type) {
        const types: EmailOtpType[] =
          type === "magiclink" || type === "recovery" || type === "invite"
            ? [type, "magiclink", "recovery", "invite"]
            : [type];

        let ok = false;
        const seen = new Set<string>();
        for (const t of types) {
          if (seen.has(t)) continue;
          seen.add(t);
          const { error } = await supabase.auth.verifyOtp({ type: t, token_hash });
          if (!error) {
            ok = true;
            break;
          }
        }
        if (!cancelled) {
          if (!ok) {
            setErreur(
              "Ce lien d'activation n'est plus valide. Demandez un nouvel envoi depuis l'espace admin."
            );
            setInit(false);
            return;
          }
          window.history.replaceState({}, "", "/definir-mot-de-passe");
        }
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
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setErreur(
        "Impossible de définir le mot de passe. Le lien a peut-être expiré : demandez-en un nouveau."
      );
      setChargement(false);
      return;
    }
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
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
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
