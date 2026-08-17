import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { moisLabel, formatDate } from "@/lib/format";
import { composerNoteAvecSortie, texteNoteSortie } from "@/lib/sortie";
import { NATURE_LABELS, type Absence, type SaisieVariables, type Salarie } from "@/lib/types";
import { totauxAbsences } from "@/lib/campagne";

interface RecapParams {
  sigle: string;
  raisonSociale: string;
  mois: string;
  dateEnvoi: string;
  paiesIdentiques: boolean;
  attendus: Salarie[];
  saisies: Map<string, SaisieVariables>;
  absencesParSaisie: Map<string, Absence[]>;
  noteMois?: string | null;
}

/** Helvetica (WinAnsi) n’accepte pas les espaces fins FR ni certains glyphes. */
function sanitizePdfText(texte: string): string {
  return texte
    .replace(/[\u202F\u00A0\u2000-\u200B\uFEFF]/g, " ")
    .replace(/[’‘‛]/g, "'")
    .replace(/[“”„«»]/g, '"')
    .replace(/[–:]/g, "-")
    .replace(/…/g, "...")
    .replace(/€/g, "EUR")
    .replace(/[^\t\n\r\x20-\x7E\xA0-\xFF]/g, "");
}

function formatNombrePdf(n: number): string {
  return sanitizePdfText(n.toLocaleString("fr-FR"));
}

/** Génère le récapitulatif PDF d'une campagne de variables de paie. */
export async function genererRecapPdf(params: RecapParams): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const marge = 50;
  let page = doc.addPage([595, 842]); // A4
  let y = 842 - marge;

  function nouvellePageSiBesoin(hauteur: number) {
    if (y - hauteur < marge) {
      page = doc.addPage([595, 842]);
      y = 842 - marge;
    }
  }

  function ligne(texte: string, options?: { bold?: boolean; taille?: number; retrait?: number }) {
    const taille = options?.taille ?? 10;
    const safe = sanitizePdfText(texte);
    if (!safe) {
      y -= taille + 6;
      return;
    }
    nouvellePageSiBesoin(taille + 6);
    page.drawText(safe, {
      x: marge + (options?.retrait ?? 0),
      y,
      size: taille,
      font: options?.bold ? fontBold : font,
      color: rgb(0.1, 0.1, 0.15),
    });
    y -= taille + 6;
  }

  ligne(`Variables de paie : ${moisLabel(params.mois)}`, { bold: true, taille: 16 });
  ligne(`${params.sigle} : ${params.raisonSociale}`, { taille: 11 });
  ligne(`Envoyé le ${formatDate(params.dateEnvoi.slice(0, 10))}`, { taille: 9 });
  y -= 10;

  if (params.paiesIdentiques) {
    const salariesAvecCp = params.attendus.filter((salarie) => {
      const saisie = params.saisies.get(salarie.id);
      if (!saisie) return false;
      const absences = params.absencesParSaisie.get(saisie.id) ?? [];
      return absences.some((a) => a.nature === "cp");
    });

    const sorties = params.attendus.filter((s) => !!s.date_sortie);

    if (salariesAvecCp.length === 0 && sorties.length === 0) {
      ligne("Paies identiques au mois précédent : rien à signaler.", { bold: true });
    } else {
      if (salariesAvecCp.length === 0) {
        ligne("Paies identiques au mois précédent.", { bold: true });
      } else {
        ligne(
          "Paies identiques au mois précédent, avec congés payés validés à prendre en compte :",
          { bold: true }
        );
        y -= 4;
        for (const salarie of salariesAvecCp) {
          const saisie = params.saisies.get(salarie.id)!;
          const cps = (params.absencesParSaisie.get(saisie.id) ?? []).filter(
            (a) => a.nature === "cp"
          );
          const heures = cps.reduce((acc, a) => acc + Number(a.heures), 0);
          nouvellePageSiBesoin(50);
          y -= 4;
          ligne(
            `${salarie.nom} ${salarie.prenom}${
              salarie.matricule ? ` (matricule ${salarie.matricule})` : ""
            }`,
            { bold: true, taille: 11 }
          );
          ligne(`Congés payés : ${cps.length} jour(s), ${formatNombrePdf(heures)} h`, {
            retrait: 12,
          });
          const jours = cps
            .sort((a, b) => a.jour.localeCompare(b.jour))
            .map((a) => formatDate(a.jour))
            .join(", ");
          for (let i = 0; i < jours.length; i += 90) {
            ligne(jours.slice(i, i + 90), { retrait: 24, taille: 8 });
          }
          const note = composerNoteAvecSortie(saisie.note, salarie);
          if (note) {
            ligne(`Note : ${note}`, { retrait: 12, taille: 9 });
          }
        }
      }

      if (sorties.length > 0) {
        y -= 8;
        ligne("Sorties a prendre en compte :", { bold: true });
        for (const salarie of sorties) {
          const texte = texteNoteSortie(salarie);
          if (!texte) continue;
          ligne(
            `${salarie.nom} ${salarie.prenom}${
              salarie.matricule ? ` (matricule ${salarie.matricule})` : ""
            } : ${texte}`,
            { retrait: 12, taille: 10 }
          );
        }
      }
    }
  } else {
    for (const salarie of params.attendus) {
      nouvellePageSiBesoin(60);
      y -= 6;
      ligne(`${salarie.nom} ${salarie.prenom}${salarie.matricule ? ` (matricule ${salarie.matricule})` : ""}`, {
        bold: true,
        taille: 11,
      });
      const saisie = params.saisies.get(salarie.id);
      if (!saisie || !saisie.mode) {
        const noteSortieSeule = composerNoteAvecSortie(null, salarie);
        if (noteSortieSeule) {
          ligne(`Note : ${noteSortieSeule}`, { retrait: 12, taille: 9 });
        } else {
          ligne("Aucune saisie.", { retrait: 12 });
        }
        continue;
      }
      if (saisie.mode === "ras") {
        ligne("Rien à signaler.", { retrait: 12 });
      } else if (saisie.mode === "net") {
        ligne(
          `Remuneration nette a verser : ${formatNombrePdf(Number(saisie.net_montant))} EUR`,
          { retrait: 12 }
        );
      } else {
        if (saisie.heures_supp) {
          ligne(`Heures supplémentaires : ${saisie.heures_supp} h`, { retrait: 12 });
        }
        const absences = params.absencesParSaisie.get(saisie.id) ?? [];
        if (absences.length === 0 && !saisie.heures_supp) {
          ligne("Variables saisies : aucune absence, aucune heure supplémentaire.", { retrait: 12 });
        }
        const totaux = totauxAbsences(absences);
        for (const [nature, t] of totaux) {
          ligne(
            `${NATURE_LABELS[nature as keyof typeof NATURE_LABELS] ?? nature} : ${t.jours} jour(s), ${formatNombrePdf(t.heures)} h`,
            { retrait: 12 }
          );
        }
        const jours = absences
          .sort((a, b) => a.jour.localeCompare(b.jour))
          .map((a) => `${formatDate(a.jour)} (${NATURE_LABELS[a.nature]})`)
          .join(", ");
        if (jours) {
          // découpe en lignes de 90 caractères
          for (let i = 0; i < jours.length; i += 90) {
            ligne(jours.slice(i, i + 90), { retrait: 24, taille: 8 });
          }
        }
      }
      const note = composerNoteAvecSortie(saisie.note, salarie);
      if (note) {
        ligne(`Note : ${note}`, { retrait: 12, taille: 9 });
      }
    }
  }

  if (params.noteMois) {
    y -= 10;
    ligne("Note du mois :", { bold: true });
    for (let i = 0; i < params.noteMois.length; i += 95) {
      ligne(params.noteMois.slice(i, i + 95), { retrait: 12, taille: 9 });
    }
  }

  return doc.save();
}
