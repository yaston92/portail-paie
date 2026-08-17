import { createAdminClient } from "@/lib/supabase/admin";

export type Bucket = "documents" | "bulletins";

/** Dépose un fichier dans un bucket privé (service role). */
export async function uploaderFichier(
  bucket: Bucket,
  chemin: string,
  contenu: Buffer | Uint8Array,
  contentType: string
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(bucket)
    .upload(chemin, contenu, { contentType, upsert: true });
  if (error) throw new Error(`Échec d'upload ${bucket}/${chemin} : ${error.message}`);
}

/** Récupère le contenu d'un fichier d'un bucket privé (service role). */
export async function telechargerFichier(
  bucket: Bucket,
  chemin: string
): Promise<Buffer> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(bucket).download(chemin);
  if (error || !data) {
    throw new Error(`Fichier introuvable ${bucket}/${chemin} : ${error?.message}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

export async function supprimerFichiers(
  bucket: Bucket,
  chemins: string[]
): Promise<void> {
  if (chemins.length === 0) return;
  const admin = createAdminClient();
  await admin.storage.from(bucket).remove(chemins);
}

const EXTENSIONS_AUTORISEES = ["pdf", "jpg", "jpeg", "png", "heic", "xlsx", "xls"];

const MIME_VERS_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/heif": "heic",
};

/** Extension à partir du nom de fichier, avec secours via Content-Type (uploads mobile). */
export function extensionFichier(nom: string, mimeType?: string | null): string {
  const ext = nom.split(".").pop()?.toLowerCase() ?? "";
  if (EXTENSIONS_AUTORISEES.includes(ext)) return ext;
  const viaMime = mimeType ? MIME_VERS_EXT[mimeType.toLowerCase()] : undefined;
  if (viaMime) return viaMime;
  throw new Error(`Type de fichier non autorisé : .${ext || "?"}`);
}

export function contentTypePourExtension(ext: string): string {
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "heic":
      return "image/heic";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "xls":
      return "application/vnd.ms-excel";
    default:
      return "application/octet-stream";
  }
}
