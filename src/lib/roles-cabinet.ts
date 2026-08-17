import type { UserRole } from "@/lib/types";

export type RoleChoix = "directeur" | "admin_cabinet" | "collaborateur";

export function roleEffectif(role: UserRole, roleMembre: string): RoleChoix {
  if (role === "directeur") return "directeur";
  if (roleMembre === "admin" || role === "admin_cabinet") return "admin_cabinet";
  return "collaborateur";
}

export function labelRole(role: RoleChoix): string {
  if (role === "directeur") return "Directeur";
  if (role === "admin_cabinet") return "Administrateur";
  return "Collaborateur";
}

export function peutEditerRoleMembre(opts: {
  acteurRole: UserRole;
  acteurId: string;
  cibleId: string;
  roleCible: RoleChoix;
}): boolean {
  if (opts.cibleId === opts.acteurId) return false;
  if (opts.acteurRole === "directeur") return true;
  return opts.roleCible === "collaborateur";
}
