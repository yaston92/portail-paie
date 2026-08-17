/**
 * Test de fumée du découpage des bulletins :
 *   npx tsx scripts/test-pdf-bulletins.ts
 * Génère un PDF factice de 5 pages (3 bulletins, dont un multi-pages et une
 * page de continuation sans nom) puis vérifie la segmentation, l'appariement
 * et l'extraction des soldes de CP.
 */
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  detecterSegments,
  extrairePages,
  extraireSoldeCp,
  extraireTextesPages,
} from "../src/lib/pdf-bulletins";
import type { Salarie } from "../src/lib/types";

function salarie(partiel: Partial<Salarie> & Pick<Salarie, "id" | "nom" | "prenom">): Salarie {
  return {
    dossier_id: "d1",
    matricule: null,
    email: null,
    date_entree: null,
    date_sortie: null,
    motif_sortie: null,
    statut: "actif",
    type_contrat: null,
    cdd_duree: null,
    duree_hebdo: null,
    poste: null,
    opposition_bulletin: false,
    profile_id: null,
    created_at: "",
    ...partiel,
  };
}

async function construirePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = [
    "BULLETIN DE PAIE Septembre 2026\nMatricule 00123 DUPONT Marie\nSalaire de base 2400,00",
    "Matricule 00123 DUPONT Marie (suite)\nCONGES PAYES ACQUIS 25,00 PRIS 10,00 SOLDE 15,00",
    "BULLETIN DE PAIE Septembre 2026\nMatricule 00456 MARTIN Paul\nACQUIS 12,50 PRIS 2,00 SOLDE 10,50",
    "Detail des cotisations (suite du bulletin precedent)\nURSSAF Retraite Prevoyance",
    "BULLETIN DE PAIE Septembre 2026\nBERNARD Sophie\nACQUIS 5,00 PRIS 0,00 SOLDE 5,00",
  ];
  for (const texte of pages) {
    const page = doc.addPage([595, 842]);
    let y = 780;
    for (const ligne of texte.split("\n")) {
      page.drawText(ligne, { x: 50, y, size: 11, font });
      y -= 20;
    }
  }
  return Buffer.from(await doc.save());
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`ÉCHEC : ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`OK : ${message}`);
  }
}

async function main() {
  const pdf = await construirePdf();
  const salaries: Salarie[] = [
    salarie({ id: "s-dupont", nom: "DUPONT", prenom: "Marie", matricule: "00123" }),
    salarie({ id: "s-martin", nom: "MARTIN", prenom: "Paul", matricule: "00456" }),
    salarie({ id: "s-bernard", nom: "BERNARD", prenom: "Sophie" }),
  ];

  const textes = await extraireTextesPages(pdf);
  assert(textes.length === 5, `5 pages extraites (obtenu : ${textes.length})`);

  const segments = detecterSegments(textes, salaries);
  assert(segments.length === 3, `3 segments détectés (obtenu : ${segments.length})`);

  const [seg1, seg2, seg3] = segments;
  assert(
    seg1?.salarieId === "s-dupont" && seg1.pageDebut === 1 && seg1.pageFin === 2,
    `segment 1 = DUPONT pages 1-2 (obtenu : ${seg1?.salarieId} p${seg1?.pageDebut}-${seg1?.pageFin})`
  );
  assert(
    seg2?.salarieId === "s-martin" && seg2.pageDebut === 3 && seg2.pageFin === 4,
    `segment 2 = MARTIN pages 3-4, page de continuation rattachée (obtenu : ${seg2?.salarieId} p${seg2?.pageDebut}-${seg2?.pageFin})`
  );
  assert(
    seg3?.salarieId === "s-bernard" && seg3.pageDebut === 5 && seg3.pageFin === 5,
    `segment 3 = BERNARD page 5, appariement par nom sans matricule (obtenu : ${seg3?.salarieId})`
  );

  assert(
    seg1?.cpAcquis === 25 && seg1?.cpPris === 10 && seg1?.cpRestant === 15,
    `CP DUPONT extraits 25/10/15 (obtenu : ${seg1?.cpAcquis}/${seg1?.cpPris}/${seg1?.cpRestant})`
  );
  assert(
    seg2?.cpAcquis === 12.5 && seg2?.cpRestant === 10.5,
    `CP MARTIN extraits 12,5/10,5 (obtenu : ${seg2?.cpAcquis}/${seg2?.cpRestant})`
  );

  const extrait = await extrairePages(pdf, 3, 4);
  const docExtrait = await PDFDocument.load(extrait);
  assert(
    docExtrait.getPageCount() === 2,
    `extraction des pages 3-4 en PDF de 2 pages (obtenu : ${docExtrait.getPageCount()})`
  );

  const cpVide = extraireSoldeCp("Aucune mention de conges ici");
  assert(
    cpVide.acquis === null && cpVide.restant === null,
    "aucune valeur CP extraite d'un texte sans mots-clés"
  );

  const silaeTxt = [
    "CP N-1  CP N",
    "Acquis : 23.00 /  5.00  /",
    "Total pris : 12.00  /  0.00  /",
    "Solde : 11.00  /  5.00  /",
  ].join("\n");
  const cpSilae = extraireSoldeCp(silaeTxt);
  assert(
    cpSilae.acquis_n1 === 23 &&
      cpSilae.acquis_n === 5 &&
      cpSilae.pris_n1 === 12 &&
      cpSilae.pris_n === 0 &&
      cpSilae.solde_n1 === 11 &&
      cpSilae.solde_n === 5 &&
      cpSilae.restant === 16 &&
      cpSilae.acquis === 28 &&
      cpSilae.pris === 12,
    `extraction Silae N/N-1 (obtenu : ${JSON.stringify(cpSilae)})`
  );

  console.log(process.exitCode === 1 ? "\nDes tests ont échoué." : "\nTous les tests passent.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
