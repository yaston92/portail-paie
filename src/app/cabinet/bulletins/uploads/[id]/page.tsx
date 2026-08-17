import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole, cabinetPeutAccederDossier } from "@/lib/auth";
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
  await requireRole(["admin_cabinet", "collaborateur"]);
  const { id } = await params;
  const supabase = await createClient();

  const { data: uploadData } = await supabase
    .from("bulletin_uploads")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!uploadData) notFound();
  const upload = uploadData as BulletinUpload;

  if (!(await cabinetPeutAccederDossier(upload.dossier_id))) {
    notFound();
  }

  const [{ data: dossier }, { data: segments }, salaries] = await Promise.all([
    supabase.from("dossiers").select("*").eq("id", upload.dossier_id).single(),
    supabase
      .from("bulletin_segments")
      .select("*")
      .eq("upload_id", id)
      .order("page_debut"),
    salariesAttendus(supabase, upload.dossier_id, upload.mois),
  ]);
  const d = dossier as Dossier;

  return (
    <div className="space-y-6">
      <PageHeader
        titre={`Contrôle des bulletins : ${d.sigle} (${moisLabel(upload.mois)})`}
        sousTitre={`${upload.nb_pages ?? "?"} pages analysées : vérifiez l'appariement de chaque bulletin avant publication.`}
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
        segments={(segments ?? []) as BulletinSegment[]}
        salaries={salaries.map((s) => ({
          id: s.id,
          nom: s.nom,
          prenom: s.prenom,
          matricule: s.matricule,
        }))}
        publie={upload.statut === "publie"}
      />
    </div>
  );
}
