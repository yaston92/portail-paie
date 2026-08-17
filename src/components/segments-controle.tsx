"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Alert, Badge, Button, Select, TableWrap, Td, Th } from "@/components/ui";
import { toastError, toastSuccess } from "@/lib/toast";
import type { BulletinSegment } from "@/lib/types";

interface SalarieOption {
  id: string;
  nom: string;
  prenom: string;
  matricule: string | null;
}

interface Props {
  uploadId: string;
  segments: BulletinSegment[];
  salaries: SalarieOption[];
  publie: boolean;
}

/**
 * Écran de contrôle de l'appariement avant publication :
 * chaque segment (plage de pages) doit être rattaché au bon salarié.
 * Les soldes de CP extraits sont vérifiables et corrigeables.
 */
export function SegmentsControle({ uploadId, segments: initiaux, salaries, publie }: Props) {
  const router = useRouter();
  const [segments, setSegments] = useState(initiaux);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [publication, setPublication] = useState(false);

  const nonApparies = segments.filter((s) => !s.salarie_id).length;
  const salariesAssignes = segments.map((s) => s.salarie_id).filter(Boolean);
  const doublons = new Set(
    salariesAssignes.filter((id, i) => salariesAssignes.indexOf(id) !== i)
  );

  async function majSegment(
    segmentId: string,
    champs: Partial<
      Pick<
        BulletinSegment,
        | "salarie_id"
        | "cp_acquis"
        | "cp_pris"
        | "cp_restant"
        | "cp_acquis_n1"
        | "cp_acquis_n"
        | "cp_pris_n1"
        | "cp_pris_n"
      >
    >
  ) {
    setErreur(null);
    setSegments((prev) =>
      prev.map((s) => (s.id === segmentId ? { ...s, ...champs } : s))
    );
    const supabase = createClient();
    const { error } = await supabase
      .from("bulletin_segments")
      .update(champs)
      .eq("id", segmentId);
    if (error) setErreur("Échec de l'enregistrement de la correction.");
  }

  async function supprimerSegment(segmentId: string) {
    setSegments((prev) => prev.filter((s) => s.id !== segmentId));
    const supabase = createClient();
    await supabase.from("bulletin_segments").delete().eq("id", segmentId);
  }

  async function publier() {
    setErreur(null);
    setPublication(true);
    const res = await fetch(`/api/bulletins/uploads/${uploadId}/publier`, {
      method: "POST",
    });
    const json = await res.json();
    setPublication(false);
    if (!res.ok) {
      const msg = json.error ?? "Échec de la publication.";
      setErreur(msg);
      toastError(msg);
      return;
    }
    const ok = `${json.publies} bulletin(s) publié(s). Le client et les salariés ont été notifiés.`;
    setMessage(ok);
    toastSuccess(ok);
    router.refresh();
  }

  function nomSalarie(id: string | null) {
    const s = salaries.find((x) => x.id === id);
    return s ? `${s.nom} ${s.prenom}` : null;
  }

  return (
    <div className="space-y-4">
      {erreur && <Alert variant="error">{erreur}</Alert>}
      {message && <Alert variant="success">{message}</Alert>}

      {!publie && (
        <div className="flex flex-wrap items-center gap-3">
          {nonApparies > 0 ? (
            <Badge variant="red">{nonApparies} segment(s) non apparié(s)</Badge>
          ) : (
            <Badge variant="green">Tous les segments sont appariés</Badge>
          )}
          {doublons.size > 0 && (
            <Badge variant="amber">
              Attention : un même salarié est affecté à plusieurs segments
            </Badge>
          )}
        </div>
      )}

      <TableWrap>
        <thead className="bg-gray-50">
          <tr>
            <Th>Pages</Th>
            <Th>Aperçu</Th>
            <Th>Salarié</Th>
            <Th>Acq. N-1</Th>
            <Th>Acq. N</Th>
            <Th>Pris N-1</Th>
            <Th>Pris N</Th>
            <Th>Solde</Th>
            {!publie && <Th></Th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {segments.map((seg) => (
            <tr key={seg.id} className={!seg.salarie_id && !publie ? "bg-red-50" : ""}>
              <Td className="whitespace-nowrap">
                {seg.page_debut === seg.page_fin
                  ? `p. ${seg.page_debut}`
                  : `p. ${seg.page_debut}–${seg.page_fin}`}
              </Td>
              <Td>
                <a
                  href={`/api/bulletins/uploads/${uploadId}/segment/${seg.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-700 hover:underline text-sm"
                >
                  Voir le PDF
                </a>
              </Td>
              <Td className="min-w-56">
                {publie ? (
                  nomSalarie(seg.salarie_id) ?? "-"
                ) : (
                  <Select
                    value={seg.salarie_id ?? ""}
                    onChange={(e) =>
                      majSegment(seg.id, { salarie_id: e.target.value || null })
                    }
                  >
                    <option value="">- Non apparié -</option>
                    {salaries.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nom} {s.prenom}
                        {s.matricule ? ` (${s.matricule})` : ""}
                      </option>
                    ))}
                  </Select>
                )}
              </Td>
              {(
                [
                  "cp_acquis_n1",
                  "cp_acquis_n",
                  "cp_pris_n1",
                  "cp_pris_n",
                  "cp_restant",
                ] as const
              ).map((champ) => (
                <Td key={champ}>
                  {publie ? (
                    (seg[champ] ??
                      (champ === "cp_restant" ? seg.cp_restant : null) ??
                      ":")
                  ) : (
                    <input
                      type="number"
                      step="0.01"
                      defaultValue={seg[champ] ?? ""}
                      onBlur={(e) => {
                        const val =
                          e.target.value === "" ? null : parseFloat(e.target.value);
                        const patch: Partial<BulletinSegment> = { [champ]: val };
                        // Recalcule totaux acquis/pris si détail saisi
                        if (champ !== "cp_restant") {
                          const next = { ...seg, ...patch };
                          const aN1 = next.cp_acquis_n1;
                          const aN = next.cp_acquis_n;
                          const pN1 = next.cp_pris_n1;
                          const pN = next.cp_pris_n;
                          if (aN1 != null && aN != null) {
                            patch.cp_acquis = Math.round((aN1 + aN) * 100) / 100;
                          }
                          if (pN1 != null && pN != null) {
                            patch.cp_pris = Math.round((pN1 + pN) * 100) / 100;
                          }
                        }
                        majSegment(seg.id, patch);
                      }}
                      className="w-16 rounded border border-gray-300 px-1 py-1 text-sm"
                    />
                  )}
                </Td>
              ))}
              {!publie && (
                <Td>
                  <button
                    type="button"
                    onClick={() => supprimerSegment(seg.id)}
                    className="text-xs text-red-600 hover:underline"
                    title="Supprimer ce segment (il ne sera pas publié)"
                  >
                    Supprimer
                  </button>
                </Td>
              )}
            </tr>
          ))}
        </tbody>
      </TableWrap>

      {!publie && (
        <div className="flex items-center gap-4">
          <Button onClick={publier} disabled={publication || nonApparies > 0}>
            {publication ? "Publication…" : "Publier les bulletins"}
          </Button>
          {nonApparies > 0 && (
            <span className="text-sm text-red-600">
              Appariez tous les segments avant de publier.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
