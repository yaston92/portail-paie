import { createAdminClient } from "@/lib/supabase/admin";

export type LigneFacturation = {
  dossier_id: string;
  sigle: string;
  raison_sociale: string;
  nb_paie: number;
  nb_entrees: number;
  nb_sorties: number;
};

export type FacturationMois = {
  mois: string;
  genere_at: string;
  lignes: LigneFacturation[];
  fige: boolean;
};

function moisSuivant(mois: string): string {
  const d = new Date(`${mois}T00:00:00`);
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function dansMois(date: string | null, mois: string): boolean {
  if (!date) return false;
  const jour = date.slice(0, 10);
  return jour >= mois.slice(0, 10) && jour < moisSuivant(mois);
}

/** Calcule les volumes du mois. Ne pas appeler si une ligne figée existe déjà. */
export async function calculerFacturation(
  cabinetId: string,
  mois: string
): Promise<LigneFacturation[]> {
  const admin = createAdminClient();
  const { data: dossiers } = await admin
    .from("dossiers")
    .select("id, sigle, raison_sociale")
    .eq("cabinet_id", cabinetId)
    .eq("archive", false)
    .order("sigle");

  const liste = dossiers ?? [];
  if (liste.length === 0) return [];
  const ids = liste.map((d) => d.id);

  const [{ data: bulletins }, { data: salaries }] = await Promise.all([
    admin.from("bulletins").select("dossier_id").eq("mois", mois).in("dossier_id", ids),
    admin
      .from("salaries")
      .select("dossier_id, date_entree, date_sortie")
      .in("dossier_id", ids),
  ]);

  const paies = new Map<string, number>();
  for (const b of bulletins ?? []) {
    paies.set(b.dossier_id, (paies.get(b.dossier_id) ?? 0) + 1);
  }

  const entrees = new Map<string, number>();
  const sorties = new Map<string, number>();
  for (const s of salaries ?? []) {
    if (dansMois(s.date_entree, mois)) {
      entrees.set(s.dossier_id, (entrees.get(s.dossier_id) ?? 0) + 1);
    }
    if (dansMois(s.date_sortie, mois)) {
      sorties.set(s.dossier_id, (sorties.get(s.dossier_id) ?? 0) + 1);
    }
  }

  return liste.map((d) => ({
    dossier_id: d.id,
    sigle: d.sigle,
    raison_sociale: d.raison_sociale,
    nb_paie: paies.get(d.id) ?? 0,
    nb_entrees: entrees.get(d.id) ?? 0,
    nb_sorties: sorties.get(d.id) ?? 0,
  }));
}

export function facturationVersCsv(lignes: LigneFacturation[]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lignesCsv = [
    ["Client", "Sigle", "Nombre de paies", "Entrées", "Sorties"].join(";"),
    ...lignes.map((l) =>
      [l.raison_sociale, l.sigle, l.nb_paie, l.nb_entrees, l.nb_sorties].map(esc).join(";")
    ),
  ];
  return `\uFEFF${lignesCsv.join("\n")}\n`;
}
