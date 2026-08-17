import path from "path";
import { pathToFileURL } from "url";
import { PDFDocument } from "pdf-lib";
import type { Salarie } from "@/lib/types";

/**
 * Analyse du PDF global de bulletins produit par le logiciel de paie (Silae / Cegid…).
 * Un bulletin peut faire une ou plusieurs pages : le découpage se fait par
 * détection du salarié (matricule ou nom/prénom) dans le texte de chaque page,
 * jamais à nombre de pages fixe.
 */

export interface SegmentDetecte {
  pageDebut: number; // 1-indexé
  pageFin: number;
  salarieId: string | null;
  cpAcquis: number | null;
  cpPris: number | null;
  cpRestant: number | null;
  cpAcquisN1: number | null;
  cpAcquisN: number | null;
  cpPrisN1: number | null;
  cpPrisN: number | null;
  texteApercu: string;
}

/** Normalise un texte pour la comparaison : majuscules, sans accents ni espaces multiples. */
export function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ");
}

/** Vérifie l'en-tête PDF (%PDF-). */
export function estPdfValide(contenu: Buffer): boolean {
  if (contenu.length < 5) return false;
  const debut = contenu.subarray(0, 5).toString("latin1");
  return debut === "%PDF-";
}

function standardFontsUrl(): string {
  // process.cwd() est fiable dans les routes API Next (import.meta.url peut être bundlé).
  const fontsDir = path.join(
    process.cwd(),
    "node_modules",
    "pdfjs-dist",
    "standard_fonts"
  );
  return pathToFileURL(fontsDir + path.sep).href;
}

/**
 * Copie défensive des octets : pdfjs peut « transfer » / détacher le buffer,
 * ce qui casse si on passe un Buffer Node partagé.
 */
function octetsPdf(pdf: Buffer): Uint8Array {
  const data = new Uint8Array(pdf.byteLength);
  data.set(pdf);
  return data;
}

/** Reconstruit le texte d'une page en ordre de lecture visuelle (haut→bas, gauche→droite).
 * Indispensable pour les tableaux Silae (CP N-1 / N) : l'ordre brut pdfjs mélange les colonnes.
 */
function textePageDepuisItems(items: unknown[]): string {
  type Point = { str: string; x: number; y: number };
  const bruts: Point[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object" || !("str" in item)) continue;
    const it = item as { str: string; transform?: number[] };
    if (!it.str) continue;
    const x = it.transform?.[4] ?? 0;
    const y = it.transform?.[5] ?? 0;
    bruts.push({ str: it.str, x, y });
  }

  // Silae double souvent les glyphes : on déduplique les chevauchements exacts
  const vus = new Set<string>();
  const points: Point[] = [];
  for (const p of bruts) {
    const cle = `${Math.round(p.x)}:${Math.round(p.y)}:${p.str}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    points.push(p);
  }

  points.sort((a, b) => b.y - a.y || a.x - b.x);

  let texte = "";
  let lastY = points[0]?.y ?? 0;
  for (const p of points) {
    if (Math.abs(p.y - lastY) > 4) {
      texte += "\n";
      lastY = p.y;
    } else if (texte && !texte.endsWith(" ") && !texte.endsWith("\n")) {
      texte += " ";
    }
    texte += p.str;
  }
  return texte;
}

/** Extrait le texte de chaque page du PDF (pdfjs legacy, sans worker). */
export async function extraireTextesPages(pdf: Buffer): Promise<string[]> {
  if (!estPdfValide(pdf)) {
    throw new Error("NOT_A_PDF");
  }

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: octetsPdf(pdf),
    useSystemFonts: true,
    standardFontDataUrl: standardFontsUrl(),
    isEvalSupported: false,
    useWorkerFetch: false,
    verbosity: 0,
  });

  try {
    const doc = await loadingTask.promise;
    const textes: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const contenu = await page.getTextContent({
        includeMarkedContent: false,
      });
      textes.push(textePageDepuisItems(contenu.items));
    }
    return textes;
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
}

/** Cherche le salarié correspondant à une page (matricule prioritaire, puis nom/prénom). */
function detecterSalarie(
  textePageNormalise: string,
  salaries: Salarie[]
): string | null {
  // 1. Matricule explicite « Matricule : 7 » (évite les faux positifs type ART.L.3141-3,6,7,11)
  const parMatricule = salaries.filter((s) => {
    const mat = s.matricule?.trim().toUpperCase();
    if (!mat) return false;
    return new RegExp(
      `MATRICULE\\D{0,12}${echapperRegex(mat)}([^0-9]|$)`
    ).test(textePageNormalise);
  });
  if (parMatricule.length === 1) return parMatricule[0].id;

  // 2. Matricule long (≥3) en limite de mot : trop risqué pour 1-2 chiffres
  const parMatriculeLong = salaries.filter((s) => {
    const mat = s.matricule?.trim().toUpperCase();
    if (!mat || mat.length < 3) return false;
    return new RegExp(
      `(^|[^A-Z0-9])${echapperRegex(mat)}([^A-Z0-9]|$)`
    ).test(textePageNormalise);
  });
  if (parMatriculeLong.length === 1) return parMatriculeLong[0].id;

  // 3. Nom + prénom (dans les deux ordres ; civilité M/MME ignorée via includes)
  const parNom = salaries.filter((s) => {
    const nom = normaliser(s.nom);
    const prenom = normaliser(s.prenom);
    if (!nom || !prenom) return false;
    return (
      textePageNormalise.includes(`${nom} ${prenom}`) ||
      textePageNormalise.includes(`${prenom} ${nom}`)
    );
  });
  if (parNom.length === 1) return parNom[0].id;

  // Ambigu ou introuvable : correction manuelle sur l'écran de contrôle
  return null;
}

/** Matricule annoncé sur la page (Silae : « Matricule : 7 »), pour découper les bulletins. */
function extraireMatriculeAnnonce(textePageNormalise: string): string | null {
  const m = textePageNormalise.match(/MATRICULE\D{0,12}([0-9]{1,8})/);
  return m?.[1] ?? null;
}

function echapperRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type SoldeCpExtrait = {
  acquis: number | null;
  pris: number | null;
  restant: number | null;
  acquis_n1: number | null;
  acquis_n: number | null;
  pris_n1: number | null;
  pris_n: number | null;
  solde_n1: number | null;
  solde_n: number | null;
};

/**
 * Extraction heuristique du solde de congés payés dans le texte d'un bulletin.
 * Supporte Silae (tableau CP N-1 / CP N) et libellés classiques Acquis / Pris / Solde.
 *
 * Format Silae (ordre de lecture visuelle) :
 *   Acquis :     23.00 /  5.00  /
 *   Total pris : 12.00 /  0.00  /
 *   Solde :      11.00 /  5.00  /
 */
export function extraireSoldeCp(texte: string): SoldeCpExtrait {
  const t = normaliser(texte);
  const nombre = "(-?[0-9]{1,3}(?:[.,][0-9]{1,2})?)";
  const vide: SoldeCpExtrait = {
    acquis: null,
    pris: null,
    restant: null,
    acquis_n1: null,
    acquis_n: null,
    pris_n1: null,
    pris_n: null,
    solde_n1: null,
    solde_n: null,
  };

  function parseNum(s: string): number {
    return parseFloat(s.replace(",", "."));
  }

  function paireApres(label: RegExp): [number, number] | null {
    const m = t.match(
      new RegExp(
        `(?:${label.source})\\s*:?\\s*${nombre}\\s*/\\s*${nombre}`,
        "i"
      )
    );
    if (!m?.[1] || !m?.[2]) return null;
    const a = parseNum(m[1]);
    const b = parseNum(m[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return [a, b];
  }

  // Tableau Silae ligne par ligne (après tri spatial du texte)
  const acquisPair = paireApres(/ACQUIS/);
  const prisPair = paireApres(/TOTAL\s+PRIS/) ?? paireApres(/PRIS/);
  const soldePair = paireApres(/SOLDE/);

  if (acquisPair || prisPair || soldePair) {
    const acquis_n1 = acquisPair ? round2(acquisPair[0]) : null;
    const acquis_n = acquisPair ? round2(acquisPair[1]) : null;
    const pris_n1 = prisPair ? round2(prisPair[0]) : null;
    const pris_n = prisPair ? round2(prisPair[1]) : null;
    let solde_n1 = soldePair ? round2(soldePair[0]) : null;
    let solde_n = soldePair ? round2(soldePair[1]) : null;

    if (solde_n1 == null && acquis_n1 != null && pris_n1 != null) {
      solde_n1 = round2(Math.max(0, acquis_n1 - pris_n1));
    }
    if (solde_n == null && acquis_n != null && pris_n != null) {
      solde_n = round2(acquis_n - pris_n);
    }

    const acquis =
      acquis_n1 != null && acquis_n != null
        ? round2(acquis_n1 + acquis_n)
        : acquis_n1 ?? acquis_n;
    const pris =
      pris_n1 != null && pris_n != null
        ? round2(pris_n1 + pris_n)
        : pris_n1 ?? pris_n;
    const restant =
      solde_n1 != null && solde_n != null
        ? round2(solde_n1 + solde_n)
        : solde_n1 ?? solde_n;

    // Évite les faux positifs (ex. seul « SOLDE REP. » ailleurs) : il faut au moins acquis ou pris CP
    if (acquis != null || pris != null || (soldePair && (acquisPair || prisPair))) {
      return {
        acquis_n1,
        acquis_n,
        pris_n1,
        pris_n,
        solde_n1,
        solde_n,
        acquis,
        pris,
        restant,
      };
    }
  }

  // Ancien format 5 valeurs sur une ligne (fallback, ordre peu fiable)
  const silae5 = t.match(
    new RegExp(
      `CP\\s*N\\s*-\\s*1\\s+CP\\s*N[\\s\\S]{0,80}?/\\s*${nombre}\\s*/\\s*${nombre}\\s*/\\s*${nombre}\\s*/\\s*${nombre}\\s*/\\s*${nombre}`,
      "i"
    )
  );
  if (silae5) {
    const nums = silae5.slice(1, 6).map((x) => parseNum(x));
    if (nums.every((n) => Number.isFinite(n))) {
      // Interprétation prudente : sans positions, on ne force plus un mapping N-1/N
      // On ne remplit que le total restant (5e valeur souvent le solde affiché)
      return {
        ...vide,
        restant: round2(nums[4]!),
      };
    }
  }

  function chercher(motifs: RegExp[]): number | null {
    for (const motif of motifs) {
      const matches = [...t.matchAll(motif)];
      if (matches.length > 0) {
        const brut = matches[matches.length - 1]![1]!;
        const valeur = parseNum(brut);
        if (Number.isFinite(valeur) && Math.abs(valeur) < 400) return valeur;
      }
    }
    return null;
  }

  const acquis = chercher([
    new RegExp(`ACQUIS\\D{0,15}${nombre}`, "g"),
    new RegExp(`CP\\s+ACQUIS\\D{0,15}${nombre}`, "g"),
  ]);
  const pris = chercher([new RegExp(`(?:TOTAL\\s+)?PRIS\\D{0,15}${nombre}`, "g")]);
  const restant = chercher([
    new RegExp(`(?:SOLDE|RESTANT|RESTANTS)\\D{0,15}${nombre}`, "g"),
  ]);

  return { ...vide, acquis, pris, restant };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Découpe le PDF en segments (un par salarié détecté).
 * Les pages consécutives du même salarié forment un segment ; les pages sans
 * nouvel identifiant (suite multi-pages) sont rattachées au segment précédent.
 * Un nouveau « Matricule : N » démarre toujours un nouveau bulletin.
 */
export function detecterSegments(
  textesPages: string[],
  salaries: Salarie[]
): SegmentDetecte[] {
  const segments: SegmentDetecte[] = [];
  let courant: {
    salarieId: string | null;
    pageDebut: number;
    textes: string[];
    matricule: string | null;
  } | null = null;

  for (let i = 0; i < textesPages.length; i++) {
    const page = i + 1;
    const texteNorm = normaliser(textesPages[i]);
    const salarieId = detecterSalarie(texteNorm, salaries);
    const matricule = extraireMatriculeAnnonce(texteNorm);

    const memeSalarie =
      courant !== null &&
      ((salarieId !== null && salarieId === courant.salarieId) ||
        (salarieId === null &&
          (matricule === null || matricule === courant.matricule)));

    const nouveauMatricule =
      courant !== null &&
      matricule !== null &&
      courant.matricule !== null &&
      matricule !== courant.matricule;

    if (courant && memeSalarie && !nouveauMatricule) {
      courant.textes.push(textesPages[i]);
      if (salarieId && !courant.salarieId) courant.salarieId = salarieId;
      if (matricule && !courant.matricule) courant.matricule = matricule;
    } else {
      if (courant) {
        segments.push(finaliserSegment(courant, page - 1));
      }
      courant = {
        salarieId,
        pageDebut: page,
        textes: [textesPages[i]],
        matricule,
      };
    }
  }
  if (courant) {
    segments.push(finaliserSegment(courant, textesPages.length));
  }
  return segments;
}

function finaliserSegment(
  courant: { salarieId: string | null; pageDebut: number; textes: string[] },
  pageFin: number
): SegmentDetecte {
  const texteComplet = courant.textes.join("\n");
  const cp = extraireSoldeCp(texteComplet);
  return {
    pageDebut: courant.pageDebut,
    pageFin,
    salarieId: courant.salarieId,
    cpAcquis: cp.acquis,
    cpPris: cp.pris,
    cpRestant: cp.restant,
    cpAcquisN1: cp.acquis_n1,
    cpAcquisN: cp.acquis_n,
    cpPrisN1: cp.pris_n1,
    cpPrisN: cp.pris_n,
    texteApercu: texteComplet.slice(0, 500),
  };
}

/** Extrait une plage de pages du PDF global dans un nouveau PDF. */
export async function extrairePages(
  pdfSource: Buffer,
  pageDebut: number,
  pageFin: number
): Promise<Uint8Array> {
  const source = await PDFDocument.load(pdfSource);
  const cible = await PDFDocument.create();
  const indices = [];
  for (let i = pageDebut - 1; i < pageFin && i < source.getPageCount(); i++) {
    indices.push(i);
  }
  const pages = await cible.copyPages(source, indices);
  pages.forEach((p) => cible.addPage(p));
  return cible.save();
}
