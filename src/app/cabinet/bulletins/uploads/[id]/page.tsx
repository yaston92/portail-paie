import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { aLeDroit } from "@/lib/droits";
import { createClient } from "@/lib/supabase/server";
import { salariesAttendus } from "@/lib/campagne";
import { moisLabel } from "@/lib/format";
import { SegmentsControle } from "@/components/segments-controle";
import { Alert, PageHeader } from "@/components/ui";
import type { BulletinSegment, BulletinUpload, Dossier } from "@/lib/types";

export default async function ControleUploadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireRole(["admin_cabinet", "collaborateur"]);
  const { getCabinetActif } = await import("@/lib/cabinet");
  const cabinet = await getCabinetActif();
  const peutBulletins = aLeDroit(profile, cabinet, "bulletins");
  const { id } = await params;
  const supabase = await createClient();

  const { data: uploadData } = await supabase
    .from("bulletin_uploads")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!uploadData) notFound();
  const upload = uploadData as BulletinUpload;

  const [{ data: dossier }, { data: segments }, salaries] = await Promise.all([
    supabase.from("dossiers").select("*").eq("id", upload.dossier_id).single(),
    supabase
      .from("bulletin_segments")
      .select("*")
      .eq("upload_id", id)
      .order("page_debut"),
    salariesAttendus(supabase, upload.dossier_id, upload.mois),
  ]);
  if (!dossier) notFound();
  const d = dossier as Dossier;
  const listeSegments = (segments ?? []) as BulletinSegment[];

  return (
    <div className="space-y-6">
      <PageHeader
        titre={`Contrôle des bulletins : ${d.sigle} (${moisLabel(upload.mois)})`}
        sousTitre="Confirmez que chaque bulletin correspond aux bonnes pages, corrigez le découpage, puis publiez."
        actions={
          <Link
            href="/cabinet/bulletins"
            className="text-sm text-blue-700 hover:underline"
          >
            Retour aux dépôts
          </Link>
        }
      />

      {upload.statut === "publie" && (
        <Alert variant="success">
          Bulletins publiés. Ils sont visibles par le client et par chaque
          salarié dans son espace.
        </Alert>
      )}

      <SegmentsControle
        uploadId={id}
        segments={listeSegments}
        salaries={salaries.map((s) => ({
          id: s.id,
          nom: s.nom,
          prenom: s.prenom,
          matricule: s.matricule,
        }))}
        publie={upload.statut === "publie"}
        peutModifier={peutBulletins}
        nbPages={upload.nb_pages ?? Math.max(1, ...listeSegments.map((s) => s.page_fin))}
      />
    </div>
  );
}
