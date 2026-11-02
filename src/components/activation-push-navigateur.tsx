"use client";

import { useEffect, useState } from "react";
import { toastError } from "@/lib/toast";

function cleVersOctets(cle: string): Uint8Array {
  const rembourre = cle + "=".repeat((4 - (cle.length % 4)) % 4);
  const brut = atob(rembourre.replace(/-/g, "+").replace(/_/g, "/"));
  const octets = new Uint8Array(brut.length);
  for (let i = 0; i < brut.length; i++) octets[i] = brut.charCodeAt(i);
  return octets;
}

async function abonner(clePublique: string) {
  const inscription = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  let abo = await inscription.pushManager.getSubscription();
  if (!abo) {
    abo = await inscription.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: cleVersOctets(clePublique) as BufferSource,
    });
  }
  const res = await fetch("/api/push-web", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(abo.toJSON()),
  });
  if (!res.ok) {
    throw new Error("Enregistrement impossible");
  }
}

/** Propose la bannière du navigateur, en plus de la cloche. */
export function ActivationPushNavigateur() {
  const cle = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!cle || typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    if (Notification.permission === "granted") {
      void abonner(cle).catch(() => undefined);
      return;
    }
    if (Notification.permission === "default") setVisible(true);
  }, [cle]);

  async function activer() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setVisible(false);
        return;
      }
      await abonner(cle);
      setVisible(false);
    } catch {
      toastError("Les notifications de cet ordinateur n'ont pas pu être activées.");
    }
    setBusy(false);
  }

  if (!visible) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-amber-950">
          Recevoir aussi les notifications en bannière sur cet ordinateur.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void activer()}
          className="rounded-lg bg-blue-800 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Activation…" : "Activer"}
        </button>
      </div>
    </div>
  );
}
