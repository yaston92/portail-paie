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
  nbPages: number;
  /** False : consultation du découpage, sans correction ni publication. */
  peutModifier?: boolean;
}

function couverture(segments: BulletinSegment[], nbPages: number) {
  const vues = new Array(nbPages + 1).fill(0);
  for (const s of segments) {
    const debut = Math.max(1, s.page_debut);
    const fin = Math.min(nbPages, s.page_fin);
    for (let p = debut; p <= fin; p++) vues[p] += 1;
  }
  const manquantes: number[] = [];
  const doubles: number[] = [];
  for (let p = 1; p <= nbPages; p++) {
    if (vues[p] === 0) manquantes.push(p);
    if (vues[p] > 1) doubles.push(p);
  }
  return { manquantes, doubles };
}

function listePages(pages: number[]): string {
  if (pages.length === 0) return "";
  if (pages.length <= 8) return pages.join(", ");
  return `${pages.slice(0, 8).join(", ")}…`;
}

/**
 * Écran de contrôle de l'appariement avant publication :
 * chaque segment (plage de pages) doit être rattaché au bon salarié.
 * Les soldes de CP extraits sont vérifiables et corrigeables.
 */
export function SegmentsControle({
  uploadId,
  segments: initiaux,
  salaries,
  publie,
  nbPages,
  peutModifier = true,
}: Props) {
  const router = useRouter();
  const [segments, setSegments] = useState(initiaux);
  const [proposes] = useState(
    () => new Map(initiaux.map((s) => [s.id, s.salarie_id]))
  );
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

  function trier(liste: BulletinSegment[]) {
    return [...liste].sort((a, b) => a.page_debut - b.page_debut || a.page_fin - b.page_fin);
  }

  async function changerPages(segmentId: string, debutBrut: string, finBrut: string) {
    const debut = Number(debutBrut);
    const fin = Number(finBrut);
    if (!Number.isInteger(debut) || !Number.isInteger(fin) || debut < 1 || fin < debut || fin > nbPages) {
      toastError(`Indiquez des pages entre 1 et ${nbPages}, la fin après le début.`);
      return;
    }
    setSegments((prev) =>
      trier(prev.map((s) => (s.id === segmentId ? { ...s, page_debut: debut, page_fin: fin } : s)))
    );
    const supabase = createClient();
    const { error } = await supabase
      .from("bulletin_segments")
      .update({ page_debut: debut, page_fin: fin })
      .eq("id", segmentId);
    if (error) {
      toastError("Impossible d'enregistrer ces pages.");
      return;
    }
    toastSuccess(`Bulletin recalé sur les pages ${debut} à ${fin}.`);
  }

  async function couper(segment: BulletinSegment, apresBrut: string) {
    const apres = Number(apresBrut);
    if (!Number.isInteger(apres) || apres < segment.page_debut || apres >= segment.page_fin) {
      toastError("Choisissez une page au milieu du bulletin pour le couper.");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase
      .from("bulletin_segments")
      .update({ page_fin: apres })
      .eq("id", segment.id);
    if (error) {
      toastError("Découpe impossible.");
      return;
    }
    const { data, error: insertError } = await supabase
      .from("bulletin_segments")
      .insert({
        upload_id: uploadId,
        page_debut: apres + 1,
        page_fin: segment.page_fin,
        salarie_id: null,
      })
      .select("*")
      .single();
    if (insertError || !data) {
      toastError("La deuxième partie n'a pas été créée.");
      return;
    }
    setSegments((prev) =>
      trier(
        prev.map((s) => (s.id === segment.id ? { ...s, page_fin: apres } : s)).concat(data as BulletinSegment)
      )
    );
    toastSuccess(`Coupé après la page ${apres}. Affectez le nouveau bulletin.`);
  }

  async function fusionner(index: number) {
    const courant = segments[index];
    const suivant = segments[index + 1];
    if (!courant || !suivant) return;
    const pageDebut = Math.min(courant.page_debut, suivant.page_debut);
    const pageFin = Math.max(courant.page_fin, suivant.page_fin);
    const supabase = createClient();
    const { error } = await supabase
      .from("bulletin_segments")
      .update({ page_debut: pageDebut, page_fin: pageFin })
      .eq("id", courant.id);
    if (error) {
      toastError("Fusion impossible.");
      return;
    }
    await supabase.from("bulletin_segments").delete().eq("id", suivant.id);
    setSegments((prev) =>
      trier(
        prev
          .filter((s) => s.id !== suivant.id)
          .map((s) => (s.id === courant.id ? { ...s, page_debut: pageDebut, page_fin: pageFin } : s))
      )
    );
    toastSuccess("Les deux parties forment un seul bulletin.");
  }

  async function ajouterBulletin() {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("bulletin_segments")
      .insert({
        upload_id: uploadId,
        page_debut: 1,
        page_fin: 1,
        salarie_id: null,
      })
      .select("*")
      .single();
    if (error || !data) {
      toastError("Impossible d'ajouter un bulletin.");
      return;
    }
    setSegments((prev) => trier(prev.concat(data as BulletinSegment)));
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

  const { manquantes, doubles } = couverture(segments, nbPages);
  const fige = publie || !peutModifier;

  function nomSalarie(id: string | null) {
    const s = salaries.find((x) => x.id === id);
    return s ? `${s.nom} ${s.prenom}` : null;
  }

  return (
    <div className="space-y-4">
      {erreur && <Alert variant="error">{erreur}</Alert>}
      {message && <Alert variant="success">{message}</Alert>}

      {!peutModifier && !publie && (
        <Alert>
          Consultation seule : le directeur n&apos;a pas autorisé la publication des bulletins.
        </Alert>
      )}

      <p className="text-sm text-gray-600">
        {nbPages} page{nbPages > 1 ? "s" : ""} dans le PDF, {segments.length} bulletin
        {segments.length > 1 ? "s" : ""} détecté{segments.length > 1 ? "s" : ""}. La lecture
        du PDF propose un salarié (numéro de sécurité sociale, matricule ou nom).
        Ouvrez le PDF, validez l&apos;envoi ou corrigez l&apos;affectation.
      </p>

      {!fige && (
        <div className="flex flex-wrap items-center gap-3">
          {nonApparies > 0 ? (
            <Badge variant="red">{nonApparies} bulletin(s) sans salarié</Badge>
          ) : (
            <Badge variant="green">Chaque bulletin a un salarié</Badge>
          )}
          {manquantes.length === 0 && doubles.length === 0 ? (
            <Badge variant="green">Toutes les pages sont couvertes une fois</Badge>
          ) : null}
          {manquantes.length > 0 && (
            <Badge variant="amber">Pages non attribuées : {listePages(manquantes)}</Badge>
          )}
          {doubles.length > 0 && (
            <Badge variant="red">Pages en double : {listePages(doubles)}</Badge>
          )}
          {doublons.size > 0 && (
            <Badge variant="amber">Un même salarié est sur plusieurs bulletins</Badge>
          )}
          <Button type="button" variant="secondary" onClick={() => void ajouterBulletin()}>
            Ajouter un bulletin
          </Button>
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
            {!fige && <Th></Th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {segments.map((seg, index) => (
            <tr key={seg.id} className={!seg.salarie_id && !publie ? "bg-red-50" : ""}>
              <Td className="whitespace-nowrap">
                {fige ? (
                  seg.page_debut === seg.page_fin
                    ? `p. ${seg.page_debut}`
                    : `p. ${seg.page_debut}–${seg.page_fin}`
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1">
                      <input
                        key={`${seg.id}-d-${seg.page_debut}`}
                        type="number"
                        min={1}
                        max={nbPages}
                        defaultValue={seg.page_debut}
                        aria-label="Page de début"
                        onBlur={(e) =>
                          void changerPages(seg.id, e.target.value, String(seg.page_fin))
                        }
                        className="w-14 rounded border border-gray-300 px-1 py-1 text-sm"
                      />
                      <span className="text-gray-400">à</span>
                      <input
                        key={`${seg.id}-f-${seg.page_fin}`}
                        type="number"
                        min={1}
                        max={nbPages}
                        defaultValue={seg.page_fin}
                        aria-label="Page de fin"
                        onBlur={(e) =>
                          void changerPages(seg.id, String(seg.page_debut), e.target.value)
                        }
                        className="w-14 rounded border border-gray-300 px-1 py-1 text-sm"
                      />
                    </div>
                    {seg.page_fin > seg.page_debut && (
                      <form
                        className="flex items-center gap-1"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const valeur = new FormData(e.currentTarget).get("apres");
                          void couper(seg, String(valeur ?? ""));
                        }}
                      >
                        <span className="text-[11px] text-gray-500">Couper après</span>
                        <input
                          name="apres"
                          type="number"
                          min={seg.page_debut}
                          max={seg.page_fin - 1}
                          defaultValue={seg.page_debut}
                          className="w-14 rounded border border-gray-300 px-1 py-0.5 text-xs"
                        />
                        <button type="submit" className="text-xs text-blue-700 hover:underline">
                          Couper
                        </button>
                      </form>
                    )}
                    {index < segments.length - 1 && (
                      <button
                        type="button"
                        onClick={() => void fusionner(index)}
                        className="block text-xs text-blue-700 hover:underline"
                      >
                        Fusionner avec le suivant
                      </button>
                    )}
                  </div>
                )}
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
                {fige ? (
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
                {!fige && seg.salarie_id && proposes.get(seg.id) === seg.salarie_id && (
                  <p className="mt-1 text-[11px] text-gray-500">Lu dans le bulletin</p>
                )}
                {!fige && seg.salarie_id && proposes.get(seg.id) !== seg.salarie_id && (
                  <p className="mt-1 text-[11px] text-gray-500">Affectation modifiée</p>
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
                  {fige ? (
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
              {!fige && (
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

      {!fige && (
        <div className="flex items-center gap-4">
          <Button
            onClick={publier}
            disabled={publication || nonApparies > 0 || doubles.length > 0}
          >
            {publication ? "Publication…" : "Valider et publier"}
          </Button>
          {nonApparies > 0 && (
            <span className="text-sm text-red-600">
              Affectez chaque bulletin à un salarié avant de publier.
            </span>
          )}
          {doubles.length > 0 && (
            <span className="text-sm text-red-600">
              Des pages se recouvrent. Ajustez le découpage avant de publier.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
