"use client";

type ToastKind = "success" | "error";

type Listener = (state: {
  visible: boolean;
  kind: ToastKind;
  message: string;
}) => void;

let visible = false;
let kind: ToastKind = "success";
let message = "";
let hideTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

function emit() {
  const snapshot = { visible, kind, message };
  listeners.forEach((l) => l(snapshot));
}

function scheduleHide(durationMs: number) {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    visible = false;
    message = "";
    emit();
  }, durationMs);
}

export function subscribeToast(listener: Listener) {
  listeners.add(listener);
  listener({ visible, kind, message });
  return () => {
    listeners.delete(listener);
  };
}

/** Toast global web : succès vert auto-disparition, sans bouton OK. */
export function toastSuccess(msg: string, durationMs = 3500) {
  visible = true;
  kind = "success";
  message = msg;
  emit();
  scheduleHide(durationMs);
}

export function toastError(msg: string, durationMs = 3600) {
  visible = true;
  kind = "error";
  message = msg;
  emit();
  scheduleHide(durationMs);
}

export function hideToast() {
  if (hideTimer) clearTimeout(hideTimer);
  visible = false;
  message = "";
  emit();
}
