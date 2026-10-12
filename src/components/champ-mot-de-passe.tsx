"use client";

import { useState, type ComponentProps } from "react";
import { Input } from "@/components/ui";

/** Champ mot de passe avec un bouton pour afficher ou masquer la saisie. */
export function ChampMotDePasse({
  className,
  ...props
}: Omit<ComponentProps<"input">, "type">) {
  const [voir, setVoir] = useState(false);
  return (
    <div className="relative">
      <Input
        {...props}
        type={voir ? "text" : "password"}
        className={`pr-16 ${className ?? ""}`}
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-500 hover:text-gray-800"
        onClick={() => setVoir((v) => !v)}
        aria-label={voir ? "Masquer le mot de passe" : "Afficher le mot de passe"}
      >
        {voir ? "Masquer" : "Voir"}
      </button>
    </div>
  );
}
