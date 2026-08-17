"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, CardBody, Input, Label, PageHeader } from "@/components/ui";
import { toastError, toastSuccess } from "@/lib/toast";
import type { Cabinet } from "@/lib/types";

export function CabinetsDirecteurClient({
  initiaux,
  actifId,
}: {
  initiaux: Cabinet[];
  actifId: string | null;
}) {
  const router = useRouter();
  const [nom, setNom] = useState("");
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [editionId, setEditionId] = useState<string | null>(null);
  const [editionNom, setEditionNom] = useState("");
  const [renommeBusy, setRenommeBusy] = useState(false);

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (!nom.trim()) {
      setErreur("Nom requis");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/cabinets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nom: nom.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErreur(json.error ?? "Création impossible");
        toastError(json.error ?? "Création impossible");
        return;
      }
      if (json.cabinet?.id) {
        await fetch("/api/cabinet/actif", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cabinet_id: json.cabinet.id }),
        });
      }
      toastSuccess("Cabinet créé");
      setNom("");
      router.refresh();
    } catch {
      setErreur("Création impossible");
    } finally {
      setBusy(false);
    }
  }

  async function archiver(id: string, archive: boolean) {
    const res = await fetch(`/api/cabinets/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archive }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toastError(json.error ?? "Échec");
      return;
    }
    toastSuccess(archive ? "Cabinet archivé" : "Cabinet réactivé");
    router.refresh();
  }

  async function activer(id: string) {
    await fetch("/api/cabinet/actif", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cabinet_id: id }),
    });
    toastSuccess("Cabinet actif changé");
    router.refresh();
  }

  function commencerEdition(c: Cabinet) {
    setEditionId(c.id);
    setEditionNom(c.nom);
  }

  async function enregistrerNom(id: string) {
    const nouveau = editionNom.trim();
    if (!nouveau) {
      toastError("Nom requis");
      return;
    }
    setRenommeBusy(true);
    try {
      const res = await fetch(`/api/cabinets/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nom: nouveau }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError(json.error ?? "Renommage impossible");
        return;
      }
      toastSuccess("Nom mis à jour");
      setEditionId(null);
      router.refresh();
    } finally {
      setRenommeBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        titre="Cabinets"
        sousTitre="Créez et gérez vos cabinets. Les dossiers et collaborateurs sont rattachés à un cabinet."
      />

      <Card>
        <CardBody>
          <h2 className="font-semibold mb-3">Nouveau cabinet</h2>
          <form onSubmit={(e) => void creer(e)} className="space-y-3">
            {erreur && <Alert variant="error">{erreur}</Alert>}
            <div>
              <Label>Nom</Label>
              <Input
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder="ex. Cabinet Paris"
                required
              />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? "Création…" : "Créer"}
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 className="font-semibold mb-3">Mes cabinets</h2>
          {initiaux.length === 0 ? (
            <p className="text-sm text-gray-500">Aucun cabinet pour le moment.</p>
          ) : (
            <ul className="divide-y divide-gray-100 text-sm">
              {initiaux.map((c) => (
                <li key={c.id} className="py-3 space-y-2">
                  {editionId === c.id ? (
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="flex-1 min-w-[10rem]">
                        <Label>Nom</Label>
                        <Input
                          value={editionNom}
                          onChange={(e) => setEditionNom(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void enregistrerNom(c.id);
                            }
                            if (e.key === "Escape") setEditionId(null);
                          }}
                        />
                      </div>
                      <Button
                        type="button"
                        disabled={renommeBusy}
                        onClick={() => void enregistrerNom(c.id)}
                      >
                        {renommeBusy ? "Enregistrement…" : "Enregistrer"}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={renommeBusy}
                        onClick={() => setEditionId(null)}
                      >
                        Annuler
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold">{c.nom}</p>
                        {c.archive && (
                          <p className="text-xs text-amber-700">Archivé</p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {!c.archive &&
                          (c.id === actifId ? (
                            <Button
                              type="button"
                              variant="secondary"
                              disabled
                              className="bg-gray-100 text-gray-500 border-gray-200"
                            >
                              Activé
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => void activer(c.id)}
                            >
                              Activer
                            </Button>
                          ))}
                        {!c.archive && (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => commencerEdition(c)}
                          >
                            Renommer
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => void archiver(c.id, !c.archive)}
                        >
                          {c.archive ? "Réactiver" : "Archiver"}
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
