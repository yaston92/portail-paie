import fs from "fs";
import {
  detecterSegments,
  estPdfValide,
  extraireTextesPages,
  normaliser,
} from "../src/lib/pdf-bulletins";
import type { Salarie } from "../src/lib/types";

async function main() {
  const chemin = process.argv[2] || "tmp/bulletin.pdf";
  const buf = fs.readFileSync(chemin);
  console.log("fichier:", chemin);
  console.log("taille:", buf.length);
  console.log("magic:", buf.subarray(0, 8).toString("latin1"));
  console.log("estPdfValide:", estPdfValide(buf));

  const textes = await extraireTextesPages(buf);
  console.log("pages:", textes.length);
  for (let i = 0; i < textes.length; i++) {
    const t = textes[i];
    console.log(`--- page ${i + 1} (${t.trim().length} chars) ---`);
    console.log(t.slice(0, 500).replace(/\s+/g, " "));
  }

  const salaries: Salarie[] = [
    {
      id: "s1",
      dossier_id: "d1",
      nom: "CHARKAOUI",
      prenom: "Ismail",
      matricule: "7",
      email: null,
      date_entree: null,
      date_sortie: null,
      statut: "actif",
      type_contrat: null,
      cdd_duree: null,
      duree_hebdo: null,
      poste: null,
      opposition_bulletin: false,
      profile_id: null,
      created_at: "",
    },
  ];

  const segs = detecterSegments(textes, salaries);
  console.log(
    "segments:",
    segs.map((s) => ({
      pages: `${s.pageDebut}-${s.pageFin}`,
      salarieId: s.salarieId,
      cp: [s.cpAcquis, s.cpPris, s.cpRestant],
      apercu: normaliser(s.texteApercu).slice(0, 120),
    }))
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
