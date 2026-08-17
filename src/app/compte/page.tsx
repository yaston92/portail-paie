import { getProfile, roleHome } from "@/lib/auth";
import { isCabinetRole } from "@/lib/types";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ProfilEditForm } from "@/components/profil-edit-form";
import { Card, CardBody, PageHeader } from "@/components/ui";

export default async function ComptePage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const retour = isCabinetRole(profile.role)
    ? "/cabinet/compte"
    : roleHome(profile.role);

  return (
    <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-6 space-y-6">
      <PageHeader
        titre="Mon profil"
        sousTitre="Informations personnelles"
        actions={
          <Link href={retour} className="text-sm text-blue-700 hover:underline">
            ← Retour
          </Link>
        }
      />
      <Card>
        <CardBody>
          <ProfilEditForm
            nomInitial={profile.nom}
            prenomInitial={profile.prenom}
            emailInitial={profile.email}
            telephoneInitial={profile.telephone}
          />
        </CardBody>
      </Card>
    </main>
  );
}
