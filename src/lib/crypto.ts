import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * Chiffrement AES-256-GCM des données sensibles (NIR).
 * Clé : NIR_ENCRYPTION_KEY, 64 caractères hexadécimaux (32 octets).
 * Format stocké : base64(iv) . base64(tag) . base64(ciphertext)
 */

function getKey(): Buffer {
  const hex = process.env.NIR_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "NIR_ENCRYPTION_KEY manquante ou invalide (attendu : 64 caractères hexadécimaux)"
    );
  }
  return Buffer.from(hex, "hex");
}

export function chiffrer(clair: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(clair, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

export function dechiffrer(stocke: string): string {
  const [ivB64, tagB64, dataB64] = stocke.split(".");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
