import Link from "next/link";
import { forwardRef, type ComponentProps, type ReactNode } from "react";

function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

// ---------- Boutons ----------

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none";
const BTN_VARIANTS = {
  primary: "bg-blue-700 text-white hover:bg-blue-800",
  secondary: "bg-white text-gray-800 border border-gray-300 hover:bg-gray-100",
  danger: "bg-red-600 text-white hover:bg-red-700",
  ghost: "text-gray-700 hover:bg-gray-100",
} as const;

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof BTN_VARIANTS }) {
  return (
    <button
      className={cx(BTN_BASE, BTN_VARIANTS[variant], className)}
      {...props}
    />
  );
}

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: keyof typeof BTN_VARIANTS }) {
  return (
    <Link className={cx(BTN_BASE, BTN_VARIANTS[variant], className)} {...props} />
  );
}

// ---------- Cartes ----------

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        "bg-white rounded-xl border border-gray-200 shadow-sm",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardBody({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cx("p-5", className)}>{children}</div>;
}

// ---------- Formulaires ----------

export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      className={cx("block text-sm font-medium text-gray-700 mb-1", className)}
      {...props}
    />
  );
}

const FIELD =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500";

export const Input = forwardRef<HTMLInputElement, ComponentProps<"input">>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cx(FIELD, className)} {...props} />;
  }
);

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(FIELD, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(FIELD, "min-h-24", className)} {...props} />;
}

// ---------- Badges / alertes ----------

const BADGE_VARIANTS = {
  gray: "bg-gray-100 text-gray-700",
  green: "bg-green-100 text-green-800",
  blue: "bg-blue-100 text-blue-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
  violet: "bg-violet-100 text-violet-800",
} as const;

export function Badge({
  variant = "gray",
  children,
}: {
  variant?: keyof typeof BADGE_VARIANTS;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        BADGE_VARIANTS[variant]
      )}
    >
      {children}
    </span>
  );
}

export function Alert({
  variant = "info",
  children,
}: {
  variant?: "info" | "success" | "error" | "warning";
  children: ReactNode;
}) {
  const styles = {
    info: "bg-blue-50 border-blue-200 text-blue-900",
    success: "bg-green-50 border-green-200 text-green-900",
    error: "bg-red-50 border-red-200 text-red-900",
    warning: "bg-amber-50 border-amber-200 text-amber-900",
  };
  return (
    <div className={cx("rounded-lg border px-4 py-3 text-sm", styles[variant])}>
      {children}
    </div>
  );
}

// ---------- Divers ----------

export function PageHeader({
  titre,
  sousTitre,
  actions,
}: {
  titre: string;
  sousTitre?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div className="min-w-0">
        <h1 className="text-[22px] font-bold text-gray-900 leading-tight">
          {titre}
        </h1>
        {sousTitre && (
          <p className="text-sm text-gray-500 mt-1">{sousTitre}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-12 text-gray-500 text-sm">{message}</div>
  );
}

export function Th({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      className={cx(
        "px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide",
        className
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cx("px-4 py-3 text-sm", className)} {...props} />;
}

export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-200">{children}</table>
    </div>
  );
}
