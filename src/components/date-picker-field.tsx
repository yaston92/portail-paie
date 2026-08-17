"use client";

import { useRef } from "react";
import { Label } from "@/components/ui";

function labelFr(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Sélecteur de date via calendrier navigateur (pas de saisie libre).
 * Valeur stockée en AAAA-MM-JJ.
 */
export function DatePickerField({
  label,
  value,
  onChange,
  required,
  min,
  id,
}: {
  label: string;
  value: string;
  onChange: (ymd: string) => void;
  required?: boolean;
  min?: string;
  id?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldId = id ?? label.toLowerCase().replace(/\s+/g, "-");

  function ouvrirCalendrier() {
    const el = inputRef.current;
    if (!el) return;
    if (typeof el.showPicker === "function") {
      try {
        el.showPicker();
        return;
      } catch {
        /* fallback */
      }
    }
    el.showPicker?.();
    el.focus();
    el.click();
  }

  return (
    <div>
      <Label htmlFor={fieldId}>{label}</Label>
      <div className="relative">
        <button
          type="button"
          onClick={ouvrirCalendrier}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-left text-sm hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <span className="flex items-center justify-between gap-2">
            <span className={value ? "text-gray-900 font-medium" : "text-gray-400"}>
              {value ? labelFr(value) : "Choisir une date dans le calendrier"}
            </span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-5 w-5 text-blue-700 shrink-0"
              aria-hidden
            >
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M3 10h18M8 3v4M16 3v4" />
            </svg>
          </span>
        </button>
        {/* Input date hors flux visuel mais accessible au calendrier natif */}
        <input
          ref={inputRef}
          id={fieldId}
          type="date"
          required={required}
          min={min}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="sr-only"
          tabIndex={-1}
        />
      </div>
    </div>
  );
}
